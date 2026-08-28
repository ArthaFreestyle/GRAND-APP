// @point-of-sale/receipt-printer-encoder v3 tidak mengirim typing sendiri.
// Deklarasi ini hanya mencakup opsi & perintah yang dipakai app ini
// (lihat services/receipt.ts) — tambahkan seperlunya, jangan salin seluruh API.
declare module '@point-of-sale/receipt-printer-encoder' {
  export interface ReceiptPrinterEncoderOptions {
    language?: 'esc-pos' | 'star-prnt' | 'star-line';
    columns?: number;
    printerModel?: string;
    feedBeforeCut?: number;
    newline?: string;
    imageMode?: 'column' | 'raster';
  }

  export interface TableColumn {
    width: number;
    marginLeft?: number;
    marginRight?: number;
    align?: 'left' | 'right';
    verticalAlign?: 'top' | 'bottom';
  }
  export type TableCell = string | ((encoder: ReceiptPrinterEncoder) => void);

  export interface RuleOptions {
    style?: 'single' | 'double';
    width?: number;
  }

  export default class ReceiptPrinterEncoder {
    constructor(options?: ReceiptPrinterEncoderOptions);
    initialize(): this;
    codepage(codepage: string): this;
    text(value: string): this;
    line(value: string): this;
    newline(lines?: number): this;
    align(alignment: 'left' | 'center' | 'right'): this;
    bold(force?: boolean): this;
    underline(force?: boolean): this;
    invert(force?: boolean): this;
    width(multiplier: number): this;
    height(multiplier: number): this;
    size(width: number, height?: number): this;
    rule(options?: RuleOptions): this;
    table(columns: TableColumn[], rows: TableCell[][]): this;
    pulse(device?: number, duration?: number, delay?: number): this;
    raw(bytes: number[] | Uint8Array): this;
    cut(type?: 'partial' | 'full'): this;
    /** Semua byte yang harus dikirim ke printer. */
    encode(): Uint8Array;
  }
}
