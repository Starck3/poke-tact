// Parser do decomp da Gen 4 em JSON (pret/pokeplatinum). Sem rede.
//   generated/moves.txt, generated/species.txt  ordem = ids (MOVE_POUND = 1 = id nacional; SPECIES_BULBASAUR = 1)
//   res/pokemon/<espécie>/data.json  base_stats, types, abilities, learnset.by_level (ORDEM do jogo), by_tm ("TM06"),
//                                    by_tutor, egg_moves, evolutions [[EVO_X, parâmetro, SPECIES_Y]]
//   res/moves/<golpe>/data.json      class (CLASS_PHYSICAL|SPECIAL|STATUS — divisão por golpe da Gen 4), type, power,
//                                    accuracy, pp, priority, effect
//   res/items/data/tmNN.json|hmNN.json  teachesMove (TM → golpe)
//   src/battle/battle_lib.c          sTypeMatchupMultipliers { ATACANTE, DEFENSOR, TYPE_MULTI_* }
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const T = (t) => t.replace(/^TYPE_/, '').toLowerCase().replace('mystery', 'unknown');
const MUL = { TYPE_MULTI_SUPER_EFF: 2, TYPE_MULTI_NOT_VERY_EFF: 0.5, TYPE_MULTI_IMMUNE: 0 };
// evolução → vocabulário do motor (LEVEL, ITEM, TRADE, TRADE_ITEM, FRIENDSHIP[_DAY|_NIGHT], LEVEL_ATK_*_DEF, …)
const EVO = {
  EVO_LEVEL: 'LEVEL', EVO_LEVEL_FEMALE: 'LEVEL', EVO_LEVEL_MALE: 'LEVEL', EVO_LEVEL_PID_HIGH: 'LEVEL', EVO_LEVEL_PID_LOW: 'LEVEL',
  EVO_LEVEL_NINJASK: 'LEVEL', EVO_LEVEL_SHEDINJA: 'LEVEL', EVO_LEVEL_ATK_GT_DEF: 'LEVEL_ATK_GT_DEF', EVO_LEVEL_ATK_LT_DEF: 'LEVEL_ATK_LT_DEF',
  EVO_LEVEL_ATK_EQ_DEF: 'LEVEL_ATK_EQ_DEF', EVO_LEVEL_HAPPINESS: 'FRIENDSHIP', EVO_LEVEL_HAPPINESS_DAY: 'FRIENDSHIP_DAY',
  EVO_LEVEL_HAPPINESS_NIGHT: 'FRIENDSHIP_NIGHT', EVO_USE_ITEM: 'ITEM', EVO_USE_ITEM_MALE: 'ITEM', EVO_USE_ITEM_FEMALE: 'ITEM',
  EVO_TRADE: 'TRADE', EVO_TRADE_WITH_HELD_ITEM: 'TRADE_ITEM', EVO_LEVEL_BEAUTY: 'BEAUTY', EVO_LEVEL_KNOW_MOVE: 'KNOW_MOVE',
  EVO_LEVEL_MAGNETIC_FIELD: 'LOCATION', EVO_LEVEL_MOSS_ROCK: 'LOCATION', EVO_LEVEL_ICE_ROCK: 'LOCATION',
  EVO_LEVEL_WITH_HELD_ITEM_DAY: 'HELD_ITEM_DAY', EVO_LEVEL_WITH_HELD_ITEM_NIGHT: 'HELD_ITEM_NIGHT', EVO_LEVEL_SPECIES_IN_PARTY: 'PARTY',
};

