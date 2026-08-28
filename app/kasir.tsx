// Ported from the Claude Design project "POS Kasir.dc.html" — see
// components/shell/AppShell.tsx ("Buka Kasir") and app/index.tsx (role "Kasir")
// for the entry points into this screen.
//
// Local-state-only, same tradeoff as every other screen in this app (see
// app/produk.tsx): the design's own mock `catalog`/`tiles`/`pelangganList`
// are kept inline instead of wiring to the real API.
//
// Beyond the design: the hamburger menu's "Transaksi hari ini" / "Pilih printer"
// entries and their overlays are additions to this app (issue #1). Unlike the
// rest of this screen the printer is NOT mocked — it talks to a real Bluetooth
// Classic printer through services/bluetooth-printer.ts, which needs a dev
// build (native module) and does nothing in Expo Go.
//
// Not ported: the design's `window` keydown listener (F2/F3/F4/F5/F6/F7/F8/F12
// shortcuts, digit capture while "editing") — this is a touch-first tablet
// screen in this app, not a desktop kiosk with a physical keyboard, so the
// F-key hints on the action buttons are decorative only. The "tap outside the
// keypad to apply" behaviour is kept, implemented as a transparent overlay
// over the cart+search columns while `editing` is true (RN has no bubbling
// pointerdown-capture-on-window equivalent, so the first outside tap commits
// and is swallowed rather than also reaching whatever is underneath).

import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useRef, useState } from 'react';
import {
  Animated, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View,
  type TextProps, type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRequireSession } from '@/hooks/use-require-session';
import { rp } from '@/constants/theme-erp';
import { logout } from '@/services/auth';
import * as printer from '@/services/bluetooth-printer';
import {
  PAPER_LABEL, PAPER_OPTIONS, encodeReceipt, encodeTestReceipt, receiptDateTime,
  type PaperColumns, type ReceiptData,
} from '@/services/receipt';

// ---- exact palette from POS Kasir.dc.html (kept separate from the shared
// back-office `Colors` token set — this screen was designed standalone) ----
const K = {
  bg: '#F1F8FD',
  card: '#fff',
  text: '#0E2433',
  border: '#C7DBEA',
  borderCard: '#D5E6F2',
  borderLight: '#E4EFF8',
  borderLighter: '#EDF5FB',
  rowBg: '#F7FBFE',
  rowBorder: '#DDEAF4',
  muted: '#93A8B8',
  muted2: '#7C93A5',
  muted3: '#5A7387',
  dark2: '#2E4557',
  primary: '#007CB9',
  primaryDark: '#005689',
  primaryTint: 'rgba(0,124,185,0.10)',
  primaryTintSoft: 'rgba(0,124,185,0.07)',
  amberBg: '#FDF6E7',
  amberBorder: '#F0DFB4',
  amberDot: '#B4780A',
  amberText: '#7C4A06',
  red: '#C8322B',
  redBg: '#FDF2F1',
  keyActive: '#E4EEF6',
  backActive: '#D9E7F2',
  disabled: '#AFC2D0',
  toastBg: '#0E2433',
} as const;

// ---- font scaling ----
// This screen is fixed geometry: three columns that all have to stay on screen
// at once, so the usual blanket 1.4 cap on the system font size is more than it
// can absorb. The cap is derived from the text's own size instead, and it goes
// *down* as the text gets bigger — an 11px column header is what someone who
// enlarged their system font actually needs enlarged, while the 38px total and
// the 56px kembalian readout are already legible from across the counter, and
// growing those only pushes the columns apart.
function fontCap(size: number | undefined): number {
  if (size === undefined) return 1.3; // inherits from a parent Text, which is capped already
  if (size >= 20) return 1; // display readouts: total, kembalian, numpad, PIN
  if (size >= 15) return 1.15; // row names, key labels — text that sits in a sized box
  return 1.3; // labels, hints, badges, table headers
}

/**
 * `Text` with that cap applied, shadowing the react-native import for the rest
 * of this file so every call site below gets it without a prop. Pass
 * `maxFontSizeMultiplier` explicitly to override one.
 */
function Text({ style, maxFontSizeMultiplier, ...rest }: TextProps) {
  const size = (StyleSheet.flatten(style) as TextStyle | undefined)?.fontSize;
  return <RNText style={style} maxFontSizeMultiplier={maxFontSizeMultiplier ?? fontCap(size)} {...rest} />;
}

// ---- domain types (mirrors the design's PosProduct/cart-row shape) ----
type Mode = 'qty' | 'harga' | 'diskon' | 'disknota' | 'bulat' | 'bayar';
type Jenis = 'TUNAI' | 'KREDIT';

interface Satuan { id: number; nama: string; faktor: number; def: boolean; idh: number | null; harga: number | null }
interface Produk { id: number; kode: string; nama: string; bc?: string; stok: number; satuan: Satuan[]; note?: string }
interface CartRow {
  id: string;
  idProduct: number;
  kode: string;
  name: string;
  stok: number;
  satuan: Satuan[];
  idSatuan: number;
  unit: string;
  faktor: number;
  idHarga: number | null;
  price: number;
  qty: number;
  disc: number;
  note: string;
}
interface PelangganRef { id: number; nama: string; sub: string; piutang: number }
type PrinterKind = 'bluetooth' | 'usb';
interface ToastState { msg: string; undo: boolean }
interface DoneState { label: string; amount: string; sub: string }
interface FinishedTx {
  id: string;
  nota: string;
  time: string;
  jenis: Jenis;
  pelanggan: string | null;
  items: { name: string; qty: number; unit: string; price: number; disc: number }[];
  total: number;
}

interface KasirState {
  cart: CartRow[];
  activeId: string | null;
  query: string;
  mode: Mode;
  buffer: string;
  parked: number;
  toast: ToastState | null;
  done: DoneState | null;
  jenis: Jenis;
  pelanggan: PelangganRef | null;
  diskonNota: number;
  pembulatan: number;
  bulatSign: 1 | -1;
  custOpen: boolean;
  satuanFor: string | null;
  error: string;
  newId: string | null;
  seq: number;
  notaSeq: number;
  lastDeleted: { row: CartRow; i: number } | null;
  pin: string | null;
  pinBuf: string;
  editing: boolean;
  menuOpen: boolean;
  historyOpen: boolean;
  historyExpanded: string | null;
  history: FinishedTx[];
  printerOpen: boolean;
  printerTab: PrinterKind;
  printerLoading: boolean;
  /** Perangkat yang sudah di-pair lewat Pengaturan Android. */
  printerPaired: printer.PrinterDevice[];
  printerBusy: string | null;
  /** Printer pilihan kasir — bertahan antar restart app. */
  printer: printer.PrinterDevice | null;
  /** Socket ke printer sedang terbuka; dijamin ulang tiap kali mencetak. */
  printerLive: boolean;
  printerError: string | null;
  printerColumns: PaperColumns;
  printerTesting: boolean;
}

// ---- demo props the design exposes as editable, hardcoded here (no host to pass them) ----
const CASHIER_NAME = 'Kasir: Rina';
const RUANG_NAME = 'Ruang Toko Depan';
const SHOW_QUICK_TILES = true;
const KREDIT_ENABLED = true;
const PEMBULATAN_OTOMATIS = false;

const CATALOG: Produk[] = [
  { id: 1, kode: 'BRG-001', nama: 'Pulpen Standard AE7 Hitam 0,5', bc: '8991234567890', stok: 148,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 501, harga: 3500 }, { id: 12, nama: 'lusin', faktor: 12, def: false, idh: 502, harga: 38000 }] },
  { id: 2, kode: 'BRG-002', nama: 'Pulpen Standard AE8 Biru 0,7', bc: '8991234567892', stok: 96,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 503, harga: 3500 }, { id: 12, nama: 'lusin', faktor: 12, def: false, idh: null, harga: null }] },
  { id: 3, kode: 'BRG-010', nama: 'HVS Sinar Dunia A4 70gr', bc: '8991234567893', stok: 170,
    satuan: [{ id: 13, nama: 'rim', faktor: 1, def: true, idh: 510, harga: 52000 }, { id: 14, nama: 'dus', faktor: 5, def: false, idh: 511, harga: 250000 }] },
  { id: 4, kode: 'BRG-011', nama: 'HVS Sinar Dunia A4 80gr', bc: '8991234567894', stok: 6,
    satuan: [{ id: 13, nama: 'rim', faktor: 1, def: true, idh: 512, harga: 61000 }] },
  { id: 5, kode: 'BRG-020', nama: 'Buku Tulis Sidu 38 lembar', bc: '8991234567895', stok: 210,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 520, harga: 4200 }, { id: 15, nama: 'pak', faktor: 10, def: false, idh: 521, harga: 39000 }] },
  { id: 6, kode: 'BRG-021', nama: 'Buku Tulis Sidu 58 lembar', bc: '8991234567896', stok: 180,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 522, harga: 5900 }, { id: 15, nama: 'pak', faktor: 10, def: false, idh: 523, harga: 58000 }] },
  { id: 7, kode: 'BRG-030', nama: 'Pensil Faber 2B Hexagonal', bc: '8991234567897', stok: 320,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 530, harga: 2800 }, { id: 12, nama: 'lusin', faktor: 12, def: false, idh: 531, harga: 31000 }] },
  { id: 8, kode: 'BRG-031', nama: 'Spidol Boardmarker Snowman', bc: '8991234567898', stok: 44,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 532, harga: 9500 }] },
  { id: 9, kode: 'BRG-040', nama: 'Isi Staples No. 3 (kecil)', bc: '8991234567899', stok: 3,
    satuan: [{ id: 16, nama: 'box', faktor: 1, def: true, idh: 540, harga: 3000 }] },
  { id: 10, kode: 'BRG-041', nama: 'Lakban Bening 2 inch', bc: '8991234567800', stok: 61,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 541, harga: 11500 }] },
  { id: 11, kode: 'BRG-050', nama: 'Map Plastik Kancing A4', bc: '8991234567801', stok: 88,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 550, harga: 4500 }] },
  { id: 12, kode: 'BRG-051', nama: 'Tip-Ex Kertas Roller', bc: '8991234567802', stok: 27,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 551, harga: 12500 }] },
  { id: 13, kode: 'BRG-060', nama: 'Gunting Kenko Sedang', bc: '8991234567803', stok: 15,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 560, harga: 16000 }] },
  // Belum punya versi harga berlaku pada tanggal ini → disembunyikan dari layar kasir.
  { id: 14, kode: 'BRG-061', nama: 'Penggaris Besi 30cm', bc: '8991234567804', stok: 40,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: null, harga: null }] },
  { id: 15, kode: 'BRG-062', nama: 'Amplop Coklat A4', bc: '8991234567805', stok: 250,
    satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: null, harga: null }] },
];

