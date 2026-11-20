#!/usr/bin/env node
/**
 * Build Peta Aset Keluarga.
 *
 *   node build.mjs
 *
 * Menghasilkan:
 *   index.html            aplikasi kosong (tanpa data)
 *   dist/personal.html    aplikasi + data dari seed/personal.json (jika ada; jika tidak, kosong)
 *   dist/distribusi.html  aplikasi + data contoh fiktif dari seed/contoh.json
 *   dist/sw.js            service worker opsional (hanya aktif bila disajikan lewat http/https)
 *
 * Tanpa dependensi eksternal. Seed divalidasi dengan validator yang sama dengan fitur impor.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = dirname(fileURLToPath(import.meta.url));
const Core = require('./src/core.js');

/** JSON yang aman disisipkan di dalam <script>. */
export function safeJSON(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function sha256b64(text) {
  return createHash('sha256').update(text, 'utf8').digest('base64');
}

/** Hitung CSP berbasis hash untuk satu-satunya <script> dan <style> inline. */
export function buildCSP(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  if (scripts.length !== 1 || styles.length !== 1) {
    throw new Error(`Template harus berisi tepat 1 <script> dan 1 <style> inline (ditemukan ${scripts.length} dan ${styles.length}).`);
  }
  return [
    "default-src 'none'",
    `script-src 'sha256-${sha256b64(scripts[0])}'`,
    `style-src 'sha256-${sha256b64(styles[0])}'`,
    "img-src 'self' data: blob:",
    "font-src 'none'",
    "connect-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'self'",
    "manifest-src 'none'",
    "form-action 'none'",
    "base-uri 'none'"
  ].join('; ');
}

/** Pastikan setiap entri data contoh ditandai "CONTOH". */
export function checkContohMarked(data) {
  const field = { aset: 'nama', dokumen: 'nama', anggota: 'nama', kontak: 'namaLembaga', tugas: 'judul' };
  const missing = [];
  for (const [ent, key] of Object.entries(field)) {
    for (const item of data[ent] || []) {
      if (!String(item[key] || '').includes('CONTOH')) missing.push(`${ent}:${item.id}`);
    }
  }
  return missing;
}

function loadSeed(path, label) {
  if (!existsSync(path)) return null;
  let raw;
  try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch (e) {
    throw new Error(`${label}: bukan JSON yang valid (${e.message}).`);
  }
  const r = Core.validateImport(raw);
  if (!r.ok) throw new Error(`${label} tidak valid:\n  - ${r.errors.join('\n  - ')}`);
  return r.data;
}

/** Sisipkan core, panduan, seed, dan CSP ke template. */
export function renderApp({ template, core, guide, seed, sumber }) {
  if (/<\/script/i.test(core)) throw new Error('core.js tidak boleh mengandung "</script".');
  const replace = (html, token, value) => {
    if (!html.includes(token)) throw new Error(`Penanda ${token} tidak ditemukan di template.`);
    return html.split(token).join(value);
  };
  let html = template;
  html = replace(html, '/*@@CORE@@*/', core);
  html = replace(html, '/*@@SEED@@*/null', seed ? safeJSON(seed) : 'null');
  html = replace(html, '/*@@SEED_SUMBER@@*/""', safeJSON(sumber || ''));
  html = replace(html, '/*@@GUIDE@@*/""', safeJSON(guide));
  html = replace(html, '@@CSP@@', buildCSP(html));
  if (/@@[A-Z_]+@@/.test(html)) throw new Error('Masih ada penanda build yang belum diganti.');
  return html;
}

export function serviceWorker(version) {
  return `/* Peta Aset Keluarga — service worker opsional (Fase 2).
 * Hanya menyimpan berkas aplikasi dari origin yang sama ke cache agar bisa dibuka offline.
 * Tidak pernah mengirim data pengguna; data tetap di localStorage.
 */
'use strict';
var CACHE = 'peta-aset-keluarga-${version}';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('peta-aset-keluarga-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return fetch(req).then(function (res) {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(function () {
      return cache.match(req, { ignoreSearch: true });
    });
  }));
});
`;
}

export function buildAll({ root = ROOT, outDir = join(ROOT, 'dist'), log = console.log } = {}) {
  const template = readFileSync(join(root, 'template.html'), 'utf8');
  const core = readFileSync(join(root, 'src', 'core.js'), 'utf8');
  const guide = readFileSync(join(root, 'guide.md'), 'utf8');

  const contoh = loadSeed(join(root, 'seed', 'contoh.json'), 'seed/contoh.json');
  if (!contoh) throw new Error('seed/contoh.json wajib ada untuk build distribusi.');
  const unmarked = checkContohMarked(contoh);
  if (unmarked.length) throw new Error('Entri contoh tanpa tanda "CONTOH": ' + unmarked.join(', '));

  const personalPath = join(root, 'seed', 'personal.json');
  const personal = loadSeed(personalPath, 'seed/personal.json');

  mkdirSync(outDir, { recursive: true });
  const outputs = {
    [join(root, 'index.html')]: renderApp({ template, core, guide, seed: null, sumber: '' }),
    [join(outDir, 'personal.html')]: renderApp({ template, core, guide, seed: personal, sumber: personal ? 'personal' : '' }),
    [join(outDir, 'distribusi.html')]: renderApp({ template, core, guide, seed: contoh, sumber: 'contoh' }),
    [join(outDir, 'sw.js')]: serviceWorker(Core.VERSI_APLIKASI)
  };
  for (const [path, content] of Object.entries(outputs)) writeFileSync(path, content, 'utf8');

  const count = (d) => Core.ENTITAS.filter((e) => e !== 'riwayat').map((e) => `${e} ${d[e].length}`).join(', ');
  log(`✔ index.html            (tanpa data)`);
  log(`✔ dist/personal.html    ${personal ? '(data pribadi: ' + count(personal) + ')' : '(seed/personal.json tidak ada — aplikasi kosong)'}`);
  log(`✔ dist/distribusi.html  (data CONTOH: ${count(contoh)})`);
  log(`✔ dist/sw.js            (service worker opsional)`);
  return outputs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    buildAll();
  } catch (e) {
    console.error('✖ Build gagal: ' + e.message);
    process.exit(1);
  }
}
