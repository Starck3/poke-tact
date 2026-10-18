// Compara golpes (poder/precisão/PP/tipo/prioridade), espécies (stats/tipos/habilidades) e a tabela de tipos
// do dataset (PokeAPI) com o decomp pret/pokefirered. Grava reports/decomp-stats-audit.json.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { decompPaths } from './lib/decomp.mjs';

const gameId = process.argv[2] ?? 'firered-leafgreen';
const { game, commit, read, mapsDir: decompMapsDir } = decompPaths(gameId);
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const lower = (s) => s.toLowerCase().replace(/_/g, '-');
// decimal (FRLG/Emerald) ou hexadecimal (Ruby/Sapphire: #define TYPE_FIRE 0x0a) — ler só o "0" de "0x0a" punha todos os tipos iguais
const typeId = Object.fromEntries([...read('include/constants/pokemon.h').matchAll(/#define TYPE_(\w+)\s+(0x[0-9a-fA-F]+|\d+)\b/g)].map((m) => [m[1], Number(m[2])]));
const typeName = Object.fromEntries(Object.entries(typeId).map(([n, i]) => [i, n.toLowerCase()]));
const moveIdByName = Object.fromEntries([...read('include/constants/moves.h').matchAll(/#define MOVE_(\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]));
const idOfApiMove = (n) => JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id;
const apiMoveByName = new Map(Object.keys(data.moves).map((n) => [idOfApiMove(n), n]));
const report = { commit, moves: [], species: [], types: [] };
const block = (text) => text.split(/\n\s*\[(?=(?:MOVE|SPECIES)_)/).slice(1);

// --- Golpes
let movesChecked = 0;
for (const b of block(read('src/data/battle_moves.h'))) {
  const name = b.match(/^MOVE_(\w+)\]/)?.[1];
  if (!name || name === 'NONE') continue;
  const f = (k) => b.match(new RegExp(`\\.${k}\\s*=\\s*(-?\\w+)`))?.[1];
  const apiName = apiMoveByName.get(moveIdByName[name]);
  if (!apiName) { report.moves.push({ move: name, issue: 'não existe no dataset' }); continue; }
  movesChecked++;
  const api = data.moves[apiName];
  const dec = { power: Number(f('power')), type: typeName[typeId[f('type').replace('TYPE_', '')]], accuracy: Number(f('accuracy')), pp: Number(f('pp')), priority: Number(f('priority')) };
  const cmp = { power: [api.power ?? 0, dec.power <= 1 ? 0 : dec.power] /* o jogo usa 1 como placeholder de dano variável/OHKO */, type: [api.type, dec.type], accuracy: api.power ? [api.accuracy ?? 0, dec.accuracy] : [0, 0] /* status: o jogo grava 100 onde a PokéAPI não tem precisão */, pp: [api.pp, dec.pp], priority: [api.priority, dec.priority] };
  for (const [k, [a, d]] of Object.entries(cmp)) if (a !== d) report.moves.push({ move: apiName, field: k, pokeapi: a, decomp: d });
}

// --- Espécies
const STAT = { hp: 'baseHP', attack: 'baseAttack', defense: 'baseDefense', speed: 'baseSpeed', 'special-attack': 'baseSpAttack', 'special-defense': 'baseSpDefense' };
const byName = Object.fromEntries(data.pokemon.map((p) => [norm(p.name), p]));
let speciesChecked = 0;
for (const b of block(read('src/data/pokemon/species_info.h'))) {
  const name = b.match(/^SPECIES_(\w+)\]/)?.[1];
  if (!name || name === 'NONE') continue;
  const mon = byName[norm(name)] ?? byName[Object.keys(byName).find((k) => k === norm(name) + 'normal')];
  if (!mon) continue; // espécies fora do dataset (ex.: slots "?" do jogo)
  speciesChecked++;
  for (const [k, c] of Object.entries(STAT)) {
    const d = Number(b.match(new RegExp(`\\.${c}\\s*=\\s*(\\d+)`))[1]);
    if (mon.stats[k] !== d) report.species.push({ pokemon: mon.name, field: k, pokeapi: mon.stats[k], decomp: d });
  }
  // .types = { A, B } (FRLG/Emerald) ou .type1 = A / .type2 = B (Ruby/Sapphire, base_stats.h)
  const typePair = b.match(/\.types\s*=\s*\{\s*(\w+),\s*(\w+)\s*\}/)?.slice(1) ?? [b.match(/\.type1\s*=\s*(\w+)/)?.[1], b.match(/\.type2\s*=\s*(\w+)/)?.[1]];
  const [t1, t2] = typePair.map((t) => typeName[typeId[t.replace('TYPE_', '')]]);
  const dt = t1 === t2 ? [t1] : [t1, t2];
  if (dt.join() !== mon.types.join()) report.species.push({ pokemon: mon.name, field: 'types', pokeapi: mon.types.join('/'), decomp: dt.join('/') });
  const ab = [...(b.match(/\.abilities\s*=\s*\{\s*(\w+),\s*(\w+)\s*\}/)?.slice(1) ?? [b.match(/\.ability1\s*=\s*(\w+)/)?.[1], b.match(/\.ability2\s*=\s*(\w+)/)?.[1]])].filter((a) => a !== 'ABILITY_NONE').map((a) => lower(a.replace('ABILITY_', '')));
  if ([...new Set(ab)].sort().join() !== [...mon.abilities].sort().join()) report.species.push({ pokemon: mon.name, field: 'abilities', pokeapi: mon.abilities.join('/'), decomp: [...new Set(ab)].join('/') });
}

// --- Tabela de tipos (todas as combinações atacante × defensor)
// FRLG/Emerald: em C (battle_main.c, TYPE_MUL_*); Ruby/Sapphire: em assembly (data/type_effectiveness.inc, ".byte A, B, 20|05|00")
const MUL = { TYPE_MUL_NO_EFFECT: 0, TYPE_MUL_NOT_EFFECTIVE: 0.5, TYPE_MUL_SUPER_EFFECTIVE: 2 };
const mul = (v) => (v in MUL ? MUL[v] : Number(v) / 10); // .inc: ponto fixo (20 = ×2, 5 = ×0,5, 0 = ×0)
let tbl = read('src/battle_main.c').match(/gTypeEffectiveness\[\d+\]\s*=\s*\{([\s\S]*?)\};/)?.[1];
if (!tbl) tbl = readFileSync(new URL('../type_effectiveness.inc', decompMapsDir), 'utf8');
const dec = {};
for (const m of tbl.matchAll(/TYPE_(\w+),\s*TYPE_(\w+),\s*(TYPE_MUL_\w+|\d+)\b/g)) {
  if (m[1] === 'FORESIGHT' || m[1] === 'ENDTABLE') continue;
  (dec[typeName[typeId[m[1]]]] ??= {})[typeName[typeId[m[2]]]] = mul(m[3]);
}
for (const a of data.types) for (const d of data.types) {
  const x = data.chart[a][d], y = dec[a]?.[d] ?? 1;
  if (x !== y) report.types.push({ attacker: a, defender: d, pokeapi: x, decomp: y });
}
const tableTypes = new Set([...tbl.matchAll(/TYPE_(\w+)/g)].map((m) => typeName[typeId[m[1]]]).filter(Boolean));

writeFileSync(new URL(`../reports/${gameId}/decomp-stats-audit.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`golpes comparados ${movesChecked}, divergências ${report.moves.length}`);
console.log(`espécies comparadas ${speciesChecked}, divergências ${report.species.length}`);
console.log(`tabela de tipos: ${data.types.length ** 2} pares, divergências ${report.types.length}`);
for (const k of ['moves', 'species', 'types']) for (const x of report[k].slice(0, 12)) console.log(' ', k, JSON.stringify(x));