const TILES: Produk[] = [
  { id: 101, kode: 'JSA-001', nama: 'Fotokopi', stok: 999999, satuan: [{ id: 20, nama: 'lbr', faktor: 1, def: true, idh: 601, harga: 300 }], note: 'Turun Rp 250 di atas 100 lembar' },
  { id: 102, kode: 'JSA-002', nama: 'Print B/W', stok: 999999, satuan: [{ id: 20, nama: 'lbr', faktor: 1, def: true, idh: 602, harga: 500 }], note: 'Turun Rp 400 di atas 50 lembar' },
  { id: 103, kode: 'JSA-003', nama: 'Print Warna', stok: 999999, satuan: [{ id: 20, nama: 'lbr', faktor: 1, def: true, idh: 603, harga: 1500 }] },
  { id: 104, kode: 'JSA-004', nama: 'Jilid Spiral', stok: 999999, satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 604, harga: 8000 }] },
  { id: 105, kode: 'JSA-005', nama: 'Laminating A4', stok: 999999, satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 605, harga: 5000 }] },
  { id: 106, kode: 'JSA-006', nama: 'Scan Dokumen', stok: 999999, satuan: [{ id: 20, nama: 'lbr', faktor: 1, def: true, idh: 606, harga: 1000 }] },
  { id: 107, kode: 'JSA-007', nama: 'Plastik', stok: 999999, satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 607, harga: 500 }] },
  { id: 108, kode: 'JSA-008', nama: 'Materai 10rb', stok: 60, satuan: [{ id: 11, nama: 'pcs', faktor: 1, def: true, idh: 608, harga: 11000 }] },
];

const PELANGGAN_LIST: PelangganRef[] = [
  { id: 1, nama: 'CV Sinar Abadi', sub: 'Kredit · tempo 14 hari', piutang: 2450000 },
  { id: 2, nama: 'SD Negeri 03 Menteng', sub: 'Kredit · tempo 30 hari', piutang: 780000 },
  { id: 3, nama: 'Koperasi Karyawan Bina', sub: 'Kredit · tempo 14 hari', piutang: 0 },
  { id: 4, nama: 'Toko Amanah', sub: 'Tunai', piutang: 0 },
  { id: 5, nama: 'Ibu Sri (langganan)', sub: 'Tunai', piutang: 0 },
];

const PRINTER_TAB_LABEL: Record<PrinterKind, string> = { bluetooth: 'Bluetooth', usb: 'USB / OTG' };

function priced(p: Produk): boolean {
  return p.satuan.some((s) => s.harga !== null);
}
function defSatuan(p: Produk): Satuan {
  return p.satuan.find((s) => s.def && s.harga !== null) ?? p.satuan.find((s) => s.harga !== null) ?? p.satuan[0];
}
function timeNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function notaNo(seq: number): string {
  return 'PJ/KODE/2026/08/' + String(seq).padStart(4, '0');
}
function searchCatalog(q: string): Produk[] {
  const s = q.trim().toLowerCase();
  const pool = CATALOG.filter(priced);
  if (!s) return pool.slice(0, 12);
  let hits = pool.filter((p) => p.nama.toLowerCase().includes(s) || p.kode.toLowerCase().includes(s));
  if (!hits.length) {
    hits = s.length < 4 ? [] : pool.filter((p) => {
      const n = p.nama.toLowerCase();
      let i = 0;
      for (const ch of n) if (ch === s[i]) i++;
      return i === s.length;
    });
  }
  // Kecocokan persis kode_barang naik ke puncak, seperti di kontrak.
  return hits.slice().sort((a, b) => (b.kode.toLowerCase() === s ? 1 : 0) - (a.kode.toLowerCase() === s ? 1 : 0));
}

const MODE_LABELS: Record<Mode, string> = {
  qty: 'QTY', harga: 'HARGA', diskon: 'DISKON BARIS', disknota: 'DISKON NOTA', bulat: 'PEMBULATAN', bayar: 'UANG DITERIMA',
};

const INITIAL_STATE: KasirState = {
  cart: [], activeId: null, query: '', mode: 'qty', buffer: '',
  parked: 3, toast: null, done: null, jenis: 'TUNAI', pelanggan: null,
  diskonNota: 0, pembulatan: 0, bulatSign: 1, custOpen: false, satuanFor: null,
  error: '', newId: null, seq: 1, notaSeq: 1, lastDeleted: null,
  pin: null, pinBuf: '', editing: false,
  menuOpen: false, historyOpen: false, historyExpanded: null, history: [],
  printerOpen: false, printerTab: 'bluetooth', printerLoading: false, printerPaired: [],
  printerBusy: null, printer: null, printerLive: false, printerError: null,
  printerColumns: 32, printerTesting: false,
};

