// Encontros de Black/White e Black 2/White 2 pelas tabelas do PKHeX.Core (kwsch/PKHeX, GPL-3.0; checkout em
// data-sources/pkhex-src). Sem rede; só leitura. Formatos tirados SÓ do código C#:
//
// SELVAGENS — Resources/legality/wild/Gen5/encounter_{b,w}.pkl (ident "51") e encounter_{b2,w2}.pkl (ident "52")
//   Legality/Encounters/Data/Gen5/Encounters5BW.cs / Encounters5B2W2.cs: SlotsB/W/B2/W2 = EncounterArea5.GetAreas(Get(res, ident))
//   Legality/Encounters/Data/EncounterUtil.cs Get(res, ident) + Legality/Assets/BinLinkerAccessor.cs: "2 letras" + u16 contagem
//     + offsets u32 (início/fim de cada área)
//   Legality/Encounters/Templates/Gen5/EncounterArea5.cs: área = u16 Location, u8 SlotType5, u8 (não lido), slots de 4 bytes:
//     u16 espécie (forma = valor >> 11; espécie = valor & 0x3FF), u8 nível mín., u8 nível máx.
//   SlotType5 (mesmo arquivo): Standard 0, Grass 1, Surf 2, Super_Rod 3, Swarm 4, HiddenGrotto 5.
//   EncounterSlot5.cs: IsHiddenGrotto ⇒ habilidade oculta, nunca shiny.
//   O .pkl guarda as tabelas do jogo SEM rótulo de sub-tipo: "Grass" funde grama comum, grama escura, grama que balança, nuvem de
//   poeira e sombra voadora (e o chão de cavernas); "Surf" funde água comum e água ondulando; "Super_Rod" funde pesca comum e em
//   água ondulando (na Gen 5 só existe a Super Rod). As tabelas vêm deduplicadas por conteúdo dentro do local, então a POSIÇÃO não
//   permite separar os sub-tipos com segurança — não separamos (seria inventar). Tabelas zeradas (espécie 0) são puladas.
//   Hidden Grotto (B2W2): todas as grutas estão numa área só, Location 143 ("Hidden Grotto") — o PKHeX não grava a rota de cada gruta.
//   Estações: o .pkl repete a área por estação (ex.: Deerling/Sawsbuck formas 0–3); a forma sai como está.
//
// FIXOS — listas C# lidas linha a linha (cada entrada numa linha), conferindo a contagem contra os "new(" de cada lista:
//   Encounters5BW.cs    Encounter_BW, StaticB, StaticW (EncounterStatic5); TradeGift_BW, TradeGift_B, TradeGift_W (EncounterTrade5BW)
//   Encounters5B2W2.cs  Encounter_B2W2_Regular, StaticB2, StaticW2 (EncounterStatic5); Encounter_B2W2_N (EncounterStatic5N);
//                       TradeGift_B2W2, TradeGift_B2, TradeGift_W2 (EncounterTrade5B2W2)
//   (são as listas que Generator/Possible/EncounterPossible5.cs percorre)
//   EncounterStatic5.cs: IsEgg => EggLocation != 0; FixedBall = Poke ⇒ presente; IsRoaming ⇒ errante (Location é só o local de
//     registro, não onde aparece). EncounterStatic5N.cs ("N's Pokémon", só B2W2, forma 0): FixedBall = Poke só para o Zorua.
//   EncounterTrade5BW.cs / EncounterTrade5B2W2.cs: Location => Locations.LinkTrade5NPC (30002) — o PKHeX NÃO grava a cidade da troca;
//     apelido/OT de Resources/legality/gen5/text_trade{bw,b2w2}_en.txt (OT = índice + metade da lista); os trocadores Yancy/Curtis
//     (B2W2) vêm de TradeOT_B2W2_F/_M (sem apelido; um ou outro conforme o gênero do jogador).
//
// NOMES DE LOCAL — Resources/text/locations/gen5/text_bw2_{00000,30000,40000,60000}_en.txt (linha = id − banco), texto cru.
//   GameStrings.SanitizeMetGen5: o id 36 é "Cold Storage" em B/W e "PWT" em B2/W2 (o texto do id 84 é "Cold Storage") — usamos o
//   nome de cada jogo. Os sufixos " (B/W)", " (-)" etc. do Sanitize são do PKHeX e ficam de fora.
//
// O que NÃO entra (premissa "nunca inventar" + só o jogável no próprio cartucho):
//   DreamWorld_BW / DreamWorld_B2W2 / Encounters5DR.DreamWorld_Common (EncounterStatic5Entree, Location 75 = Entree Forest: Pokémon
//   trazidos do Pokémon Dream World / Global Link, inclusive as promoções PGL), Encounters5DR.Encounter_DreamRadar (Pokémon Dream Radar
//   do 3DS), Mystery Gift (MGDB_G5/EGDB_G5), a seção "// Event" de Encounter_BW (Victini @ Liberty Garden, Zorua @ Castelia City,
//   Zoroark @ Lostlorn Forest — exigem item/Pokémon de evento), entradas comentadas no C#, ovos de criação (EncounterEgg5).
import { readFileSync } from 'node:fs';

