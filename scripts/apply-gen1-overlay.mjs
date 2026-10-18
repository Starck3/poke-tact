// Aplica ao dataset da Gen 1 (PokéAPI) o que o decomp em assembly sabe e a PokéAPI não guarda bem:
//   • PP/poder/precisão/tipo dos golpes (ex.: Rest e Soft-Boiled têm PP 10 na Gen 1; a PokéAPI dá 5)
//   • ORDEM do learnset (importa para o moveset padrão) e evoluções (nível mínimo, item, troca)
// Cada correção fica registrada em data.corrections. Uso: node scripts/apply-gen1-overlay.mjs <jogo>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadGen1 } from './lib/gen1-asm.mjs';

const gameId = process.argv[2] ?? 'red-blue';
const game = GAMES[gameId];
const g = loadGen1(new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url));
const file = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const idOf = (n) => JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id;
const apiById = new Map(Object.keys(data.moves).map((n) => [idOf(n), n]));
const corrections = [];

for (const [name, mv] of Object.entries(data.moves)) {
  const d = g.moves[idOf(name)];
  if (!d) continue;
  const fix = (k, v) => { if (mv[k] !== v) { corrections.push({ move: name, field: k, from: mv[k], to: v }); mv[k] = v; } };
  fix('pp', d.pp);
  fix('type', d.type);
  if (d.power > 1) fix('power', d.power);
  // precisão null = "nunca erra" (Swift): o decomp guarda 100 mas o efeito SWIFT_EFFECT ignora a precisão — manter null
  if (mv.power && d.power > 1 && mv.accuracy != null) fix('accuracy', d.accuracy);
}

const byDex = new Map(data.pokemon.map((p) => [p.id, p]));
const dexOfName = Object.fromEntries(Object.entries(g.species).map(([dex, s]) => [s.name, Number(dex)]));
let reordered = 0;
for (const mon of data.pokemon) {
  const d = g.species[mon.id];
  if (!d?.levelOrdered) continue;
  const seen = new Set();
  const level = d.levelOrdered.map(([lv, mvc]) => ({ move: apiById.get(g.moveId[mvc]), method: 'level-up', level: lv })).filter((l) => l.move && !seen.has(l.move + '@' + l.level) && seen.add(l.move + '@' + l.level));
  mon.learnset = [...level, ...mon.learnset.filter((l) => l.method !== 'level-up')];
  mon.levelUpInGameOrder = true; // likelyMoveset segue WriteMonMoves: sem reordenar, para no 1º nível maior
  reordered++;
}
// evoluções a partir do decomp: EVOLVE_LEVEL nível; EVOLVE_ITEM pedra; EVOLVE_TRADE troca
const evoInfo = {};
for (const s of Object.values(g.species)) for (const e of s.evo ?? []) {
  const to = dexOfName[e.to];
  if (to) evoInfo[to] = e.kind === 'EVOLVE_LEVEL' ? { kind: 'LEVEL', param: Number(e.param), possible: true } : e.kind === 'EVOLVE_ITEM' ? { kind: 'ITEM', param: e.param, possible: true } : { kind: 'TRADE', param: '0', possible: true };
}
const minLevel = (mon) => { const parent = byDex.get(mon.evolvesFrom); const own = evoInfo[mon.id]?.kind === 'LEVEL' ? evoInfo[mon.id].param : 0; return Math.max(parent ? minLevel(parent) : 1, own, 1); };
for (const mon of data.pokemon) { mon.evo = evoInfo[mon.id] ?? null; mon.minLevel = minLevel(mon); }

// Iniciais: constants/pokemon_constants.asm (Red/Blue: DEF STARTER1..3 EQU; Yellow: DEF STARTER_PIKACHU EQU — RIVAL_STARTER_* são
// índices do rival, não espécies) e o nível do "ld a, N / ld [wCurEnemyLevel], a" antes do AddPartyMon em scripts/OaksLab.asm.
const read = (p) => readFileSync(new URL(`../data-sources/${game.asmDecomp.dir}/${p}`, import.meta.url), 'utf8');
const starterConsts = [...read('constants/pokemon_constants.asm').matchAll(/^DEF (STARTER\w*)\s+EQU\s+(\w+)/gm)].map((m) => m[2]);
const lab = read('scripts/OaksLab.asm');
const starterLevel = Number(lab.match(/ld a, (\d+)\s*\n\s*ld \[wCurEnemyLevel\], a[\s\S]{0,200}?call AddPartyMon/)?.[1]);
const starterIds = starterConsts.map((c) => dexOfName[c]).filter(Boolean).sort((a, b) => a - b);
if (!starterIds.length || !starterLevel) throw new Error(`[${gameId}] iniciais não encontrados no decomp`);
data.starters = { where: 'Pallet Town — Laboratório do Prof. Oak', level: starterLevel, species: starterIds.map((id) => byDex.get(id).name) };

const all = [...(data.corrections?.list ?? []), ...corrections]; // idempotente: rodar de novo não perde o registro
data.corrections = { source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, list: all };
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/overlay-corrections.json`, import.meta.url), JSON.stringify(all, null, 1));
console.log(`[${gameId}] iniciais nv ${starterLevel}: ${data.starters.species.join(', ')}; ${reordered} learnsets na ordem do jogo; ${corrections.length} correções de golpes: ${corrections.map((c) => `${c.move}.${c.field} ${c.from}→${c.to}`).join(', ')}`);
