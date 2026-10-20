// Encontros de Let's Go Pikachu/Eevee e Sword/Shield a partir do PKHeX.Core (kwsch/PKHeX, GPL-3.0; checkout em
// data-sources/pkhex-src). Os formatos abaixo foram tirados SÓ do código C# do PKHeX — nada de wiki. Sem rede.
//
// Let's Go (Legality/Encounters/Data/Gen7/Encounters7GG.cs):
//   Resources/legality/wild/Gen7/encounter_gp.pkl / encounter_ge.pkl — BinLinkerAccessor (Legality/Assets/BinLinkerAccessor.cs:
//     "gg" + u16 contagem + offsets u32). Cada área (Templates/Gen7b/EncounterArea7b.cs): [0]=Location, [2]=ToArea1,
//     [3]=ToArea2, e a partir de [4] slots de 4 bytes (ReadSlot): espécie (u8, só os 151), flags de crossover
//     (EncounterSlot7b.IsCrossoverAllowed: bit0 → ToArea1, bit1 → ToArea2), nível mín., nível máx. Forma sempre 0.
//     O PKHeX NÃO distingue grama/água/raro: tudo vira method 'overworld'. O arquivo guarda só uma faixa min–max por
//     espécie/local (ex.: Route 1 com Charizard/Articuno/Dragonite L3–56) e o PKHeX não registra o motivo; marcamos
//     essas faixas como agregadas (ver AGG_SPAN) sem inventar a causa.
//   Encounter_GG / StaticGP / StaticGE (EncounterStatic7b.cs: Species, Level, Location, Form, FixedBall) e
//   TradeGift_GG / _GP / _GE (EncounterTrade7b.cs: Location fixo = Locations.LinkTrade6NPC; o lugar real só aparece no
//   comentário "@ Cidade" do próprio PKHeX — usamos esse comentário e conferimos o nome no arquivo de locais).
//   NÃO lidos: encounter_go_lgpe.pkl (GO Park / Pokémon GO) e os Mystery Gift (wb7/mgdb).
//
// Sword/Shield (Legality/Encounters/Data/Gen8/Encounters8.cs e Encounters8Nest.cs):
//   Resources/legality/wild/Gen8/encounter_{sw,sh}_{symbol,hidden}.pkl — BinLinkerAccessor ("sw"/"sh"). Cada área
//     (Templates/Gen8/EncounterArea8.cs): [0]=Location, [1]=total de slots; depois grupos com cabeçalho de 6 bytes
//     (u16 AreaWeather8, mín., máx., contagem, SlotType8) seguidos de `contagem` u16 (espécie & 0x3FF, forma = >> 11).
//     AreaWeather8.cs: bits 0–8 = clima; 1<<9 = Shaking_Trees; 1<<10 = Fishing. SlotType8.cs: 0–2 SymbolMain*, 3–4
//     HiddenMain* ("incluem os slots de árvore/pesca"), 5–6 Surfing*, 7–8 Sky*, 9–10 Ground*, 11 Sharpedo, 12 OnlyFishing.
//   Crossover (EncounterArea8.GetAreasCanWanderTo, Crossover8 dos estáticos) é regra de validação do PKHeX, não dado da
//     área: emitimos só o Location nativo de cada tabela/estático. Clima "bleed" já vem nas próprias tabelas do jogo.
//   Heavy Fog só no Wild Area base (EncounterSlot8.IsMatchExact / ConvertToPKM: "not available until post-game") → nível 60.
//   Estáticos: StaticSWSH / StaticSW / StaticSH (EncounterStatic8.cs: Gift => FixedBall != None; Weather padrão Normal).
//   Trocas: TradeSWSH / TradeSW / TradeSH (EncounterTrade8.cs: ctor (nomes, índice, versão, espécie, nível, …) ou
//     (OT, versão, espécie, nível, …); Location = LinkTrade6NPC e o C# não diz onde é a troca → location null).
//   Max Raid: encounter_{sw,sh}_nest.pkl — registros de 10 bytes (EncounterStatic8N.Read: u16 espécie, forma, gênero,
//     habilidade, gigantamax, índice da toca, rank mín., rank máx., IVs perfeitos); nível = LevelCaps[rank]; locais da toca
//     = Encounters8Nest.GetNestLocations; ranks 1–2 não valem nas tocas de GetInaccessibleRank12Nests (IsMatchLevel).
//   Dynamax Adventures (Max Lair, DLC Crown Tundra): encounter_swsh_underground.pkl — 14 bytes (EncounterStatic8U.Read:
//     u16 espécie, forma, nível, 4 golpes u16, habilidade, gigantamax); Location = MaxLair (244); sem separação Sw × Sh.
//   NÃO lidos: encounter_{sw,sh}_dist.pkl (raids de distribuição), Crystal_SWSH (EncounterStatic8NC: "Distributed Crystal
//     Data"), GO/HOME (EncounterArea8g), Mystery Gift.
//
// Nomes de lugar: Resources/text/locations/gen7/text_gg_00000_en.txt (linha = Location) e
//   gen8/text_swsh_00000_en.txt (linha = Location; a linha ímpar seguinte é o rótulo do bloco/sub-lugar: "Wild Area",
//   "Isle of Armor", "Crown Tundra" ou ex. "Circhester Bay" — este último vai entre parênteses).
//   DLC: no arquivo de locais o bloco Isle of Armor vai de 164 (Fields of Honor) a 202 (Armor Station) e o Crown Tundra
//   de 204 (Slippery Slope) a 246 (Crown Tundra Station) — mesma faixa de EncounterArea8.IsWildArea8Armor/Crown.
import { readFileSync } from 'node:fs';