const GAMES = {
  'black-white': {
    cs: 'Encounters5BW.cs', trade: 'tradebw',
    wild: [['black', 'b', '51'], ['white', 'w', '51']],
    statics: ['Encounter_BW', 'StaticB', 'StaticW'], nlist: null, trades: ['TradeGift_BW', 'TradeGift_B', 'TradeGift_W'],
    ver: { BW: ['black', 'white'], B: ['black'], W: ['white'] },
    starters: { 4: [495, 498, 501] }, // "Starters @ Nuvema Town"
    locFix: { 36: 84 }, // Cold Storage (B/W) = PWT (B2/W2)
  },
  'black-2-white-2': {
    cs: 'Encounters5B2W2.cs', trade: 'tradeb2w2',
    wild: [['black-2', 'b2', '52'], ['white-2', 'w2', '52']],
    statics: ['Encounter_B2W2_Regular', 'StaticB2', 'StaticW2'], nlist: 'Encounter_B2W2_N', trades: ['TradeGift_B2W2', 'TradeGift_B2', 'TradeGift_W2'],
    ver: { B2W2: ['black-2', 'white-2'], B2: ['black-2'], W2: ['white-2'] },
    starters: { 117: [495, 498, 501] }, // "Starters @ Aspertia City"
    locFix: {},
  },
};

// SlotType5 → método do poke-tact
const METHOD5 = { 1: 'grass', 2: 'surf', 3: 'super-rod', 4: 'swarm', 5: 'hidden-grotto' };
export const SLOT_METHODS = { gen5: METHOD5 };
const LOC_LINKTRADE5NPC = 30002; // Locations.LinkTrade5NPC
// listas lidas mas descartadas inteiras (contadas só para o relatório)
const EXCLUDED_LISTS = {
  'black-white': [['Encounters5BW.cs', 'DreamWorld_BW', 'Entree Forest / Dream World + PGL']],
  'black-2-white-2': [['Encounters5B2W2.cs', 'DreamWorld_B2W2', 'Entree Forest / Dream World + PGL'],
    ['Encounters5DR.cs', 'Encounter_DreamRadar', 'Pokémon Dream Radar (3DS)']],
  common: [['Encounters5DR.cs', 'DreamWorld_Common', 'Entree Forest / Dream World']],
};
const DAYS = { Mon: 'segundas', Tues: 'terças', Wed: 'quartas', Thurs: 'quintas', Fri: 'sextas', Friday: 'sextas', Sat: 'sábados', Sun: 'domingos' };

function lines(url) {
  return readFileSync(url, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
}

/** BinLinkerAccessor (offsets u32), conferindo o identificador de 2 letras. */
function binLinker32(b, ident) {
  if (b.subarray(0, 2).toString('latin1') !== ident) throw new Error(`identificador ≠ "${ident}"`);
  const n = b.readUInt16LE(2);
  if (b.readUInt32LE(4 + 4 * n) !== b.length) throw new Error('último offset ≠ tamanho do arquivo');
  return Array.from({ length: n }, (_, i) => b.subarray(b.readUInt32LE(4 + 4 * i), b.readUInt32LE(8 + 4 * i)));
}

function locationNamer(res, cfg) {
  const bank = (n) => lines(new URL(`text/locations/gen5/text_bw2_${n}_en.txt`, res));
  const b = { 0: bank('00000'), 3: bank('30000'), 4: bank('40000'), 6: bank('60000') };
  return (id) => {
    if (id >= 60000) return b[6][id - 60000] || null;
    if (id >= 40000) return b[4][id - 40000] || null;
    if (id >= 30000) return b[3][id - 30000] || null;
    return b[0][cfg.locFix[id] ?? id] || null;
  };
}

/** Corpo de "Nome = [ … ];" ou "Nome = DreamWorldEntry.GetArray(…, [ … ]);" como linhas. */
function listLines(src, name) {
  const m = src.match(new RegExp(`\\b${name}\\s*=[^\\[;]*\\[`));
  if (!m) throw new Error(`lista ${name} não encontrada`);
  const start = m.index + m[0].length;
  const end = src.indexOf('\n    ]', start); // as listas fecham com "    ]" na indentação do membro
  if (end < 0) throw new Error(`lista ${name} sem fechamento`);
  return src.slice(start, end).split(/\r?\n/);
}

function parseProps(body) {
  const out = {};
  // propriedades simples "Nome = valor" separadas por vírgula; IVs = new(…) tem vírgulas internas
  for (const part of body.replace(/new\([^)]*\)/g, (s) => s.replace(/,/g, ';')).split(',')) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\w+)\s*=\s*(.+)$/);
    if (!m) throw new Error(`propriedade ilegível: ${t}`);
    const v = m[2].trim();
    out[m[1]] = /^-?\d+$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v;
  }
  return out;
}

