// Evoluções do próprio jogo (PKHeX, scripts/lib/pkhex-evos.mjs) nos jogos sem decomp: `evo` = { kind, param, possible,
// text? } e `evolvesFrom` de cada entrada do dataset (inclusive formas regionais). Antes esses jogos não tinham `evo`:
//   • o filtro "evoluções por troca" não valia (Gengar/Alakazam contavam como obtíveis sem outro jogo);
//   • no Sun/Moon o Raichu de Kanto (pedra "fora de Alola") contava como obtível; Perrserker vinha do Meowth de Kanto.
// Mais de um método para o mesmo alvo (Milotic: troca com Prism Scale ou beleza): vale o possível sem troca, depois a troca;
// os outros ficam em `evoAlt`. Alvo que a PokéAPI liga a uma pré-evolução presente, mas sem método no jogo → impossível.
// Uso: node scripts/apply-pkhex-evos.mjs <jogo>   (depois do add-pkhex-forms)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { readEvolutions, NEW_KIND_PT, LOCATION_PT } from './lib/pkhex-evos.mjs';

const gameId = process.argv[2];
const game = GAMES[gameId];
const { list } = readEvolutions(new URL(`../data-sources/${game.pkhex.dir}/`, import.meta.url), gameId);
const file = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));

// (espécie, forma) → entrada do dataset: forma regional própria, senão a espécie (formas cosméticas, Lycanroc…)
const regional = new Map(data.pokemon.filter((p) => p.regionalForm).map((p) => [`${p.speciesId}-${p.form}`, p]));
const base = new Map(data.pokemon.filter((p) => !p.regionalForm).map((p) => [p.id, p]));
const entry = (sp, f) => regional.get(`${sp}-${f}`) ?? base.get(sp);

/** Texto da tela para os métodos que o describeEvolution do app não conhece (ou perderia a condição). */
export function evoText(e) {
  if (NEW_KIND_PT[e.kind]) return NEW_KIND_PT[e.kind](e);
  if (e.kind === 'LOCATION') return `subir de nível ${LOCATION_PT[e.param] ?? 'num lugar específico'}`;
  return undefined;
}
const rank = (e) => (e.possible === false ? 2 : e.trade || /^TRADE/.test(e.kind) ? 1 : 0);
const into = new Map(); // id do alvo → [{ from, e }]
for (const e of list) {
  // Gens 5/6 (índice por espécie): forma nula = qualquer forma / mantém a forma de origem
  const from = entry(e.fromSpecies, e.fromForm ?? 0);
  const to = entry(e.toSpecies, e.toForm ?? e.fromForm ?? 0);
  if (!from || !to || from === to) continue;
  (into.get(to.id) ?? into.set(to.id, []).get(to.id)).push({ from, e });
}
const changes = [];
const pick = (e) => { const text = evoText(e); return { kind: e.kind, param: e.param ?? null, possible: e.possible !== false, ...(text && { text }), raw: e.raw }; };
for (const mon of data.pokemon) {
  const before = JSON.stringify([mon.evolvesFrom, mon.evo?.kind, mon.evo?.possible]);
  const opts = (into.get(mon.id) ?? []).sort((a, b) => rank(a.e) - rank(b.e));
  if (opts.length) {
    mon.evolvesFrom = opts[0].from.id;
    mon.evo = pick(opts[0].e);
    const alt = opts.slice(1).filter((o) => o.from === opts[0].from).map((o) => pick(o.e));
    if (alt.length) mon.evoAlt = alt; else delete mon.evoAlt;
  } else if (mon.evolvesFrom && data.pokemon.some((p) => p.id === mon.evolvesFrom)) {
    mon.evo = { kind: 'NONE', possible: false }; // Melmetal (GO), Kanto-forms sem método no jogo…
    delete mon.evoAlt;
  }
  const after = JSON.stringify([mon.evolvesFrom, mon.evo?.kind, mon.evo?.possible]);
  if (before !== after) changes.push(`${mon.name}: ${before} → ${after}`);
}
for (const x of data.pokemon) x.fullyEvolved = !data.pokemon.some((y) => y.evolvesFrom === x.id);
// menor nível em que a espécie existe por evolução (o maior nível de evolução na cadeia), como nos jogos com decomp —
// faltava nos jogos do PKHeX e o filtro "ainda não evoluiu no nível do seu time" não agia (Pupitar sugerido no nv 16)
const byIdEvo = new Map(data.pokemon.map((p) => [p.id, p]));
const minLevel = (mon, seen = new Set()) => {
  if (seen.has(mon.id)) return 1;
  seen.add(mon.id);
  const parent = mon.evolvesFrom !== mon.id ? byIdEvo.get(mon.evolvesFrom) : null;
  const own = /^LEVEL/.test(mon.evo?.kind ?? '') && Number(mon.evo.param) > 0 ? Number(mon.evo.param) : 0;
  return Math.max(parent ? minLevel(parent, seen) : 1, own, 1);
};
for (const x of data.pokemon) x.minLevel = minLevel(x);
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/pkhex-evos.json`, import.meta.url), JSON.stringify(changes, null, 1));
const n = (f) => data.pokemon.filter(f).length;
console.log(`[${gameId}] evoluções do PKHeX: ${n((p) => p.evo)} com método (${n((p) => p.evo?.possible === false)} impossíveis no jogo, ${n((p) => /^TRADE/.test(p.evo?.kind ?? ''))} por troca); ${changes.length} mudanças: ${changes.slice(0, 6).join('; ')}`);
