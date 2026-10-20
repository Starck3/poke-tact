// Onde obter (Gen 4, pret/pokeplatinum, decomp em JSON) + estágio de progresso → public/data/<jogo>-acquisition.json
// Fontes (ver docs/ADICIONAR-JOGO.md, seção Gen 4):
//   mapas     include/data/map_headers.h (cabeçalho → scripts_/events_/encounters_ + mapLabelTextID + mapType);
//             CONEXÕES: res/field/matrices/*.json (grade de cabeçalhos; células vizinhas diferentes = mapas ligados);
//             warps: res/field/events/*.json warp_events.dest_header_id
//   selvagens res/field/encounters/*.json — terra 12 slots (20,20,10,10,10,10,5,5,4,4,1,1); slots 2–3 trocam para "day"
//             (dia/entardecer) ou "night" (noite/madrugada) e ficam os padrão de manhã; 0–1 = enxame; 4,5,10,11 = Poké Radar;
//             8–9 = dual-slot (cartucho de GBA: fora) — src/overlay006/wild_encounters.c. Água 60,30,5,4,1; Old Rod 60,30,5,4,1;
//             Good/Super Rod 40,40,15,4,1.
//   scripts   GivePokemon SPECIES, nv; GiveEgg; StartLegendaryBattle/StartWildBattle SPECIES, nv; InitNPCTrade NPC_TRADE_X
//             (res/npc_trades/*.json); SetVar VAR_0x8004, ITEM_X + Common_GiveItem…; PokeMartSpecialtiesWithGreeting
//             MART_SPECIALTIES_ID_X (include/data/mart_items.h); lojas comuns por nº de insígnias (src/scrcmd_shop.c)
//   itens     objetos com script 7000+i → i-º ScriptEntry de scripts_visible_items.s; bg_events 8000+i → gHiddenItems[i]
//   HMs       src/field_move_tasks.c (FieldMoves_CheckSurf → BADGE_ID_FEN); insígnia → líder: "GiveBadge BADGE_ID_X" no ginásio
// Uso: node scripts/build-acquisition-gen4.mjs <jogo>
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { buildTimeline, placeStage, propagateStages, applyEarlierMentions, POSTGAME, teamStage, words } from './lib/progress.mjs';
import { parseTrainerRuns, SECTIONS_WITH_SUBTITLES } from './lib/pokemythology.mjs';
import { headerLabel } from './build-trainers-gen4.mjs';

const gameId = process.argv[2] ?? 'platinum';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const has = (p) => existsSync(new URL(p, root));
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const trainers = JSON.parse(readFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), 'utf8')).trainers;
const VERSIONS = game.versions;
const speciesIds = read('generated/species.txt').split(/\r?\n/).map((s) => s.trim());
const moveIds = read('generated/moves.txt').split(/\r?\n/).map((s) => s.trim());
const monOf = (c) => data.pokemon.find((p) => p.id === speciesIds.indexOf(c));
const isSpecies = (c) => !!monOf(c);
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const itemName = (c) => c.replace(/^ITEM_/, '');

// ---- 1) cabeçalhos, conexões (matrizes) e warps
const H = {};
for (const m of read('include/data/map_headers.h').matchAll(/\[(MAP_HEADER_\w+)\] = \{([\s\S]*?)\n    \}/g)) {
  const g = (k) => m[2].match(new RegExp(`\\.${k} = (\\w+)`))?.[1];
  H[m[1]] = { scripts: g('scriptsArchiveID'), events: g('eventsArchiveID'), enc: g('wildEncountersArchiveID'), section: g('mapLabelTextID'), type: g('mapType') };
}
const ids = Object.keys(H).filter((h) => !/EVERYWHERE|NOTHING/.test(h));
const label = (h) => headerLabel(h);
const conn = new Map(), warp = new Map();
const link = (m, a, b) => { if (a === b || !H[a] || !H[b]) return; (m.get(a) ?? m.set(a, new Set()).get(a)).add(b); (m.get(b) ?? m.set(b, new Set()).get(b)).add(a); };
const skip = (h) => !h || /EVERYWHERE|NOTHING/.test(h);
for (const f of readdirSync(new URL('res/field/matrices/', root)).filter((x) => x.endsWith('.json'))) {
  const g = JSON.parse(readFileSync(new URL(`res/field/matrices/${f}`, root), 'utf8')).headers ?? [];
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
    const a = g[y][x];
    if (skip(a)) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) { const b = g[y + dy]?.[x + dx]; if (!skip(b) && b !== a) link(conn, a, b); }
  }
}
const firstHeader = (key, val) => ids.find((h) => H[h][key] === val);
for (const f of readdirSync(new URL('res/field/events/', root)).filter((x) => x.endsWith('.json'))) {
  const src = firstHeader('events', f.replace('.json', ''));
  const j = JSON.parse(readFileSync(new URL(`res/field/events/${f}`, root), 'utf8'));
  for (const w of j.warp_events ?? []) if (src) link(warp, src, w.dest_header_id);
}
const scriptOf = (h) => (H[h]?.scripts && has(`res/field/scripts/${H[h].scripts}.s`) ? read(`res/field/scripts/${H[h].scripts}.s`) : '');
const eventsOf = (h) => (H[h]?.events && has(`res/field/events/${H[h].events}.json`) ? JSON.parse(read(`res/field/events/${H[h].events}.json`)) : null);

