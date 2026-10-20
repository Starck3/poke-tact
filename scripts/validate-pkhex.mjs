// Confronta o dataset (PokéAPI) com as tabelas do jogo extraídas pelo PKHeX: atributos, tipos, habilidades e learnset por
// nível (com a ordem). Depois do apply-pkhex-overlay tem que dar 0.
// Uso: node scripts/validate-pkhex.mjs <jogo> [--antes]  → reports/<jogo>/pkhex-audit[-antes].json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadPkhex } from './lib/pkhex.mjs';

const gameId = process.argv[2];
const before = process.argv.includes('--antes');
const game = GAMES[gameId];
const P = loadPkhex(new URL(`../data-sources/${game.pkhex.dir}/`, import.meta.url), gameId);
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const idOf = (n) => JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id;
const ids = new Map(Object.keys(data.moves).map((n) => [n, idOf(n)]));
const known = new Set(ids.values());
const nh = (l) => [...l].map((x) => x.replace(/-/g, '')).sort().join();
const report = { stats: [], types: [], abilities: [], levelup: [], order: [], missing: [] };
for (const mon of data.pokemon) {
  if (mon.id > 1025) continue;
  const d = P.species[mon.id];
  if (!d) { report.missing.push(mon.name); continue; }
  for (const k of Object.keys(d.stats)) if (mon.stats[k] !== d.stats[k]) report.stats.push({ pokemon: mon.name, field: k, pokeapi: mon.stats[k], pkhex: d.stats[k] });
  if (mon.types.join() !== d.types.join()) report.types.push({ pokemon: mon.name, pokeapi: mon.types.join('/'), pkhex: d.types.join('/') });
  if (data.game.generation >= 3 && !game.noAbilities && d.abilities.length && nh(mon.abilities) !== nh(d.abilities)) report.abilities.push({ pokemon: mon.name, pokeapi: mon.abilities.join('/'), pkhex: d.abilities.join('/') });
  if (!d.levelOrdered.length) continue;
  const api = mon.learnset.filter((l) => l.method === 'level-up').map((l) => `${ids.get(l.move)}@${l.level}`);
  const pk = [...new Set(d.levelOrdered.filter(([, m]) => known.has(m)).map(([lv, m]) => `${m}@${lv}`))];
  const a = new Set(api), b = new Set(pk);
  for (const x of a) if (!b.has(x)) report.levelup.push({ pokemon: mon.name, only: 'pokeapi', value: x });
  for (const x of b) if (!a.has(x)) report.levelup.push({ pokemon: mon.name, only: 'pkhex', value: x });
  if (a.size === b.size && [...a].every((x) => b.has(x)) && api.join() !== pk.join()) report.order.push(mon.name);
}
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/pkhex-audit${before ? '-antes' : ''}.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}${before ? ' ANTES do overlay' : ''}] PKHeX: ${Object.entries(report).map(([k, v]) => `${k} ${v.length}`).join(' | ')}`);
for (const k of Object.keys(report)) for (const x of report[k].slice(0, 3)) console.log('  ', k, JSON.stringify(x));
