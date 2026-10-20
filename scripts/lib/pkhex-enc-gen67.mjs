// Encontros de X/Y, Omega Ruby/Alpha Sapphire, Sun/Moon e Ultra Sun/Ultra Moon pelas tabelas do PKHeX.Core
// (kwsch/PKHeX, GPL-3.0; checkout em data-sources/pkhex-src). Sem rede; só leitura. Formatos tirados SÓ do código C#:
//
// SELVAGENS — Resources/legality/wild/Gen6/encounter_{x,y,or,as}.pkl e Gen7/encounter_{sn,mn,us,um}.pkl
//   EncounterUtil.Get(resource, ident)  → Util.GetBinaryResource($"encounter_{resource}.pkl") + BinLinkerAccessor
//   BinLinkerAccessor (Util/BinLinkerAccessor.cs): "2 letras" + u16 contagem + offsets u32 (início/fim de cada área)
//   EncounterArea6XY.cs / EncounterArea6AO.cs / EncounterArea7.cs (construtor privado + ReadSlots/ReadSlot):
//     área = u16 Location, u8 Type (SlotType6 | SlotType7), u8 (não lido), depois slots de 4 bytes:
//     u16 espécie (form = valor >> 11; espécie = valor & 0x3FF), u8 nível mín, u8 nível máx
//   SlotType6 (EncounterArea6XY.cs): Standard 0, Grass 1, Surf 2, Old_Rod 3, Good_Rod 4, Super_Rod 5, Rock_Smash 6,
//     Horde 7, FriendSafari 8.  SlotType7 (EncounterArea7.cs): Standard 0, SOS 1.
//   Safári dos Amigos (XY): não está no .pkl — EncounterArea6XY() monta em código (Location 148, nível 30,
//     AllFriendSafariSpecies + Floette formas 0/1/3 + Vivillon FormVivillon); só entra com opts.friendSafari.
//   Forma 30 (EncounterUtil.FormVivillon/FormDynamic) e 31 (FormRandom) = "forma não literal" (IsRandomUnspecificForm
//     em EncounterSlot6XY/6AO/7.cs e EncounterStatic7.cs) → emitimos forma 0 com detail 'forma variável'.
//
// FIXOS — listas C# lidas com regex/varredura de chaves, conferindo a contagem contra os "new(" de cada lista:
//   Legality/Encounters/Data/Gen6/Encounters6XY.cs   Encounter_XY, StaticX, StaticY, TradeGift_XY
//   Legality/Encounters/Data/Gen6/Encounters6AO.cs   Encounter_AO_Regular (= Encounter_AO), StaticA, StaticO,
//                                                     TradeGift_AO, BaseCosplay (+ "BaseCosplay with {…}")
//   Legality/Encounters/Data/Gen7/Encounters7SM.cs   StaticSM, StaticSN, StaticMN, TradeGift_SM
//   Legality/Encounters/Data/Gen7/Encounters7USUM.cs StaticUSUM, StaticUS, StaticUM, TradeGift_USUM
//   (são as listas que Generator/Possible/EncounterPossible6.cs e EncounterPossible7.cs percorrem)
//   EncounterStatic6.cs / EncounterStatic7.cs: Species, Level, Location, Form, EggLocation (IsEgg => EggLocation != 0),
//     FixedBall, FatefulEncounter.  EncounterTrade6.cs: Location => Locations.LinkTrade6NPC (30001), Form => 0;
//     construtor (names, index, version, m, i, f, v).  EncounterTrade7.cs: idem, mas com Form e construtor
//     (names, index, version).
//
// NOMES DE LOCAL — Resources/text/locations/gen6/text_xy_*_en.txt (X/Y e ORAS) e gen7/text_sm_*_en.txt (SM e USUM),
//   linha = id; bancos 00000/30000/40000/60000 como em LocationSet6.GetLocationName; o sublocal (id ímpar seguinte)
//   é anexado entre parênteses como em GameStrings.SanitizeMetGen6 (ids 8–136) e SanitizeMetGen7 (ids ≥ 6, menos 194–197).
//
// O que NÃO entra (premissa "nunca inventar" + só o jogável no próprio cartucho): Mystery Gift / eventos (wc*, mgdb),
// estáticos com local ≥ 40000 ou FixedBall = Cherish (ex.: Magearna do QR, local 40001), entradas comentadas no C#,
// Safári dos Amigos (exige o código de amigo de OUTRO jogador; liga com opts.friendSafari), espécie 0 / slots vazios.
import { readFileSync } from 'node:fs';

