// Baixa (devagar) o índice de detonados do PokeMythology e os detonados dos jogos pedidos.
// Regras: robots.txt permite /detonados/ (evitar /?blackhole); ≥5 s entre requisições; para no 1º erro HTTP;
// cache em data-sources/pokemythology/ com manifesto (url, data, sha256). Conteúdo: uso local para validação (fora do git).
// Uso: node scripts/fetch-pokemythology.mjs [slug ...]   (sem slugs: só o índice + FRLG + Emerald)
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseDetonadoIndex } from './lib/pokemythology.mjs';

const DELAY_MS = 5000;
const UA = 'poke-tact-validation/0.1 (personal project; slow, cached; respects robots.txt)';
const BASE = 'https://www.pokemythology.net/detonados/';
const DIR = new URL('../data-sources/pokemythology/', import.meta.url);
const MANIFEST = new URL('manifest.json', DIR);
await mkdir(DIR, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, 'utf8')) : {};
let last = 0;

async function get(name, url) {
  const file = new URL(`${name}.html`, DIR);
  if (existsSync(file)) return readFile(file, 'utf8');
  const wait = last + DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status} em ${url}`); }
  const text = await res.text();
  await writeFile(file, text);
  manifest[name] = { url, fetchedAt: new Date().toISOString(), sha256: createHash('sha256').update(text).digest('hex'), bytes: text.length };
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 1));
  return text;
}

try {
  const index = await get('_indice', BASE);
  const list = parseDetonadoIndex(index);
  await writeFile(new URL('_detonados.json', DIR), JSON.stringify(list, null, 1));
  const slugs = list.map((d) => d.slug);
  console.log(`índice: ${slugs.length} detonados`);
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['detonado-firered-leafgreen', 'detonado-emerald'];
  for (const s of wanted) {
    if (!slugs.includes(s)) { console.log(`  ${s}: não está no índice`); continue; }
    const html = await get(s, list.find((d) => d.slug === s).url);
    console.log(`  ${s}: ${html.length} bytes`);
  }
} catch (e) {
  console.error('PARADO:', e.message, '— nada mais foi requisitado.');
  process.exitCode = 2;
}
