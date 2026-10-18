// Onde obter (HeartGold/SoulSilver, decomp PARCIAL pret/pokeheartgold) + estágio → public/data/<jogo>-acquisition.json
// Fontes (ver docs/ADICIONAR-JOGO.md, seção HGSS):
//   mapas     src/data/map_headers.h ([MAP_X] = { .wildEncounterBank = ENCDATA_<código>, .scriptsBank = scr_seq_N_<código>_bin,
//             .eventsBank = NARC_zone_event_N_<código>_bin, .mapType }); include/constants/maps.h (MAP_X … // MAP_<código>)
//             warps: zone_event/<código>.json warps[].header. CONEXÕES (matriz binária no HGSS): as do pret/pokecrystal
//             (data/maps/attributes.asm) casadas por NOME — Johto/Kanto têm a mesma geografia; mapas novos (Route 47/48,
//             Safari Zone Gate…) ficam só com warps e texto do detonado.
//   selvagens files/fielddata/encountdata/gs_enc_data.json; regras em src/field/encounter_check.c: terra 12 slots
//             (20,20,10,10,10,10,5,5,4,4,1,1) com espécie por horário (morn = manhã; day = dia/entardecer; nite = noite/madrugada);
//             Surf 60,30,5,4,1; varas 40,30,15,10,5 (noite: Good Rod slot 3 e Super Rod slot 1 = nightFish); Rock Smash 80,20;
//             surto (src/unk_02097F6C.c sSwarmMapLUT: 20 mapas, tipo terra/surf/pesca) — terra slots 0–1, surf slot 0,
//             Old Rod slot 2, Good Rod 0/2/3, Super Rod todos; Hoenn/Sinnoh Sound (rádio): slots 2–5, só com a Pokédex
//             Nacional (pokemon_music.c: quarta = Hoenn, quinta = Sinnoh) → pós-jogo
//   Headbutt  files/arc/headbutt.json (slots 50,15,15,10,5,5 — headbutt.c); comum × rara pelo ID do treinador; tutor no Ilex Forest
//   Concurso  files/data/mushi/mushi_encount.csv (overlay_bug_contest.c: conjunto 0 sem Pokédex Nacional; com ela, dia/2)
//   Safari    files/arc/safari_enc.json (áreas montáveis; 10 slots de terra por horário)
//   scripts   GiveMon/GiveEgg/WildBattle/CreateRoamer/LoadNPCTrade com os desvios HG×SS resolvidos (lib/hgss-script.mjs)
//   itens     itembalis std 7000+i → scr_seq_0141 (SetVar VAR_SPECIAL_x8008, nº do item); escondidos std 8000+i → sHiddenItemParam[i];
//             presentes "SetVar VAR_SPECIAL_x8004, ITEM_X" + std_give_item/std_obtain_item, "GiveItemNoCheck ITEM_X";
//             lojas std_pokemart (faixas por nº de insígnias, scrcmd_mart.c) e std_special_mart N → _0210FA3C[N]
// FORA: trocas com NPC (a/1/1/2 binário: só a espécie OFERECIDA pelo nome da constante NPC_TRADE_<APELIDO>_<ESPÉCIE>).
// Uso: node scripts/build-acquisition-hgss.mjs <jogo>
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { buildTimeline, placeStage, propagateStages, POSTGAME, teamStage, words } from './lib/progress.mjs';
import { parseTrainerRuns, SECTIONS_WITH_SUBTITLES } from './lib/pokemythology.mjs';
import { loadHgss, mapLabel } from './lib/gen4-hgss.mjs';
import { parseScript } from './lib/hgss-script.mjs';

