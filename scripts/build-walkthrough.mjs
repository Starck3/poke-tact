// Gera public/data/<jogo>-walkthrough.json: o "detonado" do app, montado SÓ com fatos dos dados do jogo
// (decomp + PokéAPI), organizado pelos estágios de progresso (0–8 insígnias, 9 = pós-jogo).
// Nada de texto/imagem de terceiros: o PokeMythology entra apenas como fonte da ORDEM da história (crédito na tela).
// Uso: node scripts/build-walkthrough.mjs <jogo>   (depois de build-trainers e build-acquisition)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { decompPaths } from './lib/decomp.mjs';
import { parseBlocks, reachable } from './lib/script-graph.mjs';
import { parseVersionAliases, resolveFor } from './lib/version-aliases.mjs';

const gameId = process.argv[2] ?? 'firered-leafgreen';
const { game, mapsDir } = decompPaths(gameId);
const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const data = load(`${gameId}.json`);
const acq = load(`${gameId}-acquisition.json`);
const { trainers } = load(`${gameId}-trainers.json`);
if (!acq.progress?.maps) { console.log(`[${gameId}] sem linha do tempo de progresso — detonado não gerado`); process.exit(0); }

const maps = acq.progress.maps; // MAP_ID -> { folder, label, stage, section, type }
const sectionName = (s) => (s ?? 'MAPSEC_NONE').replace(/^MAPSEC_/, '').split('_').map((w) => (/^\d+$/.test(w) ? w : w[0] + w.slice(1).toLowerCase())).join(' ');
const folderToId = Object.fromEntries(Object.entries(maps).map(([id, m]) => [m.folder, id]));

// Treinadores por mapa: evento do map.json → grafo (script do mapa + compartilhados) → trainerbattle*.
// (Só o script do mapa ligava 253 de ~490 lutas no FRLG: 221 estão em data/scripts/ — mesma armadilha dos TMs.)
// Revanches (VS Seeker, _2.._9) não aparecem em scripts e ficam fora do detonado, de propósito.
const trainerAt = {}; // TRAINER_KEY -> MAP_ID
{
  const sharedDir = new URL('../scripts/', mapsDir);
  const shared = new Map(readdirSync(sharedDir).filter((n) => n.endsWith('.inc')).flatMap((n) => [...parseBlocks(readFileSync(new URL(n, sharedDir), 'utf8'))]));
  for (const f of readdirSync(mapsDir)) {
    const id = folderToId[f];
    if (!id) continue;
    let own = '';
    try { own = readFileSync(new URL(`${f}/scripts.inc`, mapsDir), 'utf8'); } catch {}
    for (const m of own.matchAll(/trainerbattle\w*\s+(TRAINER_\w+)/g)) trainerAt[m[1]] ??= id;
    let j = null;
    try { j = JSON.parse(readFileSync(new URL(`${f}/map.json`, mapsDir), 'utf8')); } catch { continue; }
    const graph = new Map([...shared, ...parseBlocks(own)]);
    for (const o of j.object_events ?? []) {
      if (!o.script || !shared.has(o.script)) continue;
      for (const l of reachable(graph, o.script, { fallthrough: false })) for (const line of graph.get(l)?.lines ?? []) {
        const tb = line.match(/^trainerbattle\w*\s+(TRAINER_\w+)/);
        if (tb) trainerAt[tb[1]] ??= id;
      }
    }
  }
}
const trainerByKey = Object.fromEntries(trainers.map((t) => [t.key, t]));
// treinadores que mudam por versão (Ruby/Sapphire: Equipe Magma × Aqua) — constants/version.inc
const { read } = decompPaths(gameId);
const vAliases = game.decomp.versionDefine ? parseVersionAliases(game.decomp.versionDefine.files.map((f) => { try { return read(f); } catch { return ''; } }), game.decomp.versionDefine) : {};
const leaders = acq.progress.leaderOrder ?? [];