const VERS = {
  GG: ['lets-go-pikachu', 'lets-go-eevee'], GP: ['lets-go-pikachu'], GE: ['lets-go-eevee'],
  SWSH: ['sword', 'shield'], SW: ['sword'], SH: ['shield'],
};

// AreaWeather8.cs
const W = {
  None: 0, Normal: 1, Overcast: 2, Raining: 4, Thunderstorm: 8, Intense_Sun: 16, Snowing: 32, Snowstorm: 64, Sandstorm: 128,
  Heavy_Fog: 256, Shaking_Trees: 512, Fishing: 1024,
};
W.All = 511; W.Stormy = W.Raining | W.Thunderstorm; W.Icy = W.Snowing | W.Snowstorm;
W.All_IoA = W.Normal | W.Overcast | W.Stormy | W.Intense_Sun | W.Sandstorm | W.Heavy_Fog;
W.All_CT = W.Normal | W.Overcast | W.Stormy | W.Intense_Sun | W.Icy | W.Heavy_Fog;
W.No_Sun_Sand = W.Normal | W.Overcast | W.Stormy | W.Icy | W.Heavy_Fog;
W.All_Ballimere = W.Normal | W.Overcast | W.Stormy | W.Intense_Sun | W.Snowing | W.Heavy_Fog;
const WEATHER_NAMES = ['Normal', 'Overcast', 'Raining', 'Thunderstorm', 'Intense Sun', 'Snowing', 'Snowstorm', 'Sandstorm', 'Heavy Fog'];

// EncounterArea8.GetWeather (clima possível de cada local)
const AREA_WEATHER = (() => {
  const m = { 68: W.Intense_Sun, 88: W.Snowing, 90: W.Snowing, 92: W.Snowing, 94: W.Overcast, 106: W.Snowstorm };
  for (let l = 122; l <= 154; l += 2) m[l] = W.All;
  const a = W.Normal | W.Overcast | W.Stormy | W.Intense_Sun | W.Heavy_Fog, c = W.Normal | W.Overcast | W.Intense_Sun | W.Icy | W.Heavy_Fog;
  Object.assign(m, {
    164: a, 166: a, 168: W.All_IoA, 170: a, 174: W.All_IoA, 178: a, 180: W.All_IoA,
    184: W.Normal | W.Overcast | W.Raining | W.Sandstorm | W.Intense_Sun | W.Heavy_Fog, 186: a, 188: a, 190: a, 192: a, 194: a,
    204: c, 208: c, 210: W.All_CT, 212: W.All_CT, 214: c, 216: W.Overcast, 218: c, 222: W.All_CT, 224: W.Overcast,
    226: W.No_Sun_Sand, 228: W.All_CT, 230: W.All_Ballimere, 232: W.Overcast,
  });
  return m;
})();
const areaWeather = (loc) => AREA_WEATHER[loc] ?? W.Normal;
const isWildArea8 = (l) => l >= 122 && l <= 154;
const isWildArea = (l) => isWildArea8(l) || (l >= 164 && l <= 194) || (l >= 204 && l <= 234 && l !== 206);

