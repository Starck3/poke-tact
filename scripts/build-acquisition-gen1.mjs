// Onde obter cada espécie/TM/item na Gen 1 + estágio de progresso de cada mapa → public/data/<jogo>-acquisition.json
// Fontes (decomp em assembly, ver docs/ADICIONAR-JOGO.md, seção Gen 1):
//   selvagens  data/wild/grass_water.asm (ponteiro por mapa) + data/wild/maps/*.asm (10 slots; IF DEF(_RED)/_BLUE)
//              chances dos slots: data/wild/probabilities.asm (51,51,39,25,25,25,13,13,11,3 /256)
//   pesca      Old Rod: Magikarp nv 5 / Good Rod: Goldeen|Poliwag nv 10 em QUALQUER água (engine/items/item_effects.asm,
//              data/wild/good_rod.asm); Super Rod por mapa (data/wild/super_rod.asm, sorteio uniforme no grupo)
//   presentes  scripts: "lb bc, ESPÉCIE, NÍVEL / call GivePokemon"; Dojo (ld a, HITMON… / ld c, 30); fósseis
//              (engine/events/cinnabar_lab.asm: Dome→Kabuto, Helix→Omanyte, Old Amber→Aerodactyl, nv 30)
//   estáticos  objetos "…, ESPÉCIE, NÍVEL" (lendários, Voltorb/Electrode) e scripts "ld a, ESPÉCIE / ld [wCurOpponent]" (Snorlax)
//   trocas     data/events/trades.asm (npctrade DÁ, RECEBE) + "ld a, TRADE_FOR_X" no script do mapa
//   prêmios    data/events/prizes.asm + prize_mon_levels.asm (por versão)
//   TMs/itens  bolas no chão (objetos "…, TM_X"), lojas (data/items/marts.asm), presentes ("lb bc, TM_X, 1"/"ld a, HM_X"),
//              escondidos (data/events/hidden_events.asm), prêmios de TM do Game Corner
//   HMs        insígnia exigida fora da batalha: engine/menus/start_sub_menus.asm (".surf / bit BIT_SOULBADGE")
//   estágio    detonado do PokeMythology (scripts/lib/progress.mjs) + conexões (data/maps/headers) + warps (objetos)
// Uso: node scripts/build-acquisition-gen1.mjs <jogo>
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadGen1, resolveIfdef, mapLabel } from './lib/gen1-asm.mjs';
import { buildTimeline, placeStage, propagateStages, POSTGAME, teamStage } from './lib/progress.mjs';
import { parseTrainerRuns, SECTIONS_WITH_SUBTITLES } from './lib/pokemythology.mjs';

const gameId = process.argv[2] ?? 'red-blue';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const has = (p) => existsSync(new URL(p, root));
const g = loadGen1(root);
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const trainers = JSON.parse(readFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), 'utf8')).trainers;
const VERSIONS = game.versions;
const DEF = (v) => new Set([`_${v.toUpperCase()}`]);
const monOf = Object.fromEntries(Object.entries(g.species).map(([dex, s]) => [s.name, data.pokemon.find((p) => p.id === Number(dex))]));
const isSpecies = (c) => !!monOf[c];
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const num = (s) => (String(s).startsWith('$') ? parseInt(s.slice(1), 16) : Number(s));

