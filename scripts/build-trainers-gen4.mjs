// Treinadores da Gen 4 a partir do decomp em JSON (pret/pokeplatinum) → public/data/<jogo>-trainers.json
//   generated/trainers.txt          ordem dos ids TRAINER_*
//   res/trainers/data/<x>.json      x = constante sem "TRAINER_" em minúsculas; class, party [{species, level, moves, item,
//                                   iv_scale (0–255; o jogo usa iv_scale·31/255 em todos os atributos)}], double_battle
//   include/data/map_headers.h      cabeçalho → scripts_<mapa> / events_<mapa>
//   lugar: objeto do mapa com "script": "TRAINER_X" (events) ou "StartTrainerBattle TRAINER_X" no script do mapa
//   rival ↔ inicial do JOGADOR: "GetPlayerStarterSpecies VAR_RESULT / GoToIfEq VAR_RESULT, SPECIES_X, Rótulo" (+ GoTo padrão)
//     → no Platinum o sufixo do nome (RIVAL_ROUTE_203_PIPLUP) é o inicial do JOGADOR (o time tem o Turtwig) — oposto da Gen 2
// Uso: node scripts/build-trainers-gen4.mjs <jogo>
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { likelyMoveset } from '../public/engine.mjs';

const gameId = process.argv[2] ?? 'platinum';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const speciesIds = read('generated/species.txt').split(/\r?\n/).map((s) => s.trim());
const moveIds = read('generated/moves.txt').split(/\r?\n/).map((s) => s.trim());
const monOf = (c) => data.pokemon.find((p) => p.id === speciesIds.indexOf(c));
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const moveName = (c) => moveIdOf.get(moveIds.indexOf(c)) ?? null;
const title = (s) => s.toLowerCase().replace(/(^|[\s.&-])([a-zé])/g, (m, a, b) => a + b.toUpperCase());
export const headerLabel = (h) => title(h.replace(/^MAP_HEADER_/, '').replace(/_/g, ' ')).replace(/\b(\d+)f\b/gi, '$1F').replace(/\bB(\d+)f\b/gi, 'B$1F');

// cabeçalhos: arquivo de scripts/eventos → nome do mapa
const headers = {};
for (const m of read('include/data/map_headers.h').matchAll(/\[(MAP_HEADER_\w+)\] = \{([\s\S]*?)\n    \}/g)) {
  const g = (k) => m[2].match(new RegExp(`\\.${k} = (\\w+)`))?.[1];
  headers[m[1]] = { scripts: g('scriptsArchiveID'), events: g('eventsArchiveID') };
}
const byScripts = {}, byEvents = {};
for (const [h, x] of Object.entries(headers)) { if (x.scripts) (byScripts[x.scripts] ??= []).push(h); if (x.events) (byEvents[x.events] ??= []).push(h); }

const where = {}; // TRAINER_X → Set(rótulos)
const add = (t, h) => (where[t] ??= new Set()).add(headerLabel(h));
for (const f of readdirSync(new URL('res/field/events/', root)).filter((x) => x.endsWith('.json'))) {
  const hs = byEvents[f.replace('.json', '')] ?? [];
  const j = JSON.parse(readFileSync(new URL(`res/field/events/${f}`, root), 'utf8'));
  for (const o of j.object_events ?? []) if (typeof o.script === 'string' && o.script.startsWith('TRAINER_')) for (const h of hs.slice(0, 1)) add(o.script, h);
}
const forStarter = {};
for (const f of readdirSync(new URL('res/field/scripts/', root)).filter((x) => x.endsWith('.s'))) {
  const t = read(`res/field/scripts/${f}`);
  const hs = byScripts[f.replace('.s', '')] ?? [];
  // "StartTrainerBattle A" ou "StartTrainerBattle A, B" (dupla: Restaurant, Spear Pillar)
  // StartFirstBattle: 1ª luta contra o Barry (Route 201)
  for (const m of t.matchAll(/(?:StartTrainerBattle|StartFirstBattle) (TRAINER_\w+)(?:, (TRAINER_\w+))?/g)) for (const h of hs.slice(0, 1)) { add(m[1], h); if (m[2]) add(m[2], h); }
  // lutas em dupla com parceiro: "StartTagBattle VAR_x, TRAINER_A, TRAINER_B" (Galactic Grunts de Jubilife, Mars/Jupiter)
  for (const m of t.matchAll(/StartTagBattle \w+, (TRAINER_\w+), (TRAINER_\w+)/g)) for (const h of hs.slice(0, 1)) { add(m[1], h); add(m[2], h); }
  // desvios pelo inicial do jogador: GoToIfEq VAR_RESULT, SPECIES_X, Rótulo … GoTo Rótulo (padrão = o inicial que sobrou)
  for (const blk of t.matchAll(/GetPlayerStarterSpecies VAR_RESULT\s*\n((?:\s*GoToIfEq VAR_RESULT, SPECIES_\w+, \w+\s*\n)+)\s*GoTo (\w+)/g)) {
    const branches = [...blk[1].matchAll(/SPECIES_(\w+), (\w+)/g)].map((x) => ({ sp: x[1], label: x[2] }));
    const all = ['TURTWIG', 'CHIMCHAR', 'PIPLUP'];
    branches.push({ sp: all.find((s) => !branches.some((b) => b.sp === s)), label: blk[2] });
    for (const b of branches) {
      const body = t.split(new RegExp(`^${b.label}:\\s*$`, 'm'))[1]?.split(/^\w+:\s*$/m)[0] ?? '';
      // School Kids da escola também desviam pelo inicial, mas é o mesmo treinador em todos os ramos → só rivais
      for (const tr of body.matchAll(/(?:StartTrainerBattle|StartFirstBattle) (TRAINER_\w+)/g)) if (/^TRAINER_RIVAL_/.test(tr[1])) forStarter[tr[1]] = [b.sp.toLowerCase()];
    }
  }
}

