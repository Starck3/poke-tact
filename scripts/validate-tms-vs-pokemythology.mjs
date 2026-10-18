// Confronta ONDE cada TM/HM é obtido (derivado dos scripts do decomp em build-acquisition) com o detonado do PokeMythology.
// Para cada "TMnn" citado no detonado: (1) o decomp tem origem para esse golpe? (2) o local bate com a seção do detonado?
// Numeração por jogo, do próprio código: FRLG = TMnn_GOLPE (tmhm_learnsets.h); Emerald = ordem de FOREACH_TM/FOREACH_HM.
// Uso: node scripts/validate-tms-vs-pokemythology.mjs <jogo> → reports/<jogo>/tm-audit.json  (sem rede)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { decompPaths } from './lib/decomp.mjs';
import { parseDetonadoSections } from './lib/pokemythology.mjs';

const gameId = process.argv[2] ?? 'firered-leafgreen';
import { GAMES } from './games.mjs';
const SLUG = Object.fromEntries(Object.entries(GAMES).map(([id, g]) => [id, g.walkthrough])); // nome do detonado vem do config
const page = new URL(`../data-sources/pokemythology/${SLUG[gameId]}.html`, import.meta.url);
if (!existsSync(page)) { console.log(`[${gameId}] sem detonado em cache`); process.exit(0); }
const { read } = decompPaths(gameId);
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });

/** número do TM/HM -> constante do golpe, conforme o código do jogo */
export function tmNumbering(readFile) {
  const map = {};
  let tms = '';
  try { tms = readFile('include/constants/tms_hms.h'); } catch {}
  if (tms.includes('FOREACH_TM')) {
    const list = (name) => [...(tms.match(new RegExp(`#define ${name}\\(F\\)([\\s\\S]*?)(?:\\n\\n|#define|$)`))?.[1] ?? '').matchAll(/F\((\w+)\)/g)].map((m) => m[1]);
    list('FOREACH_TM').forEach((mv, i) => (map[`TM${String(i + 1).padStart(2, '0')}`] = mv));
    list('FOREACH_HM').forEach((mv, i) => (map[`HM${String(i + 1).padStart(2, '0')}`] = mv));
  } else {
    for (const m of readFile('src/data/pokemon/tmhm_learnsets.h').matchAll(/TMHM\((TM|HM)(\d+)_(\w+)\)/g)) map[m[1] + m[2]] = m[3];
  }
  return map;
}

const numbering = tmNumbering(read);
const acq = JSON.parse(readFileSync(new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url), 'utf8'));
const apiName = (c) => c.toLowerCase().replace(/_/g, '-');
const words = (s) => new Set(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 4 && !['city', 'town', 'island', 'route'].includes(w)));
const results = [];
for (const s of parseDetonadoSections(readFileSync(page, 'utf8'))) {
  const text = s.html.replace(/<[^>]+>/g, ' ');
  // texto "colado" para comparar nomes com pontuação diferente ("S.S. Anne" = SSAnne; "Rota 16" = Route 16)
  const glued = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\brota\b/g, 'route').replace(/[^a-z0-9]/g, '');
  const mentions = new Map(); // TMnn -> houve verbo de OBTER perto de alguma citação?
  for (const x of text.matchAll(/\b(TM|HM)\s?(\d{2})\b/g)) {
    const around = text.slice(Math.max(0, x.index - 120), x.index + 60).toLowerCase();
    const obtain = /\b(ganh|receb|peg|ach|encontr|compr|entreg|consig|obt|troc)\w*|\bd[aá]r?\b.*\b(te|voc[eê])\b/.test(around);
    const k = x[1] + x[2];
    mentions.set(k, mentions.get(k) || obtain);
  }
  for (const [m, obtain] of mentions) {
    const mv = numbering[m];
    const sources = mv ? acq.machines[apiName(mv)] : null;
    // local bate se a origem compartilha palavra significativa com a seção, ou se o 1º nome da origem aparece no texto colado
    const secWords = new Set([...words(s.title), ...words(text)]);
    const place = sources?.find((src) => [...words(src.where)].some((w) => secWords.has(w)) || glued.includes(src.where.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 2).join('')));
    const status = !mv ? 'SEM_NUMERO' : !sources ? 'SEM_ORIGEM_NO_DECOMP' : !obtain ? 'CITADO_SEM_OBTER' : place ? 'LOCAL_CONFERE' : 'LOCAL_DIFERENTE';
    results.push({ tm: m, move: mv, section: s.title, status, decomp: sources?.map((x) => x.where) ?? [] });
  }
}
writeFileSync(new URL(`../reports/${gameId}/tm-audit.json`, import.meta.url), JSON.stringify(results, null, 1));
const by = {};
for (const r of results) by[r.status] = (by[r.status] ?? 0) + 1;
console.log(`[${gameId}] TMs citados no detonado: ${results.length}`, by);
for (const r of results.filter((x) => x.status !== 'LOCAL_CONFERE')) console.log(`  ${r.status}: ${r.tm} ${r.move ?? ''} (seção ${r.section}) → decomp: ${r.decomp.join(' | ') || '—'}`);
