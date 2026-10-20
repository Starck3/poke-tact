// Encontros de Brilliant Diamond/Shining Pearl e Legends: Arceus lidos dos recursos e do código C# do PKHeX.Core
// (kwsch/PKHeX, GPL-3.0; checkout em data-sources/pkhex-src). O PokéAPI não tem NENHUM encontro destes dois jogos. Sem rede.
//
// Formatos — derivados SÓ do C# do PKHeX (nada inferido de outra fonte):
//   Legality/Encounters/Data/EncounterUtil.cs        Get(res, ident) = BinLinkerAccessor sobre Resources/legality/wild/Gen8/encounter_<res>.pkl
//   Util/BinLinkerAccessor.cs                         "XY" + u16 contagem + (contagem + 1) offsets **u32** (o pkhex.mjs usa o de 16 bits)
//   Legality/Encounters/Data/Gen8/Encounters8b.cs     SlotsBD/SP = encounter_bd/_sp ("bs") + encounter_bd/_sp_underground ("bs");
//                                                     Encounter_BDSP / StaticBD / StaticSP (EncounterStatic8b) e TradeGift_BDSP (EncounterTrade8b)
//   Legality/Encounters/Templates/Gen8b/EncounterArea8b.cs  área = u16 Location, u8 SlotType8b, u8 (sem uso), depois slots de 4 bytes:
//                                                     u16 espécie (bits 0–9 = espécie, >>11 = forma), u8 nível mín., u8 nível máx.
//                                                     SlotType8b: 1 Grass, 2 Surf, 3 Old_Rod, 4 Good_Rod, 5 Super_Rod, 6 Rock_Smash, 8 HoneyTree
//                                                     (0 Any e 7 Headbutt "unused; relic"). Munchlax só nas 4 árvores do IsMunchlaxTree (HoneyTreeUtil).
//   Legality/Encounters/Templates/Gen8b/EncounterStatic8b.cs  EggLocation ≠ Default8bNone (65535) ⇒ ovo; IsRoaming ⇒ RoamingLocations
//   Legality/Encounters/Templates/Gen8b/EncounterTrade8b.cs   Location = Locations.LinkTrade6NPC (30001) — o PKHeX NÃO grava a cidade da troca;
//                                                     apelido/OT de legality/gen8/text_tradebdsp_<lang>.txt (OT = índice + metade da lista)
//   Legality/Encounters/Data/Gen8/Encounters8a.cs     SlotsLA = encounter_la.pkl ("la"); StaticLA (EncounterStatic8a)
//   Legality/Encounters/Templates/Gen8a/EncounterArea8a.cs  área = u8 n, n × u8 Location (a 1ª é a "Location" da área; IsMatchLocation aceita
//                                                     todas), alinhado a par; u8 SlotType8a, u8 contagem; slots de 8 bytes: u16 espécie, u8 forma,
//                                                     u8 AlphaType, u8 nív. mín., u8 nív. máx., u8 Gender, u8 FlawlessIVCount
//                                                     SlotType8a: 0 Standard, 1 Distortion, 2 Landmark, 3 MassOutbreakRegular, 4 MassOutbreakMassive
//   Legality/Encounters/Templates/Gen8a/EncounterSlot8a.cs  AlphaType: 0 Never, 1 Random, 2 Guaranteed
//   Legality/Encounters/Templates/Gen8a/EncounterStatic8a.cs  ctor (espécie, forma, nível, altura, peso); Method Fixed | WildGroup
//   Game/GameStrings/GameStrings.cs + LocationSet/LocationSet6.cs  nome = text/locations/gen8{b,a}/text_{bdsp,la}_{00000,30000,40000,60000}_en.txt
//                                                     (linha = id − banco); usamos o texto CRU (sem os sufixos " (-)"/" (2)" do Sanitize, que são do PKHeX)
//
// Métodos (chave curta ← tipo do PKHeX):
//   BDSP  Grass→'grass', Surf→'surf', Old_Rod→'old-rod', Good_Rod→'good-rod', Super_Rod→'super-rod', Rock_Smash→'rock-smash',
//         HoneyTree→'honey-tree'; áreas de encounter_*_underground → 'underground'. O PKHeX NÃO separa manhã/dia/noite, Poké Radar,
//         enxame (swarm), Great Marsh/Trophy Garden diários nem slots de GBA: tudo isso está fundido na lista Grass da área (deduplicada
//         por espécie+nível). Portanto não há 'poke-radar'/'swarm'/hora do dia aqui — seria inventar.
//   LA    Standard→'wild' (ou 'alpha' quando AlphaType ≠ 0), Distortion→'space-time-distortion', Landmark→'landmark',
//         MassOutbreakRegular→'mass-outbreak', MassOutbreakMassive→'massive-mass-outbreak'; fora de Standard o alfa vai em detail.alpha.
//         O PKHeX não grava clima/hora do LA.
//
// Agregação: slots iguais (versão, área, método, espécie, forma [, alfa, gênero]) viram uma entrada com min/max do conjunto; quando
// havia faixas distintas, detail.levels = [[mín, máx], …] (ex.: Grand Underground tem uma faixa por estágio de progresso — o PKHeX não diz qual).
//
// Exclusões (não obtêveis em jogo normal, pelo que o PKHeX codifica): estáticos com FatefulEncounter = true (BDSP: Mew, Jirachi, Darkrai,
// Shaymin, Arceus; LA: Arceus, Phione, Manaphy, Darkrai, Shaymin) — saem em `excluded` (opts.includeFateful = true os mantém).
// Mystery Gift/eventos (mgdb/wc*), GO/HOME e Encounters8bGO etc. não são lidos. Ovos de criação (EncounterEgg8b) não são lista fixa.
import { readFileSync } from 'node:fs';

