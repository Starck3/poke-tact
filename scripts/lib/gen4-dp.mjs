// Parser do decomp de Diamond/Pearl (pret/pokediamond, b623abe) — o núcleo está em JSON (medição corrigida em 2026-10-17):
//   files/poketool/personal/personal.json  baseStats[id] (hp atk def speed spatk spdef, types, abilities, tms, hms)
//                                          (personal_pearl/personal.json só muda itens segurados → ignorado)
//   files/poketool/personal/wotbl.json     wotbl[id] { species, moves: [{ move: "TACKLE", level }] } — ORDEM do jogo
//   files/poketool/personal/evo.json       evos[id] { species, evos: [{ method: EVO_X, target, param }] }
//   files/poketool/waza/waza_tbl.json      waza_tbl[id] { name: MOVE_X, class: CLASS_*, power, type, accuracy (0 = nunca erra), pp, priority }
//   files/poketool/trainer/trdata.json     trdata[n] { class, name, doubleBattle, party: [{ difficulty, level, species, moves?, item? }] }
//   include/constants/{species,moves,trainers}.h  #define X n
//   arm9/src/itemtool.c sTMHMMoves[]       TM01…TM92, HM01…HM08 (lido com "git show HEAD:" — o checkout esparso não traz o arm9)
//   arm9/overlays/11/asm/ov11_02242B78.s  tabela de tipos da batalha, em bytes: trincas (atacante, defensor, ×10)
//                                          — 20 = 2×, 5 = ½×, 0 = imune; 0xFE separa o trecho do Foresight; 0xFF encerra
// FORA (binário): encontros, scripts, eventos, matriz → sem "onde obter", progresso e lugar dos treinadores.
import { readFileSync } from 'node:fs';
import { GEN4_TYPES } from './narc.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const T = (t) => t.replace(/^TYPE_/, '').toLowerCase().replace('mystery', 'unknown');
const EVO = {
  EVO_LEVEL: 'LEVEL', EVO_LEVEL_FEMALE: 'LEVEL', EVO_LEVEL_MALE: 'LEVEL', EVO_LEVEL_PID_HI: 'LEVEL', EVO_LEVEL_PID_LO: 'LEVEL', EVO_LEVEL_NINJASK: 'LEVEL', EVO_LEVEL_SHEDINJA: 'LEVEL',
  EVO_LEVEL_ATK_GT_DEF: 'LEVEL_ATK_GT_DEF', EVO_LEVEL_ATK_LT_DEF: 'LEVEL_ATK_LT_DEF', EVO_LEVEL_ATK_EQ_DEF: 'LEVEL_ATK_EQ_DEF',
  EVO_FRIENDSHIP: 'FRIENDSHIP', EVO_FRIENDSHIP_DAY: 'FRIENDSHIP_DAY', EVO_FRIENDSHIP_NIGHT: 'FRIENDSHIP_NIGHT',
  EVO_STONE: 'ITEM', EVO_STONE_MALE: 'ITEM', EVO_STONE_FEMALE: 'ITEM', EVO_TRADE: 'TRADE', EVO_TRADE_ITEM: 'TRADE_ITEM', EVO_BEAUTY: 'BEAUTY',
  EVO_HAS_MOVE: 'KNOW_MOVE', EVO_MAPSEC: 'LOCATION', EVO_CORONET: 'LOCATION', EVO_ETERNA: 'LOCATION', EVO_ROUTE217: 'LOCATION',
  EVO_ITEM_DAY: 'HELD_ITEM_DAY', EVO_ITEM_NIGHT: 'HELD_ITEM_NIGHT', EVO_OTHER_PARTY_MON: 'PARTY',
};

