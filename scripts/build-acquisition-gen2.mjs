// Onde obter cada espécie/TM/item na Gen 2 + estágio de progresso → public/data/<jogo>-acquisition.json (formato da Gen 1/3)
// Fontes (decomp em assembly; ver docs/ADICIONAR-JOGO.md, seção Gen 2):
//   mapas      data/maps/attributes.asm (map_attributes Arquivo, CONST + connection …), data/maps/maps.asm (landmark,
//              grupo de pesca), maps/<Arquivo>.asm (warp_event, scripts)
//   selvagens  data/wild/{johto,kanto}_{grass,water}.asm: grama manhã/dia/noite × 7 slots (30,30,20,10,5,4,1%), água 3 slots
//              (60,30,10%) — tabelas em data/wild/probabilities.asm; enxames (swarm_*), Bug Contest (bug_contest_mons.asm)
//   pesca      grupo do mapa (maps.asm FISHGROUP_*) → data/wild/fish.asm (chance acumulada; "time_group N" = dia/noite)
//              só em mapas com tabela de água (onde há água para pescar — conservador)
//   Headbutt / Rock Smash  data/wild/treemon_maps.asm + treemons.asm (TREEMON_SET_ROCK = Rock Smash)
//   vagantes   engine/overworld/wildmons.asm (InitRoamMons: espécie + nível)
//   scripts    givepoke (presente; com "takecoins" perto = prêmio do Game Corner), giveegg (ovo), loadwildmon (encontro
//              único), trade NPC_TRADE_X (data/events/npc_trades.asm), itemball / hiddenitem / verbosegiveitem / giveitem,
//              pokemart MARTTYPE_*, MART_X (data/items/marts.asm)
//   HMs        engine/events/overworld.asm (.TrySurf → ld de, ENGINE_FOGBADGE); insígnia → líder pelo "setflag ENGINE_XBADGE"
//   estágio    detonado (parseTrainerRuns + subtítulos) + conexões/warps + fatos do código (spawn inicial, checagem de insígnia)
// Uso: node scripts/build-acquisition-gen2.mjs <jogo>
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadGen2 } from './lib/gen2-asm.mjs';
import { resolveIfdef, mapLabel } from './lib/gen1-asm.mjs';
import { buildTimeline, placeStage, propagateStages, POSTGAME, teamStage } from './lib/progress.mjs';
import { parseTrainerRuns, SECTIONS_WITH_SUBTITLES } from './lib/pokemythology.mjs';

const gameId = process.argv[2] ?? 'crystal';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const has = (p) => existsSync(new URL(p, root));
const g = loadGen2(root);
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const trainers = JSON.parse(readFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), 'utf8')).trainers;
const VERSIONS = game.versions;
const DEF = (v) => new Set([`_${v.toUpperCase()}`]);
const monOf = (c) => data.pokemon.find((p) => p.id === g.speciesId[c]);
const isSpecies = (c) => g.speciesId[c] != null;
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const num = (s) => (String(s).startsWith('$') ? parseInt(s.slice(1), 16) : Number(s));

// ---- 1) mapas
const fileOf = {}, constOf = {}, conn = new Map(), warp = new Map(), landmarkOf = {}, fishOf = {}, envOf = {};
const link = (m, a, b) => { (m.get(a) ?? m.set(a, new Set()).get(a)).add(b); (m.get(b) ?? m.set(b, new Set()).get(b)).add(a); };
let curMap = null;
for (const line of read('data/maps/attributes.asm').split('\n')) {
  const a = line.match(/^\s*map_attributes\s+(\w+),\s*(\w+)/);
  if (a) { curMap = a[2]; fileOf[a[2]] = a[1]; constOf[a[1]] = a[2]; continue; }
  const c = line.match(/^\s*connection\s+\w+,\s*\w+,\s*(\w+)/);
  if (c && curMap) link(conn, curMap, c[1]);
}
// campos por vírgula: a música pode ser "RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY" (a Radio Tower ficava sem landmark)
for (const m of read('data/maps/maps.asm').matchAll(/^\s*map\s+(\w+),\s*\w+,\s*(\w+),\s*(LANDMARK_\w+),[^,\n]+,[^,\n]+,[^,\n]+,\s*(FISHGROUP_\w+)/gm)) {
  const c = constOf[m[1]];
  if (!c) continue;
  envOf[c] = m[2]; landmarkOf[c] = m[3]; fishOf[c] = m[4];
}
const scriptOf = (c) => (fileOf[c] && has(`maps/${fileOf[c]}.asm`) ? read(`maps/${fileOf[c]}.asm`) : '');
for (const c of Object.keys(fileOf)) for (const w of scriptOf(c).matchAll(/warp_event\s+-?\d+,\s*-?\d+,\s*(\w+),\s*\d+/g)) if (fileOf[w[1]]) link(warp, c, w[1]);
const label = (c) => mapLabel(fileOf[c] ?? c);

