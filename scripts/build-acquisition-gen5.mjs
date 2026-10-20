// Onde obter (Black 2 / White 2, decomp fuddlesworth/pokebw2) + estágio de progresso → public/data/<jogo>-acquisition.json
// Mesma lógica do Platinum e do Diamond/Pearl, com as fontes do pokebw2 (JSON e scripts em texto):
//   zonas     res/field/zones/<zona>.json (scripts, encontros, lugar PLACE_*, tipo de mapa); CONEXÕES: res/field/matrices/*.json
//             (grade de zonas; células vizinhas diferentes = ligadas); warps: res/field/events/<zona>.json
//   selvagens res/field/encounters/<tabela>.json — por estação (all_year ou spring/summer/autumn/winter) e por versão
//             (objeto black2/white2); src/ov036/enc_pokeset.c: grama, grama escura e grama balançando = 12 slots
//             (20,20,10,10,10,10,5,5,4,4,1,1); surf e água agitada = 60,30,5,4,1; pesca e bolhas = 40,40,15,4,1 (a 1ª linha
//             de cada tabela — as outras só com os poderes do Entralink); enxames data_ov036_021d01fc (zona, espécie, nv);
//             Pokémon do N: N_POKEMON_INFO (zona, espécie, nível)
//   scripts   PokePartyAdd/AddEx (resultado, espécie, forma, nível), PokePartyAddNPoke (resultado, espécie, nível),
//             PokePartyAddEgg, CallWildBattle (espécie, nível), FieldTradeCheck (_, TRADE_X, _) → res/field/trades,
//             TrainerCardAddBadge; presente de item = WorkSet 0x8000, ITEM + RTCallGlobal de um script global que chega a
//             ItemAdd (calculado); ItemAdd direto. Executados por versão (simulateText: GameGetVersion 23 Black 2 / 22 White 2)
//   itens     NPC com script 7000+i → i-ésima entrada de global_7000.s (WorkSetConst 0x800c, ITEM); bg event 8000+i →
//             global_8000.s (WorkSet 0x8000, ITEM); loja de Battle Points: BP_SHOP_ITEMS_TMS / _NORMAL (scrcmd_shop.c)
//   FORA (não estão no decomp em texto): itens das lojas comuns (a "shop dat" do jogo) e os Hidden Grottoes (SLOT_ARC) —
//             os Hidden Grottoes vêm da PokéAPI (cache), rotulados, para não esconder espécies que só saem deles
//   Surf      global 10002 (SCRID_SURF, fieldmap_event.c) testa uma flag de evento, não insígnia → porta = quem dá a HM03
// Uso: node scripts/build-acquisition-gen5.mjs <jogo>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { buildTimeline, placeStage, propagateStages, POSTGAME, teamStage, words } from './lib/progress.mjs';
import { parseTrainerRuns, SECTIONS_WITH_SUBTITLES } from './lib/pokemythology.mjs';
import { loadBw2, loadBw2Field, constList, zoneLabel, simulateText, versionExcludedZones } from './lib/gen5-bw2.mjs';

const gameId = process.argv[2] ?? 'black-2-white-2';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const trainers = JSON.parse(readFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), 'utf8')).trainers;
const VERSIONS = game.versions; // ['black-2', 'white-2']
const VKEY = { 'black-2': 'black2', 'white-2': 'white2' }, VERSION_ID = { 'black-2': 23, 'white-2': 22 };
const g = loadBw2(root);
const F = loadBw2Field(root);
const notIn = versionExcludedZones(root); // zonas de uma versão só (Route 4 do Black 2 × do White 2, Black City × White Forest)
const items = constList(root, 'items');
const monById = new Map(data.pokemon.map((p) => [p.id, p]));
const monOf = (sp) => monById.get(typeof sp === 'number' ? sp : g.speciesId[sp]);
const itemName = (c) => c.replace(/^ITEM_/, '');
const itemConst = (v) => (typeof v === 'number' ? items[v] : typeof v === 'string' && v.startsWith('ITEM_') ? v : null);
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const parseNum = (s) => (/^0x/i.test(s) ? parseInt(s, 16) : Number(s));