export function loadDp(rootUrl) {
  const read = (p) => readFileSync(new URL(p, rootUrl), 'utf8');
  const defs = (p, pre) => Object.fromEntries([...read(p).matchAll(new RegExp(`#define (${pre}_\\w+)\\s+(\\d+)`, 'g'))].map((m) => [m[1], Number(m[2])]));
  const moveId = defs('include/constants/moves.h', 'MOVE'), speciesId = defs('include/constants/species.h', 'SPECIES');
  const itemtool = execFileSync('git', ['show', 'HEAD:arm9/src/itemtool.c'], { cwd: fileURLToPath(rootUrl), encoding: 'utf8' });
  const tmhm = [...itemtool.split('sTMHMMoves[]')[1].split('};')[0].matchAll(/(MOVE_\w+)/g)].map((m) => moveId[m[1]]);
  const moves = {};
  for (const m of JSON.parse(read('files/poketool/waza/waza_tbl.json')).waza_tbl) {
    const id = moveId[m.name];
    if (id) moves[id] = { pp: m.pp, power: m.power, accuracy: m.accuracy, priority: m.priority, type: T(m.type), category: m.class.replace(/^CLASS_/, '').toLowerCase() };
  }
  const species = {};
  JSON.parse(read('files/poketool/personal/personal.json')).baseStats.forEach((p, id) => {
    if (!id || id > 493) return;
    species[id] = {
      name: p.species, stats: { hp: p.hp, attack: p.atk, defense: p.def, speed: p.speed, 'special-attack': p.spatk, 'special-defense': p.spdef },
      types: [...new Set(p.types.map(T))],
      abilities: [...new Set(p.abilities.filter((a) => a !== 'ABILITY_NONE').map((a) => a.replace('ABILITY_', '').toLowerCase().replace(/_/g, '-')))],
      machine: new Set([...(p.tms ?? []).map((n) => tmhm[n - 1]), ...(p.hms ?? []).map((n) => tmhm[92 + n - 1])].filter((x) => x != null)),
      levelOrdered: [], evo: [],
    };
  });
  const byName = Object.fromEntries(Object.entries(species).map(([id, s]) => [s.name, Number(id)]));
  for (const w of JSON.parse(read('files/poketool/personal/wotbl.json')).wotbl) { const id = byName[w.species]; if (id) species[id].levelOrdered = w.moves.map((m) => [m.level, moveId[`MOVE_${m.move}`]]); }
  for (const e of JSON.parse(read('files/poketool/personal/evo.json')).evos) {
    const from = byName[e.species];
    for (const x of e.evos ?? []) if (from && x.method && x.method !== 'EVO_NONE' && byName[x.target]) species[from].evo.push({ kind: EVO[x.method] ?? x.method, raw: x.method, param: x.param, to: x.target });
  }
  return { moveId, speciesId, species, moves, tmhm, byName, chart: loadChart(rootUrl) };
}

// Tabela de tipos: os bytes do arquivo em sequência (os rótulos do disassembler cortam a tabela no meio); ela começa na
// 1ª trinca Normal→Rock ½× seguida de Normal→Steel ½× e Fire→Fire ½× (padrão único no arquivo).
function loadChart(rootUrl) {
  const src = readFileSync(new URL('arm9/overlays/11/asm/ov11_02242B78.s', rootUrl), 'utf8');
  const bytes = [...src.matchAll(/^[ \t]*\.byte[ \t]+([^;\r\n]+)/gm)].flatMap((m) => m[1].split(',').map((x) => Number(x.trim())));
  const start = bytes.findIndex((_, i) => [0, 5, 5, 0, 8, 5, 10, 10, 5].every((v, k) => bytes[i + k] === v));
  if (start < 0) throw new Error('tabela de tipos não encontrada no overlay 11');
  const chart = {};
  for (let i = start; bytes[i] !== 0xff; i += 3) {
    if (bytes[i] === 0xfe) continue; // separador do Foresight (Normal/Fighting → Ghost vêm depois dele)
    const [a, d, x] = [GEN4_TYPES[bytes[i]], GEN4_TYPES[bytes[i + 1]], bytes[i + 2] / 10];
    if (!a || !d) throw new Error(`tabela de tipos: byte inesperado em ${i}`);
    (chart[a] ??= {})[d] = x;
  }
  return chart;
}
