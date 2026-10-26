// Mapa esquemático da região (desenho nosso, sem arte do jogo): a posição de cada lugar no mapa da região do próprio jogo,
// tirada do decomp, e o lugar de cada fonte do "onde obter" → public/data/<jogo>-regionmap.json. A tela desenha em SVG
// e destaca onde capturar o Pokémon.
//   Gen 1 (pret/pokered, pokeyellow): data/maps/town_map_entries.asm — ExternalMapEntries / InternalMapEntries (x, y em
//     quadros de 8 px, grade 20 × 18) + data/maps/names.asm (nome que o jogo mostra)
//   Gen 2 (pret/pokegold, pokecrystal): data/maps/landmarks.asm — "landmark x, y, Nome" (pixels; o macro soma +8/+16) e
//     constants/landmark_constants.asm (KANTO_LANDMARK separa Johto de Kanto)
//   Gen 3 (pret/pokeemerald, pokeruby): src/data/region_map/region_map_sections.json — nome, x, y, largura e altura de cada
//     MAPSEC na grade do mapa de Hoenn (o do FireRed/LeafGreen não traz coordenadas: o mapa de Kanto é binário)
// Uso: node scripts/build-region-maps.mjs <jogo>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { words } from './lib/progress.mjs';

const gameId = process.argv[2];
const game = GAMES[gameId];
// remakes sem decomp na MESMA região de um jogo que já tem o mapa: reaproveita as posições, casando pelo nome do lugar
// (BDSP = Sinnoh do Platinum; ORAS = Hoenn do Emerald; Let's Go = Kanto do Red/Blue). A fonte diz de onde vieram.
// Black/White: a mesma Unova do Black 2/White 2 (grade de zonas do pokebw2)
const TWIN = { 'brilliant-diamond-shining-pearl': 'platinum', 'omega-ruby-alpha-sapphire': 'emerald', 'lets-go-pikachu-lets-go-eevee': 'red-blue', 'black-white': 'black-2-white-2' };
const twinFile = TWIN[gameId] && new URL(`../public/data/${TWIN[gameId]}-regionmap.json`, import.meta.url);
const acqTwin = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
if (twinFile && existsSync(twinFile) && existsSync(acqTwin)) {
  const tw = JSON.parse(readFileSync(twinFile, 'utf8'));
  const acq = JSON.parse(readFileSync(acqTwin, 'utf8'));
  const nm = (s) => words(String(s).replace(/\s*\(.*?\)\s*/g, ' ')).map((w) => (w === 'mount' ? 'mt' : w.length > 4 ? w.replace(/s$/, '') : w));
  const placeOf = {};
  const wheres = new Set();
  for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) if (s.where) wheres.add(s.where);
  for (const w of wheres) {
    const ww = ' ' + nm(w).join(' ') + ' ';
    let best = null;
    tw.regions.forEach((r, ri) => r.points.forEach((p, pi) => { const pw = nm(p.name); if (pw.length && ww.includes(' ' + pw.join(' ') + ' ') && (!best || pw.length > best.n)) best = { n: pw.length, at: [ri, pi] }; }));
    if (best) placeOf[w] = best.at;
  }
  writeFileSync(new URL(`../public/data/${gameId}-regionmap.json`, import.meta.url), JSON.stringify({ source: `mesma região de ${TWIN[gameId]}: ${tw.source}`, regions: tw.regions, placeOf }));
  console.log(`[${gameId}] mapa da região (posições de ${TWIN[gameId]}): locais do onde obter no mapa: ${Object.keys(placeOf).length}/${wheres.size}`);
  process.exit(0);
}
const dir = game?.asmDecomp?.dir ? new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url) : game?.decomp ? new URL(`../data-sources/${game.decomp.repo.split('/')[1]}/${game.decomp.commit}/`, import.meta.url) : null;
const gen3File = dir && new URL('src/data/region_map/region_map_sections.json', dir);
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const gen3 = game?.generation === 3 && gen3File && existsSync(gen3File) && JSON.parse(readFileSync(gen3File, 'utf8')).map_sections.filter((m) => m.name && m.x != null);
if (!dir || !existsSync(dir) || !existsSync(acqFile) || !([1, 2, 4, 5].includes(game.generation) || gen3?.length)) { console.log(`[${gameId}] sem coordenadas de mapa da região no decomp`); process.exit(0); }
const read = (p) => readFileSync(new URL(p, dir), 'utf8');
// "NEW BARK<BSP>TOWN@" → "New Bark Town"; "MT.MOON@" → "Mt. Moon"
const title = (s) => s.replace(/<BSP>|¯/g, ' ').replace(/@$/, '').replace(/#MON|<PKMN>/g, 'POKéMON').replace(/#/g, 'POKé').toLowerCase().replace(/(^|[\s.])([a-zé])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bMt\.(?=\S)/, 'Mt. ').trim();

/** Pontos de uma lista de entradas "macro x, y, Nome" com a tabela de nomes. */
export function parsePoints(src, re, names) {
  const pts = [];
  for (const m of src.matchAll(re)) {
    const name = names[m[3]];
    if (!name || pts.some((p) => p.name === name)) continue;
    pts.push({ name, x: Number(m[1]), y: Number(m[2]) });
  }
  return pts;
}

// Gen 4: cada mapa (cabeçalho) tem a sua seção do mapa da região (acq.progress.maps[].landmark = MAPSEC / LocationNames) —
// inclusive cavernas e interiores. Posição da seção = centro das células da MATRIZ DO MUNDO (map matrix 0) em que mapas
// dela aparecem: o pokeplatinum diz que as posições do mapa da cidade saem dessa matriz (town_map/fly_locations.c).
//   Platinum: res/field/matrices/map_matrix_000.json (headers = nomes MAP_HEADER_*)
//   Diamond/Pearl: files/fielddata/mapmatrix/map_matrix/narc_0000.bin (parseMatrix; nº do cabeçalho → MAP_* do maps.h)
//   HeartGold/SoulSilver: sem matriz em texto — mesma região do Crystal: posições do mapa do Crystal (landmarks) pelo nome
//     da seção
// Black 2/White 2 (pokebw2): res/field/matrices/overworld.json traz a grade de ZONAS do mundo (zones[y][x]); cada zona
// tem o seu lugar do mapa (acq.progress.maps[].landmark = PLACE_*). Posição do lugar = centro das células das zonas dele;
// lugares fora da grade (cavernas, prédios) herdam a posição da zona de onde sai o warp de entrada
// (res/field/events/<zona>.json → warps[].zone).
if (game.generation === 5) {
  const { readdirSync } = await import('node:fs');
  const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
  const maps = acq.progress?.maps ?? {};
  const placeName = (lm) => title(String(lm).replace(/^PLACE_/, '').replace(/_/g, ' ')).replace(/\bPokemon\b/g, 'Pokémon').replace(/\bPwt\b/, 'PWT');
  const skip = (lm) => !lm || /^PLACE_(NONE|NOTHING|MYSTERY)/.test(lm);
  const grid = JSON.parse(read('res/field/matrices/overworld.json')).zones;
  const cells = new Map();
  grid.forEach((row, y) => row.forEach((z, x) => { const lm = maps[z]?.landmark; if (z && !skip(lm)) (cells.get(lm) ?? cells.set(lm, []).get(lm)).push([x + 0.5, y + 0.5]); }));
  const pos = new Map(cells);
  const evDir = new URL('res/field/events/', dir);
  const warpsOf = new Map();
  for (const z of Object.keys(maps)) {
    const f = new URL(`${z.replace(/^ZONE_/, '').toLowerCase()}.json`, evDir);
    if (existsSync(f)) warpsOf.set(z, (JSON.parse(readFileSync(f, 'utf8')).warps ?? []).map((w) => w.zone).filter(Boolean));
  }
  for (let pass = 0; pass < 6; pass++) for (const [z, dests] of warpsOf) {
    const from = pos.get(maps[z]?.landmark);
    if (!from) continue;
    for (const d of dests) { const lm = maps[d]?.landmark; if (!skip(lm) && !pos.has(lm)) pos.set(lm, [...from]); }
  }
  const avg = (l, k) => l.reduce((a, c) => a + c[k], 0) / l.length;
  const pts = [...pos].map(([lm, cs]) => ({ name: placeName(lm), x: avg(cs, 0), y: avg(cs, 1) }));
  const regions5 = [{ name: 'Unova', w: grid[0].length, h: grid.length, points: pts }];
  const secOfLabel = new Map();
  for (const m of Object.values(maps)) if (!skip(m.landmark) && !secOfLabel.has(m.label)) secOfLabel.set(m.label, placeName(m.landmark));
  const placeOf = {};
  const wheres = new Set();
  for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) if (s.where) wheres.add(s.where);
  for (const w of wheres) {
    const sec = secOfLabel.get(w);
    let i = sec ? pts.findIndex((p) => p.name === sec) : -1;
    // nome que não é rótulo de zona ("Route 2 Hidden Grotto", da PokéAPI): o lugar com o maior prefixo do nome
    if (i < 0) { const ws = w.split(' '); for (let n = ws.length - 1; n >= 1 && i < 0; n--) i = pts.findIndex((p) => p.name === ws.slice(0, n).join(' ')); }
    if (i >= 0) placeOf[w] = [0, i];
  }
  writeFileSync(new URL(`../public/data/${gameId}-regionmap.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo} (grade de zonas do mundo + lugar de cada zona)`, regions: regions5, placeOf }));
  console.log(`[${gameId}] mapa da região: Unova ${pts.length} lugares; locais do onde obter no mapa: ${Object.keys(placeOf).length}/${wheres.size}`);
  process.exit(0);
}

