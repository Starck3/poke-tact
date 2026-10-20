// Parser do decomp de Black 2 / White 2 (fuddlesworth/pokebw2) — dados em JSON e scripts em texto, no esquema do
// pokeplatinum (docs/data.md e docs/scripts.md do próprio repositório). Sem rede.
//   generated/{species,moves,items,zones,trainers,encounters,places,trades,types}.txt  ordem = id ("X = 0" na 1ª linha)
//   res/pokemon/<espécie>/data.json  base_stats, types, abilities + hidden_ability, learnset.by_level (ORDEM do jogo), by_tm
//                                    ("TM06"/"HM01"), by_tutor, egg_moves, evolutions [{ method, param, species }]
//   res/moves/<golpe>/data.json      type, category (MOVE_CATEGORY_*), power, accuracy, pp, priority
//   src/system/pml_item.c            TM_MOVE_LIST: TM01–TM92, HM01–HM06, TM93–TM95
//   src/ov167/btl_calc.c             data_ov167_021d7500[17][17]: dano do tipo atacante × defensor em metades (0/2/4/8)
//   res/field/zones/<zona>.json      scripts, encontros, lugar (PLACE_*), mapa; events/<zona>.json; encounters/<tabela>.json
//   res/field/scripts/<arquivo>.s    scripts em texto (ScriptEntry …; comandos com nomes do swan)
//   src/ov012/script_sys.c           faixas de id de script globais (início, fim, arquivo); mapa: id − 1;
//   src/ov012/trainer_script.c       treinador: script − 3000 (simples) / − 5000 (dupla)
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const title = (s) => s.toLowerCase().replace(/(^|[\s.&-])([a-zé])/g, (m, a, b) => a + b.toUpperCase());
export const T = (t) => t.replace(/^TYPE_/, '').toLowerCase();
// evolução → vocabulário do motor
const EVO = {
  EVO_METHOD_LEVEL: 'LEVEL', EVO_METHOD_LEVEL_FEMALE: 'LEVEL', EVO_METHOD_LEVEL_MALE: 'LEVEL', EVO_METHOD_LEVEL_PERSONALITY_LOW: 'LEVEL',
  EVO_METHOD_LEVEL_PERSONALITY_HIGH: 'LEVEL', EVO_METHOD_SHEDINJA: 'LEVEL', EVO_METHOD_SHEDINJA_MADE: 'LEVEL',
  EVO_METHOD_LEVEL_ATK_GT_DEF: 'LEVEL_ATK_GT_DEF', EVO_METHOD_LEVEL_ATK_LT_DEF: 'LEVEL_ATK_LT_DEF', EVO_METHOD_LEVEL_ATK_EQ_DEF: 'LEVEL_ATK_EQ_DEF',
  EVO_METHOD_FRIENDSHIP: 'FRIENDSHIP', EVO_METHOD_FRIENDSHIP_DAY: 'FRIENDSHIP_DAY', EVO_METHOD_FRIENDSHIP_NIGHT: 'FRIENDSHIP_NIGHT',
  EVO_METHOD_ITEM: 'ITEM', EVO_METHOD_ITEM_MALE: 'ITEM', EVO_METHOD_ITEM_FEMALE: 'ITEM', EVO_METHOD_TRADE: 'TRADE',
  EVO_METHOD_TRADE_WITH_ITEM: 'TRADE_ITEM', EVO_METHOD_TRADE_WITH_SPECIES: 'TRADE_SPECIES', EVO_METHOD_BEAUTY: 'BEAUTY',
  EVO_METHOD_KNOWS_MOVE: 'KNOW_MOVE', EVO_METHOD_HELD_ITEM_DAY: 'HELD_ITEM_DAY', EVO_METHOD_HELD_ITEM_NIGHT: 'HELD_ITEM_NIGHT',
  EVO_METHOD_SPECIES_IN_PARTY: 'PARTY', EVO_METHOD_LEVEL_MOSS_ROCK: 'LOCATION', EVO_METHOD_LEVEL_ICE_ROCK: 'LOCATION',
  EVO_METHOD_LEVEL_MAGNETIC_FIELD: 'LOCATION',
};

