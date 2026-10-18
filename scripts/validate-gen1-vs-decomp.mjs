// Confronta o dataset da Gen 1 (PokéAPI) com o decomp em assembly (pret/pokered | pret/pokeyellow).
// Uso: node scripts/validate-gen1-vs-decomp.mjs <jogo>  → reports/<jogo>/gen1-decomp-audit.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadGen1 } from './lib/gen1-asm.mjs';

const gameId = process.argv[2] ?? 'red-blue';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const g = loadGen1(root);
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
const idOf = (n) => JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id;
const ids = new Map(Object.keys(data.moves).map((n) => [n, idOf(n)]));
const report = { learnset: [], machine: [], stats: [], types: [], moves: [], chart: [], missing: [] };

for (const mon of data.pokemon) {
  const d = g.species[mon.id];
  if (!d) { report.missing.push(mon.name); continue; }
  const api = new Set(mon.learnset.filter((l) => l.method === 'level-up').map((l) => `${ids.get(l.move)}@${l.level}`));
  const dec = new Set(d.levelOrdered.map(([lv, mv]) => `${g.moveId[mv]}@${lv}`));
  for (const v of api) if (!dec.has(v)) report.learnset.push({ pokemon: mon.name, only: 'pokeapi', value: v });
  for (const v of dec) if (!api.has(v)) report.learnset.push({ pokemon: mon.name, only: 'decomp', value: v });
  const apiTm = new Set(mon.learnset.filter((l) => l.method === 'machine').map((l) => ids.get(l.move)));
  for (const v of apiTm) if (!d.machine.has(v)) report.machine.push({ pokemon: mon.name, only: 'pokeapi', value: v });
  for (const v of d.machine) if (!apiTm.has(v)) report.machine.push({ pokemon: mon.name, only: 'decomp', value: v });
  const st = { hp: mon.stats.hp, attack: mon.stats.attack, defense: mon.stats.defense, speed: mon.stats.speed, special: mon.stats['special-attack'] };
  for (const k of Object.keys(st)) if (st[k] !== d.stats[k]) report.stats.push({ pokemon: mon.name, field: k, pokeapi: st[k], decomp: d.stats[k] });
  if (mon.types.join() !== d.types.join()) report.types.push({ pokemon: mon.name, pokeapi: mon.types.join('/'), decomp: d.types.join('/') });
}
for (const [name, mv] of Object.entries(data.moves)) {
  const d = g.moves[ids.get(name)];
  if (!d) continue;
  for (const k of ['type', 'pp']) if (mv[k] !== d[k]) report.moves.push({ move: name, field: k, pokeapi: mv[k], decomp: d[k] });
  if ((mv.power ?? 0) !== d.power && d.power > 1) report.moves.push({ move: name, field: 'power', pokeapi: mv.power, decomp: d.power });
  if (mv.power && (mv.accuracy ?? 100) !== d.accuracy) report.moves.push({ move: name, field: 'accuracy', pokeapi: mv.accuracy, decomp: d.accuracy });
}
for (const a of data.types) for (const b of data.types) {
  const x = data.chart[a][b], y = g.chart[a]?.[b] ?? 1;
  if (x !== y) report.chart.push({ attacker: a, defender: b, pokeapi: x, decomp: y });
}
writeFileSync(new URL(`../reports/${gameId}/gen1-decomp-audit.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}] decomp ${game.asmDecomp.repo}: learnset ${report.learnset.length} | TM/HM ${report.machine.length} | stats ${report.stats.length} | tipos ${report.types.length} | golpes ${report.moves.length} | tabela ${report.chart.length} | sem par ${report.missing.length}`);
for (const k of ['learnset', 'machine', 'stats', 'types', 'moves', 'chart']) for (const x of report[k].slice(0, 6)) console.log('  ', k, JSON.stringify(x));
