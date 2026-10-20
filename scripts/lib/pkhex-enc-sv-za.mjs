// Encontros de Scarlet/Violet e Legends: Z-A lidos dos recursos e do código C# do PKHeX.Core (kwsch/PKHeX, GPL-3.0; checkout em
// data-sources/pkhex-src, commit 6042efa). O PokéAPI não tem NENHUM encontro de SV e nada de Z-A. Sem rede; só módulos do Node.
//
// Formatos — derivados SÓ do C# do PKHeX (nada inferido de outra fonte):
//   Legality/Encounters/Data/EncounterUtil.cs        Get(res) = bytes de Resources/legality/wild/Gen9/encounter_<res>.pkl;
//                                                     Get(res, ident) = BinLinkerAccessor (offsets u32); Get16(res, ident) = BinLinkerAccessor16
//   Legality/Assets/BinLinkerAccessor.cs              "XY" + u16 contagem + (contagem + 1) offsets u32
//   Legality/Encounters/Data/Gen9/Encounters9.cs      Slots = EncounterArea9.GetAreas(Get("wild_paldea", "sv"), SV)  ← versão SEMPRE "SV";
//                                                     Encounter_SV / StaticSL / StaticVL (EncounterStatic9), TradeGift_SV (EncounterTrade9),
//                                                     TeraBase/TeraDLC1/TeraDLC2 = gem_paldea/gem_kitakami/gem_blueberry (EncounterTera9),
//                                                     Dist = dist_paldea, Might = might_paldea, Fixed = fixed_paldea, Outbreak = outbreak_paldea
//   Legality/Encounters/Templates/Gen9/EncounterArea9.cs  área = u8 Location, u8 —, u8 CrossFrom, u8 —, depois slots de 8 bytes:
//                                                     u16 espécie, u8 forma, u8 gênero, u8 nív. mín., u8 nív. máx., u8 Time, u8 AreaWeather9.
//                                                     CrossFrom ≠ 0 ⇒ bloco "crossover": espécies de uma área VIZINHA (ActualLocation() = CrossFrom)
//                                                     que podem ser alcançadas na fronteira de Location — EXCLUÍDOS aqui (já aparecem na área de origem).
//   Legality/Encounters/Templates/Gen9/EncounterSlot9.cs  CanSpawnAtTime: bit i de Time LIGADO ⇒ NÃO aparece; GetTime: bit 0 MarkLunchtime,
//                                                     1 MarkSleepyTime, 2 MarkDusk, 3 MarkDawn → aqui 'dia', 'noite', 'entardecer', 'manhã'.
//                                                     Form ≥ EncounterUtil.FormDynamic (30 Vivillon / 31 aleatória) ⇒ forma não fixa.
//   Legality/Encounters/Templates/Gen9/AreaWeather9.cs  bits: 1 Normal, 2 Overcast, 4 Raining, 8 Thunderstorm, 16 Mist, 32 Snowing,
//                                                     64 Snowstorm, 128 Sandstorm (conjuntos do bioma: Standard 15, Sand 135, Snow 99, Inside 3).
//   Legality/Encounters/Templates/Gen9/EncounterFixed9.cs  registros de 0x14: u16 espécie, u8 forma, u8 nível, u8 FlawlessIVCount,
//                                                     u8 GemType, u8 gênero, u8 habilidade, 4×u16 golpes, 4×u8 Location0..3 (0 = sem); Version = SV
//   Legality/Encounters/Templates/Gen9/EncounterTera9.cs   registros de 0x18: u16 espécie, u8 forma, u8 gênero+1, u8 habil., u8 IVs perfeitos,
//                                                     u8 shiny, u8 nível, 4×u16 golpes, u8 GemType @0x10, u8 Index @0x11 (≠ 0 ⇒ distribuição/BCAT),
//                                                     u8 Stars @0x12, u8 RandRate, i16 RandRateMinScarlet @0x14, i16 RandRateMinViolet @0x16
//                                                     (−1 ⇒ indisponível naquela versão: IsAvailableHostScarlet/Violet). Location = Locations.TeraCavern9 (30024).
//   Legality/Encounters/Templates/Gen9/IGemType.cs    GemType: 0 Default, 1 Random, 2..19 = tipo (índice − 2 em text_Types_en), 101 Stellar
//   Legality/Encounters/Templates/Gen9/EncounterStatic9.cs  ctor (GameVersion) SV/SL/VL; EggLocation ≠ 0 ⇒ ovo
//   Legality/Encounters/Templates/Gen9/EncounterTrade9.cs   ctor (nomes, índice, versão, espécie, nível); Location = LinkTrade6NPC (30001)
//   Game/Locations/Locations9.cs                       IsKitakami 132–170, IsBlueberry 172–194, IsPaldeaDLC 196/198 (Area Zero Underdepths)
//   Legality/Encounters/Data/Gen9/Encounters9a.cs      Slots = EncounterArea9a.GetAreas(Get16("za","za"), Standard);
//                                                     Hyperspace = GetAreas(Get16("hyperspace_za","za"), Hyperspace); Gifts (EncounterGift9a),
//                                                     Static (EncounterStatic9a), Trades (EncounterTrade9a). "#region Sankaku" = conteúdo do DLC.
//   Legality/Encounters/Templates/Gen9a/EncounterArea9a.cs  área = u16 Location, u16 reservado, slots de 8 bytes: u16 espécie, u8 forma,
//                                                     u8 gênero, u8 nív. mín., u8 nív. máx., u8 alfa (1 = alfa), u8 Shiny ("no crossovers!")
//   Legality/Encounters/Templates/Gen9a/SlotType9a.cs  0 Standard (Lumiose), 1 Hyperspace (Hyperspace Lumiose, LocationHyperspace = 273)
//   Game/Locations/Locations9a.cs                      273–283 sob o comentário "Mega Dimension DLC"
//   Legality/Encounters/Templates/Gen9a/EncounterGift9a.cs / EncounterStatic9a.cs  ctor (espécie, forma, nível, tamanho); Location obrigatório
//   Legality/Encounters/Templates/Gen9a/EncounterTrade9a.cs  ctor (nomes, índice, espécie, forma, nível); Location = LinkTrade6NPC (30001)
//   Game/GameStrings/GameStrings.cs (LocationSet6)     nome = text/locations/gen9{,a}/text_{sv,za}_{00000,30000,40000,60000}_en.txt
//                                                     (linha = id − banco); texto CRU, sem os sufixos " (1)"/" (-)" do SanitizeMetGen9/9a.
//
// Métodos (chave curta):
//   'wild'         slot de encounter_wild_paldea (só blocos CrossFrom = 0), encounter_za e encounter_hyperspace_za
//                  (Hyperspace ⇒ detail.hyperspace = true, detail.dlc). Horário restrito ⇒ detail.time = horários em que APARECE.
//   'fixed-symbol' EncounterFixed9 (encounter_fixed_paldea): símbolos fixos do mapa; uma entrada por Location0..3 ≠ 0; min = max = nível.
//   'tera-raid'    EncounterTera9 com Index = 0 (base do jogo: gem_paldea / gem_kitakami / gem_blueberry). location = "a crystal cavern"
//                  (TeraCavern9, o "local" que o jogo grava); detail.map/stars/teraType. Versão pela RandRateMin* (−1 ⇒ fora).
//   Clima: NÃO vira detail. Medido: todo slot com AreaWeather9 ≠ None inclui Normal (valores 3 Inside, 15 Standard, 31 Standard|Mist,
//   99 Snow, 111 Standard|Snow, 135 Sand, 143 Sand|Thunderstorm) — é o conjunto do bioma, nenhum slot depende de um clima; os 7 slots
//   com None (0) são aquáticos de Mesagoza (local 8).
//
// Versões:
//   SV  O PKHeX NÃO separa Scarlet × Violet nos slots selvagens nem nos símbolos fixos (EncounterArea9/EncounterFixed9 têm Version = SV e
//       o .pkl é a união: Larvitar e Bagon aparecem nos mesmos slots). Esses saem para as DUAS versões com
//       detail.versionNote = 'versão não separada no PKHeX'. Estáticos: SL/VL (StaticSL/StaticVL) separam; SV ⇒ as duas. Tera: por RandRateMin*.
//   Z-A 'legends-za'.
//
// Tipos fixos: 'starter' (bloco "// Starters" / "// Z-A Starters"), 'egg' (EggLocation ≠ 0), 'trade' (TradeGift_SV / Trades),
//   'gift' (Z-A: lista Gifts; SV: FixedBall = Ball.Poke — exceto a linha cujo comentário diz "Only Poké Ball available", que é captura),
//   'static' (resto).
//
// Agregação (como em pkhex-enc-bdsp-la.mjs): slots iguais (versão, área, método, espécie, forma e restrições) viram uma entrada com min/max;
// faixas distintas ficam em detail.levels.
//
// Exclusões (fora do jogo normal / não pedidas): encounter_dist_paldea (EncounterDist9, raids de distribuição), encounter_might_paldea
// (EncounterMight9, raids 7★ de evento), encounter_outbreak_paldea (EncounterOutbreak9: Name = "Distribution Outbreak Encounter" — surtos
// de distribuição; os surtos comuns do jogo usam as espécies da área), raids Tera com Index ≠ 0 (nenhuma nos gem_*), e os blocos crossover.
import { readFileSync } from 'node:fs';

