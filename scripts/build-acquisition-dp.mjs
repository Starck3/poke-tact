// Onde obter (Diamond/Pearl, pret/pokediamond) + estágio de progresso → public/data/<jogo>-acquisition.json
// Mesma lógica do Platinum (build-acquisition-gen4.mjs); a diferença é a FONTE: no DP os dados de campo estão em binário e
// são lidos por scripts/lib/gen4-dp-field.mjs (mapas, eventos, encontros, matrizes, trocas) e gen4-dp-script.mjs (bytecode).
//   mapas     arm9/src/map_header.c (encontros por versão, scripts, eventos, MAPSEC); CONEXÕES: matrizes (células vizinhas
//             diferentes); warps: eventos
//   selvagens encountdata/{d,p}_enc_data — terra 12 slots (20,20,10,10,10,10,5,5,4,4,1,1); slots 2–3 trocam para "dia"/"noite"
//             e ficam os padrão de manhã; 0–1 = enxame; 4,5,10,11 = Poké Radar; dual-slot (cartucho de GBA) fora.
//             Água 60,30,5,4,1; Old Rod 60,30,5,4,1; Good/Super Rod 40,40,15,4,1 (regras do motor da Gen 4, as mesmas do Platinum)
//   extras    arc/encdata_ex (NARC 106): 0 Feebas; 2–4 / 5–7 árvores de mel comum/incomum/rara (Diamond / Pearl);
//             8 sorteio diário do Trophy Garden; 9 / 10 espécie do dia da Great Marsh (16 antes + 16 depois da Pokédex Nacional)
//   scripts   GiveMon 0x96, GiveEgg 0x97, WildBattle 0x124, LegendaryBattle 0x2BD, NPCTradeInit 0x226 (fld_trade),
//             CreateRoamer 0x21C (Save_CreateRoamerByID), GiveBadge 0x15C, NormalMart 0x147, SpecialMart 0x148,
//             GetPrizeItemIdAndCost 0x2A6 (scrcmd_prizes.c); presente de item = SetVar 0x8004, ITEM que chega aos scripts
//             comuns 2016/2044 (os únicos que fazem GiveItem 0x8004 — arquivo 205); GiveItem 0x7B com item fixo
//   itens     objeto com script 7000+i → i-ésima entrada do arquivo 370 (SetVar 0x8008, ITEM); bg event 8000+i → tabela de
//             itens escondidos (UNK_020F2DB4)
//   HMs       arm9/src/field_move.c (FieldMove_CheckSurf → BADGE_RELIC); insígnia → líder: GiveBadge no ginásio
// Uso: node scripts/build-acquisition-dp.mjs <jogo>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { buildTimeline, placeStage, propagateStages, applyEarlierMentions, POSTGAME, teamStage, words } from './lib/progress.mjs';
import { parseTrainerRuns, SECTIONS_WITH_SUBTITLES } from './lib/pokemythology.mjs';
import { loadDp } from './lib/gen4-dp.mjs';
import { loadDpField, dpLabel, parseEncounters, parseMatrix, parseTrade, loadHiddenItems, loadStarters } from './lib/gen4-dp-field.mjs';
import { CMD, simulate } from './lib/gen4-dp-script.mjs';