export function loadGen4(rootUrl) {
  const read = (p) => readFileSync(new URL(p, rootUrl), 'utf8');
  const lines = (p) => read(p).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const moveId = Object.fromEntries(lines('generated/moves.txt').map((m, i) => [m, i]));
  const speciesId = Object.fromEntries(lines('generated/species.txt').map((s, i) => [s, i]));
  const tm = {};
  const itemsDir = new URL('res/items/data/', rootUrl);
  for (const f of readdirSync(itemsDir).filter((x) => /^(tm|hm)\d+\.json$/.test(x))) {
    const j = JSON.parse(readFileSync(new URL(f, itemsDir), 'utf8'));
    tm[j.name] = j.teachesMove; // "TM01" → "MOVE_FOCUS_PUNCH"
  }
  const moves = {};
  for (const d of readdirSync(new URL('res/moves/', rootUrl))) {
    const f = new URL(`res/moves/${d}/data.json`, rootUrl);
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    const c = `MOVE_${d.toUpperCase()}`;
    if (moveId[c] == null) continue;
    moves[moveId[c]] = { name: c, power: j.power, accuracy: j.accuracy, pp: j.pp, type: T(j.type), priority: j.priority, category: j.class.replace('CLASS_', '').toLowerCase(), effect: j.effect?.type };
  }
  const chart = {};
  const tbl = read('src/battle/battle_lib.c').split('sTypeMatchupMultipliers')[1].split('};')[0];
  for (const m of tbl.matchAll(/\{\s*(TYPE_\w+),\s*(TYPE_\w+),\s*(TYPE_MULTI_\w+)\s*\}/g)) if (m[1] !== 'TYPE_FORESIGHT') (chart[T(m[1])] ??= {})[T(m[2])] = MUL[m[3]];
  const species = {};
  for (const d of readdirSync(new URL('res/pokemon/', rootUrl))) {
    const f = new URL(`res/pokemon/${d}/data.json`, rootUrl);
    if (!existsSync(f)) continue;
    const id = speciesId[`SPECIES_${d.toUpperCase()}`];
    if (!id || id > 493) continue;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    const b = j.base_stats;
    const tps = [...new Set(j.types.map(T))];
    species[id] = {
      dir: d, stats: { hp: b.hp, attack: b.attack, defense: b.defense, speed: b.speed, 'special-attack': b.special_attack, 'special-defense': b.special_defense },
      types: tps, abilities: [...new Set(j.abilities.filter((a) => a !== 'ABILITY_NONE'))].map((a) => a.replace('ABILITY_', '').toLowerCase().replace(/_/g, '-')),
      levelOrdered: j.learnset.by_level.map(([lv, mv]) => [lv, mv]),
      machine: new Set(j.learnset.by_tm.map((t) => moveId[tm[t]]).filter((x) => x != null)),
      tutor: new Set((j.learnset.by_tutor ?? []).map((m) => moveId[m]).filter((x) => x != null)),
      egg: new Set((j.learnset.egg_moves ?? []).map((m) => moveId[m]).filter((x) => x != null)),
      // sem parâmetro a entrada tem 2 itens: ["EVO_LEVEL_HAPPINESS_NIGHT", "SPECIES_UMBREON"] (antes o alvo virava undefined e
      // Umbreon, Espeon, Leafeon, Glaceon, Magnezone, Probopass… ficavam sem evolução)
      evo: (j.evolutions ?? []).map((e) => { const [kind, param, to] = e.length === 2 ? [e[0], null, e[1]] : e; return { kind: EVO[kind] ?? kind, raw: kind, param, to }; }),
    };
  }
  // tutores especiais por SCRIPT (fora do by_tutor): golpes supremos dos iniciais e Draco Meteor (Route 210, casa da Grandma
  // Wilma: BufferMoveName / CheckPartyMonHasMove) — usados pela auditoria para explicar o que a PokéAPI lista como tutor
  const scriptTutors = new Set();
  const sdir = new URL('res/field/scripts/', rootUrl);
  for (const f of readdirSync(sdir).filter((x) => x.endsWith('.s'))) for (const m of readFileSync(new URL(f, sdir), 'utf8').matchAll(/(?:BufferMoveName \d+|CheckPartyMonHasMove \w+), (MOVE_\w+)/g)) if (moveId[m[1]] != null) scriptTutors.add(moveId[m[1]]);
  return { moveId, speciesId, moves, chart, species, tm, scriptTutors };
}
