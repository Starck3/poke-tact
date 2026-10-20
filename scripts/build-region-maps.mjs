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
const dir = game?.asmDecomp?.dir ? new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url) : game?.decomp ? new URL(`../data-sources/${game.decomp.repo.split('/')[1]}/${game.decomp.commit}/`, import.meta.url) : null;
const gen3File = dir && new URL('src/data/region_map/region_map_sections.json', dir);
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const gen3 = game?.generation === 3 && gen3File && existsSync(gen3File) && JSON.parse(readFileSync(gen3File, 'utf8')).map_sections.filter((m) => m.name && m.x != null);
if (!dir || !existsSync(dir) || !existsSync(acqFile) || !([1, 2].includes(game.generation) || gen3?.length)) { console.log(`[${gameId}] sem coordenadas de mapa da região no decomp`); process.exit(0); }
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

let regions;
if (game.generation === 3) {
  // centro do retângulo de cada área (as rotas longas ocupam vários quadros); (0, 0) = sem posição no mapa (cavernas do
  // FRLG). FRLG: Kanto até antes da One Island; as Ilhas Sevii (a partir de MAPSEC_ONE_ISLAND) têm grade própria.
  const all3 = JSON.parse(readFileSync(gen3File, 'utf8')).map_sections;
  const sevii = all3.findIndex((m) => m.id === 'MAPSEC_ONE_ISLAND');
  const groups = gameId === 'firered-leafgreen' ? [['Kanto', (i) => i < sevii], ['Ilhas Sevii', (i) => i >= sevii]] : [['Hoenn', () => true]];
  regions = groups.map(([name, inRegion]) => {
    const secs = all3.map((m, i) => ({ ...m, i })).filter((m) => m.name && m.x != null && (m.x || m.y) && inRegion(m.i));
    const pts = secs.filter((m, k) => secs.findIndex((x) => x.name === m.name) === k).map((m) => ({ name: title(m.name), x: m.x + (m.width ?? 1) / 2, y: m.y + (m.height ?? 1) / 2, w: m.width ?? 1, h: m.height ?? 1 }));
    return { name, w: Math.max(...secs.map((m) => m.x + (m.width ?? 1))), h: Math.max(...secs.map((m) => m.y + (m.height ?? 1))), points: pts };
  });
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
const norm = (s) => words(s).map((w) => (w === 'mount' ? 'mt' : w.length > 4 ? w.replace(/s$/, '') : w));
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
