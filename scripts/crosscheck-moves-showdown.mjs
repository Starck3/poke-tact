// E3 — Gens 5–8 sem decomp: confere os golpes do dataset (PokéAPI + past_values) com o Pokémon Showdown por geração.
//   Showdown: data/moves.ts = Gen 9; data/mods/genN/moves.ts = só o que a geração N tem de diferente da N+1 ("inherit: true").
//   Valor na geração G = base ← mod gen8 ← … ← mod genG. Leitura como TEXTO (sem executar o arquivo baixado).
//   Ligação pelo "num" (= id nacional do golpe, o mesmo da PokéAPI).
// Regra (docs/PLANO.md E3): só SINALIZA; corrige apenas com 2ª evidência — o valor do Showdown na Gen 4 bate com o decomp do
// Platinum (public/data/platinum.json, já corrigido) e não muda da Gen 4 até G (a mudança é posterior a G: falta de histórico
// na PokéAPI, ex.: PP 10 → 5 do Recover na Gen 9). Mudanças entre a Gen 4 e G ficam só sinalizadas.
// Uso: node scripts/crosscheck-moves-showdown.mjs <jogo>   → reports/<jogo>/moves-crosscheck.json (+ correções no dataset)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { SHOWDOWN_COMMIT, SHOWDOWN_FILES } from './fetch-showdown-moves.mjs';

const gameId = process.argv[2];
const game = GAMES[gameId];
const G = game?.generation;
// Let's Go e Legends: Arceus têm mecânica própria (o Showdown usa mods separados) → fora
if (!game || G < 5 || G > 8 || /lets-go|legends-arceus/.test(gameId)) { console.log(`[${gameId}] fora do E3 (Gen ${G})`); process.exit(0); }
const dir = new URL(`../data-sources/showdown/${SHOWDOWN_COMMIT}/`, import.meta.url);
const file = (f) => new URL(f.replace(/\//g, '__'), dir);
if (!SHOWDOWN_FILES.every((f) => existsSync(file(f)))) { console.log(`[${gameId}] sem dados do Showdown — rode scripts/fetch-showdown-moves.mjs`); process.exit(0); }

const FIELDS = { basePower: 'power', accuracy: 'accuracy', pp: 'pp', priority: 'priority', type: 'type', category: 'category' };
// entradas de 1º nível começam com "\t<id>: {" e terminam em "\t},"; campos simples ficam em "\t\t<campo>: <valor>,"
function parseMoves(text) {
  const out = {};
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const top = line.match(/^\t([a-z0-9]+): \{$/);
    if (top) { cur = out[top[1]] = {}; continue; }
    if (/^\t\},?$/.test(line)) { cur = null; continue; }
    const f = cur && line.match(/^\t\t(num|basePower|accuracy|pp|priority|type|category): (.+?),$/);
    if (f) cur[f[1]] = f[2] === 'true' ? true : /^-?\d+$/.test(f[2]) ? Number(f[2]) : f[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const base = parseMoves(readFileSync(file('data/moves.ts'), 'utf8'));
const mods = Object.fromEntries([8, 7, 6, 5, 4].map((g) => [g, parseMoves(readFileSync(file(`data/mods/gen${g}/moves.ts`), 'utf8'))]));
const at = (id, g) => { const v = { ...base[id] }; for (let k = 8; k >= g; k--) Object.assign(v, mods[k][id] ?? {}); return v; };
const norm = (f, v) => (f === 'accuracy' ? (v === true ? null : v) : f === 'basePower' ? (v > 1 ? v : null) : typeof v === 'string' ? v.toLowerCase() : v);
const byNum = new Map(Object.entries(base).filter(([, m]) => m.num > 0).map(([id, m]) => [m.num, id]));

const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const pt = existsSync(new URL('../public/data/platinum.json', import.meta.url)) ? JSON.parse(readFileSync(new URL('../public/data/platinum.json', import.meta.url), 'utf8')) : null;
const idOf = (n) => JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id;
const flagged = [], corrected = [];
let compared = 0;
for (const [name, mv] of Object.entries(data.moves)) {
  // pelo nome primeiro: o Showdown tem variantes com o mesmo num (hiddenpowerwater… = 237)
  const sid = base[name.replace(/-/g, '')]?.num === idOf(name) ? name.replace(/-/g, '') : byNum.get(idOf(name));
  if (!sid) continue;
  compared++;
  const sd = at(sid, G), s4 = at(sid, 4);
  for (const [sf, f] of Object.entries(FIELDS)) {
    if (sd[sf] === undefined) continue;
    const want = norm(sf, sd[sf]);
    // poder/precisão variáveis: a PokéAPI traz null e o Showdown 0/true — só compara quando os dois têm número
    if ((f === 'power' || f === 'accuracy') && (mv[f] == null || want == null)) continue;
    if (mv[f] === want) continue;
    const d = { move: name, field: f, pokeapi: mv[f], showdown: want };
    const ptVal = pt?.moves[name]?.[f];
    const sameSince4 = norm(sf, s4[sf]) === want;
    if (pt && ptVal !== undefined && ptVal === norm(sf, s4[sf]) && sameSince4 && !(f === 'category' && mv.category === 'status' && want !== 'status')) {
      corrected.push({ ...d, evidence: `Showdown Gen ${G} = Gen 4 = decomp do Platinum (${ptVal})` });
      mv[f] = want;
    } else flagged.push({ ...d, why: !pt || ptVal === undefined ? 'golpe sem valor no Platinum (posterior à Gen 4)' : !sameSince4 ? `mudou entre a Gen 4 e a Gen ${G} (Showdown Gen 4 = ${norm(sf, s4[sf])})` : `Showdown Gen 4 (${norm(sf, s4[sf])}) ≠ decomp do Platinum (${ptVal})` });
  }
}
data.moveCrosscheck = { source: `Pokémon Showdown @${SHOWDOWN_COMMIT.slice(0, 7)} (Gen ${G}) + decomp do Platinum como 2ª evidência`, corrected: corrected.length, flagged: flagged.length, list: corrected };
writeFileSync(dataFile, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/moves-crosscheck.json`, import.meta.url), JSON.stringify({ source: data.moveCrosscheck.source, compared, corrected, flagged }, null, 1));
console.log(`[${gameId}] Gen ${G}: ${compared} golpes conferidos; ${corrected.length} corrigidos (${corrected.slice(0, 12).map((c) => `${c.move}.${c.field} ${c.pokeapi}→${c.showdown}`).join(', ')}); ${flagged.length} só sinalizados`);
