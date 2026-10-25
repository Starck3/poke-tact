// E3 — baixa (devagar) os dados de golpes do Pokémon Showdown, fixados num commit: data/moves.ts (Gen 9) e as correções por
// geração data/mods/gen4…gen8/moves.ts (cada mod só traz o que muda em relação à geração seguinte).
// Regras: ≥5 s entre requisições; para no 1º erro HTTP; cache em data-sources/showdown/<commit>/ com manifesto (sha256).
// Uso local para conferência (fora do git; o Showdown é MIT, mas não redistribuímos os arquivos).
// Uso: node scripts/fetch-showdown-moves.mjs
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export const SHOWDOWN_COMMIT = '7244fe8e28fa8bc4d0809ae30d183c608b62bb2b';
export const SHOWDOWN_FILES = ['data/moves.ts', ...[8, 7, 6, 5, 4].map((g) => `data/mods/gen${g}/moves.ts`), 'sim/dex-moves.ts', 'sim/battle-actions.ts']; // dex-moves: poder dos golpes Z e Max; battle-actions: STAB do Terastal
const DIR = new URL(`../data-sources/showdown/${SHOWDOWN_COMMIT}/`, import.meta.url);
const UA = 'poke-tact-validation/0.1 (personal project; slow, cached)';

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('fetch-showdown-moves.mjs')) {
  await mkdir(DIR, { recursive: true });
  const manifestFile = new URL('manifest.json', DIR);
  const manifest = existsSync(manifestFile) ? JSON.parse(await readFile(manifestFile, 'utf8')) : {};
  let last = 0;
  for (const f of SHOWDOWN_FILES) {
    const file = new URL(f.replace(/\//g, '__'), DIR);
    if (existsSync(file)) { console.log(`já em cache: ${f}`); continue; }
    const wait = last + 5000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const url = `https://raw.githubusercontent.com/smogon/pokemon-showdown/${SHOWDOWN_COMMIT}/${f}`;
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (!res.ok) { await res.body?.cancel(); console.error(`HTTP ${res.status} em ${url} — parando`); process.exit(1); }
    const text = await res.text();
    await writeFile(file, text);
    manifest[f] = { url, fetchedAt: new Date().toISOString(), sha256: createHash('sha256').update(text).digest('hex'), bytes: text.length };
    await writeFile(manifestFile, JSON.stringify(manifest, null, 1));
    console.log(`${f}: ${text.length} bytes`);
  }
}