function build(version) {
  const sections = new Map(); // section -> location
  const loc = (mapId) => {
    const m = maps[mapId];
    if (!m) return null;
    const key = `${m.section ?? mapId}|${m.stage ?? 'x'}`;
    if (!sections.has(key)) sections.set(key, { section: m.section ?? mapId, name: sectionName(m.section), stage: m.stage ?? null, maps: new Set(), wild: [], others: [], items: [], tutors: [], trainers: [], minLevel: 999 });
    const l = sections.get(key);
    l.maps.add(m.label);
    return l;
  };
  for (const [species, list] of Object.entries(acq.versions[version])) for (const s of list) {
    if (!s.mapId) continue;
    const l = loc(s.mapId);
    if (!l) continue;
    if (s.type === 'wild') { l.wild.push({ species, where: s.where, method: s.method, min: s.min, max: s.max, pct: s.pct, ...(s.gate && { gate: { stage: s.gate.stage ?? null, badge: s.gate.badge ?? null, leader: s.gate.leader ?? null } }) }); l.minLevel = Math.min(l.minLevel, s.min); }
    else {
      // ovo da creche: uma fonte por pai (Pichu pelo Pikachu e pelo Raichu) — no Detonado aparece uma vez só
      const o = { species, type: s.type, where: s.where, level: s.level ?? null, detail: s.detail ?? null };
      if (s.type !== 'breed' || !l.others.some((x) => JSON.stringify(x) === JSON.stringify(o))) l.others.push(o);
    }
  }
  for (const [move, list] of Object.entries(acq.machines ?? {})) for (const s of list) {
    const l = loc(folderToId[s.map]);
    if (l) l.items.push({ kind: 'TM/HM', move, type: s.type, where: s.where, x: s.x ?? null, y: s.y ?? null, by: s.by ?? null, leader: s.leader ?? null });
  }
  for (const [item, list] of Object.entries(acq.items ?? {})) for (const s of list) {
    const l = loc(folderToId[s.map]);
    if (l) l.items.push({ kind: 'item', item, type: s.type, where: s.where, x: s.x ?? null, y: s.y ?? null, by: s.by ?? null });
  }
  for (const [move, list] of Object.entries(acq.tutors ?? {})) for (const s of list) {
    const l = loc(folderToId[s.map]);
    if (l) l.tutors.push({ move, where: s.where, x: s.x ?? null, y: s.y ?? null, by: s.by ?? null, detail: s.detail ?? null });
  }
  for (const [rawKey, mapId] of Object.entries(trainerAt)) {
    const key = resolveFor(vAliases, rawKey, version);
    const t = trainerByKey[key];
    const l = t && loc(mapId);
    if (!l) continue;
    l.trainers.push({ key, label: t.label, name: t.name, group: t.group, double: t.double, forStarter: t.forStarter ?? null, party: t.party.map((p) => ({ species: p.species, level: p.level })) });
    l.minLevel = Math.min(l.minLevel, ...t.party.map((p) => p.level));
  }
  // líder de cada estágio: o N-ésimo da ordem real vence → libera o estágio N
  const leaderInfo = leaders.map((name, i) => {
    const t = trainers.find((x) => x.name === name && x.group === 'Líderes de ginásio' && trainerAt[x.key]);
    const prize = Object.entries(acq.machines ?? {}).filter(([, l]) => l.some((s) => s.leader === name)).map(([m]) => m);
    return { stage: i, name, key: t?.key ?? null, where: t ? maps[trainerAt[t.key]]?.label : null, party: t?.party.map((p) => ({ species: p.species, level: p.level, moves: p.moves, item: p.item })) ?? [], prize };
  });
  const stages = Array.from({ length: 10 }, (_, s) => ({ stage: s, leader: leaderInfo[s] ?? null, locations: [] }));
  const undetermined = [];
  for (const l of sections.values()) {
    const out = { ...l, maps: [...l.maps].sort(), minLevel: l.minLevel === 999 ? null : l.minLevel };
    if (!out.wild.length && !out.others.length && !out.items.length && !out.tutors.length && !out.trainers.length) continue;
    (l.stage == null ? undetermined : stages[l.stage].locations).push(out);
  }
  for (const st of stages) st.locations.sort((a, b) => (a.minLevel ?? 99) - (b.minLevel ?? 99) || a.name.localeCompare(b.name));
  const placed = new Set(Object.keys(trainerAt).map((k) => resolveFor(vAliases, k, version)));
  // revanche = X_2..X_9 quando existe o mesmo treinador X ou X_1 (TEAM_ROCKET_GRUNT_2 NÃO é revanche: é outro treinador)
  const keys = new Set(trainers.map((t) => t.key));
  const isRematch = (k) => { const m = k.match(/^(.*)_([2-9])$/); return !!m && (keys.has(m[1]) || keys.has(m[1] + '_1')) && !placed.has(k); };
  const unplacedTrainers = trainers.filter((t) => !placed.has(t.key) && !isRematch(t.key)).map((t) => t.key);
  const rematches = trainers.filter((t) => isRematch(t.key)).length;
  return { stages, undetermined, unplacedTrainers, rematches };
}

const out = {
  game: gameId,
  source: `${game.decomp.repo} + PokéAPI; ordem da história: ${acq.progress.source}`,
  credit: 'Ordem da história baseada no detonado do PokeMythology (pokemythology.net). Conteúdo deste detonado gerado a partir dos dados do jogo.',
  leaders,
  versions: Object.fromEntries(game.versions.map((v) => [v, build(v)])),
};
writeFileSync(new URL(`../public/data/${gameId}-walkthrough.json`, import.meta.url), JSON.stringify(out));
const v0 = out.versions[game.versions[0]];
console.log(`[${gameId}] detonado: ${v0.stages.reduce((n, s) => n + s.locations.length, 0)} locais em 10 estágios | indeterminados: ${v0.undetermined.length} | treinadores ligados a mapas: ${Object.keys(trainerAt).length}/${trainers.length}`);
