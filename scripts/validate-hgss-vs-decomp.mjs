// Confronta o dataset de HeartGold/SoulSilver (PokéAPI) com o decomp pret/pokeheartgold no que está em TEXTO:
// TM/HM, tutores, atributos, tipos, habilidades e tabela de tipos (texto) + learnset por nível e golpes (binários do jogo).
// Uso: node scripts/validate-hgss-vs-decomp.mjs <jogo> [--antes]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadHgss } from './lib/gen4-hgss.mjs';

const gameId = process.argv[2] ?? 'heartgold-soulsilver';
const before = process.argv.includes('--antes');
const game = GAMES[gameId];
const g = loadHgss(new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url));
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const idOf = (n) => JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id;
const ids = new Map(Object.keys(data.moves).map((n) => [n, idOf(n)]));
const scr = new URL(`../data-sources/${game.asmDecomp.dir}/files/fielddata/script/scr_seq/`, import.meta.url);
const SCRIPT_TUTORS = new Set();
for (const f of (await import('node:fs')).readdirSync(scr).filter((x) => x.endsWith('.s'))) for (const m of readFileSync(new URL(f, scr), 'utf8').matchAll(/MOVE_(FRENZY_PLANT|BLAST_BURN|HYDRO_CANNON|DRACO_METEOR)\b/g)) SCRIPT_TUTORS.add(g.moveId['MOVE_' + m[1]]);
const report = { levelup: [], moves: [], machine: [], tutor: [], stats: [], types: [], abilities: [], chart: [], missing: [] };
const setDiff = (pokemon, kind, api, dec) => {
  for (const v of api) if (!dec.has(v)) report[kind].push({ pokemon, only: 'pokeapi', value: v });
  for (const v of dec) if (!api.has(v)) report[kind].push({ pokemon, only: 'decomp', value: v });
};
for (const mon of data.pokemon) {
  const d = g.species[mon.id];
  if (!d) { report.missing.push(mon.name); continue; }
  setDiff(mon.name, 'levelup', new Set(mon.learnset.filter((l) => l.method === 'level-up').map((l) => `${ids.get(l.move)}@${l.level}`)), new Set(d.levelOrdered.map(([lv, m]) => `${m}@${lv}`)));
  setDiff(mon.name, 'machine', new Set(mon.learnset.filter((l) => l.method === 'machine').map((l) => ids.get(l.move))), d.machine);
  // tutores por script (golpes supremos, Draco Meteor) ficam fora do waza_oshie.json — mesmo caso do Platinum
  setDiff(mon.name, 'tutor', new Set(mon.learnset.filter((l) => l.method === 'tutor').map((l) => ids.get(l.move)).filter((x) => !SCRIPT_TUTORS.has(x))), d.tutor);
  for (const k of Object.keys(d.stats)) if (mon.stats[k] !== d.stats[k]) report.stats.push({ pokemon: mon.name, field: k, pokeapi: mon.stats[k], decomp: d.stats[k] });
  if (mon.types.join() !== d.types.join()) report.types.push({ pokemon: mon.name, pokeapi: mon.types.join('/'), decomp: d.types.join('/') });
  // grafia: o decomp escreve COMPOUNDEYES / LIGHTNINGROD (sem separador) — compara sem hífen
  const nh = (l) => [...l].map((x) => x.replace(/-/g, '')).sort().join();
  if (nh(mon.abilities) !== nh(d.abilities)) report.abilities.push({ pokemon: mon.name, pokeapi: mon.abilities.join('/'), decomp: d.abilities.join('/') });
}
for (const [name, mv] of Object.entries(data.moves)) {
  const d = g.moves[ids.get(name)];
  if (!d) continue;
  for (const k of ['pp', 'type', 'priority', 'category']) if (mv[k] !== d[k] && !(k === 'category' && mv.category === 'status' && d.category !== 'status')) report.moves.push({ move: name, field: k, pokeapi: mv[k], decomp: d[k] });
  if (mv.power != null && d.power > 1 && mv.power !== d.power) report.moves.push({ move: name, field: 'power', pokeapi: mv.power, decomp: d.power });
  if (mv.accuracy != null && d.accuracy > 0 && mv.accuracy !== d.accuracy) report.moves.push({ move: name, field: 'accuracy', pokeapi: mv.accuracy, decomp: d.accuracy });
}
for (const a of data.types) for (const b of data.types) {
  const x = data.chart[a][b], y = g.chart[a]?.[b] ?? 1;
  if (x !== y) report.chart.push({ attacker: a, defender: b, pokeapi: x, decomp: y });
}
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/hgss-decomp-audit${before ? '-antes' : ''}.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}${before ? ' ANTES do overlay' : ''}] decomp ${game.asmDecomp.repo}: ${Object.entries(report).map(([k, v]) => `${k} ${v.length}`).join(' | ')}`);
for (const k of Object.keys(report)) for (const x of report[k].slice(0, 5)) console.log('  ', k, JSON.stringify(x));