// ---- 1) mapas: CONST ↔ arquivo, conexões e warps
const fileOf = {}, constOf = {};
const conn = new Map(), warp = new Map();
const link = (m, a, b) => { (m.get(a) ?? m.set(a, new Set()).get(a)).add(b); (m.get(b) ?? m.set(b, new Set()).get(b)).add(a); };
for (const f of readdirSync(new URL('data/maps/headers/', root))) {
  const t = read(`data/maps/headers/${f}`);
  const h = t.match(/map_header\s+(\w+),\s*(\w+)/);
  if (!h) continue;
  fileOf[h[2]] = h[1];
  constOf[h[1]] = h[2];
  for (const c of t.matchAll(/connection\s+\w+,\s*\w+,\s*(\w+)/g)) link(conn, h[2], c[1]);
}
const objects = {}; // CONST -> texto do arquivo de objetos
for (const [c, f] of Object.entries(fileOf)) if (has(`data/maps/objects/${f}.asm`)) objects[c] = read(`data/maps/objects/${f}.asm`);
for (const [c, t] of Object.entries(objects)) for (const w of t.matchAll(/warp_event\s+\d+,\s*\d+,\s*(\w+),\s*\d+/g)) if (w[1] !== 'LAST_MAP' && fileOf[w[1]]) link(warp, c, w[1]);
const label = (c) => mapLabel(fileOf[c] ?? c);
// script do mapa = "<Mapa>.asm" + partes "<Mapa>_2.asm"… (o Yellow divide vários: VermilionCity_2 tem o Squirtle da Officer Jenny)
const scriptNames = readdirSync(new URL('scripts/', root));
const scriptFile = (c) => (fileOf[c] ? scriptNames.filter((n) => n === `${fileOf[c]}.asm` || new RegExp(`^${fileOf[c]}_\\d+\\.asm$`).test(n)).map((n) => read(`scripts/${n}`)).join('\n') : '');

// ---- 2) selvagens
const slotPct = [...read('data/wild/probabilities.asm').matchAll(/wild_chance\s+(\d+)/g)].map((m) => Number(m[1]) / 256 * 100);
// WildDataPointers: a POSIÇÃO é o id do mapa (ordem de map_const) — o comentário "; ROUTE_1" falta em várias linhas
const mapConsts = [...read('constants/map_constants.asm').matchAll(/^\s*map_const\s+(\w+)/gm)].map((m) => m[1]);
const ptrBlock = read('data/wild/grass_water.asm').split('WildDataPointers:')[1].split(/assert_table_length|^\s*dw\s+-1/m)[0];
const wildPtr = [...ptrBlock.matchAll(/^\s*dw\s+(\w+)/gm)].map((m, i) => ({ label: m[1], map: mapConsts[i] }));
const wildText = Object.fromEntries(readdirSync(new URL('data/wild/maps/', root)).map((f) => { const t = read(`data/wild/maps/${f}`); return [t.match(/^(\w+):/m)?.[1], t]; }));
const out = Object.fromEntries(VERSIONS.map((v) => [v, {}]));
const push = (v, sp, src) => (out[v][monOf[sp].name] ??= []).push(src);
const wildByMap = Object.fromEntries(VERSIONS.map((v) => [v, {}])); // para "área de selvagens"
for (const v of VERSIONS) {
  for (const { label: lbl, map } of wildPtr) {
    const t = wildText[lbl];
    if (!t) continue;
    const text = resolveIfdef(t, DEF(v));
    for (const [kind, method] of [['grass', 'Grama/caverna'], ['water', 'Surf']]) {
      const sect = text.match(new RegExp(`def_${kind}_wildmons\\s+(\\d+)[^\\n]*\\n([\\s\\S]*?)end_${kind}_wildmons`));
      if (!sect || Number(sect[1]) === 0) continue;
      const slots = [...sect[2].matchAll(/db\s+(\d+),\s*(\w+)/g)].map((m) => ({ level: Number(m[1]), sp: m[2] }));
      const agg = {};
      slots.forEach((s, i) => { const a = (agg[s.sp] ??= { min: s.level, max: s.level, pct: 0 }); a.min = Math.min(a.min, s.level); a.max = Math.max(a.max, s.level); a.pct += slotPct[i]; });
      for (const [sp, a] of Object.entries(agg)) {
        push(v, sp, { type: 'wild', where: label(map), mapId: map, method, min: a.min, max: a.max, pct: Math.round(a.pct) });
        (wildByMap[v][map] ??= []).push(a.min);
      }
    }
  }
}

