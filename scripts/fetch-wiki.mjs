// Récupère les pages "souvenir" (Memory) et "personnage" du wiki Fandom
// JJK Phantom Parade via son API MediaWiki publique, et enregistre le
// wikitexte brut dans data/wiki-raw.json. Le parsing est fait par build-data.mjs.
import fs from 'node:fs/promises';

const API = 'https://jjk-phantom-parade.fandom.com/api.php';
const UA = 'jjk-souvenirs/1.0 (outil de fan personnel; https://github.com/dandoyloic-cmd/jjk-souvenirs)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    console.warn(`HTTP ${res.status} (essai ${attempt}) ${url}`);
    await sleep(2000 * attempt);
  }
  throw new Error(`Échec API: ${url}`);
}

async function embeddedIn(template) {
  const titles = [];
  let cont = {};
  do {
    const data = await api({ action: 'query', list: 'embeddedin', eititle: template, einamespace: '0', eilimit: 'max', ...cont });
    titles.push(...data.query.embeddedin.map((p) => p.title));
    cont = data.continue || null;
  } while (cont);
  return titles;
}

async function contents(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: batch.join('|') });
    for (const p of data.query.pages) {
      out.push({ title: p.title, wikitext: p.revisions?.[0]?.slots?.main?.content ?? '' });
    }
    await sleep(500);
  }
  return out;
}

async function imageUrls(files) {
  const map = {};
  const uniq = [...new Set(files.filter(Boolean))].map((f) => (f.startsWith('File:') ? f : `File:${f}`));
  for (let i = 0; i < uniq.length; i += 50) {
    const data = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '240', titles: uniq.slice(i, i + 50).join('|') });
    for (const n of data.query.normalized || []) map[n.from] = n.to;
    for (const p of data.query.pages) {
      const info = p.imageinfo?.[0];
      if (info) map[p.title] = info.thumburl || info.url;
    }
    await sleep(500);
  }
  return map;
}

const memoryTitles = await embeddedIn('Template:Memory Page');
console.log(`${memoryTitles.length} pages de souvenirs`);
const memories = await contents(memoryTitles);

const charTemplates = ['Template:Character Page', 'Template:Character Page (Adjustment)', 'Template:Character Page (Second Adjustment)', 'Template:Character Page (SP Awaken Character)'];
const charTitles = [...new Set((await Promise.all(charTemplates.map(embeddedIn))).flat())];
console.log(`${charTitles.length} pages de personnages`);
const characters = await contents(charTitles);

// Images : champ "Art" (souvenirs) / "Icon" (personnages) quand présent
const field = (wt, name) => wt.match(new RegExp(`^\\s*\\|\\s*${name}\\s*=\\s*(.+)$`, 'mi'))?.[1].trim();
const files = [
  ...memories.map((m) => field(m.wikitext, 'Art')),
  ...characters.map((c) => field(c.wikitext, 'Icon')),
];
const images = await imageUrls(files);

await fs.mkdir('data', { recursive: true });
await fs.writeFile('data/wiki-raw.json', JSON.stringify({ fetchedAt: new Date().toISOString(), memories, characters, images }, null, 1));
console.log('OK data/wiki-raw.json');