if (game.generation === 4) {
  const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
  const maps = acq.progress?.maps ?? {};
  const secName = (lm) => (/^LocationNames_Text_/.test(lm) ? lm.replace(/^LocationNames_Text_/, '').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/(\d)([A-Z])/g, '$1 $2') : title(lm.replace(/^MAPSEC_/, '').replace(/_/g, ' '))).replace(/\bMt\b\.?/, 'Mt.').replace(/\bPokemon\b/g, 'Pokémon');
  const skip = (lm) => !lm || /MYSTERY_ZONE|MysteryZone|NOTHING|Nothing$/.test(lm);
  let regions4;
  if (game.asmDecomp.steps === 'hgss') {
    const cr = JSON.parse(readFileSync(new URL('../public/data/crystal-regionmap.json', import.meta.url), 'utf8'));
    regions4 = cr.regions.map((r) => ({ ...r, points: r.points.map((p) => ({ ...p })) }));
  } else {
    let grid;
    if (game.asmDecomp.steps === 'dp') {
      const { parseMatrix, loadHeaders } = await import('./lib/gen4-dp-field.mjs');
      const idByN = new Map(loadHeaders(dir).map((h) => [h.n, h.id]));
      grid = parseMatrix(readFileSync(new URL('files/fielddata/mapmatrix/map_matrix/narc_0000.bin', dir))).grid.map((row) => row.map((n) => idByN.get(n)));
    } else grid = JSON.parse(read('res/field/matrices/map_matrix_000.json')).headers;
    const cells = new Map();
    const inWorld = new Set();
    grid.forEach((row, y) => row.forEach((id, x) => { const lm = maps[id]?.landmark; if (skip(lm)) return; inWorld.add(id); (cells.get(lm) ?? cells.set(lm, []).get(lm)).push([x, y]); }));
    // seções fora da matriz do mundo (Mt. Coronet, lagos, Great Marsh, cavernas): posição da ENTRADA — warp de um mapa do
    // mundo (x, z em tiles; ÷ 32 = célula da matriz); de dentro para dentro, herda a posição de quem leva até ela
    const warpsOf = new Map(); // cabeçalho → [{ x, z, dest }]
    if (game.asmDecomp.steps === 'dp') {
      const { loadHeaders, loadDpField } = await import('./lib/gen4-dp-field.mjs');
      const F = loadDpField(dir), hs = loadHeaders(dir), idByN = new Map(hs.map((h) => [h.n, h.id]));
      for (const h of hs) { const ev = F.events(h); if (ev) warpsOf.set(h.id, ev.warps.map((w) => ({ x: w.x, z: w.z, dest: idByN.get(w.dest) }))); }
    } else {
      const evFile = {};
      for (const m of read('include/data/map_headers.h').matchAll(/\[(MAP_HEADER_\w+)\] = \{([\s\S]*?)\n    \}/g)) evFile[m[1]] = m[2].match(/\.eventsArchiveID = (\w+)/)?.[1];
      for (const [h, f] of Object.entries(evFile)) {
        const u = new URL(`res/field/events/${f}.json`, dir);
        if (f && existsSync(u)) warpsOf.set(h, (JSON.parse(readFileSync(u, 'utf8')).warp_events ?? []).map((w) => ({ x: w.x, z: w.z, dest: w.dest_header_id })));
      }
    }
    const pos = new Map([...cells].map(([lm, cs]) => [lm, cs.map(([x, y]) => [x + 0.5, y + 0.5])]));
    for (const id of inWorld) for (const w of warpsOf.get(id) ?? []) {
      const ds = maps[w.dest]?.landmark;
      if (skip(ds) || cells.has(ds)) continue;
      (pos.get(ds) ?? pos.set(ds, []).get(ds)).push([w.x / 32, w.z / 32]);
    }
    for (let pass = 0; pass < 6; pass++) for (const [id, ws] of warpsOf) {
      const from = pos.get(maps[id]?.landmark);
      if (!from) continue;
      for (const w of ws) { const ds = maps[w.dest]?.landmark; if (!skip(ds) && !pos.has(ds)) pos.set(ds, [...from]); }
    }
    const avg = (l, k) => l.reduce((a, c) => a + c[k], 0) / l.length;
    const pts = [...pos].map(([lm, cs]) => ({ name: secName(lm), x: avg(cs, 0), y: avg(cs, 1) }));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1;
    regions4 = [{ name: 'Sinnoh', w: Math.max(...xs) - x0 + 1, h: Math.max(...ys) - y0 + 1, points: pts.map((p) => ({ ...p, x: p.x - x0, y: p.y - y0 })) }];
  }
  // lugar do "onde obter" → seção do mapa (pelo rótulo do mapa) → ponto com o mesmo nome
  const norm4 = (s) => words(s).map((w) => (w === 'mount' ? 'mt' : w.length > 4 ? w.replace(/s$/, '') : w)).join(' ');
  const secOfLabel = new Map();
  for (const m of Object.values(maps)) if (!skip(m.landmark) && !secOfLabel.has(m.label)) secOfLabel.set(m.label, secName(m.landmark));
  const placeOf = {};
  const wheres = new Set();
  for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) if (s.where) wheres.add(s.where);
  for (const w of wheres) {
    const sec = secOfLabel.get(w) ?? secOfLabel.get(w.replace(/\s*\(.*?\)\s*/g, ' ').trim());
    if (!sec) continue;
    regions4.forEach((r, ri) => r.points.forEach((p, pi) => { if (!placeOf[w] && norm4(p.name) === norm4(sec)) placeOf[w] = [ri, pi]; }));
  }
  writeFileSync(new URL(`../public/data/${gameId}-regionmap.json`, import.meta.url), JSON.stringify({
    source: game.asmDecomp.steps === 'hgss' ? 'pret/pokecrystal (mesma região: posições do mapa do Crystal) + seções do pokeheartgold' : `${game.asmDecomp.repo} (matriz do mundo + seção de cada mapa)`, regions: regions4, placeOf,
  }));
  console.log(`[${gameId}] mapa da região: ${regions4.map((r) => `${r.name} ${r.points.length} lugares`).join(', ')}; locais do onde obter no mapa: ${Object.keys(placeOf).length}/${wheres.size}`);
  process.exit(0);
}