const gameId = process.argv[2] ?? 'heartgold-soulsilver';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const has = (p) => existsSync(new URL(p, root));
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const trainers = JSON.parse(readFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), 'utf8')).trainers;
const VERSIONS = game.versions; // ['heartgold', 'soulsilver']
const VKEY = { heartgold: ['HEARTGOLD', 'gold'], soulsilver: ['SOULSILVER', 'silver'] };
const g = loadHgss(root);
const byDex = new Map(data.pokemon.map((p) => [p.id, p]));
const monOf = (c) => (c == null ? null : /^\d+$/.test(String(c)) ? byDex.get(Number(c)) : byDex.get(g.speciesId[c]));
const isSpecies = (c) => !!monOf(c);
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const itemName = (c) => c.replace(/^ITEM_/, '');
const ITEM_ALIAS = Object.fromEntries([...read('include/constants/items.h').matchAll(/#define ((?:TM|HM)_\w+)\s+(ITEM_\w+)/g)].map((m) => [m[1], m[2]]));
const itemById = Object.fromEntries([...read('include/constants/items.h').matchAll(/#define (ITEM_\w+)\s+(\d+)/g)].map((m) => [Number(m[2]), m[1]]));
// valor por versão: "X" ou { HEARTGOLD: X, SOULSILVER: Y } / { gold: X, silver: Y }
const pick = (x, v) => (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).some((k) => VKEY[v].includes(k) || VKEY[v === 'heartgold' ? 'soulsilver' : 'heartgold'].includes(k)) ? VKEY[v].map((k) => x[k]).find((y) => y !== undefined) : x);

// ---- 1) cabeçalhos, conexões e warps
const codeOf = {};
for (const m of read('include/constants/maps.h').matchAll(/#define (MAP_\w+)\s+\d+\s*\/\/ MAP_(\w+)/g)) codeOf[m[1]] = m[2];
const H = {};
for (const m of read('src/data/map_headers.h').matchAll(/\[(MAP_\w+)\] = \{([\s\S]*?)\n\s*\},/g)) {
  const f = (k) => m[2].match(new RegExp(`\\.${k} = (\\w+)`))?.[1];
  H[m[1]] = { code: codeOf[m[1]], enc: f('wildEncounterBank'), scripts: f('scriptsBank')?.match(/^scr_seq_\d+_(\w+?)_bin$/)?.[1], events: f('eventsBank')?.match(/^NARC_zone_event_\d+_(\w+?)_bin$/)?.[1], section: f('mapsec'), type: f('mapType') };
}
const ids = Object.keys(H).filter((h) => !/EVERYWHERE|NOTHING|UNUSED/.test(h));
const label = (h) => mapLabel(h);
const conn = new Map(), warp = new Map();
const link = (m, a, b) => { if (a === b || !H[a] || !H[b]) return; (m.get(a) ?? m.set(a, new Set()).get(a)).add(b); (m.get(b) ?? m.set(b, new Set()).get(b)).add(a); };
// conexões do pokecrystal por nome: NEW_BARK_TOWN → MAP_NEW_BARK; ROUTE_10_NORTH → MAP_ROUTE_10; SILVER_CAVE_OUTSIDE → MAP_MOUNT_SILVER
const crystal = new URL(`../data-sources/${GAMES.crystal.asmDecomp.dir}/data/maps/attributes.asm`, import.meta.url);
const ALIAS = { SILVER_CAVE_OUTSIDE: 'MAP_MOUNT_SILVER' };
const toHgss = (c) => ALIAS[c] ?? [c, c.replace(/_(CITY|TOWN)$/, ''), c.replace(/_NORTH$/, '')].map((x) => `MAP_${x}`).find((x) => H[x]);
const unmatched = new Set();
if (existsSync(crystal)) {
  let cur = null;
  for (const line of readFileSync(crystal, 'utf8').split('\n')) {
    const a = line.match(/^\s*map_attributes\s+\w+,\s*(\w+)/);
    if (a) { cur = a[1]; continue; }
    const c = line.match(/^\s*connection\s+\w+,\s*\w+,\s*(\w+)/);
    if (c && cur) { const x = toHgss(cur), y = toHgss(c[1]); if (!x) unmatched.add(cur); if (!y) unmatched.add(c[1]); if (x && y) link(conn, x, y); }
  }
}
const eventsOf = (h) => { const f = H[h]?.events && readdirSync(new URL('files/fielddata/eventdata/zone_event/', root)).find((x) => x.replace(/^\d+_/, '') === `${H[h].events}.json`); return f ? JSON.parse(read(`files/fielddata/eventdata/zone_event/${f}`)) : null; };
for (const h of ids) for (const w of eventsOf(h)?.warps ?? []) link(warp, h, w.header);
const scrFiles = Object.fromEntries(readdirSync(new URL('files/fielddata/script/scr_seq/', root)).filter((x) => /^scr_seq_\d+_\w+\.s$/.test(x)).map((x) => [x.replace(/^scr_seq_\d+_/, '').replace('.s', ''), x]));
const scriptCache = {};
const scriptOf = (h) => { const c = H[h]?.scripts; if (!c || !scrFiles[c]) return null; return (scriptCache[c] ??= parseScript(read(`files/fielddata/script/scr_seq/${scrFiles[c]}`))); };
const rawOf = (h) => (scriptOf(h)?.lines.join('\n') ?? '');

// ---- 2) selvagens
const LAND = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1], WATER = [60, 30, 5, 4, 1], ROD = [40, 30, 15, 10, 5], SMASH = [80, 20], TREE = [50, 15, 15, 10, 5, 5];
const TIMES = { morn: 'manhã', day: 'dia', nite: 'noite' };
const out = Object.fromEntries(VERSIONS.map((v) => [v, {}]));
const push = (v, sp, src) => { const mon = monOf(sp); if (mon) (out[v][mon.name] ??= []).push(src); };
const wildByMap = {};
const addAgg = (v, h, method, slots, extra = {}) => {
  const agg = {};
  for (const s of slots) { if (!isSpecies(s.sp)) continue; const a = (agg[s.sp] ??= { min: s.min, max: s.max, pct: 0 }); a.min = Math.min(a.min, s.min); a.max = Math.max(a.max, s.max); a.pct += s.pct; }
  for (const [sp, a] of Object.entries(agg)) { push(v, sp, { type: 'wild', where: label(h), mapId: h, method, min: a.min, max: a.max, pct: Math.max(1, Math.round(a.pct)), ...extra }); if (!extra.postgame && !extra.swarm) (wildByMap[h] ??= []).push(a.min); }
};
// por horário: agrega cada horário e junta os horários com o mesmo resultado (sem "times" quando vale o dia todo)
const addByTime = (v, h, method, slotsByTime, extra = {}) => {
  const per = {};
  for (const [t, slots] of Object.entries(slotsByTime)) for (const s of slots) { if (!isSpecies(s.sp)) continue; const a = ((per[s.sp] ??= {})[t] ??= { sp: s.sp, min: s.min, max: s.max, pct: 0 }); a.min = Math.min(a.min, s.min); a.max = Math.max(a.max, s.max); a.pct += s.pct; }
  for (const [sp, byT] of Object.entries(per)) {
    const groups = {};
    for (const [t, a] of Object.entries(byT)) (groups[`${a.min}-${a.max}-${a.pct}`] ??= []).push(t);
    for (const ts of Object.values(groups)) addAgg(v, h, method, [byT[ts[0]]], { ...extra, ...(ts.length < Object.keys(slotsByTime).length && { times: ts.map((t) => TIMES[t]) }) });
  }
};
const SWARM = [...read('src/unk_02097F6C.c').matchAll(/\{ (MAP_\w+),\s*(\d) \}/g)].map((m) => ({ map: m[1], kind: Number(m[2]) }));
const swarmKind = (h) => new Set(SWARM.filter((s) => s.map === h).map((s) => s.kind));
const enc = JSON.parse(read('files/fielddata/encountdata/gs_enc_data.json')).encounters;
const headersOfEnc = (code) => ids.filter((h) => H[h].enc === `ENCDATA_${code}`);
for (const e of enc) for (const h of headersOfEnc(e.map).slice(0, 1)) for (const v of VERSIONS) {
  const lvl = (x) => pick(x, v);
  if (e.land?.rate > 0 && e.land.mons.length === 12) {
    const byTime = Object.fromEntries(Object.keys(TIMES).map((t) => [t, e.land.mons.map((s, i) => ({ sp: pick(s.species[t], v), min: lvl(s.level), max: lvl(s.level), pct: LAND[i] }))]));
    addByTime(v, h, 'Grama/caverna', byTime);
    const sw = swarmKind(h);
    if (sw.has(0) && isSpecies(pick(e.landSwarm, v))) addAgg(v, h, 'Grama/caverna', [0, 1].map((i) => ({ sp: pick(e.landSwarm, v), min: lvl(e.land.mons[i].level), max: lvl(e.land.mons[i].level), pct: LAND[i] })), { swarm: true, detail: 'surto (notícia no rádio/Prof. Oak)' });
    for (const [key, name] of [['hoenn', 'Hoenn Sound'], ['sinnoh', 'Sinnoh Sound']]) {
      const two = pick(e[key], v);
      if (Array.isArray(two) && two.length === 2) addAgg(v, h, 'Grama/caverna', [2, 3, 4, 5].map((i) => ({ sp: pick(two[i < 4 ? 0 : 1], v), min: lvl(e.land.mons[i].level), max: lvl(e.land.mons[i].level), pct: LAND[i] })), { detail: `com o ${name} tocando no rádio do Pokégear (exige a Pokédex Nacional)`, postgame: true });
    }
  }
  const water = (blk, rates, method, mod) => {
    if (!(blk?.rate > 0) || !blk.mons?.length) return;
    const base = blk.mons.map((s, i) => ({ sp: pick(s.species, v), min: lvl(s.level?.min ?? s.level), max: lvl(s.level?.max ?? s.level), pct: rates[i] ?? 0 }));
    addAgg(v, h, method, base);
    mod?.(base);
  };
  water(e.surf, WATER, 'Surf', (base) => { if (swarmKind(h).has(1) && isSpecies(pick(e.surfSwarm, v))) addAgg(v, h, 'Surf', [{ ...base[0], sp: pick(e.surfSwarm, v) }], { swarm: true, detail: 'surto (notícia no rádio/Prof. Oak)' }); });
  water(e.rock_smash, SMASH, 'Rock Smash');
  const rods = e.fishing ?? {};
  const night = pick(e.nightFish, v), fsw = pick(e.fishSwarm, v);
  const NIGHT = { 'Good Rod': 3, 'Super Rod': 1 }, FSW = { 'Old Rod': [2], 'Good Rod': [0, 2, 3], 'Super Rod': [0, 1, 2, 3, 4] };
  for (const [k, method] of [['old_rod', 'Old Rod'], ['good_rod', 'Good Rod'], ['super_rod', 'Super Rod']]) water(rods[k], ROD, method, (base) => {
    if (NIGHT[method] != null && isSpecies(night) && base[NIGHT[method]]) addAgg(v, h, method, [{ ...base[NIGHT[method]], sp: night }], { times: ['noite'], detail: 'à noite troca um slot da vara' });
    if (swarmKind(h).has(2) && isSpecies(fsw)) addAgg(v, h, method, FSW[method].filter((i) => base[i]).map((i) => ({ ...base[i], sp: fsw })), { swarm: true, detail: 'surto (notícia no rádio/Prof. Oak)' });
  });
}
// Headbutt: árvore comum (CommonMons) × rara (RareMons; quais árvores são raras depende do último dígito do ID do treinador) ×
// secreta (SecretMons)
for (const t of JSON.parse(read('files/arc/headbutt.json')).tables) for (const h of headersOfEnc(t.Map).length ? headersOfEnc(t.Map).slice(0, 1) : ids.filter((x) => H[x].code === t.Map).slice(0, 1)) for (const v of VERSIONS) {
  for (const [k, detail] of [['CommonMons', 'árvore comum'], ['RareMons', 'árvore rara (quais são raras depende do ID do treinador)'], ['SecretMons', 'árvore secreta']]) {
    const list = t[k] ?? [];
    if (list.length) addAgg(v, h, 'Headbutt', list.map((s, i) => ({ sp: pick(s.species, v), min: s.minLevel, max: s.maxLevel, pct: TREE[i] ?? 0 })), { detail });
  }
}
// Concurso de insetos (National Park, terça/quinta/sábado): conjunto 0 sem Pokédex Nacional; com ela o conjunto = dia/2
{
  const rows = read('files/data/mushi/mushi_encount.csv').trim().split(/\r?\n/).slice(1).map((l) => { const [sp, a, b, rate] = l.split(','); return { sp, min: Number(a), max: Number(b), rate: Number(rate) }; });
  const park = ids.find((h) => h === 'MAP_NATIONAL_PARK_BUG_CATCHING_CONTEST') ?? ids.find((h) => h === 'MAP_NATIONAL_PARK');
  const SETS = ['sem a Pokédex Nacional (ou domingo/segunda com ela)', 'com a Pokédex Nacional: terça/quarta', 'com a Pokédex Nacional: quinta/sexta', 'com a Pokédex Nacional: sábado'];
  for (let s = 0; s * 10 < rows.length; s++) {
    // slot i sai se o sorteio (0–99) ≥ rate[i] e < rate[i-1] → chance = rate[i-1] − rate[i]
    const set = rows.slice(s * 10, s * 10 + 10).map((r, i, a) => ({ sp: r.sp, min: r.min, max: r.max, pct: (i ? a[i - 1].rate : 100) - r.rate }));
    for (const v of VERSIONS) if (park) addAgg(v, park, 'Concurso de insetos', set, { detail: `Concurso de insetos (terça, quinta e sábado) — ${SETS[s]}`, ...(s > 0 && { postgame: true }) });
  }
}
// Safari Zone (encounter_check.c FieldSystem_GenerateSafariEncounter: slot = LCRandom() % 10 → 10% cada). As áreas são
// montadas pelo jogador; cada espécie "bonus" entra no lugar do próximo slot quando a área tem objetos suficientes
// (unk_02097268.c SafariZoneAreaSet_LoadAreaEncounters) → listada à parte, com a condição
{
  const sz = ids.find((h) => h === 'MAP_SAFARI_ZONE_ENTRANCE_EXTERIOR') ?? ids.find((h) => /SAFARI_ZONE/.test(h));
  const KIND = { land: 'Safari Zone', surf: 'Safari Zone (Surf)', oldrod: 'Safari Zone (Old Rod)', goodrod: 'Safari Zone (Good Rod)', superrod: 'Safari Zone (Super Rod)' };
  const cond = (c) => c.map((x) => `${x.count} objeto(s) ${x.object_type.replace(/^SAFARI_ZONE_OBJECT_TYPE_/, '').toLowerCase()}`).join(' + ');
  for (const a of JSON.parse(read('files/arc/safari_enc.json')).encounters) for (const v of VERSIONS) if (sz) {
    const area = title(a.area.replace(/^SAFARI_ZONE_AREA_/, '').replace(/_/g, ' '));
    for (const [k, method] of Object.entries(KIND)) {
      const blk = a[k];
      if (!blk?.mons) continue;
      addByTime(v, sz, method, Object.fromEntries(Object.keys(TIMES).map((t) => [t, (blk.mons[t] ?? []).map((s) => ({ sp: s.species, min: s.level, max: s.level, pct: 10 }))])), { detail: `área ${area} da Safari Zone` });
      for (const b of blk.bonus_mons ?? []) addByTime(v, sz, method, Object.fromEntries(Object.keys(TIMES).map((t) => [t, b[t] ? [{ sp: b[t].species, min: b[t].level, max: b[t].level, pct: 10 }] : []])), { detail: `área ${area} da Safari Zone, com ${cond(b.conditions ?? [])}` });
    }
  }
}
function title(s) { return s.toLowerCase().replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase()); }

// ---- 3) presentes, ovos, estáticos, vagantes, trocas, iniciais (por versão, com os desvios HG×SS do script)
const TRADE = [...read('include/constants/npc_trade.h').matchAll(/^\s*(NPC_TRADE_\w+),/gm)].map((m) => m[1]).filter((x) => x !== 'NPC_TRADE_MAX');
const tradeSpecies = (i) => { const n = TRADE[i]?.replace(/^NPC_TRADE_[A-Z]+_/, ''); return n && g.speciesId[`SPECIES_${n}`] ? `SPECIES_${n}` : null; };
const FOSSIL = [...read('src/scrcmd_fossils.c').matchAll(/\{ (ITEM_\w+),\s*(SPECIES_\w+)\s*\}/g)].map((m) => ({ item: m[1], sp: m[2] }));
const ROAMER = {};
for (const m of read('src/field_roamer.c').matchAll(/case ROAMER_(\w+):\s*\n\s*species = (SPECIES_\w+);\s*\n\s*level = (\d+);/g)) ROAMER[m[1]] = { sp: m[2], level: Number(m[3]) };
const ROAMER_IDX = Object.fromEntries([...read('include/constants/roamer.h').matchAll(/#define ROAMER_(RAIKOU|ENTEI|LATIAS|LATIOS)\s+(\d+)/g)].map((m) => [m[2], m[1]]));
const resolve = (s, v, x) => (/^VAR_/.test(x) ? s.valuesOf(v, x) : [x]).filter((y) => y !== '0');
for (const v of VERSIONS) {
  for (const h of ids) {
    const s = scriptOf(h);
    if (!s) continue;
    const raw = s.lines.join('\n');
    // evento: o script exige um Pokémon de evento como seguidor (Sinjoh Ruins: Arceus de distribuição) ou uma variável que só o
    // Mystery Gift escreve (ScrCmd_546 → VAR_UNK_4043, sys_vars.c; Latios/Latias de Pewter)
    const eventOnly = /FollowerPokeIsEventTrigger EVENT_|ScrCmd_546 /.test(raw);
    const ev = (o) => (eventOnly ? { ...o, type: 'event', detail: 'só com Pokémon/variável de evento de distribuição' } : o);
    for (const m of s.matchAll(v, /^GiveMon (\w+), (\w+),/)) {
      if (m[1] === 'VAR_UNK_407F') continue; // fóssil: tratado abaixo
      for (const sp of resolve(s, v, m[1])) for (const lv of resolve(s, v, m[2])) if (isSpecies(sp)) push(v, sp, ev({ type: /PRIZE|GAME_CORNER/.test(h) ? 'prize' : 'gift', where: label(h), mapId: h, level: Number(lv) || null, ...(/PRIZE|GAME_CORNER/.test(h) && { detail: 'prêmio por fichas' }) }));
    }
    for (const m of s.matchAll(v, /^GiveEgg (SPECIES_\w+)/)) push(v, m[1], { type: 'egg', where: label(h), mapId: h });
    if (s.matchAll(v, /^GiveTogepiEgg/).length) push(v, 'SPECIES_TOGEPI', { type: 'egg', where: label(h), mapId: h });
    // visibilidade por versão: o script de carga do mapa mostra o lendário com "ClearFlag FLAG_HIDE_…_<ESPÉCIE>" só num ramo
    // de GetGameVersion (Embedded Tower: Kyogre só no HG com a Blue Orb; Groudon só no SS) — se existe ClearFlag do objeto e
    // nenhum é alcançável nesta versão, a espécie não aparece nela
    const shown = (sp) => { const n = (/^SPECIES_/.test(sp) ? sp : `SPECIES_${monOf(sp)?.name?.toUpperCase()}`).replace(/^SPECIES_/, ''); const re = new RegExp(`^ClearFlag FLAG_HIDE_\\w*${n}$`); return !s.lines.some((l) => re.test(l)) || s.matchAll(v, re).length > 0; };
    for (const m of s.matchAll(v, /^WildBattle (\w+), (\w+),/)) for (const sp of resolve(s, v, m[1])) for (const lv of resolve(s, v, m[2])) if (isSpecies(sp) && shown(sp)) push(v, sp, ev({ type: 'static', where: label(h), mapId: h, level: Number(lv) || null }));
    // "SetVar VAR_ROAMER_X_STATUS, 0 / CreateRoamer n" (Hall of Fame) recria um vagante que o jogador já tinha → não é fonte nova
    for (const m of s.lines.flatMap((l, i) => (/^CreateRoamer \d+$/.test(l) && s.reachable(v).has(i) && !/^SetVar VAR_ROAMER_\w+_STATUS, 0$/.test(s.lines[i - 1] ?? '') ? [l.match(/^CreateRoamer (\d+)/)] : []))) {
      const r = ROAMER[ROAMER_IDX[m[1]]];
      if (r && !(out[v][monOf(r.sp)?.name] ?? []).some((x) => x.type === 'roamer')) push(v, r.sp, { type: 'roamer', where: 'pelo mapa (vagante)', mapId: h, level: r.level, detail: `vaga pela região depois do evento em ${label(h)}` });
    }
    for (const m of s.matchAll(v, /^LoadNPCTrade (\d+)/)) {
      const sp = tradeSpecies(Number(m[1]));
      if (sp) push(v, sp, /NPCTradeExec/.test(raw) ? { type: 'trade', where: label(h), mapId: h, detail: 'troca com NPC (espécie pedida: dados binários no decomp)' } : { type: 'gift', where: label(h), mapId: h, detail: 'presente de NPC' });
    }
    if (/GiveMon VAR_UNK_407F/.test(raw)) for (const f of FOSSIL) push(v, f.sp, { type: 'gift', where: label(h), mapId: h, level: Number(raw.match(/GiveMon VAR_UNK_407F, (\d+)/)[1]), detail: `reviver ${itemName(f.item).replace(/_/g, ' ').toLowerCase()}`, needItem: f.item });
  }
}
const starterSp = [...read('src/choose_starter_app.c').matchAll(/SPECIES_(CHIKORITA|CYNDAQUIL|TOTODILE)/g)].map((m) => `SPECIES_${m[1]}`).filter((x, i, a) => a.indexOf(x) === i);
const starterLv = Number(read('src/choose_starter.c').match(/CreateMon\(mon, species\[i\], (\d+),/)?.[1] ?? 5);
const STARTER_WHERE = 'New Bark — laboratório do Prof. Elm';
for (const v of VERSIONS) for (const sp of starterSp) push(v, sp, { type: 'starter', where: STARTER_WHERE, level: starterLv, detail: 'um dos três iniciais (os outros dois só por troca)', stage: 0 });
data.starters = { where: STARTER_WHERE, level: starterLv, species: starterSp.map((c) => monOf(c).name) };

// ---- 4) TMs, HMs e itens
const tm = {};
for (let i = 1; i <= 92; i++) tm[`ITEM_TM${String(i).padStart(2, '0')}`] = moveIdOf.get(g.tmhm[i - 1]);
for (let i = 1; i <= 8; i++) tm[`ITEM_HM${String(i).padStart(2, '0')}`] = moveIdOf.get(g.tmhm[92 + i - 1]);
const machines = {}, items = {};
const addSrc = (it, src) => { if (tm[it]) (machines[tm[it]] ??= []).push(src); else (items[itemName(it)] ??= []).push(src); };
const leaderOfMap = {};
for (const t of trainers.filter((x) => x.group === 'Líderes de ginásio' && !x.rematch)) for (const mp of t.map) { const h = ids.find((k) => label(k) === mp); if (h) leaderOfMap[h] = t.name; }
const stdBall = parseScript(read(`files/fielddata/script/scr_seq/scr_seq_0141.s`));
const ballItem = (i) => { const l = stdBall.labels[`scr_seq_0141_${String(i).padStart(3, '0')}`]; const m = l != null && stdBall.lines[l + 1]?.match(/^SetVar VAR_SPECIAL_x8008, (\d+)/); return m ? itemById[Number(m[1])] : null; };
const hidden = [...read('src/data/fieldmap/hidden_items.h').matchAll(/\{ (ITEM_\w+),/g)].map((m) => m[1]);
const stdNum = Object.fromEntries([...read('include/constants/std_script.h').matchAll(/#define (std_\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]));
const martTxt = read('src/scrcmd_mart.c');
const tiers = [...martTxt.split('_020FBF22[] = {')[1].split('};')[0].matchAll(/\{ (ITEM_\w+),\s*(\d+) \}/g)].map((m) => ({ item: m[1], tier: Number(m[2]) }));
const TIER_MIN_BADGES = { 1: 0, 2: 1, 3: 3, 4: 5, 5: 7, 6: 8 }; // ScrCmd_MartBuy: 0 → 1; 1–2 → 2; 3–4 → 3; 5–6 → 4; 7 → 5; 8+ → 6
const arrays = Object.fromEntries([...martTxt.matchAll(/const u16 (_\w+)\[\] = \{([^}]*)\}/g)].map((m) => [m[1], [...m[2].matchAll(/ITEM_\w+/g)].map((x) => x[0])]));
const special = [...martTxt.split('_0210FA3C[] = {')[1].split('};')[0].matchAll(/(_\w+)/g)].map((m) => arrays[m[1]] ?? []);
for (const h of ids) {
  const ev = eventsOf(h);
  for (const o of [...(ev?.objects ?? []), ...(ev?.bgs ?? [])]) {
    const sid = typeof o.scriptId === 'string' ? stdNum[o.scriptId.trim()] : null;
    if (sid >= 7000 && sid < 7255) { const it = ballItem(sid - 7000); if (it) addSrc(it, { type: 'ground', where: label(h), map: h, x: o.x, y: o.z, by: 'item no chão', resolved: true }); }
    if (sid >= 8000 && sid < 8000 + hidden.length) addSrc(hidden[sid - 8000], { type: 'hidden', where: label(h), map: h, x: o.x, y: o.z, by: 'escondido', resolved: true });
  }
  const s = scriptOf(h);
  if (!s) continue;
  const all = new Set([...VERSIONS.flatMap((v) => [...s.reachable(v)])]);
  const lines = s.lines.filter((_, i) => all.has(i));
  const leader = leaderOfMap[h];
  const gifts = new Set();
  lines.forEach((l, i) => {
    // "SetVar VAR_SPECIAL_x8004, ITEM_X" ou o macro "GoToIfNoItemSpace ITEM_X, n, _L" (Falkner: TM51) antes do std_give_item
    // (itens.h também tem apelidos: "#define TM_EXPLOSION ITEM_TM64" — Route 5 subterrâneo)
    const m = l.match(/^SetVar VAR_SPECIAL_x8004, ((?:ITEM|TM|HM)_\w+)$/) ?? l.match(/^(?:GoToIfNoItemSpace|HasSpaceForItem) ((?:ITEM|TM|HM)_\w+),/);
    const it = m && (ITEM_ALIAS[m[1]] ?? m[1]);
    if (it && lines.slice(i + 1, i + 6).some((x) => /CallStd std_(give|obtain)_item/.test(x))) gifts.add(it);
    // prêmio do Game Corner: "GoToIfNoItemSpace ITEM_X" … "TakeCoins N" … "GiveItem VAR_SPECIAL_x8004"
    if (it && /GAME_CORNER|PRIZE/.test(h)) { const after = lines.slice(i + 1, i + 30); const coins = after.find((x) => /^TakeCoins \d+/.test(x))?.match(/\d+/)?.[0]; if (coins && after.some((x) => /^GiveItem VAR_SPECIAL_x8004/.test(x))) addSrc(it, { type: 'prize', where: label(h), map: h, by: `${coins} fichas`, resolved: true }); }
    const n = l.match(/^GiveItemNoCheck (ITEM_\w+)/);
    if (n) gifts.add(n[1]);
    const sm = l.match(/^SetVar VAR_SPECIAL_x8004, (\d+)$/);
    if (sm && lines.slice(i + 1, i + 3).some((x) => /CallStd std_special_mart/.test(x))) for (const it of special[Number(sm[1])] ?? []) addSrc(it, { type: 'mart', where: label(h), map: h, by: 'loja', resolved: true });
  });
  for (const it of gifts) addSrc(it, { type: 'gift', where: label(h), map: h, by: leader ? `líder ${leader}` : 'NPC', resolved: true, ...(leader && { leader }) });
  if (lines.some((l) => /CallStd std_pokemart/.test(l))) for (const c of tiers) addSrc(c.item, { type: 'mart', where: label(h), map: h, by: 'loja', resolved: true, minBadges: TIER_MIN_BADGES[c.tier] });
}

// ---- 5) estágio
const people = (group) => Object.values(Object.groupBy(trainers.filter((t) => t.group === group && !t.rematch), (t) => t.name)).map((ts) => ({ name: ts[0].name, teams: ts.map((t) => t.party) }));
let wtHtml = readFileSync(new URL(`../data-sources/pokemythology/${game.walkthrough}.html`, import.meta.url), 'utf8');
for (const [w, r] of Object.entries(game.walkthroughTypos ?? {})) wtHtml = wtHtml.replace(new RegExp(w, 'gi'), (m) => (m === m.toUpperCase() ? r.toUpperCase() : r));
const timeline = buildTimeline(wtHtml, people('Líderes de ginásio'), people('Elite dos Quatro'), { blocks: parseTrainerRuns(wtHtml), sectionRe: SECTIONS_WITH_SUBTITLES });
// HGSS = geografia da Gen 2 → mesmas regras de estágio do build-acquisition-gen2.mjs (landmark = .mapsec do cabeçalho)
const GENERIC = ['tower', 'cave', 'forest', 'road', 'path', 'well', 'den', 'lake', 'falls', 'park', 'gate', 'islands', 'ruins', 'tunnel', 'room', 'house', 'gym', 'gatehouse', 'floor', 'entrance', 'side', 'back', 'interior', 'exterior'];
const titleKnown = new Map(), textKnown = new Map(), detail = {};
for (const h of ids) { const r = placeStage(timeline, label(h), { generic: GENERIC }); if (!r) continue; (r.by === 'título' ? titleKnown : textKnown).set(h, r.stage); detail[h] = r; }
// fatos do código: posição inicial (src/location_backup.c: quarto do jogador) → portas → 1º mapa externo (New Bark) = 0
const facts = {};
const start = read('src/location_backup.c').match(/\.mapId = (MAP_\w+)/)?.[1];
for (let cur = start, seen = new Set(); cur && !seen.has(cur); ) { seen.add(cur); facts[cur] = { stage: 0, why: 'início do jogo (location_backup.c)' }; if (conn.has(cur)) break; cur = [...(warp.get(cur) ?? [])].find((n) => !seen.has(n)); }
const BADGE_ORDER = [...read('include/constants/badge.h').matchAll(/#define (BADGE_\w+)\s+(\d+)/g)].map((m) => m[1]);
// portões que checam insígnia (CheckBadge no script de um GATEHOUSE): Victory Road / Route 27 etc.
for (const h of ids) {
  if (!/GATE/.test(h) || /GiveBadge/.test(rawOf(h))) continue;
  const checked = [...rawOf(h).matchAll(/CheckBadge (BADGE_\w+)/g)].map((m) => BADGE_ORDER.indexOf(m[1])).filter((i) => i >= 0 && i < 8);
  if (checked.length && !facts[h]) facts[h] = { stage: Math.min(Math.max(...checked) + 1, POSTGAME), why: `script checa a insígnia ${BADGE_ORDER[Math.max(...checked)]}` };
}
const badgeOfGym = {};
for (const h of ids) { const b = rawOf(h).match(/GiveBadge (BADGE_\w+)/)?.[1]; if (b && leaderOfMap[h]) badgeOfGym[b] = leaderOfMap[h]; }
timeline.leaderOrder.forEach((name, i) => {
  for (const [gym, l] of Object.entries(leaderOfMap)) if (l === name && /GYM/.test(gym)) {
    facts[gym] ??= { stage: Math.min(i, POSTGAME), why: `ginásio de ${name} (${i + 1}º líder)` };
    for (const town of [...(warp.get(gym) ?? [])].filter((n) => conn.has(n))) { const cited = titleKnown.get(town) ?? textKnown.get(town); facts[town] ??= { stage: Math.min(cited ?? i, i, POSTGAME), why: `cidade do ginásio de ${name}: no máximo ${i}` }; }
  }
});
const fm = read('src/field_move.c');
const badgeFor = (fn) => fm.match(new RegExp(`FieldMove_Check${fn}\\(const[\\s\\S]{0,800}?(BADGE_\\w+)`))?.[1];
const surfBadge = badgeFor('Surf'), smashBadge = badgeFor('RockSmash');
const surfStage = timeline.leaderOrder.indexOf(badgeOfGym[surfBadge]) + 1;
const encOf = (h) => enc.find((e) => `ENCDATA_${e.map}` === H[h].enc);
// rota de MAR (tipo ROUTE, sem terra, com Surf) que o detonado não cita: piso = insígnia do Surf
for (const h of ids) {
  if (!conn.has(h) || facts[h] || titleKnown.has(h) || textKnown.has(h) || H[h].type !== 'MAP_TYPE_ROUTE') continue;
  const e = encOf(h);
  if (e && !(e.land?.rate > 0) && e.surf?.rate > 0 && surfStage > 0) facts[h] = { stage: surfStage, why: `rota de mar: só Surf (insígnia ${surfBadge})` };
}
for (const [id, f] of Object.entries(game.stageFacts ?? {})) facts[id] = f;
for (const [id, f] of Object.entries(facts)) { titleKnown.set(id, f.stage); textKnown.delete(id); detail[id] = { stage: f.stage, by: 'código', why: f.why }; }
const reference = propagateStages(titleKnown, conn, warp);
const known = new Map(titleKnown);
for (const [id, s0] of textKnown) {
  const around = [...(conn.get(id) ?? [])].map((n) => reference.get(n)).filter((x) => x !== undefined);
  if (!around.length) { const doors = [...(warp.get(id) ?? [])].map((n) => reference.get(n)).filter((x) => x !== undefined); known.set(id, doors.length ? Math.max(s0, Math.min(...doors)) : s0); continue; }
  // corredor: 2+ vizinhos no MESMO estágio mais baixo (Route 29 entre New Bark e Cherrygrove, ambos 0 — o detonado não
  // cita "rota 29" na história; a Route 46, que só se alcança depois, puxava para 7)
  const lo = Math.min(...around);
  if (around.filter((x) => x === lo).length >= 2) { known.set(id, lo); detail[id] = { ...detail[id], corridor: true }; continue; }
  known.set(id, Math.min(Math.max(s0, lo), Math.max(...around)));
}
const st = propagateStages(known, conn, warp);
const landmarkOf = (h) => H[h]?.section;
// interior citado só no TEXTO, com o mesmo mapsec de uma cidade/rota: não fica depois dela
for (const id of ids) {
  if (conn.has(id) || facts[id] || detail[id]?.by !== 'texto') continue;
  const town = ids.find((c) => conn.has(c) && landmarkOf(c) && landmarkOf(c) === landmarkOf(id) && st.has(c));
  if (town && st.get(id) > st.get(town)) { st.set(id, st.get(town)); detail[id] = { ...detail[id], capBy: label(town) }; }
}
// interior situado por TÍTULO tardio (guias de cavernas no fim do detonado) mas citado antes, com porta para um exterior
// já alcançável nessa citação (Mt. Mortar, Dark Cave, Ruins of Alph, Union Cave)
for (const id of ids) {
  const r = detail[id];
  if (conn.has(id) || facts[id] || r?.by !== 'título' || !r.earlierMention) continue;
  // estágio = max(citação anterior, porta mais cedo) — Ruins of Alph citada no estágio 0, porta pelo portão da Route 32 (1) → 1
  const doors = [...(warp.get(id) ?? [])].filter((n) => st.has(n)).map((n) => st.get(n)); // qualquer porta (Union Cave B1F ← 1F)
  const s1 = doors.length ? Math.max(r.earlierMention.stage, Math.min(...doors)) : null;
  if (s1 != null && st.get(id) > s1) { st.set(id, s1); detail[id] = { ...r, usedEarlier: true }; }
}
for (let p = 0; p < 6; p++) for (const id of ids) {
  if (conn.has(id) || facts[id] || detail[id]?.by === 'título') continue;
  const near = [...(warp.get(id) ?? [])].filter((n) => !conn.has(n) && (detail[n]?.capBy || detail[n]?.usedEarlier) && landmarkOf(n) === landmarkOf(id)).map((n) => st.get(n));
  if (near.length && st.get(id) > Math.min(...near)) { st.set(id, Math.min(...near)); detail[id] = { ...(detail[id] ?? {}), capBy: 'andar vizinho' }; }
}
// passagem: interior com portas para 2+ mapas EXTERNOS (Union Cave: Route 32 ↔ Route 33; Dark Cave: Route 31 ↔ Route 45)
for (const id of ids) {
  if (conn.has(id) || facts[id]) continue;
  const outsides = [...(warp.get(id) ?? [])].filter((n) => conn.has(n) && st.has(n));
  if (new Set(outsides).size >= 2) { const lo = Math.min(...outsides.map((n) => st.get(n))); if (st.get(id) > lo) { st.set(id, lo); detail[id] = { ...(detail[id] ?? {}), passage: outsides.map(label) }; } }
}
for (let p = 0; p < 4; p++) for (const id of ids) {
  if (conn.has(id) || facts[id] || detail[id]?.passage) continue;
  const inner = [...(warp.get(id) ?? [])].filter((n) => detail[n]?.passage && st.has(n));
  if (inner.length && !textKnown.has(id) && !titleKnown.has(id)) st.set(id, Math.min(...inner.map((n) => st.get(n))));
}
for (let p = 0; p < 4; p++) for (const id of ids) {
  if (conn.has(id) || !warp.has(id) || !st.has(id) || facts[id]) continue;
  const outside = [...warp.get(id)].map((n) => st.get(n)).filter((x) => x !== undefined);
  if (outside.length) st.set(id, Math.max(st.get(id), Math.min(...outside)));
}
if (process.env.WHY) for (const id of process.env.WHY.split(',')) console.log('WHY', id, JSON.stringify(detail[id] ?? null), 'st', st.get(id), 'conn', [...(conn.get(id) ?? [])].join('/'), 'warp', [...(warp.get(id) ?? [])].join('/'));
const leaderStage = (name) => { const i = timeline.leaderOrder.indexOf(name); return i >= 0 ? i + 1 : null; };
const leaderTop = (name) => Math.max(0, ...trainers.filter((t) => t.name === name && !t.rematch).flatMap((t) => t.party.map((p) => p.level)));
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
const giverOf = (it) => [...(items[itemName(it)] ?? []), ...(machines[tm[it]] ?? [])].find((s) => s.type === 'gift' || s.type === 'ground');
const gates = {};
for (const [method, hm, badge] of [['Surf', 'ITEM_HM03', surfBadge], ['Rock Smash', 'ITEM_HM06', smashBadge]]) {
  const leader = badgeOfGym[badge];
  const giver = giverOf(hm);
  gates[method] = { level: leaderTop(leader), item: giver?.where ?? null, leader, stage: Math.max(giver?.stage ?? st.get(giver?.map) ?? 0, leaderStage(leader) ?? 0) };
}
for (const [method, it] of [['Old Rod', 'ITEM_OLD_ROD'], ['Good Rod', 'ITEM_GOOD_ROD'], ['Super Rod', 'ITEM_SUPER_ROD']]) {
  const giver = giverOf(it);
  gates[method] = giver ? { level: areaLevel(giver.map)?.level ?? 1, item: giver.where, stage: giver.stage ?? st.get(giver.map) ?? null } : { level: 1, item: null, stage: POSTGAME };
}
// Headbutt fora da batalha: o tutor do Ilex Forest ensina (MonHasMove MOVE_HEADBUTT no script do mapa)
{
  const tutor = ids.find((h) => /MonHasMove \w+, MOVE_HEADBUTT/.test(rawOf(h)));
  if (tutor) gates.Headbutt = { level: areaLevel(tutor)?.level ?? 1, item: `tutor em ${label(tutor)}`, stage: st.get(tutor) ?? null };
}
// lendário que só aparece depois de um evento: o objeto (sprite …_<ESPÉCIE>) tem eventFlag FLAG_HIDE_…; o estágio mínimo é o do
// mapa mais cedo cujo script dá ClearFlag nele (Suicune da Burned Tower B1F: só o Hall of Fame → pós-jogo)
const clearers = {};
for (const h of ids) for (const l of scriptOf(h)?.lines ?? []) { const m = l.match(/^ClearFlag (FLAG_HIDE_\w+)$/); if (m) (clearers[m[1]] ??= new Set()).add(h); }
const showFloor = (h, sp) => {
  const n = sp.toUpperCase().replace(/-.*/, '');
  // objeto dono da luta: scriptId "_EV_scr_seq_<código>_NNN + 1", NNN = entrada (ScrDef) que contém o WildBattle
  // (a Burned Tower B1F tem 2 Suicunes: o da cena, que foge, e o da luta pós-jogo)
  const s = scriptOf(h);
  const owners = new Set();
  s?.lines.forEach((l, i) => { if (!new RegExp(`^WildBattle SPECIES_${n},`).test(l)) return; for (let j = i; j >= 0; j--) { const m = s.lines[j].match(/^scr_seq_\w+?_(\d{3}):$/); if (m) { owners.add(Number(m[1])); break; } } });
  const objs = (eventsOf(h)?.objects ?? []).filter((o) => new RegExp(`_${n}(_\\d+)?$`).test(o.spriteId ?? ''));
  const own = objs.filter((o) => [...owners].some((k) => new RegExp(`_${String(k).padStart(3, '0')} \\+ 1$`).test(String(o.scriptId))));
  const flags = (own.length ? own : objs).filter((o) => /^FLAG_HIDE_/.test(o.eventFlag ?? '')).map((o) => o.eventFlag);
  const by = flags.flatMap((f) => [...(clearers[f] ?? [])]);
  if (!flags.length || flags.some((f) => !clearers[f])) return null; // algum objeto visível de saída
  return Math.min(...by.map((c) => (/HALL_OF_FAME/.test(c) ? POSTGAME : st.get(c) ?? 0)));
};
const firstMention = (sp) => timeline.chunks.find((c) => c.text.includes(sp.replace(/-/g, '')))?.stage ?? null;
for (const v of VERSIONS) for (const [sp, list] of Object.entries(out[v])) for (const s of list) {
  if (s.stage === undefined) s.stage = s.mapId ? st.get(s.mapId) ?? null : null;
  if (s.postgame) { s.stage = POSTGAME; delete s.postgame; }
  if (s.type === 'static' && s.mapId) { const f = showFloor(s.mapId, sp); if (f != null && f > (s.stage ?? 0)) { s.stage = f; s.stageBy = 'objeto liberado por ClearFlag em outro mapa'; } }
  if (s.needItem) { const gv = giverOf(s.needItem); s.stage = Math.max(s.stage ?? 0, gv ? gv.stage ?? st.get(gv.map) ?? 0 : POSTGAME); if (!gv) s.detail += ' (fóssil sem origem nos dados em texto)'; delete s.needItem; }
  if (['gift', 'static', 'egg'].includes(s.type) && s.stage != null) { const f = firstMention(sp); if (f != null && f > s.stage) { s.stage = f; s.stageBy = 'citação da espécie no detonado'; } }
  if (s.type === 'wild' && gates[s.method]) { s.gate = gates[s.method]; s.stage = Math.max(s.stage ?? 0, gates[s.method].stage ?? 0); }
  if (s.mapId) { const a = areaLevel(s.mapId); if (a) s.area = a; }
}
for (const list of [...Object.values(machines), ...Object.values(items)]) list.sort((a, b) => (a.stage ?? 9) - (b.stage ?? 9));
const trainerStage = {};
for (const t of trainers.filter((x) => ['Líderes de ginásio', 'Elite dos Quatro', 'Campeão', 'Rival'].includes(x.group))) { const s0 = teamStage(timeline, t.party); if (s0 != null) trainerStage[t.key] = s0; }

// ---- 6) obtível (trocas: só a espécie oferecida é conhecida → contam; prêmios do Game Corner contam)
const USABLE = new Set(['wild', 'gift', 'static', 'trade', 'starter', 'egg', 'roamer', 'prize']);
const changes = [];
for (const v of VERSIONS) {
  const memo = new Map();
  const can = (mon) => {
    if (memo.has(mon.name)) return memo.get(mon.name);
    memo.set(mon.name, false);
    const parent = byDex.get(mon.evolvesFrom);
    const ok = (out[v][mon.name] ?? []).some((s) => USABLE.has(s.type)) || (!!parent && mon.evo?.possible !== false && can(parent));
    memo.set(mon.name, ok);
    return ok;
  };
  for (const mon of data.pokemon) { const now = can(mon); if (mon.obtainable[v] !== now) changes.push(`${mon.name}.${v}: ${mon.obtainable[v]} → ${now}`); mon.obtainable[v] = now; }
}
writeFileSync(dataFile, JSON.stringify(data));
const BADGES = [...read('include/constants/badge.h').matchAll(/#define (BADGE_\w+)\s+(\d+)/g)].map((m) => m[1]);
const progress = {
  trainerStage,
  badges: BADGES.map((b, i) => ({ n: i + 1, name: b.replace(/^BADGE_/, ''), leader: badgeOfGym[b] ?? null })),
  source: `PokeMythology ${game.walkthrough} + warps do decomp + conexões do pokecrystal`, leaderOrder: timeline.leaderOrder, leadersFound: timeline.leadersFound, eliteFound: timeline.eliteFound,
  mapsWithStage: st.size, mapsTotal: ids.length,
  maps: Object.fromEntries(ids.map((h) => [h, { folder: h, label: label(h), stage: st.get(h) ?? null, landmark: H[h].section ?? null, env: H[h].type ?? null }])),
  reviewEarlierMention: Object.entries(detail).filter(([, r]) => r.earlierMention).map(([id, r]) => ({ map: label(id), stage: r.stage, earlier: r.earlierMention })),
};
writeFileSync(new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, versions: out, machines, tutors: {}, items, progress }));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/obtainable-changes.json`, import.meta.url), JSON.stringify(changes, null, 1));
const tmTotal = Object.keys(tm).length, tmWith = Object.keys(tm).filter((it) => machines[tm[it]]?.length).length;
console.log(`[${gameId}] líderes: ${timeline.leaderOrder.join(' > ')} (${timeline.leadersFound}; Elite ${timeline.eliteFound}/4); mapas com estágio ${st.size}/${ids.length}; conexões ${conn.size} (sem par no pokecrystal: ${[...unmatched].join(' ') || '—'}); iniciais ${data.starters.species.join(', ')}`);
console.log(`  TM/HM com origem: ${tmWith}/${tmTotal}${tmWith < tmTotal ? ' — sem: ' + Object.keys(tm).filter((it) => !machines[tm[it]]?.length).join(', ') : ''}`);
for (const v of VERSIONS) console.log(`  ${v}: ${data.pokemon.filter((p) => p.obtainable[v]).length} obtíveis; ${Object.keys(out[v]).length} com fonte direta`);
console.log(`  portas: ${Object.entries(gates).map(([k, x]) => `${k} → ${x.item}${x.leader ? ` + ${x.leader}` : ''} (estágio ${x.stage})`).join('; ')}`);
console.log(`  mudanças de "obtível" (vs PokéAPI): ${changes.length}${changes.length ? ' ex.: ' + changes.slice(0, 30).join(', ') : ''}`);