// ---- 3) pesca
const item = read('engine/items/item_effects.asm');
const oldRod = item.match(/ItemUseOldRod:[\s\S]*?lb bc, (\d+), (\w+)/);
const goodRod = [...resolveIfdef(read('data/wild/good_rod.asm'), new Set()).matchAll(/db\s+(\d+),\s*(\w+)/g)].map((m) => ({ level: Number(m[1]), sp: m[2] }));
const superText = read('data/wild/super_rod.asm');
const groups = {};
for (const m of superText.matchAll(/^\.(Group\d+):\s*\n\s*db\s+(\d+)\s*\n((?:\s*db\s+\d+,\s*\w+\s*\n?)+)/gm)) groups[m[1]] = [...m[3].matchAll(/db\s+(\d+),\s*(\w+)/g)].map((x) => ({ level: Number(x[1]), sp: x[2] }));
for (const v of VERSIONS) {
  if (oldRod) push(v, oldRod[2], { type: 'wild', where: 'qualquer água', mapId: null, method: 'Old Rod', min: Number(oldRod[1]), max: Number(oldRod[1]), pct: 100 });
  for (const r of goodRod) push(v, r.sp, { type: 'wild', where: 'qualquer água', mapId: null, method: 'Good Rod', min: r.level, max: r.level, pct: Math.round(100 / goodRod.length) });
  // Yellow: "db MAPA, ESP, NV, ESP, NV, ESP, NV, ESP, NV" — slots 40/30/20/10% (engine/items/super_rod.asm, GenerateRandomFishingEncounter)
  for (const m of superText.matchAll(/^\s*db\s+([A-Z_0-9]+),\s*(\w+),\s*(\d+),\s*(\w+),\s*(\d+),\s*(\w+),\s*(\d+),\s*(\w+),\s*(\d+)/gm)) {
    const agg = {};
    [40, 30, 20, 10].forEach((pct, i) => { const sp = m[2 + i * 2], lv = Number(m[3 + i * 2]); const a = (agg[sp] ??= { min: lv, max: lv, pct: 0 }); a.min = Math.min(a.min, lv); a.max = Math.max(a.max, lv); a.pct += pct; });
    for (const [sp, a] of Object.entries(agg)) push(v, sp, { type: 'wild', where: label(m[1]), mapId: m[1], method: 'Super Rod', min: a.min, max: a.max, pct: a.pct });
  }
  for (const m of superText.matchAll(/dbw\s+(\w+),\s*\.(Group\d+)/g)) {
    const list = groups[m[2]] ?? [];
    const agg = {};
    for (const x of list) { const a = (agg[x.sp] ??= { min: x.level, max: x.level, n: 0 }); a.min = Math.min(a.min, x.level); a.max = Math.max(a.max, x.level); a.n++; }
    for (const [sp, a] of Object.entries(agg)) push(v, sp, { type: 'wild', where: label(m[1]), mapId: m[1], method: 'Super Rod', min: a.min, max: a.max, pct: Math.round((a.n / list.length) * 100) });
  }
}

