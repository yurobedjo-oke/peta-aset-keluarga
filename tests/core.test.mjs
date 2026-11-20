import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const C = require('../src/core.js');

describe('tanggal jatuh tempo', () => {
  test('parseISODate menolak tanggal tidak valid', () => {
    assert.deepEqual(C.parseISODate('2026-11-20'), { y: 2026, m: 11, d: 20 });
    assert.equal(C.parseISODate('2026-02-29'), null); // bukan kabisat
    assert.deepEqual(C.parseISODate('2028-02-29'), { y: 2028, m: 2, d: 29 });
    assert.equal(C.parseISODate('1900-02-29'), null); // abad bukan kabisat
    assert.deepEqual(C.parseISODate('2000-02-29'), { y: 2000, m: 2, d: 29 });
    for (const bad of ['2026-13-01', '2026-00-10', '2026-04-31', '20-11-2026', '2026/11/20', '', null, undefined, 20261120, '2026-1-5']) {
      assert.equal(C.parseISODate(bad), null, String(bad));
    }
  });

  test('daysUntil menghitung selisih hari, termasuk lintas tahun dan kabisat', () => {
    assert.equal(C.daysUntil('2026-11-20', '2026-11-20'), 0);
    assert.equal(C.daysUntil('2026-11-21', '2026-11-20'), 1);
    assert.equal(C.daysUntil('2026-11-19', '2026-11-20'), -1);
    assert.equal(C.daysUntil('2027-01-01', '2026-12-31'), 1);
    assert.equal(C.daysUntil('2028-03-01', '2028-02-28'), 2);
    assert.equal(C.daysUntil('2027-11-20', '2026-11-20'), 365);
    assert.ok(Number.isNaN(C.daysUntil('bukan', '2026-11-20')));
  });

  test('dueBucket dengan batas 0/30/31/60/61/90/91', () => {
    const t = '2026-11-20';
    assert.equal(C.dueBucket('2026-11-19', t), 'lewat');
    assert.equal(C.dueBucket('2026-11-20', t), '30');
    assert.equal(C.dueBucket(C.addDays(t, 30), t), '30');
    assert.equal(C.dueBucket(C.addDays(t, 31), t), '60');
    assert.equal(C.dueBucket(C.addDays(t, 60), t), '60');
    assert.equal(C.dueBucket(C.addDays(t, 61), t), '90');
    assert.equal(C.dueBucket(C.addDays(t, 90), t), '90');
    assert.equal(C.dueBucket(C.addDays(t, 91), t), 'nanti');
    assert.equal(C.dueBucket('', t), null);
  });

  test('matchesReminderTab bersifat kumulatif untuk 30/60/90', () => {
    const t = '2026-11-20';
    const d45 = C.addDays(t, 45);
    assert.equal(C.matchesReminderTab(d45, t, '30'), false);
    assert.equal(C.matchesReminderTab(d45, t, '60'), true);
    assert.equal(C.matchesReminderTab(d45, t, '90'), true);
    assert.equal(C.matchesReminderTab(d45, t, 'lewat'), false);
    assert.equal(C.matchesReminderTab('2026-01-01', t, 'lewat'), true);
    assert.equal(C.matchesReminderTab('2026-01-01', t, '30'), false);
    assert.equal(C.matchesReminderTab('2026-01-01', t, 'semua'), true);
    assert.equal(C.matchesReminderTab('', t, 'semua'), false);
  });

  test('addDays, addMonths, addYears menjepit akhir bulan', () => {
    assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(C.addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(C.addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(C.addMonths('2028-01-31', 1), '2028-02-29');
    assert.equal(C.addMonths('2026-11-15', 3), '2027-02-15');
    assert.equal(C.addMonths('2026-01-15', -2), '2025-11-15');
    assert.equal(C.addYears('2028-02-29', 1), '2029-02-28');
    assert.equal(C.addMonths('x', 1), null);
  });

  test('suggestNextDue: +1 tahun, dan dimajukan melewati hari ini jika sudah lama lewat', () => {
    assert.equal(C.suggestNextDue('2026-12-01', '2026-11-20'), '2027-12-01');
    assert.equal(C.suggestNextDue('2023-05-10', '2026-11-20'), '2027-05-10');
    assert.equal(C.suggestNextDue('', '2026-11-20'), '2027-11-20');
    assert.equal(C.suggestNextDue('2026-11-25', '2026-11-20', 6), '2027-05-25');
  });

  test('assetsNeedingAttention: lewat atau ≤30 hari, abaikan aset tidak aktif, urut tanggal', () => {
    const t = '2026-11-20';
    const aset = [
      { id: 'a', nama: 'A', status: 'Aktif', jatuhTempo: '2026-12-15' },
      { id: 'b', nama: 'B', status: 'Aktif', jatuhTempo: '2026-10-01' },
      { id: 'c', nama: 'C', status: 'Tidak Aktif', jatuhTempo: '2026-11-21' },
      { id: 'd', nama: 'D', status: 'Aktif', jatuhTempo: '2027-06-01' },
      { id: 'e', nama: 'E', status: 'Aktif' }
    ];
    assert.deepEqual(C.assetsNeedingAttention(aset, t).map((a) => a.id), ['b', 'a']);
  });

  test('formatTanggal dalam format Indonesia', () => {
    assert.equal(C.formatTanggal('2026-11-20', 'panjang'), '20 November 2026');
    assert.equal(C.formatTanggal('2026-08-05', 'sedang'), '5 Agu 2026');
    assert.equal(C.formatTanggal('2026-08-05', 'pendek'), '05/08/2026');
    assert.equal(C.formatTanggal('salah'), '');
    assert.equal(C.relativeDueLabel('2026-11-18', '2026-11-20'), 'lewat 2 hari');
    assert.equal(C.relativeDueLabel('2026-11-21', '2026-11-20'), 'besok');
  });

  test('backupOverdue: lebih dari 30 hari atau belum pernah', () => {
    assert.equal(C.backupOverdue({ terakhir: null }, '2026-11-20'), true);
    assert.equal(C.backupOverdue({ terakhir: '2026-11-01T10:00:00' }, '2026-11-20'), false);
    assert.equal(C.backupOverdue({ terakhir: '2026-10-21T10:00:00' }, '2026-11-20'), false); // tepat 30 hari
    assert.equal(C.backupOverdue({ terakhir: '2026-10-20T10:00:00' }, '2026-11-20'), true);
  });
});

describe('validasi nomor referensi yang disamarkan', () => {
  test('menerima maksimal 8 karakter', () => {
    assert.deepEqual(C.validateRef('1234'), { ok: true, value: '1234' });
    assert.deepEqual(C.validateRef('  **1234 '), { ok: true, value: '**1234' });
    assert.equal(C.validateRef('xxxx5678').ok, true);
    assert.equal(C.validateRef('').ok, true);
    assert.equal(C.validateRef(null).ok, true);
  });
  test('menolak lebih dari 8 karakter (mis. nomor rekening utuh)', () => {
    const r = C.validateRef('1234567890');
    assert.equal(r.ok, false);
    assert.match(r.error, /4 digit terakhir/);
    assert.equal(C.validateRef('123456789').ok, false);
  });
  test('menolak karakter selain huruf, angka, dan tanda samaran', () => {
    assert.equal(C.validateRef('12<b>').ok, false);
    assert.equal(C.validateRef('ab/cd').ok, false);
  });
  test('teks bantuan sesuai ketentuan', () => {
    assert.equal(C.REF_BANTUAN, 'Isi hanya bagian yang disamarkan, misalnya 4 digit terakhir.');
    assert.equal(C.REF_MAX, 8);
  });
});

describe('nilai rupiah', () => {
  test('parseRupiah', () => {
    assert.deepEqual(C.parseRupiah('1.500.000'), { ok: true, value: 1500000 });
    assert.deepEqual(C.parseRupiah('Rp 2.000.000'), { ok: true, value: 2000000 });
    assert.deepEqual(C.parseRupiah('750000'), { ok: true, value: 750000 });
    assert.deepEqual(C.parseRupiah(''), { ok: true, value: null });
    assert.equal(C.parseRupiah('-5000').ok, false);
    assert.equal(C.parseRupiah('0').ok, false);
    assert.equal(C.parseRupiah('abc').ok, false);
    assert.equal(C.parseRupiah('1.50.000').ok, false);
  });
  test('formatRupiah', () => {
    assert.equal(C.formatRupiah(1500000), 'Rp 1.500.000');
    assert.equal(C.formatRupiah(0), 'Rp 0');
    assert.equal(C.formatRupiah(undefined), '-');
  });
});

describe('escape CSV', () => {
  test('nilai biasa tidak diubah', () => {
    assert.equal(C.csvEscape('Rumah'), 'Rumah');
    assert.equal(C.csvEscape(1500000), '1500000');
    assert.equal(C.csvEscape(null), '');
    assert.equal(C.csvEscape(undefined), '');
  });
  test('koma, kutip, dan baris baru dibungkus kutip; kutip digandakan', () => {
    assert.equal(C.csvEscape('Jl. Mawar, No. 5'), '"Jl. Mawar, No. 5"');
    assert.equal(C.csvEscape('Kata "penting"'), '"Kata ""penting"""');
    assert.equal(C.csvEscape('baris1\nbaris2'), '"baris1\nbaris2"');
    assert.equal(C.csvEscape('a\r\nb'), '"a\r\nb"');
    assert.equal(C.csvEscape('a;b'), '"a;b"');
  });
  test('menetralkan formula spreadsheet', () => {
    assert.equal(C.csvEscape('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(C.csvEscape('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(C.csvEscape('-42'), '-42');
  });
  test('toCSV diawali BOM UTF-8 dan memakai CRLF', () => {
    const csv = C.toCSV([{ nama: 'Tanah, Bogor', nilai: 5 }, { nama: 'Émas "batangan"', nilai: null }],
      [{ key: 'nama', label: 'Nama' }, { key: 'nilai', label: 'Nilai' }]);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.equal(csv, '\uFEFFNama,Nilai\r\n"Tanah, Bogor",5\r\n"Émas ""batangan""",\r\n');
    assert.equal(Buffer.from(csv, 'utf8').subarray(0, 3).toString('hex'), 'efbbbf');
  });
  test('kolom dengan fungsi get dan nilai array', () => {
    const csv = C.toCSV([{ ids: ['a', 'b'] }], [{ label: 'K', get: (r) => r.ids }]);
    assert.equal(csv, '\uFEFFK\r\n"a; b"\r\n');
  });
});

describe('file .ics', () => {
  const now = new Date(Date.UTC(2026, 10, 20, 8, 30, 0));
  test('struktur VCALENDAR dan VEVENT sehari penuh', () => {
    const ics = C.buildICS([{ uid: 'aset-1', tanggal: '2026-12-31', judul: 'Jatuh tempo: STNK', deskripsi: 'Baris 1\nBaris 2' }], { now });
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.match(ics, /\r\nDTSTART;VALUE=DATE:20261231\r\n/);
    assert.match(ics, /\r\nDTEND;VALUE=DATE:20270101\r\n/);
    assert.match(ics, /\r\nDTSTAMP:20261120T083000Z\r\n/);
    assert.match(ics, /\r\nUID:aset-1@peta-aset-keluarga\.local\r\n/);
    assert.match(ics, /DESCRIPTION:Baris 1\\nBaris 2/);
    assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 2);
    assert.ok(!/[^\r]\n/.test(ics), 'semua baris diakhiri CRLF');
  });
  test('escape koma, titik koma, backslash', () => {
    assert.equal(C.icsEscape('a,b;c\\d'), 'a\\,b\\;c\\\\d');
  });
  test('baris panjang dilipat ≤75 oktet tanpa memotong karakter UTF-8', () => {
    const judul = 'Jatuh tempo: ' + 'Rumah Émas Ñ '.repeat(12);
    const ics = C.buildICS([{ uid: 'x', tanggal: '2027-01-15', judul }], { now });
    for (const line of ics.split('\r\n')) {
      assert.ok(Buffer.byteLength(line, 'utf8') <= 75, 'terlalu panjang: ' + line);
    }
    const unfolded = ics.replace(/\r\n /g, '');
    assert.ok(unfolded.includes('SUMMARY:' + C.icsEscape(judul)));
  });
  test('event tanpa tanggal valid dilewati; banyak aset sekaligus', () => {
    const ics = C.buildICS([
      { uid: 'a', tanggal: '2027-01-01', judul: 'A' },
      { uid: 'b', tanggal: '', judul: 'B' },
      { uid: 'c', tanggal: '2027-02-30', judul: 'C' },
      { uid: 'd', tanggal: '2027-03-01', judul: 'D' }
    ], { now });
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  });
  test('asetToEvent', () => {
    const ev = C.asetToEvent({ id: '9', nama: 'Motor', kategori: 'Kendaraan', jatuhTempo: '2027-01-01', lokasiDokumen: 'Lemari' });
    assert.equal(ev.uid, 'aset-9');
    assert.equal(ev.judul, 'Jatuh tempo: Motor');
    assert.match(ev.deskripsi, /Lokasi dokumen: Lemari/);
  });
});

describe('validasi impor JSON', () => {
  const valid = () => ({
    versi_skema: 1,
    tanggal_ekspor: '2026-11-20T00:00:00.000Z',
    aset: [{ id: 'a1', nama: 'Rumah', kategori: 'Rumah dan Bangunan', status: 'Aktif', nilai: 100, jatuhTempo: '2027-01-01', nomorReferensi: '1234', kontakIds: ['k1'] }],
    dokumen: [{ id: 'd1', nama: 'Sertifikat', jenis: 'Sertifikat tanah', status: 'Asli Tersedia', asetId: 'a1' }],
    anggota: [{ id: 'm1', nama: 'Budi', peran: 'Ahli waris', tahuLokasiDokumen: true }],
    kontak: [{ id: 'k1', namaLembaga: 'Bank X', kategori: 'Bank' }],
    tugas: [{ id: 't1', judul: 'Cek', status: 'Belum', prioritas: 'Tinggi', tenggat: '2026-12-01' }],
    riwayat: [],
    pengaturan: { namaKeluarga: 'Keluarga Uji', tema: 'gelap' }
  });

  test('data valid lolos dengan jumlah per entitas', () => {
    const r = C.validateImport(valid());
    assert.equal(r.ok, true, r.errors.join('\n'));
    assert.deepEqual(r.counts, { aset: 1, dokumen: 1, anggota: 1, kontak: 1, tugas: 1, riwayat: 0 });
    assert.equal(r.data.pengaturan.namaKeluarga, 'Keluarga Uji');
    assert.equal(r.data.pengaturan.ukuranFont, 'normal');
    assert.ok(r.data.aset[0].dibuat, 'tanggal dibuat dilengkapi');
  });
  test('menerima string JSON; menolak JSON rusak dan bukan objek', () => {
    assert.equal(C.validateImport(JSON.stringify(valid())).ok, true);
    assert.equal(C.validateImport('{rusak').ok, false);
    assert.equal(C.validateImport('[]').ok, false);
    assert.equal(C.validateImport(null).ok, false);
  });
  test('versi_skema wajib dan tidak boleh lebih baru', () => {
    const a = valid(); delete a.versi_skema;
    assert.equal(C.validateImport(a).ok, false);
    const b = valid(); b.versi_skema = 99;
    const rb = C.validateImport(b);
    assert.equal(rb.ok, false);
    assert.match(rb.errors[0], /lebih baru/);
  });
  test('menolak field entitas yang salah', () => {
    const cases = [
      (d) => { d.aset = 'bukan daftar'; },
      (d) => { d.aset[0].kategori = 'Kapal Pesiar'; },
      (d) => { d.aset[0].nilai = -5; },
      (d) => { d.aset[0].nilai = '100'; },
      (d) => { d.aset[0].jatuhTempo = '2027-02-30'; },
      (d) => { d.aset[0].nomorReferensi = '1234567890123'; },
      (d) => { d.aset[0].nama = ''; },
      (d) => { delete d.aset[0].id; },
      (d) => { d.aset.push({ ...d.aset[0] }); },
      (d) => { d.dokumen[0].status = 'Hilang'; },
      (d) => { d.anggota[0].peran = 'Raja'; },
      (d) => { d.kontak[0].namaLembaga = 5; },
      (d) => { d.tugas[0].tenggat = 'besok'; },
      (d) => { d.pengaturan = 'x'; },
      (d) => { d.aset[0].catatan = 'x'.repeat(6000); }
    ];
    cases.forEach((mut, i) => {
      const d = valid(); mut(d);
      const r = C.validateImport(d);
      assert.equal(r.ok, false, 'kasus #' + i + ' seharusnya ditolak');
      assert.ok(r.errors.length > 0);
      assert.equal(r.data, undefined, 'data tidak diberikan bila tidak valid');
    });
  });
  test('tidak mengubah objek input dan membuang kunci __proto__', () => {
    const d = valid();
    const json = JSON.stringify(d);
    const evil = JSON.parse('{"versi_skema":1,"aset":[{"id":"z","nama":"Z","kategori":"Lainnya","__proto__":{"polluted":true}}]}');
    const r = C.validateImport(evil);
    assert.equal(r.ok, true);
    assert.equal(({}).polluted, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(r.data.aset[0], '__proto__'), false);
    C.validateImport(d);
    assert.equal(JSON.stringify(d), json);
  });
  test('mergeData: gabung menambah dan memilih versi terbaru; ganti mengganti semua', () => {
    const cur = C.emptyData();
    cur.aset = [{ id: 'a1', nama: 'Lama', diubah: '2026-01-01T00:00:00Z' }, { id: 'a2', nama: 'Tetap', diubah: '2026-01-01T00:00:00Z' }];
    const inc = C.emptyData();
    inc.aset = [{ id: 'a1', nama: 'Baru', diubah: '2026-06-01T00:00:00Z' }, { id: 'a3', nama: 'Tambahan', diubah: '2026-01-01T00:00:00Z' }];
    const g = C.mergeData(cur, inc, 'gabung');
    assert.deepEqual(g.aset.map((a) => a.nama), ['Baru', 'Tetap', 'Tambahan']);
    assert.equal(cur.aset[0].nama, 'Lama', 'data asli tidak berubah');
    const old = C.emptyData();
    old.aset = [{ id: 'a1', nama: 'Lebih lama', diubah: '2025-01-01T00:00:00Z' }];
    assert.equal(C.mergeData(cur, old, 'gabung').aset[0].nama, 'Lama');
    const r = C.mergeData(cur, inc, 'ganti');
    assert.deepEqual(r.aset.map((a) => a.id), ['a1', 'a3']);
  });
  test('buildExport menyertakan versi_skema dan tanggal ekspor, tanpa PIN', () => {
    const d = C.emptyData();
    d.pengaturan.pin = { hash: 'h', salt: 's' };
    const e = C.buildExport(d, new Date('2026-11-20T00:00:00Z'));
    assert.equal(e.versi_skema, C.VERSI_SKEMA);
    assert.equal(e.tanggal_ekspor, '2026-11-20T00:00:00.000Z');
    assert.equal(e.pengaturan.pin, null);
    assert.equal(d.pengaturan.pin.hash, 'h');
    assert.equal(C.validateImport(e).ok, true, 'hasil ekspor bisa diimpor ulang');
  });
});

describe('statistik, tugas, prompt, PIN, panduan', () => {
  test('completeness dan totalNilai', () => {
    const aset = [
      { kategori: 'Tanah', status: 'Aktif', lokasiDokumen: 'Lemari', jatuhTempo: '2027-01-01', kontakIds: ['k'], nilai: 100 },
      { kategori: 'Kendaraan', status: 'Aktif', lokasiDokumen: '', kontakIds: [], nilai: 50 },
      { kategori: 'Kendaraan', status: 'Tidak Aktif', nilai: 1000 }
    ];
    assert.deepEqual(C.completeness(aset), { jumlah: 2, lokasi: 50, jatuhTempo: 50, kontak: 50, total: 50 });
    assert.equal(C.totalNilai(aset), 150);
    assert.equal(C.countByKategori(aset).Kendaraan, 2);
    assert.deepEqual(C.completeness([]), { jumlah: 0, lokasi: 0, jatuhTempo: 0, kontak: 0, total: 0 });
  });
  test('incompleteDocAssets', () => {
    const aset = [{ id: 'a', status: 'Aktif' }, { id: 'b', status: 'Aktif' }, { id: 'c', status: 'Aktif' }, { id: 'd', status: 'Tidak Aktif' }];
    const dok = [{ asetId: 'a', status: 'Asli Tersedia' }, { asetId: 'b', status: 'Belum Ada' }];
    assert.deepEqual(C.incompleteDocAssets(aset, dok).map((a) => a.id), ['b', 'c']);
  });
  test('sortTasks: belum selesai dulu, tenggat terdekat, tanpa tenggat di akhir', () => {
    const t = [
      { id: '1', status: 'Selesai', tenggat: '2026-01-01' },
      { id: '2', status: 'Belum', tenggat: '' },
      { id: '3', status: 'Berjalan', tenggat: '2026-12-01', prioritas: 'Rendah' },
      { id: '4', status: 'Belum', tenggat: '2026-11-25' },
      { id: '5', status: 'Belum', tenggat: '2026-12-01', prioritas: 'Tinggi' }
    ];
    assert.deepEqual(C.sortTasks(t).map((x) => x.id), ['4', '5', '3', '2', '1']);
  });
  test('buildPrompt: default tanpa nilai dan catatan', () => {
    const d = C.emptyData();
    d.aset = [{ id: 'a', nama: 'Rumah', kategori: 'Rumah dan Bangunan', status: 'Aktif', nilai: 123456789, catatan: 'RAHASIA' }];
    const p = C.buildPrompt(d, { aset: true }, '2026-11-20');
    assert.match(p, /tidak memberi nasihat hukum|Jangan memberi nasihat hukum/);
    assert.match(p, /notaris/);
    assert.ok(!p.includes('123.456.789'));
    assert.ok(!p.includes('RAHASIA'));
    const p2 = C.buildPrompt(d, { aset: true, nilai: true, catatan: true }, '2026-11-20');
    assert.ok(p2.includes('Rp 123.456.789'));
    assert.ok(p2.includes('RAHASIA'));
  });
  test('sha256 sesuai vektor uji standar', () => {
    assert.equal(C.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(C.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(C.sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  test('hash PIN: tidak menyimpan teks biasa dan bisa diverifikasi', () => {
    const rec = { salt: 'garam123', hash: C.hashPin('2468', 'garam123', 50), iterasi: 50 };
    assert.ok(!rec.hash.includes('2468'));
    assert.equal(rec.hash.length, 64);
    assert.equal(C.verifyPin('2468', rec), true);
    assert.equal(C.verifyPin('1357', rec), false);
    assert.notEqual(C.hashPin('2468', 'garam-lain', 50), rec.hash);
    assert.equal(C.validatePin('12').ok, false);
    assert.equal(C.validatePin('12a4').ok, false);
    assert.equal(C.validatePin('123456').ok, true);
  });
  test('diffFields hanya mencatat nama field, bukan nilainya', () => {
    assert.deepEqual(C.diffFields({ nama: 'A', nilai: 1, diubah: 'x' }, { nama: 'B', nilai: 1, diubah: 'y' }), ['nama']);
    assert.deepEqual(C.diffFields({ kontakIds: [] }, { kontakIds: ['k'] }), ['kontak terkait']);
  });
  test('parseGuide menghasilkan bagian, paragraf, daftar, dan checklist ber-id stabil', () => {
    const g = C.parseGuide('# Judul\n\n## Bagian Satu\nParagraf a\nlanjut.\n\n- poin\n- [ ] Cek KTP\n- [x] Cek KK\n\n### Sub\nTeks');
    assert.equal(g.length, 1);
    assert.equal(g[0].id, 'bagian-satu');
    assert.deepEqual(g[0].blok[0], { tipe: 'p', teks: 'Paragraf a lanjut.' });
    assert.equal(g[0].blok[1].tipe, 'ul');
    assert.deepEqual(g[0].blok[2].item.map((i) => i.id), ['bagian-satu:cek-ktp', 'bagian-satu:cek-kk']);
    assert.equal(g[0].blok[3].tipe, 'h3');
  });
});

describe('deteksi data sensitif', () => {
  test('menolak nomor panjang, password, PIN, seed phrase, kunci privat', () => {
    assert.match(C.detectSensitive('rek 1234567890'), /nomor panjang/);
    assert.match(C.detectSensitive('kartu 4111 1111 1111 1111'), /nomor panjang/);
    assert.match(C.detectSensitive('password: rahasia'), /password/);
    assert.match(C.detectSensitive('Kata sandi ada di sini'), /password/);
    assert.match(C.detectSensitive('PIN: 1234'), /PIN/);
    assert.match(C.detectSensitive('seed phrase dompet'), /seed phrase/);
    assert.match(C.detectSensitive('private key 0xabc'), /kunci privat/);
  });
  test('teks wajar lolos; nomor telepon boleh jika digits=false', () => {
    assert.equal(C.detectSensitive('Disimpan di lemari kamar, map biru'), '');
    assert.equal(C.detectSensitive('Ujung **1234'), '');
    assert.equal(C.detectSensitive('Tahun 2026, nilai 150.000.000'), '');
    assert.equal(C.detectSensitive('0812-3456-7890', { digits: false }), '');
    assert.equal(C.detectSensitive(''), '');
  });
});

describe('enkripsi data dengan PIN (AES-GCM + PBKDF2)', () => {
  const data = { versi_skema: 1, aset: [{ id: 'a1', nama: 'Rumah Rahasia', kategori: 'Tanah' }] };
  const fast = { iterasi: 2000 }; // iterasi kecil agar tes cepat; aplikasi memakai 600.000

  test('validatePassphrase: minimal 6, peringatan untuk PIN lemah', () => {
    assert.equal(C.validatePassphrase('12345').ok, false);
    assert.equal(C.validatePassphrase(' abcdef').ok, false);
    assert.equal(C.validatePassphrase('x'.repeat(129)).ok, false);
    const pin = C.validatePassphrase('246813');
    assert.equal(pin.ok, true);
    assert.equal(pin.lemah, true);
    assert.match(pin.saran, /lemah/);
    assert.equal(C.validatePassphrase('aaaaaaaaaaaaaaa').lemah, true);
    assert.equal(C.validatePassphrase('Melati12rumah').lemah, false);
    assert.equal(C.validatePassphrase('kebun teh di bukit hijau').lemah, false);
  });

  test('enkripsi lalu dekripsi kembali ke data semula; tidak ada teks biasa di amplop', async () => {
    const ks = await C.deriveKeyState('Melati12rumah', fast);
    const env = await C.encryptWithKey(data, ks);
    assert.equal(C.isEncryptedEnvelope(env), true);
    assert.equal(env.kdf.iterasi, 2000);
    assert.ok(!JSON.stringify(env).includes('Rumah Rahasia'));
    const out = await C.decryptEnvelope(env, 'Melati12rumah');
    assert.deepEqual(out.data, data);
    assert.deepEqual(await C.decryptWithKey(env, out.ks), data);
  });

  test('PIN salah ditolak', async () => {
    const ks = await C.deriveKeyState('Melati12rumah', fast);
    const env = await C.encryptWithKey(data, ks);
    await assert.rejects(C.decryptEnvelope(env, 'salah123'), /KATA_SANDI_SALAH/);
  });

  test('amplop yang diubah (data, iv, atau parameter KDF) ditolak', async () => {
    const ks = await C.deriveKeyState('Melati12rumah', fast);
    const env = await C.encryptWithKey(data, ks);
    const bytes = C.b64ToBytes(env.data); bytes[0] ^= 1;
    await assert.rejects(C.decryptWithKey({ ...env, data: C.bytesToB64(bytes) }, ks), /KATA_SANDI_SALAH/);
    const iv = C.b64ToBytes(env.cipher.iv); iv[0] ^= 1;
    await assert.rejects(C.decryptWithKey({ ...env, cipher: { ...env.cipher, iv: C.bytesToB64(iv) } }, ks), /KATA_SANDI_SALAH/);
    // Iterasi diturunkan penyerang: AAD tidak cocok, gagal
    await assert.rejects(C.decryptWithKey({ ...env, kdf: { ...env.kdf, iterasi: 1000 } }, ks), /KATA_SANDI_SALAH/);
  });

  test('IV dan garam acak: dua enkripsi tidak pernah sama', async () => {
    const ks = await C.deriveKeyState('Melati12rumah', fast);
    const a = await C.encryptWithKey(data, ks);
    const b = await C.encryptWithKey(data, ks);
    assert.notEqual(a.cipher.iv, b.cipher.iv);
    assert.notEqual(a.data, b.data);
    const ks2 = await C.deriveKeyState('Melati12rumah', fast);
    assert.notEqual(ks.garam, ks2.garam);
  });

  test('isEncryptedEnvelope menolak bentuk yang tidak valid', async () => {
    const ks = await C.deriveKeyState('Melati12rumah', fast);
    const env = await C.encryptWithKey(data, ks);
    for (const mut of [
      (e) => { e.format = 'lain'; }, (e) => { e.versi_enkripsi = 2; }, (e) => { e.kdf.iterasi = 10; },
      (e) => { e.kdf.garam = 'AAAA'; }, (e) => { e.cipher.iv = C.bytesToB64(new Uint8Array(8)); },
      (e) => { e.data = '!!!'; }, (e) => { e.cipher.nama = 'AES-CBC'; }
    ]) {
      const e = structuredClone(env); mut(e);
      assert.equal(C.isEncryptedEnvelope(e), false);
    }
    assert.equal(C.isEncryptedEnvelope(data), false);
    assert.equal(C.validateImport(env).ok, false, 'amplop tidak lolos sebagai data biasa');
  });

  test('field tambahan (mis. tanggal_ekspor) disertakan tanpa menimpa field inti', async () => {
    const ks = await C.deriveKeyState('Melati12rumah', fast);
    const env = await C.encryptWithKey(data, ks, { tanggal_ekspor: '2026-11-20T00:00:00.000Z', format: 'palsu' });
    assert.equal(env.tanggal_ekspor, '2026-11-20T00:00:00.000Z');
    assert.equal(env.format, C.FORMAT_TERENKRIPSI);
  });
});

describe('tanggal data contoh relatif terhadap hari ini', () => {
  const seed = {
    versi_skema: 1, tanggal_acuan: '2026-11-20',
    aset: [{ id: 'a', jatuhTempo: '2026-11-10' }, { id: 'b', jatuhTempo: '2026-12-05' }, { id: 'c', jatuhTempo: '' }],
    tugas: [{ id: 't', tenggat: '2027-01-15' }]
  };
  test('jarak ke hari ini tetap sama di tanggal berapa pun', () => {
    for (const today of ['2026-11-20', '2027-03-01', '2028-02-29', '2031-12-31']) {
      const out = C.shiftSeedDates(seed, today);
      assert.equal(C.daysUntil(out.aset[0].jatuhTempo, today), -10, today);
      assert.equal(C.daysUntil(out.aset[1].jatuhTempo, today), 15, today);
      assert.equal(C.daysUntil(out.tugas[0].tenggat, today), 56, today);
      assert.equal(out.aset[2].jatuhTempo, '');
    }
  });
  test('tidak mengubah input; tanpa tanggal_acuan tidak digeser', () => {
    C.shiftSeedDates(seed, '2027-05-05');
    assert.equal(seed.aset[0].jatuhTempo, '2026-11-10');
    const noRef = { aset: [{ jatuhTempo: '2026-11-10' }] };
    assert.equal(C.shiftSeedDates(noRef, '2027-05-05'), noRef);
  });
});