const VERS = { SV: ['scarlet', 'violet'], SL: ['scarlet'], VL: ['violet'] };
const NOTE_SV = 'versão não separada no PKHeX';
const LOC_LINKTRADE6NPC = 30001, LOC_TERACAVERN9 = 30024, LOC_HYPERSPACE = 273;
const FORM_DYNAMIC = 30; // EncounterUtil.FormDynamic (= FormVivillon 30; FormRandom 31)
const TIME_NAMES = ['dia', 'noite', 'entardecer', 'manhã']; // bits 0..3 = MarkLunchtime, MarkSleepyTime, MarkDusk, MarkDawn
const TERA_MAPS = [['paldea', 'Paldea'], ['kitakami', 'Kitakami'], ['blueberry', 'Blueberry']]; // TeraRaidMapParent
const GENDER = { 0: 'male', 1: 'female' };

/** BinLinkerAccessor (offsets u32). */
function binLinker32(b) {
  const n = b.readUInt16LE(2);
  return Array.from({ length: n }, (_, i) => b.subarray(b.readUInt32LE(4 + 4 * i), b.readUInt32LE(8 + 4 * i)));
}
/** BinLinkerAccessor16 (offsets u16). */
function binLinker16(b) {
  const n = b.readUInt16LE(2);
  return Array.from({ length: n }, (_, i) => b.subarray(b.readUInt16LE(4 + 2 * i), b.readUInt16LE(6 + 2 * i)));
}
function checkIdent(b, ident, file) {
  const id = b.toString('latin1', 0, 2);
  if (id !== ident) throw new Error(`${file}: identificador ${id} ≠ ${ident}`);
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
    if (!s) throw new Error(`local ${id} sem nome em text_${ident}`);
    return s;
  };
}