const GAMES = {
  'x-y': {
    gen: 6, loc: 'gen6/text_xy', area: 'xy',
    wild: [['x', 'Gen6/encounter_x.pkl'], ['y', 'Gen6/encounter_y.pkl']],
    cs: 'Gen6/Encounters6XY.cs', statics: ['Encounter_XY', 'StaticX', 'StaticY'], trades: ['TradeGift_XY'],
    ver: { XY: ['x', 'y'], X: ['x'], Y: ['y'] },
    starters: { 10: [650, 653, 656] }, // "Kalos Starters @ Aquacorde Town"
  },
  'omega-ruby-alpha-sapphire': {
    gen: 6, loc: 'gen6/text_xy', area: 'ao',
    wild: [['omega-ruby', 'Gen6/encounter_or.pkl'], ['alpha-sapphire', 'Gen6/encounter_as.pkl']],
    cs: 'Gen6/Encounters6AO.cs', statics: ['Encounter_AO_Regular', 'StaticA', 'StaticO'], trades: ['TradeGift_AO'], bases: ['BaseCosplay'],
    ver: { ORAS: ['omega-ruby', 'alpha-sapphire'], OR: ['omega-ruby'], AS: ['alpha-sapphire'] },
    starters: { 204: [252, 255, 258] }, // "Starters @ Route 101" (os de outras regiões, mesmo local, viram 'gift')
  },
  'sun-moon': {
    gen: 7, loc: 'gen7/text_sm', area: 'sm',
    wild: [['sun', 'Gen7/encounter_sn.pkl'], ['moon', 'Gen7/encounter_mn.pkl']],
    cs: 'Gen7/Encounters7SM.cs', statics: ['StaticSM', 'StaticSN', 'StaticMN'], trades: ['TradeGift_SM'],
    ver: { SM: ['sun', 'moon'], SN: ['sun'], MN: ['moon'] },
    starters: { 24: [722, 725, 728] }, // "Gifts - 0.bin": Rowlet/Litten/Popplio
  },
  'ultra-sun-ultra-moon': {
    gen: 7, loc: 'gen7/text_sm', area: 'uu',
    wild: [['ultra-sun', 'Gen7/encounter_us.pkl'], ['ultra-moon', 'Gen7/encounter_um.pkl']],
    cs: 'Gen7/Encounters7USUM.cs', statics: ['StaticUSUM', 'StaticUS', 'StaticUM'], trades: ['TradeGift_USUM'],
    ver: { USUM: ['ultra-sun', 'ultra-moon'], US: ['ultra-sun'], UM: ['ultra-moon'] },
    starters: { 8: [722, 725, 728] },
  },
};

// SlotType6 / SlotType7 → método do poke-tact. "Standard" junta tudo o que o PKHeX não separa (grama, surf, varas…).
const METHOD6 = { 0: 'other', 1: 'grass', 2: 'surf', 3: 'old-rod', 4: 'good-rod', 5: 'super-rod', 6: 'rock-smash', 7: 'horde', 8: 'friend-safari' };
const METHOD7 = { 0: 'other', 1: 'sos' };
export const SLOT_METHODS = { gen6: METHOD6, gen7: METHOD7 };

const FORM_DYNAMIC = 30; // EncounterUtil.FormDynamic (= FormVivillon); 31 = FormRandom
const CONST = { 'EncounterStatic7.FormVivillon': 30, FormVivillon: 30, 'EncounterUtil.FormVivillon': 30, FormRandom: 31, 'EncounterUtil.FormRandom': 31 };

function lines(url) {
  return readFileSync(url, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
}

function locationNamer(res, cfg) {
  const bank = (n) => lines(new URL(`text/locations/${cfg.loc}_${n}_en.txt`, res));
  const b = { 0: bank('00000'), 3: bank('30000'), 4: bank('40000'), 6: bank('60000') };
  return (id) => {
    if (id >= 60000) return b[6][id - 60000] || null;
    if (id >= 40000) return b[4][id - 40000] || null;
    if (id >= 30000) return b[3][id - 30000] || null;
    let name = b[0][id] || null;
    const sub = id % 2 === 0 ? b[0][id + 1] : '';
    const withSub = cfg.gen === 6 ? id >= 8 && id <= 136 : id >= 6 && !(id >= 194 && id < 198);
    if (name && sub && withSub) name = `${name} (${sub})`;
    return name;
  };
}

/** BinLinkerAccessor (offsets u32). */
function binLinker32(b) {
  const n = b.readUInt16LE(2);
  return Array.from({ length: n }, (_, i) => b.subarray(b.readUInt32LE(4 + 4 * i), b.readUInt32LE(8 + 4 * i)));
}

/** Corpo "[ … ]" (ou "{ … }") a partir de `start`, respeitando comentários de linha. Devolve [início, fim). */
function matchBlock(src, open) {
  const close = { '[': ']', '{': '}', '(': ')' }[src[open]];
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (src[i] === '"') { i = src.indexOf('"', i + 1); continue; }
    if ('[{('.includes(src[i])) depth++;
    else if (']})'.includes(src[i])) { depth--; if (depth === 0 && src[i] === close) return [open + 1, i]; }
  }
  throw new Error('bloco sem fechamento');
}