// ---- 2) selvagens
const probs = (tbl) => [...read('data/wild/probabilities.asm').split(tbl)[1].split('assert_table_length')[0].matchAll(/;\s*(\d+)% chance/g)].map((m) => Number(m[1]));
const grassPct = probs('GrassMonProbTable:'), waterPct = probs('WaterMonProbTable:');
const TIMES = ['manhã', 'dia', 'noite'];
const out = Object.fromEntries(VERSIONS.map((v) => [v, {}]));
const push = (v, sp, src) => { const mon = monOf(sp); if (mon) (out[v][mon.name] ??= []).push(src); };
const wildByMap = Object.fromEntries(VERSIONS.map((v) => [v, {}]));
const addWild = (v, map, method, perTime, extra = {}) => {
  // perTime: { manhã: {SP: {min,max,pct}}, … } → uma fonte por espécie; pct = média dos 3 horários; times = onde aparece
  const species = new Set(Object.values(perTime).flatMap((t) => Object.keys(t)));
  for (const sp of species) {
    const ts = Object.keys(perTime).filter((t) => perTime[t][sp]);
    const all = ts.map((t) => perTime[t][sp]);
    const pct = Math.round(Object.keys(perTime).reduce((a, t) => a + (perTime[t][sp]?.pct ?? 0), 0) / Object.keys(perTime).length);
    push(v, sp, { type: 'wild', where: label(map), mapId: map, method, min: Math.min(...all.map((x) => x.min)), max: Math.max(...all.map((x) => x.max)), pct: Math.max(pct, 1),
      ...(ts.length < Object.keys(perTime).length && { times: ts }), ...extra });
    (wildByMap[v][map] ??= []).push(Math.min(...all.map((x) => x.min)));
  }
};
const slotAgg = (slots, pcts) => { const a = {}; slots.forEach((s, i) => { const x = (a[s.sp] ??= { min: s.level, max: s.level, pct: 0 }); x.min = Math.min(x.min, s.level); x.max = Math.max(x.max, s.level); x.pct += pcts[i]; }); return a; };
const dbSlots = (t) => [...t.matchAll(/^\s*db\s+(\d+),\s*(\w+)\s*$/gm)].map((m) => ({ level: Number(m[1]), sp: m[2] }));
for (const v of VERSIONS) {
  for (const f of ['johto_grass', 'kanto_grass', 'swarm_grass']) {
    if (!has(`data/wild/${f}.asm`)) continue;
    const text = resolveIfdef(read(`data/wild/${f}.asm`), DEF(v));
    const swarm = f.startsWith('swarm');
    for (const m of text.matchAll(/(?:def_grass_wildmons|map_id)\s+(\w+)\s*\n([\s\S]*?)end_grass_wildmons/g)) {
      const parts = m[2].split(/;\s*(?:morn|day|nite)\s*\n/).slice(1);
      if (parts.length !== 3) continue;
      const perTime = Object.fromEntries(parts.map((p, i) => [TIMES[i], slotAgg(dbSlots(p).slice(0, 7), grassPct)]));
      addWild(v, m[1], 'Grama/caverna', perTime, swarm ? { swarm: true, detail: 'enxame (aviso por telefone)' } : {});
    }
  }
  for (const f of ['johto_water', 'kanto_water', 'swarm_water']) {
    if (!has(`data/wild/${f}.asm`)) continue;
    const text = resolveIfdef(read(`data/wild/${f}.asm`), DEF(v));
    for (const m of text.matchAll(/(?:def_water_wildmons|map_id)\s+(\w+)\s*\n([\s\S]*?)end_water_wildmons/g)) {
      addWild(v, m[1], 'Surf', { dia: slotAgg(dbSlots(m[2]).slice(0, 3), waterPct) }, f.startsWith('swarm') ? { swarm: true, detail: 'enxame (aviso por telefone)' } : {});
    }
  }
}
const waterMaps = new Set(Object.values(out).flatMap((sp) => Object.values(sp).flat()).filter((s) => s.method === 'Surf').map((s) => s.mapId));