const gameId = process.argv[2] ?? 'diamond-pearl';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const trainers = JSON.parse(readFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), 'utf8')).trainers;
const VERSIONS = game.versions; // ['diamond', 'pearl']
const g = loadDp(root);
const F = loadDpField(root);
const defs = (p) => Object.fromEntries([...read(p).matchAll(/#define ((?:ITEM|SPECIES|BADGE)_\w+)\s+(\d+)\b/g)].map((m) => [m[1], Number(m[2])]));
const itemId = defs('include/constants/items.h');
const itemConst = Object.fromEntries(Object.entries(itemId).map(([k, v]) => [v, k]));
const monById = new Map(data.pokemon.map((p) => [p.id, p]));
const monOf = (sp) => (typeof sp === 'number' ? monById.get(sp) : monById.get(g.speciesId[sp]));
const isVar = (v) => v >= 0x4000;
const itemName = (c) => c.replace(/^ITEM_/, '');
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const u16 = (c, k = 0) => c.args.readUInt16LE(k);

// ---- 1) cabeçalhos, conexões (matrizes) e warps
const H = Object.fromEntries(F.headers.map((h) => [h.id, h]));
const byNum = F.headers.map((h) => h.id);
const ids = F.headers.filter((h) => !/EVERYWHERE|NOTHING/.test(h.id)).map((h) => h.id);
const label = (id) => dpLabel(H[id]);
const conn = new Map(), warp = new Map();
const link = (m, a, b) => { if (a === b || !H[a] || !H[b]) return; (m.get(a) ?? m.set(a, new Set()).get(a)).add(b); (m.get(b) ?? m.set(b, new Set()).get(b)).add(a); };
const skip = (n) => n == null || n <= 1; // 0 = EVERYWHERE, 1 = NOTHING
for (let f = 0; ; f++) {
  const b = F.raw('mapmatrix/map_matrix', f);
  if (!b) break;
  const m = parseMatrix(b);
  if (!m.grid) continue;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const a = m.grid[y][x];
    if (skip(a)) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) { const c = m.grid[y + dy]?.[x + dx]; if (!skip(c) && c !== a) link(conn, byNum[a], byNum[c]); }
  }
}
const firstOf = (key) => { const seen = new Map(); for (const id of ids) if (!seen.has(H[id][key])) seen.set(H[id][key], id); return seen; };
const evOwner = firstOf('events'), scrOwner = firstOf('scripts');
const eventsOf = (id) => F.events(H[id]);
for (const id of ids) if (evOwner.get(H[id].events) === id) for (const w of eventsOf(id)?.warps ?? []) link(warp, id, byNum[w.dest]);
// script do mapa (cada arquivo só pelo 1º mapa que o usa — os outros apontam para o mesmo código)
const scriptOf = (id) => (scrOwner.get(H[id].scripts) === id ? F.script(H[id]) : null);
const codeOf = (id) => [...(scriptOf(id)?.code.values() ?? [])];
const encOf = (id, v) => { const n = H[id].enc?.[v]; const b = n != null ? F.raw(`encountdata/${v === 'diamond' ? 'd' : 'p'}_enc_data`, n) : null; return b ? parseEncounters(b) : null; };

// ---- 2) selvagens
const LAND = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1], WATER = [60, 30, 5, 4, 1], OLD = [60, 30, 5, 4, 1], GOOD = [40, 40, 15, 4, 1];
const out = Object.fromEntries(VERSIONS.map((v) => [v, {}]));
const push = (v, sp, src) => { const mon = monOf(sp); if (!mon) return; const list = (out[v][mon.name] ??= []); const k = JSON.stringify(src); if (!list.some((x) => JSON.stringify(x) === k)) list.push(src); };
const wildByMap = {};
const addAgg = (v, h, method, slots, extra = {}) => {
  const agg = {};
  for (const s of slots) { if (!monOf(s.sp)) continue; const a = (agg[s.sp] ??= { min: s.min, max: s.max, pct: 0 }); a.min = Math.min(a.min, s.min); a.max = Math.max(a.max, s.max); a.pct += s.pct; }
  for (const [sp, a] of Object.entries(agg)) { push(v, Number(sp), { type: 'wild', where: label(h), mapId: h, method, min: a.min, max: a.max, pct: Math.max(1, Math.round(a.pct)), ...extra }); (wildByMap[h] ??= []).push(a.min); }
};
// arc/encdata_ex: listas de espécies em u32
const exList = (n) => { const b = readFileSync(new URL(`files/arc/encdata_ex/narc_${String(n).padStart(4, '0')}.bin`, root)); return Array.from({ length: b.length / 4 }, (_, i) => b.readUInt32LE(4 * i)); };
const trophyGarden = 'MAP_TROPHY_GARDEN';
for (const h of ids) {
  if (!H[h].enc) continue;
  for (const v of VERSIONS) {
    const j = encOf(h, v);
    if (!j) continue;
    const land = j.land;
    if (j.landRate > 0) {
      const base = land.map((s, i) => ({ sp: s.species, min: s.level, max: s.level, pct: LAND[i] }));
      addAgg(v, h, 'Grama/caverna', base.filter((_, i) => i !== 2 && i !== 3));
      addAgg(v, h, 'Grama/caverna', base.filter((_, i) => i === 2 || i === 3), { times: ['manhã'] });
      addAgg(v, h, 'Grama/caverna', j.day.map((sp, k) => ({ sp, min: land[2 + k].level, max: land[2 + k].level, pct: LAND[2 + k] })), { times: ['dia'] });
      addAgg(v, h, 'Grama/caverna', j.night.map((sp, k) => ({ sp, min: land[2 + k].level, max: land[2 + k].level, pct: LAND[2 + k] })), { times: ['noite'] });
      addAgg(v, h, 'Grama/caverna', j.swarm.map((sp, k) => ({ sp, min: land[k].level, max: land[k].level, pct: LAND[k] })), { swarm: true, detail: 'enxame (notícia na TV)' });
      addAgg(v, h, 'Poké Radar', j.radar.map((sp, k) => { const i = [4, 5, 10, 11][k]; return { sp, min: land[i].level, max: land[i].level, pct: LAND[i] }; }));
      // Trophy Garden: 2 espécies sorteadas por dia da lista (encdata_ex 8) entram nos slots 6–7
      if (h === trophyGarden) { const list = exList(8); addAgg(v, h, 'Grama/caverna', list.map((sp) => ({ sp, min: land[6].level, max: land[7].level, pct: ((LAND[6] + LAND[7]) * 2) / list.length / 2 })), { detail: 'sorteio diário do Trophy Garden' }); }
    }
    const water = (grp, rates, method) => { if (grp.rate > 0) addAgg(v, h, method, grp.slots.map((s, i) => ({ sp: s.species, min: s.min, max: s.max, pct: rates[i] ?? 0 }))); };
    water(j.surf, WATER, 'Surf'); water(j.oldRod, OLD, 'Old Rod'); water(j.goodRod, GOOD, 'Good Rod'); water(j.superRod, GOOD, 'Super Rod');
  }
}

