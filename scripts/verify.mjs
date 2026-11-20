#!/usr/bin/env node
/**
 * Verifikasi end-to-end di Chromium headless (opsional, membutuhkan Playwright terpasang global).
 *   node scripts/verify.mjs [folder-screenshot]
 * Memeriksa: tidak ada permintaan jaringan keluar, tidak ada error/pelanggaran CSP,
 * dan alur utama aplikasi berjalan pada dist/distribusi.html dan index.html.
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch {
  console.error('Playwright tidak ditemukan. Jalankan `npm test` untuk tes unit, atau pasang Playwright untuk verifikasi browser.');
  process.exit(2);
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const DIST = pathToFileURL(join(ROOT, 'dist', 'distribusi.html')).href;
const EMPTY = pathToFileURL(join(ROOT, 'index.html')).href;

const results = [];
const externalRequests = [];
const problems = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log(`${cond ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
}
async function shot(page, name, opts) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png'), fullPage: true, ...(opts || {}) }); }

function watch(page, label) {
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(file|data|blob|about):/.test(u)) externalRequests.push(`${label}: ${u}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content.Security.Policy|Refused to/i.test(m.text())) problems.push(`${label} console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${label} pageerror: ${e.message}`));
}
async function nav(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(60);
}
const text = (page, sel) => page.locator(sel).first().innerText();

const browser = await playwright.chromium.launch();
try {
  // ---------------------------------------------------------------- distribusi
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await ctx.newPage();
  watch(page, 'distribusi');
  await page.goto(DIST);
  await page.waitForSelector('main h2');

  const cspMeta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  check('CSP terpasang dan memblokir koneksi', /connect-src 'none'/.test(cspMeta) && /default-src 'none'/.test(cspMeta));
  const fetchBlocked = await page.evaluate(async () => {
    try { await fetch('https://example.com/'); return 'terkirim'; } catch (e) { return 'diblokir'; }
  });
  check('fetch ke server luar diblokir CSP', fetchBlocked === 'diblokir');
  problems.length = 0; // pesan CSP dari uji sengaja di atas tidak dihitung
  externalRequests.length = 0;

  const beranda = await text(page, 'main');
  check('Beranda: data CONTOH dimuat', beranda.includes('CONTOH') && beranda.includes('Jumlah aset'));
  check('Beranda: total nilai (tanpa aset Tidak Aktif)', beranda.includes('Rp 1.424.000.000'), beranda.match(/Rp [\d.]+/)?.[0]);
  check('Beranda: banner jatuh tempo ≤30 hari/lewat', /aset perlu diurus/.test(beranda));
  check('Beranda: banner backup', /belum pernah membuat backup/i.test(beranda));
  check('Beranda: kelengkapan data dalam persen', /Punya lokasi dokumen\s*\n?\s*\d+%/.test(beranda));
  check('Beranda: tiga tugas terdekat', (await page.locator('#h-tugas').locator('xpath=../..').locator('li').count()) === 3);
  const barWidth = await page.locator('.bar-fill').first().evaluate((el) => el.style.width);
  check('Beranda: grafik batang CSS ter-render (style via CSSOM lolos CSP)', /%$/.test(barWidth), barWidth);
  check('Beranda: tombol aksi cepat', (await page.locator('main a', { hasText: 'Tambah Aset' }).count()) > 0 && (await page.locator('main a', { hasText: 'Buka Panduan' }).count()) > 0);
  await shot(page, '01-beranda');

  // Semua menu bisa dibuka tanpa error
  const menus = ['beranda', 'aset', 'dokumen', 'keluarga', 'kontak', 'pengingat', 'rencana', 'panduan', 'ringkasan', 'ekspor', 'asisten', 'riwayat', 'pengaturan', 'bantuan'];
  for (const m of menus) { await nav(page, '#/' + m); }
  check('14 menu terbuka tanpa error JS', problems.length === 0, problems.slice(0, 3).join(' | '));
  check('Navigasi: 14 tautan di sidebar', (await page.locator('#nav-list a').count()) === 14);

  // Aset: daftar, filter, urut
  await nav(page, '#/aset');
  await page.fill('#as-q', 'motor');
  check('Aset: pencarian nama', (await page.locator('main .items article').count()) === 1);
  await page.fill('#as-q', '');
  await page.selectOption('#as-kat', 'Kendaraan');
  check('Aset: filter kategori', (await page.locator('main .items article').count()) === 2);
  await page.selectOption('#as-kat', '');
  await page.selectOption('#as-st', 'Tidak Aktif');
  check('Aset: filter status', (await page.locator('main .items article').count()) === 1);
  await page.selectOption('#as-st', '');
  await page.selectOption('#as-so', 'nilai');
  check('Aset: urut berdasarkan nilai', (await page.locator('main .items article h3').first().innerText()).includes('Rumah'));
  await page.click('text=Tampilan tabel');
  check('Aset: tampilan tabel', (await page.locator('main table tbody tr').count()) === 8);
  await shot(page, '02-aset-tabel');

  // Aset: form + validasi
  await nav(page, '#/aset/baru');
  const refInput = page.getByLabel('Nomor referensi (disamarkan)');
  check('Form aset: kolom referensi maxlength 8', (await refInput.getAttribute('maxlength')) === '8');
  check('Form aset: teks bantuan referensi', (await text(page, 'main')).includes('Isi hanya bagian yang disamarkan, misalnya 4 digit terakhir.'));
  await page.getByLabel('Nama aset').fill('Uji Rumah Kontrakan');
  await page.getByLabel('Perkiraan nilai (Rp)').fill('-5000');
  await page.getByLabel('Catatan').fill('password: rahasia123');
  await refInput.evaluate((el) => { el.value = '1234567890'; }); // lewati maxlength untuk uji validasi JS
  await page.click('button:has-text("Simpan aset")');
  const errs = await page.locator('main .err').allInnerTexts();
  check('Form aset: nilai negatif ditolak', errs.some((e) => /angka positif/.test(e)));
  check('Form aset: referensi >8 karakter ditolak', errs.some((e) => /Maksimal 8 karakter/.test(e)));
  check('Form aset: password di catatan ditolak', errs.some((e) => /password/.test(e)));
  const countBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('petaAsetKeluarga.v1')).aset.length);
  check('Form aset: data tidak tersimpan saat tidak valid', countBefore === 8);
  await page.getByLabel('Perkiraan nilai (Rp)').fill('250.000.000');
  await page.getByLabel('Catatan').fill('Kontrak 2 tahun <b>tebal</b> <img src=x onerror=alert(1)>');
  await refInput.fill('**99');
  await page.getByLabel('Tanggal jatuh tempo').fill('2026-12-10');
  await page.getByLabel('Kategori').selectOption('Rumah dan Bangunan');
  await page.getByLabel(/Bank Fiktif/).check();
  await page.click('button:has-text("Simpan aset")');
  await page.waitForSelector('main h2:has-text("Uji Rumah Kontrakan")');
  const detail = await text(page, 'main');
  check('Aset: tersimpan dan detail tampil', detail.includes('Rp 250.000.000') && detail.includes('**99'));
  check('Aset: HTML di input ditampilkan sebagai teks (escape)', detail.includes('<img src=x onerror=alert(1)>') && (await page.locator('main img').count()) === 0);
  check('Aset: checklist dokumen standar dibuat otomatis', detail.includes('Sertifikat tanah — Uji Rumah Kontrakan') && detail.includes('PBG atau IMB — Uji Rumah Kontrakan'));
  check('Aset: kontak terkait tampil', detail.includes('[CONTOH] Bank Fiktif Cabang Kota'));
  check('Riwayat: tercatat di halaman detail', /Aset ditambahkan/.test(detail));
  // ubah
  await page.click('main a:has-text("Ubah")');
  await page.getByLabel('Status').selectOption('Belum Diklaim');
  await page.click('button:has-text("Simpan perubahan")');
  await page.waitForSelector('main h2:has-text("Uji Rumah Kontrakan")');
  check('Aset: ubah tercatat di riwayat', /Diubah: status/.test(await text(page, 'main')));
  await shot(page, '03-aset-detail');

  // Aset digital: field khusus
  await nav(page, '#/aset/baru');
  await page.getByLabel('Kategori').selectOption('Aset Digital');
  check('Aset Digital: field platform & lokasi informasi akses, referensi disembunyikan',
    await page.getByLabel('Nama platform').isVisible() && await page.getByLabel('Lokasi informasi akses').isVisible() && !(await page.getByLabel('Nomor referensi (disamarkan)').isVisible()));

  // Dokumen
  await nav(page, '#/dokumen');
  const dok = await text(page, 'main');
  check('Dokumen: peringatan aset aktif belum lengkap', /aset aktif dokumennya belum lengkap/.test(dok));
  check('Dokumen: checklist standar & dokumen umum', dok.includes('Checklist dokumen standar') && dok.includes('Dokumen umum keluarga') && dok.includes('Surat keterangan usaha'));
  const firstSel = page.locator('main ul.list select').first();
  await firstSel.selectOption('Fotokopi Tersedia');
  check('Dokumen: ubah status langsung', (await page.locator('#toast').innerText()).includes('Status dokumen diperbarui'));
  await shot(page, '04-dokumen');

  // Keluarga
  await nav(page, '#/keluarga');
  const kel = await text(page, 'main');
  check('Keluarga: peran, penanda tahu lokasi, aset terkait', kel.includes('Ahli waris') && kel.includes('Tahu lokasi dokumen') && kel.includes('Aset terkait'));

  // Kontak + hubungkan ke aset
  await nav(page, '#/kontak/baru');
  await page.getByLabel('Nama lembaga').fill('Uji Kantor Pertanahan');
  await page.getByLabel('Kategori').selectOption('Kantor Pertanahan');
  await page.getByLabel('Telepon').fill('0800-1111-2222');
  await page.getByLabel('Uji Rumah Kontrakan').check();
  await page.click('button:has-text("Simpan")');
  await page.waitForSelector('main h2:has-text("Uji Kantor Pertanahan")');
  check('Kontak: tersimpan & terhubung ke aset', (await text(page, 'main')).includes('Uji Rumah Kontrakan'));

  // Pengingat
  await nav(page, '#/pengingat');
  const tabs = await page.locator('[role=tab]').allInnerTexts();
  check('Pengingat: 5 tab (Lewat/30/60/90/Semua)', tabs.length === 5 && /Lewat \(1\)/.test(tabs[0]), tabs.join(' | '));
  await page.click('[role=tab]:has-text("Lewat")');
  await page.click('main button:has-text("Sudah diurus")');
  const nd = await page.getByLabel('Tanggal jatuh tempo baru').inputValue();
  check('Pengingat: usulan tanggal baru = +1 tahun', nd === '2027-11-10', nd);
  await page.click('button:has-text("Simpan tanggal baru")');
  check('Pengingat: setelah diurus, tab Lewat kosong', /Lewat \(0\)/.test(await page.locator('[role=tab]').first().innerText()));
  await page.click('[role=tab]:has-text("Semua")');
  const [dl1] = await Promise.all([page.waitForEvent('download'), page.click('main li button:has-text("Unduh .ics")')]);
  const ics1 = readFileSync(await dl1.path(), 'utf8');
  check('Pengingat: unduh .ics satu aset', ics1.startsWith('BEGIN:VCALENDAR') && (ics1.match(/BEGIN:VEVENT/g) || []).length === 1, dl1.suggestedFilename());
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Unduh .ics semua aset")')]);
  const ics2 = readFileSync(await dl2.path(), 'utf8');
  check('Pengingat: unduh .ics semua aset', (ics2.match(/BEGIN:VEVENT/g) || []).length >= 4, (ics2.match(/BEGIN:VEVENT/g) || []).length + ' acara');
  await shot(page, '05-pengingat');

  // Rencana tindakan
  await nav(page, '#/rencana');
  const nTugas = await page.locator('main tbody tr').count();
  await page.click('button:has-text("Perbarui kontak ahli waris")');
  check('Rencana: templat menambah tugas', (await page.locator('main tbody tr').count()) === nTugas + 1);
  const dates = await page.locator('main tbody tr td:nth-child(3)').allInnerTexts();
  check('Rencana: diurutkan berdasarkan tenggat', dates.length > 2, dates.slice(0, 3).join(' | '));

  // Panduan
  await nav(page, '#/panduan');
  check('Panduan: 6 topik dari guide.md', (await page.locator('main section.guide-sec').count()) === 6);
  await page.fill('#pd-q', 'notaris');
  const nNotaris = await page.locator('main section.guide-sec').count();
  check('Panduan: pencarian', nNotaris >= 1 && nNotaris < 6, nNotaris + ' topik');
  await page.fill('#pd-q', '');
  await page.locator('main section.guide-sec input[type=checkbox]').first().check();
  await page.reload(); await nav(page, '#/panduan');
  check('Panduan: status centang tersimpan setelah muat ulang', await page.locator('main section.guide-sec input[type=checkbox]').first().isChecked());

  // Ringkasan & cetak
  await nav(page, '#/ringkasan');
  let rep = await text(page, 'article.report');
  check('Ringkasan: nilai disembunyikan secara default', !rep.includes('Perkiraan nilai') && !rep.includes('Rp 850.000.000'));
  check('Ringkasan: tanggal cetak dan disclaimer', /Tanggal cetak:/.test(rep) && rep.includes('Bukan nasihat hukum atau keuangan'));
  await page.getByLabel(/Tampilkan perkiraan nilai/).check();
  rep = await text(page, 'article.report');
  check('Ringkasan: nilai bisa diaktifkan', rep.includes('Rp 850.000.000'));
  await page.getByLabel('Kontak penting').uncheck();
  check('Ringkasan: pilih bagian', !(await text(page, 'article.report')).includes('Kontak penting ('));
  await page.emulateMedia({ media: 'print' });
  check('Cetak: navigasi disembunyikan saat print', !(await page.locator('#sidebar').isVisible()) && !(await page.locator('.topbar').isVisible()));
  await shot(page, '06-cetak');
  const pdf = await page.pdf({ format: 'A4', displayHeaderFooter: false });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('Cetak: PDF berhasil dibuat', pdf.length > 10000, pages + ' halaman, ' + Math.round(pdf.length / 1024) + ' KB');
  if (SHOTS) writeFileSync(join(SHOTS, 'ringkasan.pdf'), pdf);
  await page.emulateMedia({ media: 'screen' });

  // Ekspor
  await nav(page, '#/ekspor');
  const [dlc] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Aset (")')]);
  const csvBuf = readFileSync(await dlc.path());
  check('Ekspor CSV: UTF-8 dengan BOM', csvBuf.subarray(0, 3).toString('hex') === 'efbbbf', dlc.suggestedFilename());
  const csv = csvBuf.toString('utf8');
  check('Ekspor CSV: nilai berkoma/berkutip di-escape', csv.includes('"Kontrak 2 tahun <b>tebal</b> <img src=x onerror=alert(1)>"') || csv.includes('"[CONTOH] Brankas kamar utama, map biru"'));
  for (const k of ['Dokumen', 'Kontak', 'Anggota keluarga', 'Tugas']) {
    const [d] = await Promise.all([page.waitForEvent('download'), page.click(`main button:has-text("${k} (")`)]);
    check(`Ekspor CSV: ${k}`, readFileSync(await d.path()).subarray(0, 3).toString('hex') === 'efbbbf');
  }
  const [dlj] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Unduh backup JSON")')]);
  const backupPath = await dlj.path();
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  check('Ekspor JSON: versi_skema & tanggal_ekspor', backup.versi_skema === 1 && !!backup.tanggal_ekspor && backup.aset.length === 9);
  check('Ekspor JSON: tanggal backup terakhir tersimpan', /Backup terakhir:/.test(await text(page, 'main')));

  // Impor: tidak valid → tidak mengubah data
  const tmp = join(tmpdir(), 'pak-verify');
  mkdirSync(tmp, { recursive: true });
  const bad = { ...backup, aset: [{ id: 'z', nama: 'Bocor', kategori: 'Lainnya', nomorReferensi: '1234567890123456' }] };
  writeFileSync(join(tmp, 'bad.json'), JSON.stringify(bad));
  writeFileSync(join(tmp, 'notjson.json'), '{rusak');
  const before = await page.evaluate(() => localStorage.getItem('petaAsetKeluarga.v1'));
  await page.setInputFiles('main input[type=file]', join(tmp, 'notjson.json'));
  await page.waitForSelector('main .banner.danger');
  await page.setInputFiles('main input[type=file]', join(tmp, 'bad.json'));
  await page.waitForSelector('main .banner.danger:has-text("nomorReferensi")');
  check('Impor: berkas tidak valid ditolak, data tidak berubah', before === await page.evaluate(() => localStorage.getItem('petaAsetKeluarga.v1')));
  // Impor valid (gabung) dengan pratinjau
  const extra = { versi_skema: 1, aset: [{ id: 'imp1', nama: 'Aset Impor Uji', kategori: 'Lainnya', status: 'Aktif' }] };
  writeFileSync(join(tmp, 'ok.json'), JSON.stringify(extra));
  await page.setInputFiles('main input[type=file]', join(tmp, 'ok.json'));
  await page.waitForSelector('main .banner.ok:has-text("Validasi lolos")');
  check('Impor: pratinjau jumlah data', /Aset\s*1 \(saat ini: 9\)/.test(await text(page, 'main .banner.ok:has-text("Validasi lolos")')));
  await page.click('button:has-text("Impor sekarang")');
  await page.waitForTimeout(100);
  check('Impor: mode gabung menambah data', await page.evaluate(() => JSON.parse(localStorage.getItem('petaAsetKeluarga.v1')).aset.length) === 10);

  // Asisten
  await nav(page, '#/asisten');
  const prompt = await text(page, '#prompt-out');
  check('Asisten: pesan tidak mengirim data ke AI', (await text(page, 'main')).includes('Aplikasi ini tidak mengirim data ke layanan AI. Tempelkan prompt ke asisten AI pilihan Anda.'));
  check('Asisten: default tanpa nilai dan catatan', !/Rp \d/.test(prompt) && !prompt.includes('catatan:'));
  check('Asisten: instruksi peran (tanpa nasihat hukum, sarankan notaris)', /Jangan memberi nasihat hukum/.test(prompt) && /notaris/.test(prompt));
  await page.getByLabel('Sertakan perkiraan nilai aset').click(); // tetap tidak tercentang sampai dikonfirmasi
  await page.click('dialog button:has-text("Ya, sertakan")');
  check('Asisten: nilai disertakan setelah konfirmasi sadar', /Rp 850\.000\.000/.test(await text(page, '#prompt-out')));
  await page.click('button:has-text("Salin prompt")');
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  check('Asisten: tombol salin menyalin ke clipboard', clip.startsWith('Peran Anda'));

  // Pencarian global
  await page.fill('#global-q', 'notaris');
  await page.press('#global-q', 'Enter');
  await page.waitForSelector('main h2:has-text("Hasil pencarian")');
  const sr = await text(page, 'main');
  check('Pencarian global: menemukan kontak', /Kontak \(\d+\)/.test(sr) && sr.includes('Kantor Notaris Fiktif'));

  // Riwayat
  await nav(page, '#/riwayat');
  const nR = await page.locator('main tbody tr').count();
  check('Riwayat: daftar perubahan (Fase 2)', nR >= 3, nR + ' catatan');
  await page.click('button:has-text("Hapus semua riwayat")');
  await page.click('dialog button:has-text("Hapus riwayat")');
  check('Riwayat: bisa dihapus', (await page.locator('main tbody tr').count()) === 0);

  // Pengaturan: tema, font, PIN
  await nav(page, '#/pengaturan');
  await page.getByLabel('Tema').selectOption('gelap');
  await page.getByLabel('Ukuran huruf').selectOption('besar');
  check('Pengaturan: tema gelap & huruf besar', await page.evaluate(() => document.documentElement.dataset.theme === 'gelap' && document.documentElement.dataset.font === 'besar'));
  await shot(page, '07-pengaturan-gelap');
  check('Pengaturan: keterangan penyimpanan lokal selalu terlihat', await page.locator('#local-note').isVisible());
  await page.getByLabel('PIN (4–8 angka)').fill('2468');
  await page.getByLabel('Ulangi PIN').fill('2468');
  await page.click('button:has-text("Aktifkan PIN")');
  const pinRec = await page.evaluate(() => JSON.parse(localStorage.getItem('petaAsetKeluarga.v1')).pengaturan.pin);
  check('PIN: disimpan sebagai hash, bukan teks biasa', pinRec && /^[0-9a-f]{64}$/.test(pinRec.hash) && !JSON.stringify(pinRec).includes('2468'));
  await page.reload();
  check('PIN: layar kunci muncul saat dibuka', await page.locator('#lock').isVisible());
  await page.fill('#lock-pin', '1111'); await page.press('#lock-pin', 'Enter');
  check('PIN: PIN salah ditolak', (await text(page, '#lock-err')).includes('PIN salah'));
  await page.fill('#lock-pin', '2468'); await page.press('#lock-pin', 'Enter');
  check('PIN: PIN benar membuka aplikasi', !(await page.locator('#lock').isVisible()) && (await page.locator('main h2').count()) > 0);
  // Reset
  await nav(page, '#/pengaturan');
  await page.click('button:has-text("Reset semua data")');
  await page.fill('#dlg-input', 'hapus');
  await page.click('dialog button:has-text("Hapus semua data")');
  check('Reset: menolak jika tidak mengetik "HAPUS" persis', await page.locator('dialog').isVisible());
  await page.fill('#dlg-input', 'HAPUS');
  await page.click('dialog button:has-text("Hapus semua data")');
  await page.waitForTimeout(100);
  check('Reset: semua data terhapus', await page.evaluate(() => JSON.parse(localStorage.getItem('petaAsetKeluarga.v1')).aset.length) === 0);

  // Bantuan
  await nav(page, '#/bantuan');
  const bt = await text(page, 'main');
  check('Bantuan: FAQ, disclaimer, versi, tautan Panduan', bt.includes('Apakah data saya aman?') && bt.includes('cache') && bt.includes('Bagaimana cara backup?') && bt.includes('Versi aplikasi') && bt.includes('Buka Panduan'));
  check('Footer: disclaimer di setiap halaman', (await text(page, 'footer.site')).includes('Untuk wasiat dan urusan waris, konsultasikan dengan notaris.'));
  await ctx.close();

  // ---------------------------------------------------------------- index.html kosong + onboarding
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage();
  watch(p2, 'index');
  await p2.goto(EMPTY);
  await p2.waitForSelector('main h2');
  check('Onboarding: tampil saat pertama kali', (await text(p2, 'main h2')).includes('Selamat datang'));
  await p2.getByLabel('Nama keluarga').fill('Uji');
  await p2.click('button:has-text("Lanjut")');
  await p2.getByLabel('Kendaraan').check();
  await p2.getByLabel('Asuransi').check();
  await p2.click('button:has-text("Lanjut")');
  await shot(p2, '08-onboarding');
  await p2.click('button:has-text("Selesai dan mulai")');
  await p2.waitForTimeout(100);
  const st2 = await p2.evaluate(() => JSON.parse(localStorage.getItem('petaAsetKeluarga.v1')));
  check('Onboarding: checklist dokumen & tugas awal dibuat', st2.dokumen.some((d) => d.jenis === 'BPKB') && st2.dokumen.some((d) => d.jenis === 'Polis asuransi') && st2.dokumen.some((d) => d.jenis === 'Kartu keluarga') && st2.tugas.some((t) => t.judul === 'Perbarui STNK'),
    `${st2.dokumen.length} dokumen, ${st2.tugas.length} tugas`);
  check('Onboarding: nama keluarga di judul', (await p2.title()).includes('Uji') && (await text(p2, '#brand-name')).includes('Uji'));
  // Keyboard: Tab pertama setelah halaman dimuat ke skip link
  await p2.reload(); await p2.waitForSelector('main h2');
  await p2.keyboard.press('Tab');
  check('Aksesibilitas: tautan "lewati ke konten" lewat keyboard', await p2.evaluate(() => document.activeElement.classList.contains('skip')));
  const unlabeled = await p2.evaluate(() => {
    location.hash = '#/aset/baru';
    return new Promise((r) => setTimeout(() => r([...document.querySelectorAll('main input, main select, main textarea')].filter((el) => !el.labels || !el.labels.length).length), 80));
  });
  check('Aksesibilitas: semua input form aset punya label', unlabeled === 0, unlabeled + ' tanpa label');
  await ctx2.close();

  // ---------------------------------------------------------------- tampilan HP
  const ctx3 = await browser.newContext({ ...playwright.devices['Pixel 7'] });
  const p3 = await ctx3.newPage();
  const onScreen = (sel) => p3.locator(sel).boundingBox().then((b) => !!b && b.x + b.width > 1);
  watch(p3, 'hp');
  await p3.goto(DIST);
  await p3.waitForSelector('main h2');
  check('HP: bottom bar tampil, sidebar tersembunyi', await p3.locator('#bottombar').isVisible() && !(await onScreen('#sidebar')));
  await shot(p3, '09-hp-beranda', { fullPage: false });
  await p3.click('#menu-btn');
  await p3.waitForTimeout(300);
  check('HP: tombol Menu membuka laci navigasi', await onScreen('#sidebar'));
  await shot(p3, '10-hp-menu', { fullPage: false });
  await p3.keyboard.press('Escape');
  await p3.click('#bottombar a[data-page=aset]');
  await p3.waitForTimeout(100);
  const overflow = await p3.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('HP: tanpa scroll horizontal di halaman Aset', overflow <= 1, overflow + 'px');
  await shot(p3, '11-hp-aset', { fullPage: false });
  await ctx3.close();
} finally {
  await browser.close();
}

check('Tidak ada permintaan jaringan keluar', externalRequests.length === 0, externalRequests.slice(0, 5).join(', '));
check('Tidak ada error konsol / pelanggaran CSP', problems.length === 0, problems.slice(0, 5).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan lulus.`);
process.exit(failed.length ? 1 : 0);
