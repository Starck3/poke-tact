// Gen 4 (PokéAPI) ← decomp em JSON (pret/pokeplatinum): golpes (PP, poder, precisão, tipo, prioridade, CATEGORIA por golpe),
// ORDEM do learnset (moveset padrão), habilidades, evoluções e nível mínimo. Uso: node scripts/apply-gen4-overlay.mjs <jogo>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadGen4 } from './lib/gen4-json.mjs';

const gameId = process.argv[2] ?? 'platinum';
const game = GAMES[gameId];
const g = loadGen4(new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url));
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
  // poder variável/fixo: o JSON traz 0/1 → manter null da PokéAPI; precisão 0 = "nunca erra" → manter null
  if (mv.power != null && d.power > 1) fix('power', d.power);
  if (mv.accuracy != null && d.accuracy > 0) fix('accuracy', d.accuracy);
}
const byDex = new Map(data.pokemon.map((p) => [p.id, p]));
for (const mon of data.pokemon) {
  const d = g.species[mon.id];
  if (!d) continue;
  const seen = new Set();
  const level = d.levelOrdered.map(([lv, mvc]) => ({ move: apiById.get(g.moveId[mvc]), method: 'level-up', level: lv })).filter((l) => l.move && !seen.has(l.move + '@' + l.level) && seen.add(l.move + '@' + l.level));
  mon.learnset = [...level, ...mon.learnset.filter((l) => l.method !== 'level-up')];
  mon.levelUpInGameOrder = true;
  if ([...mon.abilities].sort().join() !== [...d.abilities].sort().join()) { corrections.push({ pokemon: mon.name, field: 'abilities', from: mon.abilities.join('/'), to: d.abilities.join('/') }); mon.abilities = d.abilities; }
}
// evoluções: Gen 4 tem relógio (dia/noite) → por horário é possível; LOCATION (Magnetic Field, Moss/Ice Rock) também
const evoInfo = {};
for (const s of Object.values(g.species)) for (const e of s.evo) {
  const to = g.speciesId[e.to];
  if (!to) continue;
  const param = /^LEVEL/.test(e.kind) ? Number(e.param) : typeof e.param === 'string' ? e.param.replace(/^(ITEM|MOVE|SPECIES)_/, '') : e.param == null || e.param === 0 ? null : String(e.param); // sem parâmetro (Umbreon, Magnezone) → null, não "null"
  evoInfo[to] = { kind: e.kind, param, possible: true, raw: e.raw };
}
const minLevel = (mon) => { const parent = byDex.get(mon.evolvesFrom); const own = /^LEVEL/.test(evoInfo[mon.id]?.kind ?? '') ? evoInfo[mon.id].param : 0; return Math.max(parent ? minLevel(parent) : 1, own, 1); };
for (const mon of data.pokemon) { mon.evo = evoInfo[mon.id] ?? null; mon.minLevel = minLevel(mon); }
const all = [...(data.corrections?.list ?? []), ...corrections];
data.corrections = { source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, list: all };
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/overlay-corrections.json`, import.meta.url), JSON.stringify(all, null, 1));
console.log(`[${gameId}] learnsets na ordem do jogo; ${corrections.length} correções: ${corrections.slice(0, 20).map((c) => `${c.move ?? c.pokemon}.${c.field} ${c.from}→${c.to}`).join(', ')}`);
