// Gen 5 (PokéAPI) ← decomp fuddlesworth/pokebw2 (JSON): golpes (PP, poder, precisão, tipo, prioridade, categoria), learnset
// por nível na ORDEM do jogo (moveset padrão), TM/HM e tutores, habilidades (com a oculta), tabela de tipos, evoluções e
// nível mínimo. Uso: node scripts/apply-gen5-overlay.mjs <jogo>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadBw2 } from './lib/gen5-bw2.mjs';

const gameId = process.argv[2] ?? 'black-2-white-2';
const game = GAMES[gameId];
const g = loadBw2(new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url));
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
  if (mv.accuracy != null && d.accuracy > 0 && d.accuracy <= 100) fix('accuracy', d.accuracy); // 101 = nunca erra
}
// tabela de tipos do código de batalha (btl_calc.c)
for (const a of data.types) for (const b of data.types) {
  const y = g.chart[a]?.[b];
  if (y != null && data.chart[a][b] !== y) { corrections.push({ chart: `${a}>${b}`, from: data.chart[a][b], to: y }); data.chart[a][b] = y; }
}
const byDex = new Map(data.pokemon.map((p) => [p.id, p]));
for (const mon of data.pokemon) {
  const d = g.species[mon.id];
  if (!d) continue;
  const seen = new Set();
  const level = d.levelOrdered.map(([lv, id]) => ({ move: apiById.get(id), method: 'level-up', level: lv })).filter((l) => l.move && !seen.has(l.move + '@' + l.level) && seen.add(l.move + '@' + l.level));
  const before = mon.learnset.filter((l) => l.method === 'level-up').map((l) => `${l.move}@${l.level}`).sort().join();
  if (before !== level.map((l) => `${l.move}@${l.level}`).sort().join()) corrections.push({ pokemon: mon.name, field: 'learnset', from: before.split(',').length, to: level.length });
  // TM/HM e tutores do jogo (o by_tm e o by_tutor do decomp); ovo fica da PokéAPI (não entra nas sugestões)
  const named = (ids, method) => [...ids].map((id) => apiById.get(id)).filter(Boolean).map((move) => ({ move, method }));
  const pluginTutor = mon.learnset.filter((l) => l.method === 'tutor' && g.pluginTutors.has(idOf(l.move)));
  mon.learnset = [...level, ...named(d.machine, 'machine'), ...named(d.tutor, 'tutor'), ...pluginTutor, ...mon.learnset.filter((l) => !['level-up', 'machine', 'tutor'].includes(l.method))];
  mon.levelUpInGameOrder = true;
  // grafia do decomp sem hífen (COMPOUNDEYES, LIGHTNINGROD): só troca se a lista diferir de fato
  const nh = (l) => [...l].map((x) => x.replace(/-/g, '')).sort().join();
  if (nh(mon.abilities) !== nh(d.abilities)) { corrections.push({ pokemon: mon.name, field: 'abilities', from: mon.abilities.join('/'), to: d.abilities.join('/') }); mon.abilities = d.abilities; }
  for (const k of Object.keys(d.stats)) if (mon.stats[k] !== d.stats[k]) { corrections.push({ pokemon: mon.name, field: k, from: mon.stats[k], to: d.stats[k] }); mon.stats[k] = d.stats[k]; }
  if (mon.types.join() !== d.types.join()) { corrections.push({ pokemon: mon.name, field: 'types', from: mon.types.join('/'), to: d.types.join('/') }); mon.types = d.types; }
}
const evoInfo = {};
for (const s of Object.values(g.species)) for (const e of s.evo) {
  const to = g.speciesId[e.to];
  if (!to) continue;
  const param = /^LEVEL/.test(e.kind) ? Number(e.param) : typeof e.param === 'string' ? e.param.replace(/^(ITEM|MOVE|SPECIES)_/, '') : e.param == null || e.param === 0 ? null : String(e.param);
  evoInfo[to] = { kind: e.kind, param, possible: true, raw: e.raw };
}
const minLevel = (mon) => { const parent = byDex.get(mon.evolvesFrom); const own = /^LEVEL/.test(evoInfo[mon.id]?.kind ?? '') ? evoInfo[mon.id].param : 0; return Math.max(parent ? minLevel(parent) : 1, own, 1); };
for (const mon of data.pokemon) { mon.evo = evoInfo[mon.id] ?? null; mon.minLevel = minLevel(mon); }
const all = [...(data.corrections?.list ?? []), ...corrections];
data.corrections = { source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, list: all };
delete data.moveCrosscheck; // a conferência com o Showdown dá lugar ao decomp
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/overlay-corrections.json`, import.meta.url), JSON.stringify(all, null, 1));
const by = corrections.reduce((a, c) => ((a[c.field ?? (c.chart ? 'chart' : '?')] = (a[c.field ?? (c.chart ? 'chart' : '?')] ?? 0) + 1), a), {});
console.log(`[${gameId}] learnsets na ordem do jogo; ${corrections.length} correções ${JSON.stringify(by)}: ${corrections.filter((c) => c.move).slice(0, 16).map((c) => `${c.move}.${c.field} ${c.from}→${c.to}`).join(', ')}`);
