// Gera public/data/<jogo>-acquisition.json (onde obter cada espécie, por versão) e recalcula `obtainable`
// do dataset — tudo a partir do decomp pret do jogo:
//   encontros selvagens (wild_encounters.json), presentes/fósseis/estáticos/ovos/eventos (scripts dos mapas),
//   prêmios do Game Corner (se houver), trocas (tradesFile), iniciais, vagantes (roamer.c).
// Regras que não estão em tabelas ficam em scripts/games.mjs (decomp.starters/roamers/eventTickets/giftNotes).
// Uso: node scripts/build-acquisition.mjs <jogo>   (depois de apply-decomp-overlay)
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { decompPaths, loadDecomp } from './lib/decomp.mjs';
import { parseBlocks, labelAt, eventsReaching, reachable, describeGfx } from './lib/script-graph.mjs';
import { buildTimeline, placeStage, propagateStages, POSTGAME } from './lib/progress.mjs';
import { roamerByStarter } from './lib/starters.mjs';
import { parseVersionAliases, resolveFor } from './lib/version-aliases.mjs';

const gameId = process.argv[2] ?? 'firered-leafgreen';
const { game, commit, read, mapsDir } = decompPaths(gameId);
const cfg = game.decomp;
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const monByName = Object.fromEntries(data.pokemon.map((p) => [norm(p.name), p]));
const nameOf = (c) => { const n = norm(c.replace(/^SPECIES_/, '')); return (monByName[n] ?? monByName[n + 'normal'])?.name; };

