// Parser do decomp da Gen 1 em assembly (pret/pokered, pret/pokeyellow). Sem rede.
//   constants/move_constants.asm    → const NOME   (ids na ordem; = ids nacionais da PokéAPI)
//   constants/pokedex_constants.asm → const DEX_NOME (nº da Pokédex)
//   data/pokemon/base_stats/*.asm   → stats (hp atk def spd SPC), tipos, golpes de nível 1, tmhm
//   data/pokemon/evos_moves.asm     → evoluções + learnset (nível, golpe)
//   data/moves/moves.asm            → move NOME, efeito, poder, TIPO, precisão, PP
//   data/types/type_matchups.asm    → db ATACANTE, DEFENSOR, SUPER_EFFECTIVE|NOT_VERY_EFFECTIVE|NO_EFFECT
import { readFileSync, readdirSync } from 'node:fs';

const constList = (text) => {
  // const_def [n] → cada "const NOME" incrementa a partir de n (padrão 0)
  const out = {};
  let n = 0;
  for (const line of text.split('\n')) {
    const def = line.match(/^\s*const_def\s*(\d+)?/);
    if (def) { n = def[1] ? Number(def[1]) : 0; continue; }
    const c = line.match(/^\s*const\s+(\w+)/);
    if (c) out[c[1]] = n++;
  }
  return out;
};
// tipos da Gen 1 no código → nomes da PokéAPI
const TYPE = { NORMAL: 'normal', FIGHTING: 'fighting', FLYING: 'flying', POISON: 'poison', GROUND: 'ground', ROCK: 'rock', BUG: 'bug', GHOST: 'ghost', FIRE: 'fire', WATER: 'water', GRASS: 'grass', ELECTRIC: 'electric', PSYCHIC_TYPE: 'psychic', ICE: 'ice', DRAGON: 'dragon' };
const MUL = { SUPER_EFFECTIVE: 2, NOT_VERY_EFFECTIVE: 0.5, NO_EFFECT: 0 };

/** Pré-processa "IF DEF(_RED) … ELSE … ENDC" (aninhável) para uma versão: defines = Set(['_RED']). */
export function resolveIfdef(text, defines) {
  const out = [];
  const stack = []; // cada nível: { on, taken }
  const active = () => stack.every((s) => s.on);
  for (const line of text.split('\n')) {
    const ifm = line.match(/^\s*IF\s+(!)?DEF\((\w+)\)/);
    if (ifm) { const on = defines.has(ifm[2]) !== !!ifm[1]; stack.push({ on, taken: on }); continue; }
    // ELIF DEF(_SILVER) (pokegold): vale só se nenhum ramo anterior valeu
    const elif = line.match(/^\s*ELIF\s+(!)?DEF\((\w+)\)/);
    if (elif && stack.length) { const s = stack.at(-1); const on = !s.taken && defines.has(elif[2]) !== !!elif[1]; s.on = on; s.taken ||= on; continue; }
    if (/^\s*ELSE\b/.test(line) && stack.length) { const s = stack.at(-1); s.on = !s.taken; s.taken = true; continue; }
    if (/^\s*ENDC\b/.test(line) && stack.length) { stack.pop(); continue; }
    if (active()) out.push(line);
  }
  return out.join('\n');
}

// arquivo do mapa → nome exibido: "SSAnne2F" → "SS Anne 2F", "RocketHideoutB1F" → "Rocket Hideout B1F", "OaksLab" → "Oak's Lab"
const POSSESSIVE = { Oaks: "Oak's", Brunos: "Bruno's", Loreleis: "Lorelei's", Agathas: "Agatha's", Lances: "Lance's", Champions: "Champion's", Bills: "Bill's", Reds: "Red's", Blues: "Blue's", Fujis: "Fuji's", Psychics: "Psychic's", Copycats: "Copycat's", Wardens: "Warden's", Daycare: 'Day Care', Wills: "Will's", Karens: "Karen's", Kogas: "Koga's", Elms: "Elm's", Kurts: "Kurt's", Mrs: 'Mrs.' };
// Yellow divide scripts em "<Mapa>_2.asm" → mesmo mapa
export const mapLabel = (file) => file.replace('.asm', '').replace(/_\d+$/, '').replace('SSAnne', 'SS Anne').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([A-Z][a-z])/g, '$1 $2') /* "Route12SuperRodHouse" */
  .replace(/\b(\w+)\b/g, (w) => POSSESSIVE[w] ?? w).replace('Pokemon', 'Pokémon').replace('Silph Co ', 'Silph Co. ').replace('Mt Moon', 'Mt. Moon').replace('Mr ', 'Mr. ');

