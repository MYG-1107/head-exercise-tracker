const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = ['index.html', 'guide.html', 'privacy.html', 'safety.html'];

test('all page IDs are unique and statically referenced IDs exist', () => {
  const html = read('index.html');
  const js = read('script.js');
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate HTML id found');
  const referenced = [...js.matchAll(/\$\(["']([^"']+)["']\)/g)].map(match => match[1]);
  const missing = [...new Set(referenced)].filter(id => !ids.includes(id));
  assert.deepEqual(missing, [], `Missing static DOM IDs: ${missing.join(', ')}`);
});

test('all public pages have distinct titles, descriptions and canonical URLs', () => {
  const titles = [];
  for (const page of pages) {
    const html = read(page);
    const title = html.match(/<title>(.*?)<\/title>/is)?.[1];
    const desc = html.match(/<meta name="description" content="([^"]+)"/i)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    assert.ok(title, `${page}: title missing`);
    assert.ok(desc && desc.length >= 70, `${page}: description missing/too short`);
    assert.ok(canonical, `${page}: canonical missing`);
    titles.push(title);
  }
  assert.equal(new Set(titles).size, titles.length, 'page titles must be unique');
});

test('sitemap lists every indexable page and matches canonical locations', () => {
  const sitemap = read('sitemap.xml');
  for (const page of pages) {
    const canonical = read(page).match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    const expected = page === 'index.html' ? 'https://myg-1107.github.io/head-exercise-tracker/' : `https://myg-1107.github.io/head-exercise-tracker/${page}`;
    assert.equal(canonical, expected, `${page}: unexpected canonical`);
    assert.ok(sitemap.includes(`<loc>${expected}</loc>`), `${page} missing from sitemap`);
  }
  assert.ok(read('robots.txt').includes('Sitemap: https://myg-1107.github.io/head-exercise-tracker/sitemap.xml'));
});

test('internal links point to files that exist', () => {
  for (const page of pages) {
    const html = read(page);
    const hrefs = [...html.matchAll(/href="([^"#]+)"/g)].map(match => match[1]);
    for (const href of hrefs) {
      if (/^(https?:|mailto:|data:|javascript:|\/\/)/i.test(href)) continue;
      const clean = href.split('?')[0];
      assert.ok(fs.existsSync(path.join(root, clean)), `${page} has a broken internal link: ${href}`);
    }
  }
});

test('privacy-sensitive uploads and persistent session storage are absent', () => {
  const js = read('script.js');
  assert.doesNotMatch(js, /cloudinary|upload_preset|sendBeacon|XMLHttpRequest|\bfetch\s*\(/i);
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie/i);
  assert.match(js, /exportSessionSummary/);
  assert.match(js, /serviceWorker\.register/);
});

test('manifest and service worker include the offline app shell', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  const worker = read('sw.js');
  for (const file of ['index.html', 'guide.html', 'privacy.html', 'safety.html', 'tracker-core.js']) assert.ok(worker.includes(file));
  assert.match(worker, /url\.origin !== self\.location\.origin/);
});


test('structured data is valid JSON and identifies the canonical page URL', () => {
  for (const page of pages) {
    const html = read(page);
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    assert.ok(match, `${page}: structured data missing`);
    const data = JSON.parse(match[1]);
    assert.equal(data.url, page === 'index.html' ? 'https://myg-1107.github.io/head-exercise-tracker/' : `https://myg-1107.github.io/head-exercise-tracker/${page}`);
  }
});

test('sitemap is well-formed XML and app manifest is parseable JSON', () => {
  const sitemap = read('sitemap.xml');
  assert.match(sitemap, /^<\?xml/);
  assert.equal((sitemap.match(/<url>/g) || []).length, 4);
  assert.match(read('manifest.webmanifest'), /"display": "standalone"/);
});
