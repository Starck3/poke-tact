// O que cada golpe de STATUS faz (sono, paralisia, sobe Ataque…), por geração → public/data/move-effects.json (0.73.0).
// Os datasets dos jogos só têm um texto em inglês ("Puts the target to sleep."); a aba Golpes precisa do efeito em forma de
// dado para dizer se vale a pena aprender um golpe como o Sleep Powder. Fonte: Pokémon Showdown no commit fixado em
// scripts/fetch-showdown-moves.mjs — data/moves.ts (Gen 9) + data/mods/gen8…gen1/moves.ts (cada mod só traz o que muda em
// relação à geração seguinte; "inherit: true" herda o resto). Campos lidos: status, volatileStatus, boosts (no alvo ou no
// próprio, pelo target), self.boosts, heal, sideCondition, weather, pseudoWeather, flags.powder/sound, ignoreImmunity.
// Golpe cujo efeito está só em código (onHit…) fica sem efeito conhecido ("other") — a tela diz que não avalia.
// Saída: { source, moves: { <id do Showdown>: [[geraçãoInicial, efeito], …] } } — faixas de gerações com o mesmo efeito.
// Uso: node scripts/build-move-effects.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SHOWDOWN_FILES, SHOWDOWN_OLD_GEN_FILES, SHOWDOWN_COMMIT } from './fetch-showdown-moves.mjs';

const file = (f) => new URL(`../data-sources/showdown/${SHOWDOWN_COMMIT}/${f.replace(/\//g, '__')}`, import.meta.url);
const NEED = ['data/moves.ts', ...SHOWDOWN_FILES.filter((f) => f.startsWith('data/mods/')), ...SHOWDOWN_OLD_GEN_FILES];
if (!NEED.every((f) => existsSync(file(f)))) throw new Error('sem dados do Showdown — rode scripts/fetch-showdown-moves.mjs');

/** Campos de 1º nível de cada golpe: { id: { campo: texto (uma linha) | [linhas internas] } } */
export function parseMovesTs(text) {
  const out = {};
  let cur = null, field = null, depth = 0;
  for (const line of text.split(/\r?\n/)) {
    const top = line.match(/^\t([a-z0-9]+): \{$/);
    if (top && !cur) { cur = out[top[1]] = {}; continue; }
    if (!cur) continue;
    if (/^\t\},?$/.test(line)) { cur = null; field = null; continue; }
    if (field) {
      depth += (line.match(/[{[]/g) ?? []).length - (line.match(/[}\]]/g) ?? []).length;
      if (depth <= 0) { field = null; continue; }
      cur[field].push(line.trim());
      continue;
    }
    const m = line.match(/^\t\t([A-Za-z]+): (.*)$/);
    if (!m) continue;
    const opens = (m[2].match(/[{[]/g) ?? []).length - (m[2].match(/[}\]]/g) ?? []).length;
    if (opens > 0 && /[{[]$/.test(m[2])) { field = m[1]; depth = opens; cur[field] = []; continue; }
    cur[m[1]] = m[2].replace(/,$/, '');
  }
  return out;
}

// "{ atk: -1, spe: 1 }" ou ["atk: 2,", …] → { atk: -1, spe: 1 }
const boostsOf = (v) => {
  if (v == null) return null;
  const s = Array.isArray(v) ? v.join(' ') : v;
  const b = {};
  for (const [, k, n] of s.matchAll(/\b(atk|def|spa|spd|spe|accuracy|evasion): (-?\d+)/g)) b[k] = Number(n);
  return Object.keys(b).length ? b : null;
};
const str = (v) => (typeof v === 'string' ? v.replace(/^['"]|['"]$/g, '') : null);
const flagOn = (flags, f) => (typeof flags === 'string' ? new RegExp(`\\b${f}: 1`).test(flags) : Array.isArray(flags) && flags.some((l) => new RegExp(`\\b${f}: 1`).test(l)));

/** Efeito de um golpe de status a partir dos campos do Showdown (já com a herança da geração aplicada). */
export function effectOf(f) {
  const target = str(f.target);
  const selfTarget = ['self', 'adjacentAllyOrSelf', 'allySide', 'allies'].includes(target);
  const fx = {};
  const status = str(f.status), vol = str(f.volatileStatus);
  const boosts = boostsOf(f.boosts);
  const selfBoosts = Array.isArray(f.self) ? boostsOf(f.self.filter((l) => !/^boosts: \{$|^\},?$/.test(l))) : null;
  if (status) { fx.kind = 'status'; fx.status = status; }
  else if (vol && vol !== 'substitute' && vol !== 'protect') { fx.kind = 'volatile'; fx.volatile = vol; }
  else if (boosts && selfTarget) { fx.kind = 'boost'; fx.boosts = boosts; }
  else if (boosts) { fx.kind = 'drop'; fx.boosts = boosts; }
  else if (selfBoosts) { fx.kind = 'boost'; fx.boosts = selfBoosts; }
  else if (f.heal) fx.kind = 'heal';
  else if (vol) { fx.kind = 'volatile'; fx.volatile = vol; }
  else if (f.sideCondition) { fx.kind = 'side'; fx.side = str(f.sideCondition); }
  else if (f.weather) { fx.kind = 'weather'; fx.weather = str(f.weather); }
  else fx.kind = 'other';
  if (fx.kind === 'status' && boosts) fx.boosts = boosts; // ex.: Swagger confunde e sobe Ataque — fica o 1º efeito
  if (flagOn(f.flags, 'powder')) fx.powder = true;
  if (flagOn(f.flags, 'sound')) fx.sound = true;
  if (f.ignoreImmunity === 'false') fx.typeImmune = true; // Thunder Wave não pega em Terra
  return fx;
}

const base = parseMovesTs(readFileSync(file('data/moves.ts'), 'utf8'));
const mods = Object.fromEntries([8, 7, 6, 5, 4, 3, 2, 1].map((g) => [g, parseMovesTs(readFileSync(file(`data/mods/gen${g}/moves.ts`), 'utf8'))]));
const moves = {};
for (const id of Object.keys(base).sort()) {
  const ranges = [];
  let fields = base[id];
  for (let g = 9; g >= 1; g--) {
    if (g < 9 && mods[g][id]) fields = { ...fields, ...mods[g][id] };
    if (str(fields.category) !== 'Status') continue;
    const fx = JSON.stringify(effectOf(fields));
    if (ranges[0]?.[1] === fx) ranges[0][0] = g; else ranges.unshift([g, fx]);
  }
  if (ranges.length) moves[id] = ranges.map(([g, fx]) => [g, JSON.parse(fx)]);
}
const outFile = new URL('../public/data/move-effects.json', import.meta.url);
const json = JSON.stringify({ source: `Pokémon Showdown ${SHOWDOWN_COMMIT.slice(0, 7)} (data/moves.ts + data/mods/gen1…gen8/moves.ts)`, moves });
writeFileSync(outFile, json + '\n');
const kinds = {};
for (const r of Object.values(moves)) { const k = r.at(-1)[1].kind; kinds[k] = (kinds[k] ?? 0) + 1; }
console.log(`move-effects.json: ${Object.keys(moves).length} golpes de status`, kinds);