// ---- 2) selvagens
const LAND = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1], WATER = [60, 30, 5, 4, 1], OLD = [60, 30, 5, 4, 1], GOOD = [40, 40, 15, 4, 1];
const out = Object.fromEntries(VERSIONS.map((v) => [v, {}]));
const push = (v, sp, src) => { const mon = monOf(sp); if (mon) (out[v][mon.name] ??= []).push(src); };
const wildByMap = {};
const addAgg = (v, h, method, slots, extra = {}) => {
  const agg = {};
  for (const s of slots) { if (!isSpecies(s.sp)) continue; const a = (agg[s.sp] ??= { min: s.min, max: s.max, pct: 0 }); a.min = Math.min(a.min, s.min); a.max = Math.max(a.max, s.max); a.pct += s.pct; }
  for (const [sp, a] of Object.entries(agg)) { push(v, sp, { type: 'wild', where: label(h), mapId: h, method, min: a.min, max: a.max, pct: Math.max(1, Math.round(a.pct)), ...extra }); (wildByMap[h] ??= []).push(a.min); }
};
for (const h of ids) {
  const enc = H[h].enc;
  if (!enc || enc === 'ENCOUNTERS_NONE' || !has(`res/field/encounters/${enc}.json`)) continue;
  const j = JSON.parse(read(`res/field/encounters/${enc}.json`));
  for (const v of VERSIONS) {
    const land = j.land_encounters ?? [];
    if (j.land_rate > 0 && land.length === 12) {
      const base = land.map((s, i) => ({ sp: s.species, min: s.level, max: s.level, pct: LAND[i] }));
      // padrão (manhã nos slots 2–3; todos os horários nos demais)
      addAgg(v, h, 'Grama/caverna', base.filter((_, i) => i !== 2 && i !== 3));
      addAgg(v, h, 'Grama/caverna', base.filter((_, i) => i === 2 || i === 3), { times: ['manhã'] });
      if (j.day?.length === 2) addAgg(v, h, 'Grama/caverna', j.day.map((sp, k) => ({ sp, min: land[2 + k].level, max: land[2 + k].level, pct: LAND[2 + k] })), { times: ['dia'] });
      if (j.night?.length === 2) addAgg(v, h, 'Grama/caverna', j.night.map((sp, k) => ({ sp, min: land[2 + k].level, max: land[2 + k].level, pct: LAND[2 + k] })), { times: ['noite'] });
      if (j.swarms?.length === 2) addAgg(v, h, 'Grama/caverna', j.swarms.map((sp, k) => ({ sp, min: land[k].level, max: land[k].level, pct: LAND[k] })), { swarm: true, detail: 'enxame (notícia na TV)' });
      // Trophy Garden: 2 espécies sorteadas por dia da lista daily_encounters entram nos slots 6–7 (ReplaceTrophyGardenEncounters)
      if (j.daily_encounters?.length) addAgg(v, h, 'Grama/caverna', j.daily_encounters.map((sp) => ({ sp, min: land[6].level, max: land[7].level, pct: ((LAND[6] + LAND[7]) * 2) / j.daily_encounters.length / 2 })), { detail: 'sorteio diário do Trophy Garden' });
      if (j.radar?.length === 4) addAgg(v, h, 'Poké Radar', j.radar.map((sp, k) => { const i = [4, 5, 10, 11][k]; return { sp, min: land[i].level, max: land[i].level, pct: LAND[i] }; }));
    }
    const water = (list, rates, method) => { if (list?.length) addAgg(v, h, method, list.map((s, i) => ({ sp: s.species, min: s.level_min, max: s.level_max, pct: rates[i] ?? 0 }))); };
    if (j.surf_rate > 0) water(j.surf_encounters, WATER, 'Surf');
    if (j.old_rod_rate > 0) water(j.old_rod_encounters, OLD, 'Old Rod');
    if (j.good_rod_rate > 0) water(j.good_rod_encounters, GOOD, 'Good Rod');
    if (j.super_rod_rate > 0) water(j.super_rod_encounters, GOOD, 'Super Rod');
  }
}