// ---- 3) pesca, Headbutt/Rock Smash, Bug Contest, vagantes
const fish = read('data/wild/fish.asm');
const groupNames = [...fish.matchAll(/fishgroup\s+[^,]+,\s*\.(\w+)_Old,\s*\.(\w+)_Good,\s*\.(\w+)_Super/g)].map((m) => m[1]);
const fishConsts = [...read('constants/map_data_constants.asm').matchAll(/const\s+(FISHGROUP_\w+)/g)].map((m) => m[1]).filter((x) => x !== 'FISHGROUP_NONE');
const timeGroups = [...(fish.split('TimeFishGroups:')[1] ?? '').matchAll(/db\s+(\w+),\s*(\d+),\s*(\w+),\s*(\d+)/g)].map((m) => ({ day: { sp: m[1], level: Number(m[2]) }, nite: { sp: m[3], level: Number(m[4]) } }));
const rodList = (label) => {
  const body = fish.split(new RegExp(`^\\.${label}:\\s*$`, 'm'))[1]?.split(/^\.\w+:\s*$/m)[0] ?? '';
  let prev = 0;
  const outList = [];
  for (const m of body.matchAll(/db\s+(\d+)\s*percent(?:\s*\+\s*1)?,\s*(?:time_group\s+(\d+)|(\w+),\s*(\d+))/g)) {
    const cum = Number(m[1]);
    const pct = cum - prev;
    prev = cum;
    if (m[2] != null) { const tg = timeGroups[Number(m[2])]; outList.push({ ...tg.day, pct, times: ['dia'] }, { ...tg.nite, pct, times: ['noite'] }); }
    else outList.push({ sp: m[3], level: Number(m[4]), pct });
  }
  return outList;
};
for (const v of VERSIONS) for (const c of waterMaps) {
  const fg = fishOf[c];
  const gi = fishConsts.indexOf(fg);
  if (gi < 0 || !groupNames[gi]) continue;
  for (const [rod, suffix] of [['Old Rod', 'Old'], ['Good Rod', 'Good'], ['Super Rod', 'Super']]) {
    const agg = {};
    for (const x of rodList(`${groupNames[gi]}_${suffix}`)) {
      const a = (agg[x.sp] ??= { min: x.level, max: x.level, pct: 0, times: new Set() });
      a.min = Math.min(a.min, x.level); a.max = Math.max(a.max, x.level); a.pct += x.times ? x.pct / 2 : x.pct;
      (x.times ?? ['dia', 'noite']).forEach((t) => a.times.add(t));
    }
    for (const [sp, a] of Object.entries(agg)) push(v, sp, { type: 'wild', where: label(c), mapId: c, method: rod, min: a.min, max: a.max, pct: Math.max(1, Math.round(a.pct)), ...(a.times.size < 2 && { times: [...a.times] }) });
  }
}
// treemons.asm tem IF DEF(_GOLD)/(_SILVER) no pokegold → resolver por versão
const setConsts = [...read('constants/pokemon_data_constants.asm').matchAll(/const\s+(TREEMON_SET_\w+)/g)].map((m) => m[1]);
for (const v of VERSIONS) {
  const tm = resolveIfdef(read('data/wild/treemons.asm'), DEF(v));
  const setLabels = [...tm.split('TreeMons:')[1].split('assert_table_length')[0].matchAll(/dw\s+(\w+)/g)].map((m) => m[1]);
  const treeSets = {};
  setConsts.forEach((c, i) => {
    const body = tm.split(new RegExp(`^${setLabels[i]}:\\s*$`, 'm'))[1]?.split(/^TreeMonSet_\w+:\s*$/m)[0] ?? '';
    treeSets[c] = [...body.matchAll(/db\s+(\d+),\s*(\w+),\s*(\d+)/g)].map((m) => ({ pct: Number(m[1]), sp: m[2], level: Number(m[3]) }));
  });
  for (const m of read('data/wild/treemon_maps.asm').matchAll(/treemon_map\s+(\w+),\s*(TREEMON_SET_\w+)/g)) {
    const list = treeSets[m[2]] ?? [];
    if (!list.length) continue;
    const method = m[2] === 'TREEMON_SET_ROCK' ? 'Rock Smash' : 'Headbutt';
    const agg = {};
    for (const x of list) { const a = (agg[x.sp] ??= { min: x.level, max: x.level, pct: 0 }); a.min = Math.min(a.min, x.level); a.max = Math.max(a.max, x.level); a.pct += x.pct / 2; } // 2 tabelas (comum/rara) → média
    for (const [sp, a] of Object.entries(agg)) push(v, sp, { type: 'wild', where: label(m[1]), mapId: m[1], method, min: a.min, max: a.max, pct: Math.max(1, Math.round(a.pct)) });
  }
}
const contest = [...read('data/wild/bug_contest_mons.asm').matchAll(/db\s+(\d+),\s*(\w+),\s*(\d+),\s*(\d+)/g)];
const contestMap = Object.keys(fileOf).find((c) => /NATIONAL_PARK_BUG_CONTEST/.test(c));
for (const v of VERSIONS) for (const m of contest) push(v, m[2], { type: 'wild', where: label(contestMap), mapId: contestMap, method: 'Bug Contest', min: Number(m[3]), max: Number(m[4]), pct: Number(m[1]), detail: 'concurso de insetos (ter/qui/sáb)' });
const wm = read('engine/overworld/wildmons.asm');
const roamBody = wm.split(/^InitRoamMons:/m)[1]?.split(/^\w+:/m)[0] ?? '';
const roamSp = [...roamBody.matchAll(/ld a, (\w+)\s*\n\s*ld \[wRoamMon\dSpecies\]/g)].map((m) => m[1]);
const roamLv = Number(roamBody.match(/ld a, (\d+)\s*\n\s*ld \[wRoamMon1Level\]/)?.[1]);
for (const v of VERSIONS) for (const sp of roamSp) push(v, sp, { type: 'roamer', where: 'pelo mapa (vagante)', level: roamLv, detail: 'vaga por Johto depois da Burned Tower' });

