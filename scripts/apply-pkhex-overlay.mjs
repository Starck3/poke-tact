// Jogos sem decomp (Black/White e Gens 6–9): dataset da PokéAPI ← tabelas do próprio jogo extraídas pelo PKHeX
// (scripts/lib/pkhex.mjs): atributos, tipos, habilidades e learnset por nível na ORDEM do jogo (moveset padrão).
// O leitor foi validado contra os decomps: 0 diferenças em B2W2 (atributos, tipos, habilidades, learnset) e no learnset de
// Emerald, Diamond/Pearl, Platinum e HeartGold/SoulSilver (test/regressions.test.mjs).
// Golpes (poder, precisão…) não estão no PKHeX → continuam da PokéAPI conferidos com o Showdown.
// Uso: node scripts/apply-pkhex-overlay.mjs <jogo>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadPkhex, pkhexCommit } from './lib/pkhex.mjs';

const gameId = process.argv[2];
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.pkhex.dir}/`, import.meta.url);
const P = loadPkhex(root, gameId);
const file = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const idOf = (n) => JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id;
const apiById = new Map(Object.keys(data.moves).map((n) => [idOf(n), n]));
const nh = (l) => [...l].map((x) => x.replace(/-/g, '')).sort().join();
const corrections = [];
for (const mon of data.pokemon) {
  const d = P.species[mon.id];
  if (!d || mon.id > 1025) continue; // formas (ids 10000+) ficam da PokéAPI
  for (const k of Object.keys(d.stats)) if (mon.stats[k] !== d.stats[k]) { corrections.push({ pokemon: mon.name, field: k, from: mon.stats[k], to: d.stats[k] }); mon.stats[k] = d.stats[k]; }
  if (mon.types.join() !== d.types.join()) { corrections.push({ pokemon: mon.name, field: 'types', from: mon.types.join('/'), to: d.types.join('/') }); mon.types = d.types; }
  if (data.game.generation >= 3 && !game.noAbilities && d.abilities.length && nh(mon.abilities) !== nh(d.abilities)) { corrections.push({ pokemon: mon.name, field: 'abilities', from: mon.abilities.join('/'), to: d.abilities.join('/') }); mon.abilities = d.abilities; }
  if (!d.levelOrdered.length) continue;
  const seen = new Set();
  const level = d.levelOrdered.map(([lv, id]) => ({ move: apiById.get(id), method: 'level-up', level: lv })).filter((l) => l.move && !seen.has(l.move + '@' + l.level) && seen.add(l.move + '@' + l.level));
  const before = mon.learnset.filter((l) => l.method === 'level-up').map((l) => `${l.move}@${l.level}`).sort().join();
  if (before !== level.map((l) => `${l.move}@${l.level}`).sort().join()) corrections.push({ pokemon: mon.name, field: 'learnset', from: before.split(',').filter(Boolean).length, to: level.length });
  mon.learnset = [...level, ...mon.learnset.filter((l) => l.method !== 'level-up')];
  mon.levelUpInGameOrder = true;
}
const commit = pkhexCommit(root);
data.corrections = { source: `kwsch/PKHeX@${commit?.slice(0, 7) ?? '?'} (tabelas do jogo: atributos, tipos, habilidades, learnset por nível)`, list: [...(data.corrections?.list ?? []), ...corrections] };
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/pkhex-corrections.json`, import.meta.url), JSON.stringify(corrections, null, 1));
const by = corrections.reduce((a, c) => ((a[c.field] = (a[c.field] ?? 0) + 1), a), {});
console.log(`[${gameId}] PKHeX ${P.cfg.personal}: ${corrections.length} correções ${JSON.stringify(by)}: ${corrections.filter((c) => c.field !== 'learnset').slice(0, 12).map((c) => `${c.pokemon}.${c.field} ${c.from}→${c.to}`).join(', ')}`);