// ---- 1) zonas, conexões e warps
const Z = Object.fromEntries(F.zones.map((z) => [z, F.zone(z)]));
const ids = F.zones;
const label = (z) => zoneLabel(z, Z[z]);
const conn = new Map(), warp = new Map();
const link = (m, a, b) => { if (!a || !b || a === b || !Z[a] || !Z[b]) return; (m.get(a) ?? m.set(a, new Set()).get(a)).add(b); (m.get(b) ?? m.set(b, new Set()).get(b)).add(a); };
for (const mx of F.matrices) {
  const grid = mx.zones ?? [];
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < (grid[y]?.length ?? 0); x++) {
    const a = grid[y][x];
    if (!a) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) { const b = grid[y + dy]?.[x + dx]; if (b && b !== a) link(conn, a, b); }
  }
}
for (const z of ids) for (const w of F.events(z)?.warps ?? []) link(warp, z, w.zone);
const scrOwner = new Map();
for (const z of ids) if (Z[z].scripts && !scrOwner.has(Z[z].scripts)) scrOwner.set(Z[z].scripts, z);
const scriptOf = (z) => (Z[z].scripts && scrOwner.get(Z[z].scripts) === z ? F.script(Z[z].scripts) : null);

// ---- 2) selvagens
const SLOT12 = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1], SURF = [60, 30, 5, 4, 1], FISH = [40, 40, 15, 4, 1];
const GROUPS = { grass: ['Grama/caverna', SLOT12, null], dark_grass: ['Grama/caverna', SLOT12, 'grama escura'], shaking_grass: ['Grama/caverna', SLOT12, 'grama balançando (encontro especial)'],
  surf: ['Surf', SURF, null], rippling_surf: ['Surf', SURF, 'água agitada'], fishing: ['Super Rod', FISH, null], rippling_fishing: ['Super Rod', FISH, 'bolhas na água'] };
