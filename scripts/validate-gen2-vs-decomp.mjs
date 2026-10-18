// Confronta o dataset da Gen 2 (PokéAPI) com o decomp em assembly (pret/pokegold | pret/pokecrystal).
// Uso: node scripts/validate-gen2-vs-decomp.mjs <jogo> [--antes]  → reports/<jogo>/gen2-decomp-audit[-antes].json
//   --antes: roda antes do overlay (mostra o que a PokéAPI traz de diferente); sem ele, depois (tem que dar 0)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadGen2 } from './lib/gen2-asm.mjs';

const gameId = process.argv[2] ?? 'crystal';
const before = process.argv.includes('--antes');
const game = GAMES[gameId];
const g = loadGen2(new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url));
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
const idOf = (n) => JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id;
const ids = new Map(Object.keys(data.moves).map((n) => [n, idOf(n)]));
const report = { learnset: [], machine: [], tutor: [], stats: [], types: [], moves: [], chart: [], missing: [] };
const setDiff = (pokemon, kind, api, dec) => {
  for (const v of api) if (!dec.has(v)) report[kind].push({ pokemon, only: 'pokeapi', value: v });
  for (const v of dec) if (!api.has(v)) report[kind].push({ pokemon, only: 'decomp', value: v });
};
for (const mon of data.pokemon) {
  const d = g.species[mon.id];
  if (!d) { report.missing.push(mon.name); continue; }
  setDiff(mon.name, 'learnset', new Set(mon.learnset.filter((l) => l.method === 'level-up').map((l) => `${ids.get(l.move)}@${l.level}`)), new Set(d.levelOrdered.map(([lv, mv]) => `${g.moveId[mv]}@${lv}`)));
  setDiff(mon.name, 'machine', new Set(mon.learnset.filter((l) => l.method === 'machine').map((l) => ids.get(l.move))), d.machine);
  setDiff(mon.name, 'tutor', new Set(mon.learnset.filter((l) => l.method === 'tutor').map((l) => ids.get(l.move))), d.tutor);
  for (const k of Object.keys(d.stats)) if (mon.stats[k] !== d.stats[k]) report.stats.push({ pokemon: mon.name, field: k, pokeapi: mon.stats[k], decomp: d.stats[k] });
  if (mon.types.join() !== d.types.join()) report.types.push({ pokemon: mon.name, pokeapi: mon.types.join('/'), decomp: d.types.join('/') });
}
for (const [name, mv] of Object.entries(data.moves)) {
  const d = g.moves[ids.get(name)];
  if (!d) continue;
  for (const k of ['type', 'pp']) if (mv[k] !== d[k]) report.moves.push({ move: name, field: k, pokeapi: mv[k], decomp: d[k] });
  if (mv.power != null && mv.power !== d.power && d.power > 1) report.moves.push({ move: name, field: 'power', pokeapi: mv.power, decomp: d.power });
  if (mv.power && mv.accuracy != null && mv.accuracy !== d.accuracy) report.moves.push({ move: name, field: 'accuracy', pokeapi: mv.accuracy, decomp: d.accuracy });
}
for (const a of data.types) for (const b of data.types) {
  const x = data.chart[a][b], y = g.chart[a]?.[b] ?? 1;
  if (x !== y) report.chart.push({ attacker: a, defender: b, pokeapi: x, decomp: y });
}
writeFileSync(new URL(`../reports/${gameId}/gen2-decomp-audit${before ? '-antes' : ''}.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}${before ? ' ANTES do overlay' : ''}] decomp ${game.asmDecomp.repo}: ${Object.entries(report).map(([k, v]) => `${k} ${v.length}`).join(' | ')}`);
for (const k of Object.keys(report)) for (const x of report[k].slice(0, 5)) console.log('  ', k, JSON.stringify(x));
