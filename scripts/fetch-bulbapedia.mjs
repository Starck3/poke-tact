// Baixa (devagar) as páginas "Generation III learnset" da Bulbapedia para data-sources/bulbapedia/gen3/.
// Regras: ≥5 s entre requisições (Crawl-delay do robots.txt), User-Agent identificado, e PARA no primeiro
// erro HTTP (403/429/etc.) sem tentar de novo. Retoma do que já está no disco. Gera manifest.json (url, data, sha256).
// Uso: node scripts/fetch-bulbapedia.mjs
// Licença da fonte: CC BY-NC-SA — uso local para validação; não redistribuir (pasta fora do controle de versão).
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DELAY_MS = 5000;
const UA = 'poke-tact-validation/0.1 (personal project; slow resumable fetch; respects Crawl-delay 5)';
const DIR = new URL('../data-sources/bulbapedia/gen3/', import.meta.url);
const MANIFEST = new URL('../data-sources/bulbapedia/gen3-manifest.json', import.meta.url);
await mkdir(DIR, { recursive: true });

const data = JSON.parse(await readFile(new URL('../public/data/firered-leafgreen.json', import.meta.url), 'utf8'));
const audit = JSON.parse(await readFile(new URL('../reports/learnset-audit.json', import.meta.url), 'utf8'));
const skip = new Set(audit.missingInShowdown); // espécies que não existem no FRLG segundo o Showdown
const targets = data.pokemon.filter((p) => !skip.has(p.name));

const TITLE = { 'mr-mime': 'Mr._Mime', 'nidoran-f': 'Nidoran♀', 'nidoran-m': 'Nidoran♂', farfetchd: "Farfetch'd", 'ho-oh': 'Ho-Oh', porygon2: 'Porygon2', 'deoxys-normal': 'Deoxys' };
const title = (n) => TITLE[n] ?? n.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('-');
const urlFor = (mon) => `https://bulbapedia.bulbagarden.net/w/index.php?title=${encodeURIComponent(title(mon.name) + '_(Pokémon)')}/Generation_III_learnset&action=raw`;
const sha = (t) => createHash('sha256').update(t).digest('hex');

const manifest = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, 'utf8')) : {};
const save = () => writeFile(MANIFEST, JSON.stringify(manifest, null, 1));

// Páginas já existentes no disco entram no manifesto (data = mtime do arquivo).
for (const f of await readdir(DIR)) {
  const id = f.replace('.txt', '');
  if (manifest[id]) continue;
  const mon = data.pokemon.find((p) => String(p.id) === id);
  const text = await readFile(new URL(f, DIR), 'utf8');
  manifest[id] = { name: mon?.name, url: mon && urlFor(mon), fetchedAt: (await stat(new URL(f, DIR))).mtime.toISOString(), sha256: sha(text), note: 'importado do cache anterior' };
}
await save();

let fetched = 0;
let blocked = false;
for (const mon of targets) {
  if (existsSync(new URL(`${mon.id}.txt`, DIR))) continue;
  await new Promise((r) => setTimeout(r, DELAY_MS));
  const res = await fetch(urlFor(mon), { headers: { 'user-agent': UA } });
  if (!res.ok) {
    await save();
    console.error(`PARADO: HTTP ${res.status} em ${mon.name} (#${mon.id}). Nada mais foi requisitado. Baixadas nesta execução: ${fetched}.`);
    await res.body?.cancel();
    process.exitCode = 2; // sem process.exit(): evita crash do libuv no Windows com requisição pendente
    blocked = true;
    break;
  }
  const text = await res.text();
  await writeFile(new URL(`${mon.id}.txt`, DIR), text);
  manifest[mon.id] = { name: mon.name, url: urlFor(mon), fetchedAt: new Date().toISOString(), sha256: sha(text) };
  fetched++;
  if (fetched % 10 === 0) await save();
}
await save();
if (!blocked) {
const have = targets.filter((p) => existsSync(new URL(`${p.id}.txt`, DIR))).length;
console.log(`OK: ${have}/${targets.length} páginas em data-sources/bulbapedia/gen3 (${fetched} baixadas agora).`);
}
