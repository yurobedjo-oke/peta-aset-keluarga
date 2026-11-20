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
- enkripsi AES-GCM/PBKDF2: kembali ke data semula, PIN salah ditolak, amplop yang diubah ditolak, IV dan garam acak
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

## Enkripsi data dengan PIN

Fitur ini opsional. Aktifkan di **Pengaturan → Enkripsi data dengan PIN**.

- Seluruh data di `localStorage` disimpan sebagai amplop terenkripsi **AES-GCM 256-bit**. Kuncinya diturunkan dari PIN atau kata sandi dengan **PBKDF2-SHA-256, 600.000 iterasi**, dan garam acak. Semuanya memakai Web Crypto bawaan browser, tanpa library.
- PIN tidak disimpan di mana pun. Kunci hanya ada di memori selama aplikasi terbuka; tombol "Kunci sekarang" atau memuat ulang halaman akan menghapusnya.
- Setiap penyimpanan memakai IV acak baru. Parameter KDF diikat sebagai *additional data*, sehingga amplop yang diubah akan ditolak.
- PIN minimal 6 karakter. Aplikasi memperingatkan jika PIN lemah (pendek atau hanya angka), karena PIN seperti itu bisa ditebak komputer jika seseorang menyalin data browser. Disarankan 8+ karakter campuran huruf dan angka, atau kalimat pendek.
- Backup JSON dienkripsi dengan PIN yang sama secara default. Versi biasa (tidak terenkripsi) tetap bisa dipilih. Mengimpor backup terenkripsi memerlukan PIN yang dipakai saat backup dibuat.
- **Jika PIN lupa, data tidak bisa dipulihkan.** Pilih "Lupa PIN?" di layar kunci untuk menghapus data, lalu impor backup.

Batasan yang perlu diketahui:

- Ekspor CSV, ringkasan cetak, dan prompt Asisten selalu berupa teks biasa.
- Data yang disisipkan ke `dist/personal.html` saat build juga berupa teks biasa di dalam berkas HTML. Enkripsi hanya berlaku untuk data di browser.
- Enkripsi melindungi data yang tersimpan. Enkripsi tidak melindungi dari orang yang memakai perangkat saat aplikasi sedang terbuka, atau dari perangkat yang sudah terinfeksi malware.

## Catatan keamanan

- Kunci PIN lama dari versi 1.1 (kunci layar tanpa enkripsi, hash SHA-256 bergaram) tetap didukung, dan bisa diganti dengan enkripsi dari Pengaturan.
- PIN tidak pernah ikut diekspor.
- Riwayat perubahan hanya mencatat nama kolom yang berubah, bukan nilainya.
- Menghapus cache atau data browser juga menghapus data aplikasi. Buat backup secara berkala; aplikasi mengingatkan setiap 30 hari.