/** Lista de constantes de generated/<nome>.txt → [constante, …] na ordem dos ids. */
export function constList(rootUrl, name) {
  return readFileSync(new URL(`generated/${name}.txt`, rootUrl), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s*=\s*/)[0]);
}

/** Rótulo de um lugar/zona: PLACE_ROUTE_19 → "Route 19"; ZONE_ASPERTIA_CITY_GYM → "Aspertia City Gym". */
export const placeLabel = (c) => title(c.replace(/^(PLACE|ZONE)_/, '').replace(/_/g, ' ')).replace(/\bPokemon\b/g, 'Pokémon').replace(/\b(\d+)f\b/gi, '$1F').replace(/\bB(\d+)f\b/gi, 'B$1F').replace(/\bPwt\b/, 'PWT').replace(/\bPokestar\b/, 'Pokéstar');

/** Rótulo de uma zona: a de nome próprio ("Aspertia City Gym"); as cópias numeradas de um lugar (ZONE_BLACK_CITY_2) levam o
 *  nome do lugar (zone.place). */
export const zoneLabel = (z, zone) => (/_\d+$/.test(z) && zone?.place ? placeLabel(zone.place) : placeLabel(z));

export function loadBw2(rootUrl) {
  const read = (p) => readFileSync(new URL(p, rootUrl), 'utf8');
  const json = (p) => JSON.parse(read(p));
  const dirOf = (c, pre) => c.replace(new RegExp(`^${pre}_`), '').toLowerCase();
  const speciesList = constList(rootUrl, 'species'), moveList = constList(rootUrl, 'moves');
  const speciesId = Object.fromEntries(speciesList.map((c, i) => [c, i]));
  const moveId = Object.fromEntries(moveList.map((c, i) => [c, i]));
  // TM_MOVE_LIST: TM01–TM92, HM01–HM06, TM93–TM95
  const tmSrc = read('src/system/pml_item.c').split('TM_MOVE_LIST[] = {')[1].split('};')[0];
  const tmMoves = [...tmSrc.matchAll(/MOVE_\w+/g)].map((m) => moveId[m[0]]);
  const tmIndex = (t) => { const m = t.match(/^(TM|HM)(\d+)$/); if (!m) return null; const n = Number(m[2]); return m[1] === 'HM' ? 92 + n - 1 : n <= 92 ? n - 1 : 98 + n - 93; };
  const moves = {};
  moveList.forEach((c, id) => {
    const f = new URL(`res/moves/${dirOf(c, 'MOVE')}/data.json`, rootUrl);
    if (!id || !existsSync(f)) return;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    moves[id] = { name: c, type: T(j.type), category: j.category.replace('MOVE_CATEGORY_', '').toLowerCase(), power: j.power, accuracy: j.accuracy, pp: j.pp, priority: j.priority };
  });
  // tabela de tipos: [atacante][defensor] em metades — 0 imune, 2 ½×, 4 1×, 8 2× (GetTypeEffectiveness)
  const types = constList(rootUrl, 'types').filter((t) => t !== 'TYPE_NULL').map(T);
  const rows = [...read('src/ov167/btl_calc.c').split('data_ov167_021d7500[17][17] = {')[1].split('};')[0].matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].split(',').map((x) => Number(x.trim())));
  if (rows.length !== 17) throw new Error('tabela de tipos: 17 linhas esperadas');
  const chart = Object.fromEntries(types.map((a, i) => [a, Object.fromEntries(types.map((d, k) => [d, rows[i][k] / 4]))]));
  const species = {};
  speciesList.forEach((c, id) => {
    if (!id || id > 649) return;
    const j = json(`res/pokemon/${dirOf(c, 'SPECIES')}/data.json`);
    const b = j.base_stats, l = j.learnset ?? {};
    const ab = (a) => a.replace('ABILITY_', '').toLowerCase().replace(/_/g, '-');
    species[id] = {
      const: c, stats: { hp: b.hp, attack: b.attack, defense: b.defense, speed: b.speed, 'special-attack': b.special_attack, 'special-defense': b.special_defense },
      types: [...new Set(j.types.map(T))],
      abilities: [...new Set([...j.abilities, j.hidden_ability].filter((a) => a && a !== 'ABILITY_NONE').map(ab))],
      levelOrdered: (l.by_level ?? []).map(([lv, mv]) => [lv, moveId[mv]]),
      machine: new Set((l.by_tm ?? []).map((t) => tmMoves[tmIndex(t)]).filter((x) => x != null)),
      tutor: new Set((l.by_tutor ?? []).map((m) => moveId[m]).filter((x) => x != null)),
      egg: new Set((l.egg_moves ?? []).map((m) => moveId[m]).filter((x) => x != null)),
      evo: (j.evolutions ?? []).map((e) => ({ kind: EVO[e.method] ?? e.method, raw: e.method, param: e.param, to: e.species })),
    };
  });
  // tutores ensinados por PLUGIN de script (bytes no decomp): docs/scripts.md, plugin 16 = "Meloetta's Relic Song and the
  // Swords of Justice" → Relic Song e Secret Sword não estão no by_tutor; vêm da PokéAPI
  const pluginTutors = new Set(['MOVE_RELIC_SONG', 'MOVE_SECRET_SWORD'].map((m) => moveId[m]));
  return { speciesId, moveId, speciesList, moveList, moves, chart, species, tmMoves, tmIndex, types, pluginTutors };
}

