// Diamond/Pearl (PokéAPI) ← decomp pret/pokediamond (JSON): golpes (PP, poder, precisão, tipo, prioridade, categoria),
// learnset por nível na ORDEM do jogo (moveset padrão), habilidades, evoluções e nível mínimo.
// Uso: node scripts/apply-dp-overlay.mjs <jogo>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadDp } from './lib/gen4-dp.mjs';

const gameId = process.argv[2] ?? 'diamond-pearl';
const game = GAMES[gameId];
const g = loadDp(new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url));
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
  if (mv.power != null && d.power > 1) fix('power', d.power); // 0/1 = variável/fixo → mantém null da PokéAPI
  if (mv.accuracy != null && d.accuracy > 0) fix('accuracy', d.accuracy); // 0 = nunca erra
}
const nh = (l) => [...l].map((x) => x.replace(/-/g, '')).sort().join();
const byDex = new Map(data.pokemon.map((p) => [p.id, p]));
for (const mon of data.pokemon) {
  const d = g.species[mon.id];
  if (!d) continue;
  const seen = new Set();
  const level = d.levelOrdered.map(([lv, id]) => ({ move: apiById.get(id), method: 'level-up', level: lv })).filter((l) => l.move && !seen.has(l.move + '@' + l.level) && seen.add(l.move + '@' + l.level));
  const before = mon.learnset.filter((l) => l.method === 'level-up').map((l) => `${l.move}@${l.level}`).sort().join();
  if (before !== level.map((l) => `${l.move}@${l.level}`).sort().join()) corrections.push({ pokemon: mon.name, field: 'learnset', from: before.split(',').length, to: level.length });
  mon.learnset = [...level, ...mon.learnset.filter((l) => l.method !== 'level-up')];
  mon.levelUpInGameOrder = true;
  if (nh(mon.abilities) !== nh(d.abilities)) { corrections.push({ pokemon: mon.name, field: 'abilities', from: mon.abilities.join('/'), to: d.abilities.join('/') }); mon.abilities = d.abilities; }
}
const evoInfo = {};
for (const s of Object.values(g.species)) for (const e of s.evo) {
  const to = g.byName[e.to];
  if (!to) continue;
  const param = /^LEVEL/.test(e.kind) ? Number(e.param) : typeof e.param === 'string' ? e.param.replace(/^(ITEM|MOVE|SPECIES)_/, '') : e.param == null || e.param === 0 ? null : String(e.param); // sem parâmetro (Umbreon, Magnezone) → null, não "null"
  evoInfo[to] = { kind: e.kind, param, possible: true, raw: e.raw };
}
const minLevel = (mon) => { const parent = byDex.get(mon.evolvesFrom); const own = /^LEVEL/.test(evoInfo[mon.id]?.kind ?? '') ? evoInfo[mon.id].param : 0; return Math.max(parent ? minLevel(parent) : 1, own, 1); };
for (const mon of data.pokemon) { mon.evo = evoInfo[mon.id] ?? mon.evo ?? null; mon.minLevel = minLevel(mon); }
const all = [...(data.corrections?.list ?? []), ...corrections];
// tabela de tipos: a batalha do DP é overlay em assembly (sem tabela em texto) → o app diz que ela não foi conferida neste decomp
data.corrections = { source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, chartUnchecked: true, list: all };
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/overlay-corrections.json`, import.meta.url), JSON.stringify(all, null, 1));
console.log(`[${gameId}] learnsets na ordem do jogo; ${corrections.length} correções: ${corrections.slice(0, 24).map((c) => `${c.move ?? c.pokemon}.${c.field} ${c.from}→${c.to}`).join(', ')}`);