// ---- 4) presentes, estáticos, trocas, prêmios
const fossilEngine = has('engine/events/cinnabar_lab.asm') ? read('engine/events/cinnabar_lab.asm') : '';
const fossilMons = [...fossilEngine.matchAll(/ld b, (\w+)/g)].map((m) => m[1]).filter(isSpecies);
for (const v of VERSIONS) {
  for (const c of Object.keys(fileOf)) {
    const s = resolveIfdef(scriptFile(c), DEF(v));
    if (!s) continue;
    for (const m of s.matchAll(/lb bc, (\w+), (\d+)\s*\n\s*call GivePokemon/g)) if (isSpecies(m[1])) push(v, m[1], { type: 'gift', where: label(c), mapId: c, level: Number(m[2]) });
    // Dojo: escolhe um (ld a, HITMONLEE / call DisplayPokedex … ld c, 30 / call GivePokemon)
    const dyn = s.match(/ld c, (\d+)\s*\n\s*call GivePokemon/);
    if (dyn && !/wFossilMon/.test(s)) for (const m of s.matchAll(/ld a, (\w+)\s*\n\s*call DisplayPokedex/g)) if (isSpecies(m[1])) push(v, m[1], { type: 'gift', where: label(c), mapId: c, level: Number(dyn[1]), detail: 'escolha um' });
    if (dyn && /wFossilMon/.test(s)) for (const sp of fossilMons) push(v, sp, { type: 'gift', where: label(c), mapId: c, level: Number(dyn[1]), detail: 'reviver fóssil' });
    for (const m of s.matchAll(/ld a, (\w+)\s*\n\s*ld \[wCurOpponent\], a\s*\n\s*ld a, (\d+)\s*\n\s*ld \[wCurEnemyLevel\], a/g)) {
      if (isSpecies(m[1]) && !/BATTLE_TYPE_OLD_MAN/.test(s)) push(v, m[1], { type: 'static', where: label(c), mapId: c, level: Number(m[2]) });
    }
  }
  for (const [c, t] of Object.entries(objects)) {
    for (const m of resolveIfdef(t, DEF(v)).matchAll(/object_event\s+[^\n]*?,\s*(\w+),\s*(\d+)\s*$/gm)) if (isSpecies(m[1])) push(v, m[1], { type: 'static', where: label(c), mapId: c, level: Number(m[2]) });
  }
  // trocas: ordem do npctrade = TRADE_FOR_*; o script do mapa faz "ld a, TRADE_FOR_X" (Route 11: "xor a ; TRADE_FOR_TERRY")
  const tradeText = resolveIfdef(read('data/events/trades.asm'), DEF(v));
  const trades = [...tradeText.matchAll(/npctrade\s+(\w+),\s*(\w+),\s*\w+,\s*"(\w+)"/g)].map((m) => ({ give: m[1], get: m[2], nick: m[3] }));
  for (const c of Object.keys(fileOf)) {
    for (const m of scriptFile(c).matchAll(/(?:ld a, |xor a ; )TRADE_FOR_(\w+)/g)) {
      const tr = trades.find((x) => x.nick === m[1]);
      if (tr && isSpecies(tr.get)) push(v, tr.get, { type: 'trade', where: label(c), mapId: c, want: monOf[tr.give].name, detail: `troca por ${monOf[tr.give].name}` });
    }
  }
  // Game Corner: espécies + custo (prizes.asm) e nível (prize_mon_levels.asm)
  const prizes = resolveIfdef(read('data/events/prizes.asm'), DEF(v));
  const levels = Object.fromEntries([...resolveIfdef(read('data/events/prize_mon_levels.asm'), DEF(v)).matchAll(/db\s+(\w+),\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
  const prizeRoom = Object.keys(fileOf).find((c) => /PRIZE_ROOM/.test(c));
  for (const k of ['Mon1', 'Mon2']) {
    const sp = [...(prizes.match(new RegExp(`PrizeMenu${k}Entries:([\\s\\S]*?)db "@"`))?.[1] ?? '').matchAll(/db\s+(\w+)/g)].map((m) => m[1]);
    const cost = [...(prizes.match(new RegExp(`PrizeMenu${k}Cost:([\\s\\S]*?)db "@"`))?.[1] ?? '').matchAll(/bcd2\s+(\d+)/g)].map((m) => Number(m[1]));
    sp.forEach((s, i) => isSpecies(s) && push(v, s, { type: 'prize', where: `${label(prizeRoom)} (prêmios)`, mapId: prizeRoom, level: levels[s], detail: `${cost[i]} fichas` }));
  }
  // inicial(is). Yellow: o Pikachu inicial RECUSA pedra de evolução (engine/items/item_effects.asm, ItemUseEvoStone →
  // IsThisPartyMonStarterPikachu → RefusingText) — e não há outro Pikachu no jogo → Raichu só por troca.
  const refusesStone = /ItemUseEvoStone:[\s\S]{0,1200}?IsThisPartyMonStarterPikachu[\s\S]{0,300}?RefusingText/.test(item);
  for (const sp of data.starters?.species ?? []) {
    (out[v][sp] ??= []).push({ type: 'starter', where: data.starters.where, level: data.starters.level, detail: data.starters.species.length > 1 ? 'um dos três iniciais (os outros dois só por troca)' : 'inicial do jogo', stage: 0,
      ...(refusesStone && sp === 'pikachu' && { evolveBlocked: 'ITEM', blockedWhy: 'recusa pedra de evolução (ItemUseEvoStone)' }) });
  }
}

// ---- 5) TMs, HMs e itens
const tmConsts = [...read('constants/item_constants.asm').matchAll(/^\s*add_(tm|hm)\s+(\w+)/gm)].map((m) => ({ item: `${m[1].toUpperCase()}_${m[2]}`, move: m[2] }));
const moveOfItem = Object.fromEntries(tmConsts.map((x) => [x.item, moveIdOf.get(g.moveId[x.move])]));
const machines = {}, items = {};
const addSrc = (it, src) => {
  if (moveOfItem[it]) (machines[moveOfItem[it]] ??= []).push(src);
  else (items[it] ??= []).push(src);
};
for (const [c, t] of Object.entries(objects)) {
  for (const m of t.matchAll(/object_event\s+(\d+),\s*(\d+),\s*SPRITE_POKE_BALL,[^\n]*?,\s*(\w+)\s*$/gm)) if (!isSpecies(m[3]) && !/^TEXT_/.test(m[3])) addSrc(m[3], { type: 'ground', where: label(c), map: c, x: Number(m[1]), y: Number(m[2]), by: 'item no chão', resolved: true });
}
const marts = read('data/items/marts.asm');
for (const m of marts.matchAll(/^(\w+)::?\s*(?:;[^\n]*)?\n\s*script_mart\s+([^\n]+)/gm)) {
  if (/unreferenced/.test(m[0])) continue;
  const c = Object.keys(fileOf).find((k) => new RegExp(`\\b${m[1]}\\b`).test(scriptFile(k)));
  if (!c) continue;
  for (const it of m[2].split(',').map((x) => x.trim())) addSrc(it, { type: 'mart', where: label(c), map: c, by: 'loja', resolved: true });
}
const leaderOfMap = {}; // CONST do ginásio -> nome do líder (como nos treinadores)
for (const t of trainers.filter((x) => x.group === 'Líderes de ginásio')) for (const mp of t.map) { const c = Object.keys(fileOf).find((k) => label(k) === mp); if (c) leaderOfMap[c] = t.name; }
for (const c of Object.keys(fileOf)) {
  const s = scriptFile(c);
  for (const m of s.matchAll(/lb bc, (\w+), \d+[\s\S]{0,160}?call GiveItem/g)) if (!isSpecies(m[1])) addSrc(m[1], { type: 'gift', where: label(c), map: c, by: leaderOfMap[c] ? `líder ${leaderOfMap[c]}` : 'NPC', resolved: true, ...(leaderOfMap[c] && { leader: leaderOfMap[c] }) });
  for (const m of s.matchAll(/ld a, ((?:HM|TM)_\w+)\b/g)) if (!Object.values(machines).flat().some((x) => x.map === c && x.item === m[1])) addSrc(m[1], { type: 'gift', where: label(c), map: c, by: 'NPC', resolved: true, item: m[1] });
}
const hidden = read('data/events/hidden_events.asm');
for (const blk of hidden.split(/hidden_events_for\s+/).slice(1)) {
  const c = blk.match(/^(\w+)/)[1];
  for (const m of blk.matchAll(/hidden_event\s+(\d+),\s*(\d+),\s*HiddenItems,\s*(\w+)/g)) if (fileOf[c]) addSrc(m[3], { type: 'hidden', where: label(c), map: c, x: Number(m[1]), y: Number(m[2]), by: 'escondido', resolved: true });
}
const prizesAll = read('data/events/prizes.asm');
const prizeRoom = Object.keys(fileOf).find((c) => /PRIZE_ROOM/.test(c));
const tmPrize = [...(prizesAll.match(/PrizeMenuTMsEntries:([\s\S]*?)db "@"/)?.[1] ?? '').matchAll(/db\s+(\w+)/g)].map((m) => m[1]);
const tmCost = [...(prizesAll.match(/PrizeMenuTMsCost:([\s\S]*?)db "@"/)?.[1] ?? '').matchAll(/bcd2\s+(\d+)/g)].map((m) => Number(m[1]));
tmPrize.forEach((it, i) => addSrc(it, { type: 'prize', where: `${label(prizeRoom)} (prêmios)`, map: prizeRoom, by: `${tmCost[i]} fichas`, resolved: true }));
for (const list of Object.values(machines)) for (const s of list) delete s.item;

// ---- 6) estágio de cada mapa (detonado) + portas (HM/varas)
const people = (group) => Object.values(Object.groupBy(trainers.filter((t) => t.group === group), (t) => t.name)).map((ts) => ({ name: ts[0].name, teams: ts.map((t) => t.party) }));
const wtFile = new URL(`../data-sources/pokemythology/${game.walkthrough}.html`, import.meta.url);
let wtHtml = readFileSync(wtFile, 'utf8');
for (const [wrong, right] of Object.entries(game.walkthroughTypos ?? {})) wtHtml = wtHtml.replace(new RegExp(wrong, 'gi'), (m) => (m === m.toUpperCase() ? right.toUpperCase() : right));
const timeline = buildTimeline(wtHtml, people('Líderes de ginásio'), people('Elite dos Quatro'), { blocks: parseTrainerRuns(wtHtml), sectionRe: SECTIONS_WITH_SUBTITLES });
const ids = Object.keys(fileOf);
const titleKnown = new Map(), textKnown = new Map(), detail = {};
for (const id of ids) {
  const r = placeStage(timeline, label(id));
  if (!r) continue;
  (r.by === 'título' ? titleKnown : textKnown).set(id, r.stage);
  detail[id] = r;
}
// Fatos do código valem como título (maior precedência):
//   • início do jogo: NewGameWarp (data/maps/special_warps.asm) → casa do jogador e, pelas portas, a cidade = estágio 0.
//     (Sem isso Pallet ia para 6: "maior vizinho" pela Route 21, que só se alcança com Surf.)
//   • game.stageFacts: { MAPA: { stage, why } } — fatos do decomp que o detonado não nomeia (ver games.mjs)
const facts = {};
const startMap = read('data/maps/special_warps.asm').match(/NewGameWarp:\s*\n\s*special_warp_spec\s+(\w+)/)?.[1];
for (let cur = startMap, seen = new Set(); cur && !seen.has(cur); ) {
  seen.add(cur);
  facts[cur] = { stage: 0, why: 'início do jogo (NewGameWarp)' };
  if (conn.has(cur)) break; // chegou ao exterior (cidade)
  cur = [...(warp.get(cur) ?? [])].find((n) => !seen.has(n));
}
for (const [id, f] of Object.entries(game.stageFacts ?? {})) facts[id] = f;
//   • mapa cujo script CHECA insígnias (portão "bit BIT_BOULDERBADGE" na Route 22 Gate; guardas da Route 23 com
//     EVENT_PASSED_<X>BADGE_CHECK até a EARTHBADGE) → estágio = insígnia mais alta checada. Ginásio que ENTREGA
//     ("set BIT_XBADGE") não conta. (Sem isso a Route 23 herdava 0 da Route 22 e rebaixava a Indigo Plateau.)
const badgeOrder = [...read('constants/ram_constants.asm').matchAll(/const\s+BIT_(\w+)BADGE/g)].map((m) => m[1]);
for (const c of ids) {
  const s = scriptFile(c);
  if (/set BIT_\w+BADGE/.test(s)) continue;
  const checked = [...s.matchAll(/bit BIT_(\w+)BADGE|EVENT_PASSED_(\w+)BADGE_CHECK/g)].map((m) => badgeOrder.indexOf(m[1] ?? m[2])).filter((i) => i >= 0);
  if (checked.length && !facts[c]) facts[c] = { stage: Math.max(...checked) + 1, why: `script checa a insígnia ${badgeOrder[Math.max(...checked)]}` };
}
for (const [id, f] of Object.entries(facts)) { titleKnown.set(id, f.stage); textKnown.delete(id); detail[id] = { stage: f.stage, by: 'código', why: f.why }; }
const reference = propagateStages(titleKnown, conn, warp);
const known = new Map(titleKnown);
for (const [id, s] of textKnown) {
  let around = [...(conn.get(id) ?? [])].map((n) => reference.get(n)).filter((x) => x !== undefined);
  // interior (só portas): só PISO pela porta — o teto rebaixava o Diglett's Cave (citado no estágio 3) para 0
  if (!around.length) { const doors = [...(warp.get(id) ?? [])].map((n) => reference.get(n)).filter((x) => x !== undefined); known.set(id, doors.length ? Math.max(s, Math.min(...doors)) : s); continue; }
  known.set(id, Math.min(Math.max(s, Math.min(...around)), Math.max(...around)));
}
const st = propagateStages(known, conn, warp);
if (process.env.WHY) for (const id of process.env.WHY.split(',')) console.log('WHY', id, label(id), JSON.stringify(detail[id] ?? null), 'text', textKnown.get(id), 'known', known.get(id), 'st', st.get(id), 'conn', [...(conn.get(id) ?? [])].join('/'), 'warp', [...(warp.get(id) ?? [])].join('/'));
// interior (só portas, sem conexões) nunca antes do lado de fora: a "Route 12 Super Rod House" era citada ("Super Rod")
// num trecho do estágio 1, mas só se chega à Route 12 depois da Poké Flute
for (let p = 0; p < 4; p++) for (const id of ids) {
  if (conn.has(id) || !warp.has(id) || !st.has(id)) continue;
  const outside = [...warp.get(id)].map((n) => st.get(n)).filter((x) => x !== undefined);
  if (outside.length) st.set(id, Math.max(st.get(id), Math.min(...outside)));
}
const leaderStage = (name) => { const i = timeline.leaderOrder.indexOf(name); return i >= 0 ? i + 1 : null; };
const leaderTop = (name) => Math.max(...trainers.filter((t) => t.name === name && t.group === 'Líderes de ginásio').flatMap((t) => t.party.map((p) => p.level)));
// área de selvagens: menor nível selvagem no mapa ou nos vizinhos (conexões/portas, até 2 passos)
const areaLevel = (start, v) => {
  let frontier = [start], seen = new Set([start]);
  for (let d = 0; d <= 2; d++) {
    const lv = frontier.flatMap((c) => wildByMap[v][c] ?? []);
    if (lv.length) return { level: Math.min(...lv), near: [...new Set(frontier.filter((c) => wildByMap[v][c]).map(label))].join(', ') };
    frontier = frontier.flatMap((c) => [...(conn.get(c) ?? []), ...(warp.get(c) ?? [])]).filter((c) => !seen.has(c) && seen.add(c));
  }
  return null;
};
// HM fora da batalha: insígnia (start_sub_menus.asm) → líder que a entrega (script do ginásio "set BIT_XBADGE")
const menus = read('engine/menus/start_sub_menus.asm');
const badgeBits = [...read('constants/ram_constants.asm').matchAll(/const\s+BIT_(\w+)BADGE/g)].map((m) => m[1]);
const badgeLeader = {};
for (const c of Object.keys(fileOf)) { const b = scriptFile(c).match(/set BIT_(\w+)BADGE/); if (b && leaderOfMap[c]) badgeLeader[b[1]] = leaderOfMap[c]; }
const giverOf = (it) => [...(items[it] ?? []), ...(machines[moveOfItem[it]] ?? [])].find((s) => s.type === 'gift');
const gates = {};
for (const [method, field, hm] of [['Surf', '.surf', 'HM_SURF']]) {
  const bit = menus.match(new RegExp(`\\${field}\\s*\\n\\s*bit BIT_(\\w+)BADGE`))?.[1];
  const leader = badgeLeader[bit];
  const giver = giverOf(hm);
  gates[method] = { level: Math.max(leaderTop(leader), giver ? areaLevel(giver.map, VERSIONS[0])?.level ?? 0 : 0), item: giver?.where ?? null, badge: badgeBits.indexOf(bit) + 1, leader, stage: Math.max(st.get(giver?.map) ?? 0, leaderStage(leader) ?? 0) };
}
for (const [method, it] of [['Old Rod', 'OLD_ROD'], ['Good Rod', 'GOOD_ROD'], ['Super Rod', 'SUPER_ROD']]) {
  const giver = giverOf(it);
  if (giver) gates[method] = { level: areaLevel(giver.map, VERSIONS[0])?.level ?? 1, item: giver.where, stage: st.get(giver.map) ?? null };
}
const firstMention = (sp) => timeline.chunks.find((c) => c.text.includes(sp.replace(/-/g, '')))?.stage ?? null;
for (const v of VERSIONS) for (const [sp, list] of Object.entries(out[v])) for (const s of list) {
  if (s.stage === undefined) s.stage = s.mapId ? st.get(s.mapId) ?? null : null;
  if (['gift', 'static'].includes(s.type) && s.stage != null) { const f = firstMention(sp); if (f != null && f > s.stage) { s.stage = f; s.stageBy = 'citação da espécie no detonado'; } }
  if (s.type === 'wild' && gates[s.method]) { s.gate = gates[s.method]; if (s.mapId == null) s.stage = gates[s.method].stage; }
  if (s.mapId) { const a = areaLevel(s.mapId, v); if (a) s.area = a; }
}
for (const list of [...Object.values(machines), ...Object.values(items)]) for (const s of list) {
  s.level = areaLevel(s.map, VERSIONS[0])?.level ?? null;
  s.stage = s.leader ? Math.max(st.get(s.map) ?? 0, leaderStage(s.leader) ?? 8) : st.get(s.map) ?? null;
}
for (const list of [...Object.values(machines), ...Object.values(items)]) list.sort((a, b) => (a.stage ?? 9) - (b.stage ?? 9));

// ---- 7) obtível = fonte direta ou evolução de algo obtível (troca por espécie também conta)
const USABLE = new Set(['wild', 'gift', 'static', 'trade', 'prize', 'starter']);
const byId = new Map(data.pokemon.map((p) => [p.id, p]));
const changes = [];
for (const v of VERSIONS) {
  const memo = new Map();
  const can = (mon) => {
    if (memo.has(mon.name)) return memo.get(mon.name);
    memo.set(mon.name, false);
    const parent = byId.get(mon.evolvesFrom);
    // pela evolução: o pai precisa ser obtível por uma fonte que NÃO bloqueie esse tipo de evolução (Pikachu do Yellow)
    const parentOk = parent && mon.evo?.possible !== false && can(parent) && (
      (out[v][parent.name] ?? []).some((s) => USABLE.has(s.type) && s.evolveBlocked !== mon.evo?.kind) || !!byId.get(parent.evolvesFrom));
    const ok = (out[v][mon.name] ?? []).some((s) => USABLE.has(s.type)) || !!parentOk;
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
  // nº da insígnia (ordem de BIT_*BADGE) → líder que a entrega ("set BIT_XBADGE" no script do ginásio) — bônus de atributo
  badges: badgeBits.map((b, i) => ({ n: i + 1, name: b, leader: badgeLeader[b] ?? null })),
  source: `PokeMythology ${game.walkthrough} + conexões do decomp`, leaderOrder: timeline.leaderOrder, leadersFound: timeline.leadersFound, eliteFound: timeline.eliteFound,
  mapsWithStage: st.size, mapsTotal: ids.length,
  maps: Object.fromEntries(ids.map((c) => [c, { folder: fileOf[c], label: label(c), stage: st.get(c) ?? null }])),
  reviewEarlierMention: Object.entries(detail).filter(([, r]) => r.earlierMention).map(([id, r]) => ({ map: label(id), stage: r.stage, earlier: r.earlierMention })),
};
writeFileSync(new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, versions: out, machines, tutors: {}, items, progress }));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/obtainable-changes.json`, import.meta.url), JSON.stringify(changes, null, 1));
const tmTotal = tmConsts.length, tmWith = tmConsts.filter((x) => machines[moveOfItem[x.item]]?.length).length;
console.log(`[${gameId}] líderes no detonado: ${timeline.leaderOrder.join(' > ')} (${timeline.leadersFound}/8; Elite ${timeline.eliteFound}/4); mapas com estágio ${st.size}/${ids.length}`);
console.log(`  TM/HM com origem: ${tmWith}/${tmTotal}${tmWith < tmTotal ? ' — sem: ' + tmConsts.filter((x) => !machines[moveOfItem[x.item]]?.length).map((x) => x.item).join(', ') : ''}`);
for (const v of VERSIONS) console.log(`  ${v}: ${data.pokemon.filter((p) => p.obtainable[v]).length} obtíveis; ${Object.keys(out[v]).length} com fonte direta`);
console.log(`  portas: ${Object.entries(gates).map(([k, x]) => `${k} → ${x.item}${x.leader ? ` + ${x.leader}` : ''} (estágio ${x.stage})`).join('; ')}`);
console.log(`  mudanças de "obtível": ${changes.length}${changes.length ? ' ex.: ' + changes.slice(0, 8).join(', ') : ''}`);