// ---- campo: zonas, eventos, encontros, scripts
/** Faixas de script globais de src/ov012/script_sys.c: { início, fim, arquivo SCRIPTS_* }. */
export function globalRanges(rootUrl) {
  const src = readFileSync(new URL('src/ov012/script_sys.c', rootUrl), 'utf8');
  return [...src.matchAll(/\{\s*(\d+),\s*(\d+),\s*(SCRIPTS_\w+),/g)].map((m) => ({ start: Number(m[1]), end: Number(m[2]), file: m[3] }));
}

/** Script em texto: { entries: [rótulo], labels: Map(rótulo → [linhas]) } — linhas = { cmd, args: [string] }. */
export function parseScriptText(text) {
  const entries = [...text.matchAll(/^\s*ScriptEntry (\w+)/gm)].map((m) => m[1]);
  const labels = new Map();
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '');
    const lab = line.match(/^(\w+):\s*$/);
    if (lab) { cur = lab[1]; labels.set(cur, []); continue; }
    const m = line.match(/^\s+([A-Za-z_]\w*)\s*(.*)$/);
    if (m && cur) labels.get(cur).push({ cmd: m[1], args: m[2] ? m[2].split(',').map((s) => s.trim()) : [] });
  }
  return { entries, labels };
}

/**
 * Executa um script em texto com a versão fixada (GameGetVersion → 23 Black 2 / 22 White 2, include/constants/version.h),
 * acompanhando WorkSet/WorkSetConst, a pilha (VMStackPush/PushConst/Cmp) e WorkCmpConst. Desvio de condição conhecida segue um
 * lado; desconhecida (flags, escolhas), os dois. 🧪 VMJumpIf CMP_STACK salta quando o valor tirado da pilha NÃO é 1
 * (s001F_VMJumpIf), ao contrário do comentário do cabeçalho. Devolve os comandos de `watch` alcançados com os argumentos
 * resolvidos (número; variável conhecida → valor; desconhecida → null; constante → o texto) e as variáveis conhecidas naquele
 * ponto (chave em minúsculas, "0x8000"): [{ cmd, label, args, vars }].
 */
// comandos que só LEEM variáveis (ou que o simulador trata): os outros podem escrevê-las
const MODELED = new Set(['WorkSet', 'WorkSetConst', 'GameGetVersion', 'VMStackPush', 'VMStackPushConst', 'VMStackPushFlag', 'VMStackCmp', 'WorkCmpConst', 'WorkCmpWk',
  'VMEnd', 'VMHalt', 'VMReturn', 'VMJump', 'VMCall', 'VMJumpIf', 'VMCallIf', 'RTCallGlobal', 'CallWildBattle', 'CallTrainerBattle', 'CallTrainerMultiBattle',
  'PokePartyAdd', 'PokePartyAddEx', 'PokePartyAddNPoke', 'PokePartyAddEgg', 'WordSetPokeSpecies', 'WordSetItemName', 'TrainerCardAddBadge']);