// ---- 4) scripts: presentes, ovos, estáticos, trocas, prêmios, iniciais
const coinsDef = {};
for (const c of Object.keys(fileOf)) for (const m of scriptOf(c).matchAll(/DEF\s+(\w+_COINS)\s+EQU\s+(\d+)/g)) coinsDef[m[1]] = Number(m[2]);
const trades = [...read('data/events/npc_trades.asm').matchAll(/npctrade\s+\w+,\s*(\w+),\s*(\w+),\s*"[^"]*",[^\n]*?"(\w+)"/g)].map((m) => ({ give: m[1], get: m[2], ot: m[3] }));
const starterMap = Object.keys(fileOf).find((c) => c === 'ELMS_LAB');
const starters = [...scriptOf(starterMap).matchAll(/givepoke\s+(\w+),\s*(\d+)/g)].map((m) => ({ sp: m[1], level: Number(m[2]) }));
for (const v of VERSIONS) {
  for (const c of Object.keys(fileOf)) {
    const s = resolveIfdef(scriptOf(c), DEF(v));
    if (!s) continue;
    for (const m of s.matchAll(/givepoke\s+(\w+),\s*(\d+)([^\n]*)/g)) {
      if (!isSpecies(m[1]) || c === starterMap) continue;
      const after = s.slice(m.index, m.index + 200);
      const coins = after.match(/takecoins\s+(\w+)/)?.[1];
      push(v, m[1], coins ? { type: 'prize', where: `${label(c)} (prêmios)`, mapId: c, level: Number(m[2]), detail: `${coinsDef[coins] ?? '?'} fichas` } : { type: 'gift', where: label(c), mapId: c, level: Number(m[2]) });
    }
    for (const m of s.matchAll(/giveegg\s+(\w+)/g)) if (isSpecies(m[1])) push(v, m[1], { type: 'egg', where: label(c), mapId: c });
    // Crystal: Odd Egg da Day Care ("special GiveOddEgg") — espécie sorteada de data/events/odd_eggs.asm (Pichu, Cleffa…)
    if (/special GiveOddEgg/.test(s) && has('data/events/odd_eggs.asm')) {
      for (const sp of new Set([...read('data/events/odd_eggs.asm').matchAll(/^\s*db\s+([A-Z_]+)\b/gm)].map((x) => x[1]).filter(isSpecies))) push(v, sp, { type: 'egg', where: label(c), mapId: c, detail: 'Odd Egg (espécie sorteada; um por jogo)' });
    }
    for (const m of s.matchAll(/loadwildmon\s+(\w+),\s*(\d+)/g)) if (isSpecies(m[1])) push(v, m[1], { type: 'static', where: label(c), mapId: c, level: Number(m[2]) });
    for (const m of s.matchAll(/^\s*trade\s+NPC_TRADE_(\w+)/gm)) {
      const tr = trades.find((x) => x.ot === m[1]);
      if (tr && isSpecies(tr.get)) push(v, tr.get, { type: 'trade', where: label(c), mapId: c, want: monOf(tr.give).name, detail: `troca por ${monOf(tr.give).name}` });
    }
  }
  for (const st of starters) push(v, st.sp, { type: 'starter', where: `${label(starterMap)} — Prof. Elm`, level: st.level, detail: 'um dos três iniciais (os outros dois só por troca)', stage: 0 });
}
data.starters = { where: `New Bark Town — ${label(starterMap)}`, level: starters[0]?.level ?? 5, species: starters.map((s) => monOf(s.sp).name).sort((a, b) => data.pokemon.find((p) => p.name === a).id - data.pokemon.find((p) => p.name === b).id) };

// ---- 5) TMs, HMs e itens
const itemsTxt = read('constants/item_constants.asm');
const tmConsts = [...itemsTxt.matchAll(/^\s*add_(tm|hm)\s+(\w+)/gm)].map((m) => ({ item: `${m[1].toUpperCase()}_${m[2]}`, move: m[2] }));
const moveOfItem = Object.fromEntries(tmConsts.map((x) => [x.item, moveIdOf.get(g.moveId[x.move])]));
const machines = {}, items = {};
const addSrc = (it, src) => { if (moveOfItem[it]) (machines[moveOfItem[it]] ??= []).push(src); else (items[it] ??= []).push(src); };
const leaderOfMap = {};
for (const t of trainers.filter((x) => x.group === 'Líderes de ginásio' || x.group === 'Líderes de Kanto')) for (const mp of t.map) { const c = Object.keys(fileOf).find((k) => label(k) === mp); if (c) leaderOfMap[c] = t.name; }
const martConsts = [...read('constants/mart_constants.asm').matchAll(/const\s+(MART_\w+)/g)].map((m) => m[1]);
const martsTxt = read('data/items/marts.asm');
const martLabels = [...martsTxt.split('Marts:')[1].split('assert_table_length')[0].matchAll(/dw\s+(\w+)/g)].map((m) => m[1]);
const martItems = (mc) => { const lbl = martLabels[martConsts.indexOf(mc)]; const body = martsTxt.split(new RegExp(`^${lbl}:\\s*$`, 'm'))[1]?.split(/db -1/)[0] ?? ''; return [...body.matchAll(/^\s*db\s+([A-Z_0-9]+)\s*$/gm)].map((m) => m[1]); };
for (const c of Object.keys(fileOf)) {
  const s = scriptOf(c);
  for (const m of s.matchAll(/^\s*itemball\s+(\w+)/gm)) addSrc(m[1], { type: 'ground', where: label(c), map: c, by: 'item no chão', resolved: true });
  for (const m of s.matchAll(/^\s*hiddenitem\s+(\w+)/gm)) addSrc(m[1], { type: 'hidden', where: label(c), map: c, by: 'escondido', resolved: true });
  for (const m of s.matchAll(/^\s*(?:verbosegiveitem|giveitem)\s+(\w+)/gm)) {
    if (m[1] === 'ITEM_FROM_MEM') continue;
    const coins = s.slice(m.index, m.index + 200).match(/takecoins\s+(\w+)/)?.[1];
    const leader = leaderOfMap[c];
    // presente de contato do telefone (Route34: "checkflag ENGINE_GINA_HAS_LEAF_STONE" antes do verbosegiveitem):
    // só depois de registrar o número e ela ligar — não é imediato
    const phone = /checkflag ENGINE_\w+_HAS_\w+/.test(s.slice(Math.max(0, m.index - 600), m.index));
    addSrc(m[1], coins ? { type: 'prize', where: `${label(c)} (prêmios)`, map: c, by: `${coinsDef[coins] ?? '?'} fichas`, resolved: true }
      : { type: 'gift', where: label(c), map: c, by: leader ? `líder ${leader}` : phone ? 'NPC (por telefone, depois de registrar o número)' : 'NPC', resolved: true, ...(leader && { leader }), ...(phone && { phone: true }) });
  }
  for (const m of s.matchAll(/pokemart\s+\w+,\s*(MART_\w+)/g)) for (const it of martItems(m[1])) addSrc(it, { type: 'mart', where: label(c), map: c, by: 'loja', resolved: true });
}

// ---- 6) estágio
const people = (group) => Object.values(Object.groupBy(trainers.filter((t) => t.group === group), (t) => t.name)).map((ts) => ({ name: ts[0].name, teams: ts.map((t) => t.party) }));
let wtHtml = readFileSync(new URL(`../data-sources/pokemythology/${game.walkthrough}.html`, import.meta.url), 'utf8');
for (const [wrong, right] of Object.entries(game.walkthroughTypos ?? {})) wtHtml = wtHtml.replace(new RegExp(wrong, 'gi'), (m) => (m === m.toUpperCase() ? right.toUpperCase() : right));
const timeline = buildTimeline(wtHtml, people('Líderes de ginásio'), people('Elite dos Quatro'), { blocks: parseTrainerRuns(wtHtml), sectionRe: SECTIONS_WITH_SUBTITLES });
const ids = Object.keys(fileOf);
const titleKnown = new Map(), textKnown = new Map(), detail = {};
const GENERIC2 = ['tower', 'cave', 'forest', 'road', 'path', 'well', 'den', 'lake', 'falls', 'park', 'gate', 'islands', 'ruins', 'tunnel'];
for (const id of ids) { const r = placeStage(timeline, label(id), { generic: GENERIC2 }); if (!r) continue; (r.by === 'título' ? titleKnown : textKnown).set(id, r.stage); detail[id] = r; }
// fatos do código: spawn inicial (data/maps/spawn_points.asm, 1º "spawn") → casa → cidade = 0; mapa que CHECA insígnia
const facts = {};
const start = read('data/maps/spawn_points.asm').match(/^\s*spawn\s+(\w+)/m)?.[1];
for (let cur = start, seen = new Set(); cur && !seen.has(cur); ) { seen.add(cur); facts[cur] = { stage: 0, why: 'início do jogo (spawn)' }; if (conn.has(cur)) break; cur = [...(warp.get(cur) ?? [])].find((n) => !seen.has(n)); }
const badgeOrder = [...read('constants/engine_flags.asm').matchAll(/const\s+ENGINE_(\w+)BADGE/g)].map((m) => m[1]);
for (const c of ids) {
  const s = scriptOf(c);
  // só PORTÕES (maps.asm: GATE): na Gen 2 muito NPC checa insígnia para dar item (Route 29 checa a Zephyr e ia para 1)
  if (/setflag ENGINE_\w+BADGE/.test(s) || envOf[c] !== 'GATE') continue;
  const checked = [...s.matchAll(/checkflag ENGINE_(\w+)BADGE/g)].map((m) => badgeOrder.indexOf(m[1])).filter((i) => i >= 0);
  if (checked.length && !facts[c]) facts[c] = { stage: Math.min(Math.max(...checked) + 1, POSTGAME), why: `script checa a insígnia ${badgeOrder[Math.max(...checked)]}` };
}
// ginásio do N-ésimo líder (ordem da linha do tempo) = estágio N-1, e a cidade dele não fica depois disso
// (o detonado do Gold não tem seção de Azalea: a cidade herdava 2 dos vizinhos, mas o Bugsy é dela)
timeline.leaderOrder.forEach((name, i) => {
  const gym = Object.keys(leaderOfMap).find((c) => leaderOfMap[c] === name && /GYM/.test(c));
  if (!gym) return;
  facts[gym] ??= { stage: i, why: `ginásio de ${name} (${i + 1}º líder)` };
  // cidade: TETO (Olivine é visitada antes, no estágio 4, e o ginásio da Jasmine é o 6º) — fixa min(citação, i)
  for (const town of [...(warp.get(gym) ?? [])].filter((n) => conn.has(n))) {
    const cited = titleKnown.get(town) ?? textKnown.get(town);
    facts[town] ??= { stage: Math.min(cited ?? i, i), why: `cidade do ginásio de ${name} (${i + 1}º líder): no máximo ${i}` };
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
// interior citado só no TEXTO, com o mesmo landmark de uma cidade (Goldenrod Dept Store = "Goldenrod City"): não fica depois
// dela — a loja é citada de novo na parte da Radio Tower (estágio 7), mas a troca do Machop existe desde a chegada (2)
for (const id of ids) {
  if (conn.has(id) || facts[id] || detail[id]?.by !== 'texto') continue;
  const town = ids.find((c) => conn.has(c) && landmarkOf[c] && landmarkOf[c] === landmarkOf[id] && st.has(c));
  if (town && st.get(id) > st.get(town)) { st.set(id, st.get(town)); detail[id] = { ...detail[id], capBy: label(town) }; }
}
// interior situado por TÍTULO tardio mas citado antes, com porta para um exterior já alcançável nessa citação
// (Mt. Mortar: seção própria no pós-jogo; citado em Olivine, estágio 6; a porta é a Route 42, estágio 6)
for (const id of ids) {
  const r = detail[id];
  if (conn.has(id) || facts[id] || r?.by !== 'título' || !r.earlierMention) continue;
  const doorOk = [...(warp.get(id) ?? [])].some((n) => conn.has(n) && st.has(n) && st.get(n) <= r.earlierMention.stage);
  if (doorOk && st.get(id) > r.earlierMention.stage) { st.set(id, r.earlierMention.stage); detail[id] = { ...r, usedEarlier: true }; }
}
// andares do mesmo complexo (portas só para interiores) herdam o menor estágio vizinho ajustado acima
for (let p = 0; p < 6; p++) for (const id of ids) {
  if (conn.has(id) || facts[id] || detail[id]?.by === 'título') continue;
  const near = [...(warp.get(id) ?? [])].filter((n) => !conn.has(n) && (detail[n]?.capBy || detail[n]?.usedEarlier) && landmarkOf[n] === landmarkOf[id]).map((n) => st.get(n));
  if (near.length && st.get(id) > Math.min(...near)) { st.set(id, Math.min(...near)); detail[id] = { ...(detail[id] ?? {}), capBy: 'andar vizinho' }; }
}
// passagem: interior com portas para 2+ mapas EXTERNOS (Union Cave: Route 32 ↔ Route 33; Dark Cave: Route 31 ↔ Route 46)
// atravessa-se no caminho → não fica depois do lado mais cedo. O título que a nomeia pode ser de uma revisita (Union Cave = 9).
for (const id of ids) {
  if (conn.has(id) || facts[id]) continue;
  const outsides = [...(warp.get(id) ?? [])].filter((n) => conn.has(n) && st.has(n));
  if (new Set(outsides).size >= 2) { const lo = Math.min(...outsides.map((n) => st.get(n))); if (st.get(id) > lo) { st.set(id, lo); detail[id] = { ...(detail[id] ?? {}), passage: outsides.map(label) }; } }
}
// andares internos ligados à passagem herdam o estágio dela (Union Cave B1F pela 1F)
for (let p = 0; p < 4; p++) for (const id of ids) {
  if (conn.has(id) || facts[id] || detail[id]?.passage) continue;
  const inner = [...(warp.get(id) ?? [])].filter((n) => detail[n]?.passage && st.has(n));
  if (inner.length && !textKnown.has(id) && !titleKnown.has(id)) st.set(id, Math.min(...inner.map((n) => st.get(n))));
}
for (let p = 0; p < 4; p++) for (const id of ids) {
  if (conn.has(id) || !warp.has(id) || !st.has(id)) continue;
  const outside = [...warp.get(id)].map((n) => st.get(n)).filter((x) => x !== undefined);
  if (outside.length) st.set(id, Math.max(st.get(id), Math.min(...outside)));
}
if (process.env.WHY) for (const id of process.env.WHY.split(',')) console.log('WHY', id, label(id), JSON.stringify(detail[id] ?? null), 'st', st.get(id), 'conn', [...(conn.get(id) ?? [])].join('/'), 'warp', [...(warp.get(id) ?? [])].join('/'));
const leaderStage = (name) => { const i = timeline.leaderOrder.indexOf(name); return i >= 0 ? i + 1 : null; };
const leaderTop = (name) => Math.max(0, ...trainers.filter((t) => t.name === name).flatMap((t) => t.party.map((p) => p.level)));
const areaLevel = (start0, v) => {
  let frontier = [start0]; const seen = new Set([start0]);
  for (let d = 0; d <= 2; d++) {
    const lv = frontier.flatMap((c) => wildByMap[v][c] ?? []);
    if (lv.length) return { level: Math.min(...lv), near: [...new Set(frontier.filter((c) => wildByMap[v][c]).map(label))].join(', ') };
    frontier = frontier.flatMap((c) => [...(conn.get(c) ?? []), ...(warp.get(c) ?? [])]).filter((c) => !seen.has(c) && seen.add(c));
  }
  return null;
};
// HM fora da batalha (overworld.asm) e varas/TMs de campo
const ow = read('engine/events/overworld.asm');
const badgeLeader = {};
for (const c of ids) { const b = scriptOf(c).match(/setflag ENGINE_(\w+)BADGE/); if (b && leaderOfMap[c]) badgeLeader[b[1]] = leaderOfMap[c]; }
const giverOf = (it) => [...(items[it] ?? []), ...(machines[moveOfItem[it]] ?? [])].find((s) => s.type === 'gift');
const gates = {};
for (const [method, lbl, hm] of [['Surf', 'TrySurf', 'HM_SURF']]) {
  const bit = ow.match(new RegExp(`\\.${lbl}:[\\s\\S]{0,200}?ld de, ENGINE_(\\w+)BADGE`))?.[1];
  const leader = badgeLeader[bit];
  const giver = giverOf(hm);
  gates[method] = { level: Math.max(leaderTop(leader), giver ? areaLevel(giver.map, VERSIONS[0])?.level ?? 0 : 0), item: giver?.where ?? null, badge: badgeOrder.indexOf(bit) + 1, leader, stage: Math.max(st.get(giver?.map) ?? 0, leaderStage(leader) ?? 0) };
}
for (const [method, it] of [['Old Rod', 'OLD_ROD'], ['Good Rod', 'GOOD_ROD'], ['Super Rod', 'SUPER_ROD'], ['Headbutt', 'TM_HEADBUTT'], ['Rock Smash', 'TM_ROCK_SMASH']]) {
  const giver = giverOf(it);
  if (giver) gates[method] = { level: areaLevel(giver.map, VERSIONS[0])?.level ?? 1, item: giver.where, stage: st.get(giver.map) ?? null };
}
const firstMention = (sp) => timeline.chunks.find((c) => c.text.includes(sp.replace(/-/g, '')))?.stage ?? null;
for (const v of VERSIONS) for (const [sp, list] of Object.entries(out[v])) for (const s of list) {
  if (s.type === 'roamer') { s.stage = placeStage(timeline, sp)?.stage ?? POSTGAME; continue; }
  if (s.stage === undefined) s.stage = s.mapId ? st.get(s.mapId) ?? null : null;
  if (['gift', 'static', 'egg'].includes(s.type) && s.stage != null) { const f = firstMention(sp); if (f != null && f > s.stage) { s.stage = f; s.stageBy = 'citação da espécie no detonado'; } }
  if (s.type === 'wild' && gates[s.method]) s.gate = gates[s.method];
  if (s.mapId) { const a = areaLevel(s.mapId, v); if (a) s.area = a; }
}
for (const list of [...Object.values(machines), ...Object.values(items)]) for (const s of list) {
  s.level = areaLevel(s.map, VERSIONS[0])?.level ?? null;
  s.stage = s.leader && leaderStage(s.leader) ? Math.max(st.get(s.map) ?? 0, leaderStage(s.leader)) : st.get(s.map) ?? null;
}
for (const list of [...Object.values(machines), ...Object.values(items)]) list.sort((a, b) => (a.stage ?? 9) - (b.stage ?? 9));

// ---- 7) obtível
const USABLE = new Set(['wild', 'gift', 'static', 'trade', 'prize', 'starter', 'roamer', 'egg']);
const byId = new Map(data.pokemon.map((p) => [p.id, p]));
const changes = [];
for (const v of VERSIONS) {
  const memo = new Map();
  const can = (mon) => {
    if (memo.has(mon.name)) return memo.get(mon.name);
    memo.set(mon.name, false);
    const parent = byId.get(mon.evolvesFrom);
    const ok = (out[v][mon.name] ?? []).some((s) => USABLE.has(s.type)) || (!!parent && mon.evo?.possible !== false && can(parent));
    memo.set(mon.name, ok);
    return ok;
  };
  for (const mon of data.pokemon) { const now = can(mon); if (mon.obtainable[v] !== now) changes.push(`${mon.name}.${v}: ${mon.obtainable[v]} → ${now}`); mon.obtainable[v] = now; }
}
writeFileSync(dataFile, JSON.stringify(data));
// estágio de cada luta importante pelo time no detonado (só sobe: uma rota pode ter lutas de momentos diferentes)
const trainerStage = {};
for (const t of trainers.filter((x) => ['Líderes de ginásio', 'Elite dos Quatro', 'Campeão', 'Rival'].includes(x.group))) { const s0 = teamStage(timeline, t.party); if (s0 != null) trainerStage[t.key] = s0; }
const progress = {
  trainerStage,
  // nº da insígnia (ordem de ENGINE_*BADGE; 1–8 Johto) → líder ("setflag ENGINE_XBADGE" no script do ginásio)
  badges: badgeOrder.slice(0, 8).map((b, i) => ({ n: i + 1, name: b, leader: badgeLeader[b] ?? null })),
  source: `PokeMythology ${game.walkthrough} + conexões do decomp`, leaderOrder: timeline.leaderOrder, leadersFound: timeline.leadersFound, eliteFound: timeline.eliteFound,
  mapsWithStage: st.size, mapsTotal: ids.length,
  maps: Object.fromEntries(ids.map((c) => [c, { folder: fileOf[c], label: label(c), stage: st.get(c) ?? null, landmark: landmarkOf[c] ?? null, env: envOf[c] ?? null }])),
  reviewEarlierMention: Object.entries(detail).filter(([, r]) => r.earlierMention).map(([id, r]) => ({ map: label(id), stage: r.stage, earlier: r.earlierMention })),
};
writeFileSync(new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, versions: out, machines, tutors: {}, items, progress }));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/obtainable-changes.json`, import.meta.url), JSON.stringify(changes, null, 1));
const tmWith = tmConsts.filter((x) => machines[moveOfItem[x.item]]?.length).length;
console.log(`[${gameId}] líderes no detonado: ${timeline.leaderOrder.join(' > ')} (${timeline.leadersFound}; Elite ${timeline.eliteFound}/4); mapas com estágio ${st.size}/${ids.length}; iniciais ${data.starters.species.join(', ')}`);
console.log(`  TM/HM com origem: ${tmWith}/${tmConsts.length}${tmWith < tmConsts.length ? ' — sem: ' + tmConsts.filter((x) => !machines[moveOfItem[x.item]]?.length).map((x) => x.item).join(', ') : ''}`);
for (const v of VERSIONS) console.log(`  ${v}: ${data.pokemon.filter((p) => p.obtainable[v]).length} obtíveis; ${Object.keys(out[v]).length} com fonte direta`);
console.log(`  portas: ${Object.entries(gates).map(([k, x]) => `${k} → ${x.item}${x.leader ? ` + ${x.leader}` : ''} (estágio ${x.stage})`).join('; ')}`);
console.log(`  mudanças de "obtível" (vs PokéAPI): ${changes.length}${changes.length ? ' ex.: ' + changes.slice(0, 12).join(', ') : ''}`);
