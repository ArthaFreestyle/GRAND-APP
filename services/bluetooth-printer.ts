// Transport printer struk: Bluetooth Classic (SPP/RFCOMM) lewat
// react-native-bluetooth-classic. Ini native module, jadi hanya ada di dev
// build / build produksi — bukan Expo Go — dan izin Android-nya dipasang oleh
// config plugin `with-rn-bluetooth-classic` di app.json (butuh prebuild ulang).
//
// Android saja: di iOS Bluetooth Classic lewat External Accessory (MFi) dan
// printer thermal murah tidak bersertifikat MFi, jadi jalur itu tidak dibuka
// di sini daripada gagal dengan pesan yang membingungkan.
//
// TIDAK ada scan/pairing di dalam app — sengaja. Pairing printer murah lewat
// API sering hang dan PIN-nya berbeda-beda (0000, 1234, kadang tanpa PIN).
// Kasir pairing sekali lewat Pengaturan Bluetooth Android, app cuma membaca
// daftar perangkat yang sudah bonded. Ini juga bikin support gampang:
// "sudah kepasang di Setting Bluetooth belum?" bisa dijawab orang awam.
//
// Semua kegagalan dinormalkan jadi PrinterError berpesan bahasa Indonesia
// supaya layar kasir tinggal menampilkan `err.message` apa adanya.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fromByteArray } from 'base64-js';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import RNBluetoothClassic, { type BluetoothNativeDevice } from 'react-native-bluetooth-classic';

export type PrinterErrorCode =
  | 'unsupported-platform'
  | 'no-native-module'
  | 'permission-denied'
  | 'bluetooth-off'
  | 'list-failed'
  | 'connect-failed'
  | 'write-failed';