const VERSIONS = game.versions;
const out = Object.fromEntries(VERSIONS.map((v) => [v, {}]));
const vAliases = cfg.versionDefine ? parseVersionAliases(cfg.versionDefine.files.map((f) => { try { return read(f); } catch { return ''; } }), cfg.versionDefine) : {};
const add = (versions, species, src) => {
  for (const v of versions) {
    const n = nameOf(resolveFor(vAliases, species.replace(/^SPECIES_/, ''), v)) ?? nameOf(resolveFor(vAliases, species, v));
    if (n) (out[v][n] ??= []).push({ ...src }); // cópia por versão (a estimativa de área pode diferir)
  }
};
const mapLabel = (c) => c.replace(/^MAP_/, '').split('_').map((w) => (/^B?\d+F$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ').replace(/([A-Za-z])(\d)/g, '$1 $2');
const folderLabel = (f) => f.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2');

// ---- 1) Encontros selvagens
const wild = JSON.parse(read('src/data/wild_encounters.json')).wild_encounter_groups.find((g) => g.for_maps);
const fieldRates = Object.fromEntries(wild.fields.map((f) => [f.type, f]));
const METHOD = { land_mons: 'Grama/caverna', water_mons: 'Surf', rock_smash_mons: 'Rock Smash', fishing_mons: null };
const ROD = { old_rod: 'Old Rod', good_rod: 'Good Rod', super_rod: 'Super Rod' };
const agg = Object.fromEntries(VERSIONS.map((v) => [v, new Map()]));
for (const e of wild.encounters) {
  // jogos com mais de uma versão marcam o base_label com sufixo (ex.: _FireRed); jogo único usa todas as entradas
  const v = cfg.wildSuffix ? VERSIONS.find((x) => e.base_label.endsWith(cfg.wildSuffix[x])) : VERSIONS[0];
  if (!v) continue;
  if (cfg.eventWildLabels && new RegExp(cfg.eventWildLabels).test(e.base_label)) {
    // tabela de encontros que só existe após um evento: registra como 'event', não como selvagem
    for (const sp of new Set(Object.values(METHOD).length && ['land_mons', 'water_mons', 'rock_smash_mons', 'fishing_mons'].flatMap((k) => (e[k]?.mons ?? []).map((m) => m.species))))
      add([v], sp, { type: 'event', where: mapLabel(e.map), mapId: e.map, detail: 'tabela de encontros ativada só por Mystery Gift' });
    continue;
  }
  for (const [field, label] of Object.entries(METHOD)) {
    const block = e[field];
    if (!block) continue;
    const rates = fieldRates[field].encounter_rates;
    const groups = field === 'fishing_mons' ? Object.entries(fieldRates[field].groups).map(([g, slots]) => [ROD[g], slots]) : [[label, rates.map((_, i) => i)]];
    for (const [method, slots] of groups) {
      const total = slots.reduce((a, i) => a + rates[i], 0);
      for (const i of slots) {
        const m = block.mons[i];
        if (!m) continue;
        const key = `${m.species}|${e.map}|${method}`;
        const cur = agg[v].get(key) ?? { species: m.species, map: e.map, method, min: 999, max: 0, pct: 0 };
        cur.min = Math.min(cur.min, m.min_level);
        cur.max = Math.max(cur.max, m.max_level);
        cur.pct += (rates[i] / total) * 100; // chance dentro do método (grama, surf, vara...)
        agg[v].set(key, cur);
      }
    }
  }
}
for (const v of VERSIONS) for (const w of agg[v].values()) add([v], w.species, { type: 'wild', where: mapLabel(w.map), mapId: w.map, method: w.method, min: w.min, max: w.max, pct: Math.round(w.pct), ...(w.method !== METHOD.land_mons && { _mapId: w.map }) });
for (const c of cfg.codeEncounters ?? []) add(VERSIONS, `SPECIES_${c.species}`, { type: 'wild', where: c.where, mapId: c.map, method: c.method, gateAs: c.gateAs, min: c.min, max: c.max, pct: c.pct });

// ---- 2) Scripts dos mapas
const folders = readdirSync(mapsDir);
const mapJsonCache = new Map();
const mapJsonOf = (f) => { if (!mapJsonCache.has(f)) { let j = null; try { j = JSON.parse(readFileSync(new URL(`${f}/map.json`, mapsDir), 'utf8')); } catch {} mapJsonCache.set(f, j); } return mapJsonCache.get(f); };
const scriptOf = (f) => { try { return readFileSync(new URL(`${f}/scripts.inc`, mapsDir), 'utf8'); } catch { return null; } };
for (const f of folders) {
  const txt = scriptOf(f);
  if (!txt || f === cfg.prizeRoom) continue;
  const where = folderLabel(f);
  const note = cfg.giftNotes?.[f];
  const ticket = Object.entries(cfg.eventTickets ?? {}).find(([k]) => f.startsWith(k))?.[1];
  for (const m of txt.matchAll(/givemon (SPECIES_\w+), (\d+)/g)) add(VERSIONS, m[1], { type: 'gift', where, _folder: f, level: Number(m[2]), ...(note && { detail: note }), ...(cfg.postgameGifts?.[f] && { _postgame: cfg.postgameGifts[f] }) });
  // presentes cuja espécie vem de uma variável (ex.: Dojo, fósseis do FRLG)
  const varLevel = txt.match(/givemon VAR_TEMP_1, (\d+)/)?.[1];
  if (varLevel) for (const m of txt.matchAll(/setvar VAR_TEMP_1, (SPECIES_\w+)/g)) add(VERSIONS, m[1], { type: 'gift', where, _folder: f, level: Number(varLevel), ...(note && { detail: note }) });
  for (const m of txt.matchAll(/setwildbattle (SPECIES_\w+), (\d+)/g)) {
    if (m[1] === 'SPECIES_MAROWAK' && /PokemonTower/.test(f)) continue; // fantasma da Pokémon Tower (FRLG): não é capturável
    // Ruby/Sapphire usam setwildbattle (não seteventmon) na Southern Island, que exige o Eon Ticket (item de evento)
    if (ticket) add(VERSIONS, m[1], { type: 'event', where, _folder: f, level: Number(m[2]), detail: `exige ${ticket} (distribuído só por evento)` });
    else add(VERSIONS, m[1], { type: 'static', where, _folder: f, level: Number(m[2]) });
  }
  for (const m of txt.matchAll(/giveegg (SPECIES_\w+)/g)) add(VERSIONS, m[1], { type: 'egg', where, _folder: f });
  for (const m of txt.matchAll(/seteventmon (SPECIES_\w+), (\d+)/g)) {
    add(VERSIONS, m[1], { type: 'event', where, _folder: f, level: Number(m[2]), detail: `exige ${ticket ?? 'item de evento'} (distribuído só por evento)` });
  }
}
// Pokémon em scripts COMPARTILHADOS (data/scripts/*.inc) só contam se algum NPC/objeto de mapa os chama
// (ex.: Kecleon invisível do Emerald em vários mapas; o ovo de Pichu é Mystery Gift — nenhum mapa chama → fica fora)
{
  const sharedDir = new URL('../scripts/', mapsDir);
  const files = readdirSync(sharedDir).filter((n) => n.endsWith('.inc')).map((n) => readFileSync(new URL(n, sharedDir), 'utf8'));
  const blocks = new Map(files.flatMap((t) => [...parseBlocks(t)]));
  const npcs = folders.flatMap((f) => (mapJsonOf(f)?.object_events ?? []).filter((o) => blocks.has(o.script)).map((o) => ({ f, o, reach: reachable(blocks, o.script) })));
  for (const t of files) for (const lm of t.matchAll(/^\s*(givemon|setwildbattle|giveegg) (SPECIES_\w+)(?:, (\d+))?/gm)) {
    if (lm[2] === 'SPECIES_MAROWAK') continue;
    const label = labelAt(t, lm.index);
    const seen = new Set();
    for (const { f } of npcs.filter((n) => n.reach.has(label))) {
      if (seen.has(f)) continue;
      seen.add(f);
      const type = lm[1] === 'givemon' ? 'gift' : lm[1] === 'giveegg' ? 'egg' : 'static';
      add(VERSIONS, lm[2], { type, where: folderLabel(f), _folder: f, ...(lm[3] && { level: Number(lm[3]) }), sharedScript: true });
    }
  }
}

// Game Corner com preços por versão (FRLG)
if (cfg.prizeRoom) {
  const txt = scriptOf(cfg.prizeRoom).replace(/\t/g, ' ');
  const re = /\.ifdef FIRERED\s+setvar VAR_TEMP_1, (SPECIES_\w+)\s+setvar VAR_TEMP_2, (\d+)\s+\.else\s+\.ifdef LEAFGREEN\s+setvar VAR_TEMP_1, (SPECIES_\w+)\s+setvar VAR_TEMP_2, (\d+)/g;
  const where = `${folderLabel(cfg.prizeRoom.replace(/_PrizeRoom$/, ''))} (prêmios)`;
  for (const m of txt.matchAll(re)) {
    add(['firered'], m[1], { type: 'prize', where, _folder: cfg.prizeRoom, detail: `${m[2]} fichas` });
    add(['leafgreen'], m[3], { type: 'prize', where, _folder: cfg.prizeRoom, detail: `${m[4]} fichas` });
  }
}
// Iniciais
for (const sp of cfg.starters.species) add(VERSIONS, `SPECIES_${sp}`, { type: 'starter', where: cfg.starters.where, ...(cfg.starters.level && { level: cfg.starters.level }), detail: 'um dos três iniciais (os outros dois só por troca)' });

// ---- 3) Trocas dentro do jogo
{
  const tradeMap = {};
  for (const f of folders) for (const m of (scriptOf(f) ?? '').matchAll(/INGAME_TRADE_(\w+)/g)) tradeMap[m[1]] = f;
  for (const b of read(cfg.tradesFile).split(/\n\s*\[INGAME_TRADE_/).slice(1)) {
    const id = b.match(/^(\w+)\]/)[1];
    const sp = b.match(/\.species = (SPECIES_\w+)/)?.[1];
    const want = b.match(/\.requestedSpecies = SPECIES_(\w+)/)?.[1];
    if (sp && want) add(VERSIONS, sp, { type: 'trade', where: tradeMap[id] ? folderLabel(tradeMap[id]) : 'NPC', _folder: tradeMap[id], want: nameOf(want), detail: `troca por ${nameOf(want) ?? want}` });
  }
}

// ---- 4) Vagantes (o nível vem de roamer.c)
{
  const roamerLevel = Number(read('src/roamer.c').match(/CreateMon\(&gEnemyParty\[0\],[^,]+,\s*(\d+)/)?.[1]) || null;
  // vagante conforme o inicial, lido do switch de roamer.c (FRLG); no Emerald não depende do inicial → null
  const rs = roamerByStarter(read('src/roamer.c'));
  const starterNames = cfg.starters.species;
  for (const [sp, detail] of Object.entries(cfg.roamers ?? {})) {
    const forStarter = rs ? starterNames.filter((s) => (rs[s] ?? rs['*']) === sp).map((s) => nameOf(`SPECIES_${s}`)) : null;
    add(VERSIONS, `SPECIES_${sp}`, { type: 'roamer', where: 'pelo mapa (vagante)', ...(roamerLevel && { level: roamerLevel }), detail, ...(forStarter && { forStarter }) });
  }
}

let gateReport = null;
let machineReport = null;
let tutorReport = null;
let progressReport = null;
let itemReport = null;
// ---- 4b) Estimativa de progresso para fontes fora da natureza (presente, troca, prêmio, estático, ovo):
// nível mínimo dos selvagens de grama/caverna no(s) mapa(s) mais próximo(s), seguindo conexões e portas (map.json).
// É uma ESTIMATIVA derivada dos dados do jogo, e é exibida como tal.
{
  const idOf = {};
  const adj = new Map(); // conexões + portas (estimativa de área por nível)
  const conn = new Map(); // só conexões entre mapas externos (rota ↔ cidade)
  const warp = new Map(); // só portas (interior ↔ exterior)
  const linkIn = (m, a, b) => { if (!m.has(a)) m.set(a, new Set()); m.get(a).add(b); };
  for (const f of folders) {
    let j;
    try { j = JSON.parse(readFileSync(new URL(`${f}/map.json`, mapsDir), 'utf8')); } catch { continue; }
    idOf[f] = j.id;
    const links = [...(j.connections ?? []).map((c) => [c.map, conn]), ...(j.warp_events ?? []).map((w) => [w.dest_map, warp])];
    for (const [l, kind] of links) {
      if (!l || l === 'MAP_DYNAMIC') continue;
      for (const m of [adj, kind]) { linkIn(m, j.id, l); linkIn(m, l, j.id); }
    }
  }
  const eventRe = cfg.eventWildLabels ? new RegExp(cfg.eventWildLabels) : null;
  const landMin = Object.fromEntries(VERSIONS.map((v) => [v, new Map()]));
  for (const e of wild.encounters) {
    const v = cfg.wildSuffix ? VERSIONS.find((x) => e.base_label.endsWith(cfg.wildSuffix[x])) : VERSIONS[0];
    if (!v || !e.land_mons || (eventRe && eventRe.test(e.base_label))) continue;
    const lv = Math.min(...e.land_mons.mons.map((m) => m.min_level));
    landMin[v].set(e.map, Math.min(landMin[v].get(e.map) ?? 99, lv));
  }
  const areaLevel = (start, v) => {
    let frontier = [start];
    const seen = new Set(frontier);
    for (let depth = 0; depth <= 8 && frontier.length; depth++) {
      const hits = frontier.filter((id) => landMin[v].has(id));
      if (hits.length) return { level: Math.min(...hits.map((id) => landMin[v].get(id))), near: hits.map(mapLabel).join(', ') };
      frontier = frontier.flatMap((id) => [...(adj.get(id) ?? [])]).filter((id) => !seen.has(id) && seen.add(id));
    }
    return null;
  };
  // ---- 4c) Portas de progresso para encontros que exigem item/HM:
  //   vara → mapa onde o jogo entrega o item (giveitem/additem) → estimativa de área desse mapa
  //   HM   → idem + insígnia exigida (party_menu: FLAG_BADGE01_GET + golpe de campo) → ginásio que dá a insígnia → nível do líder
  const leadersFile = new URL(`../public/data/${gameId}-trainers.json`, import.meta.url);
  const leaders = existsSync(leadersFile) ? JSON.parse(readFileSync(leadersFile, 'utf8')).trainers.filter((t) => t.group === 'Líderes de ginásio') : [];
  const giver = (re) => folders.find((f) => (scriptOf(f) ?? '').split('\n').some((l) => /\b(giveitem|giveitem_msg|additem)\b/.test(l) && re.test(l)));
  const badgeOfField = {};
  const partyMenuC = read('src/party_menu.c');
  for (const m of partyMenuC.matchAll(/FIELD_MOVE_(\w+),\s*\/\/\s*FLAG_BADGE0(\d)_GET/g)) badgeOfField[m[1]] = Number(m[2]); // Emerald: tabela comentada
  if (!Object.keys(badgeOfField).length) {
    // FRLG: FLAG_BADGE01_GET + valor do golpe, para golpes até FIELD_MOVE_WATERFALL
    let pm = '';
    try { pm = read('include/constants/party_menu.h'); } catch {}
    const defs = Object.fromEntries([...pm.matchAll(/#define FIELD_MOVE_(\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]));
    for (const [k, n] of Object.entries(defs)) if (n <= defs.WATERFALL) badgeOfField[k] = n + 1;
  }
  if (!Object.keys(badgeOfField).length) {
    // Ruby/Sapphire: "goto_if_unset FLAG_BADGE03_GET, CannotUseRockSmash" (field_move_scripts.inc) e, para o Surf,
    // "FlagGet(FLAG_BADGE05_GET) == TRUE && PartyHasMonWithSurf()" (field_control_avatar.c)
    const toConst = (camel) => camel.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
    try { for (const m of readFileSync(new URL('../field_move_scripts.inc', mapsDir), 'utf8').matchAll(/goto_if_unset FLAG_BADGE0(\d)_GET, CannotUse(\w+)/g)) badgeOfField[toConst(m[2])] ??= Number(m[1]); } catch {}
    try { for (const m of read('src/field_control_avatar.c').matchAll(/FlagGet\(FLAG_BADGE0(\d)_GET\)[^\n]*PartyHasMonWith(\w+)\(\)/g)) badgeOfField[toConst(m[2])] ??= Number(m[1]); } catch {}
  }
  const leaderFor = (badge) => {
    const gym = folders.find((f) => (scriptOf(f) ?? '').includes(`setflag FLAG_BADGE0${badge}_GET`));
    const txt = gym ? scriptOf(gym) : '';
    const l = leaders.find((x) => new RegExp(`\\b${x.key}\\b`).test(txt));
    return l ? { badge, leader: l.name, level: Math.max(...l.party.map((p) => p.level)) } : null;
  };
  const GATES = {
    'Old Rod': { item: /ITEM_OLD_ROD\b/ }, 'Good Rod': { item: /ITEM_GOOD_ROD\b/ }, 'Super Rod': { item: /ITEM_SUPER_ROD\b/ },
    // ITEM_HM03 (FRLG) / ITEM_HM_SURF (Emerald) / ITEM_HM03_SURF (Ruby/Sapphire)
    Surf: { item: /ITEM_HM(03|_SURF)(_SURF)?\b/, field: 'SURF' }, 'Rock Smash': { item: /ITEM_HM(06|_ROCK_SMASH)(_ROCK_SMASH)?\b/, field: 'ROCK_SMASH' },
  };
  const gates = {};
  for (const v of VERSIONS) {
    gates[v] = {};
    for (const [method, g] of Object.entries(GATES)) {
      const f = giver(g.item);
      const a = f && idOf[f] ? areaLevel(idOf[f], v) : null;
      const b = g.field && badgeOfField[g.field] ? leaderFor(badgeOfField[g.field]) : null;
      gates[v][method] = { level: Math.max(a?.level ?? 0, b?.level ?? 0), item: f ? folderLabel(f) : null, ...(b ?? {}) };
    }
  }
  gateReport = gates;

  // ---- 4d) Onde cada TM/HM é obtido (para não sugerir golpe de TM que o jogador ainda não tem)
  //   presente (giveitem/additem), item no chão (finditem; mapa vem do rótulo em item_ball_scripts.inc),
  //   loja (.2byte ITEM_TM.. no script do mapa) e item escondido (map.json bg_events).
  //   Nível estimado: prêmio de ginásio = nível do líder; demais = área do mapa.
  {
    const decomp = loadDecomp(gameId);
    const apiMoveById = new Map(Object.keys(data.moves).map((n) => [JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n]));
    const tmMove = {}; // 'TM39' -> 'ROCK_TOMB' (FRLG: nomes TMnn_GOLPE usados em tmhm_learnsets.h)
    for (const m of read('src/data/pokemon/tmhm_learnsets.h').matchAll(/TMHM\((TM|HM)(\d+)_(\w+)\)/g)) tmMove[m[1] + m[2]] = m[3];
    const moveOfItem = (item) => {
      let m = item.match(/^ITEM_(TM|HM)(\d\d)(?:_\w+)?$/);
      if (m) return tmMove[m[1] + m[2]];
      m = item.match(/^ITEM_(TM|HM)_(\w+)$/); // Emerald: ITEM_TM_SANDSTORM
      return m ? m[2] : null;
    };
    const machines = {};
    const tutors = {}; // golpe -> [{ map, x, y, by }] (NPC tutor)
    const evoItems = new Set(data.pokemon.filter((p) => p.evo && /ITEM/.test(p.evo.kind)).map((p) => `ITEM_${p.evo.param}`));
    const items = {}; // ITEM_THUNDER_STONE -> [{type, where, level}]
    const addTm = (item, src) => {
      if (evoItems.has(item)) (items[item] ??= []).push(src);
      const mv = moveOfItem(item);
      // pokeruby: TM22_SOLARBEAM × MOVE_SOLAR_BEAM → casar ignorando "_"
      const looseId = mv && (decomp.moveId[mv] ?? Object.entries(decomp.moveId).find(([n]) => n.replace(/_/g, '') === mv.replace(/_/g, ''))?.[1]);
      const api = looseId != null && apiMoveById.get(looseId);
      if (!api) return;
      (machines[api] ??= []).push(src);
    };
    const badgeOfGym = (txt) => Number(txt.match(/setflag FLAG_BADGE0(\d)_GET/)?.[1]) || null;
    const v0 = VERSIONS[0];
    const levelAt = (folder) => (idOf[folder] ? areaLevel(idOf[folder], v0)?.level : null) ?? null;
    for (const f of folders) {
      const txt = scriptOf(f) ?? '';
      const badge = badgeOfGym(txt);
      const mapJson = mapJsonOf(f);
      const blocks = txt ? parseBlocks(txt) : new Map();
      // Posição EXATA: evento do map.json (NPC/objeto/gatilho) cujo script alcança a linha que entrega o item
      const pos = (index) => {
        const label = labelAt(txt, index);
        const ev = mapJson && label ? eventsReaching(mapJson, blocks, label)[0] : null;
        if (ev) return { map: f, x: ev.x, y: ev.y, by: ev.by, resolved: true };
        // sem NPC: entregue numa cena automática disparada pelos scripts do mapa (ex.: Surf na casa do Wally, Emerald)
        if (label && blocks.has(`${f}_MapScripts`) && reachable(blocks, `${f}_MapScripts`).has(label)) return { map: f, by: 'cena automática ao entrar no mapa', resolved: true };
        return { map: f, resolved: false };
      };
      for (const lm of txt.matchAll(/^.*$/gm)) {
        const line = lm[0];
        const it = line.match(/\b(giveitem|giveitem_msg|additem)\b.*\b(ITEM_\w+)/);
        if (it) {
          const leader = badge ? leaderFor(badge) : null;
          addTm(it[2], { type: leader ? 'gym' : 'gift', where: folderLabel(f), level: leader?.level ?? levelAt(f), ...(leader && { leader: leader.leader, badge: leader.badge }), ...pos(lm.index) });
        }
        // TM guardado numa variável e entregue depois (ex.: FRLG, telhado da loja de Celadon: setvar VAR_0x8009, ITEM_TM16)
        const viaVar = !it && line.match(/\bsetvar VAR_\w+, (ITEM_\w+)/);
        if (viaVar) addTm(viaVar[1], { type: 'gift', where: folderLabel(f), level: levelAt(f), ...pos(lm.index) });
        const mart = line.match(/\.2byte (ITEM_\w+)/);
        if (mart) addTm(mart[1], { type: 'mart', where: folderLabel(f), level: levelAt(f), ...pos(lm.index) });
      }
      for (const b of mapJson?.bg_events ?? []) if (/^ITEM_/.test(b.item ?? '')) addTm(b.item, { type: 'hidden', where: folderLabel(f), level: levelAt(f), map: f, x: b.x, y: b.y, by: 'escondido', resolved: true });
    }
    // Scripts COMPARTILHADOS (data/scripts/*.inc) chamados por NPCs de mapas — ex.: o garoto da Route 111 que dá o
    // TM43 no Emerald está em secret_power_tm.inc. (Falha encontrada confrontando com o detonado do PokeMythology.)
    {
      const sharedDir = new URL('../scripts/', mapsDir);
      const shared = readdirSync(sharedDir).filter((n) => n.endsWith('.inc') && n !== 'item_ball_scripts.inc').map((n) => readFileSync(new URL(n, sharedDir), 'utf8'));
      const sharedBlocks = new Map(shared.flatMap((t) => [...parseBlocks(t)]));
      // grafo do mapa + compartilhado: o NPC pode ter script no próprio mapa que faz goto/call para o compartilhado
      // (era assim que 9 tutores do FRLG ficavam sem local)
      const npcs = folders.flatMap((f) => {
        const own = scriptOf(f);
        const graph = own ? new Map([...sharedBlocks, ...parseBlocks(own)]) : sharedBlocks;
        return (mapJsonOf(f)?.object_events ?? []).filter((o) => graph.has(o.script)).map((o) => ({ f, o, reach: reachable(graph, o.script) }));
      });
      for (const t of shared) for (const lm of t.matchAll(/^.*\b(?:MOVETUTOR|TUTOR_MOVE)_(\w+).*$/gm)) {
        const label = labelAt(t, lm.index);
        const api = apiMoveById.get(decomp.moveId[lm[1]]);
        if (!api) continue;
        for (const { f, o } of npcs.filter((n) => n.reach.has(label))) (tutors[api] ??= []).push({ type: 'tutor', where: folderLabel(f), level: levelAt(f), map: f, x: o.x, y: o.y, by: describeGfx(o.graphics_id), resolved: true });
      }
      for (const t of shared) for (const lm of t.matchAll(/^.*\b(?:giveitem|giveitem_msg|additem)\b.*\b(ITEM_\w+).*$/gm)) {
        const label = labelAt(t, lm.index);
        for (const { f, o } of npcs.filter((n) => n.reach.has(label))) addTm(lm[1], { type: 'gift', where: folderLabel(f), level: levelAt(f), map: f, x: o.x, y: o.y, by: describeGfx(o.graphics_id), resolved: true, sharedScript: true });
      }
    }
    // Itens no chão: o objeto ITEM_BALL do map.json referencia o script (item_ball_scripts.inc) → mapa e x,y exatos.
    // (Antes o mapa era deduzido do PREFIXO do rótulo; a divergência entre os dois fica registrada em labelPrefixWas.)
    // caminho por jogo (pokeruby: data/item_ball_scripts.inc); rótulos podem ter "@ endereço" no fim
    const ballsFile = cfg.itemBallScripts ? new URL(`../../${cfg.itemBallScripts}`, mapsDir) : new URL('../scripts/item_ball_scripts.inc', mapsDir);
    const balls = (() => { try { return readFileSync(ballsFile, 'utf8'); } catch { return ''; } })();
    const ballAt = new Map();
    for (const f of folders) for (const o of mapJsonOf(f)?.object_events ?? []) if (o.script) ballAt.set(o.script, { f, x: o.x, y: o.y });
    for (const m of balls.matchAll(/^(\w+)::[^\n]*\n\s*finditem (ITEM_\w+)/gm)) {
      const guess = folders.filter((f) => m[1].startsWith(f + '_')).sort((a, b) => b.length - a.length)[0];
      const p = ballAt.get(m[1]);
      if (p) addTm(m[2], { type: 'ground', where: folderLabel(p.f), level: levelAt(p.f), map: p.f, x: p.x, y: p.y, by: 'item no chão', resolved: true, ...(guess && guess !== p.f && { labelPrefixWas: guess }) });
      else if (guess) addTm(m[2], { type: 'ground', where: folderLabel(guess), level: levelAt(guess), map: guess, resolved: false });
    }
    const allTm = Object.values(machines).flat();
    const unresolved = allTm.filter((s) => !s.resolved);
    console.log(`  posição exata dos TM/HM: ${allTm.length - unresolved.length}/${allTm.length} origens ligadas a um evento do mapa${unresolved.length ? ' — sem evento: ' + unresolved.map((s) => s.where).join(', ') : ''}`);
    const moved = allTm.filter((s) => s.labelPrefixWas);
    if (moved.length) console.log(`  mapa corrigido (prefixo do rótulo ≠ mapa real): ${moved.map((s) => `${s.labelPrefixWas} → ${s.map}`).join(', ')}`);
    for (const list of [...Object.values(machines), ...Object.values(items)]) list.sort((a, b) => (a.level ?? 99) - (b.level ?? 99));
    // tutores definidos em código (config codeTutors): golpes lidos de uma função ou de arrays do arquivo indicado
    for (const ct of cfg.codeTutors ?? []) {
      const src = read(ct.file);
      const bodies = ct.fn
        ? [src.slice(src.indexOf(`${ct.fn}(void)`), src.indexOf('\n}\n', src.indexOf(`${ct.fn}(void)`)))]
        : ct.arrays.map((a) => src.slice(src.indexOf(`${a}[]`), src.indexOf('};', src.indexOf(`${a}[]`))));
      const moveConsts = [...new Set(bodies.flatMap((b) => [...b.matchAll(/\b(?:MOVETUTOR|MOVE)_(\w+)/g)].map((m) => m[1])))];
      const own = scriptOf(ct.map) ?? '';
      const sharedAll = new Map(readdirSync(new URL('../scripts/', mapsDir)).filter((n) => n.endsWith('.inc')).flatMap((n) => [...parseBlocks(readFileSync(new URL(n, new URL('../scripts/', mapsDir)), 'utf8'))]));
      const graph = new Map([...sharedAll, ...parseBlocks(own)]);
      const npc = (mapJsonOf(ct.map)?.object_events ?? []).find((o) => graph.has(o.script) && (!ct.label || reachable(graph, o.script).has(ct.label))) ?? (mapJsonOf(ct.map)?.object_events ?? []).find((o) => /Tutor/i.test(o.script ?? ''));
      for (const mc of moveConsts) {
        const api = apiMoveById.get(decomp.moveId[mc]);
        if (api) (tutors[api] ??= []).push({ type: 'tutor', where: folderLabel(ct.map), level: levelAt(ct.map), map: ct.map, ...(npc && { x: npc.x, y: npc.y, by: describeGfx(npc.graphics_id) }), resolved: !!npc, codeDefined: `${ct.file}:${ct.fn ?? ct.arrays.join('+')}`, ...(ct.detail && { detail: ct.detail }) });
      }
    }
    machineReport = machines;
    tutorReport = tutors;
    console.log(`  tutores com local: ${Object.keys(tutors).length} golpes (${Object.values(tutors).flat().length} NPCs)`);
    itemReport = Object.fromEntries(Object.entries(items).map(([k, v]) => [k.replace(/^ITEM_/, ''), v]));
    const noSrc = [...evoItems].filter((i) => !items[i]).map((i) => i.replace(/^ITEM_/, ''));
    console.log(`  itens de evolução com origem: ${evoItems.size - noSrc.length}/${evoItems.size}${noSrc.length ? ' — sem origem: ' + noSrc.join(', ') : ''}`);
  }

  // ---- 4e) Estágio de progresso (0–8 insígnias, 9 = pós-jogo) de cada mapa, pelo detonado do PokeMythology.
  //   precedência: título de seção > maior estágio dos vizinhos conhecidos pelo título > citação no texto > vizinhos.
  const wtFile = game.walkthrough && new URL(`../data-sources/pokemythology/${game.walkthrough}.html`, import.meta.url);
  let mapStage = null;
  let speciesFirstStage = () => null;
  if (wtFile && existsSync(wtFile) && leaders.length) {
    const allTrainers = JSON.parse(readFileSync(leadersFile, 'utf8')).trainers;
    const people = (group) => Object.values(Object.groupBy(allTrainers.filter((t) => t.group === group), (t) => t.name)).map((ts) => ({ name: ts[0].name, teams: ts.map((t) => t.party) }));
    const leaderNames = [...new Set(leaders.map((t) => t.name))];
    let wtHtml = readFileSync(wtFile, 'utf8');
    for (const [wrong, right] of Object.entries(game.walkthroughTypos ?? {})) wtHtml = wtHtml.replace(new RegExp(wrong, 'gi'), (m) => (m === m.toUpperCase() ? right.toUpperCase() : right));
    const timeline = buildTimeline(wtHtml, people('Líderes de ginásio'), people('Elite dos Quatro'));
    const ids = [...new Set([...Object.values(idOf), ...adj.keys()])];
    const titleKnown = new Map(), textKnown = new Map(), detail = {};
    for (const id of ids) {
      const r = placeStage(timeline, mapLabel(id));
      if (!r) continue;
      (r.by === 'título' ? titleKnown : textKnown).set(id, r.stage);
      detail[id] = r;
    }
    // Precedência: título > citação no texto LIMITADA ao intervalo dos vizinhos (pelas conexões) > herança.
    // (Herdar o MAIOR vizinho primeiro punha a Route 22 — Viridian 0 ↔ Route 23 8 — no estágio 8; o texto a cita no 0.
    //  O limite evita o oposto: a Route 111 só é citada pelo número no pós-jogo, mas fica entre mapas dos estágios 2–3.)
    const reference = propagateStages(titleKnown, conn, warp);
    const known = new Map(titleKnown);
    for (const [id, s] of textKnown) {
      if (known.has(id)) continue;
      let around = [...(conn.get(id) ?? [])].map((n) => reference.get(n)).filter((x) => x !== undefined);
      if (!around.length) around = [...(warp.get(id) ?? [])].map((n) => reference.get(n)).filter((x) => x !== undefined); // interior: só portas
      known.set(id, around.length ? Math.min(Math.max(s, Math.min(...around)), Math.max(...around)) : s);
    }
    let st = propagateStages(known, conn, warp);
    mapStage = st;
    speciesFirstStage = (sp) => timeline.chunks.find((c) => c.text.includes(sp.replace(/-/g, '')) || c.text.join(' ').includes(sp.replace(/-/g, ' ')))?.stage ?? null;
    // nº da insígnia (FLAG_BADGE0N_GET no script do ginásio) → líder do mesmo mapa — bônus de atributo (pokemon.c / battle_main.c)
    const badges = [];
    for (const f of folders) {
      const txt = scriptOf(f) ?? '';
      const n = txt.match(/setflag FLAG_BADGE0(\d)_GET/)?.[1];
      const who = leaders.find((t) => txt.includes(t.key));
      if (n && who) badges.push({ n: Number(n), leader: who.name });
    }
    badges.sort((a, b) => a.n - b.n);
    progressReport = {
      badges,
      source: `PokeMythology ${game.walkthrough} + conexões do decomp`,
      leaderOrder: timeline.leaderOrder, // na ordem do detonado: estágio N = já venceu os N primeiros
      leadersFound: timeline.leadersFound, eliteFound: timeline.eliteFound,
      mapsWithStage: st.size, mapsTotal: ids.length,
      maps: Object.fromEntries(Object.entries(idOf).map(([f, id]) => { const j = mapJsonOf(f); return [id, { folder: f, label: mapLabel(id), stage: st.get(id) ?? null, section: j?.region_map_section ?? null, type: j?.map_type ?? null }]; })),
      reviewEarlierMention: Object.entries(detail).filter(([, r]) => r.earlierMention).map(([id, r]) => ({ map: mapLabel(id), stage: r.stage, earlier: r.earlierMention })),
    };
    // vagantes: estágio da seção que cita a espécie (ex.: "OS CÃES LENDÁRIOS", "LATIOS E LATIAS")
    for (const v of VERSIONS) for (const [sp, list] of Object.entries(out[v])) for (const src of list) if (src.type === 'roamer') src.stage = placeStage(timeline, sp)?.stage ?? POSTGAME;
    const leaderStage = (name) => { const i = timeline.leaderOrder.indexOf(name); return i >= 0 ? i + 1 : null; };
    for (const list of Object.values(machineReport)) for (const s of list) s.stage = s.leader ? Math.max(st.get(idOf[s.map]) ?? 0, leaderStage(s.leader) ?? s.badge ?? 8) : st.get(idOf[s.map]) ?? null;
    for (const list of Object.values(tutorReport)) for (const s of list) s.stage = st.get(idOf[s.map]) ?? null;
    for (const list of Object.values(itemReport)) for (const s of list) s.stage = st.get(idOf[s.map]) ?? null;
    for (const v of VERSIONS) for (const g of Object.values(gates[v])) {
      const giverStage = g.item ? st.get(idOf[folders.find((f) => folderLabel(f) === g.item)]) ?? null : null;
      g.stage = Math.max(giverStage ?? 0, g.leader ? leaderStage(g.leader) ?? g.badge ?? 0 : 0);
    }
  }

  for (const v of VERSIONS) for (const list of Object.values(out[v])) for (const src of list) {
    if (mapStage && src.stage === undefined) {
      const id = src._mapId ?? (src._folder && idOf[src._folder]) ?? (src.type === 'wild' && [...mapStage.keys()].find((k) => mapLabel(k) === src.where));
      if (src.type === 'starter') src.stage = 0;
      else if (id && mapStage.has(id)) src.stage = mapStage.get(id);
      // presente/encontro único: o mapa pode ser acessível antes do Pokémon aparecer (Beldum na casa do Steven,
      // iniciais de Johto no laboratório só após zerar) → também o estágio da 1ª citação da espécie no detonado (o maior vale)
      if (src._postgame) { src.stage = POSTGAME; src.stageBy = src._postgame; }
      else if (['gift', 'static', 'egg'].includes(src.type) && src.stage != null) {
        const sp = Object.entries(out[v]).find(([, l]) => l.includes(src))?.[0];
        const first = sp && speciesFirstStage(sp);
        if (first != null && first > src.stage) { src.stage = first; src.stageBy = 'citação da espécie no detonado'; }
      }
    }
    if (src.type === 'wild' && gates[v][src.gateAs ?? src.method]) src.gate = gates[v][src.gateAs ?? src.method];
    delete src.gateAs;
    const start = src._mapId ?? (src._folder && idOf[src._folder]);
    if (start) { const a = areaLevel(start, v); if (a) src.area = a; }
    if (!src.mapId && src._folder && idOf[src._folder]) src.mapId = idOf[src._folder];
    delete src._folder;
    delete src._mapId;
    delete src._postgame;
  }
}

// ---- 5) Disponibilidade: fonte direta utilizável OU evolução possível de algo obtível ('event' não conta)
const USABLE = new Set(['wild', 'gift', 'static', 'egg', 'trade', 'prize', 'starter', 'roamer']);
const byId = new Map(data.pokemon.map((p) => [p.id, p]));
const changes = [];
for (const v of VERSIONS) {
  const memo = new Map();
  const can = (mon) => {
    if (memo.has(mon.name)) return memo.get(mon.name);
    memo.set(mon.name, false);
    const direct = (out[v][mon.name] ?? []).some((s) => USABLE.has(s.type));
    const parent = byId.get(mon.evolvesFrom);
    const ok = direct || (!!parent && mon.evo?.possible !== false && can(parent));
    memo.set(mon.name, ok);
    return ok;
  };
  for (const mon of data.pokemon) {
    const now = can(mon);
    if (mon.obtainable[v] !== now) changes.push(`${mon.name}.${v}: ${mon.obtainable[v]} → ${now}`);
    mon.obtainable[v] = now;
  }
}
// Iniciais do jogo (conferidos no código: givemon PLAYER_STARTER_SPECIES / sStarterMon) — exibidos na tela do jogo
data.starters = { where: cfg.starters.where, level: cfg.starters.level ?? null, species: cfg.starters.species.map((sp) => nameOf(`SPECIES_${sp}`)) };
data.obtainableSource = `${cfg.repo}@${commit.slice(0, 7)} (encontros, scripts, trocas, vagantes)`;
writeFileSync(dataFile, JSON.stringify(data));
for (const v of VERSIONS) for (const k of Object.keys(out[v])) out[v][k].sort((a, b) => ((a.type === 'wild') !== (b.type === 'wild') ? (a.type === 'wild' ? -1 : 1) : Math.max(a.min ?? 0, a.area?.level ?? 0) - Math.max(b.min ?? 0, b.area?.level ?? 0) || (b.pct ?? 0) - (a.pct ?? 0)));
writeFileSync(new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url), JSON.stringify({ source: `${cfg.repo}@${commit.slice(0, 7)}`, versions: out, machines: machineReport, tutors: tutorReport, items: itemReport, progress: progressReport }));
writeFileSync(new URL(`../reports/${gameId}/obtainable-changes.json`, import.meta.url), JSON.stringify(changes, null, 1));
console.log(`[${gameId}] fontes: ${VERSIONS.map((v) => `${v} ${Object.keys(out[v]).length}`).join(' | ')} espécies`);
console.log(`[${gameId}] obtainable: ${VERSIONS.map((v) => `${v} ${data.pokemon.filter((p) => p.obtainable[v]).length}`).join(' | ')} | mudanças vs PokéAPI: ${changes.length}`);
if (changes.length) console.log('  ' + changes.join('\n  '));
{
  const tmMoves = Object.entries(data.moves).filter(([n]) => data.pokemon.some((p) => p.learnset.some((l) => l.move === n && l.method === 'machine'))).map(([n]) => n);
  const missing = tmMoves.filter((n) => !machineReport[n]);
  console.log(`  TM/HM com origem conhecida: ${tmMoves.length - missing.length}/${tmMoves.length}${missing.length ? ' — sem origem: ' + missing.join(', ') : ''}`);
}
for (const [m, g] of Object.entries(gateReport[VERSIONS[0]])) console.log(`  porta ${m}: nv ${g.level} — item em ${g.item ?? '?'}${g.badge ? `; insígnia ${g.badge} (${g.leader})` : ''}`);