/** Agrega por chave, juntando faixas de nível. */
function aggregate(rows, keyOf, build) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    let g = map.get(k);
    if (!g) map.set(k, (g = { first: r, ranges: [] }));
    if (!g.ranges.some(([a, b]) => a === r.min && b === r.max)) g.ranges.push([r.min, r.max]);
  }
  return [...map.values()].map((g) => {
    g.ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const min = Math.min(...g.ranges.map((x) => x[0])), max = Math.max(...g.ranges.map((x) => x[1]));
    return build(g.first, min, max, g.ranges.length > 1 ? g.ranges : null);
  });
}

/** Remove duplicatas exatas (mesmo JSON). */
function dedupe(list) {
  const seen = new Set();
  return list.filter((e) => { const k = JSON.stringify(e); if (seen.has(k)) return false; seen.add(k); return true; });
}

// ───────────────────────── C#: listas estáticas ─────────────────────────

/** Fecha parênteses balanceados a partir de s[i] === '('. */
function balanced(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '(') d++;
    else if (s[j] === ')' && --d === 0) return j;
  }
  return -1;
}

/**
 * Extrai as linhas `new(...) { ... }` de `NAME = [ ... ];` com #region e o comentário de seção corrente (zerado por linha vazia).
 * Confere: nº lido = nº de linhas que começam com `new(` = nº de `new(` que não são `= new(` (IVs/Moves).
 */
