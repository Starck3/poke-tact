// HeartGold/SoulSilver (PokéAPI) ← decomp PARCIAL pret/pokeheartgold (texto: habilidades, evoluções/nível mínimo)
//   + dados dos GOLPES da Gen 4 a partir do pret/pokeplatinum: o waza_tbl.narc do HGSS é binário no decomp, e a Gen 4
//     não mudou valores de golpe entre Platinum e HGSS — cada correção sai rotulada "via pokeplatinum".
// Learnset por nível continua da PokéAPI (wotbl.narc binário) — sem levelUpInGameOrder.
// Uso: node scripts/apply-hgss-overlay.mjs <jogo>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadHgss } from './lib/gen4-hgss.mjs';
import { loadGen4 } from './lib/gen4-json.mjs';

const gameId = process.argv[2] ?? 'heartgold-soulsilver';
const game = GAMES[gameId];
const g = loadHgss(new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url));
const ptDir = new URL(`../data-sources/${GAMES.platinum.asmDecomp.dir}/`, import.meta.url);
const pt = existsSync(ptDir) ? loadGen4(ptDir) : null;
const file = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const idOf = (n) => JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id;
const corrections = [];
if (pt) for (const [name, mv] of Object.entries(data.moves)) {
  const d = pt.moves[idOf(name)];
  if (!d) continue;
  const fix = (k, v) => { if (mv[k] !== v) { corrections.push({ move: name, field: k, from: mv[k], to: v, via: 'pokeplatinum' }); mv[k] = v; } };
  fix('pp', d.pp); fix('type', d.type); fix('priority', d.priority);
  if (mv.category !== 'status' || d.category === 'status') fix('category', d.category);
  if (mv.power != null && d.power > 1) fix('power', d.power);
  if (mv.accuracy != null && d.accuracy > 0) fix('accuracy', d.accuracy);
}
// habilidades: grafia do decomp sem hífen (COMPOUNDEYES) — só troca se a lista diferir de fato
const nh = (l) => [...l].map((x) => x.replace(/-/g, '')).sort().join();
for (const mon of data.pokemon) {
  const d = g.species[mon.id];
  if (d && nh(mon.abilities) !== nh(d.abilities)) { corrections.push({ pokemon: mon.name, field: 'abilities', from: mon.abilities.join('/'), to: d.abilities.join('/') }); mon.abilities = d.abilities; }
}
const byDex = new Map(data.pokemon.map((p) => [p.id, p]));
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
data.corrections = { source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}${pt ? ` + golpes ${GAMES.platinum.asmDecomp.repo}@${GAMES.platinum.asmDecomp.commit.slice(0, 7)}` : ''}`, partial: true, list: all };
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/overlay-corrections.json`, import.meta.url), JSON.stringify(all, null, 1));
console.log(`[${gameId}] ${pt ? '' : '(SEM pokeplatinum: golpes não conferidos) '}${corrections.length} correções: ${corrections.slice(0, 25).map((c) => `${c.move ?? c.pokemon}.${c.field} ${c.from}→${c.to}`).join(', ')}`);