export class PrinterError extends Error {
  code: PrinterErrorCode;
  constructor(code: PrinterErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'PrinterError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

export interface PrinterDevice {
  address: string;
  name: string;
}

// Buffer printer murah cuma sekitar 128–512 byte: satu struk panjang yang
// dikirim sekaligus keluar terpotong atau jadi karakter sampah. 180 byte +
// jeda 30ms titik awal yang aman — kalau masih rusak, kecilkan CHUNK_SIZE dan
// besarkan CHUNK_DELAY_MS; kalau terlalu lambat, naikkan pelan-pelan sambil
// diuji di printer paling murah yang ada.
const CHUNK_SIZE = 180;
const CHUNK_DELAY_MS = 30;

const STORAGE_KEY = 'kasir.printer';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDevice(d: BluetoothNativeDevice): PrinterDevice {
  return { address: d.address, name: d.name || d.address };
}

function wrap(code: PrinterErrorCode, message: string, cause: unknown): PrinterError {
  return cause instanceof PrinterError ? cause : new PrinterError(code, message, cause);
}

/**
 * Modul native ada di build ini? `false` di Expo Go dan di web — tidak ada
 * satu pun fungsi lain di file ini yang bisa dipakai kalau begitu.
 */
export function isPrinterSupported(): boolean {
  return Platform.OS === 'android' && NativeModules.RNBluetoothClassic != null;
}

/**
 * Izin runtime Bluetooth. Android 12 (API 31) memisah BLUETOOTH_SCAN/CONNECT
 * dari izin install-time BLUETOOTH/BLUETOOTH_ADMIN; di bawah itu tidak ada
 * yang perlu diminta karena app ini tidak melakukan discovery.
 */
async function ensurePermissions(): Promise<void> {
  const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  if (api < 31) return;
  const wanted = [
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  const granted = wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
  if (!granted) {
    throw new PrinterError('permission-denied', 'Izin Bluetooth ditolak — beri izin lewat Pengaturan aplikasi lalu coba lagi.');
  }
}

/** Cek platform, modul native, izin, dan status adapter. Panggil sebelum operasi apa pun. */
export async function ensureReady(): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new PrinterError('unsupported-platform', 'Printer Bluetooth hanya didukung di tablet Android.');
  }
  if (!isPrinterSupported()) {
    throw new PrinterError('no-native-module', 'Modul Bluetooth belum ada di build ini — pakai dev build (npx expo run:android), bukan Expo Go.');
  }
  await ensurePermissions();
  if (!(await RNBluetoothClassic.isBluetoothEnabled())) {
    const enabled = await RNBluetoothClassic.requestBluetoothEnabled();
    if (!enabled) throw new PrinterError('bluetooth-off', 'Bluetooth masih mati — nyalakan dulu untuk memakai printer.');
  }
}

/** Perangkat yang sudah di-pair lewat Pengaturan Android. */
export async function listBonded(): Promise<PrinterDevice[]> {
  try {
    return (await RNBluetoothClassic.getBondedDevices()).map(toDevice);
  } catch (e) {
    throw wrap('list-failed', 'Gagal membaca daftar perangkat yang sudah di-pair.', e);
  }
}

/** Buka Pengaturan Bluetooth Android — di situlah printer di-pair. */
export function openBluetoothSettings(): void {
  if (isPrinterSupported()) RNBluetoothClassic.openBluetoothSettings();
}

export async function isConnected(address: string): Promise<boolean> {
  if (!isPrinterSupported()) return false;
  try {
    return await RNBluetoothClassic.isDeviceConnected(address);
  } catch {
    return false;
  }
}

export async function connect(address: string): Promise<void> {
  try {
    await RNBluetoothClassic.connectToDevice(address, { connectorType: 'rfcomm' });
  } catch (e) {
    // Sebagian printer thermal murah menolak socket secure walau sudah di-pair.
    try {
      await RNBluetoothClassic.connectToDevice(address, { connectorType: 'rfcomm', secureSocket: false });
    } catch {
      throw wrap('connect-failed', 'Tidak bisa tersambung ke printer — pastikan printer menyala dan sudah di-pair.', e);
    }
  }
}

/**
 * Socket RFCOMM gampang putus sendiri (printer dimatikan, keluar jangkauan),
 * jadi koneksi dijamin ulang tepat sebelum mencetak, bukan disimpan sebagai
 * status yang dianggap selalu benar.
 */
export async function ensureConnected(address: string): Promise<void> {
  if (await isConnected(address)) return;
  await ensureReady();
  await connect(address);
}

export async function disconnect(address: string): Promise<void> {
  try {
    await RNBluetoothClassic.disconnectFromDevice(address);
  } catch (e) {
    throw wrap('connect-failed', 'Gagal memutus koneksi printer.', e);
  }
}

/** Kirim byte ESC/POS mentah (lihat services/receipt.ts) ke printer. */
export async function write(address: string, bytes: Uint8Array): Promise<void> {
  try {
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, i + CHUNK_SIZE);
      // writeToDevice(address, message, encoding) membungkus message jadi
      // Buffer lalu base64 — dikirim sebagai base64 supaya byte > 0x7F tidak
      // rusak seperti kalau lewat jalur UTF-8.
      const ok = await RNBluetoothClassic.writeToDevice(address, fromByteArray(chunk), 'base64');
      if (!ok) throw new PrinterError('write-failed', 'Printer menolak data struk.');
      await delay(CHUNK_DELAY_MS);
    }
  } catch (e) {
    throw wrap('write-failed', 'Gagal mengirim struk ke printer — koneksi mungkin terputus.', e);
  }
}

/** Notifikasi saat printer terputus sendiri (mati/keluar jangkauan). */
export function onDisconnected(listener: (address: string) => void): { remove: () => void } {
  if (!isPrinterSupported()) return { remove: () => {} };
  return RNBluetoothClassic.onDeviceDisconnected((event) => listener(event.device.address));
}

// ---- printer pilihan kasir, bertahan antar restart app ----

export async function loadSavedPrinter(): Promise<PrinterDevice | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<PrinterDevice>;
    return saved.address ? { address: saved.address, name: saved.name || saved.address } : null;
  } catch {
    return null;
  }
}

export async function saveSelectedPrinter(device: PrinterDevice): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(device));
  } catch {
    // Pilihan tetap dipakai selama sesi ini; hanya tidak bertahan setelah restart.
  }
}

export async function clearSavedPrinter(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sama seperti di atas — tidak ada yang bisa dilakukan kasir soal ini.
  }
}
