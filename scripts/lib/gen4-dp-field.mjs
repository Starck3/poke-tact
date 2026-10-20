// Dados de campo do Diamond/Pearl (pret/pokediamond) — mapas, eventos, encontros e trocas. Os arquivos de dados estão em
// BINÁRIO no decomp (um .bin por entrada de cada NARC); o que é texto é o código que diz como lê-los. Sem rede.
//   arm9/src/map_header.c          sMapHeaders[]: uma linha por mapa (comentário // MAP_X), na ordem do número do mapa:
//                                  área, modelos, matriz, scripts, level scripts, textos, músicas, ENCONTROS (ENCDATA(diamond,
//                                  pearl) ou 0xFFFF), eventos, MAPSEC, clima, câmera, tipo de mapa…
//   include/constants/maps.h       #define MAP_X n
//   files/fielddata/eventdata/zone_event_release/narc_NNNN.bin  eventos (formato abaixo)
//   files/fielddata/encountdata/{d,p}_enc_data/narc_NNNN.bin   encontros de 424 bytes (formato em parseEncounters)
//   files/fielddata/mapmatrix/map_matrix/narc_NNNN.bin         matriz do mundo (formato em parseMatrix)
//   files/fielddata/pokemon_trade/fld_trade/narc_NNNN.bin      trocas com NPC (formato em parseTrade)
import { readFileSync, existsSync } from 'node:fs';
import { loadCommandSizes, parseScriptFile } from './gen4-dp-script.mjs';

const num = (s) => Number(s.match(/narc_(\d+)_bin/)?.[1] ?? NaN);
const title = (s) => s.toLowerCase().replace(/(^|[\s.&-])([a-zé])/g, (m, a, b) => a + b.toUpperCase());

/** Rótulo do mapa para o usuário e para casar com o detonado: MAPSEC_JUBILIFE_CITY → "Jubilife City". O mapa principal da
 *  cidade (MAP_JUBLIFE — grafia do decomp) leva o nome do MAPSEC; os internos, o próprio nome (MAP_OREBURGH_GYM → "Oreburgh Gym"). */
export const sectionName = (mapsec) => title(mapsec.replace(/^MAPSEC_/, '').replace(/_/g, ' ')).replace(/\bMt\b/, 'Mt.').replace(/\bPokemon\b/g, 'Pokémon');
export function dpLabel(h) {
  const own = title(h.id.replace(/^MAP_/, '').replace(/_/g, ' ')).replace(/\bJublife\b/g, 'Jubilife').replace(/^Mount\b/, 'Mt.')
    .replace(/\b(\d+)f\b/gi, '$1F').replace(/\bB(\d+)f\b/gi, 'B$1F').replace(/\bPokecenter\b/, 'Pokémon Center').replace(/\bPokemart\b/, 'Poké Mart').replace(/\bPokemon\b/g, 'Pokémon');
  const sec = h.mapsec ? sectionName(h.mapsec) : null;
  return sec && / (City|Town)$/.test(sec) && sec.replace(/ (City|Town)$/, '') === own ? sec : own;
}

/** Cabeçalhos dos mapas: [{ id: 'MAP_X' (nome de maps.h pelo número; o comentário do map_header.c é só apelido), n, scripts,
 *  level, events, enc: { diamond, pearl }, mapsec, type }] */