const VERS = { BD: ['brilliant-diamond'], SP: ['shining-pearl'], BDSP: ['brilliant-diamond', 'shining-pearl'] };
const BDSP_TYPE = { 1: 'grass', 2: 'surf', 3: 'old-rod', 4: 'good-rod', 5: 'super-rod', 6: 'rock-smash', 8: 'honey-tree' };
const LA_TYPE = { 0: 'wild', 1: 'space-time-distortion', 2: 'landmark', 3: 'mass-outbreak', 4: 'massive-mass-outbreak' };
const LA_ALPHA = { 1: 'random', 2: 'guaranteed' };
const LA_GENDER = { 0: 'male', 1: 'female' }; // Gender enum: 2 = Genderless/Random (sem restrição)
// conhecimento do projeto (não do PKHeX): quais presentes são os iniciais
const STARTERS = new Set([387, 390, 393, 722, 155, 501]);
const LOC_DEFAULT8B_NONE = 65535, LOC_LINKTRADE6NPC = 30001;

/** BinLinkerAccessor (offsets u32). */
function binLinker32(b) {
  const n = b.readUInt16LE(2);
  return Array.from({ length: n }, (_, i) => b.subarray(b.readUInt32LE(4 + 4 * i), b.readUInt32LE(8 + 4 * i)));
}

function lines(url) {
  return readFileSync(url, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
}

/** LocationSet6.GetLocationName com o texto cru. */
function locationNamer(res, ident, dir) {
  const bank = Object.fromEntries([0, 30000, 40000, 60000].map((k) => [k, lines(new URL(`text/locations/${dir}/text_${ident}_${String(k).padStart(5, '0')}_en.txt`, res))]));
  return (id) => {
    const k = id >= 60000 ? 60000 : id >= 40000 ? 40000 : id >= 30000 ? 30000 : 0;
    const s = bank[k][id - k];
    return s ? s : null;
  };
}

/** Agrega slots por chave, juntando faixas de nível. */
function aggregate(rows, keyOf, build) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    let g = map.get(k);
    if (!g) map.set(k, (g = { first: r, ranges: [], extra: new Set() }));
    if (!g.ranges.some(([a, b]) => a === r.min && b === r.max)) g.ranges.push([r.min, r.max]);
    for (const x of r.extra ?? []) g.extra.add(x);
  }
  return [...map.values()].map((g) => {
    g.ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const min = Math.min(...g.ranges.map((x) => x[0])), max = Math.max(...g.ranges.map((x) => x[1]));
    return build(g.first, min, max, g.ranges.length > 1 ? g.ranges : null, [...g.extra]);
  });
}