// ---- 2b) fontes especiais (cada uma pela regra do código)
{
  // árvores de mel (src/overlay005/honey_tree.c): árvore comum → "common" 70% / "uncommon" 20% / nada 10%; slots 40,20,20,10,5,5.
  // A tabela "rare" (Munchlax) só nas 4 "árvores do Munchlax" escolhidas pelo ID do treinador, com 1%.
  const ht = JSON.parse(read('res/field/encounters/encounters_honey_tree.json'));
  const trees = [...read('src/overlay005/honey_tree.c').split('sHoneyTreeMapHeaderIDs')[1].split('};')[0].matchAll(/MAP_HEADER_\w+/g)].map((m) => m[0]);
  const SLOT = [40, 20, 20, 10, 5, 5];
  // nível 5–15: wild_encounters.c CreateWildMon_HoneyTree ("5 + LCRNG_RandMod(15 - 5 + 1)")
  for (const v of VERSIONS) for (const h of trees) {
    addAgg(v, h, 'Árvore de mel', [...ht.common.map((sp, i) => ({ sp, min: 5, max: 15, pct: 0.7 * SLOT[i] })), ...ht.uncommon.map((sp, i) => ({ sp, min: 5, max: 15, pct: 0.2 * SLOT[i] }))], { detail: 'passar Honey na árvore e voltar depois de 6 h' });
    addAgg(v, h, 'Árvore de mel', ht.rare.map((sp, i) => ({ sp, min: 5, max: 15, pct: 0.01 * SLOT[i] })), { detail: 'só nas 4 árvores do Munchlax (definidas pelo ID do treinador)' });
  }
  // Great Marsh (wild_encounters.c ReplaceGreatMarshDailyEncounters): durante o Safari, a espécie do dia entra nos slots 6–7
  const gm = JSON.parse(read('res/field/encounters/encounters_great_marsh_lookout.json'));
  for (const v of VERSIONS) for (const h of ids.filter((x) => /GREAT_MARSH/.test(x) && H[x].enc && H[x].enc !== 'ENCOUNTERS_NONE')) {
    const land = has(`res/field/encounters/${H[h].enc}.json`) ? JSON.parse(read(`res/field/encounters/${H[h].enc}.json`)).land_encounters : null;
    if (!land?.length) continue;
    const mk = (list) => [...new Set(list)].map((sp) => ({ sp, min: land[6].level, max: land[7].level, pct: 10 / new Set(list).size }));
    addAgg(v, h, 'Grama/caverna', mk(gm.before_national_dex ?? []), { detail: 'espécie do dia da Great Marsh (Safari)' });
    addAgg(v, h, 'Grama/caverna', mk(gm.after_national_dex ?? []), { detail: 'espécie do dia da Great Marsh (Safari), depois da Pokédex Nacional', postgame: true });
  }
  // Feebas (map_header.c MapHeader_HasFeebasTiles; wild_encounters.c): em um ponto de Feebas qualquer vara dá Feebas nv 10–20
  for (const f of readdirSync(new URL('res/field/encounters/', root)).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(read(`res/field/encounters/${f}`));
    if (!j.elusive_rod_encounter) continue;
    const h = ids.find((x) => H[x].enc === f.replace('.json', ''));
    if (h) for (const v of VERSIONS) push(v, j.elusive_rod_encounter.species, { type: 'wild', where: label(h), mapId: h, method: 'Old Rod', min: 10, max: 20, pct: 100, detail: 'só nos pontos de Feebas da água (sorteados)' });
  }
}

