// HeartGold/SoulSilver (PokéAPI) ← decomp pret/pokeheartgold: golpes (PP, poder, precisão, tipo, prioridade, categoria) e
// learnset por nível na ORDEM do jogo (moveset padrão) lidos dos binários do próprio jogo (waza_tbl.narc, wotbl.narc — ver
// scripts/lib/narc.mjs), habilidades, evoluções e nível mínimo (texto).
// Antes os golpes vinham do pokeplatinum e o learnset da PokéAPI; os golpes batem 100% com o Platinum, mas o learnset do
// HGSS difere do Platinum em 13 espécies (Cyndaquil, Lugia, Ho-Oh…).
// Uso: node scripts/apply-hgss-overlay.mjs <jogo>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadHgss } from './lib/gen4-hgss.mjs';

const gameId = process.argv[2] ?? 'heartgold-soulsilver';
const game = GAMES[gameId];
const g = loadHgss(new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url));
const file = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const idOf = (n) => JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id;
const apiById = new Map(Object.keys(data.moves).map((n) => [idOf(n), n]));
const corrections = [];
for (const [name, mv] of Object.entries(data.moves)) {
  const d = g.moves[idOf(name)];
  if (!d) continue;
  const fix = (k, v) => { if (mv[k] !== v) { corrections.push({ move: name, field: k, from: mv[k], to: v }); mv[k] = v; } };
  fix('pp', d.pp); fix('type', d.type); fix('priority', d.priority);
  if (mv.category !== 'status' || d.category === 'status') fix('category', d.category);
  if (mv.power != null && d.power > 1) fix('power', d.power);
  if (mv.accuracy != null && d.accuracy > 0) fix('accuracy', d.accuracy);
}
// habilidades: grafia do decomp sem hífen (COMPOUNDEYES) — só troca se a lista diferir de fato
const nh = (l) => [...l].map((x) => x.replace(/-/g, '')).sort().join();
for (const mon of data.pokemon) {
  const d = g.species[mon.id];
  if (!d) continue;
  // learnset por nível do jogo, na ordem do jogo (o moveset padrão de um treinador sai dos 4 últimos aprendidos)
  const seen = new Set();
  const level = d.levelOrdered.map(([lv, id]) => ({ move: apiById.get(id), method: 'level-up', level: lv })).filter((l) => l.move && !seen.has(l.move + '@' + l.level) && seen.add(l.move + '@' + l.level));
  const before = mon.learnset.filter((l) => l.method === 'level-up').map((l) => `${l.move}@${l.level}`).sort().join();
  if (before !== level.map((l) => `${l.move}@${l.level}`).sort().join()) corrections.push({ pokemon: mon.name, field: 'learnset', from: before.split(',').length, to: level.length });
  mon.learnset = [...level, ...mon.learnset.filter((l) => l.method !== 'level-up')];
  mon.levelUpInGameOrder = true;
  if (nh(mon.abilities) !== nh(d.abilities)) { corrections.push({ pokemon: mon.name, field: 'abilities', from: mon.abilities.join('/'), to: d.abilities.join('/') }); mon.abilities = d.abilities; }
}
const byDex = new Map(data.pokemon.map((p) => [p.id, p]));
const evoInfo = {};
// evolução por lugar (Moss Rock, Ice Rock, Mt. Coronet): no HGSS o mapa nunca dá o método — MapHeader_GetMapEvolutionMethod
// devolve sempre EVO_NONE ("Leftover from D/P/Pl.") → Leafeon, Glaceon, Magnezone e Probopass não evoluem
const mapEvo = readFileSync(new URL(`../data-sources/${game.asmDecomp.dir}/src/map_header.c`, import.meta.url), 'utf8').match(/MapHeader_GetMapEvolutionMethod\([^)]*\)\s*\{([^}]*)\}/)?.[1] ?? '';
const noMapEvo = /^\s*(\/\/[^\n]*\n\s*)*return EVO_NONE;\s*$/.test(mapEvo);
for (const s of Object.values(g.species)) for (const e of s.evo) {
  const to = g.speciesId[e.to];
  if (!to) continue;
  const param = /^LEVEL/.test(e.kind) ? Number(e.param) : typeof e.param === 'string' ? e.param.replace(/^(ITEM|MOVE|SPECIES)_/, '') : e.param == null || e.param === 0 ? null : String(e.param); // sem parâmetro (Umbreon, Magnezone) → null, não "null"
  evoInfo[to] = { kind: e.kind, param, possible: !(noMapEvo && e.kind === 'LOCATION'), raw: e.raw };
}
const minLevel = (mon) => { const parent = byDex.get(mon.evolvesFrom); const own = /^LEVEL/.test(evoInfo[mon.id]?.kind ?? '') ? evoInfo[mon.id].param : 0; return Math.max(parent ? minLevel(parent) : 1, own, 1); };
for (const mon of data.pokemon) { mon.evo = evoInfo[mon.id] ?? null; mon.minLevel = minLevel(mon); }
const all = [...(data.corrections?.list ?? []), ...corrections];
data.corrections = { source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, list: all };
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/overlay-corrections.json`, import.meta.url), JSON.stringify(all, null, 1));
console.log(`[${gameId}] learnsets na ordem do jogo; ${corrections.length} correções: ${corrections.slice(0, 25).map((c) => `${c.move ?? c.pokemon}.${c.field} ${c.from}→${c.to}`).join(', ')}`);