export function loadGen1(rootUrl) {
  const read = (p) => readFileSync(new URL(p, rootUrl), 'utf8');
  const moveId = constList(read('constants/move_constants.asm'));
  const dexId = Object.fromEntries(Object.entries(constList(read('constants/pokedex_constants.asm'))).filter(([k]) => k.startsWith('DEX_')).map(([k, v]) => [k.slice(4), v]));

  const moves = {};
  for (const m of read('data/moves/moves.asm').matchAll(/^\s*move\s+(\w+),\s*(\w+),\s*(\d+),\s*(\w+),\s*(\d+),\s*(\d+)/gm)) {
    moves[moveId[m[1]]] = { name: m[1], effect: m[2], power: Number(m[3]), type: TYPE[m[4]], accuracy: Number(m[5]), pp: Number(m[6]) };
  }

  const chart = {};
  for (const m of read('data/types/type_matchups.asm').matchAll(/^\s*db\s+(\w+),\s*(\w+),\s*(SUPER_EFFECTIVE|NOT_VERY_EFFECTIVE|NO_EFFECT)/gm)) (chart[TYPE[m[1]]] ??= {})[TYPE[m[2]]] = MUL[m[3]];

  const species = {}; // DEX nº -> { name, stats, types, level1, machine:Set, levelOrdered:[[lvl, moveConst]], evo:[] }
  const bsDir = new URL('data/pokemon/base_stats/', rootUrl);
  for (const f of readdirSync(bsDir).filter((x) => x.endsWith('.asm'))) {
    const t = readFileSync(new URL(f, bsDir), 'utf8');
    const dex = t.match(/db\s+DEX_(\w+)/)?.[1];
    if (!dex || dexId[dex] == null) continue;
    const [hp, atk, def, spd, spc] = t.match(/db\s+(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\n\s*;\s*hp/)?.slice(1).map(Number) ?? [];
    const [t1, t2] = t.match(/db\s+(\w+),\s*(\w+)\s*;\s*type/).slice(1).map((x) => TYPE[x]);
    const level1 = t.match(/db\s+([\w, ]+?)\s*;\s*level 1 learnset/)[1].split(',').map((x) => x.trim()).filter((x) => x !== 'NO_MOVE');
    const tm = t.slice(t.indexOf('tmhm')).split('; end')[0];
    const machine = new Set([...tm.replace(/^tmhm/, '').matchAll(/(\w+)/g)].map((x) => x[1]).filter((x) => moveId[x] != null).map((x) => moveId[x]));
    species[dexId[dex]] = { name: dex, file: f, stats: { hp, attack: atk, defense: def, speed: spd, special: spc }, types: t1 === t2 ? [t1] : [t1, t2], level1, machine };
  }

  // evos_moves: rótulos "NomeEvosMoves:" → evoluções (até "db 0") e learnset (até "db 0")
  const em = read('data/pokemon/evos_moves.asm');
  const byLabel = {};
  // fim do texto: $(?![\s\S]) — JavaScript NÃO tem \Z (vira a letra "Z" e cortava "ALAKAZAM" em "ALAKA")
  for (const m of em.matchAll(/^(\w+)EvosMoves:\s*\n([\s\S]*?)(?=^\w+EvosMoves:|$(?![\s\S]))/gm)) byLabel[m[1].toLowerCase()] = m[2];
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const sp of Object.values(species)) {
    const body = byLabel[norm(sp.file.replace('.asm', ''))] ?? byLabel[norm(sp.name)];
    if (!body) continue;
    const [evoPart, learnPart = ''] = body.split('; Learnset');
    sp.evo = [...evoPart.matchAll(/db\s+(EVOLVE_\w+),\s*([\w]+),\s*(?:(\d+),\s*)?(\w+)/g)].map((m) => ({ kind: m[1], param: m[2], level: m[3] ? Number(m[3]) : null, to: m[4] }));
    sp.levelOrdered = [...sp.level1.map((mv) => [1, mv]), ...[...learnPart.matchAll(/db\s+(\d+),\s*(\w+)/g)].map((m) => [Number(m[1]), m[2]])];
  }
  return { moveId, moves, chart, species };
}