// ---- 3) presentes, ovos, estáticos, trocas, iniciais
const tradeOf = {};
for (const f of readdirSync(new URL('res/npc_trades/', root)).filter((x) => x.endsWith('.json'))) tradeOf[`NPC_TRADE_${f.replace('.json', '').toUpperCase()}`] = JSON.parse(read(`res/npc_trades/${f}`));
const ch = read('src/choose_starter/choose_starter_app.c');
const starterSp = [...ch.matchAll(/#define STARTER_OPTION_\d\s+(SPECIES_\w+)/g)].map((m) => m[1]);
const starterLv = Number(read('res/field/scripts/scripts_route_201.s').match(/GetPlayerStarterSpecies VAR_0x8000\s*\n\s*GivePokemon VAR_0x8000, (\d+)/)?.[1] ?? 5);
for (const v of VERSIONS) {
  for (const h of ids) {
    const s = scriptOf(h);
    if (!s) continue;
    for (const m of s.matchAll(/GivePokemon (SPECIES_\w+), (\d+)/g)) push(v, m[1], { type: 'gift', where: label(h), mapId: h, level: Number(m[2]) });
    for (const m of s.matchAll(/GiveEgg (SPECIES_\w+)/g)) push(v, m[1], { type: 'egg', where: label(h), mapId: h });
    // Regis: o script exige um Regigigas de EVENTO no time (CheckPartyHasFatefulEncounterRegigigas) e o Regigigas exige os
    // três Regis (CheckHasAllLegendaryTitansInParty) → sem evento nenhum dos quatro sai no jogo (a PokéAPI está certa)
    const eventOnly = /CheckPartyHasFatefulEncounter\w*|CheckHasAllLegendaryTitansInParty/.test(s);
    for (const m of s.matchAll(/(?:StartLegendaryBattle|StartWildBattle) (SPECIES_\w+), (\d+)/g)) push(v, m[1], eventOnly ? { type: 'event', where: label(h), mapId: h, level: Number(m[2]), detail: 'exige Pokémon de evento no time (Regigigas de evento / os três Regis)' } : { type: 'static', where: label(h), mapId: h, level: Number(m[2]) });
    for (const m of s.matchAll(/InitNPCTrade (NPC_TRADE_\w+)/g)) {
      const t = tradeOf[m[1]];
      if (t && isSpecies(t.species) && monOf(t.requestedSpecies)) push(v, t.species, { type: 'trade', where: label(h), mapId: h, want: monOf(t.requestedSpecies).name, detail: `troca por ${monOf(t.requestedSpecies).name}` });
    }
  }
  // vagantes: "ActivateRoamingPokemon ROAMING_SLOT_X" no script do mapa; espécie e nível em src/roaming_pokemon.c
  // (Mesprit/Cresselia nv 50, aves de Kanto nv 60; o slot do Darkrai nunca é ativado por script → fora)
  const rp = read('src/roaming_pokemon.c');
  for (const h of ids) for (const m of scriptOf(h).matchAll(/ActivateRoamingPokemon (ROAMING_SLOT_\w+)/g)) {
    const b = rp.match(new RegExp(`case ${m[1]}:\\s*\\n\\s*species = (SPECIES_\\w+);\\s*\\n\\s*level = (\\d+);`));
    if (b && !(out[v][monOf(b[1])?.name] ?? []).some((x) => x.type === 'roamer')) push(v, b[1], { type: 'roamer', where: 'pelo mapa (vagante)', mapId: h, level: Number(b[2]), detail: `vaga por Sinnoh depois do evento em ${label(h)}` });
  }
  // fósseis: escavados no Subsolo (precisa do Explorer Kit) e revividos onde o script chama o reviver (scrcmd_fossil.c: item → espécie)
  const museum = ids.find((h) => /Fossil|fossil/.test(scriptOf(h)) && /MINING_MUSEUM/.test(h));
  if (museum) for (const m of read('src/scrcmd_fossil.c').matchAll(/\.item = (ITEM_\w+), \.species = (SPECIES_\w+)/g)) push(v, m[2], { type: 'gift', where: label(museum), mapId: museum, level: 20 /* scripts_mining_museum.s: GivePokemon VAR_REVIVED_POKEMON_SPECIES, 20 */, detail: `reviver ${itemName(m[1]).replace(/_/g, ' ').toLowerCase()} escavado no Subsolo`, needItem: 'ITEM_EXPLORER_KIT' });
  for (const sp of starterSp) push(v, sp, { type: 'starter', where: 'Route 201 — maleta do Prof. Rowan', level: starterLv, detail: 'um dos três iniciais (os outros dois só por troca)', stage: 0 });
}
data.starters = { where: 'Route 201 — maleta do Prof. Rowan', level: starterLv, species: starterSp.map((c) => monOf(c).name) };

// ---- 4) TMs, HMs e itens
const tm = {};
for (const f of readdirSync(new URL('res/items/data/', root)).filter((x) => /^(tm|hm)\d+\.json$/.test(x))) { const j = JSON.parse(read(`res/items/data/${f}`)); tm[`ITEM_${j.name}`] = moveIdOf.get(moveIds.indexOf(j.teachesMove)); }
const machines = {}, items = {};
const addSrc = (it, src) => { if (tm[it]) (machines[tm[it]] ??= []).push(src); else (items[itemName(it)] ??= []).push(src); };
const leaderOfMap = {};
for (const t of trainers.filter((x) => x.group === 'Líderes de ginásio')) for (const mp of t.map) { const h = ids.find((k) => label(k) === mp); if (h) leaderOfMap[h] = t.name; }
const visible = [...read('res/field/scripts/scripts_visible_items.s').matchAll(/^\s*ScriptEntry (\w+)/gm)].map((m) => m[1]);
const visText = read('res/field/scripts/scripts_visible_items.s');
// itens visíveis usam VAR_0x8008 (VisibleItems_TryGiveItem); presentes de NPC usam VAR_0x8004 (Common_GiveItem…)
const visItem = (lbl) => visText.split(new RegExp(`^${lbl}:\\s*$`, 'm'))[1]?.match(/SetVar VAR_0x800[48], (ITEM_\w+)/)?.[1];
const hidden = [...read('include/data/field/hidden_items.h').matchAll(/HIDDEN_ITEM_ENTRY\((ITEM_\w+)/g)].map((m) => m[1]);
const martTxt = read('include/data/mart_items.h');
const specialties = (id) => { const arr = martTxt.match(new RegExp(`\\[${id}\\] = (\\w+)`))?.[1]; const body = arr && martTxt.split(new RegExp(`const u16 ${arr}\\[\\] = \\{`))[1]?.split('};')[0]; return body ? [...body.matchAll(/ITEM_\w+/g)].map((x) => x[0]) : []; };
const common = [...martTxt.split('PokeMartCommonItems[]')[1].split('};')[0].matchAll(/\{ (ITEM_\w+), 0x(\d+) \}/g)].map((m) => ({ item: m[1], tier: parseInt(m[2], 16) }));
const TIER_MIN_BADGES = { 1: 0, 2: 1, 3: 3, 4: 5, 5: 7, 6: 8 }; // scrcmd_shop.c: 0 → faixa 1; 1–2 → 2; 3–4 → 3; 5–6 → 4; 7 → 5; 8 → 6
for (const h of ids) {
  const ev = eventsOf(h);
  for (const o of ev?.object_events ?? []) if (typeof o.script === 'number' && o.script >= 7000 && o.script < 8000) { const it = visItem(visible[o.script - 7000]); if (it) addSrc(it, { type: 'ground', where: label(h), map: h, x: o.x, y: o.z, by: 'item no chão', resolved: true }); }
  for (const b of ev?.bg_events ?? []) if (b.script >= 8000 && b.script < 8800 && hidden[b.script - 8000]) addSrc(hidden[b.script - 8000], { type: 'hidden', where: label(h), map: h, x: b.x, y: b.z, by: 'escondido', resolved: true });
  const s = scriptOf(h);
  // presente de NPC: "SetVar VAR_0x8004, ITEM_X" no script de um mapa que entrega item (Common_GiveItem…/AddItem…). O comando
  // de entrega pode estar em outro rótulo, depois de uma pergunta (Old Rod no portão da Route 218)
  if (/Common_GiveItem|AddItem|GiveItemQuantity/.test(s)) for (const it of new Set([...s.matchAll(/SetVar VAR_0x8004, (ITEM_\w+)/g)].map((m) => m[1]))) {
    const leader = leaderOfMap[h];
    addSrc(it, { type: 'gift', where: label(h), map: h, by: leader ? `líder ${leader}` : 'NPC', resolved: true, ...(leader && { leader }) });
  }
  // prêmios do Game Corner: "GetGameCornerPrizeData" (Veilstone City Prize Exchange) → src/scrcmd_game_corner_prize.c
  // sGameCornerPrizeData { ITEM_X, fichas } (TM58, TM75, TM44, TM10, TM74, TM68 só saem daqui)
  if (/GetGameCornerPrizeData/.test(s)) for (const m of read('src/scrcmd_game_corner_prize.c').matchAll(/\{ (ITEM_\w+), (\d+) \}/g)) addSrc(m[1], { type: 'prize', where: label(h), map: h, by: `${m[2]} fichas`, resolved: true });
  // troca por Battle Points (scrcmd.c ScrCmd_PokeMartFrontier: listas estáticas) — pós-jogo
  if (/PokeMartFrontier/.test(s)) {
    const fr = read('src/scrcmd.c').split('static BOOL ScrCmd_PokeMartFrontier').at(-1).split(/\n}\n/)[0]; // a 1ª ocorrência é o protótipo
    for (const it of new Set([...fr.matchAll(/ITEM_\w+/g)].map((x) => x[0]))) addSrc(it, { type: 'prize', where: label(h), map: h, by: 'troca por Battle Points', resolved: true });
  }
  for (const m of s.matchAll(/PokeMartSpecialtiesWithGreeting (MART_SPECIALTIES_ID_\w+)/g)) for (const it of specialties(m[1])) addSrc(it, { type: 'mart', where: label(h), map: h, by: 'loja', resolved: true });
  if (/PokeMartCommonWithGreeting/.test(s)) for (const c of common) addSrc(c.item, { type: 'mart', where: label(h), map: h, by: 'loja', resolved: true, minBadges: TIER_MIN_BADGES[c.tier] });
}

// ---- 4b) encontro único condicionado a evento de distribuição DA PRÓPRIA ESPÉCIE no mesmo mapa
// ("CheckDistributionEvent DISTRIBUTION_EVENT_DARKRAI" na Newmoon Island; _ARCEUS no Hall of Origin) = só por evento.
// Dialga/Palkia ficam: o mapa deles checa DISTRIBUTION_EVENT_ARCEUS (para liberar o Hall of Origin), não a própria espécie.
// (Uma regra por "CheckItem de item sem origem" marcava Dialga/Palkia por engano.)
for (const v of VERSIONS) for (const [sp, list] of Object.entries(out[v])) for (const s of list) {
  if (s.type !== 'static' || !s.mapId) continue;
  const evs = [...scriptOf(s.mapId).matchAll(/CheckDistributionEvent DISTRIBUTION_EVENT_(\w+)/g)].map((m) => m[1].toLowerCase());
  if (evs.includes(sp.replace(/-.*/, ''))) { s.type = 'event'; s.detail = 'só com o evento de distribuição dessa espécie'; }
}

// ---- 5) estágio
const people = (group) => Object.values(Object.groupBy(trainers.filter((t) => t.group === group && !t.rematch), (t) => t.name)).map((ts) => ({ name: ts[0].name, teams: ts.map((t) => t.party) }));
let wtHtml = readFileSync(new URL(`../data-sources/pokemythology/${game.walkthrough}.html`, import.meta.url), 'utf8');
for (const [w, r] of Object.entries(game.walkthroughTypos ?? {})) wtHtml = wtHtml.replace(new RegExp(w, 'gi'), (m) => (m === m.toUpperCase() ? r.toUpperCase() : r));
const timeline = buildTimeline(wtHtml, people('Líderes de ginásio'), people('Elite dos Quatro'), { blocks: parseTrainerRuns(wtHtml), sectionRe: SECTIONS_WITH_SUBTITLES });
const GENERIC = ['tower', 'cave', 'forest', 'road', 'path', 'gate', 'lake', 'room', 'building', 'pokecenter', 'mart', 'house', 'gym', 'island'];
const titleKnown = new Map(), textKnown = new Map(), detail = {};
for (const h of ids) { const r = placeStage(timeline, label(h), { generic: GENERIC, earliestText: conn.has(h) }); if (!r) continue; (r.by === 'título' ? titleKnown : textKnown).set(h, r.stage); detail[h] = r; }
// fatos do código: casa do jogador = 0 (spawn inicial); ginásio do N-º líder = N-1 e a cidade dele no máximo N-1
const facts = {};
const start = read('src/spawn_locations.c').match(/\{ (MAP_HEADER_\w+),/)?.[1];
if (start) facts[start] = { stage: 0, why: 'início do jogo (spawn_locations.c)' };
const badgeOfGym = {};
for (const h of ids) { const b = scriptOf(h).match(/GiveBadge (BADGE_ID_\w+)/)?.[1]; if (b && leaderOfMap[h]) badgeOfGym[b] = leaderOfMap[h]; }
timeline.leaderOrder.forEach((name, i) => {
  for (const [gym, l] of Object.entries(leaderOfMap)) if (l === name) {
    facts[gym] ??= { stage: i, why: `ginásio de ${name}` };
    for (const town of [...(warp.get(gym) ?? [])].filter((n) => conn.has(n))) { const cited = titleKnown.get(town) ?? textKnown.get(town); facts[town] ??= { stage: Math.min(cited ?? i, i), why: `cidade do ginásio de ${name}` }; }
  }
});
// rota de MAR (sem encontros em terra, com Surf) que o detonado não cita: piso = insígnia do Surf (field_move_tasks.c →
// líder pelo GiveBadge). Sem isso as Routes 219/220 herdavam o estágio 0 de Sandgem pela matriz (e a 221 delas).
// a checagem fica a ~500 caracteres do nome da função (janela de 200 não alcançava: Surf saía sem líder)
const surfBadge = read('src/field_move_tasks.c').match(/FieldMoves_CheckSurf\(const[\s\S]{0,1200}?(BADGE_ID_\w+)/)?.[1];
const surfStage = timeline.leaderOrder.indexOf(badgeOfGym[surfBadge]) + 1;
const seaRoute = new Set();
for (const h of ids) {
  if (!conn.has(h) || titleKnown.has(h) || textKnown.has(h) || !H[h].enc || !has(`res/field/encounters/${H[h].enc}.json`)) continue;
  const j = JSON.parse(read(`res/field/encounters/${H[h].enc}.json`));
  if (!j.land_rate && j.surf_rate > 0 && surfStage > 0) { facts[h] ??= { stage: surfStage, why: `rota de mar: só Surf (insígnia ${surfBadge})` }; seaRoute.add(h); }
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
// passagem: interior com portas para 2+ mapas EXTERNOS (portão Route 218 ↔ Jubilife, onde se ganha a Old Rod) não fica depois
// do lado mais cedo (mesma regra da Gen 2)
for (const id of ids) {
  if (conn.has(id) || facts[id]) continue;
  const outsides = [...(warp.get(id) ?? [])].filter((n) => conn.has(n) && st.has(n));
  if (new Set(outsides).size >= 2) { const lo = Math.min(...outsides.map((n) => st.get(n))); if (st.get(id) > lo) { st.set(id, lo); detail[id] = { ...(detail[id] ?? {}), passage: outsides.map(label) }; } }
}
// interior citado só pelo NOME DA CIDADE (a caverna de Celestic casou "celestic town" num trecho do pós-jogo) → estágio da porta
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
// presente de item: o NPC pode só entregar depois de um evento (Poké Radar: o Rowan dá depois da Pokédex Nacional, no
// laboratório do estágio 0) → também o estágio da 1ª citação do item no detonado (o maior vale)
const itemMention = (it) => { const w = words(itemName(it).replace(/_/g, ' ')); if (w.join('').length < 6) return null; return timeline.chunks.find((c) => (' ' + c.text.join(' ') + ' ').includes(' ' + w.join(' ') + ' '))?.stage ?? null; };
for (const [k, list] of [...Object.entries(machines).map(([m, l]) => [null, l]), ...Object.entries(items)]) for (const s of list) {
  s.level = areaLevel(s.map)?.level ?? null;
  s.stage = Math.max(s.leader && leaderStage(s.leader) ? leaderStage(s.leader) : 0, st.get(s.map) ?? 0, s.minBadges ?? 0);
  if (s.type === 'gift' && k && !s.leader) { const f = itemMention(k); if (f != null && f > s.stage) { s.stage = f; s.stageBy = 'citação do item no detonado'; } }
}
const fm = read('src/field_move_tasks.c');
const giverOf = (it) => [...(items[itemName(it)] ?? []), ...(machines[tm[it]] ?? [])].find((s) => s.type === 'gift');
const gates = {};
{
  const bit = surfBadge;
  const leader = badgeOfGym[bit];
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
  if (s.needItem) { const g = giverOf(s.needItem); s.stage = Math.max(s.stage ?? 0, g ? st.get(g.map) ?? 0 : POSTGAME); delete s.needItem; }
  if (['gift', 'static', 'egg'].includes(s.type) && s.stage != null) { const f = firstMention(sp); if (f != null && f > s.stage) { s.stage = f; s.stageBy = 'citação da espécie no detonado'; } }
  if (s.type === 'wild' && gates[s.method]) { s.gate = gates[s.method]; s.stage = Math.max(s.stage ?? 0, gates[s.method].stage ?? 0); }
  if (s.mapId) { const a = areaLevel(s.mapId); if (a) s.area = a; }
}
for (const list of [...Object.values(machines), ...Object.values(items)]) list.sort((a, b) => (a.stage ?? 9) - (b.stage ?? 9));
const trainerStage = {};
for (const t of trainers.filter((x) => ['Líderes de ginásio', 'Elite dos Quatro', 'Campeão', 'Rival'].includes(x.group))) { const s0 = teamStage(timeline, t.party); if (s0 != null) trainerStage[t.key] = s0; }

// ---- 6) obtível
const USABLE = new Set(['wild', 'gift', 'static', 'trade', 'starter', 'egg', 'roamer']);
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
const BADGES = [...read('generated/badges.txt').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)];
const progress = {
  trainerStage,
  badges: BADGES.map((b, i) => ({ n: i + 1, name: b.replace(/^BADGE_ID_/, ''), leader: badgeOfGym[b] ?? null })),
  source: `PokeMythology ${game.walkthrough} + matrizes/warps do decomp`, leaderOrder: timeline.leaderOrder, leadersFound: timeline.leadersFound, eliteFound: timeline.eliteFound,
  mapsWithStage: st.size, mapsTotal: ids.length,
  maps: Object.fromEntries(ids.map((h) => [h, { folder: h, label: label(h), stage: st.get(h) ?? null, landmark: H[h].section ?? null, env: H[h].type ?? null }])),
  reviewEarlierMention: Object.entries(detail).filter(([, r]) => r.earlierMention).map(([id, r]) => ({ map: label(id), stage: r.stage, earlier: r.earlierMention })),
  earlierUsed: earlierUsed.map((u) => ({ map: label(u.id), from: u.from, to: u.to, section: u.section })),
};
writeFileSync(new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, versions: out, machines, tutors: {}, items, progress }));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/obtainable-changes.json`, import.meta.url), JSON.stringify(changes, null, 1));
const tmTotal = Object.keys(tm).length, tmWith = Object.keys(tm).filter((it) => machines[tm[it]]?.length).length;
console.log(`[${gameId}] líderes: ${timeline.leaderOrder.join(' > ')} (${timeline.leadersFound}; Elite ${timeline.eliteFound}/4); mapas com estágio ${st.size}/${ids.length}; conexões ${conn.size}; iniciais ${data.starters.species.join(', ')}`);
console.log(`  TM/HM com origem: ${tmWith}/${tmTotal}${tmWith < tmTotal ? ' — sem: ' + Object.keys(tm).filter((it) => !machines[tm[it]]?.length).join(', ') : ''}`);
for (const v of VERSIONS) console.log(`  ${v}: ${data.pokemon.filter((p) => p.obtainable[v]).length} obtíveis; ${Object.keys(out[v]).length} com fonte direta`);
console.log(`  portas: ${Object.entries(gates).map(([k, x]) => `${k} → ${x.item}${x.leader ? ` + ${x.leader}` : ''} (estágio ${x.stage})`).join('; ')}`);
console.log(`  mudanças de "obtível" (vs PokéAPI): ${changes.length}${changes.length ? ' ex.: ' + changes.slice(0, 14).join(', ') : ''}`);