let regions;
if (game.generation === 3) {
  // centro do retângulo de cada área (as rotas longas ocupam vários quadros); (0, 0) = sem posição no mapa (cavernas do
  // FRLG). FRLG: Kanto até antes da One Island; as Ilhas Sevii (a partir de MAPSEC_ONE_ISLAND) têm grade própria.
  const all3 = JSON.parse(readFileSync(gen3File, 'utf8')).map_sections;
  const sevii = all3.findIndex((m) => m.id === 'MAPSEC_ONE_ISLAND');
  const groups = gameId === 'firered-leafgreen' ? [['Kanto', (i) => i < sevii], ['Ilhas Sevii', (i) => i >= sevii]] : [['Hoenn', () => true]];
  regions = groups.map(([name, inRegion]) => {
    const secs = all3.map((m, i) => ({ ...m, i })).filter((m) => m.name && m.x != null && (m.x || m.y) && inRegion(m.i));
    const pts = secs.filter((m, k) => secs.findIndex((x) => x.name === m.name) === k).map((m) => ({ name: title(m.name), id: m.id, x: m.x + (m.width ?? 1) / 2, y: m.y + (m.height ?? 1) / 2, w: m.width ?? 1, h: m.height ?? 1 }));
    return { name, w: Math.max(...secs.map((m) => m.x + (m.width ?? 1))), h: Math.max(...secs.map((m) => m.y + (m.height ?? 1))), points: pts };
  });
  // seções sem posição (cavernas e florestas do FRLG em (0, 0)): posição da ENTRADA — o mapa do decomp
  // (data/maps/*/map.json) com warp para um mapa da seção, cuja seção já tem ponto; de dentro para dentro, herda
  const mapsDir = new URL(`../data-sources/${game.decomp.repo.split('/')[1]}-scripts/data/maps/`, import.meta.url);
  if (existsSync(mapsDir)) {
    const { readdirSync } = await import('node:fs');
    const maps = readdirSync(mapsDir).map((d) => { try { return JSON.parse(readFileSync(new URL(`${d}/map.json`, mapsDir), 'utf8')); } catch { return null; } }).filter(Boolean);
    const secOfMap = new Map(maps.map((m) => [m.id, m.region_map_section]));
    // seções de mesmo nome são um ponto só ("ROUTE 4" = a rota e o Pokémon Center dela): todas as ids apontam para ele
    const pointOf = new Map();
    regions.forEach((r, ri) => r.points.forEach((p) => { for (const m of all3) if (m.name && title(m.name) === p.name && (m.x || m.y)) pointOf.set(m.id, { ri, p }); pointOf.set(p.id, { ri, p }); }));
    const named = new Map(all3.filter((m) => m.name).map((m) => [m.id, m]));
    for (let pass = 0; pass < 6; pass++) {
      const found = new Map(); // seção sem ponto → [{ ri, x, y }]
      for (const m of maps) {
        const from = pointOf.get(m.region_map_section);
        if (!from) continue;
        for (const w of m.warp_events ?? []) {
          const ds = secOfMap.get(w.dest_map);
          if (!ds || pointOf.has(ds) || !named.has(ds)) continue;
          (found.get(ds) ?? found.set(ds, []).get(ds)).push({ ri: from.ri, x: from.p.x, y: from.p.y });
        }
      }
      if (!found.size) break;
      for (const [ds, list] of found) {
        const ri = list[0].ri, same = list.filter((l) => l.ri === ri);
        const p = { name: title(named.get(ds).name), id: ds, x: same.reduce((a, l) => a + l.x, 0) / same.length, y: same.reduce((a, l) => a + l.y, 0) / same.length, w: 1, h: 1, byEntrance: true };
        if (regions[ri].points.some((q) => q.name === p.name)) { pointOf.set(ds, { ri, p: regions[ri].points.find((q) => q.name === p.name) }); continue; }
        regions[ri].points.push(p);
        pointOf.set(ds, { ri, p });
      }
    }
  }
} else if (game.generation === 1) {
  const names = Object.fromEntries([...read('data/maps/names.asm').matchAll(/^(\w+):\s*db\s+"([^"]+)"/gm)].map((m) => [m[1], title(m[2])]));
  const tm = read('data/maps/town_map_entries.asm');
  const ext = parsePoints(tm.split('InternalMapEntries')[0].replace(/;\s*unused.*$/gm, ''), /outdoor_map\s+(\d+),\s*(\d+),\s*(\w+)(?![^\n]*unused)/g, names);
  const int = parsePoints(tm.split('InternalMapEntries')[1] ?? '', /indoor_map\s+\w+,\s*(\d+),\s*(\d+),\s*(\w+)/g, names).filter((p) => !ext.some((e) => e.name === p.name));
  regions = [{ name: 'Kanto', w: 20, h: 18, points: [...ext, ...int] }];
} else {
  const lm = read('data/maps/landmarks.asm');
  const names = Object.fromEntries([...lm.matchAll(/^(\w+):\s*db\s+"([^"]+)"/gm)].map((m) => [m[1], title(m[2])]));
  // índice do 1º landmark de Kanto = quantos "const" vêm antes de "DEF KANTO_LANDMARK EQU const_value" (LANDMARK_SPECIAL = 0)
  const lc = read('constants/landmark_constants.asm');
  const split = (lc.slice(0, lc.indexOf('KANTO_LANDMARK EQU')).match(/^\s*const\s+\w+/gm) ?? []).length;
  const all = [...lm.matchAll(/^\s*landmark\s+(-?\d+),\s*(-?\d+),\s*(\w+)/gm)].map((m, i) => ({ i, name: names[m[3]], x: Number(m[1]) + 8, y: Number(m[2]) + 16 })).filter((p) => p.name && p.x > 0);
  const uniq = (l) => l.filter((p, k) => l.findIndex((q) => q.name === p.name) === k).map(({ name, x, y }) => ({ name, x, y }));
  regions = [{ name: 'Johto', w: 168, h: 160, points: uniq(all.filter((p) => p.i < split)) }, { name: 'Kanto', w: 168, h: 160, points: uniq(all.filter((p) => p.i >= split)) }];
}

// nomes do mapa da região × nomes dos mapas do decomp: "Mt. Mortar" = "Mount Mortar", "Whirl Islands" = "Whirl Island"
// "S.S. Anne" (mapa da região) = "Ssanne Exterior" (nome do mapa no decomp, sem os pontos) — P2, 0.42.0
const norm = (s) => words(String(s).replace(/\bS\.\s?S\.\s?Anne\b/gi, 'Ssanne')).map((w) => (w === 'mount' ? 'mt' : w.length > 4 ? w.replace(/s$/, '') : w));
// lugar do "onde obter" → ponto: o ponto cujas palavras estão todas no nome do lugar (o mais específico)
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
const placeOf = {};
const wheres = new Set();
for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) if (s.where) wheres.add(s.where);
let matched = 0;
for (const w of wheres) {
  const ww = ' ' + norm(w).join(' ') + ' ';
  let best = null;
  regions.forEach((r, ri) => r.points.forEach((p, pi) => {
    const pw = norm(p.name);
    if (pw.length && ww.includes(' ' + pw.join(' ') + ' ') && (!best || pw.length > best.n)) best = { n: pw.length, at: [ri, pi] };
  }));
  // prédio dentro da cidade ("Violet Kyles House", "Goldenrod Dept Store 5F") → a cidade com a mesma 1ª palavra
  if (!best) {
    const first = norm(w)[0];
    regions.forEach((r, ri) => r.points.forEach((p, pi) => { if (!best && first?.length >= 5 && norm(p.name)[0] === first && /city|town|island|plateau/i.test(p.name)) best = { n: 1, at: [ri, pi] }; }));
  }
  if (best) { placeOf[w] = best.at; matched++; }
}
writeFileSync(new URL(`../public/data/${gameId}-regionmap.json`, import.meta.url), JSON.stringify({
  source: `${(game.asmDecomp ?? game.decomp).repo} (posições do mapa da região)`, regions, placeOf,
}));
console.log(`[${gameId}] mapa da região: ${regions.map((r) => `${r.name} ${r.points.length} lugares`).join(', ')}; locais do onde obter no mapa: ${matched}/${wheres.size}`);