const SEASON = { spring: 'primavera', summer: 'verão', autumn: 'outono', winter: 'inverno' };
const out = Object.fromEntries(VERSIONS.map((v) => [v, {}]));
const push = (v, sp, src) => { const mon = monOf(sp); if (!mon) return; const list = (out[v][mon.name] ??= []); const k = JSON.stringify(src); if (!list.some((x) => JSON.stringify(x) === k)) list.push(src); };
const wildByMap = {};
const byVersion = (x, v) => (x && !Array.isArray(x) && typeof x === 'object' && VKEY[v] in x ? x[VKEY[v]] : x);
for (const z of ids) {
  const enc = Z[z].encounters;
  const t = enc && F.encounters(enc);
  if (!t) continue;
  const seasons = Object.keys(t).filter((k) => k !== '$schema');
  for (const v of VERSIONS.filter((x) => !notIn[x].has(z))) {
    // agrega por (método, detalhe, espécie) nas estações: nível mín/máx, maior chance e quais estações
    const agg = new Map();
    for (const season of seasons) {
      const tab = t[season];
      const rates = byVersion(tab.rates, v) ?? {};
      for (const [grp, [method, chances, detail]] of Object.entries(GROUPS)) {
        if (!(rates[grp] > 0)) continue;
        const slots = byVersion(tab[grp], v) ?? [];
        const per = {};
        slots.forEach((s, i) => { if (!s || !monOf(s[0])) return; const a = (per[s[0]] ??= { min: s[1], max: s[2], pct: 0 }); a.min = Math.min(a.min, s[1]); a.max = Math.max(a.max, s[2]); a.pct += chances[i] ?? 0; });
        for (const [sp, a] of Object.entries(per)) {
          const k = `${method}|${detail}|${sp}`;
          const cur = agg.get(k) ?? { method, detail, sp, min: a.min, max: a.max, pct: 0, seasons: new Set() };
          cur.min = Math.min(cur.min, a.min); cur.max = Math.max(cur.max, a.max); cur.pct = Math.max(cur.pct, a.pct); cur.seasons.add(season);
          agg.set(k, cur);
        }
      }
    }
    for (const a of agg.values()) {
      const only = seasons.length > 1 && a.seasons.size < seasons.length ? `só ${[...a.seasons].map((s) => SEASON[s]).join(', ')}` : null;
      const detail = [a.detail, only].filter(Boolean).join('; ') || undefined;
      push(v, a.sp, { type: 'wild', where: label(z), mapId: z, method: a.method, min: a.min, max: a.max, pct: Math.max(1, Math.round(a.pct)), ...(detail && { detail }) });
      (wildByMap[z] ??= []).push(a.min);
    }
  }
}
// enxames e Pokémon do N (src/ov036/enc_pokeset.c). Enxame só com FLAG_SWARMS (0x960), a mesma flag que dá a estrela do
// Hall da Fama no cartão de treinador (trcard_sys.c) → pós-jogo
const enc = read('src/ov036/enc_pokeset.c');
for (const m of enc.split('data_ov036_021d01fc[19] = {')[1].split('};')[0].matchAll(/\{(0x[0-9a-f]+|\d+), (\d+), (\d+), (\d+), (\d+)\}/g)) {
  const z = ids[parseNum(m[1])];
  if (z) for (const v of VERSIONS) push(v, Number(m[2]), { type: 'wild', where: label(z), mapId: z, method: 'Grama/caverna', min: Number(m[4]), max: Number(m[5]), pct: 100, swarm: true, postgame: true, detail: 'enxame (aparece em dias sorteados, depois do Hall da Fama)' });
}
for (const m of enc.split('N_POKEMON_INFO[14] = {')[1].split('};')[0].matchAll(/\{(0x[0-9a-f]+|\d+), (\d+), (\d+), (\d+),/g)) {
  const z = ids[parseNum(m[1])];
  if (z) for (const v of VERSIONS) push(v, Number(m[3]), { type: 'static', where: label(z), mapId: z, level: Number(m[4]), detail: 'Pokémon do N (aparece uma vez no mapa)' });
}
// Hidden Grottoes: só na PokéAPI (os slots ficam num arquivo do jogo, fora do decomp em texto)
const grottoes = [];
for (const mon of data.pokemon) {
  const f = new URL(`../.cache/pokemon_${mon.id}_encounters.json`, import.meta.url);
  if (!existsSync(f)) continue;
  for (const a of JSON.parse(readFileSync(f, 'utf8'))) for (const vd of a.version_details) {
    if (!VERSIONS.includes(vd.version.name)) continue;
    const d = vd.encounter_details.filter((e) => e.method.name === 'hidden-grotto');
    if (!d.length) continue;
    const where = a.location_area.name.replace(/-area$/, '').replace(/^unova-/, '').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    const z = ids.find((x) => label(x) === where) ?? null;
    push(vd.version.name, mon.id, { type: 'wild', where, ...(z && { mapId: z }), method: 'Hidden Grotto', min: Math.min(...d.map((e) => e.min_level)), max: Math.max(...d.map((e) => e.max_level)), pct: Math.max(...d.map((e) => e.chance)), detail: 'Hidden Grotto (dado da PokéAPI: os slots não estão no decomp)', source: 'pokeapi' });
    grottoes.push(mon.name);
  }
}

// ---- 3) presentes, ovos, estáticos, trocas, iniciais (scripts executados por versão)
const ITEM_GIVERS = new Set();
for (const r of F.globals) {
  const s = F.script(r.file);
  if (!s) continue;
  s.entries.forEach((lab, k) => {
    const seen = new Set(), q = [lab];
    while (q.length) { const L = q.pop(); if (seen.has(L) || !s.labels.has(L)) continue; seen.add(L); for (const x of s.labels.get(L)) { if (x.cmd === 'ItemAdd') ITEM_GIVERS.add(r.start + k); if (/^VM(Jump|Call)/.test(x.cmd)) q.push(x.args.at(-1)); } }
  });
}
const WATCH = new Set(['PokePartyAdd', 'PokePartyAddEx', 'PokePartyAddNPoke', 'PokePartyAddEgg', 'CallWildBattle', 'FieldTradeCheck', 'TrainerCardAddBadge', 'RTCallGlobal', 'ItemAdd', 'callPoke3Select']);
const runs = {}; // versão → zona → eventos
for (const v of VERSIONS) for (const z of ids) { const s = scriptOf(z); if (s && !notIn[v].has(z)) (runs[v] ??= {})[z] = simulateText(s, VERSION_ID[v], WATCH); }
// NPC ou bg event que chama direto um script GLOBAL (2000+): o global roda como se fosse do mapa — o museu de Nacrene revive
// os fósseis no global 10280 (cada ramo grava a espécie em 0x8023 e o PokePartyAdd a usa)
const globalEntry = (id) => { const r = F.globals.find((x) => id >= x.start && id <= x.end); const s = r && F.script(r.file); return s ? { s, label: s.entries[id - r.start] } : null; };
for (const z of ids) for (const e of [...(F.events(z)?.npcs ?? []), ...(F.events(z)?.bg_events ?? [])]) {
  if (e.script < 2000 || (e.script >= 3000 && e.script < 8800)) continue; // 3000–8799: treinadores e itens
  const ge = globalEntry(e.script);
  if (!ge?.label) continue;
  for (const v of VERSIONS.filter((x) => !notIn[x].has(z))) (runs[v][z] ??= []).push(...simulateText(ge.s, VERSION_ID[v], new Set(['PokePartyAdd', 'PokePartyAddEx', 'CallWildBattle']), 40000, [ge.label]).map((x) => ({ ...x, global: e.script })));
}
const machines = {}, itemsOut = {};
const tm = {};
for (const c of items) { const i = g.tmIndex(c.replace(/^ITEM_/, '')); if (i != null && g.tmMoves[i] != null) tm[c] = moveIdOf.get(g.tmMoves[i]); }
const addSrc = (it, src) => { if (!it) return; if (tm[it]) (machines[tm[it]] ??= []).push(src); else (itemsOut[itemName(it)] ??= []).push(src); };
const leaderOfMap = {};
for (const t of trainers.filter((x) => x.group === 'Líderes de ginásio')) for (const mp of t.map) for (const h of ids.filter((k) => label(k) === mp)) leaderOfMap[h] = t.name;
const badgeOfGym = {};
let starter = null;
for (const v of VERSIONS) for (const [z, evs] of Object.entries(runs[v] ?? {})) {
  const given = new Set();
  for (const e of evs) {
    const [a0, a1, a2, a3] = e.args;
    if (e.cmd === 'PokePartyAdd' || e.cmd === 'PokePartyAddEx') { if (typeof a1 === 'number' && typeof a3 === 'number') push(v, a1, { type: 'gift', where: label(z), mapId: z, level: a3 }); else if (a1 == null && e.vars['0x8025'] != null) starter = { z, level: a3 }; }
    if (e.cmd === 'PokePartyAddNPoke' && typeof a1 === 'number') push(v, a1, { type: 'gift', where: label(z), mapId: z, level: a2 });
    if (e.cmd === 'PokePartyAddEgg' && typeof a1 === 'number') push(v, a1, { type: 'egg', where: label(z), mapId: z });
    if (e.cmd === 'CallWildBattle' && typeof a0 === 'number' && typeof a1 === 'number') push(v, a0, { type: 'static', where: label(z), mapId: z, level: a1 });
    if (e.cmd === 'FieldTradeCheck' && typeof a1 === 'string' && a1.startsWith('TRADE_')) { const t = F.trade(a1); const want = monOf(t.wanted_species); if (want) push(v, t.species, { type: 'trade', where: label(z), mapId: z, want: want.name, detail: `troca por ${want.name}` }); }
    if (e.cmd === 'TrainerCardAddBadge' && typeof a0 === 'number' && leaderOfMap[z]) badgeOfGym[a0] = leaderOfMap[z];
    if (e.cmd === 'RTCallGlobal' && ITEM_GIVERS.has(a0) && v === VERSIONS[0]) given.add(itemConst(e.vars['0x8000']));
    if (e.cmd === 'ItemAdd' && v === VERSIONS[0]) given.add(itemConst(a0));
  }
  for (const it of given) if (it) addSrc(it, { type: 'gift', where: label(z), map: z, by: leaderOfMap[z] ? `líder ${leaderOfMap[z]}` : 'NPC', resolved: true, ...(leaderOfMap[z] && { leader: leaderOfMap[z] }) });
}
// iniciais: a escolha grava EVENT_WORK_0x4030 e a espécie em 0x8025 (as três no script da escolha); o nível vem do PokePartyAdd
const starterSp = [];
for (const z of ids) { const s = scriptOf(z); if (!s) continue; for (const lines of s.labels.values()) lines.forEach((l, i) => { if (l.cmd === 'WorkSetConst' && l.args[0] === 'EVENT_WORK_0x4030') { const sp = lines.slice(i + 1, i + 6).find((x) => x.cmd === 'WorkSetConst' && x.args[0] === '0x8025'); if (sp && !starterSp.includes(parseNum(sp.args[1]))) { starterSp.push(parseNum(sp.args[1])); starter ??= { z, level: null }; starter.z = z; } } }); }
const starterLevel = (() => { const s = scriptOf(starter.z); for (const lines of s.labels.values()) for (const l of lines) if (l.cmd === 'PokePartyAdd' && l.args[1] === '0x8025') return parseNum(l.args[3]); return 5; })();
const starterWhere = `${label(starter.z)} — escolha com a Bianca`;
for (const v of VERSIONS) for (const sp of starterSp) push(v, sp, { type: 'starter', where: starterWhere, level: starterLevel, detail: 'um dos três iniciais (os outros dois só por troca)', stage: 0 });
data.starters = { where: starterWhere, level: starterLevel, species: starterSp.map((n) => monOf(n).name) };

// ---- 4) itens no chão, escondidos e Battle Points
const g7000 = F.script('SCRIPTS_GLOBAL_7000'), g8000 = F.script('SCRIPTS_GLOBAL_8000');
const firstSet = (s, i, v) => s.labels.get(s.entries[i])?.find((x) => /^WorkSet(Const)?$/.test(x.cmd) && x.args[0] === v)?.args[1];
for (const z of ids) {
  const ev = F.events(z);
  for (const o of ev?.npcs ?? []) if (o.script >= 7000 && o.script < 7800) addSrc(itemConst(parseNum(firstSet(g7000, o.script - 7000, '0x800c') ?? 'x')), { type: 'ground', where: label(z), map: z, by: 'item no chão', resolved: true });
  for (const b of ev?.bg_events ?? []) if (b.script >= 8000 && b.script < 8800) addSrc(itemConst(parseNum(firstSet(g8000, b.script - 8000, '0x8000') ?? 'x')), { type: 'hidden', where: label(z), map: z, by: 'escondido', resolved: true });
}
const shop = read('src/ov036/scrcmd_shop.c');
for (const [arr, by] of [['BP_SHOP_ITEMS_TMS', 'troca por Battle Points'], ['BP_SHOP_ITEMS_NORMAL', 'troca por Battle Points']]) {
  for (const m of shop.split(`${arr}[] = {`)[1].split('};')[0].matchAll(/\{\s*(ITEM_\w+),\s*(\d+)\s*\}/g)) addSrc(m[1], { type: 'prize', where: 'Battle Subway (troca por BP)', map: null, by: `${by} (${m[2]} BP)`, resolved: true, postgame: true });
}

// ---- 5) estágio (mesma lógica do Platinum / Diamond/Pearl)
const people = (group) => Object.values(Object.groupBy(trainers.filter((t) => t.group === group && !t.rematch), (t) => t.name)).map((ts) => ({ name: ts[0].name, teams: ts.map((t) => t.party) }));
let wtHtml = readFileSync(new URL(`../data-sources/pokemythology/${game.walkthrough}.html`, import.meta.url), 'utf8');
for (const [w, r] of Object.entries(game.walkthroughTypos ?? {})) wtHtml = wtHtml.replace(new RegExp(w, 'gi'), (m) => (m === m.toUpperCase() ? r.toUpperCase() : r));
const timeline = buildTimeline(wtHtml, people('Líderes de ginásio'), people('Elite dos Quatro'), { blocks: parseTrainerRuns(wtHtml), sectionRe: SECTIONS_WITH_SUBTITLES });
const GENERIC = ['tower', 'cave', 'forest', 'road', 'path', 'gate', 'lake', 'room', 'building', 'pokecenter', 'mart', 'house', 'gym', 'island'];
const titleKnown = new Map(), textKnown = new Map(), detail = {};
for (const h of ids) { const r = placeStage(timeline, label(h), { generic: GENERIC, earliestText: conn.has(h) }); if (!r) continue; (r.by === 'título' ? titleKnown : textKnown).set(h, r.stage); detail[h] = r; }
const facts = {};
timeline.leaderOrder.forEach((name, i) => {
  for (const [gym, l] of Object.entries(leaderOfMap)) if (l === name) {
    facts[gym] ??= { stage: i, why: `ginásio de ${name}` };
    for (const town of [...(warp.get(gym) ?? [])].filter((n) => conn.has(n))) { const cited = titleKnown.get(town) ?? textKnown.get(town); facts[town] ??= { stage: Math.min(cited ?? i, i), why: `cidade do ginásio de ${name}` }; }
  }
});
for (const [id, f] of Object.entries(game.stageFacts ?? {})) facts[id] = f;
for (const [id, f] of Object.entries(facts)) { titleKnown.set(id, f.stage); textKnown.delete(id); detail[id] = { stage: f.stage, by: 'código', why: f.why }; }
const reference = propagateStages(titleKnown, conn, warp);
const known = new Map(titleKnown);
for (const [id, s] of textKnown) {
  const around = [...(conn.get(id) ?? [])].map((n) => reference.get(n)).filter((x) => x !== undefined);
  if (!around.length) { const doors = [...(warp.get(id) ?? [])].map((n) => reference.get(n)).filter((x) => x !== undefined); known.set(id, doors.length ? Math.max(s, Math.min(...doors)) : s); continue; }
  known.set(id, Math.min(Math.max(s, Math.min(...around)), Math.max(...around)));
}
const st = propagateStages(known, conn, warp);
for (const id of ids) {
  if (conn.has(id) || facts[id]) continue;
  const outsides = [...(warp.get(id) ?? [])].filter((n) => conn.has(n) && st.has(n));
  if (new Set(outsides).size >= 2) { const lo = Math.min(...outsides.map((n) => st.get(n))); if (st.get(id) > lo) { st.set(id, lo); detail[id] = { ...(detail[id] ?? {}), passage: outsides.map(label) }; } }
}
for (let p = 0; p < 4; p++) for (const id of ids) {
  if (conn.has(id) || !warp.has(id) || !st.has(id) || facts[id]) continue;
  const outside = [...warp.get(id)].map((n) => st.get(n)).filter((x) => x !== undefined);
  if (outside.length) st.set(id, Math.max(st.get(id), Math.min(...outside)));
}
if (process.env.WHY) for (const id of process.env.WHY.split(',')) console.log('WHY', id, JSON.stringify(detail[id] ?? null), 'st', st.get(id), 'conn', [...(conn.get(id) ?? [])].join('/'), 'warp', [...(warp.get(id) ?? [])].join('/'));
const leaderStage = (name) => { const i = timeline.leaderOrder.indexOf(name); return i >= 0 ? i + 1 : null; };
const areaLevel = (h0) => {
  if (!h0) return null;
  let frontier = [h0]; const seen = new Set([h0]);
  for (let d = 0; d <= 2; d++) {
    const lv = frontier.flatMap((c) => wildByMap[c] ?? []);
    if (lv.length) return { level: Math.min(...lv), near: [...new Set(frontier.filter((c) => wildByMap[c]).map(label))].join(', ') };
    frontier = frontier.flatMap((c) => [...(conn.get(c) ?? []), ...(warp.get(c) ?? [])]).filter((c) => !seen.has(c) && seen.add(c));
  }
  return null;
};
const itemMention = (it) => { const w = words(itemName(it).replace(/_/g, ' ')); if (w.join('').length < 6) return null; return timeline.chunks.find((c) => (' ' + c.text.join(' ') + ' ').includes(' ' + w.join(' ') + ' '))?.stage ?? null; };
for (const [k, list] of [...Object.entries(machines).map(([, l]) => [null, l]), ...Object.entries(itemsOut)]) for (const s of list) {
  s.level = areaLevel(s.map)?.level ?? null;
  s.stage = s.postgame ? POSTGAME : Math.max(s.leader && leaderStage(s.leader) ? leaderStage(s.leader) : 0, st.get(s.map) ?? 0);
  delete s.postgame;
  if (s.type === 'gift' && k && !s.leader) { const f = itemMention(k); if (f != null && f > s.stage) { s.stage = f; s.stageBy = 'citação do item no detonado'; } }
}
const giverOf = (it) => [...(itemsOut[itemName(it)] ?? []), ...(machines[tm[it]] ?? [])].find((s) => s.type === 'gift');
const gates = {};
for (const [method, it] of [['Surf', 'ITEM_HM03'], ['Super Rod', 'ITEM_SUPER_ROD']]) {
  const giver = giverOf(it);
  gates[method] = giver ? { level: areaLevel(giver.map)?.level ?? 1, item: giver.where, stage: giver.stage ?? st.get(giver.map) ?? null } : { level: 1, item: null, stage: POSTGAME };
}
const firstMention = (sp) => timeline.chunks.find((c) => c.text.includes(sp.replace(/-/g, '')))?.stage ?? null;
for (const v of VERSIONS) for (const [sp, list] of Object.entries(out[v])) for (const s of list) {
  if (s.stage === undefined) s.stage = s.mapId ? st.get(s.mapId) ?? null : null;
  if (s.postgame) { s.stage = POSTGAME; delete s.postgame; }
  if (['gift', 'static', 'egg'].includes(s.type) && s.stage != null) { const f = firstMention(sp); if (f != null && f > s.stage) { s.stage = f; s.stageBy = 'citação da espécie no detonado'; } }
  if (s.type === 'wild' && gates[s.method]) { s.gate = gates[s.method]; s.stage = Math.max(s.stage ?? 0, gates[s.method].stage ?? 0); }
  if (s.mapId) { const a = areaLevel(s.mapId); if (a) s.area = a; }
}
for (const list of [...Object.values(machines), ...Object.values(itemsOut)]) list.sort((a, b) => (a.stage ?? 9) - (b.stage ?? 9));
const trainerStage = {};
for (const t of trainers.filter((x) => ['Líderes de ginásio', 'Elite dos Quatro', 'Campeão', 'Rival'].includes(x.group))) { const s0 = teamStage(timeline, t.party); if (s0 != null) trainerStage[t.key] = s0; }

// ---- 6) obtível
const USABLE = new Set(['wild', 'gift', 'static', 'trade', 'starter', 'egg', 'roamer']);
const changes = [];
for (const v of VERSIONS) {
  const memo = new Map();
  const can = (mon) => {
    if (memo.has(mon.name)) return memo.get(mon.name);
    memo.set(mon.name, false);
    const parent = monById.get(mon.evolvesFrom);
    const ok = (out[v][mon.name] ?? []).some((s) => USABLE.has(s.type)) || (!!parent && mon.evo?.possible !== false && can(parent));
    memo.set(mon.name, ok);
    return ok;
  };
  for (const mon of data.pokemon) { const now = can(mon); if (mon.obtainable[v] !== now) changes.push(`${mon.name}.${v}: ${mon.obtainable[v]} → ${now}`); mon.obtainable[v] = now; }
}
writeFileSync(dataFile, JSON.stringify(data));
const progress = {
  trainerStage,
  badges: Array.from({ length: 8 }, (_, i) => ({ n: i + 1, name: String(i + 1), leader: badgeOfGym[i] ?? null })),
  source: `PokeMythology ${game.walkthrough} + matrizes/warps do decomp`, leaderOrder: timeline.leaderOrder, leadersFound: timeline.leadersFound, eliteFound: timeline.eliteFound,
  mapsWithStage: st.size, mapsTotal: ids.length,
  maps: Object.fromEntries(ids.map((h) => [h, { folder: h, label: label(h), stage: st.get(h) ?? null, landmark: Z[h].place ?? null, env: Z[h].map_type ?? null }])),
  reviewEarlierMention: Object.entries(detail).filter(([, r]) => r.earlierMention).map(([id, r]) => ({ map: label(id), stage: r.stage, earlier: r.earlierMention })),
};
writeFileSync(new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, versions: out, machines, tutors: {}, items: itemsOut, progress }));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/obtainable-changes.json`, import.meta.url), JSON.stringify(changes, null, 1));
const tmTotal = Object.keys(tm).length, tmWith = Object.keys(tm).filter((it) => machines[tm[it]]?.length).length;
console.log(`[${gameId}] líderes: ${timeline.leaderOrder.join(' > ')} (${timeline.leadersFound}; Elite ${timeline.eliteFound}/4); mapas com estágio ${st.size}/${ids.length}; conexões ${conn.size}; iniciais ${data.starters.species.join(', ')} (nv ${starterLevel}, ${starterWhere})`);
console.log(`  scripts globais que dão item: ${[...ITEM_GIVERS].sort().join(', ')}; Hidden Grotto (PokéAPI): ${new Set(grottoes).size} espécies`);
console.log(`  TM/HM com origem: ${tmWith}/${tmTotal}${tmWith < tmTotal ? ' — sem: ' + Object.keys(tm).filter((it) => !machines[tm[it]]?.length).join(', ') : ''}`);
for (const v of VERSIONS) console.log(`  ${v}: ${data.pokemon.filter((p) => p.obtainable[v]).length} obtíveis; ${Object.keys(out[v]).length} com fonte direta`);
console.log(`  portas: ${Object.entries(gates).map(([k, x]) => `${k} → ${x.item} (estágio ${x.stage})`).join('; ')}`);
console.log(`  mudanças de "obtível" (vs PokéAPI): ${changes.length}${changes.length ? ' ex.: ' + changes.slice(0, 20).join(', ') : ''}`);
