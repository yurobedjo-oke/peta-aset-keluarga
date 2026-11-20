import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderApp, buildCSP, safeJSON, checkContohMarked, buildAll, CSP_TERTANAM } from '../build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const template = read('template.html');
const core = read('src/core.js');
const guide = read('guide.md');
const contoh = JSON.parse(read('seed/contoh.json'));
const html = renderApp({ template, core, guide, seed: contoh, sumber: 'contoh' });
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];

describe('Content-Security-Policy', () => {
  test('CSP ketat: default-src none, tanpa unsafe-inline, tanpa koneksi keluar', () => {
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /connect-src 'none'/);
    assert.match(csp, /form-action 'none'/);
    assert.match(csp, /base-uri 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.ok(!csp.includes('unsafe-inline'));
    assert.ok(!csp.includes('unsafe-eval'));
    assert.ok(!/https?:/.test(csp), 'tidak ada sumber eksternal');
  });
  test('hash di CSP cocok dengan skrip dan style inline', () => {
    const h = (s) => createHash('sha256').update(s, 'utf8').digest('base64');
    assert.ok(csp.includes(`'sha256-${h(script)}'`));
    assert.ok(csp.includes(`'sha256-${h(style)}'`));
  });
  test('CSP ditempatkan sebelum skrip dan style', () => {
    assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<style>'));
    assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script>'));
  });
  test('varian tertanam tetap memblokir koneksi keluar', () => {
    const emb = renderApp({ template, core, guide, seed: contoh, sumber: 'contoh', csp: 'tertanam' });
    const c = emb.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    assert.equal(c, CSP_TERTANAM);
    assert.match(c, /connect-src 'none'/);
    assert.match(c, /form-action 'none'/);
    assert.ok(emb.includes('[CONTOH] Rumah Jl. Fiktif 12'));
  });
  test('buildCSP menolak template dengan lebih dari satu skrip', () => {
    assert.throws(() => buildCSP('<style></style><script></script><script></script>'));
  });
});

describe('keamanan kode aplikasi', () => {
  test('tidak memakai innerHTML, outerHTML, insertAdjacentHTML, document.write, eval', () => {
    for (const [name, src] of [['template.html', template], ['core.js', core]]) {
      for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
        assert.ok(!src.includes(bad), `${name} mengandung ${bad}`);
      }
    }
  });
  test('tidak ada API jaringan atau URL eksternal di aplikasi', () => {
    for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'importScripts', 'http://', 'https://', '<iframe', '<link', 'src=']) {
      assert.ok(!html.includes(bad), `hasil build mengandung ${bad}`);
    }
  });
  test('kolom nomor referensi dibatasi 8 karakter dengan teks bantuan', () => {
    assert.match(template, /maxlength: C\.REF_MAX/);
    assert.match(template, /help: C\.REF_BANTUAN/);
  });
  test('disclaimer dan keterangan penyimpanan lokal ada', () => {
    assert.ok(template.includes('Aplikasi ini hanya alat pencatatan. Bukan nasihat hukum atau keuangan. Untuk wasiat dan urusan waris, konsultasikan dengan notaris.'));
    assert.ok(template.includes('Data hanya tersimpan di perangkat ini.'));
    assert.ok(template.includes('Aplikasi ini tidak mengirim data ke layanan AI. Tempelkan prompt ke asisten AI pilihan Anda.'));
    assert.ok(template.includes('Isi hanya bagian yang disamarkan') || core.includes('Isi hanya bagian yang disamarkan, misalnya 4 digit terakhir.'));
  });
});

describe('build dua varian', () => {
  test('safeJSON mencegah penutupan tag script', () => {
    const s = safeJSON({ a: '</script><script>alert(1)</script>', b: ' ' });
    assert.ok(!s.includes('</script'));
    assert.ok(!s.includes('<'));
    assert.deepEqual(JSON.parse(s), { a: '</script><script>alert(1)</script>', b: ' ' });
  });
  test('semua penanda build terganti', () => {
    assert.ok(!/@@[A-Z_]+@@/.test(html));
  });
  test('data contoh: setiap entri ditandai CONTOH', () => {
    assert.deepEqual(checkContohMarked(contoh), []);
    const bad = structuredClone(contoh);
    bad.aset[0].nama = 'Rumah asli';
    assert.equal(checkContohMarked(bad).length, 1);
  });
  test('seed/personal.json masuk .gitignore, juga dist/personal.html', () => {
    const gi = read('.gitignore').split('\n').map((l) => l.trim());
    assert.ok(gi.includes('seed/personal.json'));
    assert.ok(gi.includes('dist/personal.html'));
  });
  test('buildAll: tanpa personal.json → personal.html kosong; dengan personal.json → data disisipkan', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pak-build-'));
    try {
      for (const p of ['template.html', 'guide.md', 'src', 'seed/contoh.json']) cpSync(join(ROOT, p), join(tmp, p), { recursive: true });
      const silent = () => {};
      let out = buildAll({ root: tmp, outDir: join(tmp, 'dist'), log: silent });
      const pers1 = out[join(tmp, 'dist', 'personal.html')];
      assert.match(pers1, /var SEED = null;/);
      assert.ok(existsSync(join(tmp, 'dist', 'distribusi.html')));
      assert.ok(existsSync(join(tmp, 'index.html')));
      assert.match(out[join(tmp, 'index.html')], /var SEED = null;/);
      assert.ok(out[join(tmp, 'dist', 'distribusi.html')].includes('[CONTOH] Rumah Jl. Fiktif 12'));
      assert.ok(out[join(tmp, 'dist', 'distribusi.html')].includes('"tanggal_acuan":"2026-11-20"'), 'tanggal_acuan ikut disisipkan');

      writeFileSync(join(tmp, 'seed', 'personal.json'), JSON.stringify({
        versi_skema: 1,
        aset: [{ id: 'p1', nama: 'Rumah Pribadi Uji', kategori: 'Rumah dan Bangunan', status: 'Aktif' }]
      }));
      out = buildAll({ root: tmp, outDir: join(tmp, 'dist'), log: silent });
      assert.ok(out[join(tmp, 'dist', 'personal.html')].includes('Rumah Pribadi Uji'));
      assert.ok(!out[join(tmp, 'dist', 'distribusi.html')].includes('Rumah Pribadi Uji'), 'data pribadi tidak bocor ke distribusi');
      assert.ok(!out[join(tmp, 'index.html')].includes('Rumah Pribadi Uji'));

      writeFileSync(join(tmp, 'seed', 'personal.json'), JSON.stringify({ versi_skema: 1, aset: [{ id: 'x', nama: 'X', kategori: 'Lainnya', nomorReferensi: '1234567890123' }] }));
      assert.throws(() => buildAll({ root: tmp, outDir: join(tmp, 'dist'), log: silent }), /tidak valid/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