const LEVEL_CAPS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60]; // EncounterStatic8N.LevelCaps
const SLOT8 = ['SymbolMain', 'SymbolMain2', 'SymbolMain3', 'HiddenMain', 'HiddenMain2', 'Surfing', 'Surfing2', 'Sky', 'Sky2', 'Ground', 'Ground2', 'Sharpedo', 'OnlyFishing'];

// Faixa (máx − mín) a partir da qual uma faixa do Let's Go é marcada como agregada. Critério nosso, não do PKHeX.
const AGG_SPAN = 10;

/** BinLinkerAccessor (offsets u32). */
function binLinker32(b) {
  const n = b.readUInt16LE(2);
  return Array.from({ length: n }, (_, i) => b.subarray(b.readUInt32LE(4 + 4 * i), b.readUInt32LE(8 + 4 * i)));
}

function weatherList(mask) {
  return WEATHER_NAMES.filter((_, i) => mask & (1 << i)).join(', ');
}

function evalWeather(expr) {
  let m = 0;
  for (const t of expr.split('|').map((s) => s.trim())) {
    if (!(t in W)) throw new Error(`AreaWeather8 desconhecido: ${t}`);
    m |= W[t];
  }
  return m;
}

// ---------------------------------------------------------------- parser das listas C#

/** Divide por vírgulas no nível 0 (fora de parênteses/colchetes). */
function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Lê `NomeDaLista = [ ... ];` e devolve as entradas `new(args) { props }, // comentário`.
 * Confere: entradas lidas == linhas que começam com `new(` dentro do bloco. Linhas comentadas vão para `skipped`.
 */