const CMP = { CMP_LT: (a, b) => a < b, CMP_EQ: (a, b) => a === b, CMP_GT: (a, b) => a > b, CMP_LE: (a, b) => a <= b, CMP_GE: (a, b) => a >= b, CMP_NE: (a, b) => a !== b };
export function simulateText(parsed, version, watch, maxSteps = 40000, entries = parsed.entries) {
  const order = [...parsed.labels.keys()];
  const next = new Map(order.map((l, i) => [l, order[i + 1]]));
  const out = [], seen = new Set();
  const isVarName = (a) => /^(0x[48][0-9a-f]{3}|EVENT_WORK_0x[0-9a-f]+)$/i.test(a);
  const varKey = (a) => (a.startsWith('EVENT_WORK_') ? a.slice(11) : a).toLowerCase();
  const value = (vars, a) => (a == null ? null : isVarName(a) ? (vars.has(varKey(a)) ? vars.get(varKey(a)) : null) : /^-?\d+$/.test(a) ? Number(a) : /^0x[0-9a-f]+$/i.test(a) ? parseInt(a, 16) : a);
  // cada ponto de entrada tem o seu orçamento de passos (um script pesado não esgota o dos outros: o presente da HM03 na
  // Route 6 só aparecia com 10× mais passos quando o orçamento era do arquivo inteiro)
  for (const entry of entries) {
  const queue = [{ label: entry, i: 0, vars: new Map(), stack: [], cmp: null, calls: [] }];
  let steps = 0;
  while (queue.length && steps < maxSteps) {
    const s = queue.pop();
    for (;;) {
      const lines = parsed.labels.get(s.label);
      if (!lines || ++steps > maxSteps) break;
      if (s.i >= lines.length) { const n = next.get(s.label); if (!n) break; s.label = n; s.i = 0; continue; }
      const key = `${s.label}:${s.i}|${[...s.vars].sort().join(',')}|${s.stack.join(',')}|${s.cmp}|${s.calls.map((c) => c.label + c.i).join('.')}`;
      if (seen.has(key)) break;
      seen.add(key);
      const { cmd, args } = lines[s.i++];
      if (watch.has(cmd)) out.push({ cmd, label: s.label, args: args.map((a) => value(s.vars, a)), vars: Object.fromEntries(s.vars) });
      if (cmd === 'WorkSet' || cmd === 'WorkSetConst') { const v = value(s.vars, args[1]); if (typeof v === 'number') s.vars.set(varKey(args[0]), v); else s.vars.delete(varKey(args[0])); }
      else if (cmd === 'GameGetVersion') s.vars.set(varKey(args[0]), version);
      else if (cmd === 'VMStackPush' || cmd === 'VMStackPushConst') s.stack.push(value(s.vars, args[0]));
      else if (cmd === 'VMStackCmp') { const b = s.stack.pop(), a = s.stack.pop(); s.stack.push(a == null || b == null || !CMP[args[0]] ? null : CMP[args[0]](a, b) ? 1 : 0); }
      else if (cmd === 'WorkCmpConst' || cmd === 'WorkCmpWk') { const a = value(s.vars, args[0]), b = value(s.vars, args[1]); s.cmp = a == null || b == null ? null : a < b ? 0 : a === b ? 1 : 2; }
      else if (cmd === 'VMStackPushFlag') s.stack.push(null); // flag do save: desconhecida
      else if (cmd === 'VMEnd' || cmd === 'VMHalt') break;
      else if (cmd === 'VMReturn') { const r = s.calls.pop(); if (!r) break; s.label = r.label; s.i = r.i; }
      else if (cmd === 'VMJump') { s.label = args[0]; s.i = 0; }
      else if (cmd === 'VMCall') { s.calls.push({ label: s.label, i: s.i }); s.label = args[0]; s.i = 0; }
      else if (cmd === 'VMJumpIf' || cmd === 'VMCallIf') {
        let take;
        if (args[0] === 'CMP_STACK') { const v = s.stack.pop(); take = v == null ? null : v !== 1; }
        else { const f = CMP[args[0]]; take = s.cmp == null || !f ? null : f(s.cmp, 1); }
        const jump = (t) => (cmd === 'VMCallIf' ? { ...t, calls: [...t.calls, { label: t.label, i: t.i }], label: args[1], i: 0 } : { ...t, label: args[1], i: 0 });
        if (take === true) Object.assign(s, jump({ ...s, calls: [...s.calls] }));
        else if (take === null) queue.push(jump({ label: s.label, i: s.i, vars: new Map(s.vars), stack: [...s.stack], cmp: s.cmp, calls: [...s.calls] }));
      }
      // comando não modelado que recebe variáveis pode ESCREVER nelas (YesNoWin 0x8010, CallPokeSelect 0x8021…): esquecê-las.
      // Sem isso o simulador mantinha o valor antigo e seguia sempre o mesmo ramo (a troca do Petilil nunca era alcançada)
      else if (!MODELED.has(cmd)) for (const a of args) if (isVarName(a)) s.vars.delete(varKey(a));
    }
  }
  }
  return out;
}

