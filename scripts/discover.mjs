// Ouvre jjkppdb.com dans un vrai navigateur (Playwright) et enregistre
// tout ce que le site charge, pour comprendre la structure des données.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = 'raw';
const PAGES = [
  'https://www.jjkppdb.com/recollection-bits',
];

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (jjk-souvenirs personal fan tool)' });
const responses = [];
let n = 0;

page.on('response', async (res) => {
  const url = res.url();
  const type = res.headers()['content-type'] || '';
  const entry = { url, status: res.status(), type };
  responses.push(entry);
  if (/json|javascript|text\/plain|x-component/.test(type) && !/google|analytics|gtag|ads/.test(url)) {
    try {
      const body = await res.text();
      const ext = type.includes('json') ? 'json' : type.includes('javascript') ? 'js' : 'txt';
      const file = `resp-${String(++n).padStart(3, '0')}.${ext}`;
      await fs.writeFile(path.join(OUT, file), body);
      entry.file = file;
      entry.size = body.length;
    } catch {}
  }
});

for (const url of PAGES) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);
  // fait défiler pour déclencher un éventuel chargement progressif
  for (let i = 0; i < 15; i++) { await page.mouse.wheel(0, 4000); await page.waitForTimeout(400); }
  const slug = new URL(url).pathname.replace(/\W+/g, '_') || 'home';
  await fs.writeFile(path.join(OUT, `page${slug}.html`), await page.content());
  await fs.writeFile(path.join(OUT, `page${slug}.txt`), await page.innerText('body'));
  const links = await page.$$eval('a[href]', (as) => [...new Set(as.map((a) => a.href))]);
  await fs.writeFile(path.join(OUT, `links${slug}.json`), JSON.stringify(links, null, 2));
  await page.screenshot({ path: path.join(OUT, `shot${slug}.png`), fullPage: false });

  // ouvre la première fiche individuelle trouvée
  const detail = links.find((l) => /recollection-bits\/./.test(l));
  if (detail) {
    await page.goto(detail, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2000);
    await fs.writeFile(path.join(OUT, 'detail.html'), await page.content());
    await fs.writeFile(path.join(OUT, 'detail.txt'), await page.innerText('body'));
    await fs.writeFile(path.join(OUT, 'detail-url.txt'), detail);
  }
}

await fs.writeFile(path.join(OUT, 'responses.json'), JSON.stringify(responses, null, 2));
await browser.close();
console.log(`OK: ${responses.length} réponses, ${n} enregistrées`);