// ---- 2b) fontes especiais
{
  // árvores de mel: o motor (overlay 05, ov05_021F50FC) procura o mapa atual na tabela ov05_021FC650 — 21 números de mapa (u32) —
  // e dispara o script comum 2008 (CheckHoneyTree). Comum 70% / incomum 20%; slots 40,20,20,10,5,5; a tabela rara (Munchlax) só
  // nas 4 "árvores do Munchlax" escolhidas pelo ID do treinador, com 1%. Nível 5–15 (regras do motor da Gen 4, as do Platinum).
  const honeySrc = read('arm9/overlays/05/asm/ov05_021F4CF8.s').split(/^ov05_021FC650:.*$/m)[1].split(/^\S/m)[0];
  const honeyBytes = [...honeySrc.matchAll(/^[ \t]*\.byte[ \t]+([^;\r\n]+)/gm)].flatMap((m) => m[1].split(',').map((x) => Number(x.trim())));
  const trees = Array.from({ length: honeyBytes.length / 4 }, (_, i) => byNum[honeyBytes[4 * i] | (honeyBytes[4 * i + 1] << 8)]).filter((h) => h && ids.includes(h));
  if (trees.length !== 21) throw new Error(`árvores de mel: ${trees.length} mapas (esperado 21, tabela ov05_021FC650)`);
  const SLOT = [40, 20, 20, 10, 5, 5];
  VERSIONS.forEach((v, k) => {
    const [common, uncommon, rare] = [2, 3, 4].map((n) => exList(n + 3 * k));
    for (const h of trees) {
      addAgg(v, h, 'Árvore de mel', [...common.map((sp, i) => ({ sp, min: 5, max: 15, pct: 0.7 * SLOT[i] })), ...uncommon.map((sp, i) => ({ sp, min: 5, max: 15, pct: 0.2 * SLOT[i] }))], { detail: 'passar Honey na árvore e voltar depois de 6 h' });
      addAgg(v, h, 'Árvore de mel', rare.map((sp, i) => ({ sp, min: 5, max: 15, pct: 0.01 * SLOT[i] })), { detail: 'só nas 4 árvores do Munchlax (definidas pelo ID do treinador)' });
    }
  });
  // Great Marsh: durante o Safari, a espécie do dia entra nos slots 6–7. ov06_02245658 lê o arquivo 9 com a Pokédex Nacional e o
  // 10 sem ela (as duas versões usam os mesmos), indexado pelo valor do dia
  const before = exList(10), after = exList(9);
  VERSIONS.forEach((v) => {
    for (const h of ids.filter((x) => /GREAT_MARSH/.test(x))) {
      const land = encOf(h, v)?.land;
      if (!land || !encOf(h, v).landRate) continue;
      const mk = (l) => [...new Set(l)].map((sp) => ({ sp, min: land[6].level, max: land[7].level, pct: 10 / new Set(l).size }));
      addAgg(v, h, 'Grama/caverna', mk(before), { detail: 'espécie do dia da Great Marsh (Safari)' });
      addAgg(v, h, 'Grama/caverna', mk(after), { detail: 'espécie do dia da Great Marsh (Safari), depois da Pokédex Nacional', postgame: true });
    }
  });
  // Feebas (encdata_ex 0): nos pontos de Feebas da sala do Mt. Coronet (MapHeader_MapIsMtCoronetFeebasRoom), qualquer vara, nv 10–20
  const feebasMap = read('arm9/src/map_header.c').split('MapHeader_MapIsMtCoronetFeebasRoom')[1]?.match(/MAP_\w+/)?.[0];
  if (feebasMap && H[feebasMap]) for (const v of VERSIONS) push(v, exList(0)[0], { type: 'wild', where: label(feebasMap), mapId: feebasMap, method: 'Old Rod', min: 10, max: 20, pct: 100, detail: 'só nos pontos de Feebas da água (sorteados)' });
}