/** Divide no nível 0 por vírgulas, ignorando comentários; cada item leva os comentários vistos antes dele. */
function splitTop(body) {
  const items = [];
  let depth = 0, cur = '', comments = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '/' && body[i + 1] === '/') {
      let e = body.indexOf('\n', i); if (e < 0) e = body.length;
      if (depth === 0 && !cur.trim()) comments.push(body.slice(i + 2, e).trim());
      i = e; cur += '\n'; continue;
    }
    if ('[{('.includes(c)) depth++;
    if (']})'.includes(c)) depth--;
    if (c === ',' && depth === 0) { if (cur.trim()) items.push({ text: cur.trim(), comments }); cur = ''; comments = []; continue; }
    cur += c;
  }
  if (cur.trim()) items.push({ text: cur.trim(), comments });
  return items;
}

function parseValue(v) {
  v = v.trim();
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v in CONST) return CONST[v];
  if (v === 'true' || v === 'false') return v === 'true';
  return v; // Ball.Poke, Shiny.Never, new(…), etc. — guardado cru
}

function parseProps(body) {
  const out = {};
  for (const { text } of splitTop(body)) {
    const m = text.match(/^(\w+)\s*=\s*([\s\S]+)$/);
    if (!m) throw new Error(`propriedade ilegível: ${text}`);
    out[m[1]] = parseValue(m[2]);
  }
  return out;
}

