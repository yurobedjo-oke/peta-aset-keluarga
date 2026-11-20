# Peta Aset Keluarga

Aplikasi web satu berkas untuk membantu keluarga mencatat aset, lokasi dokumen, kontak penting, dan langkah urusan. Tujuannya agar ahli waris tahu apa yang dimiliki dan di mana dokumennya disimpan.

- Satu berkas HTML, tanpa backend, tanpa database server, tanpa library atau CDN.
- Data hanya disimpan di `localStorage` perangkat. Content-Security-Policy berbasis hash (`default-src 'none'`, `connect-src 'none'`) mencegah aplikasi mengirim data ke mana pun.
- Aplikasi menolak nomor rekening atau kartu lengkap, password, PIN, seed phrase, dan kunci privat. Kolom nomor referensi dibatasi 8 karakter.
- Semua data pengguna dirender sebagai text node. Kode aplikasi tidak memakai `innerHTML` (diperiksa oleh tes).

> Aplikasi ini hanya alat pencatatan. Bukan nasihat hukum atau keuangan. Untuk wasiat dan urusan waris, konsultasikan dengan notaris.

## Struktur

```
template.html        Aplikasi (HTML + CSS + JS) tanpa data, berisi penanda build
src/core.js          Fungsi murni: tanggal, CSV, .ics, validasi impor, nomor referensi, hash PIN, dll.
guide.md             Konten menu Panduan (disisipkan saat build)
seed/contoh.json     Data contoh fiktif (setiap entri bertanda "CONTOH")
seed/personal.json   Data pribadi Anda (opsional, TIDAK ikut git)
build.mjs            Skrip build
tests/               Tes node:test (tanpa library tambahan)
scripts/verify.mjs   Verifikasi end-to-end di Chromium headless (opsional, butuh Playwright)
index.html           Hasil build: aplikasi kosong
dist/                Hasil build: personal.html, distribusi.html, sw.js
```

Butuh Node.js 18 atau lebih baru. Tidak ada `npm install`.

## Menjalankan tes

```bash
npm test
```

Perintah di atas sama dengan `node --test tests/*.test.mjs`. Tes mencakup:

- fungsi tanggal jatuh tempo (kabisat, akhir bulan, batas 30/60/90 hari, usulan tanggal baru)
- escape CSV (koma, kutip, baris baru, BOM, netralisasi formula)
- validasi impor JSON (skema, versi, field, id ganda, perlindungan `__proto__`) serta gabung/ganti
- pembuatan berkas .ics (CRLF, escape, pelipatan baris 75 oktet yang aman untuk UTF-8)
- validasi nomor referensi yang disamarkan, deteksi data sensitif, SHA-256, dan hash PIN
- build: CSP cocok dengan hash, tidak ada `innerHTML`/`fetch`/URL eksternal, seed contoh bertanda CONTOH, data pribadi tidak bocor ke build distribusi

Verifikasi di browser headless bersifat opsional. Perintah ini membuka `dist/distribusi.html` dan `index.html`, menjalankan alur utama, dan memastikan tidak ada permintaan jaringan keluar:

```bash
npm run build && npm run verify
```

## Membuat dua build

```bash
npm run build
```

| Berkas | Isi |
|---|---|
| `index.html` | Aplikasi kosong |
| `dist/distribusi.html` | Aplikasi + data contoh fiktif dari `seed/contoh.json`, aman untuk dibagikan |
| `dist/personal.html` | Aplikasi + data dari `seed/personal.json` jika ada; jika tidak ada, aplikasinya kosong |
| `dist/sw.js` | Service worker opsional untuk akses offline saat disajikan lewat http/https |

Build memvalidasi setiap seed dengan validator yang sama dengan fitur impor. Build gagal jika seed tidak valid, atau jika ada entri contoh yang tidak bertanda "CONTOH". Data seed hanya dimuat saat `localStorage` di browser masih kosong; setelah itu data yang tersimpan di perangkat yang dipakai.

Cukup buka berkas HTML langsung di browser (`file://`), tanpa server. Service worker hanya aktif jika berkas disajikan lewat http/https, misalnya dengan `python3 -m http.server` dari folder `dist`.

## Menambahkan data pribadi tanpa ikut terunggah

1. Isi data lewat aplikasi, lalu buka **Ekspor dan Backup → Unduh backup JSON**. Bisa juga menulis JSON dengan format yang sama seperti `seed/contoh.json`.
2. Simpan berkas itu sebagai `seed/personal.json`.
3. Jalankan `npm run build`, lalu gunakan `dist/personal.html`.

`seed/personal.json` dan `dist/personal.html` tercantum di `.gitignore`, sehingga tidak ikut ter-commit. Periksa dengan:

```bash
git check-ignore -v seed/personal.json dist/personal.html
```

Ingat: `dist/personal.html` berisi data Anda dalam bentuk teks biasa. Perlakukan berkas itu seperti dokumen pribadi.

## Catatan keamanan

- PIN (opsional) disimpan sebagai hash SHA-256 bergaram yang diulang 2.000 kali. PIN adalah kunci layar, bukan enkripsi: isi `localStorage` tetap tidak terenkripsi.
- Backup JSON tidak dienkripsi dan tidak menyertakan PIN.
- Riwayat perubahan hanya mencatat nama kolom yang berubah, bukan nilainya.
- Menghapus cache atau data browser juga menghapus data aplikasi. Buat backup secara berkala; aplikasi mengingatkan setiap 30 hari.