// ---- 3) presentes, ovos, estáticos, trocas, vagantes, fósseis, iniciais
const trade = (n) => parseTrade(F.raw('pokemon_trade/fld_trade', n));
// vagantes: Save_CreateRoamerByID (asm) — um bloco por slot: espécie (ldr =0x… ou mov+lsl) e nível (mov r6, #…)
const roamers = (() => {
  const src = read('arm9/asm/unk_020603B0.s').split(/^Save_CreateRoamerByID:.*$/m)[1].split('thumb_func_start')[0];
  const pool = Object.fromEntries([...src.matchAll(/^(_\w+): \.word (0x[0-9A-F]+)/gm)].map((m) => [m[1], Number(m[2])]));
  const blocks = [...src.matchAll(/^_\w+:\n((?:\t[^\n]*\n)*?)\tb _\w+/gm)].map((m) => m[1]);
  return blocks.map((b) => {
    const ld = b.match(/ldr r7, (_\w+)/), mv = b.match(/mov r7, #(0x[0-9a-f]+)\s*\n\s*lsl r7, r7, #(0x[0-9a-f]+)/), lv = b.match(/mov r6, #(0x[0-9a-f]+)/);
    return lv && (ld || mv) ? { species: ld ? pool[ld[1]] : Number(mv[1]) << Number(mv[2]), level: Number(lv[1]) } : null;
  }).filter(Boolean);
})();
const fossils = [...read('arm9/src/scrcmd_fossils.c').matchAll(/\{ (ITEM_\w+),\s*(SPECIES_\w+)\s*\}/g)].map((m) => ({ item: m[1], species: m[2] }));
const museum = 'MAP_OREBURGH_MINING_MUSEUM';
const museumLevel = codeOf(museum).find((c) => c.op === 0x96 && isVar(u16(c)) && !isVar(u16(c, 2))) ? u16(codeOf(museum).find((c) => c.op === 0x96 && isVar(u16(c))), 2) : null;
// iniciais: overlay 64 (loadStarters); nível no GiveMon por variável do mapa que abre a maleta
const starterSp = loadStarters(root);
const starterMap = ids.find((h) => codeOf(h).some((c) => c.op === 0xb4)); // StarterSelectionScreen
const starterGive = starterMap && codeOf(starterMap).find((c) => c.op === 0x96 && isVar(u16(c)));
const starterLv = starterGive ? u16(starterGive, 2) : 5;
// eventos de distribuição: CheckEventValidity (0x28B) n checado em algum script = a espécie n do enum (ordem do Platinum, mesmo
// motor: 0 Darkrai, 1 Shaymin, 2 Arceus, 3 Rotom — o DP checa 0 em Canalave/barco da Newmoon Island, 1 na Route 224/Flower
// Paradise e 2 na Spear Pillar/Hall of Origin) → o encontro único dessa espécie só sai com o evento
const DISTRIBUTION = ['SPECIES_DARKRAI', 'SPECIES_SHAYMIN', 'SPECIES_ARCEUS', 'SPECIES_ROTOM'];
const eventSpecies = new Set(ids.flatMap((h) => codeOf(h).filter((c) => c.op === 0x28b).map((c) => g.speciesId[DISTRIBUTION[c.args[0]]])));
// Regigigas: CheckRegis (0x26B) no mapa = exige Regirock, Regice e Registeel no time
const REGIS = ['SPECIES_REGIROCK', 'SPECIES_REGICE', 'SPECIES_REGISTEEL'].map((s) => g.speciesId[s]);
const VERSION_ID = { diamond: 10, pearl: 11 }; // GetGameVersion (0x246): GAME_VERSION
for (const v of VERSIONS) {
  for (const h of ids) {
    const code = codeOf(h);
    if (!code.length) continue;
    // presentes, ovos e encontros únicos com a espécie/nível resolvidos por versão (Spear Pillar: Dialga no Diamond, Palkia no Pearl)
    const needsRegis = code.some((c) => c.op === 0x26b);
    for (const e of simulate(scriptOf(h), VERSION_ID[v], new Set([0x96, 0x97, 0x124, 0x2bd]))) {
      const [sp, lv] = e.values;
      if (sp == null || (e.op !== 0x97 && lv == null)) continue; // espécie por variável não resolvida (inicial, fóssil: tratados abaixo)
      if (e.op === 0x96) push(v, sp, { type: 'gift', where: label(h), mapId: h, level: lv });
      else if (e.op === 0x97) push(v, sp, { type: 'egg', where: label(h), mapId: h });
      else if (eventSpecies.has(sp)) push(v, sp, { type: 'event', where: label(h), mapId: h, level: lv, detail: 'só com o item do evento de distribuição dessa espécie' });
      else if (needsRegis) push(v, sp, { type: 'event', where: label(h), mapId: h, level: lv, detail: 'exige Regirock, Regice e Registeel no time (só vêm de outros jogos)', needsRegis: true });
      else push(v, sp, { type: 'static', where: label(h), mapId: h, level: lv });
    }
    for (const c of code) {
      if (c.op === 0x226) { const t = trade(c.args[0]); if (monOf(t.species) && monOf(t.requested)) push(v, t.species, { type: 'trade', where: label(h), mapId: h, want: monOf(t.requested).name, detail: `troca por ${monOf(t.requested).name}` }); }
      if (c.op === 0x21c) { const r = roamers[c.args[0]]; if (r && !(out[v][monOf(r.species)?.name] ?? []).some((x) => x.type === 'roamer')) push(v, r.species, { type: 'roamer', where: 'pelo mapa (vagante)', mapId: h, level: r.level, detail: `vaga por Sinnoh depois do evento em ${label(h)}` }); }
    }
  }
  if (museumLevel != null) for (const f of fossils) push(v, f.species, { type: 'gift', where: label(museum), mapId: museum, level: museumLevel, detail: `reviver ${itemName(f.item).replace(/_/g, ' ').toLowerCase()} escavado no Subsolo`, needItem: 'ITEM_EXPLORER_KIT' });
  for (const sp of starterSp) push(v, sp, { type: 'starter', where: `${label(starterMap)} — maleta do Prof. Rowan`, level: starterLv, detail: 'um dos três iniciais (os outros dois só por troca)', stage: 0 });
}
data.starters = { where: `${label(starterMap)} — maleta do Prof. Rowan`, level: starterLv, species: starterSp.map((n) => monOf(n).name) };

// ---- 4) TMs, HMs e itens
const tm = {};
for (const c of Object.keys(itemId)) { const m = c.match(/^ITEM_(TM|HM)(\d+)$/); if (m) tm[c] = moveIdOf.get(g.tmhm[(m[1] === 'HM' ? 92 : 0) + Number(m[2]) - 1]); }
const machines = {}, items = {};
const addSrc = (it, src) => { if (tm[it]) (machines[tm[it]] ??= []).push(src); else (items[itemName(it)] ??= []).push(src); };
const BADGES = Object.entries(defs('include/constants/badge.h')).sort((a, b) => a[1] - b[1]).map(([b]) => b);
const leaderOfMap = {};
for (const t of trainers.filter((x) => x.group === 'Líderes de ginásio')) for (const mp of t.map) { const h = ids.find((k) => label(k) === mp); if (h) leaderOfMap[h] = t.name; }
const visibleFile = F.scriptFile(370), hidden = loadHiddenItems(root);
const visItem = (i) => { const c = visibleFile.code.get(visibleFile.entries[i]); return c?.op === 0x28 && u16(c) === 0x8008 ? itemConst[u16(c, 2)] : null; };
const martSrc = read('arm9/src/scrcmd_mart.c');
const martArr = (name) => [...(martSrc.split(new RegExp(`static const u16 ${name}\\[\\] = \\{`))[1]?.split('};')[0] ?? '').matchAll(/ITEM_\w+/g)].map((m) => m[0]);
const specialPtrs = [...martSrc.split('sSpecialMartPointers[] = {')[1].split('};')[0].matchAll(/(UNK_\w+)/g)].map((m) => m[1]);
const common = [...martSrc.split('sNormalMartBadgeThresholds[][2] = {')[1].split('};')[0].matchAll(/\{ (ITEM_\w+),\s*(\d+) \}/g)].map((m) => ({ item: m[1], tier: Number(m[2]) }));
const TIER_MIN_BADGES = { 1: 0, 2: 1, 3: 3, 4: 5, 5: 7, 6: 8 }; // ScrCmd_NormalMart: 0 → faixa 1; 1–2 → 2; 3–4 → 3; 5–6 → 4; 7 → 5; 8 → 6
const prizes = [...read('arm9/src/scrcmd_prizes.c').matchAll(/\{ (ITEM_\w+),\s*(\d+)\s*\}/g)].map((m) => ({ item: m[1], coins: Number(m[2]) }));
// troca por Battle Points (Battle Park): ScrCmd_Unk029B (asm/scrcmd_10.s) lê pares (item u16, custo u16) a partir de UNK_020F433E
const bpSrc = read('arm9/asm/scrcmd_10.s').split(/^UNK_020F433E:.*$/m)[1].split(/^\s*\.(?:text|section)/m)[0];
const bpBytes = [...bpSrc.matchAll(/^[ \t]*\.byte[ \t]+([^;\r\n]+)/gm)].flatMap((m) => m[1].split(',').map((x) => Number(x.trim())));
const bpItems = Array.from({ length: bpBytes.length >> 2 }, (_, i) => ({ item: itemConst[bpBytes[4 * i] | (bpBytes[4 * i + 1] << 8)], bp: bpBytes[4 * i + 2] | (bpBytes[4 * i + 3] << 8) })).filter((x) => x.item);
// presente de item: SetVar 0x8004, ITEM cujo caminho (com desvios, até 60 comandos) chega aos scripts comuns 2016/2044
const ITEM_GIVERS = new Set([2016, 2044]);
const givesItem = (s, from) => {
  const seen = new Set(), q = [from];
  while (q.length) {
    let pc = q.pop();
    for (let k = 0; k < 60; k++) {
      const c = s.code.get(pc);
      if (!c || seen.has(pc)) break;
      seen.add(pc);
      if (pc !== from && c.op === 0x28 && u16(c) === 0x8004) break; // a variável mudou
      if (c.op === 0x14 && ITEM_GIVERS.has(u16(c))) return true;
      const nx = pc + 2 + c.args.length;
      if (c.op === CMD.GOTO) { pc = nx + c.args.readInt32LE(0); continue; }
      if (c.op === CMD.GOTOIF || c.op === CMD.CALLIF) q.push(nx + c.args.readInt32LE(1));
      if (c.op === CMD.CALL) q.push(nx + c.args.readInt32LE(0));
      if (c.op === CMD.END || c.op === CMD.RETURN) break;
      pc = nx;
    }
  }
  return false;
};
for (const h of ids) {
  const ev = evOwner.get(H[h].events) === h ? eventsOf(h) : null;
  for (const o of ev?.objects ?? []) if (o.script >= 7000 && o.script < 8000) { const it = visItem(o.script - 7000); if (it) addSrc(it, { type: 'ground', where: label(h), map: h, x: o.x, y: o.z, by: 'item no chão', resolved: true }); }
  for (const b of ev?.bg ?? []) if (b.script >= 8000 && b.script < 8800 && hidden[b.script - 8000]) addSrc(itemConst[hidden[b.script - 8000].item], { type: 'hidden', where: label(h), map: h, x: b.x, y: b.z, by: 'escondido', resolved: true });
  const s = scriptOf(h);
  if (!s) continue;
  const leader = leaderOfMap[h];
  const gift = (it) => addSrc(it, { type: 'gift', where: label(h), map: h, by: leader ? `líder ${leader}` : 'NPC', resolved: true, ...(leader && { leader }) });
  const given = new Set();
  for (const c of s.code.values()) {
    if (c.op === 0x28 && u16(c) === 0x8004 && itemConst[u16(c, 2)] && givesItem(s, c.at)) given.add(itemConst[u16(c, 2)]);
    if (c.op === 0x7b && !isVar(u16(c)) && itemConst[u16(c)]) given.add(itemConst[u16(c)]);
    if (c.op === 0x148 && !isVar(u16(c))) for (const it of martArr(specialPtrs[u16(c)])) addSrc(it, { type: 'mart', where: label(h), map: h, by: 'loja', resolved: true });
  }
  for (const it of given) gift(it);
  const ops = new Set([...s.code.values()].map((c) => c.op));
  if (ops.has(0x147)) for (const c of common) addSrc(c.item, { type: 'mart', where: label(h), map: h, by: 'loja', resolved: true, minBadges: TIER_MIN_BADGES[c.tier] });
  if (ops.has(0x2a6)) for (const p of prizes) addSrc(p.item, { type: 'prize', where: label(h), map: h, by: `${p.coins} fichas`, resolved: true });
  if (ops.has(0x29b)) for (const p of bpItems) addSrc(p.item, { type: 'prize', where: label(h), map: h, by: `troca por ${p.bp} Battle Points`, resolved: true });
}

// ---- 5) estágio (mesma lógica do Platinum)
const people = (group) => Object.values(Object.groupBy(trainers.filter((t) => t.group === group && !t.rematch), (t) => t.name)).map((ts) => ({ name: ts[0].name, teams: ts.map((t) => t.party) }));
let wtHtml = readFileSync(new URL(`../data-sources/pokemythology/${game.walkthrough}.html`, import.meta.url), 'utf8');
for (const [w, r] of Object.entries(game.walkthroughTypos ?? {})) wtHtml = wtHtml.replace(new RegExp(w, 'gi'), (m) => (m === m.toUpperCase() ? r.toUpperCase() : r));
const timeline = buildTimeline(wtHtml, people('Líderes de ginásio'), people('Elite dos Quatro'), { blocks: parseTrainerRuns(wtHtml), sectionRe: SECTIONS_WITH_SUBTITLES });
const GENERIC = ['tower', 'cave', 'forest', 'road', 'path', 'gate', 'lake', 'room', 'building', 'pokecenter', 'mart', 'house', 'gym', 'island'];
const titleKnown = new Map(), textKnown = new Map(), detail = {};
for (const h of ids) { const r = placeStage(timeline, label(h), { generic: GENERIC, earliestText: conn.has(h) }); if (!r) continue; (r.by === 'título' ? titleKnown : textKnown).set(h, r.stage); detail[h] = r; }
const facts = {};
const badgeOfGym = {};
for (const h of ids) { const c = codeOf(h).find((x) => x.op === 0x15c && !isVar(u16(x))); if (c && leaderOfMap[h]) badgeOfGym[BADGES[u16(c)]] = leaderOfMap[h]; }
timeline.leaderOrder.forEach((name, i) => {
  for (const [gym, l] of Object.entries(leaderOfMap)) if (l === name) {
    facts[gym] ??= { stage: i, why: `ginásio de ${name}` };
    for (const town of [...(warp.get(gym) ?? [])].filter((n) => conn.has(n))) { const cited = titleKnown.get(town) ?? textKnown.get(town); facts[town] ??= { stage: Math.min(cited ?? i, i), why: `cidade do ginásio de ${name}` }; }
  }
});
const surfBadge = read('arm9/src/field_move.c').match(/FieldMove_CheckSurf\(const[\s\S]{0,600}?(BADGE_\w+)/)?.[1];
const surfStage = timeline.leaderOrder.indexOf(badgeOfGym[surfBadge]) + 1;
for (const h of ids) {
  if (!conn.has(h) || titleKnown.has(h) || textKnown.has(h) || !H[h].enc) continue;
  const j = encOf(h, VERSIONS[0]);
  if (j && !j.landRate && j.surf.rate > 0 && surfStage > 0) facts[h] ??= { stage: surfStage, why: `rota de mar: só Surf (insígnia ${surfBadge})` };
}
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
// área descrita no pós-jogo mas citada antes, com vizinho já liberado (lib/progress.mjs)
const earlierUsed = applyEarlierMentions(st, detail, conn, warp);
for (const id of ids) {
  if (conn.has(id) || facts[id]) continue;
  const outsides = [...(warp.get(id) ?? [])].filter((n) => conn.has(n) && st.has(n));
  if (new Set(outsides).size >= 2) { const lo = Math.min(...outsides.map((n) => st.get(n))); if (st.get(id) > lo) { st.set(id, lo); detail[id] = { ...(detail[id] ?? {}), passage: outsides.map(label) }; } }
}
for (const id of ids) {
  const r = detail[id];
  if (conn.has(id) || facts[id] || r?.by !== 'texto') continue;
  const door = [...(warp.get(id) ?? [])].find((n) => conn.has(n) && words(label(n)).join(' ') === r.name);
  if (door && st.has(door) && st.get(id) > st.get(door)) { st.set(id, st.get(door)); detail[id] = { ...r, capBy: label(door) }; }
}
for (let p = 0; p < 4; p++) for (const id of ids) {
  if (conn.has(id) || !warp.has(id) || !st.has(id) || facts[id]) continue;
  const outside = [...warp.get(id)].map((n) => st.get(n)).filter((x) => x !== undefined);
  if (outside.length) st.set(id, Math.max(st.get(id), Math.min(...outside)));
}
if (process.env.WHY) for (const id of process.env.WHY.split(',')) console.log('WHY', id, JSON.stringify(detail[id] ?? null), 'st', st.get(id), 'conn', [...(conn.get(id) ?? [])].join('/'), 'warp', [...(warp.get(id) ?? [])].join('/'));
const leaderStage = (name) => { const i = timeline.leaderOrder.indexOf(name); return i >= 0 ? i + 1 : null; };
const leaderTop = (name) => Math.max(0, ...trainers.filter((t) => t.name === name).flatMap((t) => t.party.map((p) => p.level)));
const areaLevel = (h0) => {
  let frontier = [h0]; const seen = new Set([h0]);
  for (let d = 0; d <= 2; d++) {
    const lv = frontier.flatMap((c) => wildByMap[c] ?? []);
    if (lv.length) return { level: Math.min(...lv), near: [...new Set(frontier.filter((c) => wildByMap[c]).map(label))].join(', ') };
    frontier = frontier.flatMap((c) => [...(conn.get(c) ?? []), ...(warp.get(c) ?? [])]).filter((c) => !seen.has(c) && seen.add(c));
  }
  return null;
};
const itemMention = (it) => { const w = words(itemName(it).replace(/_/g, ' ')); if (w.join('').length < 6) return null; return timeline.chunks.find((c) => (' ' + c.text.join(' ') + ' ').includes(' ' + w.join(' ') + ' '))?.stage ?? null; };
for (const [k, list] of [...Object.entries(machines).map(([, l]) => [null, l]), ...Object.entries(items)]) for (const s of list) {
  s.level = areaLevel(s.map)?.level ?? null;
  s.stage = Math.max(s.leader && leaderStage(s.leader) ? leaderStage(s.leader) : 0, st.get(s.map) ?? 0, s.minBadges ?? 0);
  if (s.type === 'gift' && k && !s.leader) { const f = itemMention(k); if (f != null && f > s.stage) { s.stage = f; s.stageBy = 'citação do item no detonado'; } }
}
const giverOf = (it) => [...(items[itemName(it)] ?? []), ...(machines[tm[it]] ?? [])].find((s) => s.type === 'gift');
const gates = {};
{
  const leader = badgeOfGym[surfBadge];
  const giver = giverOf('ITEM_HM03');
  gates.Surf = { level: leaderTop(leader), item: giver?.where ?? null, leader, stage: Math.max(st.get(giver?.map) ?? 0, leaderStage(leader) ?? 0) };
}
for (const [method, it] of [['Old Rod', 'ITEM_OLD_ROD'], ['Good Rod', 'ITEM_GOOD_ROD'], ['Super Rod', 'ITEM_SUPER_ROD'], ['Poké Radar', 'ITEM_POKE_RADAR']]) {
  const giver = giverOf(it);
  gates[method] = giver ? { level: areaLevel(giver.map)?.level ?? 1, item: giver.where, stage: giver.stage ?? st.get(giver.map) ?? null } : { level: 1, item: null, stage: POSTGAME };
}
const firstMention = (sp) => timeline.chunks.find((c) => c.text.includes(sp.replace(/-/g, '')))?.stage ?? null;
for (const v of VERSIONS) for (const [sp, list] of Object.entries(out[v])) for (const s of list) {
  if (s.stage === undefined) s.stage = s.mapId ? st.get(s.mapId) ?? null : null;
  if (s.postgame) { s.stage = POSTGAME; delete s.postgame; }
  if (s.needItem) { const gv = giverOf(s.needItem); s.stage = Math.max(s.stage ?? 0, gv ? st.get(gv.map) ?? 0 : POSTGAME); delete s.needItem; }
  if (['gift', 'static', 'egg'].includes(s.type) && s.stage != null) { const f = firstMention(sp); if (f != null && f > s.stage) { s.stage = f; s.stageBy = 'citação da espécie no detonado'; } }
  if (s.type === 'wild' && gates[s.method]) { s.gate = gates[s.method]; s.stage = Math.max(s.stage ?? 0, gates[s.method].stage ?? 0); }
  if (s.mapId) { const a = areaLevel(s.mapId); if (a) s.area = a; }
}
for (const list of [...Object.values(machines), ...Object.values(items)]) list.sort((a, b) => (a.stage ?? 9) - (b.stage ?? 9));
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
  badges: BADGES.map((b, i) => ({ n: i + 1, name: b.replace(/^BADGE_/, ''), leader: badgeOfGym[b] ?? null })),
  source: `PokeMythology ${game.walkthrough} + matrizes/warps do decomp`, leaderOrder: timeline.leaderOrder, leadersFound: timeline.leadersFound, eliteFound: timeline.eliteFound,
  mapsWithStage: st.size, mapsTotal: ids.length,
  maps: Object.fromEntries(ids.map((h) => [h, { folder: h, label: label(h), stage: st.get(h) ?? null, landmark: H[h].mapsec ?? null, env: H[h].type ?? null }])),
  reviewEarlierMention: Object.entries(detail).filter(([, r]) => r.earlierMention).map(([id, r]) => ({ map: label(id), stage: r.stage, earlier: r.earlierMention })),
  earlierUsed: earlierUsed.map((u) => ({ map: label(u.id), from: u.from, to: u.to, section: u.section })),
};
writeFileSync(new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, versions: out, machines, tutors: {}, items, progress }));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/obtainable-changes.json`, import.meta.url), JSON.stringify(changes, null, 1));
const tmTotal = Object.keys(tm).length, tmWith = Object.keys(tm).filter((it) => machines[tm[it]]?.length).length;
console.log(`[${gameId}] líderes: ${timeline.leaderOrder.join(' > ')} (${timeline.leadersFound}; Elite ${timeline.eliteFound}/4); mapas com estágio ${st.size}/${ids.length}; conexões ${conn.size}; iniciais ${data.starters.species.join(', ')} (nv ${starterLv}, ${data.starters.where})`);
console.log(`  vagantes ${roamers.map((r) => `${monOf(r.species)?.name} nv ${r.level}`).join(', ')}; fósseis nv ${museumLevel}; árvores de mel 21; Feebas em ${read('arm9/src/map_header.c').split('MapHeader_MapIsMtCoronetFeebasRoom')[1]?.match(/MAP_\w+/)?.[0]}`);
console.log(`  TM/HM com origem: ${tmWith}/${tmTotal}${tmWith < tmTotal ? ' — sem: ' + Object.keys(tm).filter((it) => !machines[tm[it]]?.length).join(', ') : ''}`);
for (const v of VERSIONS) console.log(`  ${v}: ${data.pokemon.filter((p) => p.obtainable[v]).length} obtíveis; ${Object.keys(out[v]).length} com fonte direta`);
console.log(`  portas: ${Object.entries(gates).map(([k, x]) => `${k} → ${x.item}${x.leader ? ` + ${x.leader}` : ''} (estágio ${x.stage})`).join('; ')}`);
console.log(`  mudanças de "obtível" (vs PokéAPI): ${changes.length}${changes.length ? ' ex.: ' + changes.slice(0, 16).join(', ') : ''}`);
