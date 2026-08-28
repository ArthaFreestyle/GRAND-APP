// Penyusun byte struk ESC/POS. Murni JS (tanpa native code) lewat
// @point-of-sale/receipt-printer-encoder — hasilnya Uint8Array yang dikirim
// apa adanya oleh services/bluetooth-printer.ts.

import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

import { num } from '@/constants/theme-erp';

/** Lebar kertas dalam karakter: 32 = 58mm, 48 = 80mm. */
export type PaperColumns = 32 | 48;
export const PAPER_LABEL: Record<PaperColumns, string> = { 32: '58 mm', 48: '80 mm' };
export const PAPER_OPTIONS: PaperColumns[] = [32, 48];

export interface ReceiptLine {
  name: string;
  qty: number;
  unit: string;
  price: number;
  disc: number;
}

export interface ReceiptData {
  nota: string;
  datetime: string;
  kasir: string;
  ruang: string;
  jenis: 'TUNAI' | 'KREDIT';
  pelanggan: string | null;
  items: ReceiptLine[];
  sub: number;
  notaDisc: number;
  bulat: number;
  total: number;
  paid: number;
  change: number;
}

const STORE_NAME = 'GRAND STORE';

function newEncoder(columns: PaperColumns): ReceiptPrinterEncoder {
  const encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns });
  // cp437 adalah codepage yang hampir selalu ada di printer thermal generik;
  // teks struk sengaja dijaga ASCII supaya tidak bergantung pada codepage lain.
  return encoder.initialize().codepage('cp437');
}

/** Kolom [label, nominal] — nominal rata kanan di tepi kertas. */
function moneyColumns(columns: PaperColumns) {
  const money = columns >= 48 ? 12 : 10;
  return [
    { width: columns - money - 1, marginRight: 1, align: 'left' as const },
    { width: money, align: 'right' as const },
  ];
}

export function receiptDateTime(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function encodeReceipt(data: ReceiptData, columns: PaperColumns): Uint8Array {
  const encoder = newEncoder(columns);
  const cols = moneyColumns(columns);

  encoder
    .align('center')
    .bold(true)
    .line(STORE_NAME)
    .bold(false)
    .line(data.ruang)
    .align('left')
    .rule();

  encoder
    .line(data.nota)
    .line(`${data.datetime}  ${data.kasir}`)
    .line(`Pelanggan: ${data.pelanggan ?? 'Umum'}`)
    .line(`Pembayaran: ${data.jenis}`)
    .rule();

  for (const item of data.items) {
    encoder.line(item.name);
    encoder.table(cols, [[`  ${item.qty} ${item.unit} x ${num(item.price)}`, num(item.price * item.qty)]]);
    if (item.disc > 0) encoder.table(cols, [['  Diskon baris', `-${num(item.disc)}`]]);
  }

  encoder.rule();

  const totals: (string | ((e: ReceiptPrinterEncoder) => void))[][] = [['Subtotal', num(data.sub)]];
  if (data.notaDisc > 0) totals.push(['Diskon nota', `-${num(data.notaDisc)}`]);
  if (data.bulat !== 0) totals.push(['Pembulatan', `${data.bulat < 0 ? '-' : ''}${num(Math.abs(data.bulat))}`]);
  totals.push([
    (e) => e.bold().text('TOTAL').bold(),
    (e) => e.bold().text(num(data.total)).bold(),
  ]);
  if (data.jenis === 'TUNAI') {
    totals.push(['Tunai', num(data.paid)], ['Kembali', num(data.change)]);
  } else {
    totals.push(['Piutang', num(data.total)], ['Status', 'BELUM LUNAS']);
  }
  encoder.table(cols, totals);

  return encoder
    .rule()
    .align('center')
    .line('Terima kasih')
    .line('Simpan struk sebagai bukti')
    .align('left')
    // Bukan .cut(): printer 58mm murah hampir semua tanpa auto-cutter, kertas
    // disobek manual — feed beberapa baris supaya baris terakhir keluar casing.
    .newline(5)
    .encode();
}

/** Struk pendek untuk memastikan koneksi & lebar kertas sudah benar. */
export function encodeTestReceipt(printerName: string, columns: PaperColumns): Uint8Array {
  const encoder = newEncoder(columns);
  return encoder
    .align('center')
    .bold(true)
    .line('TES CETAK')
    .bold(false)
    .line(STORE_NAME)
    .align('left')
    .rule()
    .line(`Printer : ${printerName}`)
    .line(`Kertas  : ${PAPER_LABEL[columns]} (${columns} kolom)`)
    .line(`Waktu   : ${receiptDateTime()}`)
    .rule()
    // Penanda lebar: kalau baris ini terpotong, pilihan lebar kertasnya salah.
    .line('1234567890'.repeat(Math.ceil(columns / 10)).slice(0, columns))
    .newline(5)
    .encode();
}