// ───────────────────────── C#: listas estáticas ─────────────────────────

/** Extrai as linhas `new(...)` de uma lista `NAME = [ ... ];`, com a seção (comentário de linha) corrente. */
function csList(src, name, file) {
  const m = new RegExp(`\\b${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\s*\\];`).exec(src);
  if (!m) throw new Error(`${file}: lista ${name} não encontrada`);
  const out = [], skipped = [];
  let section = null;
  const body = m[1].split(/\r?\n/);
  const expected = body.filter((l) => /^\s*new\(/.test(l)).length;
  for (const line of body) {
    const t = line.trim();
    if (/^\/\//.test(t)) { section = t.replace(/^\/\/\s*/, ''); continue; }
    if (!/^new\(/.test(t)) { if (t) skipped.push(t); continue; }
    const cm = /\/\/\s*(.*)$/.exec(t);
    const code = t.replace(/\/\/.*$/, '');
    const ctor = /^new\(([^)]*)\)/.exec(code);
    const init = /\{([\s\S]*)\}/.exec(code);
    const fields = {};
    if (init) {
      const flat = init[1].replace(/new\(([^)]*)\)/g, (_, a) => `[${a.replace(/,/g, ';')}]`);
      for (const f of flat.split(',')) {
        const kv = /^\s*(\w+)\s*=\s*(.+?)\s*$/.exec(f);
        if (kv) fields[kv[1]] = kv[2];
      }
    }
    out.push({ ctor: ctor ? ctor[1].split(',').map((s) => s.trim()) : [], fields, section, comment: cm ? cm[1].trim() : null, raw: t });
  }
  if (out.length !== expected) throw new Error(`${file}: ${name} lidos ${out.length} ≠ ${expected} new(`);
  return { rows: out, expected, skipped };
}

const num = (v) => {
  if (v == null) return undefined;
  if (v === 'Locations.Default8bNone') return LOC_DEFAULT8B_NONE;
  if (!/^\d+$/.test(v)) throw new Error(`valor numérico inesperado: ${v}`);
  return parseInt(v, 10);
};
const bool = (v) => v === 'true';

// ───────────────────────── BDSP ─────────────────────────

function readBdsp(rootUrl, opts) {
  const core = new URL('PKHeX.Core/', rootUrl), res = new URL('Resources/', core);
  const loc = locationNamer(res, 'bdsp', 'gen8b');
  const rawWild = [];
  for (const [file, verKey, ug] of [['bd', 'BD', false], ['sp', 'SP', false], ['bd_underground', 'BD', true], ['sp_underground', 'SP', true]]) {
    const b = readFileSync(new URL(`legality/wild/Gen8/encounter_${file}.pkl`, res));
    if (b.toString('latin1', 0, 2) !== 'bs') throw new Error(`encounter_${file}.pkl: identificador ${b.toString('latin1', 0, 2)} ≠ bs`);
    for (const a of binLinker32(b)) {
      const location = a.readUInt16LE(0), type = a[2];
      const method = ug ? 'underground' : BDSP_TYPE[type];
      if (!method) throw new Error(`SlotType8b desconhecido ${type}`);
      if ((a.length - 4) % 4) throw new Error(`área ${location}: tamanho ${a.length}`);
      for (let o = 4; o < a.length; o += 4) {
        const v = a.readUInt16LE(o);
        rawWild.push({ version: VERS[verKey][0], locId: location, method, species: v & 0x3ff, form: v >> 11, min: a[o + 2], max: a[o + 3] });
      }
    }
  }
  const wild = aggregate(rawWild, (r) => `${r.version}|${r.locId}|${r.method}|${r.species}|${r.form}`, (r, min, max, levels) => {
    const detail = { locationId: r.locId };
    if (levels) detail.levels = levels;
    if (r.method === 'honey-tree' && r.species === 446) detail.munchlaxTree = true; // EncounterArea8b.IsMunchlaxTree
    return { version: r.version, location: loc(r.locId), method: r.method, species: r.species, form: r.form, min, max, detail };
  });

  const src = readFileSync(new URL('Legality/Encounters/Data/Gen8/Encounters8b.cs', core), 'utf8');
  const fixed = [], excluded = [], report = {};
  for (const list of ['Encounter_BDSP', 'StaticBD', 'StaticSP']) {
    const { rows, expected, skipped } = csList(src, list, 'Encounters8b.cs');
    report[list] = { expected, parsed: rows.length, skipped };
    for (const r of rows) {
      const ver = VERS[r.ctor[0]];
      if (!ver) throw new Error(`versão ${r.ctor[0]}`);
      const f = r.fields;
      const species = num(f.Species), level = num(f.Level), location = num(f.Location);
      const eggLoc = f.EggLocation ? num(f.EggLocation) : LOC_DEFAULT8B_NONE;
      const sec = (r.section ?? '').toLowerCase();
      let type = eggLoc !== LOC_DEFAULT8B_NONE ? 'egg' : /gift|fossil/.test(sec) ? 'gift' : 'static';
      if (type === 'gift' && STARTERS.has(species)) type = 'starter';
      const detail = { locationId: location, section: r.section ?? list };
      if (/fossil/.test(sec)) detail.fossil = true;
      if (f.FlawlessIVCount) detail.flawlessIVs = num(f.FlawlessIVCount);
      if (f.Ability) detail.ability = f.Ability;
      if (f.FixedBall) detail.ball = f.FixedBall.replace(/^Ball\./, '');
      let place = loc(location);
      if (type === 'egg') { detail.eggLocationId = eggLoc; place = loc(eggLoc); }
      if (bool(f.IsRoaming)) {
        detail.roaming = [...new Set(ROAMING_8B.map(loc))];
        place = null; // o PKHeX guarda só um lugar de referência; o encontro vagueia por RoamingLocations
      }
      for (const version of ver) {
        const e = { version, location: place, type, species, form: 0, level, detail };
        if (bool(f.FatefulEncounter) && !opts.includeFateful) excluded.push({ ...e, reason: 'FatefulEncounter (evento/item de distribuição)', source: `Encounters8b.cs ${list}: ${r.comment}` });
        else fixed.push(e);
      }
    }
  }
  // trocas
  const tradeTxt = lines(new URL('legality/gen8/text_tradebdsp_en.txt', res)).filter((s, i, a) => i < a.length - 1 || s);
  const half = tradeTxt.length >> 1;
  const { rows: trades, expected: texp, skipped: tsk } = csList(src, 'TradeGift_BDSP', 'Encounters8b.cs');
  report.TradeGift_BDSP = { expected: texp, parsed: trades.length, skipped: tsk };
  for (const r of trades) {
    const idx = num(r.ctor[1]);
    for (const version of VERS[r.ctor[2]]) {
      fixed.push({
        version, location: null, type: 'trade', species: num(r.fields.Species), form: 0, level: num(r.fields.Level),
        detail: { locationId: LOC_LINKTRADE6NPC, nickname: tradeTxt[idx], ot: tradeTxt[idx + half], note: 'PKHeX grava LinkTrade6NPC; a cidade da troca não está nos dados' },
      });
    }
  }
  return { wild, fixed, excluded, report, rawSlots: rawWild.length };
}

// EncounterStatic8b.RoamingLocations ("defined by mvpoke in encounter data")
const ROAMING_8B = [197, 201, 354, 355, 356, 357, 358, 359, 361, 362, 364, 365, 367, 373, 375, 377, 378, 379, 383, 385, 392, 394, 395, 397, 400, 403, 404, 407, 485];

// ───────────────────────── Legends: Arceus ─────────────────────────

function readLa(rootUrl, opts) {
  const core = new URL('PKHeX.Core/', rootUrl), res = new URL('Resources/', core);
  const loc = locationNamer(res, 'la', 'gen8a');
  const b = readFileSync(new URL('legality/wild/Gen8/encounter_la.pkl', res));
  if (b.toString('latin1', 0, 2) !== 'la') throw new Error('encounter_la.pkl: identificador');
  const rawWild = [];
  for (const a of binLinker32(b)) {
    const n = a[0];
    const locs = [...a.subarray(1, 1 + n)];
    let align = n + 1;
    align += align & 1;
    const d = a.subarray(align);
    const type = d[0], count = d[1];
    if (!(type in LA_TYPE)) throw new Error(`SlotType8a desconhecido ${type}`);
    if (d.length < 2 + 8 * count) throw new Error('área LA truncada');
    for (let i = 0; i < count; i++) {
      const e = d.subarray(2 + 8 * i, 10 + 8 * i);
      const alpha = e[3];
      const method = type === 0 && alpha ? 'alpha' : LA_TYPE[type];
      rawWild.push({ locId: locs[0], method, species: e.readUInt16LE(0), form: e[2], alpha, gender: e[6], min: e[4], max: e[5], extra: locs.slice(1) });
    }
  }
  const wild = aggregate(rawWild, (r) => `${r.locId}|${r.method}|${r.species}|${r.form}|${r.alpha}|${r.gender}`, (r, min, max, levels, extra) => {
    const detail = { locationId: r.locId };
    if (extra.length) detail.areas = extra.sort((x, y) => x - y).map(loc);
    if (r.alpha) detail.alpha = LA_ALPHA[r.alpha];
    if (LA_GENDER[r.gender]) detail.gender = LA_GENDER[r.gender];
    if (levels) detail.levels = levels;
    return { version: 'legends-arceus', location: loc(r.locId), method: r.method, species: r.species, form: r.form, min, max, detail };
  });

  const src = readFileSync(new URL('Legality/Encounters/Data/Gen8/Encounters8a.cs', core), 'utf8');
  const { rows, expected, skipped } = csList(src, 'StaticLA', 'Encounters8a.cs');
  const fixed = [], excluded = [];
  for (const r of rows) {
    const [sp, fm, lv] = r.ctor.slice(0, 3).map(num); // (altura/peso M/A/U ignorados)
    const f = r.fields, location = num(f.Location), sec = (r.section ?? '').toLowerCase();
    let type = /^gifts/.test(sec) ? 'gift' : 'static';
    if (type === 'gift' && STARTERS.has(sp)) type = 'starter';
    const detail = { locationId: location, section: r.section };
    if (f.Method) detail.method = f.Method;
    if (bool(f.IsAlpha)) detail.alpha = true;
    if (f.Shiny === 'Always') detail.shiny = true;
    if (f.Gender) detail.gender = LA_GENDER[num(f.Gender)];
    if (f.FlawlessIVCount) detail.flawlessIVs = num(f.FlawlessIVCount);
    if (f.FixedBall) detail.ball = f.FixedBall.replace(/^Ball\./, '');
    if (f.LevelMax) detail.levelMax = num(f.LevelMax);
    if (r.comment) detail.note = r.comment;
    const e = { version: 'legends-arceus', location: loc(location), type, species: sp, form: fm, level: lv, detail };
    if (bool(f.FatefulEncounter) && !opts.includeFateful) excluded.push({ ...e, reason: 'FatefulEncounter', source: `Encounters8a.cs StaticLA: ${r.comment}` });
    else fixed.push(e);
  }
  return { wild, fixed, excluded, report: { StaticLA: { expected, parsed: rows.length, skipped } }, rawSlots: rawWild.length };
}

/**
 * @param {URL} rootUrl  raiz do checkout do PKHeX (contém PKHeX.Core/)
 * @param {'brilliant-diamond-shining-pearl'|'legends-arceus'} gameId
 * @param {{ includeFateful?: boolean }} [opts]
 * @returns {{ wild: object[], fixed: object[], excluded: object[], report: object, rawSlots: number }}
 */
export function readEncounters(rootUrl, gameId, opts = {}) {
  if (gameId === 'brilliant-diamond-shining-pearl') return readBdsp(rootUrl, opts);
  if (gameId === 'legends-arceus') return readLa(rootUrl, opts);
  throw new Error(`sem encontros PKHeX para ${gameId}`);
}
