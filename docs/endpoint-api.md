# Endpoint API yang masih kurang

Daftar kebutuhan aplikasi yang **belum bisa dilayani** oleh `contracts/openapi.yaml`. Isinya
dikumpulkan dari catatan di kode (`app/`, `components/`, `services/`) dan dicek ke daftar path
kontrak.

Aplikasi sengaja tidak memalsukan kekurangan ini di sisi klien. Kontrol yang tidak punya endpoint
tidak digambar, atau digambar dengan penjelasan.

Semua path diawali `/api/v1`. Nama field dan parameter di bawah hanya **usulan**; bentuk akhirnya
diputuskan tim backend.

**Prioritas** adalah usulan dari sisi aplikasi:
- **Tinggi:** layar sudah ada tapi terhambat atau boros request.
- **Sedang:** fitur yang digambar desain tapi saat ini dihilangkan.
- **Rendah:** fitur baru.

## Ringkasan

| # | Kebutuhan | Usulan | Jenis | Prioritas |
|---|---|---|---|---|
| 1 | Saldo beberapa produk sekaligus | `GET /product/stok?id_product=…&id_ruang=` | Endpoint baru | Tinggi |
| 2 | Daftar pemohon untuk INVENTARIS | `GET /user/ringkas` | Endpoint baru | Tinggi |
| 3 | Total utang semua pemasok | `total_utang` di `GET /supplier` + `sort` | Perubahan | Tinggi |
| 4 | Kode dibuat server | `kode` otomatis di create unit kerja, ruang, supplier, pelanggan | Perubahan | Tinggi |
| 5 | Urutkan list | Parameter `sort` di `GET /product` dan `GET /pos/product` | Perubahan | Sedang |
| 6 | Stok minimum di katalog | Field `stok_minimum` di `PosProduct` | Perubahan | Sedang |
| 7 | Gudang tujuan mutasi di unit lain | `GET /ruang?cakupan=tujuan-mutasi` | Perubahan | Sedang |
| 8 | Cetak nota | `GET /pembelian/{id}/cetak`, `GET /penjualan/{id}/cetak` | Endpoint baru | Sedang |
| 9 | Saldo baru setelah posting | `stok_akhir` per baris di respons `posting` | Perubahan | Sedang |
| 10 | Isi baris faktur dari foto | `POST /ocr/faktur` | Endpoint baru | Rendah |
| 11 | Notifikasi | `GET /notifikasi`, `POST /notifikasi/{id}/baca` | Endpoint baru | Rendah |
| 12 | Tingkat harga jual | Tier di `harga-jual` + parameter `tier` di `GET /pos/product` | Perubahan besar | Rendah |
| 13 | Perbandingan periode | `pembanding` di `GET /laporan/laba-kotor` | Perubahan | Rendah |
| 14 | Saran jumlah beli | `saran_beli` di `GET /product/stok-minimum` | Perubahan | Rendah |

