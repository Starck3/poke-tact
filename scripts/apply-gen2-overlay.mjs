// Gen 2 (PokéAPI) ← decomp em assembly (pret/pokegold, pret/pokecrystal): o que a PokéAPI não guarda bem.
//   • PP/poder/precisão/tipo dos golpes; ORDEM do learnset (moveset padrão); evoluções e nível mínimo; iniciais
// Uso: node scripts/apply-gen2-overlay.mjs <jogo>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadGen2 } from './lib/gen2-asm.mjs';

const gameId = process.argv[2] ?? 'crystal';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const g = loadGen2(root);
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
  // dano fixo (EFFECT_STATIC_DAMAGE: Dragon Rage 40, Sonic Boom 20) ou variável: o 'poder' do decomp não é poder base — PokéAPI deixa null
  if (mv.power != null && d.power > 1) fix('power', d.power);
  // precisão null = "nunca erra" (Swift etc.): o decomp guarda 100 — manter null
  if (mv.power && d.power > 1 && mv.accuracy != null) fix('accuracy', d.accuracy);
}

const byDex = new Map(data.pokemon.map((p) => [p.id, p]));
for (const mon of data.pokemon) {
  const d = g.species[mon.id];
  if (!d?.levelOrdered) continue;
  const seen = new Set();
  const level = d.levelOrdered.map(([lv, mvc]) => ({ move: apiById.get(g.moveId[mvc]), method: 'level-up', level: lv })).filter((l) => l.move && !seen.has(l.move + '@' + l.level) && seen.add(l.move + '@' + l.level));
  mon.learnset = [...level, ...mon.learnset.filter((l) => l.method !== 'level-up')];
  mon.levelUpInGameOrder = true;
}
// evoluções no vocabulário do motor (LEVEL, ITEM, TRADE, TRADE_ITEM, FRIENDSHIP[_DAY|_NIGHT], LEVEL_ATK_*_DEF).
// Gen 2 tem relógio (RTC): evolução por horário é possível.
const evoInfo = {};
for (const s of Object.values(g.species)) for (const e of s.evo ?? []) {
  const to = g.speciesId[e.to];
  if (!to) continue;
  const TR = { TR_ANYTIME: 'FRIENDSHIP', TR_MORNDAY: 'FRIENDSHIP_DAY', TR_NITE: 'FRIENDSHIP_NIGHT' };
  evoInfo[to] =
    e.kind === 'EVOLVE_LEVEL' ? { kind: 'LEVEL', param: Number(e.param) }
    : e.kind === 'EVOLVE_ITEM' ? { kind: 'ITEM', param: e.param }
    : e.kind === 'EVOLVE_TRADE' ? (e.param === '-1' ? { kind: 'TRADE', param: '0' } : { kind: 'TRADE_ITEM', param: e.param })
    : e.kind === 'EVOLVE_HAPPINESS' ? { kind: TR[e.param] ?? 'FRIENDSHIP', param: '0' }
    : e.kind === 'EVOLVE_STAT' ? { kind: `LEVEL_${e.extra}`, param: Number(e.param) }
    : { kind: e.kind, param: e.param };
  evoInfo[to].possible = true;
}
const minLevel = (mon) => { const parent = byDex.get(mon.evolvesFrom); const own = /^LEVEL/.test(evoInfo[mon.id]?.kind ?? '') ? evoInfo[mon.id].param : 0; return Math.max(parent ? minLevel(parent) : 1, own, 1); };
for (const mon of data.pokemon) { mon.evo = evoInfo[mon.id] ?? null; mon.minLevel = minLevel(mon); }

const all = [...(data.corrections?.list ?? []), ...corrections];
data.corrections = { source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, list: all };
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/overlay-corrections.json`, import.meta.url), JSON.stringify(all, null, 1));
console.log(`[${gameId}] learnsets na ordem do jogo; ${corrections.length} correções de golpes: ${corrections.map((c) => `${c.move}.${c.field} ${c.from}→${c.to}`).join(', ')}`);