/** Lê uma lista "Tipo[] Nome = [ … ];" do C#. */
function readList(src, name, bases) {
  const m = src.match(new RegExp(`\\b${name}\\s*=\\s*(?://[^\\n]*)?\\s*\\[`));
  if (!m) throw new Error(`lista ${name} não encontrada`);
  const [s, e] = matchBlock(src, m.index + m[0].length - 1);
  const body = src.slice(s, e);
  const expected = (body.match(/^\s*new\(/gm) || []).length + (body.match(/^\s*BaseCosplay\b/gm) || []).length;
  const commented = (body.match(/^\s*\/\/\s*new\(.*$/gm) || []).map((l) => l.trim());
  const entries = [];
  let qr = false; // "// QR Scan: …" abre a seção do Island Scan; termina no 1º item sem Relearn
  for (const it of splitTop(body)) {
    if (it.comments.some((c) => /^QR Scan\b/.test(c))) qr = true;
    let args, props, base = null;
    let mm;
    if ((mm = it.text.match(/^new\(([^)]*)\)\s*\{([\s\S]*)\}$/))) { args = mm[1].split(',').map((a) => a.trim()); props = parseProps(mm[2]); }
    else if ((mm = it.text.match(/^(\w+)\s+with\s*\{([\s\S]*)\}$/)) && bases[mm[1]]) { base = bases[mm[1]]; props = { ...base.props, ...parseProps(mm[2]) }; args = base.args; }
    else if (bases[it.text]) { base = bases[it.text]; props = { ...base.props }; args = base.args; }
    else throw new Error(`${name}: item ilegível: ${it.text.slice(0, 80)}`);
    if (qr && !('Relearn' in props)) qr = false;
    entries.push({ args, props, islandScan: qr });
  }
  if (entries.length !== expected) throw new Error(`${name}: ${entries.length} lidos ≠ ${expected} "new("`);
  return { name, entries, expected, commented };
}

function readBase(src, name) {
  const m = src.match(new RegExp(`\\b${name}\\s*=\\s*new\\(([^)]*)\\)\\s*\\{`));
  if (!m) throw new Error(`base ${name} não encontrada`);
  const [s, e] = matchBlock(src, m.index + m[0].length - 1);
  return { args: m[1].split(',').map((a) => a.trim()), props: parseProps(src.slice(s, e)) };
}

function friendSafariSlots(src) {
  // EncounterArea6XY.LoadSafariSlots: espécies da lista + Floette 0/1/3 + Vivillon FormVivillon; nível 30; local 148
  const m = src.match(/AllFriendSafariSpecies\s*=>\s*\[([\s\S]*?)\]/);
  const species = m[1].split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  return [...species.map((s) => [s, 0]), [670, 0], [670, 1], [670, 3], [666, FORM_DYNAMIC]];
}

/**
 * @param {URL} rootUrl  raiz do checkout do PKHeX (contém PKHeX.Core/)
 * @param {string} gameId 'x-y' | 'omega-ruby-alpha-sapphire' | 'sun-moon' | 'ultra-sun-ultra-moon'
 * @param {{friendSafari?: boolean}} [opts]
 */
export function readEncounters(rootUrl, gameId, opts = {}) {
  const cfg = GAMES[gameId];
  if (!cfg) throw new Error(`sem encontros Gen 6/7 do PKHeX para ${gameId}`);
  const core = new URL('PKHeX.Core/', rootUrl);
  const res = new URL('Resources/', core);
  const locName = locationNamer(res, cfg);
  const methods = cfg.gen === 6 ? METHOD6 : METHOD7;
  const wild = [], fixed = [], seen = new Set(), skipped = [];
  const push = (arr, e) => {
    if (e.detail == null) delete e.detail;
    const k = JSON.stringify(e);
    if (!seen.has(k)) { seen.add(k); arr.push(e); }
  };
  const formOf = (f) => (f >= FORM_DYNAMIC ? [0, 'forma variável'] : [f, undefined]);

  // ---- selvagens
  for (const [version, file] of cfg.wild) {
    const areas = binLinker32(readFileSync(new URL(`legality/wild/${file}`, res)));
    for (const d of areas) {
      const location = d.readUInt16LE(0), type = d[2];
      const method = methods[type];
      if (!method) throw new Error(`SlotType ${type} desconhecido em ${file}`);
      for (let o = 4; o + 4 <= d.length; o += 4) {
        const raw = d.readUInt16LE(o);
        const species = raw & 0x3ff;
        if (species === 0) continue; // slot vazio / zerado
        const [form, detail] = formOf(raw >> 11);
        push(wild, { version, location: locName(location), method, species, form, min: d[o + 2], max: d[o + 3], detail });
      }
    }
  }
  const src = readFileSync(new URL(`Legality/Encounters/Data/${cfg.cs}`, core), 'utf8');
  if (gameId === 'x-y' && opts.friendSafari) {
    const area = readFileSync(new URL('Legality/Encounters/Templates/Gen6/EncounterArea6XY.cs', core), 'utf8');
    for (const version of cfg.ver.XY)
      for (const [species, f] of friendSafariSlots(area)) {
        const [form, detail] = formOf(f);
        push(wild, { version, location: locName(148), method: 'friend-safari', species, form, min: 30, max: 30, detail });
      }
  }

  // ---- fixos
  const bases = Object.fromEntries((cfg.bases || []).map((b) => [b, readBase(src, b)]));
  const lists = [];
  for (const name of cfg.statics) {
    const list = readList(src, name, bases);
    lists.push({ name, parsed: list.entries.length, expected: list.expected, commented: list.commented });
    for (const c of list.commented) skipped.push({ list: name, reason: 'comentado no C# do PKHeX', text: c });
    for (const { args, props, islandScan } of list.entries) {
      const versions = cfg.ver[args[0]];
      if (!versions) throw new Error(`${name}: versão ${args[0]} desconhecida`);
      const loc = props.Location ?? 0, egg = props.EggLocation ?? 0;
      if (loc >= 40000 || props.FixedBall === 'Ball.Cherish') {
        skipped.push({ list: name, reason: 'evento (local ≥ 40000 / Cherish Ball)', species: props.Species, location: loc });
        continue;
      }
      let type;
      if (egg !== 0) type = 'egg';
      else if (cfg.starters[loc]?.includes(props.Species)) type = 'starter';
      else if (props.FixedBall != null) type = 'gift'; // recebido já na Poké Ball (FixedBall); sem FixedBall = batalha
      else type = 'static';
      const [form, fd] = formOf(props.Form ?? 0);
      const detail = [islandScan ? 'Island Scan' : null, fd].filter(Boolean).join('; ') || undefined;
      for (const version of versions)
        push(fixed, { version, location: locName(egg !== 0 ? egg : loc), type, species: props.Species, form, level: props.Level, detail });
    }
  }
  for (const name of cfg.trades) {
    const list = readList(src, name, {});
    lists.push({ name, parsed: list.entries.length, expected: list.expected, commented: list.commented });
    for (const { args, props } of list.entries) {
      const versions = cfg.ver[args[2]];
      if (!versions) throw new Error(`${name}: versão ${args[2]} desconhecida`);
      const [form, fd] = formOf(props.Form ?? 0); // EncounterTrade6: Form => 0
      for (const version of versions)
        push(fixed, { version, location: locName(30001), type: 'trade', species: props.Species, form, level: props.Level, detail: ['troca com NPC (cidade não registrada no PKHeX)', fd].filter(Boolean).join('; ') });
    }
  }
  return { wild, fixed, meta: { lists, skipped } };
}