/** Lê uma lista do C# (uma entrada por linha). Devolve as entradas com args, props, seção e comentário da linha. */
function readList(src, name) {
  const body = listLines(src, name);
  const expected = body.filter((l) => /^\s*new\s*\(/.test(l)).length;
  const commented = body.filter((l) => /^\s*\/\/\s*new\s*\(/.test(l)).map((l) => l.trim());
  const entries = [];
  let section = '';
  for (const l of body) {
    const t = l.trim();
    if (!t) continue;
    if (t.startsWith('//')) { if (!/^\/\/\s*new\s*\(/.test(t)) section = t.slice(2).trim(); continue; }
    const m = t.match(/^new\s*\(([^)]*)\)\s*(?:\{(.*)\})?\s*,?\s*(?:\/\/\s*(.*))?$/);
    if (!m) throw new Error(`${name}: linha ilegível: ${t.slice(0, 90)}`);
    entries.push({ args: m[1].split(',').map((a) => a.trim()), props: m[2] != null ? parseProps(m[2]) : {}, section, comment: m[3] ?? '' });
  }
  if (entries.length !== expected) throw new Error(`${name}: ${entries.length} lidos ≠ ${expected} "new("`);
  return { entries, expected, commented };
}

/** "Musharna @ Dreamyard Friday Only" → 'só às sextas' (o dia vem do comentário do C#). */
function dayNote(comment) {
  const m = comment.match(/\b(Mon|Tues|Wed|Thurs|Fri|Friday|Sat|Sun)\w*\s+Only\b/);
  return m ? `só às ${DAYS[m[1]]}` : undefined;
}

/**
 * @param {URL} rootUrl  raiz do checkout do PKHeX (contém PKHeX.Core/)
 * @param {string} gameId 'black-white' | 'black-2-white-2'
 */
export function readEncounters(rootUrl, gameId) {
  const cfg = GAMES[gameId];
  if (!cfg) throw new Error(`sem encontros Gen 5 do PKHeX para ${gameId}`);
  const core = new URL('PKHeX.Core/', rootUrl);
  const res = new URL('Resources/', core);
  const data = new URL('Legality/Encounters/Data/Gen5/', core);
  const locName = locationNamer(res, cfg);
  const wild = [], fixed = [], seen = new Set();
  const report = { wildAreas: {}, lists: [], excluded: [], skipped: [], counts: {} };
  const push = (arr, e) => {
    if (e.detail == null) delete e.detail;
    const k = JSON.stringify(e);
    if (!seen.has(k)) { seen.add(k); arr.push(e); }
  };

  // ---- selvagens
  for (const [version, file, ident] of cfg.wild) {
    const areas = binLinker32(readFileSync(new URL(`legality/wild/Gen5/encounter_${file}.pkl`, res)), ident);
    report.wildAreas[version] = areas.length;
    for (const d of areas) {
      const location = d.readUInt16LE(0), type = d[2];
      const method = METHOD5[type];
      if (!method) throw new Error(`SlotType5 ${type} desconhecido em encounter_${file}.pkl`);
      const name = locName(location);
      if (!name) throw new Error(`local ${location} sem nome`);
      for (let o = 4; o + 4 <= d.length; o += 4) {
        const raw = d.readUInt16LE(o);
        const species = raw & 0x3ff;
        if (species === 0) continue; // tabela vazia / zerada
        push(wild, {
          version, location: name, method, species, form: raw >> 11, min: d[o + 2], max: d[o + 3],
          detail: type === 5 ? 'habilidade oculta' : undefined,
        });
      }
    }
  }

  // ---- fixos
  const src = readFileSync(new URL(cfg.cs, data), 'utf8');
  const tradeText = lines(new URL(`legality/gen5/text_${cfg.trade}_en.txt`, res));
  // EncounterTrade5*: OT = índice + (names[1].Length >> 1) — names[1] = japonês
  const half = lines(new URL(`legality/gen5/text_${cfg.trade}_ja.txt`, res)).length >> 1;
  const note = (list, e) => report.lists.push({ list, parsed: e.entries.length, expected: e.expected, commented: e.commented.length });

  for (const name of cfg.statics) {
    const list = readList(src, name);
    note(name, list);
    for (const c of list.commented) report.skipped.push({ list: name, reason: 'comentado no C# do PKHeX', text: c });
    for (const { args, props, section, comment } of list.entries) {
      const versions = cfg.ver[args[0]];
      if (!versions) throw new Error(`${name}: versão ${args[0]} desconhecida`);
      if (/^Event\b/.test(section)) { // Victini/Zorua/Zoroark de B/W: dependem de evento
        report.excluded.push({ list: name, reason: `seção "// ${section}" (exige evento)`, species: props.Species, comment });
        continue;
      }
      const loc = props.Location ?? 0, egg = props.EggLocation ?? 0;
      let type, location = locName(egg !== 0 ? egg : loc);
      const notes = [];
      if (egg !== 0) { type = 'egg'; notes.push('ovo'); }
      else if (cfg.starters[loc]?.includes(props.Species)) type = 'starter';
      else if (props.FixedBall === 'Ball.Poke') type = 'gift'; // recebido já na Poké Ball; sem FixedBall = batalha
      else type = 'static';
      if (props.IsRoaming) { location = null; notes.push('vaga pelas rotas'); }
      if (/^Fossils\b/.test(section)) notes.push('fóssil');
      if (props.Ability === 'OnlyHidden') notes.push('habilidade oculta');
      if (props.Shiny === 'Shiny.Always') notes.push('sempre shiny');
      const day = dayNote(comment);
      if (day) notes.push(day);
      for (const version of versions)
        push(fixed, { version, location, type, species: props.Species, form: props.Form ?? 0, level: props.Level, detail: notes.join('; ') || undefined });
    }
  }
  if (cfg.nlist) {
    const list = readList(src, cfg.nlist);
    note(cfg.nlist, list);
    for (const { props } of list.entries) {
      const gift = props.Species === 570; // EncounterStatic5N.FixedBall: Zorua = Poke (presente), os demais são capturados
      const notes = ['Pokémon do N'];
      if (props.Ability === 'OnlyHidden') notes.push('habilidade oculta');
      for (const version of cfg.ver.B2W2)
        push(fixed, { version, location: locName(props.Location), type: gift ? 'gift' : 'static', species: props.Species, form: 0, level: props.Level, detail: notes.join('; ') });
    }
  }
  // trocadores Yancy/Curtis (B2W2): arrays de OT no próprio C#
  const otArrays = {};
  for (const m of src.matchAll(/string\[\]\s+(TradeOT_\w+)\s*=\s*\[([^\]]*)\]/g)) // string.Empty também é item (índice = idioma)
    otArrays[m[1]] = m[2].split(',').map((x) => x.trim()).map((x) => (x === 'string.Empty' ? '' : JSON.parse(x)));
  for (const name of cfg.trades) {
    const list = readList(src, name);
    note(name, list);
    for (const { args, props, section } of list.entries) {
      let versions, detail;
      if (args[0] === 'TradeNames') { // (names, index, version[, PID])
        versions = cfg.ver[args[2]];
        const i = Number(args[1]);
        // IsFixedNickname = false (Gigalith de B2W2): vem com o nome da espécie, sem apelido
        detail = props.IsFixedNickname === false ? `troca com ${tradeText[i + half]}` : { nickname: tradeText[i], ot: tradeText[i + half] };
      } else if (otArrays[args[0]]) { // (TradeOT_B2W2_F|M, version): sem apelido
        versions = cfg.ver[args[1]];
        const ot = otArrays[args[0]][2]; // índice 2 = inglês (LanguageID.English)
        detail = `troca com ${ot}${/Female/i.test(section) ? ' (jogadora menina)' : /Male/i.test(section) ? ' (jogador menino)' : ''}; habilidade oculta`;
      } else throw new Error(`${name}: construtor de troca desconhecido (${args[0]})`);
      if (!versions) throw new Error(`${name}: versão desconhecida em (${args.join(', ')})`);
      for (const version of versions)
        push(fixed, { version, location: null, type: 'trade', species: props.Species, form: props.Form ?? 0, level: props.Level, detail });
    }
  }
  // listas descartadas inteiras: só a contagem
  for (const [file, name, reason] of [...EXCLUDED_LISTS[gameId], ...EXCLUDED_LISTS.common]) {
    const list = readList(readFileSync(new URL(file, data), 'utf8'), name);
    report.excluded.push({ list: name, reason, entries: list.entries.length });
  }
  for (const [version] of cfg.wild)
    report.counts[version] = { wild: wild.filter((e) => e.version === version).length, fixed: fixed.filter((e) => e.version === version).length };
  report.tradeLocation = locName(LOC_LINKTRADE5NPC); // "Link Trade": o PKHeX não grava a cidade
  return { wild, fixed, report };
}
