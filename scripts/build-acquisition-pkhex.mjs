// Gens 6–9 (sem decomp): public/data/<jogo>-acquisition.json a partir das tabelas de encontro do PKHeX
// (scripts/lib/pkhex-enc-*.mjs) e recálculo de `obtainable`. A PokéAPI não tem encontros de BDSP, Legends: Arceus e
// Scarlet/Violet; nos outros, o PKHeX substitui a PokéAPI (mesma fonte para todos).
// O PKHeX NÃO traz taxa de aparição nem ordem da história: cada fonte tem local + método + faixa de nível (sem `pct` e
// sem `stage`); o app mostra "a partir do nv X" pelo menor nível de encontro. Eventos/distribuições/GO/HOME ficam de fora
// nos leitores.
// Uso: node scripts/build-acquisition-pkhex.mjs <jogo>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { pkhexCommit } from './lib/pkhex.mjs';

import { READERS, METHOD_LABEL, detailText, NO_PLACE, RANDOM } from './lib/pkhex-enc.mjs';

const gameId = process.argv[2];
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.pkhex.dir}/`, import.meta.url);
const { readEncounters } = await import(new URL(READERS[gameId], new URL('./lib/', import.meta.url)));
const enc = readEncounters(root, gameId);
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const VERSIONS = data.game.versions;
const monById = new Map(data.pokemon.map((p) => [p.id, p]));

const out = Object.fromEntries(VERSIONS.map((v) => [v, {}]));
const seen = new Set();
const unknown = { versions: new Set(), species: new Set(), methods: new Set() };
const push = (v, id, s) => {
  if (!out[v]) return unknown.versions.add(v);
  const mon = monById.get(id);
  if (!mon) return unknown.species.add(id);
  const key = `${v}|${mon.name}|${JSON.stringify(s)}`;
  if (seen.has(key)) return;
  seen.add(key);
  (out[v][mon.name] ??= []).push(s);
};
const notes = new Set();
for (const e of enc.wild) {
  // Z-A: a área do Hyperspace (DLC) vem como 'wild' com detail.hyperspace
  const method = e.detail?.hyperspace ? 'hyperspace' : e.method;
  if (!METHOD_LABEL[method]) unknown.methods.add(method);
  if (e.detail?.versionNote) notes.add('Selvagens: o PKHeX não separa as versões — exclusivos de versão aparecem nas duas.');
  const detail = detailText(e.detail);
  push(e.version, e.species, {
    type: 'wild', where: e.location, method: METHOD_LABEL[method] ?? method, min: e.min, max: e.max,
    // faixa agregada (Let's Go: L3–56 junta aparições raras de momentos diferentes) → não dá para contar com o nível mínimo
    ...(detail && { detail }), ...((RANDOM.has(method) || /agregada/.test(detail ?? '')) && { random: true }),
  });
}
const FIXED_DETAIL = { starter: 'um dos iniciais' };
for (const e of enc.fixed) {
  const detail = detailText(e.detail) ?? FIXED_DETAIL[e.type];
  const s = { type: e.type, where: e.location ?? NO_PLACE[e.type] ?? '?', level: e.level, ...(detail && { detail }) };
  if (e.type === 'trade' && !s.detail) s.detail = 'troca com NPC';
  push(e.version, e.species, s);
}
// mesma espécie no mesmo local/método: junta as faixas de nível (o PKHeX repete o slot por horário/clima/área)
for (const v of VERSIONS) for (const [name, list] of Object.entries(out[v])) {
  const by = new Map();
  for (const s of list) {
    if (s.type !== 'wild') { by.set(Symbol(), s); continue; }
    const k = `${s.where}|${s.method}|${s.detail ?? ''}`;
    const prev = by.get(k);
    if (prev) { prev.min = Math.min(prev.min, s.min); prev.max = Math.max(prev.max, s.max); } else by.set(k, { ...s });
  }
  out[v][name] = [...by.values()].sort((a, b) => (a.min ?? a.level ?? 0) - (b.min ?? b.level ?? 0));
}

// obtível = fonte direta na versão, ou evolui (sem exigência impossível) de algo obtível
const USABLE = new Set(['wild', 'gift', 'static', 'trade', 'starter', 'egg']);
const changes = [];
for (const v of VERSIONS) {
  const memo = new Map();
  const can = (mon) => {
    if (memo.has(mon.name)) return memo.get(mon.name);
    memo.set(mon.name, false);
    const parent = monById.get(mon.evolvesFrom);
    const ok = (out[v][mon.name] ?? []).some((s) => USABLE.has(s.type)) || (!!parent && mon.evo?.possible !== false && can(parent));
    memo.set(mon.name, ok);
    return ok;
  };
  for (const mon of data.pokemon) { const now = can(mon); if (!!mon.obtainable?.[v] !== now) changes.push(`${mon.name}.${v}: ${mon.obtainable?.[v]} → ${now}`); (mon.obtainable ??= {})[v] = now; }
}
// "só por surto/Radar" da PokéAPI não vale mais: a origem agora é o PKHeX (o motor usa `random` das fontes)
for (const mon of data.pokemon) delete mon.randomOnly;
// iniciais: sem confirmação pelo detonado (E4), vale a lista de iniciais dos encontros fixos do PKHeX (Legends: Z-A)
const starters = [...new Set(enc.fixed.filter((e) => e.type === 'starter' && e.version === VERSIONS[0]).map((e) => monById.get(e.species)?.name).filter(Boolean))];
if (!data.starters && starters.length > 1) {
  const s0 = enc.fixed.find((e) => e.type === 'starter');
  data.starters = { where: s0.location, level: s0.level, species: starters, source: 'encontros fixos do PKHeX' };
}
writeFileSync(dataFile, JSON.stringify(data));
const commit = pkhexCommit(root);
writeFileSync(new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url), JSON.stringify({
  source: `kwsch/PKHeX@${commit?.slice(0, 7) ?? '?'} (tabelas de encontro: local, método e nível; sem taxa)`,
  encountersOnly: true, notes: [...notes], versions: out, machines: {}, tutors: {}, items: {},
}));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/obtainable-changes.json`, import.meta.url), JSON.stringify(changes, null, 1));
console.log(`[${gameId}] PKHeX encontros: ${enc.wild.length} selvagens, ${enc.fixed.length} fixos; mudanças em obtainable: ${changes.length}`);
for (const v of VERSIONS) console.log(`  ${v}: ${data.pokemon.filter((p) => p.obtainable[v]).length}/${data.pokemon.length} obtíveis; ${Object.keys(out[v]).length} com fonte direta`);
if (unknown.versions.size || unknown.species.size || unknown.methods.size) console.log(`  ignorados: versões ${[...unknown.versions]}; espécies fora do dataset ${[...unknown.species].sort((a, b) => a - b).join(',')}; métodos sem rótulo ${[...unknown.methods]}`);