function csList(src, name, file) {
  const m = new RegExp(`\\b${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\s*\\];`).exec(src);
  if (!m) throw new Error(`${file}: lista ${name} não encontrada`);
  const body = m[1].split(/\r?\n/);
  const expected = body.filter((l) => /^\s*new\(/.test(l)).length;
  const topLevelNew = (m[1].match(/\bnew\(/g) ?? []).length - (m[1].match(/=\s*new\(/g) ?? []).length;
  const out = [], skipped = [];
  let section = null, region = null;
  for (const line of body) {
    const t = line.trim();
    if (!t) { section = null; continue; }
    if (/^#region\b/.test(t)) { region = t.replace(/^#region\s*/, ''); section = null; continue; }
    if (/^#endregion\b/.test(t)) { region = null; section = null; continue; }
    if (/^\/\//.test(t)) { section = t.replace(/^\/\/\s*/, ''); continue; }
    if (!/^new\(/.test(t)) { skipped.push(t); continue; }
    const close = balanced(t, 3);
    if (close < 0) { skipped.push(t); continue; }
    const ctor = t.slice(4, close).split(',').map((s) => s.trim());
    const rest = t.slice(close + 1);
    const cm = /\}\s*,?\s*\/\/\s*(.*)$/.exec(rest);
    const ob = rest.indexOf('{'), cb = rest.lastIndexOf('}');
    const fields = {};
    if (ob >= 0 && cb > ob) {
      const flat = rest.slice(ob + 1, cb).replace(/new\(([^)]*)\)/g, (_, a) => `[${a.replace(/,/g, ';')}]`);
      for (const f of flat.split(',')) {
        const kv = /^\s*(\w+)\s*=\s*(.+?)\s*$/.exec(f);
        if (kv) fields[kv[1]] = kv[2];
      }
    }
    out.push({ ctor, fields, section, region, comment: cm ? cm[1].trim() : null });
  }
  if (out.length !== expected || expected !== topLevelNew) throw new Error(`${file}: ${name} lidos ${out.length}, linhas new( ${expected}, new( de topo ${topLevelNew}`);
  return { rows: out, expected, skipped };
}

const num = (v) => {
  if (v == null) return undefined;
  if (!/^\d+$/.test(v)) throw new Error(`valor numérico inesperado: ${v}`);
  return parseInt(v, 10);
};
const bool = (v) => v === 'true';

// ───────────────────────── Scarlet / Violet ─────────────────────────

/** DLC pelo Locations9.cs (faixas de id). */
function dlcSV(loc) {
  if (loc >= 132 && loc <= 170) return 'Kitakami';           // Locations9.IsKitakami
  if (loc >= 172 && loc <= 194) return 'Blueberry Academy';  // Locations9.IsBlueberry
  if (loc === 196 || loc === 198) return 'Area Zero Underdepths'; // Locations9.IsPaldeaDLC
  if (loc > 131 && loc < 30000) return 'DLC (fora das faixas de Locations9.cs)'; // > IsAccessiblePreDLC (≤ 131)
  return null;
}

function readSv(rootUrl) {
  const core = new URL('PKHeX.Core/', rootUrl), res = new URL('Resources/', core);
  const loc = locationNamer(res, 'sv', 'gen9');
  const types = lines(new URL('text/other/en/text_Types_en.txt', res));
  const gem = (g) => (g === 101 ? 'Stellar' : g >= 2 && g <= 19 ? types[g - 2] : null);
  const wildDir = (f) => new URL(`legality/wild/Gen9/encounter_${f}.pkl`, res);
  const report = { excludedFiles: {} };

  // selvagens
  const b = readFileSync(wildDir('wild_paldea'));
  checkIdent(b, 'sv', 'encounter_wild_paldea.pkl');
  const raw = [];
  let areas = 0, crossAreas = 0, crossSlots = 0, mainSlots = 0;
  for (const a of binLinker32(b)) {
    if ((a.length - 4) % 8) throw new Error(`área ${a[0]}: tamanho ${a.length}`);
    const location = a[0], cross = a[2], n = (a.length - 4) / 8;
    if (cross !== 0) { crossAreas++; crossSlots += n; continue; }
    areas++; mainSlots += n;
    const slots = [];
    for (let o = 4; o < a.length; o += 8) slots.push({ species: a.readUInt16LE(o), form: a[o + 2], gender: a[o + 3], min: a[o + 4], max: a[o + 5], time: a[o + 6], weather: a[o + 7] });
    for (const s of slots) {
      if (s.time & 0xf0) throw new Error(`Time com bits altos: ${s.time}`);
      const time = s.time ? TIME_NAMES.filter((_, i) => !(s.time & (1 << i))) : null;
      raw.push({ ...s, locId: location, timeK: time?.join('/') ?? '', timeL: time });
    }
  }
  report.wild = { areas, slots: mainSlots, crossoverAreasExcluded: crossAreas, crossoverSlotsExcluded: crossSlots };
  const wildOne = aggregate(raw, (r) => `${r.locId}|${r.species}|${r.form}|${r.gender}|${r.timeK}`, (r, min, max, levels) => {
    const detail = { locationId: r.locId, versionNote: NOTE_SV };
    if (r.timeL) detail.time = r.timeL;
    if (GENDER[r.gender]) detail.gender = GENDER[r.gender];
    if (r.form >= FORM_DYNAMIC) detail.formRandom = true;
    const dlc = dlcSV(r.locId);
    if (dlc) detail.dlc = dlc;
    if (levels) detail.levels = levels;
    return { location: loc(r.locId), method: 'wild', species: r.species, form: r.form >= FORM_DYNAMIC ? 0 : r.form, min, max, detail };
  });
  const wild = [];
  for (const version of VERS.SV) for (const e of wildOne) wild.push({ version, ...e });

  // símbolos fixos
  const f = readFileSync(wildDir('fixed_paldea'));
  if (f.length % 0x14) throw new Error('encounter_fixed_paldea.pkl: tamanho');
  const fixedSym = [];
  for (let o = 0; o < f.length; o += 0x14) {
    const species = f.readUInt16LE(o), form = f[o + 2], level = f[o + 3], ivs = f[o + 4], tera = f[o + 5], gender = f[o + 6];
    for (const locId of [f[o + 16], f[o + 17], f[o + 18], f[o + 19]].filter((x) => x)) {
      const detail = { locationId: locId, versionNote: NOTE_SV };
      if (gem(tera)) detail.teraType = gem(tera);
      if (ivs) detail.flawlessIVs = ivs;
      if (GENDER[gender]) detail.gender = GENDER[gender];
      const dlc = dlcSV(locId);
      if (dlc) detail.dlc = dlc;
      for (const version of VERS.SV) fixedSym.push({ version, location: loc(locId), method: 'fixed-symbol', species, form, min: level, max: level, detail });
    }
  }
  report.fixedSymbol = { records: f.length / 0x14 };

  // raids Tera (base do jogo)
  const tera = [];
  report.tera = {};
  for (const [file, map] of TERA_MAPS) {
    const d = readFileSync(wildDir(`gem_${file}`));
    if (d.length % 0x18) throw new Error(`encounter_gem_${file}.pkl: tamanho`);
    let base = 0, dist = 0;
    for (let o = 0; o < d.length; o += 0x18) {
      if (d[o + 0x11] !== 0) { dist++; continue; }
      base++;
      const species = d.readUInt16LE(o), form = d[o + 2], level = d[o + 7], stars = d[o + 0x12];
      const rs = d.readInt16LE(o + 0x14), rv = d.readInt16LE(o + 0x16);
      const detail = { locationId: LOC_TERACAVERN9, map, stars };
      if (gem(d[o + 0x10])) detail.teraType = gem(d[o + 0x10]);
      if (d[o + 5]) detail.flawlessIVs = d[o + 5];
      if (map !== 'Paldea') detail.dlc = map === 'Kitakami' ? 'Kitakami' : 'Blueberry Academy';
      const e = { location: loc(LOC_TERACAVERN9), method: 'tera-raid', species, form: form >= FORM_DYNAMIC ? 0 : form, min: level, max: level, detail };
      if (form >= FORM_DYNAMIC) detail.formRandom = true;
      if (rs !== -1) tera.push({ version: 'scarlet', ...e });
      if (rv !== -1) tera.push({ version: 'violet', ...e });
    }
    report.tera[file] = { base, distributionExcluded: dist };
  }
  for (const file of ['dist_paldea', 'might_paldea', 'outbreak_paldea']) report.excludedFiles[file] = readFileSync(wildDir(file)).length;

  // estáticos / presentes / ovos / trocas (C#)
  const src = readFileSync(new URL('Legality/Encounters/Data/Gen9/Encounters9.cs', core), 'utf8');
  const fixed = [];
  report.cs = {};
  for (const list of ['Encounter_SV', 'StaticSL', 'StaticVL']) {
    const { rows, expected, skipped } = csList(src, list, 'Encounters9.cs');
    report.cs[list] = { expected, parsed: rows.length, skipped };
    for (const r of rows) {
      const ver = VERS[r.ctor[0]];
      if (!ver) throw new Error(`versão ${r.ctor[0]}`);
      const fl = r.fields;
      const species = num(fl.Species), level = num(fl.Level), location = num(fl.Location), form = num(fl.Form) ?? 0;
      const eggLoc = num(fl.EggLocation) ?? 0;
      let type = eggLoc ? 'egg'
        : r.section === 'Starters' ? 'starter'
        : fl.FixedBall === 'Ball.Poke' && !/Only Poké Ball available/.test(r.comment ?? '') ? 'gift' : 'static';
      const detail = { locationId: type === 'egg' ? eggLoc : location };
      if (r.region) detail.section = r.region; else if (r.section) detail.section = r.section;
      if (bool(fl.IsTitan)) detail.titan = true;
      if (fl.TeraType) detail.teraType = fl.TeraType.replace(/^GemType\./, '');
      if (fl.Shiny === 'Always') detail.shiny = true;
      if (fl.FixedBall) detail.ball = fl.FixedBall.replace(/^Ball\./, '');
      const dlc = dlcSV(location) ?? (/^Sudachi (\d)/.exec(r.region ?? '') ? `DLC (bloco "${r.region}" do Encounters9.cs)` : null);
      if (dlc) detail.dlc = dlc;
      if (r.comment) detail.note = r.comment;
      for (const version of ver) fixed.push({ version, location: loc(type === 'egg' ? eggLoc : location), type, species, form, level, detail });
    }
  }
  const tradeTxt = lines(new URL('legality/gen9/text_tradesv_en.txt', res));
  const { rows: trades, expected: texp, skipped: tsk } = csList(src, 'TradeGift_SV', 'Encounters9.cs');
  report.cs.TradeGift_SV = { expected: texp, parsed: trades.length, skipped: tsk };
  const half = tradeTxt.filter((s, i, a) => i < a.length - 1 || s).length >> 1;
  for (const r of trades) {
    const idx = num(r.ctor[1]), species = num(r.ctor[3]), level = num(r.ctor[4]);
    const ver = VERS[r.ctor[2]];
    if (!ver) throw new Error(`versão ${r.ctor[2]}`);
    const detail = { locationId: LOC_LINKTRADE6NPC, ot: tradeTxt[idx + half] || null, note: 'PKHeX grava LinkTrade6NPC; o lugar da troca não está nos dados' };
    if (idx < 2 || idx > 31) detail.nickname = tradeTxt[idx] || null; // EncounterTrade9: índices 2..31 são "partner" (sem apelido)
    if (r.fields.TeraType) detail.teraType = r.fields.TeraType.replace(/^GemType\./, '');
    if (r.comment) detail.note2 = r.comment;
    for (const version of ver) fixed.push({ version, location: loc(LOC_LINKTRADE6NPC), type: 'trade', species, form: num(r.fields.Form) ?? 0, level, detail });
  }

  return { wild: dedupe([...wild, ...fixedSym, ...tera]), fixed: dedupe(fixed), report };
}

// ───────────────────────── Legends: Z-A ─────────────────────────

const DLC_ZA = 'Mega Dimension'; // Locations9a.cs: "// Mega Dimension DLC" sobre 273–283; Encounters9a.cs "#region Sankaku"

function readZa(rootUrl) {
  const core = new URL('PKHeX.Core/', rootUrl), res = new URL('Resources/', core);
  const loc = locationNamer(res, 'za', 'gen9a');
  const report = {};
  const raw = [];
  for (const [file, hyper] of [['za', false], ['hyperspace_za', true]]) {
    const b = readFileSync(new URL(`legality/wild/Gen9/encounter_${file}.pkl`, res));
    checkIdent(b, 'za', `encounter_${file}.pkl`);
    let areas = 0, slots = 0;
    for (const a of binLinker16(b)) {
      if ((a.length - 4) % 8) throw new Error(`área Z-A: tamanho ${a.length}`);
      areas++;
      const location = a.readUInt16LE(0);
      for (let o = 4; o < a.length; o += 8) {
        slots++;
        raw.push({ locId: location, hyper, species: a.readUInt16LE(o), form: a[o + 2], gender: a[o + 3], min: a[o + 4], max: a[o + 5], alpha: a[o + 6] === 1, shiny: a[o + 7] });
      }
    }
    report[file] = { areas, slots };
  }
  const wild = aggregate(raw, (r) => `${r.locId}|${r.hyper}|${r.species}|${r.form}|${r.gender}|${r.alpha}|${r.shiny}`, (r, min, max, levels) => {
    const detail = { locationId: r.locId };
    if (r.alpha) detail.alpha = true;
    if (r.shiny === 1) detail.shiny = 'never';  // Shiny.Never
    if (r.shiny === 2) detail.shiny = 'always'; // Shiny.Always
    if (GENDER[r.gender]) detail.gender = GENDER[r.gender];
    if (r.form >= FORM_DYNAMIC) detail.formRandom = true;
    if (r.hyper || r.locId === LOC_HYPERSPACE) { detail.hyperspace = true; detail.dlc = DLC_ZA; }
    if (levels) detail.levels = levels;
    return { version: 'legends-za', location: loc(r.locId), method: 'wild', species: r.species, form: r.form >= FORM_DYNAMIC ? 0 : r.form, min, max, detail };
  });

  const src = readFileSync(new URL('Legality/Encounters/Data/Gen9/Encounters9a.cs', core), 'utf8');
  const fixed = [];
  report.cs = {};
  for (const list of ['Gifts', 'Static']) {
    const { rows, expected, skipped } = csList(src, list, 'Encounters9a.cs');
    report.cs[list] = { expected, parsed: rows.length, skipped };
    for (const r of rows) {
      const [species, form, level] = r.ctor.map(num);
      const fl = r.fields, location = num(fl.Location);
      const type = list === 'Static' ? 'static' : r.section === 'Z-A Starters' ? 'starter' : 'gift';
      const detail = { locationId: location };
      if (r.region) detail.section = r.region; else if (r.section) detail.section = r.section;
      if (bool(fl.IsAlpha)) detail.alpha = true;
      if (fl.Shiny === 'Random') detail.shiny = 'random';
      if (r.region === 'Sankaku' || location >= 273 && location < 30000) detail.dlc = DLC_ZA;
      if (r.comment) detail.note = r.comment;
      fixed.push({ version: 'legends-za', location: loc(location), type, species, form, level, detail });
    }
  }
  const tradeTxt = lines(new URL('legality/gen9a/text_tradeza_en.txt', res)).filter((s, i, a) => i < a.length - 1 || s);
  const half = tradeTxt.length >> 1;
  const { rows: trades, expected: texp, skipped: tsk } = csList(src, 'Trades', 'Encounters9a.cs');
  report.cs.Trades = { expected: texp, parsed: trades.length, skipped: tsk };
  for (const r of trades) {
    const idx = num(r.ctor[1]), species = num(r.ctor[2]), form = num(r.ctor[3]), level = num(r.ctor[4]);
    const detail = { locationId: LOC_LINKTRADE6NPC, nickname: tradeTxt[idx] || null, ot: tradeTxt[idx + half] || null, note: 'PKHeX grava LinkTrade6NPC; o lugar da troca não está nos dados' };
    if (r.comment) detail.note2 = r.comment;
    fixed.push({ version: 'legends-za', location: loc(LOC_LINKTRADE6NPC), type: 'trade', species, form, level, detail });
  }
  return { wild: dedupe(wild), fixed: dedupe(fixed), report };
}

/**
 * @param {URL} rootUrl  raiz do checkout do PKHeX (contém PKHeX.Core/)
 * @param {'scarlet-violet'|'legends-za'} gameId
 * @returns {{ wild: object[], fixed: object[], report: object }}
 */
export function readEncounters(rootUrl, gameId) {
  if (gameId === 'scarlet-violet') return readSv(rootUrl);
  if (gameId === 'legends-za') return readZa(rootUrl);
  throw new Error(`sem encontros PKHeX para ${gameId}`);
}