/**
 * Zonas de uma versão só: src/system/zonedata.c VERSION_SPECIFIC_ZONES = pares { a zona, a que a substitui }, e só o White 2
 * liga a troca na inicialização ("#ifdef WHITE2 SetAllowVersionSpecificZone(0..2, TRUE)"). Então o 1º de cada par é do
 * Black 2 e o 2º do White 2: Black City × White Forest, os portões, e a Route 4 (Mandibuzz) × Route 4_16 (Braviary).
 * Devolve { 'black-2': Set(zonas que NÃO existem no Black 2), 'white-2': Set(… no White 2) }.
 */
export function versionExcludedZones(rootUrl) {
  const src = readFileSync(new URL('src/system/zonedata.c', rootUrl), 'utf8');
  const pairs = [...src.split('VERSION_SPECIFIC_ZONES[VERSION_SPECIFIC_COUNT] = {')[1].split('};')[0].matchAll(/\{\s*(ZONE_\w+),\s*(ZONE_\w+)\s*\}/g)].map((m) => [m[1], m[2]]);
  if (!/#ifdef WHITE2\s+SetAllowVersionSpecificZone\(0, TRUE\);\s+SetAllowVersionSpecificZone\(1, TRUE\);\s+SetAllowVersionSpecificZone\(2, TRUE\);/.test(src)) throw new Error('zonedata.c: troca de zonas por versão mudou');
  return { 'black-2': new Set(pairs.map((p) => p[1])), 'white-2': new Set(pairs.map((p) => p[0])) };
}

export function loadBw2Field(rootUrl) {
  const read = (p) => readFileSync(new URL(p, rootUrl), 'utf8');
  const zones = constList(rootUrl, 'zones');
  const zone = (z) => JSON.parse(read(`res/field/zones/${z.replace(/^ZONE_/, '').toLowerCase()}.json`));
  const fileOf = (c, dir) => new URL(`res/field/${dir}/${c.toLowerCase()}`, rootUrl);
  const events = (z) => { const f = fileOf(z.replace(/^ZONE_/, '') + '.json', 'events'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
  const encounters = (c) => { const f = fileOf(c.replace(/^ENCOUNTERS_/, '') + '.json', 'encounters'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
  const scriptCache = new Map();
  const script = (c) => {
    if (!c) return null;
    if (!scriptCache.has(c)) { const f = fileOf(c.replace(/^SCRIPTS_/, '') + '.s', 'scripts'); scriptCache.set(c, existsSync(f) ? parseScriptText(readFileSync(f, 'utf8')) : null); }
    return scriptCache.get(c);
  };
  const trade = (c) => JSON.parse(read(`res/field/trades/${c.replace(/^TRADE_/, '').toLowerCase()}.json`));
  const matrices = readdirSync(new URL('res/field/matrices/', rootUrl)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(read(`res/field/matrices/${f}`)));
  return { zones, zone, events, encounters, script, trade, matrices, globals: globalRanges(rootUrl) };
}
