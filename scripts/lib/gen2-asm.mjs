// Parser do decomp da Gen 2 em assembly (pret/pokegold, pret/pokecrystal). Sem rede.
//   constants/move_constants.asm     → "const_def" + "const NOME" (NO_MOVE = 0; ids = nacionais da PokéAPI)
//   constants/pokemon_constants.asm  → "const_def 1" + "const BULBASAUR" … até NUM_POKEMON (nº = Pokédex nacional)
//   constants/item_constants.asm     → add_tm / add_hm (máquinas) e add_mt (tutores do Crystal) — a lista "tmhm" do
//                                      base_stats mistura os três; é aqui que se separa
//   data/pokemon/base_stats/*.asm    → "db ESPÉCIE ; 001", 6 stats (hp atk def spd sat sdf), tipos, "tmhm …"
//   data/pokemon/evos_attacks.asm    → "<Nome>EvosAttacks:" evoluções até "db 0", depois learnset (já com os de nível 1)
//                                      até "db 0"; a ORDEM das espécies vem de evos_attacks_pointers.asm
//   data/moves/moves.asm             → move NOME, EFEITO, poder, TIPO, precisão, PP, chance
//   data/types/type_matchups.asm     → db ATACANTE, DEFENSOR, mult (depois de "db -2" vêm as imunidades que o Foresight tira)
import { readFileSync, readdirSync } from 'node:fs';

const TYPE = { NORMAL: 'normal', FIGHTING: 'fighting', FLYING: 'flying', POISON: 'poison', GROUND: 'ground', ROCK: 'rock', BUG: 'bug', GHOST: 'ghost', STEEL: 'steel', FIRE: 'fire', WATER: 'water', GRASS: 'grass', ELECTRIC: 'electric', PSYCHIC_TYPE: 'psychic', ICE: 'ice', DRAGON: 'dragon', DARK: 'dark', CURSE_TYPE: 'unknown' }; // Curse = tipo "???" (PokéAPI: unknown)
const MUL = { SUPER_EFFECTIVE: 2, NOT_VERY_EFFECTIVE: 0.5, NO_EFFECT: 0 };

const constBlock = (text, startRe, endRe) => {
  const out = {};
  let n = null;
  for (const line of text.split('\n')) {
    if (endRe && endRe.test(line) && n != null) break;
    const def = line.match(/^\s*const_def\s*(\d+)?/);
    if (def && (n == null || !startRe)) { n = def[1] ? Number(def[1]) : 0; continue; }
    const c = line.match(/^\s*const\s+(\w+)/);
    if (c && n != null) out[c[1]] = n++;
  }
  return out;
};

export function loadGen2(rootUrl) {
  const read = (p) => readFileSync(new URL(p, rootUrl), 'utf8');
  const moveId = constBlock(read('constants/move_constants.asm'), null, /NUM_ATTACKS/);
  const speciesId = constBlock(read('constants/pokemon_constants.asm'), /const_def 1/, /NUM_POKEMON/);
  const items = read('constants/item_constants.asm');
  const machineMoves = new Set([...items.matchAll(/^\s*add_(?:tm|hm)\s+(\w+)/gm)].map((m) => m[1]));
  const tutorMoves = new Set([...items.matchAll(/^\s*add_mt\s+(\w+)/gm)].map((m) => m[1]));

  const moves = {};
  for (const m of read('data/moves/moves.asm').matchAll(/^\s*move\s+(\w+),\s*(\w+),\s*(\d+),\s*(\w+),\s*(\d+),\s*(\d+),\s*(\d+)/gm)) {
    moves[moveId[m[1]]] = { name: m[1], effect: m[2], power: Number(m[3]), type: TYPE[m[4]] ?? m[4], accuracy: Number(m[5]), pp: Number(m[6]), chance: Number(m[7]) };
  }
  const chart = {};
  for (const m of read('data/types/type_matchups.asm').matchAll(/^\s*db\s+(\w+),\s*(\w+),\s*(SUPER_EFFECTIVE|NOT_VERY_EFFECTIVE|NO_EFFECT)/gm)) (chart[TYPE[m[1]]] ??= {})[TYPE[m[2]]] = MUL[m[3]];

  const species = {}; // nº -> { name, stats, types, machine:Set(id), tutor:Set(id), levelOrdered, evo }
  const bsDir = new URL('data/pokemon/base_stats/', rootUrl);
  for (const f of readdirSync(bsDir).filter((x) => x.endsWith('.asm'))) {
    const t = readFileSync(new URL(f, bsDir), 'utf8');
    const name = t.match(/^\s*db\s+(\w+)\s*;\s*\d+/m)?.[1];
    if (!name || speciesId[name] == null) continue;
    const [hp, atk, def, spd, sat, sdf] = t.match(/db\s+(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\n\s*;\s*hp/)?.slice(1).map(Number) ?? [];
    const [t1, t2] = t.match(/db\s+(\w+),\s*(\w+)\s*;\s*type/).slice(1).map((x) => TYPE[x]);
    const list = (t.match(/^\s*tmhm\s+([^\n]*)/m)?.[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    species[speciesId[name]] = {
      name, file: f, stats: { hp, attack: atk, defense: def, speed: spd, 'special-attack': sat, 'special-defense': sdf },
      types: t1 === t2 ? [t1] : [t1, t2],
      machine: new Set(list.filter((x) => machineMoves.has(x)).map((x) => moveId[x])),
      tutor: new Set(list.filter((x) => tutorMoves.has(x)).map((x) => moveId[x])),
    };
  }
  // evoluções + learnset: rótulos na ordem dos ponteiros (índice + 1 = nº da espécie)
  const ptrs = [...read('data/pokemon/evos_attacks_pointers.asm').matchAll(/^\s*dw\s+(\w+)/gm)].map((m) => m[1]);
  const ea = read('data/pokemon/evos_attacks.asm');
  ptrs.forEach((label, i) => {
    const sp = species[i + 1];
    if (!sp) return;
    const body = ea.split(new RegExp(`^${label}:\\s*$`, 'm'))[1]?.split(/^\w+EvosAttacks:\s*$/m)[0] ?? '';
    const [evoPart, learnPart = ''] = body.split(/db 0 ; no more evolutions/);
    sp.evo = [...evoPart.matchAll(/db\s+(EVOLVE_\w+),\s*([^\n;]+)/g)].map((m) => {
      const args = m[2].split(',').map((x) => x.trim());
      return { kind: m[1], param: args[0], extra: args.length > 2 ? args[1] : null, to: args.at(-1) };
    });
    sp.levelOrdered = [...learnPart.split(/db 0 ; no more level-up moves/)[0].matchAll(/db\s+(\d+),\s*(\w+)/g)].map((m) => [Number(m[1]), m[2]]);
  });
  return { moveId, speciesId, moves, chart, species, machineMoves, tutorMoves };
}