function csList(src, name, file) {
  const m = new RegExp(`\\b${name}\\s*=\\s*\\[`).exec(src);
  if (!m) throw new Error(`${file}: lista ${name} não encontrada`);
  const start = m.index + m[0].length;
  const end = src.indexOf('\n    ];', start);
  if (end < 0) throw new Error(`${file}: fim de ${name} não encontrado`);
  const lines = src.slice(start, end).split(/\r?\n/);
  const entries = [], skipped = [];
  let section = '', prevComment = '';
  const expected = lines.filter((l) => /^\s*new\(/.test(l)).length;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { prevComment = ''; continue; }
    if (/^new\(/.test(l)) {
      const close = l.indexOf(')');
      const args = splitTop(l.slice(4, close));
      const ob = l.indexOf('{', close), cb = l.lastIndexOf('}');
      const props = {};
      if (ob >= 0 && cb > ob) {
        for (const p of splitTop(l.slice(ob + 1, cb))) {
          const eq = p.indexOf('=');
          if (eq > 0) props[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
        }
      }
      const ci = l.indexOf('//', cb >= 0 ? cb : close);
      const comment = ci >= 0 ? l.slice(ci + 2).trim() : '';
      entries.push({ args, props, comment, section, prevComment });
    } else if (/^\/\/.*\bnew\b/.test(l)) {
      skipped.push(`${file} ${name}: comentada no C#: ${l}`);
    } else if (l.startsWith('//') || l.startsWith('#region')) {
      const t = l.replace(/^\/\/\s*|^#region\s*/, '');
      if (l.startsWith('#region') || /^(gifts|DLC gifts|encounters|Strong.*)$/i.test(t)) section = t;
      prevComment = t;
    } else if (!l.startsWith('#endregion')) {
      skipped.push(`${file} ${name}: linha não reconhecida: ${l}`);
    }
  }
  if (entries.length !== expected) throw new Error(`${file} ${name}: lidas ${entries.length} ≠ ${expected} entradas new(`);
  return { entries, skipped };
}

const num = (s) => (s === undefined ? undefined : parseInt(s, 10));

// ---------------------------------------------------------------- nomes de lugar

function locationNames(res, file) {
  return readFileSync(new URL(`text/locations/${file}`, res), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
}

// ---------------------------------------------------------------- Let's Go

function readGG(rootUrl) {
  const core = new URL('PKHeX.Core/', rootUrl);
  const res = new URL('Resources/', core);
  const names = locationNames(res, 'gen7/text_gg_00000_en.txt');
  const locName = (l) => {
    const n = names[l];
    if (!n) throw new Error(`Let's Go: local ${l} sem nome`);
    return n;
  };
  const wild = [], fixed = [], skipped = [];

  for (const [file, version] of [['encounter_gp.pkl', 'lets-go-pikachu'], ['encounter_ge.pkl', 'lets-go-eevee']]) {
    const buf = readFileSync(new URL(`legality/wild/Gen7/${file}`, res));
    if (buf.subarray(0, 2).toString() !== 'gg') throw new Error(`${file}: identificador inesperado`);
    for (const a of binLinker32(buf)) {
      const loc = a[0], to1 = a[2], to2 = a[3];
      if ((a.length - 4) % 4) throw new Error(`${file}: área ${loc} com tamanho ${a.length}`);
      for (let o = 4; o < a.length; o += 4) {
        const species = a[o], flags = a[o + 1], min = a[o + 2], max = a[o + 3];
        const det = [];
        if (max - min >= AGG_SPAN) det.push(`faixa L${min}–${max} agregada no arquivo do PKHeX (motivo não registrado)`);
        const cross = [];
        if (flags & 1 && to1) cross.push(locName(to1));
        if (flags & 2 && to2) cross.push(locName(to2));
        if (cross.length) det.push(`flag de crossover do PKHeX: também pode aparecer em ${cross.join(', ')}`);
        const e = { version, location: locName(loc), method: 'overworld', species, form: 0, min, max };
        if (det.length) e.detail = det.join('; ');
        wild.push(e);
      }
    }
  }

  const file = 'Legality/Encounters/Data/Gen7/Encounters7GG.cs';
  const src = readFileSync(new URL(file, core), 'utf8');
  for (const list of ['Encounter_GG', 'StaticGP', 'StaticGE']) {
    const { entries, skipped: sk } = csList(src, list, file);
    skipped.push(...sk);
    for (const e of entries) {
      const vers = VERS[e.args[0]];
      if (!vers) throw new Error(`${list}: versão ${e.args[0]}`);
      const species = num(e.props.Species), level = num(e.props.Level), loc = num(e.props.Location);
      const gift = e.props.FixedBall !== undefined;
      // Parceiro inicial: StaticGP/StaticGE em Pallet Town (28) — Pikachu/Eevee nível 5 (comentários do PKHeX).
      const starter = (list === 'StaticGP' || list === 'StaticGE') && loc === 28;
      for (const version of vers) {
        const f = { version, location: locName(loc), type: starter ? 'starter' : gift ? 'gift' : 'static', species, form: num(e.props.Form) ?? 0, level };
        if (e.comment) f.detail = `PKHeX: ${e.comment}`;
        fixed.push(f);
      }
    }
  }
  for (const list of ['TradeGift_GG', 'TradeGift_GP', 'TradeGift_GE']) {
    const { entries, skipped: sk } = csList(src, list, file);
    skipped.push(...sk);
    for (const e of entries) {
      const vers = VERS[e.args[0]];
      const at = /@\s*([^,]+?)\s*,/.exec(e.comment);
      const place = at ? at[1] : null;
      if (place && !names.includes(place)) throw new Error(`${list}: local do comentário "${place}" não existe no arquivo de locais`);
      for (const version of vers) {
        fixed.push({
          version, location: place, type: 'trade', species: num(e.props.Species), form: num(e.props.Form) ?? 0, level: num(e.props.Level),
          detail: `local tirado do comentário do PKHeX (o met location registrado é Link Trade); ${e.comment}`,
        });
      }
    }
  }
  return { wild, fixed, skipped: [...new Set(skipped)] };
}

// ---------------------------------------------------------------- Sword / Shield

function readSWSH(rootUrl) {
  const core = new URL('PKHeX.Core/', rootUrl);
  const res = new URL('Resources/', core);
  const names = locationNames(res, 'gen8/text_swsh_00000_en.txt');
  const BLOCK = new Set(['', 'Wild Area', 'Isle of Armor', 'Crown Tundra']);
  const locName = (l) => {
    const n = names[l];
    if (!n) throw new Error(`SwSh: local ${l} sem nome`);
    const sub = l % 2 === 0 ? names[l + 1] : '';
    return sub && !BLOCK.has(sub) ? `${n} (${sub})` : n;
  };
  const dlc = (l) => (l >= 164 && l <= 202 ? 'DLC Isle of Armor' : l >= 204 && l <= 246 ? 'DLC Crown Tundra' : null);
  const join = (...xs) => xs.filter(Boolean).join('; ') || undefined;
  const skipped = [];

  // ---- selvagens (symbol / hidden)
  const merged = new Map();
  const add = (e, weather) => {
    const k = [e.version, e.loc, e.method, e.species, e.form, e.min, e.max, e.tag ?? ''].join('|');
    const cur = merged.get(k);
    if (cur) cur.weather |= weather; else merged.set(k, { ...e, weather });
  };
  for (const v of ['sw', 'sh']) {
    const version = v === 'sw' ? 'sword' : 'shield';
    for (const table of ['symbol', 'hidden']) {
      const file = `encounter_${v}_${table}.pkl`;
      const buf = readFileSync(new URL(`legality/wild/Gen8/${file}`, res));
      if (buf.subarray(0, 2).toString() !== v) throw new Error(`${file}: identificador inesperado`);
      for (const a of binLinker32(buf)) {
        const loc = a[0], total = a[1];
        let o = 2, ctr = 0;
        while (ctr < total) {
          const flags = a.readUInt16LE(o), min = a[o + 2], max = a[o + 3], count = a[o + 4], type = a[o + 5];
          o += 6;
          if (type >= SLOT8.length) throw new Error(`${file}: SlotType8 ${type}`);
          for (let i = 0; i < count; i++, ctr++, o += 2) {
            const raw = a.readUInt16LE(o);
            const base = { version, loc, species: raw & 0x3ff, form: raw >> 11, min, max };
            if (table === 'symbol') {
              let method = 'symbol', tag;
              if (type === 5 || type === 6) method = 'surf';
              if (type === 11) { method = 'surf'; tag = 'Sharpedo'; }
              if (type !== 0 && type !== 5) tag = tag ?? SLOT8[type];
              add({ ...base, method, tag }, flags & W.All);
            } else {
              if (type === 12) { add({ ...base, method: 'fishing', tag: 'OnlyFishing' }, 0); continue; }
              if (flags & W.Fishing) add({ ...base, method: 'fishing' }, 0);
              if (flags & W.Shaking_Trees) add({ ...base, method: 'shaking-tree' }, 0);
              if (flags & W.All) {
                // EncounterSlot8: "Galar Mine hidden encounters can only be found via Curry or Fishing."
                const curry = loc === 30 || loc === 54;
                add({ ...base, method: curry ? 'curry' : 'hidden', tag: type === 4 ? 'HiddenMain2' : undefined }, flags & W.All);
              }
            }
          }
        }
      }
    }
  }
  const wild = [];
  for (const e of merged.values()) {
    let { min, max } = e;
    const det = [];
    if (e.tag) det.push(`PKHeX SlotType8.${e.tag}`);
    if (e.weather) {
      const area = areaWeather(e.loc);
      if ((e.weather & area) !== area) det.push(`clima: ${weatherList(e.weather)}`);
      if (e.weather === W.Heavy_Fog && isWildArea8(e.loc)) {
        min = max = 60;
        det.push('Heavy Fog só pós-jogo: nível 60 (EncounterSlot8)');
      }
    }
    if (isWildArea(e.loc) && !(min === 60 && max === 60)) det.push('PKHeX também aceita nível 60 no Wild Area (BoostLevel)');
    const out = { version: e.version, location: locName(e.loc), method: e.method, species: e.species, form: e.form, min, max };
    const d = join(...det, dlc(e.loc));
    if (d) out.detail = d;
    wild.push(out);
  }

  // ---- Max Raid (tocas do jogo; NÃO dist)
  const nestSrc = readFileSync(new URL('Legality/Encounters/Data/Gen8/Encounters8Nest.cs', core), 'utf8');
  const nestLocs = {}, inaccessible = {};
  const nestSwitch = nestSrc.slice(nestSrc.indexOf('GetNestLocations(byte nestIndex)'), nestSrc.indexOf('InaccessibleRank12DistributionLocations'));
  for (const m of nestSwitch.matchAll(/^\s*(\d{3}) => \[([\d,\s]*)\],/gm)) nestLocs[+m[1]] = m[2].split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  const inacc = nestSrc.slice(nestSrc.indexOf('GetInaccessibleRank12Nests(byte location)'));
  for (const m of inacc.matchAll(/^\s*(\d+) => \[([\d,\s]*)\],/gm)) inaccessible[+m[1]] = new Set(m[2].split(',').map(Number));
  const raids = new Map();
  for (const v of ['sw', 'sh']) {
    const version = v === 'sw' ? 'sword' : 'shield';
    const d = readFileSync(new URL(`legality/wild/Gen8/encounter_${v}_nest.pkl`, res));
    if (d.length % 10) throw new Error(`encounter_${v}_nest.pkl: tamanho ${d.length}`);
    for (let i = 0; i < d.length; i += 10) {
      const species = d.readUInt16LE(i), form = d[i + 2], gmax = d[i + 5] !== 0, nest = d[i + 6], rMin = d[i + 7], rMax = d[i + 8];
      const locs = nestLocs[nest];
      if (!locs || !locs.length) { skipped.push(`${version} toca ${nest}: sem local em GetNestLocations (espécie ${species})`); continue; }
      for (const loc of locs) {
        let lo = rMin;
        if (lo <= 1 && inaccessible[loc]?.has(nest)) lo = 2; // IsInaccessibleRank12Nest
        if (lo > rMax) continue;
        const min = LEVEL_CAPS[lo * 2], max = LEVEL_CAPS[rMax * 2 + 1];
        const k = [version, loc, species, form, gmax].join('|');
        const cur = raids.get(k);
        if (cur) { cur.lo = Math.min(cur.lo, lo); cur.hi = Math.max(cur.hi, rMax); cur.min = Math.min(cur.min, min); cur.max = Math.max(cur.max, max); }
        else raids.set(k, { version, loc, species, form, gmax, lo, hi: rMax, min, max });
      }
    }
  }
  for (const r of raids.values()) {
    const stars = r.lo === r.hi ? `${r.lo + 1}★` : `${r.lo + 1}–${r.hi + 1}★`;
    wild.push({
      version: r.version, location: locName(r.loc), method: 'max-raid', species: r.species, form: r.form, min: r.min, max: r.max,
      detail: join(`Max Raid ${stars}`, r.gmax && 'Gigantamax', dlc(r.loc)),
    });
  }

  // ---- Dynamax Adventures (Max Lair)
  const ug = readFileSync(new URL('legality/wild/Gen8/encounter_swsh_underground.pkl', res));
  if (ug.length % 14) throw new Error(`encounter_swsh_underground.pkl: tamanho ${ug.length}`);
  for (let i = 0; i < ug.length; i += 14) {
    const species = ug.readUInt16LE(i), form = ug[i + 2], level = ug[i + 3], gmax = ug[i + 13] !== 0;
    for (const version of VERS.SWSH) {
      wild.push({
        version, location: locName(244), method: 'dynamax-adventure', species, form, min: level, max: level,
        detail: join('Dynamax Adventure', gmax && 'Gigantamax', 'PKHeX não separa Sword × Shield', 'DLC Crown Tundra'),
      });
    }
  }

  // ---- estáticos e trocas
  const fixed = [];
  const file = 'Legality/Encounters/Data/Gen8/Encounters8.cs';
  const src = readFileSync(new URL(file, core), 'utf8');
  const STARTERS = new Set([810, 813, 816]); // Grookey / Scorbunny / Sobble (presentes de Postwick, nível 5)
  for (const list of ['StaticSWSH', 'StaticSW', 'StaticSH']) {
    const { entries, skipped: sk } = csList(src, list, file);
    skipped.push(...sk);
    for (const e of entries) {
      const vers = VERS[e.args[0] || 'SWSH'];
      if (!vers) throw new Error(`${list}: versão ${e.args[0]}`);
      const species = num(e.props.Species), level = num(e.props.Level), loc = num(e.props.Location);
      const gift = e.props.FixedBall !== undefined; // EncounterStatic8.Gift
      const type = gift && STARTERS.has(species) && loc === 6 ? 'starter' : gift ? 'gift' : 'static';
      const det = [];
      if (e.props.Weather) {
        const wm = evalWeather(e.props.Weather), area = areaWeather(loc);
        if ((wm & area) !== area) det.push(`clima: ${weatherList(wm)}`);
        if (wm === W.Heavy_Fog && isWildArea8(loc)) det.push('Heavy Fog no Wild Area: PKHeX gera nível 60');
      }
      if (/Technically a gift/i.test(e.prevComment)) det.push(`PKHeX: ${e.prevComment}`);
      if (e.comment) det.push(`PKHeX: ${e.comment}`);
      for (const version of vers) {
        const f = { version, location: locName(loc), type, species, form: num(e.props.Form) ?? 0, level };
        const d = join(...det, dlc(loc));
        if (d) f.detail = d;
        fixed.push(f);
      }
    }
  }
  for (const list of ['TradeSWSH', 'TradeSW', 'TradeSH']) {
    const { entries, skipped: sk } = csList(src, list, file);
    skipped.push(...sk);
    for (const e of entries) {
      // (TradeNames, índice, versão, espécie, nível, …) ou (TradeOT_R1, versão, espécie, nível, …)
      const a = e.args[0] === 'TradeNames' ? e.args.slice(2) : e.args.slice(1);
      const vers = VERS[a[0]];
      if (!vers) throw new Error(`${list}: versão ${a[0]}`);
      for (const version of vers) {
        fixed.push({
          version, location: null, type: 'trade', species: num(a[1]), form: num(e.props.Form) ?? 0, level: num(a[2]),
          detail: `troca com NPC; o C# do PKHeX não registra o local (met location = Link Trade)${e.comment ? `; ${e.comment}` : ''}`,
        });
      }
    }
  }
  return { wild, fixed, skipped: [...new Set(skipped)] };
}

/**
 * @param {URL} rootUrl  raiz do checkout do PKHeX (contém PKHeX.Core/)
 * @param {'lets-go-pikachu-lets-go-eevee'|'sword-shield'} gameId
 * @returns {{ wild: object[], fixed: object[], skipped: string[] }}
 */
export function readEncounters(rootUrl, gameId) {
  if (gameId === 'lets-go-pikachu-lets-go-eevee') return readGG(rootUrl);
  if (gameId === 'sword-shield') return readSWSH(rootUrl);
  throw new Error(`pkhex-enc-gg-swsh: jogo não suportado ${gameId}`);
}