const GROUP = (c) => (/^TRAINER_LEADER_/.test(c) ? 'Líderes de ginásio' : /^TRAINER_ELITE_FOUR_/.test(c) ? 'Elite dos Quatro' : /^TRAINER_CHAMPION_/.test(c) ? 'Campeão' : /^TRAINER_RIVAL_/.test(c) ? 'Rival' : 'Treinadores comuns');
const out = [], unplaced = [];
for (const c of read('generated/trainers.txt').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && s !== 'TRAINER_NONE')) {
  const file = new URL(`res/trainers/data/${c.replace(/^TRAINER_/, '').toLowerCase()}.json`, root);
  if (!existsSync(file)) continue;
  const j = JSON.parse(readFileSync(file, 'utf8'));
  if (!where[c]) { unplaced.push(c); continue; }
  const cls = title(j.class.replace(/^TRAINER_CLASS_/, '').replace(/_(MALE|FEMALE)$/, '').replace(/_/g, ' '));
  const party = j.party.map((p) => {
    const mon = monOf(p.species);
    const explicit = p.moves?.map(moveName).filter(Boolean);
    return { species: mon.name, level: p.level, item: p.item && p.item !== 'ITEM_NONE' ? title(p.item.replace(/^ITEM_/, '').replace(/_/g, ' ')) : null, // trainer_data.c: ivs = ivScale·31/255; Pokemon_InitWith: ivs ≥ INIT_IVS_RANDOM (32) → IVs ALEATÓRIOS (Electivire do Volkner: 2500)
      iv: Math.floor(((p.iv_scale ?? 0) * 31) / 255) >= 32 ? null : Math.floor(((p.iv_scale ?? 0) * 31) / 255), moves: explicit?.length ? explicit : likelyMoveset(mon, p.level), defaultMoves: !explicit?.length };
  });
  const name = /^TRAINER_RIVAL_/.test(c) ? 'Barry' : j.name;
  // classes de líder/Elite já trazem o nome (TRAINER_CLASS_LEADER_ROARK → "Leader Roark"): sem repetir
  out.push({ key: c, name, label: GROUP(c) === 'Rival' ? 'Rival Barry' : cls.toLowerCase().endsWith(j.name.toLowerCase()) ? cls : `${cls} ${j.name}`, class: cls, group: GROUP(c), double: !!j.double_battle, map: [...where[c]], party,
    // rival sem desvio no script (Survival Area): sufixo = inicial do JOGADOR (convenção conferida nos desvios — teste)
    ...((forStarter[c] || /^TRAINER_RIVAL_\w+_(TURTWIG|CHIMCHAR|PIPLUP)$/.test(c)) && { forStarter: forStarter[c] ?? [c.match(/_(TURTWIG|CHIMCHAR|PIPLUP)$/)[1].toLowerCase()] }), ...(/_REMATCH/.test(c) && { rematch: true }) });
}
writeFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, trainers: out, unplaced }));
const by = out.reduce((a, t) => ((a[t.group] = (a[t.group] ?? 0) + 1), a), {});
console.log(`[${gameId}] ${out.length} treinadores ${JSON.stringify(by)}; rivais com inicial ${out.filter((t) => t.forStarter).length}/${out.filter((t) => t.group === 'Rival').length}; revanches ${out.filter((t) => t.rematch).length}; ${unplaced.length} sem lugar (ex.: ${unplaced.slice(0, 8).join(' ')})`);
