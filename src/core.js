/*
 * Peta Aset Keluarga — logika inti (fungsi murni).
 * Berkas ini dipakai di dua tempat:
 *   1. Disisipkan ke template.html oleh build.mjs (tersedia sebagai window.PAKCore).
 *   2. Diimpor oleh tes node:test (module.exports).
 * Tidak ada akses jaringan, DOM, atau localStorage di sini.
 */
(function (root, factory) {
  var Core = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.PAKCore = Core;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSI_SKEMA = 1;
  var VERSI_APLIKASI = '1.1.0';

  // ---------------------------------------------------------------------------
  // Konstanta domain
  // ---------------------------------------------------------------------------
  var KATEGORI_ASET = [
    'Tanah',
    'Rumah dan Bangunan',
    'Kendaraan',
    'Tabungan atau Deposito',
    'Emas dan Logam Mulia',
    'Reksa Dana atau Investasi',
    'Asuransi',
    'Usaha atau Bisnis',
    'Aset Digital',
    'Lainnya'
  ];
  var STATUS_ASET = ['Aktif', 'Belum Diklaim', 'Sudah Diserahkan', 'Tidak Aktif'];
  var STATUS_DOKUMEN = ['Asli Tersedia', 'Fotokopi Tersedia', 'Belum Ada'];
  var JENIS_DOKUMEN = [
    'Sertifikat tanah',
    'PBG atau IMB',
    'BPKB',
    'STNK',
    'Buku tabungan',
    'Bilyet deposito',
    'Polis asuransi',
    'Akta',
    'Kartu keluarga',
    'Akta nikah',
    'Surat keterangan usaha',
    'Lainnya'
  ];
  // Dokumen standar per kategori aset (untuk checklist otomatis).
  var DOKUMEN_PER_KATEGORI = {
    'Tanah': ['Sertifikat tanah'],
    'Rumah dan Bangunan': ['Sertifikat tanah', 'PBG atau IMB'],
    'Kendaraan': ['BPKB', 'STNK'],
    'Tabungan atau Deposito': ['Buku tabungan', 'Bilyet deposito'],
    'Emas dan Logam Mulia': [],
    'Reksa Dana atau Investasi': [],
    'Asuransi': ['Polis asuransi'],
    'Usaha atau Bisnis': ['Akta', 'Surat keterangan usaha'],
    'Aset Digital': [],
    'Lainnya': []
  };
  var DOKUMEN_UMUM_KELUARGA = ['Kartu keluarga', 'Akta nikah'];
  var PERAN_ANGGOTA = ['Ahli waris', 'Pelaksana', 'Penanggung jawab', 'Tidak ada peran'];
  var KATEGORI_KONTAK = [
    'Bank',
    'Asuransi',
    'Notaris atau PPAT',
    'Kantor Pertanahan',
    'Samsat',
    'Agen atau Perantara',
    'Lainnya'
  ];
  var STATUS_TUGAS = ['Belum', 'Berjalan', 'Selesai'];
  var PRIORITAS_TUGAS = ['Tinggi', 'Sedang', 'Rendah'];
  var TEMPLAT_TUGAS = [
    { kode: 'stnk', judul: 'Perbarui STNK', kategori: 'Kendaraan', prioritas: 'Tinggi', hari: 30 },
    { kode: 'polis', judul: 'Perpanjang polis asuransi', kategori: 'Asuransi', prioritas: 'Tinggi', hari: 30 },
    { kode: 'tabungan', judul: 'Cek buku tabungan yang lama tidak aktif', kategori: 'Tabungan atau Deposito', prioritas: 'Sedang', hari: 60 },
    { kode: 'ahliwaris', judul: 'Perbarui kontak ahli waris', kategori: null, prioritas: 'Sedang', hari: 30 },
    { kode: 'salinan', judul: 'Simpan salinan dokumen', kategori: null, prioritas: 'Sedang', hari: 45 }
  ];
  var ENTITAS = ['aset', 'dokumen', 'anggota', 'kontak', 'tugas', 'riwayat'];

  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
    'September', 'Oktober', 'November', 'Desember'];
  var BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  // ---------------------------------------------------------------------------
  // Tanggal (semua tanggal kalender disimpan sebagai string 'YYYY-MM-DD')
  // ---------------------------------------------------------------------------
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  function daysInMonth(y, m) { // m: 1..12
    return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }

  /** Mengurai 'YYYY-MM-DD'. Mengembalikan {y,m,d} atau null jika tidak valid. */
  function parseISODate(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1900 || y > 2200) return null;
    if (mo < 1 || mo > 12) return null;
    if (d < 1 || d > daysInMonth(y, mo)) return null;
    return { y: y, m: mo, d: d };
  }

  function isValidISODate(s) { return parseISODate(s) !== null; }

  function toISO(p) { return p.y + '-' + pad2(p.m) + '-' + pad2(p.d); }

  /** Nomor hari (UTC) agar selisih hari bebas pengaruh zona waktu dan DST. */
  function dayNumber(s) {
    var p = parseISODate(s);
    if (!p) return NaN;
    return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
  }

  /** Tanggal hari ini (zona waktu lokal) sebagai 'YYYY-MM-DD'. */
  function todayISO(now) {
    var d = now instanceof Date ? now : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** Selisih hari dari `today` ke `due`. Negatif = sudah lewat. NaN jika tidak valid. */
  function daysUntil(due, today) {
    return dayNumber(due) - dayNumber(today);
  }

  function addDays(s, n) {
    var dn = dayNumber(s);
    if (isNaN(dn)) return null;
    var d = new Date((dn + n) * 86400000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  /** Tambah bulan; tanggal dijepit ke akhir bulan (31 Jan + 1 bln = 28/29 Feb). */
  function addMonths(s, n) {
    var p = parseISODate(s);
    if (!p) return null;
    var total = p.y * 12 + (p.m - 1) + n;
    var y = Math.floor(total / 12), m = (total % 12) + 1;
    return toISO({ y: y, m: m, d: Math.min(p.d, daysInMonth(y, m)) });
  }

  function addYears(s, n) { return addMonths(s, n * 12); }

  /**
   * Kelompok pengingat: 'lewat' | '30' | '60' | '90' | 'nanti' | null (tanpa tanggal).
   * Batas inklusif: 0..30 hari => '30', 31..60 => '60', 61..90 => '90'.
   */
  function dueBucket(due, today) {
    var n = daysUntil(due, today);
    if (isNaN(n)) return null;
    if (n < 0) return 'lewat';
    if (n <= 30) return '30';
    if (n <= 60) return '60';
    if (n <= 90) return '90';
    return 'nanti';
  }

  /** Apakah masuk tab pengingat. Tab 60 mencakup semua yang ≤60 hari (belum lewat), dst. */
  function matchesReminderTab(due, today, tab) {
    var n = daysUntil(due, today);
    if (isNaN(n)) return false;
    switch (tab) {
      case 'lewat': return n < 0;
      case '30': return n >= 0 && n <= 30;
      case '60': return n >= 0 && n <= 60;
      case '90': return n >= 0 && n <= 90;
      case 'semua': return true;
      default: return false;
    }
  }

  /** Aset yang perlu diperhatikan (lewat atau ≤ batasHari), hanya status yang masih berjalan. */
  function assetsNeedingAttention(aset, today, batasHari) {
    var lim = batasHari == null ? 30 : batasHari;
    return (aset || []).filter(function (a) {
      if (!a.jatuhTempo || a.status === 'Tidak Aktif' || a.status === 'Sudah Diserahkan') return false;
      var n = daysUntil(a.jatuhTempo, today);
      return !isNaN(n) && n <= lim;
    }).sort(function (a, b) { return dayNumber(a.jatuhTempo) - dayNumber(b.jatuhTempo); });
  }

  /** Usulan tanggal jatuh tempo berikutnya setelah "Sudah diurus" (default +1 tahun). */
  function suggestNextDue(due, today, bulan) {
    var step = bulan || 12;
    var base = isValidISODate(due) ? due : today;
    var next = addMonths(base, step);
    // Jika sudah lama lewat, majukan terus sampai setelah hari ini.
    var guard = 0;
    while (daysUntil(next, today) <= 0 && guard++ < 200) next = addMonths(next, step);
    return next;
  }

  function relativeDueLabel(due, today) {
    var n = daysUntil(due, today);
    if (isNaN(n)) return '';
    if (n === 0) return 'hari ini';
    if (n === 1) return 'besok';
    if (n < 0) return 'lewat ' + (-n) + ' hari';
    return n + ' hari lagi';
  }

  /** Format tanggal Indonesia. gaya: 'panjang' (20 November 2026) | 'sedang' (20 Nov 2026) | 'pendek' (20/11/2026). */
  function formatTanggal(s, gaya) {
    var p = parseISODate(s);
    if (!p) return '';
    if (gaya === 'pendek') return pad2(p.d) + '/' + pad2(p.m) + '/' + p.y;
    if (gaya === 'sedang') return p.d + ' ' + BULAN_PENDEK[p.m - 1] + ' ' + p.y;
    return p.d + ' ' + BULAN[p.m - 1] + ' ' + p.y;
  }

  function formatWaktu(isoDateTime, gaya) {
    if (typeof isoDateTime !== 'string') return '';
    var d = new Date(isoDateTime);
    if (isNaN(d.getTime())) return '';
    return formatTanggal(todayISO(d), gaya) + ' ' + pad2(d.getHours()) + '.' + pad2(d.getMinutes());
  }

  // ---------------------------------------------------------------------------
  // Angka dan rupiah
  // ---------------------------------------------------------------------------
  /**
   * Mengurai nilai rupiah dari input pengguna: "1.500.000", "1500000", "Rp 2.000.000".
   * Mengembalikan {ok, value, error}. Kosong => ok dengan value null.
   */
  function parseRupiah(input) {
    if (input === null || input === undefined) return { ok: true, value: null };
    var s = String(input).trim();
    if (s === '') return { ok: true, value: null };
    s = s.replace(/^rp\.?\s*/i, '').replace(/\s/g, '');
    if (/^-/.test(s)) return { ok: false, error: 'Nilai harus angka positif.' };
    // Format Indonesia: titik sebagai pemisah ribuan, koma desimal (diabaikan).
    if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(s)) {
      return { ok: false, error: 'Nilai harus berupa angka, misalnya 150.000.000.' };
    }
    var v = Number(s.replace(/\./g, '').replace(',', '.'));
    if (!isFinite(v) || v <= 0) return { ok: false, error: 'Nilai harus angka positif.' };
    if (v > 1e16) return { ok: false, error: 'Nilai terlalu besar.' };
    return { ok: true, value: Math.round(v) };
  }

  function formatRupiah(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '-';
    var s = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 ? '-' : '') + 'Rp ' + s;
  }

  // ---------------------------------------------------------------------------
  // Nomor referensi yang disamarkan
  // ---------------------------------------------------------------------------
  var REF_MAX = 8;
  var REF_BANTUAN = 'Isi hanya bagian yang disamarkan, misalnya 4 digit terakhir.';

  /** Validasi nomor referensi: maksimal 8 karakter, hanya huruf/angka/tanda samaran. */
  function validateRef(input) {
    if (input === null || input === undefined) return { ok: true, value: '' };
    var s = String(input).trim();
    if (s === '') return { ok: true, value: '' };
    if (s.length > REF_MAX) {
      return { ok: false, error: 'Maksimal ' + REF_MAX + ' karakter. ' + REF_BANTUAN };
    }
    if (!/^[A-Za-z0-9*•xX.\- ]+$/.test(s)) {
      return { ok: false, error: 'Hanya huruf, angka, dan tanda samaran (* atau x). ' + REF_BANTUAN };
    }
    return { ok: true, value: s };
  }

  /**
   * Deteksi teks yang tampak berisi data sensitif yang dilarang disimpan.
   * opt.digits=false untuk kolom yang memang boleh berisi nomor telepon.
   * Mengembalikan pesan galat atau '' jika aman.
   */
  var POLA_SENSITIF = /(password|passwd|kata\s*sandi|\bsandi\s*[:=]|\bpin\s*[:=]|seed\s*phrase|frasa\s*(pemulihan|benih)|recovery\s*phrase|private\s*key|kunci\s*privat|mnemonic|\bcvv\b|\bcvc\b)/i;
  function detectSensitive(text, opt) {
    var s = String(text == null ? '' : text);
    if (!s) return '';
    if (POLA_SENSITIF.test(s)) {
      return 'Jangan menyimpan password, PIN, seed phrase, atau kunci privat. Tulis saja di mana informasinya disimpan.';
    }
    if (!opt || opt.digits !== false) {
      var runs = s.match(/\d[\d \-.]*\d/g) || [];
      for (var i = 0; i < runs.length; i++) {
        if (runs[i].replace(/\D/g, '').length >= 10) {
          return 'Tampak berisi nomor panjang (rekening/kartu). Simpan hanya bagian yang disamarkan, misalnya 4 digit terakhir.';
        }
      }
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // CSV
  // ---------------------------------------------------------------------------
  var CSV_BOM = '\uFEFF';

  /** Escape satu nilai CSV (RFC 4180). Juga menetralkan formula spreadsheet (=, +, -, @). */
  function csvEscape(value) {
    if (value === null || value === undefined) return '';
    var s = Array.isArray(value) ? value.join('; ') : String(value);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    if (/[",\r\n;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /** columns: [{key, label}] atau [{label, get: fn(row)}]. Hasil diawali BOM, baris CRLF. */
  function toCSV(rows, columns) {
    var lines = [columns.map(function (c) { return csvEscape(c.label); }).join(',')];
    (rows || []).forEach(function (r) {
      lines.push(columns.map(function (c) {
        return csvEscape(c.get ? c.get(r) : r[c.key]);
      }).join(','));
    });
    return CSV_BOM + lines.join('\r\n') + '\r\n';
  }

  // ---------------------------------------------------------------------------
  // iCalendar (.ics)
  // ---------------------------------------------------------------------------
  function icsEscape(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  function utf8Len(ch) {
    var c = ch.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }

  /** Lipat baris >75 oktet (RFC 5545 §3.1), tanpa memotong karakter multi-byte. */
  function icsFold(line) {
    var out = [], cur = '', len = 0, limit = 75;
    Array.from(line).forEach(function (ch) {
      var l = utf8Len(ch);
      if (len + l > limit) {
        out.push(cur);
        cur = ' ' + ch; // baris lanjutan diawali spasi
        len = 1 + l;
        limit = 75;
      } else {
        cur += ch;
        len += l;
      }
    });
    out.push(cur);
    return out.join('\r\n');
  }

  function icsStamp(now) {
    var d = now instanceof Date ? now : new Date(now || Date.now());
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' +
      pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
  }

  /**
   * Membuat isi .ics. events: [{uid, tanggal:'YYYY-MM-DD', judul, deskripsi}].
   * Acara sehari penuh + alarm 7 hari dan 1 hari sebelumnya. Event tanpa tanggal valid dilewati.
   */
  function buildICS(events, opts) {
    var o = opts || {};
    var stamp = icsStamp(o.now);
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Peta Aset Keluarga//ID',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:' + icsEscape(o.namaKalender || 'Jatuh Tempo Aset Keluarga')
    ];
    (events || []).forEach(function (ev) {
      if (!isValidISODate(ev.tanggal)) return;
      var start = ev.tanggal.replace(/-/g, '');
      var end = addDays(ev.tanggal, 1).replace(/-/g, '');
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + icsEscape(ev.uid) + '@peta-aset-keluarga.local',
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + start,
        'DTEND;VALUE=DATE:' + end,
        'SUMMARY:' + icsEscape(ev.judul),
        'DESCRIPTION:' + icsEscape(ev.deskripsi || ''),
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(ev.judul), 'TRIGGER:-P7D', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(ev.judul), 'TRIGGER:-P1D', 'END:VALARM',
        'END:VEVENT'
      );
    });
    lines.push('END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  function asetToEvent(a) {
    return {
      uid: 'aset-' + a.id,
      tanggal: a.jatuhTempo,
      judul: 'Jatuh tempo: ' + a.nama,
      deskripsi: 'Kategori: ' + a.kategori + (a.lokasiDokumen ? '\nLokasi dokumen: ' + a.lokasiDokumen : '') +
        '\nDicatat di Peta Aset Keluarga.'
    };
  }

  // ---------------------------------------------------------------------------
  // Model data & validasi impor
  // ---------------------------------------------------------------------------
  function emptyData() {
    return {
      versi_skema: VERSI_SKEMA,
      aset: [], dokumen: [], anggota: [], kontak: [], tugas: [], riwayat: [],
      pengaturan: defaultPengaturan(),
      backup: { terakhir: null },
      panduan: { centang: {} }
    };
  }

  function defaultPengaturan() {
    return {
      namaKeluarga: '',
      tema: 'terang',
      ukuranFont: 'normal',
      formatTanggal: 'panjang',
      onboardingSelesai: false,
      catatRiwayat: true,
      pin: null
    };
  }

  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function isStr(x) { return typeof x === 'string'; }
  function optStr(x) { return x === undefined || x === null || typeof x === 'string'; }
  function optDate(x) { return x === undefined || x === null || x === '' || isValidISODate(x); }
  function optEnum(x, list) { return x === undefined || x === null || x === '' || list.indexOf(x) >= 0; }

  var MAX_ITEM = 5000;
  var MAX_TEXT = 5000;

  /** Validator per entitas. Mengembalikan daftar pesan galat (kosong = valid). */
  var VALIDATOR = {
    aset: function (a) {
      var e = [];
      if (!isStr(a.nama) || !a.nama.trim()) e.push('nama wajib diisi');
      if (KATEGORI_ASET.indexOf(a.kategori) < 0) e.push('kategori tidak dikenal');
      if (!optEnum(a.status, STATUS_ASET)) e.push('status tidak dikenal');
      if (a.nilai !== undefined && a.nilai !== null && !(typeof a.nilai === 'number' && isFinite(a.nilai) && a.nilai > 0)) e.push('nilai harus angka positif');
      if (!optDate(a.jatuhTempo)) e.push('jatuhTempo bukan tanggal valid');
      if (a.nomorReferensi !== undefined && a.nomorReferensi !== null && !validateRef(a.nomorReferensi).ok) e.push('nomorReferensi melebihi 8 karakter atau berisi karakter tidak diizinkan');
      if (a.kontakIds !== undefined && !(Array.isArray(a.kontakIds) && a.kontakIds.every(isStr))) e.push('kontakIds harus daftar id');
      ['pemilikAnggotaId', 'pemilikTeks', 'lokasiDokumen', 'catatan', 'platform'].forEach(function (k) { if (!optStr(a[k])) e.push(k + ' harus teks'); });
      return e;
    },
    dokumen: function (d) {
      var e = [];
      if (!isStr(d.nama) || !d.nama.trim()) e.push('nama wajib diisi');
      if (!optEnum(d.jenis, JENIS_DOKUMEN)) e.push('jenis tidak dikenal');
      if (!optEnum(d.status, STATUS_DOKUMEN)) e.push('status tidak dikenal');
      ['asetId', 'lokasi', 'catatan', 'kategori'].forEach(function (k) { if (!optStr(d[k])) e.push(k + ' harus teks'); });
      return e;
    },
    anggota: function (m) {
      var e = [];
      if (!isStr(m.nama) || !m.nama.trim()) e.push('nama wajib diisi');
      if (!optEnum(m.peran, PERAN_ANGGOTA)) e.push('peran tidak dikenal');
      if (m.tahuLokasiDokumen !== undefined && typeof m.tahuLokasiDokumen !== 'boolean') e.push('tahuLokasiDokumen harus benar/salah');
      ['hubungan', 'kontak', 'catatan'].forEach(function (k) { if (!optStr(m[k])) e.push(k + ' harus teks'); });
      return e;
    },
    kontak: function (k) {
      var e = [];
      if (!isStr(k.namaLembaga) || !k.namaLembaga.trim()) e.push('namaLembaga wajib diisi');
      if (!optEnum(k.kategori, KATEGORI_KONTAK)) e.push('kategori tidak dikenal');
      ['namaPetugas', 'telepon', 'alamat', 'jamLayanan', 'catatan'].forEach(function (f) { if (!optStr(k[f])) e.push(f + ' harus teks'); });
      return e;
    },
    tugas: function (t) {
      var e = [];
      if (!isStr(t.judul) || !t.judul.trim()) e.push('judul wajib diisi');
      if (!optEnum(t.status, STATUS_TUGAS)) e.push('status tidak dikenal');
      if (!optEnum(t.prioritas, PRIORITAS_TUGAS)) e.push('prioritas tidak dikenal');
      if (!optDate(t.tenggat)) e.push('tenggat bukan tanggal valid');
      if (!optStr(t.asetId)) e.push('asetId harus teks');
      return e;
    },
    riwayat: function (r) {
      var e = [];
      if (['aset', 'kontak', 'tugas'].indexOf(r.entitas) < 0) e.push('entitas tidak dikenal');
      if (!isStr(r.jenis)) e.push('jenis wajib diisi');
      if (!isStr(r.waktu) || isNaN(new Date(r.waktu).getTime())) e.push('waktu tidak valid');
      return e;
    }
  };

  function textTooLong(item) {
    return Object.keys(item).some(function (k) { return isStr(item[k]) && item[k].length > MAX_TEXT; });
  }

  /**
   * Validasi JSON impor. Tidak mengubah input. Mengembalikan:
   * { ok, errors:[...], counts:{aset:n,...}, data } — data hanya ada jika ok.
   */
  function validateImport(input) {
    var errors = [];
    var obj = input;
    if (typeof input === 'string') {
      try { obj = JSON.parse(input); } catch (err) {
        return { ok: false, errors: ['Berkas bukan JSON yang valid.'], counts: {} };
      }
    }
    if (!isObj(obj)) return { ok: false, errors: ['Isi berkas harus berupa objek JSON.'], counts: {} };
    if (typeof obj.versi_skema !== 'number' || !isFinite(obj.versi_skema)) {
      errors.push('Field versi_skema tidak ada atau bukan angka.');
    } else if (obj.versi_skema > VERSI_SKEMA) {
      errors.push('versi_skema ' + obj.versi_skema + ' lebih baru dari yang didukung aplikasi (' + VERSI_SKEMA + '). Perbarui aplikasi terlebih dahulu.');
    } else if (obj.versi_skema < 1) {
      errors.push('versi_skema tidak valid.');
    }
    var counts = {};
    var out = emptyData();
    ENTITAS.forEach(function (ent) {
      var list = obj[ent];
      if (list === undefined) { counts[ent] = 0; return; }
      if (!Array.isArray(list)) { errors.push('"' + ent + '" harus berupa daftar.'); return; }
      if (list.length > MAX_ITEM) { errors.push('"' + ent + '" berisi terlalu banyak data (maks ' + MAX_ITEM + ').'); return; }
      var ids = {};
      list.forEach(function (item, i) {
        var where = ent + ' #' + (i + 1);
        if (!isObj(item)) { errors.push(where + ': harus berupa objek.'); return; }
        if (!isStr(item.id) || !item.id || item.id.length > 64) { errors.push(where + ': id wajib berupa teks.'); return; }
        if (ids[item.id]) { errors.push(where + ': id "' + item.id + '" ganda.'); return; }
        ids[item.id] = true;
        if (textTooLong(item)) errors.push(where + ': ada teks yang terlalu panjang.');
        VALIDATOR[ent](item).forEach(function (msg) { errors.push(where + ': ' + msg + '.'); });
      });
      counts[ent] = list.length;
      out[ent] = list.map(function (x) { return normalizeItem(x); });
    });
    // Referensi silang: hanya peringatan ringan diperbaiki saat normalisasi (id yatim dibiarkan).
    if (obj.pengaturan !== undefined) {
      if (!isObj(obj.pengaturan)) errors.push('"pengaturan" harus berupa objek.');
      else {
        var p = obj.pengaturan;
        if (!optStr(p.namaKeluarga)) errors.push('pengaturan.namaKeluarga harus teks.');
        if (!optEnum(p.tema, ['terang', 'gelap'])) errors.push('pengaturan.tema tidak dikenal.');
        if (!optEnum(p.ukuranFont, ['normal', 'besar'])) errors.push('pengaturan.ukuranFont tidak dikenal.');
        if (!optEnum(p.formatTanggal, ['panjang', 'sedang', 'pendek'])) errors.push('pengaturan.formatTanggal tidak dikenal.');
        ['onboardingSelesai', 'catatRiwayat'].forEach(function (k) { if (p[k] !== undefined && typeof p[k] !== 'boolean') errors.push('pengaturan.' + k + ' harus benar/salah.'); });
        if (p.pin !== undefined && p.pin !== null && !(isObj(p.pin) && isStr(p.pin.hash) && isStr(p.pin.salt))) errors.push('pengaturan.pin tidak valid.');
        var base = defaultPengaturan();
        Object.keys(base).forEach(function (k) { if (p[k] !== undefined) base[k] = p[k]; });
        out.pengaturan = base;
      }
    }
    if (obj.backup !== undefined && isObj(obj.backup) && isStr(obj.backup.terakhir)) out.backup = { terakhir: obj.backup.terakhir };
    if (obj.panduan !== undefined && isObj(obj.panduan) && isObj(obj.panduan.centang)) {
      var c = {};
      Object.keys(obj.panduan.centang).forEach(function (k) { if (obj.panduan.centang[k] === true) c[k] = true; });
      out.panduan = { centang: c };
    }
    if (errors.length) return { ok: false, errors: errors, counts: counts };
    return { ok: true, errors: [], counts: counts, data: out };
  }

  function normalizeItem(x) {
    var o = {};
    Object.keys(x).forEach(function (k) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
      o[k] = x[k];
    });
    var now = new Date().toISOString();
    if (!o.dibuat) o.dibuat = now;
    if (!o.diubah) o.diubah = o.dibuat;
    return o;
  }

  /**
   * Gabungkan data impor. mode 'ganti' = pakai data impor seluruhnya.
   * mode 'gabung' = tambahkan data baru; jika id sama, ambil yang `diubah`-nya lebih baru.
   * Pengaturan lokal dipertahankan pada mode gabung.
   */
  function mergeData(current, incoming, mode) {
    if (mode === 'ganti') return JSON.parse(JSON.stringify(incoming));
    var out = JSON.parse(JSON.stringify(current));
    ENTITAS.forEach(function (ent) {
      var map = {};
      (out[ent] || []).forEach(function (x, i) { map[x.id] = i; });
      (incoming[ent] || []).forEach(function (x) {
        if (map[x.id] === undefined) { out[ent].push(x); map[x.id] = out[ent].length - 1; }
        else {
          var cur = out[ent][map[x.id]];
          if (String(x.diubah || '') > String(cur.diubah || '')) out[ent][map[x.id]] = x;
        }
      });
    });
    var c = (out.panduan && out.panduan.centang) || {};
    var ic = (incoming.panduan && incoming.panduan.centang) || {};
    Object.keys(ic).forEach(function (k) { c[k] = true; });
    out.panduan = { centang: c };
    return out;
  }

  /** Data ekspor JSON lengkap. PIN tidak ikut diekspor. */
  function buildExport(data, now) {
    var d = JSON.parse(JSON.stringify(data));
    if (d.pengaturan) d.pengaturan.pin = null;
    return Object.assign({
      aplikasi: 'Peta Aset Keluarga',
      versi_skema: VERSI_SKEMA,
      tanggal_ekspor: (now instanceof Date ? now : new Date()).toISOString()
    }, d, { versi_skema: VERSI_SKEMA });
  }

  // ---------------------------------------------------------------------------
  // Statistik & kelengkapan
  // ---------------------------------------------------------------------------
  function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

  function completeness(aset) {
    var list = (aset || []).filter(function (a) { return a.status !== 'Tidak Aktif'; });
    var n = list.length;
    var lok = list.filter(function (a) { return a.lokasiDokumen && a.lokasiDokumen.trim(); }).length;
    var jt = list.filter(function (a) { return isValidISODate(a.jatuhTempo); }).length;
    var kt = list.filter(function (a) { return a.kontakIds && a.kontakIds.length; }).length;
    return {
      jumlah: n,
      lokasi: pct(lok, n),
      jatuhTempo: pct(jt, n),
      kontak: pct(kt, n),
      total: n ? Math.round((pct(lok, n) + pct(jt, n) + pct(kt, n)) / 3) : 0
    };
  }

  function totalNilai(aset) {
    return (aset || []).reduce(function (s, a) {
      return s + (a.status !== 'Tidak Aktif' && typeof a.nilai === 'number' ? a.nilai : 0);
    }, 0);
  }

  function countByKategori(aset) {
    var out = {};
    KATEGORI_ASET.forEach(function (k) { out[k] = 0; });
    (aset || []).forEach(function (a) { if (out[a.kategori] !== undefined) out[a.kategori]++; });
    return out;
  }

  /** Aset aktif yang dokumennya belum lengkap: tidak ada dokumen, atau ada yang "Belum Ada". */
  function incompleteDocAssets(aset, dokumen) {
    return (aset || []).filter(function (a) {
      if (a.status !== 'Aktif') return false;
      var docs = (dokumen || []).filter(function (d) { return d.asetId === a.id; });
      if (!docs.length) return true;
      return docs.some(function (d) { return d.status === 'Belum Ada'; });
    });
  }

  var PRIORITAS_URUT = { 'Tinggi': 0, 'Sedang': 1, 'Rendah': 2 };

  /** Urutkan tugas: belum selesai dulu, lalu tenggat terdekat (tanpa tenggat di akhir), lalu prioritas. */
  function sortTasks(tugas) {
    return (tugas || []).slice().sort(function (a, b) {
      var sa = a.status === 'Selesai' ? 1 : 0, sb = b.status === 'Selesai' ? 1 : 0;
      if (sa !== sb) return sa - sb;
      var da = isValidISODate(a.tenggat) ? dayNumber(a.tenggat) : Infinity;
      var db = isValidISODate(b.tenggat) ? dayNumber(b.tenggat) : Infinity;
      if (da !== db) return da < db ? -1 : 1;
      return (PRIORITAS_URUT[a.prioritas] || 1) - (PRIORITAS_URUT[b.prioritas] || 1);
    });
  }

  function daysSince(isoDateTime, today) {
    if (!isStr(isoDateTime)) return Infinity;
    var d = new Date(isoDateTime);
    if (isNaN(d.getTime())) return Infinity;
    return daysUntil(today, todayISO(d));
  }

  function backupOverdue(backup, today, hari) {
    return daysSince(backup && backup.terakhir, today) > (hari || 30);
  }

  // ---------------------------------------------------------------------------
  // Asisten salin-tempel (prompt)
  // ---------------------------------------------------------------------------
  function buildPrompt(data, opt, today) {
    var o = opt || {};
    var gaya = (data.pengaturan && data.pengaturan.formatTanggal) || 'panjang';
    var L = [];
    L.push('Peran Anda: asisten yang membantu keluarga menyusun checklist dan ringkasan urusan aset dan dokumen.');
    L.push('Aturan:');
    L.push('- Bantu susun checklist langkah, daftar dokumen yang perlu dicari, dan ringkasan yang mudah dipahami ahli waris.');
    L.push('- Jangan memberi nasihat hukum, pajak, atau keuangan. Jika pertanyaan menyangkut hukum, sampaikan bahwa itu di luar peran Anda.');
    L.push('- Untuk wasiat, pembagian waris, dan akta, sarankan berkonsultasi dengan notaris.');
    L.push('- Jangan meminta nomor rekening, nomor kartu, password, PIN, seed phrase, atau kunci privat.');
    L.push('');
    L.push('Data keluarga' + (data.pengaturan && data.pengaturan.namaKeluarga ? ' ' + data.pengaturan.namaKeluarga : '') + ' (per ' + formatTanggal(today, gaya) + '):');
    var anggotaNama = {};
    (data.anggota || []).forEach(function (m) { anggotaNama[m.id] = m.nama; });
    var kontakNama = {};
    (data.kontak || []).forEach(function (k) { kontakNama[k.id] = k.namaLembaga; });
    function catatan(x) { return o.catatan && x.catatan ? ' | catatan: ' + oneLine(x.catatan) : ''; }

    if (o.aset) {
      L.push('', '## Aset');
      if (!(data.aset || []).length) L.push('(belum ada)');
      (data.aset || []).forEach(function (a) {
        var pemilik = a.pemilikAnggotaId ? anggotaNama[a.pemilikAnggotaId] : a.pemilikTeks;
        L.push('- ' + oneLine(a.nama) + ' [' + a.kategori + ', ' + (a.status || 'Aktif') + ']' +
          (pemilik ? ' | pemilik: ' + oneLine(pemilik) : '') +
          (o.nilai && typeof a.nilai === 'number' ? ' | perkiraan nilai: ' + formatRupiah(a.nilai) : '') +
          (a.lokasiDokumen ? ' | lokasi dokumen: ' + oneLine(a.lokasiDokumen) : '') +
          (a.jatuhTempo ? ' | jatuh tempo: ' + formatTanggal(a.jatuhTempo, gaya) : '') +
          ((a.kontakIds || []).length ? ' | kontak: ' + a.kontakIds.map(function (id) { return kontakNama[id]; }).filter(Boolean).map(oneLine).join(', ') : '') +
          catatan(a));
      });
    }
    if (o.dokumen) {
      L.push('', '## Dokumen');
      var asetNama = {};
      (data.aset || []).forEach(function (a) { asetNama[a.id] = a.nama; });
      if (!(data.dokumen || []).length) L.push('(belum ada)');
      (data.dokumen || []).forEach(function (d) {
        L.push('- ' + oneLine(d.nama) + ' [' + (d.status || 'Belum Ada') + ']' +
          (d.asetId && asetNama[d.asetId] ? ' | untuk aset: ' + oneLine(asetNama[d.asetId]) : ' | dokumen umum') +
          (d.lokasi ? ' | lokasi: ' + oneLine(d.lokasi) : '') + catatan(d));
      });
    }
    if (o.anggota) {
      L.push('', '## Keluarga dan ahli waris');
      if (!(data.anggota || []).length) L.push('(belum ada)');
      (data.anggota || []).forEach(function (m) {
        L.push('- ' + oneLine(m.nama) + (m.hubungan ? ' (' + oneLine(m.hubungan) + ')' : '') +
          ' | peran: ' + (m.peran || 'Tidak ada peran') +
          (m.tahuLokasiDokumen ? ' | mengetahui lokasi dokumen' : '') + catatan(m));
      });
    }
    if (o.kontak) {
      L.push('', '## Kontak penting');
      if (!(data.kontak || []).length) L.push('(belum ada)');
      (data.kontak || []).forEach(function (k) {
        L.push('- ' + oneLine(k.namaLembaga) + ' [' + (k.kategori || 'Lainnya') + ']' +
          (k.jamLayanan ? ' | jam layanan: ' + oneLine(k.jamLayanan) : '') + catatan(k));
      });
    }
    if (o.tugas) {
      L.push('', '## Rencana tindakan');
      if (!(data.tugas || []).length) L.push('(belum ada)');
      sortTasks(data.tugas).forEach(function (t) {
        L.push('- ' + oneLine(t.judul) + ' [' + (t.status || 'Belum') + ', prioritas ' + (t.prioritas || 'Sedang') + ']' +
          (t.tenggat ? ' | tenggat: ' + formatTanggal(t.tenggat, gaya) : ''));
      });
    }
    L.push('', 'Permintaan saya: ' + (o.permintaan && o.permintaan.trim() ? oneLine(o.permintaan) :
      'Tolong susun checklist langkah yang perlu dilakukan keluarga dan ringkasan singkat yang mudah dipahami ahli waris.'));
    return L.join('\n');
  }

  function oneLine(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  // ---------------------------------------------------------------------------
  // SHA-256 murni + hash PIN (Fase 2). PIN tidak pernah disimpan sebagai teks biasa.
  // ---------------------------------------------------------------------------
  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8Bytes(str) {
    var out = [];
    Array.from(String(str)).forEach(function (ch) {
      var c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    });
    return out;
  }

  function sha256Bytes(bytes) {
    var msg = bytes.slice();
    var bitLen = msg.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    msg.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
      (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var W = new Array(64);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < msg.length; off += 64) {
      for (var i = 0; i < 16; i++) {
        W[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3];
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        var s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K256[i] + W[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = [];
    H.forEach(function (x) { out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); });
    return out;
  }

  function toHex(bytes) { return bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }

  function sha256Hex(str) { return toHex(sha256Bytes(utf8Bytes(str))); }

  var PIN_ITERASI = 2000;

  /** Hash PIN berulang dengan garam. Mengembalikan hex. */
  function hashPin(pin, salt, iterasi) {
    var n = iterasi || PIN_ITERASI;
    var h = sha256Bytes(utf8Bytes(salt + ':' + pin));
    var saltBytes = utf8Bytes(salt);
    for (var i = 1; i < n; i++) h = sha256Bytes(h.concat(saltBytes));
    return toHex(h);
  }

  function validatePin(pin) {
    if (!/^\d{4,8}$/.test(String(pin || ''))) return { ok: false, error: 'PIN harus 4 sampai 8 angka.' };
    return { ok: true };
  }

  function verifyPin(pin, rec) {
    if (!rec || !rec.hash || !rec.salt) return false;
    var h = hashPin(String(pin), rec.salt, rec.iterasi || PIN_ITERASI);
    // perbandingan waktu-konstan sederhana
    if (h.length !== rec.hash.length) return false;
    var diff = 0;
    for (var i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ rec.hash.charCodeAt(i);
    return diff === 0;
  }

  // ---------------------------------------------------------------------------
  // Riwayat (Fase 2)
  // ---------------------------------------------------------------------------
  var LABEL_FIELD = {
    nama: 'nama', kategori: 'kategori', status: 'status', nilai: 'nilai', jatuhTempo: 'jatuh tempo',
    lokasiDokumen: 'lokasi dokumen', nomorReferensi: 'nomor referensi', kontakIds: 'kontak terkait',
    pemilikAnggotaId: 'pemilik', pemilikTeks: 'pemilik', catatan: 'catatan', platform: 'platform',
    namaLembaga: 'nama lembaga', namaPetugas: 'nama petugas', telepon: 'telepon', alamat: 'alamat',
    jamLayanan: 'jam layanan', judul: 'judul', tenggat: 'tenggat', prioritas: 'prioritas', asetId: 'aset terkait'
  };

  /** Daftar label field yang berubah (tanpa menyimpan nilainya, agar riwayat tidak membocorkan data). */
  function diffFields(before, after) {
    var keys = {};
    Object.keys(before || {}).concat(Object.keys(after || {})).forEach(function (k) { keys[k] = true; });
    var changed = [];
    Object.keys(keys).forEach(function (k) {
      if (k === 'id' || k === 'dibuat' || k === 'diubah') return;
      if (JSON.stringify((before || {})[k] == null ? '' : before[k]) !== JSON.stringify((after || {})[k] == null ? '' : after[k])) {
        var lbl = LABEL_FIELD[k] || k;
        if (changed.indexOf(lbl) < 0) changed.push(lbl);
      }
    });
    return changed;
  }

  // ---------------------------------------------------------------------------
  // Markdown panduan (subset kecil) -> struktur data (dirender aman ke DOM oleh aplikasi)
  // ---------------------------------------------------------------------------
  function slugify(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  /** Mengurai guide.md menjadi [{id, judul, blok:[{tipe:'p'|'ul'|'check'|'h3', ...}]}]. */
  function parseGuide(md) {
    var sections = [], cur = null, list = null;
    String(md || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (raw) {
      var line = raw.trimEnd();
      var m;
      if ((m = /^##\s+(.+)$/.exec(line))) {
        cur = { id: slugify(m[1]), judul: m[1].trim(), blok: [] };
        sections.push(cur); list = null; return;
      }
      if (!cur) return; // abaikan teks sebelum bagian pertama (judul utama)
      if ((m = /^###\s+(.+)$/.exec(line))) { cur.blok.push({ tipe: 'h3', teks: m[1].trim() }); list = null; return; }
      if ((m = /^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/.exec(line))) {
        if (!list || list.tipe !== 'check') { list = { tipe: 'check', item: [] }; cur.blok.push(list); }
        list.item.push({ id: cur.id + ':' + slugify(m[2]), teks: m[2].trim() });
        return;
      }
      if ((m = /^\s*[-*]\s+(.+)$/.exec(line))) {
        if (!list || list.tipe !== 'ul') { list = { tipe: 'ul', item: [] }; cur.blok.push(list); }
        list.item.push(m[1].trim());
        return;
      }
      if (!line.trim()) { list = null; return; }
      var last = cur.blok[cur.blok.length - 1];
      if (last && last.tipe === 'p' && !list) last.teks += ' ' + line.trim();
      else { cur.blok.push({ tipe: 'p', teks: line.trim() }); list = null; }
    });
    return sections;
  }

  function guideSectionText(sec) {
    return [sec.judul].concat(sec.blok.map(function (b) {
      if (b.tipe === 'ul') return b.item.join(' ');
      if (b.tipe === 'check') return b.item.map(function (i) { return i.teks; }).join(' ');
      return b.teks;
    })).join(' ');
  }

  /** Normalisasi untuk pencarian: huruf kecil, tanpa diakritik. */
  function normSearch(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function uid(prefix) {
    var r = '';
    for (var i = 0; i < 8; i++) r += Math.floor(Math.random() * 36).toString(36);
    return (prefix || 'x') + '_' + Date.now().toString(36) + r;
  }

  return {
    VERSI_SKEMA: VERSI_SKEMA, VERSI_APLIKASI: VERSI_APLIKASI,
    KATEGORI_ASET: KATEGORI_ASET, STATUS_ASET: STATUS_ASET, STATUS_DOKUMEN: STATUS_DOKUMEN,
    JENIS_DOKUMEN: JENIS_DOKUMEN, DOKUMEN_PER_KATEGORI: DOKUMEN_PER_KATEGORI,
    DOKUMEN_UMUM_KELUARGA: DOKUMEN_UMUM_KELUARGA, PERAN_ANGGOTA: PERAN_ANGGOTA,
    KATEGORI_KONTAK: KATEGORI_KONTAK, STATUS_TUGAS: STATUS_TUGAS, PRIORITAS_TUGAS: PRIORITAS_TUGAS,
    TEMPLAT_TUGAS: TEMPLAT_TUGAS, ENTITAS: ENTITAS, REF_MAX: REF_MAX, REF_BANTUAN: REF_BANTUAN,
    parseISODate: parseISODate, isValidISODate: isValidISODate, dayNumber: dayNumber, todayISO: todayISO,
    daysUntil: daysUntil, addDays: addDays, addMonths: addMonths, addYears: addYears,
    dueBucket: dueBucket, matchesReminderTab: matchesReminderTab, assetsNeedingAttention: assetsNeedingAttention,
    suggestNextDue: suggestNextDue, relativeDueLabel: relativeDueLabel,
    formatTanggal: formatTanggal, formatWaktu: formatWaktu,
    parseRupiah: parseRupiah, formatRupiah: formatRupiah, validateRef: validateRef, detectSensitive: detectSensitive,
    csvEscape: csvEscape, toCSV: toCSV, CSV_BOM: CSV_BOM,
    icsEscape: icsEscape, icsFold: icsFold, buildICS: buildICS, asetToEvent: asetToEvent,
    emptyData: emptyData, defaultPengaturan: defaultPengaturan,
    validateImport: validateImport, mergeData: mergeData, buildExport: buildExport,
    completeness: completeness, totalNilai: totalNilai, countByKategori: countByKategori,
    incompleteDocAssets: incompleteDocAssets, sortTasks: sortTasks, daysSince: daysSince,
    backupOverdue: backupOverdue, buildPrompt: buildPrompt,
    sha256Hex: sha256Hex, hashPin: hashPin, verifyPin: verifyPin, validatePin: validatePin,
    diffFields: diffFields, parseGuide: parseGuide, guideSectionText: guideSectionText,
    normSearch: normSearch, slugify: slugify, uid: uid
  };
});
