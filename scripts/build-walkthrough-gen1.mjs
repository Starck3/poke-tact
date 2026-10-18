// Detonado dentro do app para a Gen 1 e a Gen 2 → public/data/<jogo>-walkthrough.json (mesmo formato da Gen 3)
// Locais = agrupamento do próprio jogo para o mapa da cidade:
//   • mapas externos: ExternalMapEntries (data/maps/town_map_entries.asm), um por mapa, na ordem de map_const
//   • mapas internos: grupos sequenciais em constants/map_constants.asm ("end_indoor_group X" fecha o grupo X) com o
//     nome em InternalMapEntries ("indoor_map X, x, y, NomeName") → data/maps/names.asm ("PALLET TOWN@")
// Local = grupo + estágio (o mesmo grupo pode ter mapas em estágios diferentes, ex.: Cerulean City e Cerulean Cave).
// Conteúdo: <jogo>-acquisition.json (selvagens, presentes, TMs/itens, estágios) e <jogo>-trainers.json (times).
// Uso: node scripts/build-walkthrough-gen1.mjs <jogo>
import { readFileSync, writeFileSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { mapLabel } from './lib/gen1-asm.mjs';

const gameId = process.argv[2] ?? 'red-blue';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const acq = load(`${gameId}-acquisition.json`);
const trainers = load(`${gameId}-trainers.json`).trainers;
const maps = acq.progress.maps; // CONST -> { folder, label, stage }

// ---- grupos de mapas → nome do local
// tokens de texto do Game Boy: "#" = POKé ("#MON TOWER"), "<PKMN>" = POKéMON, "<BSP>" = quebra de linha (Gen 2)
const title = (s) => s.replace(/#MON|<PKMN>/g, 'POKéMON').replace(/#/g, 'POKé').replace(/<BSP>|¯/g, ' ').toLowerCase().replace(/(^|[\s.])([a-zé])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bS\.s\./i, 'S.S.').replace(/\bMt\.(?=\S)/, 'Mt. ');
const sectionOf = {};
if (game.generation === 4) {
  // Gen 4: o cabeçalho do mapa traz o nome do local (mapLabelTextID: "LocationNames_Text_JubilifeCity") → "Jubilife City"
  // HGSS: .mapsec = MAPSEC_VIOLET_CITY (include/constants/map_sections.h) → "Violet City"
  for (const [c, m] of Object.entries(maps)) {
    if (/^MAPSEC_/.test(m.landmark ?? '')) { sectionOf[c] = title(m.landmark.replace(/^MAPSEC_/, '').replace(/_/g, ' ')).replace(/\bMt\b/, 'Mt.').replace(/\bPokemon\b/g, 'Pokémon').replace(/\bSs\b/, 'S.S.'); continue; }
    const t = (m.landmark ?? '').replace(/^LocationNames_Text_/, '');
    sectionOf[c] = t ? t.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/(\d)([A-Z])/g, '$1 $2').replace(/Pokemon/g, 'Pokémon') : m.label;
  }
} else if (game.generation === 2) {
  // Gen 2: cada mapa tem o seu LANDMARK_* (data/maps/maps.asm, já em progress.maps[].landmark); nome em data/maps/landmarks.asm
  const lc = [...read('constants/landmark_constants.asm').matchAll(/^\s*const\s+(LANDMARK_\w+)/gm)].map((m) => m[1]);
  const lm = read('data/maps/landmarks.asm');
  const lmLabels = [...lm.matchAll(/^\s*landmark\s+-?\d+,\s*-?\d+,\s*(\w+)/gm)].map((m) => m[1]);
  const lmNames = Object.fromEntries([...lm.matchAll(/^(\w+):\s*db\s+"([^@"]+)@?"/gm)].map((m) => [m[1], m[2]]));
  for (const [c, m] of Object.entries(maps)) { const nm = lmNames[lmLabels[lc.indexOf(m.landmark)]]; sectionOf[c] = nm && m.landmark !== 'LANDMARK_SPECIAL' ? title(nm) : mapLabel(m.folder); }
} else {
  const names = Object.fromEntries([...read('data/maps/names.asm').matchAll(/^(\w+):\s*db\s+"([^@"]+)@?"/gm)].map((m) => [m[1], m[2]]));
  const tme = read('data/maps/town_map_entries.asm');
  const outdoor = [...tme.split('ExternalMapEntries:')[1].split('assert_table_length')[0].matchAll(/outdoor_map\s+\d+,\s*\d+,\s*(\w+)/g)].map((m) => m[1]);
  const indoorName = Object.fromEntries([...tme.matchAll(/indoor_map\s+(\w+),\s*\d+,\s*\d+,\s*(\w+)/g)].map((m) => [m[1], m[2]]));
  const mc = read('constants/map_constants.asm');
  let pending = [];
  let idx = 0;
  for (const line of mc.split('\n')) {
    const m = line.match(/^\s*map_const\s+(\w+)/);
    if (m) {
      if (idx < outdoor.length) sectionOf[m[1]] = names[outdoor[idx]] ? title(names[outdoor[idx]]) : mapLabel(maps[m[1]]?.folder ?? m[1]);
      else pending.push(m[1]);
      idx++;
      continue;
    }
    const end = line.match(/^\s*end_indoor_group\s+(\w+)/);
    if (end) {
      const nm = names[indoorName[end[1]]];
      for (const c of pending) sectionOf[c] = nm ? title(nm) : mapLabel(maps[c]?.folder ?? c);
      pending = [];
    }
  }
}

// ---- conteúdo por mapa
const VERSIONS = Object.keys(acq.versions);
const byLabel = Object.fromEntries(Object.entries(maps).map(([c, m]) => [m.label, c]));
const trainerParty = (t) => t.party.map((p) => ({ species: p.species, level: p.level }));
const leaderOrder = acq.progress.leaderOrder;
const out = {};
for (const v of VERSIONS) {
  const locs = new Map(); // "seção|estágio" -> local
  const locOf = (c, override = null) => {
    const stage = override != null && maps[c]?.stage != null ? Math.max(override, maps[c].stage) : maps[c]?.stage; // luta pelo time no detonado (só sobe)
    if (stage == null) return null;
    const section = sectionOf[c] ?? mapLabel(maps[c].folder);
    const key = `${section}|${stage}`;
    if (!locs.has(key)) locs.set(key, { section, name: section, stage, maps: [], wild: [], others: [], items: [], tutors: [], trainers: [] });
    const l = locs.get(key);
    if (!l.maps.includes(maps[c].label)) l.maps.push(maps[c].label);
    return l;
  };
  for (const c of Object.keys(maps)) locOf(c);
  for (const [sp, list] of Object.entries(acq.versions[v])) for (const s of list) {
    if (!s.mapId) continue;
    const l = locOf(s.mapId);
    if (!l) continue;
    if (s.type === 'wild') l.wild.push({ species: sp, where: s.where, method: s.method, min: s.min, max: s.max, pct: s.pct, ...(s.gate && { gate: s.gate }), ...(s.times && { times: s.times }), ...(s.detail && { detail: s.detail }) });
    else l.others.push({ species: sp, type: s.type, level: s.level ?? null, where: s.where, ...(s.detail && { detail: s.detail }) });
  }
  for (const [move, list] of Object.entries(acq.machines)) for (const s of list) { const l = locOf(s.map); if (l) l.items.push({ kind: 'TM/HM', move, type: s.leader ? 'gym' : s.type, where: s.where, ...(s.x != null && { x: s.x, y: s.y }), by: s.by }); }
  for (const [item, list] of Object.entries(acq.items)) for (const s of list) { const l = locOf(s.map); if (l) l.items.push({ kind: 'item', item, type: s.type, where: s.where, ...(s.x != null && { x: s.x, y: s.y }), by: s.by }); }
  const unplaced = [];
  let rematches = 0;
  const leaders = trainers.filter((t) => t.group === 'Líderes de ginásio');
  for (const t of trainers) {
    const cs = t.map.map((m) => byLabel[m]).filter(Boolean);
    if (!cs.length) { unplaced.push({ key: t.key, label: t.label }); continue; }
    if (leaders.includes(t) && leaderOrder.includes(t.name)) continue; // o líder aparece como "Próximo líder" do estágio
    if (t.rematch) { rematches++; continue; } // revanche por telefone (Gen 2): só conta, não é luta nova no caminho
    const l = locOf(cs[0], acq.progress.trainerStage?.[t.key] ?? null);
    l.trainers.push({ key: t.key, label: t.label, name: t.name, group: t.group, double: false, forStarter: t.forStarter ?? null, party: trainerParty(t) });
  }
  for (const l of locs.values()) {
    const lv = l.wild.map((w) => w.min);
    if (lv.length) l.minLevel = Math.min(...lv);
    l.wild.sort((a, b) => b.pct - a.pct);
  }
  const stages = Array.from({ length: 10 }, (_, s) => {
    const name = leaderOrder[s];
    const t = name && leaders.find((x) => x.name === name && x.map.some((m) => /Gym/.test(m)));
    const leader = t ? { stage: s, name, key: t.key, where: t.map.join(', '), party: t.party.map((p) => ({ species: p.species, level: p.level, moves: p.moves, item: null })), prize: Object.entries(acq.machines).filter(([, l]) => l.some((x) => x.leader === name)).map(([m]) => m) } : null;
    const locations = [...locs.values()].filter((l) => l.stage === s && (l.wild.length || l.others.length || l.items.length || l.trainers.length)).sort((a, b) => (a.minLevel ?? 99) - (b.minLevel ?? 99) || a.name.localeCompare(b.name));
    return { stage: s, leader, locations };
  });
  out[v] = { stages, undetermined: [...locs.values()].filter((l) => l.stage == null).map((l) => l.name), unplacedTrainers: unplaced, rematches };
}
const doc = {
  game: gameId,
  source: `${game.asmDecomp.repo} + PokéAPI; ordem da história: ${acq.progress.source}`,
  credit: 'Ordem da história baseada no detonado do PokeMythology (pokemythology.net). Conteúdo deste detonado gerado a partir dos dados do jogo.',
  leaders: leaderOrder,
  versions: out,
};
writeFileSync(new URL(`../public/data/${gameId}-walkthrough.json`, import.meta.url), JSON.stringify(doc));
for (const v of VERSIONS) {
  const st = out[v].stages;
  const n = st.reduce((a, s) => a + s.locations.length, 0);
  const tr = st.reduce((a, s) => a + s.locations.reduce((b, l) => b + l.trainers.length, 0) + (s.leader ? 1 : 0), 0);
  console.log(`[${gameId}/${v}] ${n} locais em 10 estágios; ${tr} treinadores colocados (${out[v].unplacedTrainers.length} sem mapa); por estágio: ${st.map((s) => s.locations.length).join(' ')}`);
}