export default function KasirScreen() {
  const router = useRouter();
  const allowed = useRequireSession();
  // No navigator header on this screen, and it runs locked to landscape — where
  // the notch and the gesture bar sit on the *sides*, not just the top. Padding
  // the root keeps the absolutely positioned sheets (menu, backdrop, toast)
  // aligned with the header too: they measure from the padding box.
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<KasirState>(INITIAL_STATE);
  const searchRef = useRef<TextInput>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // Kasir is a 3-column landscape-tablet layout (cart + katalog + keypad all
  // visible at once) — portrait doesn't fit it, so lock orientation while this
  // screen is open and restore free rotation on the way out.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  // Printer pilihan kasir dipakai lagi tanpa harus dipilih ulang tiap buka
  // app; koneksinya sendiri baru dibuka saat mencetak.
  useEffect(() => {
    let active = true;
    printer.loadSavedPrinter().then((saved) => {
      if (active && saved) setState((s) => (s.printer ? s : { ...s, printer: saved }));
    });
    return () => {
      active = false;
    };
  }, []);

  // Printer bisa putus sendiri (mati, keluar jangkauan). Pilihannya tetap
  // dipegang — yang hilang cuma socket-nya, dan itu dibuka lagi saat mencetak.
  useEffect(() => {
    const sub = printer.onDisconnected((address) => {
      setState((s) => (s.printer && s.printer.address === address ? { ...s, printerLive: false } : s));
    });
    return () => sub.remove();
  }, []);

  function patch(p: Partial<KasirState> | ((s: KasirState) => Partial<KasirState>)) {
    setState((prev) => ({ ...prev, ...(typeof p === 'function' ? p(prev) : p) }));
  }
  function focusSearch() {
    setTimeout(() => searchRef.current?.focus(), 0);
  }
  function printerFail(e: unknown) {
    patch({
      printerError: e instanceof Error ? e.message : 'Printer bermasalah — coba lagi.',
      printerLoading: false, printerBusy: null, printerTesting: false,
    });
  }

  // Tidak ada scan/pairing di dalam app — lihat services/bluetooth-printer.ts.
  // Yang ditampilkan hanya perangkat yang sudah di-pair lewat Pengaturan.
  async function loadPrinters() {
    patch({ printerLoading: true, printerError: null });
    try {
      await printer.ensureReady();
      const paired = await printer.listBonded();
      const chosen = state.printer;
      patch({
        printerPaired: paired,
        printerLoading: false,
        printerLive: chosen ? await printer.isConnected(chosen.address) : false,
      });
    } catch (e) {
      printerFail(e);
    }
  }

  function openPrinter() {
    patch({ menuOpen: false, printerOpen: true });
    if (!state.printerPaired.length && !state.printerLoading) loadPrinters();
  }

  function closePrinter() {
    patch({ printerOpen: false, printerLoading: false });
    focusSearch();
  }

  function selectPrinterTab(kind: PrinterKind) {
    if (state.printerTab === kind) return;
    patch({ printerTab: kind, printerError: null });
  }

  /** Jadikan perangkat ini printer struk kasir, lalu buktikan bisa tersambung. */
  async function choosePrinter(dev: printer.PrinterDevice) {
    if (state.printerBusy) return;
    patch({ printerBusy: dev.address, printerError: null });
    try {
      if (state.printer && state.printer.address !== dev.address) {
        await printer.disconnect(state.printer.address).catch(() => {});
      }
      await printer.ensureConnected(dev.address);
      await printer.saveSelectedPrinter(dev);
      patch({ printer: dev, printerLive: true, printerBusy: null });
      showToast(`Printer tersambung · ${dev.name}`);
    } catch (e) {
      printerFail(e);
    }
  }

  async function forgetPrinter() {
    const prev = state.printer;
    if (!prev) return;
    patch({ printer: null, printerLive: false, printerBusy: null, printerError: null });
    await printer.clearSavedPrinter();
    try {
      await printer.disconnect(prev.address);
    } catch {
      // Sudah putus dari sisi printer — status di layar sudah benar.
    }
    showToast(`${prev.name} tidak dipakai lagi`);
  }

  async function testPrint() {
    const dev = state.printer;
    if (!dev || state.printerTesting) return;
    patch({ printerTesting: true, printerError: null });
    try {
      await printer.ensureConnected(dev.address);
      await printer.write(dev.address, encodeTestReceipt(dev.name, state.printerColumns));
      patch({ printerTesting: false, printerLive: true });
      showToast('Tes cetak dikirim ke printer');
    } catch (e) {
      printerFail(e);
    }
  }

  function showToast(msg: string, undo = false) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    patch({ toast: { msg, undo } });
    toastTimer.current = setTimeout(() => patch({ toast: null }), 5000);
  }

  function add(prod: Produk, qty: number) {
    const sat = defSatuan(prod);
    const cart = state.cart.slice();
    const i = cart.findIndex((r) => r.idProduct === prod.id && r.idSatuan === sat.id);
    let id: string;
    if (i >= 0) {
      cart[i] = { ...cart[i], qty: cart[i].qty + (qty || 1) };
      id = cart[i].id;
    } else {
      id = 'r' + state.seq;
      cart.push({
        id, idProduct: prod.id, kode: prod.kode, name: prod.nama, stok: prod.stok,
        satuan: prod.satuan, idSatuan: sat.id, unit: sat.nama, faktor: sat.faktor,
        idHarga: sat.idh, price: sat.harga ?? 0, qty: qty || 1, disc: 0, note: prod.note ?? '',
      });
    }
    patch({ cart, activeId: id, newId: id, seq: state.seq + 1, query: '', error: '', mode: 'qty', buffer: '', editing: false, satuanFor: null });
    if (newTimer.current) clearTimeout(newTimer.current);
    newTimer.current = setTimeout(() => patch((s) => (s.newId === id ? { newId: null } : {})), 450);
    focusSearch();
  }

  function pickSatuan(rowId: string, sat: Satuan) {
    patch((s) => ({
      cart: s.cart.map((r) => (r.id === rowId
        ? { ...r, idSatuan: sat.id, unit: sat.nama, faktor: sat.faktor, idHarga: sat.idh,
            price: sat.harga === null ? r.price : sat.harga,
            note: sat.harga === null ? 'Tanpa harga daftar · harga diketik manual' : r.note }
        : r)),
      satuanFor: null, activeId: rowId,
    }));
    focusSearch();
  }

  function removeActive() {
    const { cart, activeId } = state;
    const i = cart.findIndex((r) => r.id === activeId);
    if (i < 0) return;
    const removed = cart[i];
    const next = cart.slice();
    next.splice(i, 1);
    patch({ cart: next, activeId: next.length ? next[Math.max(0, i - 1)].id : null, lastDeleted: { row: removed, i } });
    showToast(`${removed.name} dihapus`, true);
    focusSearch();
  }

  function undoDelete() {
    const d = state.lastDeleted;
    if (!d) return;
    const cart = state.cart.slice();
    cart.splice(d.i, 0, d.row);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    patch({ cart, activeId: d.row.id, lastDeleted: null, toast: null });
    focusSearch();
  }

  function hold() {
    if (!state.cart.length) return;
    patch((s) => ({ cart: [], activeId: null, parked: s.parked + 1, mode: 'qty', buffer: '', query: '', editing: false, diskonNota: 0, pembulatan: 0, pelanggan: null, jenis: 'TUNAI' }));
    showToast('Transaksi diparkir · belum jadi dokumen');
    focusSearch();
  }

  function setMode(m: Mode) {
    if ((m === 'harga' || m === 'diskon') && !state.activeId) return;
    if (m === 'harga') { askPin('Override harga baris aktif'); return; }
    if (m !== 'qty') searchRef.current?.blur();
    patch({ mode: m, buffer: '', editing: m !== 'qty' ? true : !!state.activeId });
  }

  function askPin(reason: string) {
    patch({ pin: reason, pinBuf: '' });
  }

  function press(ch: string) {
    if (state.pin !== null) {
      const pinBuf = (state.pinBuf + ch).slice(0, 4);
      if (pinBuf.length === 4) {
        const ok = pinBuf === '1234';
        const reason = state.pin;
        const toHarga = ok && reason.includes('harga');
        patch({ pin: null, pinBuf: '', mode: toHarga ? 'harga' : state.mode, buffer: '', editing: toHarga });
        showToast(ok ? (reason.includes('laci') ? 'Laci terbuka' : 'Mode harga terbuka') : 'PIN salah');
        if (!ok) askPin(reason);
      } else {
        patch({ pinBuf });
      }
      return;
    }
    patch((s) => ({ buffer: (s.buffer + ch).replace(/^0+(?=\d)/, '').slice(0, 9) }));
  }

  function back() {
    if (state.pin !== null) { patch((s) => ({ pinBuf: s.pinBuf.slice(0, -1) })); return; }
    patch((s) => ({ buffer: s.buffer.slice(0, -1) }));
  }

  function patchActive(p: Partial<CartRow>) {
    patch((s) => ({ cart: s.cart.map((r) => (r.id === s.activeId ? { ...r, ...p } : r)) }));
  }

  function lineTotals() {
    const sub = state.cart.reduce((a, r) => a + r.price * r.qty, 0);
    const disc = state.cart.reduce((a, r) => a + (r.disc || 0), 0);
    return { sub: sub - disc, gross: sub, disc };
  }
  function totals() {
    const l = lineTotals();
    const notaDisc = Math.min(state.diskonNota, l.sub);
    const base = l.sub - notaDisc;
    const bulat = PEMBULATAN_OTOMATIS ? Math.round(base / 500) * 500 - base : state.pembulatan;
    return { gross: l.gross, lineDisc: l.disc, sub: l.sub, notaDisc, bulat, total: Math.max(0, base + bulat) };
  }

  function commit() {
    const { mode, buffer, bulatSign } = state;
    const n = parseInt(buffer || '0', 10);
    if (mode === 'qty' && n > 0) patchActive({ qty: n });
    if (mode === 'harga' && n > 0) patchActive({ price: n, note: 'Harga di-override' });
    if (mode === 'diskon') patchActive({ disc: n });
    if (mode === 'disknota') {
      const sub = lineTotals().sub;
      if (n > sub) { showToast('Diskon nota tidak boleh melebihi subtotal'); patch({ buffer: '' }); return; }
      patch({ diskonNota: n });
    }
    if (mode === 'bulat') patch({ pembulatan: n * bulatSign });
    patch({ buffer: '', mode: 'qty', editing: false });
    focusSearch();
  }

  function pay() {
    if (state.cart.length) patch({ mode: 'bayar', buffer: '', editing: false });
  }

  // Cetak struk dari transaksi yang baru selesai. Sengaja tidak menahan
  // finish(): kasir boleh lanjut ke transaksi berikutnya walau printer lambat,
  // kegagalan dilaporkan lewat toast.
  async function printReceipt(record: FinishedTx, t: ReturnType<typeof totals>, paid: number) {
    const dev = state.printer;
    if (!dev) return;
    const data: ReceiptData = {
      nota: record.nota,
      datetime: receiptDateTime(),
      kasir: CASHIER_NAME,
      ruang: RUANG_NAME,
      jenis: record.jenis,
      pelanggan: record.pelanggan,
      items: record.items,
      sub: t.sub,
      notaDisc: t.notaDisc,
      bulat: t.bulat,
      total: t.total,
      paid: record.jenis === 'TUNAI' ? paid : 0,
      change: record.jenis === 'TUNAI' ? Math.max(0, paid - t.total) : 0,
    };
    try {
      await printer.ensureConnected(dev.address);
      await printer.write(dev.address, encodeReceipt(data, state.printerColumns));
      patch({ printerLive: true });
    } catch (e) {
      patch({ printerLive: false });
      showToast(e instanceof Error ? e.message : 'Struk gagal dicetak');
    }
  }

  function finish() {
    const s = state;
    const t = totals();
    if (s.jenis === 'KREDIT' && !s.pelanggan) { patch({ custOpen: true }); showToast('Pilih pelanggan dulu untuk nota KREDIT'); return; }
    const paid = parseInt(s.buffer || '0', 10) || t.total;
    if (s.jenis === 'TUNAI' && paid < t.total) { showToast('Uang diterima kurang dari total'); return; }
    const strukNote = s.printer ? 'struk dikirim ke printer' : 'struk tidak dicetak · printer belum dipilih';
    const doneState: DoneState = s.jenis === 'TUNAI'
      ? { label: 'KEMBALIAN', amount: rp(Math.max(0, paid - t.total)), sub: `${notaNo(s.notaSeq)} · POSTED · LUNAS · ${strukNote}` }
      : { label: 'PIUTANG TERCATAT', amount: rp(t.total), sub: `${notaNo(s.notaSeq)} · POSTED · BELUM · ${s.pelanggan?.nama} · ${strukNote}` };
    const record: FinishedTx = {
      id: 'tx' + s.notaSeq,
      nota: notaNo(s.notaSeq),
      time: timeNow(),
      jenis: s.jenis,
      pelanggan: s.pelanggan?.nama ?? null,
      items: s.cart.map((r) => ({ name: r.name, qty: r.qty, unit: r.unit, price: r.price, disc: r.disc })),
      total: t.total,
    };
    if (doneTimer.current) clearTimeout(doneTimer.current);
    patch((st) => ({
      cart: [], activeId: null, mode: 'qty', buffer: '', query: '', editing: false, diskonNota: 0, pembulatan: 0,
      jenis: 'TUNAI', pelanggan: null, done: doneState, notaSeq: st.notaSeq + 1, history: [record, ...st.history],
    }));
    doneTimer.current = setTimeout(() => patch({ done: null }), 4500);
    printReceipt(record, t, paid);
    focusSearch();
  }

  function onQueryChange(v: string) {
    patch({ query: v, error: '' });
    const hit = CATALOG.find((p) => p.bc === v.trim());
    if (hit && priced(hit)) add(hit, 1);
  }

  function submitQuery() {
    const raw = state.query.trim();
    if (!raw) return;
    const m = raw.match(/^(\d+)\s*\*\s*(.+)$/);
    const key = (m ? m[2] : raw).toLowerCase();
    const qty = m ? parseInt(m[1], 10) : 1;
    const all: Produk[] = [...CATALOG, ...TILES];
    const exact = all.find((p) => p.kode.toLowerCase() === key || p.bc === key);
    if (exact) {
      if (!priced(exact)) { patch({ error: `${exact.nama} belum punya harga berlaku hari ini.` }); return; }
      add(exact, qty);
      return;
    }
    const hits = searchCatalog(m ? m[2] : raw);
    if (hits.length === 1) { add(hits[0], qty); return; }
    if (!hits.length) patch({ error: `"${raw}" tidak ditemukan. Keranjang tidak berubah.` });
  }

  function onQuerySubmit() {
    if (state.mode === 'bayar') { finish(); return; }
    if (state.buffer) { commit(); return; }
    submitQuery();
  }

  // ---- derived render values ----
  const t = totals();
  const q = state.query.trim().toLowerCase();
  const hiddenCount = CATALOG.filter((p) => !priced(p)).length;
  const tunaiMode = state.mode === 'bayar' && state.jenis === 'TUNAI';
  const kreditMode = state.mode === 'bayar' && state.jenis === 'KREDIT';
  const normalMode = state.mode !== 'bayar';
  const payMode = state.mode === 'bayar';
  const showActions = state.mode !== 'bayar' && !state.pin;
  const paid = parseInt(state.buffer || '0', 10);
  const results = searchCatalog(state.query);
  const overlayEditing = state.editing;

  // After every hook above, so the redirect never changes the hook order.
  if (!allowed) return null;

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={styles.cashierName}>{CASHIER_NAME}</Text>
          <Text style={styles.shiftText}>Shift #12 · 08:00</Text>
        </View>
        <View style={styles.ruangBadge}>
          <View style={styles.lockIcon} />
          <Text style={styles.ruangText}>{RUANG_NAME}</Text>
          <Text style={styles.lockedText}>terkunci</Text>
        </View>
        <View style={{ flex: 1 }} />
        {state.parked > 0 && (
          <Pressable onPress={() => showToast(`${state.parked} transaksi terparkir · tersimpan lokal di mesin ini`)} style={styles.parkedBtn}>
            <View style={styles.parkedCount}>
              <Text style={styles.parkedCountText}>{state.parked}</Text>
            </View>
            <Text style={styles.parkedLabel}>diparkir</Text>
          </Pressable>
        )}
        <View style={styles.offlineBadge}>
          <View style={styles.offlineDot} />
          <Text style={styles.offlineText}>Offline · 4 tertunda</Text>
        </View>
        <Pressable onPress={() => patch((s) => ({ menuOpen: !s.menuOpen }))} style={styles.hamburger}>
          <View style={styles.hamburgerBar} />
          <View style={styles.hamburgerBar} />
          <View style={styles.hamburgerBar} />
        </Pressable>
      </View>

      {state.menuOpen && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => patch({ menuOpen: false })}
          accessibilityLabel="Tutup menu">
          <View style={styles.menuBackdrop} />
        </Pressable>
      )}
      {state.menuOpen && (
        <View style={styles.menuDropdown}>
          <Pressable onPress={() => patch({ menuOpen: false, historyOpen: true })} style={styles.menuItem}>
            <Text style={styles.menuItemText}>Transaksi hari ini</Text>
            <Text style={styles.menuItemHint}>{state.history.length} transaksi · untuk cek retur</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable onPress={openPrinter} style={styles.menuItem}>
            <Text style={styles.menuItemText}>Pilih printer</Text>
            <Text style={styles.menuItemHint} numberOfLines={1}>
              {state.printer ? `${state.printer.name} · siap cetak` : 'Belum ada printer · struk tidak dicetak'}
            </Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            onPress={() => {
              // Drop the session before navigating: the login screen sends a
              // live one straight back in. logout() finishes the revoke itself.
              patch({ menuOpen: false });
              void logout();
              router.replace('/');
            }}
            style={styles.menuItem}>
            <Text style={[styles.menuItemText, { color: K.red }]}>Keluar</Text>
            <Text style={styles.menuItemHint}>Logout dari kasir ini</Text>
          </Pressable>
        </View>
      )}

      {state.historyOpen && (
        <View style={styles.historyOverlay}>
          <View style={styles.historyHead}>
            <Text style={styles.historyTitle}>Transaksi hari ini</Text>
            <Text style={styles.historyCount}>{state.history.length} transaksi</Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => patch({ historyOpen: false, historyExpanded: null })}>
              <Text style={styles.overlayCloseBtn}>Tutup</Text>
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {state.history.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Text style={styles.historyEmptyTitle}>Belum ada transaksi hari ini</Text>
                <Text style={styles.historyEmptySub}>Transaksi yang sudah selesai akan muncul di sini · buka lagi setelah ada penjualan.</Text>
              </View>
            ) : (
              state.history.map((tx) => {
                const expanded = state.historyExpanded === tx.id;
                return (
                  <View key={tx.id} style={styles.historyRowWrap}>
                    <Pressable
                      onPress={() => patch((s) => ({ historyExpanded: s.historyExpanded === tx.id ? null : tx.id }))}
                      style={styles.historyRow}>
                      <Text style={styles.historyTime}>{tx.time}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.historyNota} numberOfLines={1}>{tx.nota}</Text>
                        <Text style={styles.historySub} numberOfLines={1}>{tx.pelanggan ?? 'Umum'} · {tx.items.length} barang</Text>
                      </View>
                      <View style={styles.historyJenisBadge}>
                        <Text style={styles.historyJenisText}>{tx.jenis}</Text>
                      </View>
                      <Text style={styles.historyTotal}>{rp(tx.total)}</Text>
                    </Pressable>
                    {expanded && (
                      <View style={styles.historyDetail}>
                        {tx.items.map((it, i) => (
                          <View key={i} style={styles.historyItemRow}>
                            <Text style={styles.historyItemName} numberOfLines={1}>{it.qty} {it.unit} · {it.name}</Text>
                            <Text style={styles.historyItemPrice}>{rp(it.price * it.qty - it.disc)}</Text>
                          </View>
                        ))}
                        <Pressable
                          onPress={() => showToast('Fitur retur belum dibangun — gunakan detail ini sebagai referensi manual dulu')}
                          style={styles.historyReturBtn}>
                          <Text style={styles.historyReturText}>Retur barang dari nota ini</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {state.printerOpen && (
        <View style={styles.historyOverlay}>
          <View style={styles.historyHead}>
            <Text style={styles.historyTitle}>Pilih printer</Text>
            <Text style={styles.historyCount}>Printer struk kasir ini</Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={closePrinter}>
              <Text style={styles.overlayCloseBtn}>Tutup</Text>
            </Pressable>
          </View>

          <View style={styles.printerStatus}>
            <View style={[styles.printerStatusDot, state.printer ? styles.printerStatusDotOn : null]} />
            <View style={{ minWidth: 0, flexShrink: 1 }}>
              <Text style={styles.printerStatusText} numberOfLines={1}>
                {state.printer ? state.printer.name : 'Belum ada printer dipilih'}
              </Text>
              <Text style={styles.printerStatusSub} numberOfLines={1}>
                {state.printer
                  ? `${state.printer.address} · ${state.printerLive ? 'tersambung' : 'akan disambungkan saat mencetak'}`
                  : 'Struk tidak akan dicetak sampai printer dipilih'}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            {state.printer && (
              <>
                <Pressable onPress={testPrint} disabled={state.printerTesting} style={styles.printerTestBtn}>
                  <Text style={[styles.printerTestText, state.printerTesting ? { color: K.muted } : null]}>
                    {state.printerTesting ? 'Mengirim…' : 'Tes cetak'}
                  </Text>
                </Pressable>
                <Pressable onPress={forgetPrinter} style={styles.printerDisconnectBtn}>
                  <Text style={styles.printerDisconnectText}>Lupakan</Text>
                </Pressable>
              </>
            )}
          </View>

          {!!state.printerError && (
            <View style={styles.printerErrorBar}>
              <Text style={styles.printerErrorText}>{state.printerError}</Text>
            </View>
          )}

          <View style={styles.printerTabs}>
            {(['bluetooth', 'usb'] as PrinterKind[]).map((kind) => (
              <Pressable key={kind} onPress={() => selectPrinterTab(kind)} style={styles.printerTab}>
                {state.printerTab === kind && <View style={styles.printerTabActiveTint} pointerEvents="none" />}
                <Text style={[styles.printerTabText, state.printerTab === kind ? styles.printerTabTextActive : null]}>
                  {PRINTER_TAB_LABEL[kind]}
                </Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <Text style={styles.printerPaperLabel}>Lebar kertas</Text>
            {PAPER_OPTIONS.map((columns) => (
              <Pressable key={columns} onPress={() => patch({ printerColumns: columns })} style={styles.printerTab}>
                {state.printerColumns === columns && <View style={styles.printerTabActiveTint} pointerEvents="none" />}
                <Text style={[styles.printerTabText, state.printerColumns === columns ? styles.printerTabTextActive : null]}>
                  {PAPER_LABEL[columns]}
                </Text>
              </Pressable>
            ))}
            {state.printerTab === 'bluetooth' && (
              <Pressable onPress={loadPrinters} disabled={state.printerLoading} style={styles.printerScanBtn}>
                <Text style={[styles.printerScanText, state.printerLoading ? { color: K.muted } : null]}>
                  {state.printerLoading ? 'Memuat…' : 'Muat ulang'}
                </Text>
              </Pressable>
            )}
          </View>

          {state.printerTab === 'usb' ? (
            <View style={{ flex: 1 }}>
              <View style={styles.historyEmpty}>
                <Text style={styles.historyEmptyTitle}>Printer USB belum didukung</Text>
                <Text style={styles.historyEmptySub}>
                  Build ini hanya memuat transport Bluetooth Classic (SPP/RFCOMM). USB/OTG butuh native module
                  tersendiri — sementara pakai printer Bluetooth.
                </Text>
              </View>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }}>
              {state.printerPaired.map((dev) => {
                const chosen = state.printer?.address === dev.address;
                const busy = state.printerBusy === dev.address;
                return (
                  <View key={dev.address} style={styles.printerRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.printerName} numberOfLines={1}>{dev.name}</Text>
                      <Text style={styles.printerSub} numberOfLines={1}>{dev.address}</Text>
                    </View>
                    {chosen ? (
                      <View style={styles.printerConnectedBadge}>
                        <Text style={styles.printerConnectedText}>{state.printerLive ? 'Tersambung' : 'Dipakai'}</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => choosePrinter(dev)}
                        disabled={!!state.printerBusy}
                        style={styles.printerConnectBtn}>
                        <Text style={[styles.printerConnectText, state.printerBusy ? { color: K.muted } : null]}>
                          {busy ? 'Menyambungkan…' : 'Pakai printer ini'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {state.printerLoading && (
                <Text style={styles.printerLoadingText}>Membaca daftar perangkat…</Text>
              )}
              {!state.printerLoading && state.printerPaired.length === 0 && (
                <View style={styles.historyEmpty}>
                  <Text style={styles.historyEmptyTitle}>Belum ada perangkat yang di-pair</Text>
                  <Text style={styles.historyEmptySub}>
                    Nyalakan printer, pair sekali lewat Pengaturan Bluetooth Android, lalu muat ulang daftar ini.
                  </Text>
                  <Pressable onPress={printer.openBluetoothSettings} style={styles.printerSettingsBtn}>
                    <Text style={styles.printerSettingsText}>Buka Pengaturan Bluetooth</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          )}

          <Text style={styles.overlayFoot}>
            Pairing printer dilakukan sekali di Pengaturan Bluetooth Android, bukan di sini — app cuma memakai
            perangkat yang sudah terpasang. Printer terpilih dipakai otomatis begitu transaksi selesai.
          </Text>
        </View>
      )}

      <View style={styles.main}>
        <View style={styles.leftMiddleWrap}>
          {/* Section 1 — cart */}
          <View style={styles.cartSection}>
            <View style={styles.cartHead}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9, minWidth: 0, flexShrink: 1 }}>
                <Text style={styles.notaText}>{notaNo(state.notaSeq)}</Text>
                <Text style={styles.draftText}>DRAFT</Text>
                <Text style={styles.itemCountText}>{state.cart.length} baris</Text>
              </View>
              <Pressable onPress={() => patch({ custOpen: true })} style={styles.custBtn}>
                <Text style={styles.custBtnText} numberOfLines={1}>{state.pelanggan ? state.pelanggan.nama : 'Pelanggan'}</Text>
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
              {state.cart.length === 0 ? (
                <View style={styles.cartEmpty}>
                  <Text style={styles.cartEmptyTitle}>Scan barcode untuk mulai</Text>
                  <Text style={styles.cartEmptySub}>Atau ketik kode barang, <Text style={styles.mono}>12*BRG-001</Text> untuk qty, atau nama barang.</Text>
                  <Pressable onPress={() => showToast(`${state.parked} transaksi terparkir · tersimpan lokal di mesin ini`)} style={styles.cartEmptyBtn}>
                    <Text style={styles.cartEmptyBtnText}>Buka transaksi terparkir ({state.parked})</Text>
                  </Pressable>
                </View>
              ) : (
                state.cart.map((row) => {
                  const qtyDasar = row.qty * row.faktor;
                  const isActive = row.id === state.activeId;
                  const editingQty = isActive && state.editing && state.mode === 'qty';
                  const satuanOpen = state.satuanFor === row.id;
                  const overStock = qtyDasar > row.stok;
                  const hasNote = !!(row.disc || row.note);
                  const noteText = row.disc ? `Diskon baris ${rp(row.disc)}` : row.note;
                  return (
                    <View key={row.id} style={styles.cartRowWrap}>
                      <Pressable
                        onPress={() => { patch({ activeId: row.id, mode: 'qty', buffer: '', editing: false }); focusSearch(); }}
                        style={styles.cartRow}>
                        {isActive && <View style={styles.cartRowActiveTint} pointerEvents="none" />}
                        {row.id === state.newId && <NewRowFlash />}
                        <Pressable
                          onPress={() => { searchRef.current?.blur(); patch({ activeId: row.id, mode: 'qty', buffer: '', editing: true }); }}
                          style={styles.qtyBtn}>
                          {editingQty ? (
                            <View style={styles.qtyBtnEditing}>
                              <Text style={styles.qtyBtnEditingText}>{state.buffer || '0'}</Text>
                            </View>
                          ) : null}
                          <Text style={styles.qtyBtnText}>{row.qty}</Text>
                        </Pressable>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
                          {hasNote && !overStock && <Text style={styles.rowNote} numberOfLines={1}>{noteText}</Text>}
                          {overStock && <Text style={styles.rowStockWarn} numberOfLines={1}>Butuh {qtyDasar} · sisa ruang {row.stok}</Text>}
                        </View>
                        <Pressable
                          onPress={() => {
                            if (row.satuan.length < 2) { showToast(`${row.name} hanya punya satu satuan`); return; }
                            patch((s) => ({ satuanFor: s.satuanFor === row.id ? null : row.id, activeId: row.id }));
                          }}
                          style={styles.satuanBtn}>
                          <Text style={styles.satuanBtnText}>{row.unit}</Text>
                          {row.satuan.length > 1 && <Text style={styles.satuanArrow}>▼</Text>}
                        </Pressable>
                        <View style={{ flexShrink: 0, alignItems: 'flex-end' }}>
                          <Text style={styles.rowSubtotal}>{rp(row.price * row.qty - (row.disc || 0))}</Text>
                          <Text style={styles.rowPrice}>{rp(row.price)} / {row.unit}</Text>
                        </View>
                      </Pressable>
                      {satuanOpen && (
                        <View style={styles.satuanChipsRow}>
                          {row.satuan.map((sa) => {
                            const active = sa.id === row.idSatuan;
                            return (
                              <Pressable key={sa.id} onPress={() => pickSatuan(row.id, sa)} style={styles.satuanChip}>
                                {active && <View style={styles.satuanChipActiveTint} pointerEvents="none" />}
                                <Text style={styles.satuanChipLabel}>{sa.nama}</Text>
                                <Text style={styles.satuanChipPrice}>{sa.harga === null ? 'tanpa harga' : rp(sa.harga)}</Text>
                              </Pressable>
                            );
                          })}
                          <Text style={styles.satuanChipsHint}>Ganti satuan menghitung ulang qty dasar</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.cartFooter}>
              <View style={styles.footRow}>
                <Text style={styles.footLabel}>Subtotal</Text>
                <Text style={styles.footValue}>{rp(t.gross)}</Text>
              </View>
              {t.lineDisc > 0 && (
                <View style={[styles.footRow, { marginTop: 5 }]}>
                  <Text style={styles.footLabel}>Diskon baris</Text>
                  <Text style={styles.footValue}>− {rp(t.lineDisc)}</Text>
                </View>
              )}
              {t.notaDisc > 0 && (
                <View style={[styles.footRow, { marginTop: 5 }]}>
                  <Text style={styles.footLabel}>Diskon nota</Text>
                  <Text style={styles.footValue}>− {rp(t.notaDisc)}</Text>
                </View>
              )}
              {t.bulat !== 0 && (
                <View style={[styles.footRow, { marginTop: 5 }]}>
                  <Text style={styles.footLabel}>Pembulatan {PEMBULATAN_OTOMATIS ? '(otomatis)' : ''}</Text>
                  <Text style={styles.footValue}>{t.bulat < 0 ? '− ' : '+ '}{rp(Math.abs(t.bulat))}</Text>
                </View>
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL</Text>
                <Text style={styles.totalValue}>{rp(t.total)}</Text>
              </View>
            </View>

            {state.custOpen && (
              <View style={styles.overlay}>
                <View style={styles.overlayHead}>
                  <Text style={styles.overlayTitle}>Pilih pelanggan</Text>
                  <Pressable onPress={() => { patch({ custOpen: false }); focusSearch(); }}>
                    <Text style={styles.overlayClose}>Tutup</Text>
                  </Pressable>
                </View>
                <ScrollView style={{ flex: 1 }}>
                  {[{ id: 0, nama: 'Umum (tanpa pelanggan)', sub: 'Hanya untuk nota TUNAI', piutang: 0 }, ...PELANGGAN_LIST].map((c) => {
                    const active = (state.pelanggan ? state.pelanggan.id : 0) === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => {
                          const picked = c.id === 0 ? null : c;
                          patch((s) => ({ pelanggan: picked, custOpen: false, jenis: !picked && s.jenis === 'KREDIT' ? 'TUNAI' : s.jenis }));
                          focusSearch();
                        }}
                        style={styles.custRow}>
                        {active && <View style={styles.custRowActiveTint} pointerEvents="none" />}
                        <View style={{ minWidth: 0, gap: 2 }}>
                          <Text style={styles.custName} numberOfLines={1}>{c.nama}</Text>
                          <Text style={styles.custSub}>{c.sub}</Text>
                        </View>
                        <Text style={styles.custPiutang}>{c.piutang ? `Piutang ${rp(c.piutang)}` : ''}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={styles.overlayFoot}>Nota KREDIT wajib punya pelanggan. Nota TUNAI boleh tanpa.</Text>
              </View>
            )}

            {state.done && (
              <View style={styles.doneOverlay}>
                <Text style={styles.doneLabel}>{state.done.label}</Text>
                <Text style={styles.doneAmount}>{state.done.amount}</Text>
                <Text style={styles.doneSub}>{state.done.sub}</Text>
              </View>
            )}
          </View>

          {/* Section 2 — search + tiles + results */}
          <View style={styles.middleSection}>
            <View style={styles.searchWrap}>
              <View style={styles.searchInputWrap}>
                <View style={styles.searchIconCircle} pointerEvents="none" />
                <View style={styles.searchIconHandle} pointerEvents="none" />
                <TextInput
                  ref={searchRef}
                  value={state.query}
                  onChangeText={onQueryChange}
                  onSubmitEditing={onQuerySubmit}
                  placeholder="Scan barcode, kode barang, atau nama"
                  maxFontSizeMultiplier={fontCap(15)}
                  style={styles.searchInput}
                />
                <Text style={styles.focusLabel} pointerEvents="none">FOKUS</Text>
              </View>
              {!!state.error && <Text style={styles.errorText}>{state.error}</Text>}
            </View>

            {SHOW_QUICK_TILES && (
              <View style={styles.tilesWrap}>
                <View style={styles.tilesHead}>
                  <Text style={styles.tilesLabel}>AKSI CEPAT</Text>
                  <Text style={styles.tilesHint}>Dapat dikonfigurasi pemilik</Text>
                </View>
                <View style={styles.tilesGrid}>
                  {TILES.map((tItem) => {
                    const sa = defSatuan(tItem);
                    return (
                      <Pressable key={tItem.id} onPress={() => add(tItem, 1)} style={styles.tileBtn}>
                        <Text style={styles.tileName} numberOfLines={1}>{tItem.nama}</Text>
                        <Text style={styles.tilePrice}>{rp(sa.harga ?? 0)} / {sa.nama}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={styles.resultsHeadRow}>
              <Text style={[styles.resultsHeadText, { width: 76 }]}>KODE</Text>
              <Text style={[styles.resultsHeadText, { flex: 1 }]}>NAMA</Text>
              <Text style={[styles.resultsHeadText, { width: 96 }]}>SATUAN</Text>
              <Text style={[styles.resultsHeadText, { width: 76 }]}>STOK</Text>
              <Text style={[styles.resultsHeadText, { width: 96, textAlign: 'right' }]}>HARGA</Text>
            </View>
            <ScrollView style={{ flex: 1 }}>
              {results.map((r) => {
                const i = q ? r.nama.toLowerCase().indexOf(q) : -1;
                const sa = defSatuan(r);
                const inDef = Math.floor(r.stok / sa.faktor);
                const low = inDef <= 10;
                const pre = i < 0 ? r.nama : r.nama.slice(0, i);
                const hit = i < 0 ? '' : r.nama.slice(i, i + q.length);
                const post = i < 0 ? '' : r.nama.slice(i + q.length);
                return (
                  <Pressable key={r.id} onPress={() => add(r, 1)} style={styles.resultRow}>
                    <Text style={[styles.resultCode, { width: 76 }]}>{r.kode}</Text>
                    <Text style={[styles.resultName, { flex: 1 }]} numberOfLines={1}>
                      {pre}<Text style={styles.resultHit}>{hit}</Text>{post}
                    </Text>
                    <View style={{ width: 96, gap: 1 }}>
                      <Text style={styles.resultSatuan} numberOfLines={1}>{r.satuan.map((x) => x.nama).join(' · ')}</Text>
                      {r.satuan.length > 1 && <Text style={styles.resultSatuanHint}>masuk sebagai {sa.nama}</Text>}
                    </View>
                    <View style={{ width: 76, gap: 1 }}>
                      <Text style={low ? styles.resultStockLow : styles.resultStockOk}>{inDef} {sa.nama}</Text>
                      <Text style={styles.resultStockBase}>{sa.faktor > 1 ? `${r.stok} dasar` : ''}</Text>
                    </View>
                    <View style={{ width: 96, alignItems: 'flex-end', gap: 1 }}>
                      <Text style={styles.resultPrice}>{rp(sa.harga ?? 0)}</Text>
                      <Text style={styles.resultUnit}>/ {sa.nama}</Text>
                    </View>
                  </Pressable>
                );
              })}
              {hiddenCount > 0 && (
                <Text style={styles.hiddenLabel}>{hiddenCount} barang disembunyikan — belum punya harga jual berlaku hari ini</Text>
              )}
            </ScrollView>
          </View>

          {overlayEditing && <Pressable style={StyleSheet.absoluteFill} onPress={commit} />}
        </View>

        {/* Section 3 — display / payment / keypad */}
        <View style={styles.zoneSection}>
          <View style={styles.zoneHead}>
            <View style={{ gap: 3, minWidth: 0, flexShrink: 1 }}>
              <Text style={styles.modeLabel}>{kreditMode ? 'NOTA KREDIT' : MODE_LABELS[state.mode]}</Text>
              {state.editing && state.mode !== 'bayar' && <Text style={styles.editingHint}>Tap di luar keypad untuk terapkan</Text>}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              {state.mode === 'bulat' && !PEMBULATAN_OTOMATIS && (
                <Pressable onPress={() => patch((s) => ({ bulatSign: (s.bulatSign * -1) as 1 | -1 }))} style={styles.signBtn}>
                  <Text style={styles.signBtnText}>{state.bulatSign < 0 ? '−' : '+'}</Text>
                </Pressable>
              )}
              <Text style={styles.displayValue}>{kreditMode ? rp(t.total) : (state.buffer || '0')}</Text>
            </View>
          </View>

          {payMode && (
            <View style={styles.payWrap}>
              <View style={styles.jenisRow}>
                {(KREDIT_ENABLED ? (['TUNAI', 'KREDIT'] as Jenis[]) : (['TUNAI'] as Jenis[])).map((j) => {
                  const active = state.jenis === j;
                  return (
                    <Pressable key={j} onPress={() => patch((s) => ({ jenis: j, buffer: j === 'KREDIT' ? '' : s.buffer }))} style={styles.jenisBtn}>
                      {active && <View style={styles.jenisBtnActiveTint} pointerEvents="none" />}
                      <Text style={styles.jenisBtnText}>{j}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {tunaiMode && (
                <View style={{ gap: 8 }}>
                  <View style={styles.kembalianRow}>
                    <Text style={styles.kembalianLabel}>Kembalian</Text>
                    <Text style={styles.kembalianValue}>{rp(Math.max(0, (paid || 0) - t.total))}</Text>
                  </View>
                  <View style={styles.quickCashGrid}>
                    {[{ label: 'Uang pas', v: Math.round(t.total) }, { label: '20rb', v: 20000 }, { label: '50rb', v: 50000 }, { label: '100rb', v: 100000 }, { label: '150rb', v: 150000 }, { label: '200rb', v: 200000 }].map((qc) => (
                      <Pressable key={qc.label} onPress={() => patch({ buffer: String(qc.v) })} style={styles.quickCashBtn}>
                        <Text style={styles.quickCashText}>{qc.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {kreditMode && (
                <View style={{ gap: 8 }}>
                  <View style={styles.kreditCustRow}>
                    <View style={{ minWidth: 0, gap: 2 }}>
                      <Text style={styles.kreditCustLabel}>Pelanggan</Text>
                      <Text style={styles.kreditCustName} numberOfLines={1}>{state.pelanggan ? state.pelanggan.nama : 'Belum dipilih'}</Text>
                    </View>
                    <Pressable onPress={() => patch({ custOpen: true })} style={styles.kreditCustBtn}>
                      <Text style={styles.kreditCustBtnText}>{state.pelanggan ? 'Ganti' : 'Pilih'}</Text>
                    </Pressable>
                  </View>
                  {!state.pelanggan && <Text style={styles.kreditWarn}>Nota KREDIT wajib punya pelanggan sebelum diposting.</Text>}
                  <View style={styles.kreditStatusRow}>
                    <Text style={styles.kreditStatusLabel}>Status setelah posting</Text>
                    <Text style={styles.kreditStatusValue}>BELUM · jadi piutang</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={styles.keypadZone}>
            {!!state.pin && (
              <View style={styles.pinCard}>
                <View>
                  <Text style={styles.pinTitle}>PIN supervisor</Text>
                  <Text style={styles.pinReason}>{state.pin}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={styles.pinDot}>
                      <Text style={styles.pinDotText}>{state.pinBuf.length > i ? '•' : ''}</Text>
                    </View>
                  ))}
                  <Pressable onPress={() => patch({ pin: null, pinBuf: '' })} style={styles.pinCancelBtn}>
                    <Text style={styles.pinCancelText}>Batal</Text>
                  </Pressable>
                </View>
                <Text style={styles.pinHint}>Ketik 4 digit di keypad di bawah · demo: 1234</Text>
              </View>
            )}

            {normalMode && <NumpadGrid big onDigit={press} onZeros={() => press(state.mode === 'bayar' ? '000' : '00')} onBack={back} />}
            {tunaiMode && <NumpadGrid big={false} onDigit={press} onZeros={() => press('000')} onBack={back} />}

            {showActions && (
              <>
                <View style={styles.actionsGrid}>
                  <ActionBtn label="Qty" hint="F2" active={state.mode === 'qty'} onPress={() => setMode('qty')} />
                  <ActionBtn label="Harga" hint="F3" active={state.mode === 'harga'} onPress={() => setMode('harga')} />
                  <ActionBtn label="Disk. baris" hint="F4" active={state.mode === 'diskon'} onPress={() => setMode('diskon')} />
                  <ActionBtn label="Disk. nota" hint="F7" active={state.mode === 'disknota'} onPress={() => setMode('disknota')} />
                  <ActionBtn
                    label="Pembulatan" hint="F8" active={state.mode === 'bulat' && !PEMBULATAN_OTOMATIS}
                    onPress={() => { if (PEMBULATAN_OTOMATIS) { showToast('Pembulatan otomatis aktif'); return; } setMode('bulat'); }}
                  />
                  <Pressable onPress={removeActive} style={styles.plainActionBtn}>
                    <Text style={styles.plainActionText}>Hapus <Text style={styles.plainActionHintDanger}>Del</Text></Text>
                  </Pressable>
                  <Pressable onPress={hold} style={styles.plainActionBtn}>
                    <Text style={styles.plainActionText}>Tahan <Text style={styles.plainActionHint}>F5</Text></Text>
                  </Pressable>
                  <Pressable onPress={() => askPin('Buka laci di luar transaksi')} style={styles.plainActionBtn}>
                    <Text style={styles.plainActionText}>Laci <Text style={styles.plainActionHint}>F6</Text></Text>
                  </Pressable>
                  <Pressable onPress={() => patch({ custOpen: true })} style={styles.plainActionBtn}>
                    <Text style={styles.plainActionText}>Pelanggan</Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={pay}
                  disabled={state.cart.length === 0}
                  style={[styles.payBtn, { backgroundColor: state.cart.length ? K.primary : K.disabled }]}>
                  <Text style={styles.payBtnText}>BAYAR <Text style={styles.payBtnHint}>F12</Text></Text>
                </Pressable>
              </>
            )}

            {payMode && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => patch({ mode: 'qty', buffer: '' })} style={styles.cancelPayBtn}>
                  <Text style={styles.cancelPayText}>Batal</Text>
                </Pressable>
                <Pressable
                  onPress={finish}
                  style={[styles.finishBtn, { backgroundColor: kreditMode && !state.pelanggan ? K.disabled : K.primary }]}>
                  <Text style={styles.finishBtnText}>{kreditMode ? 'POSTING KREDIT' : 'SELESAI'}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>

      {state.toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{state.toast.msg}</Text>
          {state.toast.undo && (
            <Pressable onPress={undoDelete}>
              <Text style={styles.toastUndo}>Undo</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// ---- small stateless pieces ----

function NewRowFlash() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View pointerEvents="none" style={[styles.flashOverlay, { opacity }]} />;
}

function ActionBtn({ label, hint, active, onPress }: { label: string; hint: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.plainActionBtn}>
      {active && <View style={styles.actionActiveTint} pointerEvents="none" />}
      <Text style={styles.plainActionText}>{label} <Text style={styles.plainActionHint}>{hint}</Text></Text>
    </Pressable>
  );
}

function NumpadGrid({ big, onDigit, onZeros, onBack }: { big: boolean; onDigit: (ch: string) => void; onZeros: () => void; onBack: () => void }) {
  const size = big ? styles.numKeyBig : styles.numKeySmall;
  const textSize = big ? styles.numKeyTextBig : styles.numKeyTextSmall;
  return (
    <View style={styles.numpadGrid}>
      {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => (
        <Pressable key={d} onPress={() => onDigit(d)} style={size}>
          <Text style={textSize}>{d}</Text>
        </Pressable>
      ))}
      <Pressable onPress={() => onDigit('0')} style={size}>
        <Text style={textSize}>0</Text>
      </Pressable>
      <Pressable onPress={onZeros} style={size}>
        <Text style={textSize}>00</Text>
      </Pressable>
      <Pressable onPress={onBack} style={[size, styles.numKeyBack]}>
        <Text style={textSize}>⌫</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: K.bg },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, backgroundColor: K.card, borderBottomWidth: 1, borderBottomColor: K.borderCard },
  cashierName: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: K.text },
  shiftText: { fontSize: 12.5, color: K.muted3 },
  ruangBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, minHeight: 32, paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#F1F3F6', borderWidth: 1, borderColor: K.borderCard },
  lockIcon: { width: 9, height: 8, borderWidth: 1.5, borderColor: K.muted3, borderRadius: 2, borderTopWidth: 0 },
  ruangText: { fontSize: 12.5, fontWeight: '500', color: K.dark2 },
  lockedText: { fontSize: 11.5, color: K.muted },
  parkedBtn: { paddingVertical: 6, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#F1F3F6', borderWidth: 1, borderColor: K.borderCard },
  parkedCount: { minWidth: 20, paddingVertical: 2, minHeight: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderRadius: 6, backgroundColor: K.text },
  parkedCountText: { fontSize: 11.5, fontWeight: '600', color: '#fff' },
  parkedLabel: { fontSize: 13, fontWeight: '500', color: K.text },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: K.amberBg, borderWidth: 1, borderColor: K.amberBorder },
  offlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: K.amberDot },
  offlineText: { fontSize: 12.5, fontWeight: '500', color: K.amberText },
  hamburger: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 8, borderWidth: 1, borderColor: K.borderCard, backgroundColor: '#fff' },
  hamburgerBar: { width: 16, height: 1.5, backgroundColor: K.dark2 },

  // ---- hamburger dropdown (logout / riwayat transaksi) ----
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(16,18,22,0.15)' },
  menuDropdown: {
    position: 'absolute', top: 64, right: 16, width: 260, zIndex: 30,
    backgroundColor: K.card, borderRadius: 12, borderWidth: 1, borderColor: K.borderCard,
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16,
    paddingVertical: 6,
  },
  menuItem: { paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
  menuItemText: { fontSize: 14.5, fontWeight: '600', color: K.text },
  menuItemHint: { fontSize: 12, color: K.muted3 },
  menuDivider: { height: 1, backgroundColor: K.borderLight, marginVertical: 4 },

  // ---- transaksi hari ini overlay ----
  historyOverlay: {
    position: 'absolute', top: 56, left: 0, right: 0, bottom: 0, zIndex: 25,
    backgroundColor: K.card,
  },
  historyHead: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: K.borderCard,
  },
  historyTitle: { fontSize: 15.5, fontWeight: '600', color: K.text },
  historyCount: { fontSize: 12.5, color: K.muted3 },
  overlayCloseBtn: { fontSize: 13, fontWeight: '600', color: K.primary },
  historyEmpty: { padding: 40, alignItems: 'center' },
  historyEmptyTitle: { fontSize: 14.5, fontWeight: '500', color: K.dark2 },
  historyEmptySub: { marginTop: 6, fontSize: 13, color: K.muted2, textAlign: 'center', lineHeight: 19 },
  historyRowWrap: { borderBottomWidth: 1, borderBottomColor: K.borderLighter },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  historyTime: { minWidth: 46, fontSize: 13, color: K.muted3 },
  historyNota: { fontFamily: 'monospace', fontSize: 12.5, fontWeight: '600', color: K.text },
  historySub: { fontSize: 12.5, color: K.muted3, marginTop: 2 },
  historyJenisBadge: { paddingVertical: 3, minHeight: 22, paddingHorizontal: 8, borderRadius: 6, backgroundColor: K.primaryTintSoft, alignItems: 'center', justifyContent: 'center' },
  historyJenisText: { fontSize: 11, fontWeight: '600', color: K.primaryDark },
  historyTotal: { minWidth: 110, textAlign: 'right', fontSize: 14.5, fontWeight: '600', color: K.text },
  historyDetail: { paddingHorizontal: 16, paddingBottom: 14, paddingLeft: 58, gap: 6, backgroundColor: K.rowBg },
  historyItemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  historyItemName: { flex: 1, fontSize: 13, color: K.dark2 },
  historyItemPrice: { fontSize: 13, fontWeight: '500', color: K.dark2 },
  historyReturBtn: { marginTop: 6, minHeight: 36, borderRadius: 8, borderWidth: 1, borderColor: K.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  historyReturText: { fontSize: 12.5, fontWeight: '600', color: K.primary },

  // ---- pilih printer overlay (Bluetooth / USB) ----
  printerStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: K.rowBg, borderBottomWidth: 1, borderBottomColor: K.borderLight,
  },
  printerStatusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: K.muted },
  printerStatusDotOn: { backgroundColor: K.primary },
  printerStatusText: { fontSize: 14, fontWeight: '600', color: K.text },
  printerStatusSub: { marginTop: 2, fontSize: 12.5, color: K.muted3 },
  printerDisconnectBtn: { paddingVertical: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: K.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  printerDisconnectText: { fontSize: 12.5, fontWeight: '600', color: K.red },
  printerTabs: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: K.borderLight },
  printerTab: { position: 'relative', paddingVertical: 7, minHeight: 34, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: K.borderCard, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  printerTabActiveTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8, backgroundColor: K.primaryTint, borderWidth: 1.5, borderColor: K.primary },
  printerTabText: { fontSize: 13, fontWeight: '500', color: K.dark2 },
  printerTabTextActive: { fontWeight: '600', color: K.primaryDark },
  printerScanBtn: { paddingVertical: 7, minHeight: 34, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: K.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  printerScanText: { fontSize: 12.5, fontWeight: '600', color: K.primary },
  printerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: K.borderLighter },
  printerName: { fontSize: 14.5, fontWeight: '500', color: K.text },
  printerSub: { marginTop: 2, fontFamily: 'monospace', fontSize: 12, color: K.muted3 },
  printerConnectBtn: { paddingVertical: 7, minHeight: 34, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: K.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  printerConnectText: { fontSize: 12.5, fontWeight: '600', color: K.primary },
  printerConnectedBadge: { paddingVertical: 4, minHeight: 26, paddingHorizontal: 10, borderRadius: 6, backgroundColor: K.primaryTintSoft, alignItems: 'center', justifyContent: 'center' },
  printerConnectedText: { fontSize: 11.5, fontWeight: '600', color: K.primaryDark },
  printerLoadingText: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 13, color: K.muted2 },
  printerTestBtn: { paddingVertical: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: K.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  printerTestText: { fontSize: 12.5, fontWeight: '600', color: K.primary },
  printerPaperLabel: { fontSize: 12, color: K.muted3 },
  printerSettingsBtn: { marginTop: 16, minHeight: 38, paddingHorizontal: 16, borderRadius: 9, borderWidth: 1, borderColor: K.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  printerSettingsText: { fontSize: 13, fontWeight: '600', color: K.primary },
  printerErrorBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: K.redBg, borderBottomWidth: 1, borderBottomColor: K.borderLight },
  printerErrorText: { fontSize: 12.5, color: K.red, lineHeight: 18 },

  main: { flex: 1, flexDirection: 'row', gap: 1, backgroundColor: K.borderCard },
  leftMiddleWrap: { flex: 1, flexDirection: 'row', gap: 1, position: 'relative' },

  // ---- cart section ----
  cartSection: { width: '34%', minWidth: 380, backgroundColor: K.card, position: 'relative' },
  cartHead: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: K.borderLight, gap: 8 },
  notaText: { fontFamily: 'monospace', fontSize: 12, fontWeight: '600' },
  draftText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, color: K.muted2 },
  itemCountText: { fontSize: 12, color: K.muted3 },
  custBtn: { paddingVertical: 5, minHeight: 30, maxWidth: 150, paddingHorizontal: 11, borderRadius: 7, borderWidth: 1, borderColor: K.borderCard, justifyContent: 'center' },
  custBtnText: { fontSize: 12.5, fontWeight: '500', color: K.dark2 },
  cartEmpty: { padding: 28, paddingTop: 56, alignItems: 'center' },
  cartEmptyTitle: { fontSize: 14.5, fontWeight: '500', color: K.dark2, textAlign: 'center' },
  cartEmptySub: { marginTop: 6, fontSize: 13, color: K.muted2, textAlign: 'center', lineHeight: 19 },
  mono: { fontFamily: 'monospace', fontSize: 12.5 },
  cartEmptyBtn: { marginTop: 22, minHeight: 40, paddingHorizontal: 16, borderRadius: 9, borderWidth: 1, borderColor: K.borderCard, backgroundColor: '#F7F8FA', alignItems: 'center', justifyContent: 'center' },
  cartEmptyBtnText: { fontSize: 13, fontWeight: '500', color: K.dark2 },
  cartRowWrap: { borderBottomWidth: 1, borderBottomColor: K.borderLighter },
  cartRow: { position: 'relative', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  cartRowActiveTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: K.primaryTintSoft, borderLeftWidth: 3, borderLeftColor: K.primary },
  flashOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: K.primary },
  qtyBtn: { flexShrink: 0, width: 52, minHeight: 40, borderRadius: 8, backgroundColor: '#F1F3F6', borderWidth: 1, borderColor: K.rowBorder, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 15, fontWeight: '600', color: K.text },
  qtyBtnEditing: { position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: 8, backgroundColor: '#fff', borderWidth: 2, borderColor: K.primary, alignItems: 'center', justifyContent: 'center' },
  qtyBtnEditingText: { fontSize: 15, fontWeight: '600', color: K.primaryDark },
  rowName: { fontSize: 15, fontWeight: '500', color: K.text },
  rowNote: { fontSize: 12, color: K.muted3, marginTop: 2 },
  rowStockWarn: { fontSize: 12, fontWeight: '500', color: K.red, marginTop: 2 },
  satuanBtn: { flexShrink: 0, paddingVertical: 6, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8, borderWidth: 1, borderColor: K.rowBorder, backgroundColor: K.rowBg, paddingHorizontal: 8 },
  satuanBtnText: { fontSize: 12.5, fontWeight: '500', color: K.dark2 },
  satuanArrow: { fontSize: 9, color: K.muted },
  rowSubtotal: { fontSize: 14.5, fontWeight: '600', color: K.text },
  rowPrice: { fontSize: 11.5, color: K.muted2, marginTop: 1 },
  satuanChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 12, paddingLeft: 66, backgroundColor: K.rowBg },
  satuanChip: { position: 'relative', paddingVertical: 7, minHeight: 38, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: K.border, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'baseline', gap: 7, justifyContent: 'center' },
  satuanChipActiveTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 9, backgroundColor: K.primaryTint, borderWidth: 1.5, borderColor: K.primary },
  satuanChipLabel: { fontSize: 13, fontWeight: '600', color: K.text },
  satuanChipPrice: { fontSize: 11.5, color: K.muted3 },
  satuanChipsHint: { alignSelf: 'center', fontSize: 11.5, color: K.muted },
  cartFooter: { padding: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: K.borderCard, backgroundColor: K.rowBg },
  footRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footLabel: { fontSize: 13, color: K.muted3 },
  footValue: { fontSize: 13, color: K.muted3 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: K.borderLight },
  totalLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.6, color: K.dark2 },
  totalValue: { fontSize: 38, fontWeight: '600', letterSpacing: -0.3, color: K.text },

  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.98)' },
  overlayHead: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: K.borderLight },
  overlayTitle: { fontSize: 13.5, fontWeight: '600', color: K.text },
  overlayClose: { fontSize: 12.5, fontWeight: '600', color: K.primary },
  custRow: { position: 'relative', minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: K.borderLighter },
  custRowActiveTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: K.primaryTintSoft, borderLeftWidth: 3, borderLeftColor: K.primary },
  custName: { fontSize: 14.5, fontWeight: '500', color: K.text },
  custSub: { fontSize: 12, color: K.muted3 },
  custPiutang: { fontSize: 12.5, color: K.muted2 },
  overlayFoot: { padding: 14, borderTopWidth: 1, borderTopColor: K.borderLight, fontSize: 12, color: K.muted2, lineHeight: 18 },

  doneOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.97)', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  doneLabel: { fontSize: 14, fontWeight: '500', letterSpacing: 0.6, color: K.muted3 },
  doneAmount: { fontSize: 56, fontWeight: '600', letterSpacing: -0.4, color: K.primary },
  doneSub: { fontSize: 13, color: K.muted2, textAlign: 'center' },

  // ---- middle section (search + tiles + results) ----
  middleSection: { flex: 1, minWidth: 460, backgroundColor: K.card },
  searchWrap: { padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: K.borderLight },
  searchInputWrap: { position: 'relative', justifyContent: 'center' },
  searchIconCircle: { position: 'absolute', left: 14, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: K.muted, zIndex: 1 },
  searchIconHandle: { position: 'absolute', left: 27, top: 26, width: 8, height: 2, backgroundColor: K.muted, transform: [{ rotate: '45deg' }], zIndex: 1 },
  searchInput: { width: '100%', minHeight: 52, paddingLeft: 40, paddingRight: 60, borderRadius: 10, borderWidth: 1, borderColor: K.border, backgroundColor: '#F8F9FB', fontSize: 15, fontWeight: '500', color: K.text },
  focusLabel: { position: 'absolute', right: 14, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, color: K.primary },
  errorText: { marginTop: 8, fontSize: 13, fontWeight: '500', color: K.red },
  tilesWrap: { padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: K.borderLight },
  tilesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  tilesLabel: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.9, color: K.muted2 },
  tilesHint: { fontSize: 11.5, color: K.muted },
  tilesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tileBtn: { width: '23%', minWidth: 110, minHeight: 64, justifyContent: 'center', gap: 3, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: K.rowBorder, backgroundColor: K.rowBg },
  tileName: { fontSize: 13.5, fontWeight: '600', color: K.text, lineHeight: 16 },
  tilePrice: { fontSize: 11.5, color: K.muted3 },
  resultsHeadRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 6, minHeight: 30, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: K.borderLight, backgroundColor: K.rowBg },
  resultsHeadText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, color: K.muted },
  resultRow: { minHeight: 52, flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: K.borderLighter },
  resultCode: { fontFamily: 'monospace', fontSize: 12, color: K.dark2 },
  resultName: { fontSize: 14.5, lineHeight: 18, color: K.text },
  resultHit: { fontWeight: '600', color: K.primaryDark },
  resultSatuan: { fontSize: 12.5, color: K.dark2 },
  resultSatuanHint: { fontSize: 11, color: K.muted },
  resultStockLow: { fontSize: 12.5, fontWeight: '600', color: K.red },
  resultStockOk: { fontSize: 12.5, color: K.dark2 },
  resultStockBase: { fontSize: 11, color: K.muted },
  resultPrice: { fontSize: 14, fontWeight: '600', color: K.text },
  resultUnit: { fontSize: 11, color: K.muted },
  hiddenLabel: { padding: 11, paddingHorizontal: 14, fontSize: 12, color: K.muted },

  // ---- zone section (display + payment + keypad) ----
  zoneSection: { width: 364, backgroundColor: '#F7F8FA' },
  zoneHead: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, backgroundColor: K.card, borderBottomWidth: 1, borderBottomColor: K.borderCard },
  modeLabel: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.9, color: K.muted2 },
  editingHint: { fontSize: 11, fontWeight: '500', color: K.primary },
  signBtn: { width: 38, minHeight: 38, borderRadius: 9, borderWidth: 1, borderColor: K.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  signBtnText: { fontSize: 17, fontWeight: '600', color: K.text },
  displayValue: { fontSize: 34, fontWeight: '600', letterSpacing: -0.3, color: K.text },

  payWrap: { padding: 12, paddingBottom: 0, gap: 8 },
  jenisRow: { flexDirection: 'row', gap: 6 },
  jenisBtn: { position: 'relative', flex: 1, minHeight: 40, borderRadius: 9, backgroundColor: '#fff', borderWidth: 1, borderColor: K.border, alignItems: 'center', justifyContent: 'center' },
  jenisBtnActiveTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 9, backgroundColor: K.primaryTint, borderWidth: 1.5, borderColor: K.primary },
  jenisBtnText: { fontSize: 13, fontWeight: '600', color: K.dark2 },
  kembalianRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: K.borderCard },
  kembalianLabel: { fontSize: 12.5, color: K.muted3 },
  kembalianValue: { fontSize: 24, fontWeight: '600', letterSpacing: -0.3, color: K.primary },
  quickCashGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickCashBtn: { width: '31.3%', minHeight: 44, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: K.border, alignItems: 'center', justifyContent: 'center' },
  quickCashText: { fontSize: 13.5, fontWeight: '600', color: K.text },
  kreditCustRow: { padding: 11, paddingHorizontal: 13, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: K.borderCard, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  kreditCustLabel: { fontSize: 11.5, color: K.muted2 },
  kreditCustName: { fontSize: 14.5, fontWeight: '600', color: K.text },
  kreditCustBtn: { paddingVertical: 6, minHeight: 34, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: K.border, alignItems: 'center', justifyContent: 'center' },
  kreditCustBtnText: { fontSize: 12.5, fontWeight: '600', color: K.primary },
  kreditWarn: { fontSize: 12.5, fontWeight: '500', color: K.red, lineHeight: 18 },
  kreditStatusRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: K.borderCard },
  kreditStatusLabel: { fontSize: 12.5, color: K.muted3 },
  kreditStatusValue: { fontSize: 12.5, fontWeight: '600', color: K.amberText },

  keypadZone: { flex: 1, justifyContent: 'flex-end', gap: 8, padding: 12 },
  pinCard: { padding: 13, borderRadius: 11, backgroundColor: '#fff', borderWidth: 1.5, borderColor: K.text, gap: 11 },
  pinTitle: { fontSize: 14.5, fontWeight: '600', color: K.text },
  pinReason: { fontSize: 12.5, color: K.muted3, marginTop: 3 },
  pinDot: { width: 44, height: 52, borderRadius: 9, backgroundColor: '#F7F8FA', borderWidth: 1, borderColor: K.border, alignItems: 'center', justifyContent: 'center' },
  pinDotText: { fontSize: 22, fontWeight: '600', color: K.text },
  pinCancelBtn: { flex: 1, minHeight: 52, borderRadius: 9, backgroundColor: '#F1F3F6', borderWidth: 1, borderColor: K.border, alignItems: 'center', justifyContent: 'center' },
  pinCancelText: { fontSize: 13, fontWeight: '600', color: K.dark2 },
  pinHint: { fontSize: 12, color: K.muted2 },

  numpadGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  numKeyBig: { width: '31.3%', minHeight: 78, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: K.border, alignItems: 'center', justifyContent: 'center' },
  numKeySmall: { width: '31.3%', minHeight: 60, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: K.border, alignItems: 'center', justifyContent: 'center' },
  numKeyBack: { backgroundColor: '#EFF1F4' },
  numKeyTextBig: { fontSize: 26, fontWeight: '500', color: K.text },
  numKeyTextSmall: { fontSize: 19, fontWeight: '500', color: K.text },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  plainActionBtn: { position: 'relative', width: '31.3%', minHeight: 52, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: K.border, alignItems: 'center', justifyContent: 'center' },
  actionActiveTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10, backgroundColor: K.primaryTint, borderWidth: 1.5, borderColor: K.primary },
  plainActionText: { fontSize: 13.5, fontWeight: '600', color: K.text },
  plainActionHint: { fontSize: 10.5, fontWeight: '500', color: K.muted2 },
  plainActionHintDanger: { fontSize: 10.5, fontWeight: '500', color: '#B08A88' },

  payBtn: { minHeight: 84, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  payBtnText: { fontSize: 21, fontWeight: '600', letterSpacing: 0.4, color: '#fff' },
  payBtnHint: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.75)' },

  cancelPayBtn: { flex: 1, minHeight: 84, borderRadius: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: K.border, alignItems: 'center', justifyContent: 'center' },
  cancelPayText: { fontSize: 15, fontWeight: '600', color: K.dark2 },
  finishBtn: { flex: 2, minHeight: 84, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  finishBtnText: { fontSize: 20, fontWeight: '600', letterSpacing: 0.4, color: '#fff' },

  // zIndex di atas overlay riwayat/printer (25) — tanpa ini toast dari dalam
  // overlay itu tertutup dan tidak pernah kelihatan.
  toast: { position: 'absolute', left: 18, bottom: 18, zIndex: 40, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 11, backgroundColor: K.toastBg, maxWidth: 420 },
  toastText: { fontSize: 13.5, fontWeight: '500', color: '#fff' },
  toastUndo: { fontSize: 13, fontWeight: '600', color: '#8FB6E4' },
});