~~15. Skor kesehatan stok — `GET /laporan/kesehatan-stok`~~ — **dipenuhi (issue #37).** Beranda
membacanya lewat `laporanKesehatanStok()` di `services/laporan.ts`; lihat catatan di kepala
`app/(admin)/beranda.tsx`.

---

## 1. Saldo beberapa produk sekaligus

```
GET /product/stok?id_ruang=3&id_product=12,15,40
→ [{ id_product, id_ruang, stok_akhir, nama_satuan_dasar, satuan: [{ id_satuan, nama_satuan, faktor }] }]
```

- **Kenapa kurang:**
  - `GET /product/{id}/stok` hanya menjawab satu produk.
  - `GET /pos/product` tidak bisa difilter berdasarkan daftar id.
- **Dampak sekarang:** editor baris mutasi dan pemakaian (`components/shell/baris-barang.tsx`)
  membaca saldo dengan satu `GET /pos/product?search=<kode>` **per produk**.
  - Dokumen berisi 30 produk berarti 30 request setiap editor dibuka.
  - Semua saldo dibaca ulang setiap kali gudang diganti.
- **Dipakai di:** Mutasi dan Pemakaian (ubah baris), serta layar "Selesai" penerimaan susulan
  (lihat #9).

## 2. Daftar pemohon yang boleh dibaca INVENTARIS

```
GET /user/ringkas?search=&page=&size=
→ [{ id, nama }]        // tanpa email, grant, audit
```

- **Kenapa kurang:** `GET /user` khusus **SUPERADMIN, termasuk membaca**. Padahal
  `POST /pemakaian` butuh `id_pemohon`, dan kontrak sendiri menyebut staf administrasi boleh
  mengetik permintaan atas nama orang lain.
- **Dampak sekarang:** INVENTARIS hanya bisa mengajukan atas nama dirinya sendiri; kolom pemohon
  terkunci. Hanya SUPERADMIN yang bisa memilih pemohon lain.
- **Dipakai di:** `app/pemakaian/baru.tsx`.

## 3. Total utang lintas pemasok

```
GET /supplier?sort=-total_utang
→ Supplier + { total_utang, jumlah_faktur_terbuka, jatuh_tempo_terdekat }
```

Alternatifnya endpoint baru `GET /supplier/utang` yang langsung menjawab peringkat.

- **Kenapa kurang:**
  - `Supplier` tidak membawa total utang.
  - `GET /supplier/{id}/utang` menjawab satu pemasok saja, tanpa total keseluruhan.
- **Dampak sekarang:**
  - **Tile "Utang pemasok":** membuka daftar pemasok biasa, tidak diurutkan dari utang terbesar.
  - **Layar utang satu pemasok:** hanya menjumlahkan faktur yang sudah dimuat, dan diberi
    keterangan begitu.
- **Dipakai di:** Beranda, `app/pemasok/index.tsx?utang=1`, `app/pemasok/[id]/utang.tsx`.

## 4. Kode dibuat oleh server

```
POST /unit-kerja   POST /ruang   POST /supplier   POST /pelanggan
→ server mengisi `kode` bila tidak dikirim (seri per jenis, mis. GDG-0001)
```

- **Kenapa kurang:** `kode` di keempat master itu `nullable` dan tidak dibuat otomatis.
  Sejak issue #27, aplikasi tidak lagi menampilkan isian kode.
- **Dampak sekarang:** data yang dibuat lewat aplikasi tampil "Tanpa kode" di detailnya.
- **Catatan:** `kode_barang` tidak termasuk; itu tetap diketik manusia dan wajib.

## 5. Parameter urut

```
GET /product?sort=nama|-created_at
GET /pos/product?id_ruang=&sort=nama|stok_akhir|-stok_akhir
```

- **Kenapa kurang:** tidak ada parameter `sort` di endpoint list mana pun. Mengurutkan list yang
  dimuat per halaman di klien hanya mengurutkan halaman yang sudah ada, sehingga hasilnya
  menyesatkan.
- **Dampak sekarang:** chip "Urut nama" dari desain Katalog tidak digambar.
- **Dipakai di:** `app/produk/index.tsx`, pemilih barang pembelian.

## 6. `stok_minimum` di `PosProduct`

```
GET /pos/product → tiap baris + { stok_minimum, di_bawah_minimum: boolean }
```

- **Kenapa kurang:** tidak ada satu endpoint yang membawa saldo dan ambang minimum sekaligus.
- **Dampak sekarang:** Katalog membaca dua endpoint (`/pos/product` dan
  `/product/stok-minimum`) lalu mencocokkan id. Pengelompokan "di bawah minimum" hanya
  berlaku untuk halaman yang sudah dimuat.
- **Dipakai di:** `app/produk/index.tsx`, Beranda.

## 7. Gudang tujuan mutasi di unit kerja lain

```
GET /ruang?cakupan=tujuan-mutasi
→ semua ruang aktif di semua unit (id, nama_ruang, nama_unit_kerja, nomor_opname_beku)
```

- **Kenapa kurang:** kontrak **mengizinkan** `id_ruang_tujuan` di unit lain. Tapi `GET /ruang`
  hanya menjawab ruang di unit kerja aktif, kecuali untuk grant global.
- **Dampak sekarang:** pengguna yang terikat satu unit hanya bisa memilih tujuan di unitnya
  sendiri.
- **Dipakai di:** `app/mutasi/baru.tsx`, ubah header di `app/mutasi/[id].tsx`.

## 8. Cetak nota (PDF)

```
GET /pembelian/{id}/cetak   → application/pdf
GET /penjualan/{id}/cetak   → application/pdf
```

- **Kenapa kurang:** tidak ada endpoint yang **menghasilkan** PDF. `/dokumen` hanya menerima
  unggahan, dan `/laporan/*` menjawab JSON.
- **Dampak sekarang:**
  - **Struk kasir:** dicetak dari klien lewat printer Bluetooth.
  - **Nota A4 / dokumen resmi:** belum ada.
- **Dipakai di:** detail pembelian, detail penjualan, Kasir.

## 9. Saldo baru di respons posting

```
POST /{dokumen}/{id}/posting
→ dokumen + tiap baris { stok_akhir_sesudah }
```

Berlaku untuk pembelian, penerimaan-susulan, mutasi (asal dan tujuan), pemakaian, dan penjualan.

- **Kenapa kurang:** respons posting hanya membawa kuantitas dan nilai, bukan saldo hasilnya.
- **Dampak sekarang:** layar F3 "Selesai" di desain, yang menyebut saldo baru, tidak dibangun.
  Sebagai gantinya, tiap baris menaut ke kartu stok.
- **Dipakai di:** `app/penerimaan-susulan/[id].tsx`, dan layar sukses dokumen lain.

## 10. OCR faktur

```
POST /ocr/faktur          body: { id_dokumen: [..] }
→ { id_supplier?, nomor_faktur?, tanggal?, baris: [{ id_product?, nama_terbaca, qty, satuan, harga }] }
```

- **Kenapa kurang:** `POST /ocr/faktur` tidak ada, sehingga `ocr_id` di desain tidak punya
  sumber.
- **Dampak sekarang:** foto faktur tetap diunggah dan ditempel ke nota, tetapi baris faktur
  diketik manual.
- **Dipakai di:** `app/pembelian/baru.tsx` (langkah foto), `services/dokumen.ts`.

## 11. Notifikasi

```
GET  /notifikasi?belum_dibaca=true   → [{ id, jenis, judul, ref_table, ref_id, created_at, dibaca }]
POST /notifikasi/{id}/baca
```

- **Isi yang dibutuhkan:** dokumen menunggu persetujuan, stok di bawah minimum, dan penolakan
  dokumen sendiri.
- **Dampak sekarang:** tombol lonceng di Beranda hanya membuka pesan "belum ada notifikasi".
- **Dipakai di:** `app/(admin)/beranda.tsx`.

## 12. Tingkat harga jual (Umum / Langganan)

```
POST /product/{id}/harga-jual        body + { tier: 'UMUM' | 'LANGGANAN' }
GET  /pos/product?id_ruang=&tier=LANGGANAN
```

- **Kenapa kurang:** `product_harga_jual_no_overlap` menjamin tepat **satu** harga aktif per
  (produk, satuan, tanggal). Butuh perubahan skema, bukan hanya endpoint.
- **Dampak sekarang:** chip "Umum / Langganan" di Kasir tidak digambar. Desain memalsukannya
  dengan diskon 7%.
- **Dipakai di:** `app/(admin)/kasir.tsx`.

## 13. Perbandingan dengan periode sebelumnya

```
GET /laporan/laba-kotor?tanggal_dari=&tanggal_sampai=&pembanding=periode_sebelumnya
→ + { pembanding: { omzet, laba_kotor }, delta_persen }
```

- **Kenapa kurang:** Panduan Gaya §3 mewajibkan delta dihitung terhadap periode yang sama,
  sedangkan tidak ada bacaan yang membawa periode pembanding.
- **Dampak sekarang:** chip delta ("↑ 12%") di metrik Beranda tidak digambar.
- **Dipakai di:** Beranda, Pendapatan.

## 14. Saran jumlah beli

```
GET /product/stok-minimum → tiap baris + { saran_beli, satuan_saran }
```

- **Kenapa kurang:** endpoint hanya membawa selisih terhadap minimum, tanpa saran pembelian
  (misalnya berdasarkan rata-rata keluar atau stok maksimum).
- **Dampak sekarang:** baris dari antrean stok menipis dibuka dengan jumlah sebesar selisihnya.
- **Dipakai di:** `components/pembelian/pilih-barang.tsx`.

