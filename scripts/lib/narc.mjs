// Leitor de NARC (contêiner de arquivos do Nintendo DS). Sem rede.
//   cabeçalho "NARC" (16 bytes) → BTAF: nº de arquivos (u16) e [início, fim] (u32 cada) de cada um
//   → BTNF (nomes, não usados aqui) → GMIF: os dados; os offsets da BTAF contam a partir do início dos dados do GMIF.
// Devolve um Buffer por arquivo, na ordem do contêiner (o índice é o que o jogo usa: espécie, golpe, zona…).
import { readFileSync } from 'node:fs';

export function readNarc(fileUrl) {
  const b = readFileSync(fileUrl);
  if (b.toString('latin1', 0, 4) !== 'NARC') throw new Error(`não é NARC: ${fileUrl}`);
  let p = b.readUInt16LE(12); // tamanho do cabeçalho
  const chunk = (tag) => {
    if (b.toString('latin1', p, p + 4) !== tag) throw new Error(`NARC: esperava ${tag} em ${p} (${fileUrl})`);
    const at = p, size = b.readUInt32LE(p + 4);
    p += size;
    return at;
  };
  const btaf = chunk('BTAF');
  chunk('BTNF');
  const gmif = chunk('GMIF') + 8;
  const n = b.readUInt16LE(btaf + 8);
  return Array.from({ length: n }, (_, i) => {
    const start = b.readUInt32LE(btaf + 12 + i * 8), end = b.readUInt32LE(btaf + 16 + i * 8);
    return b.subarray(gmif + start, gmif + end);
  });
}

// Tipos da Gen 4 na ordem do jogo (TYPE_NORMAL = 0 … TYPE_DARK = 17; 9 = ??? / mystery)
export const GEN4_TYPES = ['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'unknown', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark'];

/** wotbl.narc: um arquivo por espécie; u16 por golpe = golpe (9 bits baixos) + nível (7 bits altos); 0xFFFF encerra. */
export function parseLevelUp(buf) {
  const out = [];
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const v = buf.readUInt16LE(i);
    if (v === 0xffff) break;
    out.push([v >> 9, v & 0x1ff]); // [nível, golpe] — mesma forma do levelOrdered do Platinum
  }
  return out;
}

/** waza_tbl.narc: um arquivo por golpe (16 bytes): efeito u16, classe u8, poder u8, tipo u8, precisão u8, PP u8,
 *  chance u8, alvo u16, prioridade s8, flags u8, concurso u8×2. */
export function parseMove(buf) {
  return {
    effect: buf.readUInt16LE(0),
    category: ['physical', 'special', 'status'][buf[2]],
    power: buf[3], type: GEN4_TYPES[buf[4]], accuracy: buf[5], pp: buf[6],
    priority: buf.readInt8(10),
  };
}