export function loadHeaders(rootUrl) {
  const src = readFileSync(new URL('arm9/src/map_header.c', rootUrl), 'utf8').split('sMapHeaders[]')[1];
  const rows = [...src.matchAll(/^\s*\{ (NARC_area[^\n]*?)\}, \/\/ (MAP_\w+)/gm)];
  const mapByNum = Object.fromEntries([...readFileSync(new URL('include/constants/maps.h', rootUrl), 'utf8').matchAll(/#define (MAP_\w+)\s+(\d+)/g)].map((m) => [Number(m[2]), m[1]]));
  if (Object.keys(mapByNum).length !== rows.length) throw new Error(`maps.h tem ${Object.keys(mapByNum).length} mapas e map_header.c ${rows.length}`);
  return rows.map((m, n) => {
    const f = m[1].split(/,(?![^(]*\))/).map((x) => x.trim());
    const enc = f[8].match(/ENCDATA\((\w+), (\w+)\)/);
    return { id: mapByNum[n], n, scripts: num(f[3]), level: num(f[4]), events: num(f[9]), enc: enc ? { diamond: num(enc[1]), pearl: num(enc[2]) } : null, mapsec: f[10], type: Number(f[13]) };
  });
}

/** Eventos de um mapa: bg events (20 bytes), objetos (32), warps (12), gatilhos de coordenada (16) — cada lista com u32 de contagem. */
export function parseEvents(b) {
  let p = 0;
  const list = (size, read) => { const n = b.readUInt32LE(p); p += 4; const out = []; for (let i = 0; i < n; i++, p += size) out.push(read(p)); return out; };
  const bg = list(20, (o) => ({ script: b.readUInt16LE(o), type: b.readUInt16LE(o + 2), x: b.readInt32LE(o + 4), z: b.readInt32LE(o + 8), y: b.readInt32LE(o + 12) }));
  const objects = list(32, (o) => ({ id: b.readUInt16LE(o), gfx: b.readUInt16LE(o + 2), movement: b.readUInt16LE(o + 4), trainerType: b.readUInt16LE(o + 6), flag: b.readUInt16LE(o + 8), script: b.readUInt16LE(o + 10), dir: b.readUInt16LE(o + 12), x: b.readUInt16LE(o + 24), z: b.readUInt16LE(o + 26) }));
  const warps = list(12, (o) => ({ x: b.readUInt16LE(o), z: b.readUInt16LE(o + 2), dest: b.readUInt16LE(o + 4), destWarp: b.readUInt16LE(o + 6) }));
  const coords = list(16, (o) => ({ script: b.readUInt16LE(o), x: b.readUInt16LE(o + 2), z: b.readUInt16LE(o + 4) }));
  if (p !== b.length) throw new Error(`eventos: ${b.length - p} bytes sobrando`);
  return { bg, objects, warps, coords };
}

/** Encontros (424 bytes): taxa de terra u32 + 12 × (nível u32, espécie u32); enxame 2 × u32; dia 2; noite 2; Poké Radar 4;
 *  6 × u32 (formas); dual-slot Ruby/Sapphire/Emerald/FireRed/LeafGreen 2 × u32 cada; depois 5 grupos de água — Surf,
 *  (sem uso), Old/Good/Super Rod — cada um com taxa u32 + 5 × (nível máx u8, nível mín u8, 2 bytes, espécie u32). */
export function parseEncounters(b) {
  if (b.length !== 424) throw new Error(`encontro com ${b.length} bytes (esperado 424)`);
  const u = (o) => b.readUInt32LE(o);
  const list = (o, n) => Array.from({ length: n }, (_, i) => u(o + 4 * i));
  const water = (o) => ({ rate: u(o), slots: Array.from({ length: 5 }, (_, i) => ({ max: b[o + 4 + 8 * i], min: b[o + 5 + 8 * i], species: u(o + 8 + 8 * i) })) });
  return {
    landRate: u(0), land: Array.from({ length: 12 }, (_, i) => ({ level: u(4 + 8 * i), species: u(8 + 8 * i) })),
    swarm: list(100, 2), day: list(108, 2), night: list(116, 2), radar: list(124, 4),
    dual: { ruby: list(164, 2), sapphire: list(172, 2), emerald: list(180, 2), firered: list(188, 2), leafgreen: list(196, 2) },
    surf: water(204), unused: water(248), oldRod: water(292), goodRod: water(336), superRod: water(380),
  };
}

/** Matriz do mundo: largura u8, altura u8, tem cabeçalhos u8, tem altitudes u8, tamanho do nome u8 + nome; depois
 *  u16 número do mapa por célula (se tem cabeçalhos), u8 altitude por célula (se tem), u16 bloco de terreno por célula. */
export function parseMatrix(b) {
  const w = b[0], h = b[1], hasHeaders = b[2], hasAlt = b[3];
  let p = 5 + b[4];
  const grid = [];
  if (hasHeaders) { for (let y = 0; y < h; y++) { grid.push([]); for (let x = 0; x < w; x++, p += 2) grid[y].push(b.readUInt16LE(p)); } }
  p += hasAlt ? w * h : 0;
  if (p + 2 * w * h !== b.length) throw new Error(`matriz: tamanho ${b.length} não bate com ${w}×${h}`);
  return { w, h, grid: hasHeaders ? grid : null };
}

/** Troca com NPC (fld_trade, 80 bytes): espécie oferecida u32 no início, espécie pedida u32 no fim (offset 76). */
export const parseTrade = (b) => ({ species: b.readUInt32LE(0), requested: b.readUInt32LE(76) });

/** Itens escondidos: arm9/asm/unk_02038C78.s UNK_020F2DB4, entradas de 8 bytes { item u16, qtd u8, alcance u8, —, índice u16 }
 *  (o mesmo formato do gHiddenItems do Platinum). bg event com script 8000 + índice → este item. */
export function loadHiddenItems(rootUrl) {
  const src = readFileSync(new URL('arm9/asm/unk_02038C78.s', rootUrl), 'utf8').split(/^UNK_020F2DB4:.*$/m)[1].split(/^\s*\.global/m)[0];
  const bytes = [...src.matchAll(/^[ \t]*\.byte[ \t]+([^;\r\n]+)/gm)].flatMap((m) => m[1].split(',').map((x) => Number(x.trim())));
  const out = {};
  for (let i = 0; i + 8 <= bytes.length; i += 8) out[bytes[i + 6] | (bytes[i + 7] << 8)] = { item: bytes[i] | (bytes[i + 1] << 8), qty: bytes[i + 2], range: bytes[i + 3] };
  return out;
}

/** Iniciais: o overlay 64 (escolha na maleta) devolve a espécie pela posição (switch 0/1/2) a partir de 3 constantes seguidas
 *  no literal pool ("_X: .word 0x00000183"…) — a 1ª trinca de espécies válidas (≤ 493). */
export function loadStarters(rootUrl) {
  const lines = readFileSync(new URL('arm9/overlays/64/asm/overlay_64.s', rootUrl), 'utf8').split(/\r?\n/);
  for (let i = 0; i + 2 < lines.length; i++) {
    const v = [0, 1, 2].map((k) => lines[i + k].match(/^_\w+: \.word 0x([0-9A-F]+)$/)?.[1]).map((x) => (x ? parseInt(x, 16) : NaN));
    if (v.every((n) => n > 0 && n <= 493)) return v;
  }
  throw new Error('iniciais não encontrados no overlay 64');
}

/** Tudo o que os construtores precisam, por mapa. */
export function loadDpField(rootUrl) {
  const headers = loadHeaders(rootUrl);
  const bin = (dir, n) => { const u = new URL(`files/fielddata/${dir}/narc_${String(n).padStart(4, '0')}.bin`, rootUrl); return existsSync(u) ? readFileSync(u) : null; };
  const cmds = loadCommandSizes(rootUrl);
  const scriptCache = new Map();
  return {
    headers, cmds,
    events: (h) => { const b = bin('eventdata/zone_event_release', h.events); return b ? parseEvents(b) : null; },
    script: (h) => { if (!scriptCache.has(h.scripts)) { const b = bin('script/scr_seq_release', h.scripts); scriptCache.set(h.scripts, b ? parseScriptFile(b, cmds) : null); } return scriptCache.get(h.scripts); },
    scriptFile: (n) => { const b = bin('script/scr_seq_release', n); return b ? parseScriptFile(b, cmds) : null; },
    raw: bin,
  };
}
