// Parser do decomp de HeartGold/SoulSilver (pret/pokeheartgold) — só o que está em TEXTO. Sem rede.
//   files/poketool/personal/personal.json  baseStats[espécie] (índice = id; 0 = NONE): hp atk def speed spatk spdef, types,
//                                          abilities, tms (números de TM/HM: 1–92 TM, 93–100 HM)
//   files/poketool/personal/evo.json       evoTable [{ baseSpecies, evos: [{ method, param, target }] }]
//   files/fielddata/wazaoshie/waza_oshie.json  tutor [{ mon, moves: [TUTOR_X] }] (TUTOR_X → MOVE_X)
//   src/item.c sTMHMMoves[]                TM/HM nº → golpe
//   include/constants/moves.h              #define MOVE_X n (id nacional)
//   src/battle/overlay_12_0224E4FC.c       tabela de tipos { ATACANTE, DEFENSOR, TYPE_MUL_* }
//   files/poketool/personal/wotbl.narc     learnset por nível (binário; um arquivo por espécie, na ordem do jogo)
//   files/poketool/waza/waza_tbl.narc      dados dos golpes (binário; um arquivo por golpe = id nacional)
import { readFileSync } from 'node:fs';
import { readNarc, parseLevelUp, parseMove } from './narc.mjs';

const T = (t) => t.replace(/^TYPE_/, '').toLowerCase().replace('mystery', 'unknown');
const MUL = { TYPE_MUL_SUPER_EFFECTIVE: 2, TYPE_MUL_NOT_EFFECTIVE: 0.5, TYPE_MUL_NO_EFFECT: 0 };
const EVO = {
  EVO_LEVEL: 'LEVEL', EVO_LEVEL_FEMALE: 'LEVEL', EVO_LEVEL_MALE: 'LEVEL', EVO_LEVEL_PID_HI: 'LEVEL', EVO_LEVEL_PID_LO: 'LEVEL', EVO_LEVEL_NINJASK: 'LEVEL', EVO_LEVEL_SHEDINJA: 'LEVEL',
  EVO_LEVEL_ATK_GT_DEF: 'LEVEL_ATK_GT_DEF', EVO_LEVEL_ATK_LT_DEF: 'LEVEL_ATK_LT_DEF', EVO_LEVEL_ATK_EQ_DEF: 'LEVEL_ATK_EQ_DEF',
  EVO_FRIENDSHIP: 'FRIENDSHIP', EVO_FRIENDSHIP_DAY: 'FRIENDSHIP_DAY', EVO_FRIENDSHIP_NIGHT: 'FRIENDSHIP_NIGHT',
  EVO_STONE: 'ITEM', EVO_STONE_MALE: 'ITEM', EVO_STONE_FEMALE: 'ITEM', EVO_TRADE: 'TRADE', EVO_TRADE_ITEM: 'TRADE_ITEM', EVO_BEAUTY: 'BEAUTY',
  EVO_HAS_MOVE: 'KNOW_MOVE', EVO_MAPSEC: 'LOCATION', EVO_CORONET: 'LOCATION', EVO_ETERNA: 'LOCATION', EVO_ROUTE217: 'LOCATION',
  EVO_ITEM_DAY: 'HELD_ITEM_DAY', EVO_ITEM_NIGHT: 'HELD_ITEM_NIGHT', EVO_OTHER_PARTY_MON: 'PARTY',
};

// MAP_VIOLET_GYM → "Violet Gym"; MAP_POKEMON_LEAGUE_… → "Pokémon League …" (rótulo usado por treinadores e aquisição)
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s.&-])([a-zé])/g, (m, a, b) => a + b.toUpperCase());
export const mapLabel = (m) => titleCase(m.replace(/^MAP_/, '').replace(/_/g, ' ')).replace(/\b(\d+)f\b/gi, '$1F').replace(/\bB(\d+)f\b/gi, 'B$1F').replace(/\bPokecenter\b/, 'Pokémon Center').replace(/\bPokemart\b/, 'Poké Mart').replace(/\bPokemon\b/g, 'Pokémon');

export function loadHgss(rootUrl) {
  const read = (p) => readFileSync(new URL(p, rootUrl), 'utf8');
  const moveId = Object.fromEntries([...read('include/constants/moves.h').matchAll(/#define (MOVE_\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]));
  const tmhm = [...read('src/item.c').split('sTMHMMoves[]')[1].split('};')[0].matchAll(/(MOVE_\w+)/g)].map((m) => moveId[m[1]]);
  const chart = {};
  const tbl = read('src/battle/overlay_12_0224E4FC.c');
  for (const m of tbl.matchAll(/\{\s*(TYPE_\w+),\s*(TYPE_\w+),\s*(TYPE_MUL_\w+)\s*\}/g)) if (m[1] !== 'TYPE_FORESIGHT' && MUL[m[3]] != null) (chart[T(m[1])] ??= {})[T(m[2])] = MUL[m[3]];
  const personal = JSON.parse(read('files/poketool/personal/personal.json')).baseStats;
  const species = {};
  personal.forEach((p, id) => {
    if (!id || id > 493) return;
    species[id] = {
      name: p.species, stats: { hp: p.hp, attack: p.atk, defense: p.def, speed: p.speed, 'special-attack': p.spatk, 'special-defense': p.spdef },
      types: [...new Set(p.types.map(T))],
      abilities: [...new Set(p.abilities.filter((a) => a !== 'ABILITY_NONE').map((a) => a.replace('ABILITY_', '').toLowerCase().replace(/_/g, '-')))], // grafia do decomp: COMPOUNDEYES
      // HMs ficam num campo separado ("hms": [1, 4, 6]) — índice 92 + n em sTMHMMoves
      machine: new Set([...(p.tms ?? []).map((n) => tmhm[n - 1]), ...(p.hms ?? []).map((n) => tmhm[92 + n - 1])].filter((x) => x != null)),
      tutor: new Set(), evo: [],
    };
  });
  const byName = Object.fromEntries(Object.entries(species).map(([id, s]) => [`SPECIES_${s.name}`, Number(id)]));
  for (const t of JSON.parse(read('files/fielddata/wazaoshie/waza_oshie.json')).tutor) {
    const id = byName[t.mon];
    if (id) for (const m of t.moves) { const mv = moveId[m.replace(/^TUTOR_/, 'MOVE_')]; if (mv != null) species[id].tutor.add(mv); }
  }
  for (const e of JSON.parse(read('files/poketool/personal/evo.json')).evoTable) {
    for (const x of e.evos ?? []) if (x.method && x.method !== 'EVO_NONE') {
      const from = byName[e.baseSpecies], to = byName[x.target];
      if (from && to) species[from].evo.push({ kind: EVO[x.method] ?? x.method, raw: x.method, param: x.param, to: x.target });
    }
  }
  // binários do jogo (NARC): learnset por nível na ordem do jogo e dados dos golpes
  const wotbl = readNarc(new URL('files/poketool/personal/wotbl.narc', rootUrl));
  for (const [id, s] of Object.entries(species)) s.levelOrdered = parseLevelUp(wotbl[id]);
  const moves = {};
  readNarc(new URL('files/poketool/waza/waza_tbl.narc', rootUrl)).forEach((b, id) => { if (id && id <= 467) moves[id] = parseMove(b); });
  return { moveId, species, chart, speciesId: byName, tmhm, moves };
}
