// Leitor dos recursos do PKHeX.Core (kwsch/PKHeX, GPL-3.0) — tabelas que o PKHeX extrai dos próprios jogos (pelo pkNX/pk3DS) e
// lê com o código abaixo; usado para conferir os jogos SEM decomp (Black/White e Gens 6–9). Sem rede.
//   Resources/byte/personal/personal_<jogo>   registros de tamanho fixo por espécie (PersonalInfo/Info/PersonalInfo*.cs):
//                                              HP/Atk/Def/Spe/SpA/SpD em 0x00–0x05, tipos em 0x06/0x07, habilidades em 0x18–0x1A
//                                              (u8 até a Gen 7) / 0x18–0x1D (u16, Gen 8) / 0x12–0x17 (u16, SV); formas no fim
//   Resources/byte/levelup/lvlmove_<jogo>.pkl BinLinkerAccessor16 ("2 letras" + u16 contagem + offsets u16); cada entrada =
//                                              golpes (u16) e depois os níveis (u8), na ORDEM do jogo (LearnsetReader.cs)
//   Resources/text/other/en/text_{Species,Moves,Types,Abilities}_en.txt  nomes por índice (linha = id)
import { readFileSync } from 'node:fs';

// jogo do poke-tact → arquivos e layout do PKHeX
export const PKHEX_GAMES = {
  'black-white': { personal: 'bw', size: 0x3c, abil: [0x18, 0x19, 0x1a], wide: false, lvl: 'lvlmove_bw.pkl' },
  'black-2-white-2': { personal: 'b2w2', size: 0x4c, abil: [0x18, 0x19, 0x1a], wide: false, lvl: 'lvlmove_b2w2.pkl' },
  'x-y': { personal: 'xy', size: 0x40, abil: [0x18, 0x19, 0x1a], wide: false, lvl: 'lvlmove_xy.pkl' },
  'omega-ruby-alpha-sapphire': { personal: 'ao', size: 0x50, abil: [0x18, 0x19, 0x1a], wide: false, lvl: 'lvlmove_ao.pkl' },
  'sun-moon': { personal: 'sm', size: 0x54, abil: [0x18, 0x19, 0x1a], wide: false, lvl: 'lvlmove_sm.pkl' },
  'ultra-sun-ultra-moon': { personal: 'uu', size: 0x54, abil: [0x18, 0x19, 0x1a], wide: false, lvl: 'lvlmove_uu.pkl' },
  'lets-go-pikachu-lets-go-eevee': { personal: 'gg', size: 0x54, abil: [0x18, 0x19, 0x1a], wide: false, lvl: 'lvlmove_gg.pkl' },
  'sword-shield': { personal: 'swsh', size: 0xb0, abil: [0x18, 0x1a, 0x1c], wide: true, lvl: 'lvlmove_swsh.pkl', present: (d) => ((d[0x21] >> 6) & 1) === 1 },
  'brilliant-diamond-shining-pearl': { personal: 'bdsp', size: 0x44, abil: [0x18, 0x1a, 0x1c], wide: true, lvl: 'lvlmove_bdsp.pkl', present: (d) => ((d[0x21] >> 6) & 1) === 1 },
  'legends-arceus': { personal: 'la', size: 0xb0, abil: [0x18, 0x1a, 0x1c], wide: true, lvl: 'lvlmove_la.pkl', present: (d) => ((d[0x21] >> 6) & 1) === 1 },
  'scarlet-violet': { personal: 'sv', size: 0x50, abil: [0x12, 0x14, 0x16], wide: true, lvl: 'lvlmove_sv.pkl', present: (d) => d[0x1c] !== 0 },
  // Legends: Z-A (PersonalInfo9ZA.cs): mesmo layout do SV; sem PokéAPI → também TMs (bits em 0x2C) e evoluções (evos_za)
  'legends-za': { personal: 'za', size: 0x50, abil: [0x12, 0x14, 0x16], wide: true, lvl: 'lvlmove_za.pkl', present: (d) => d[0x1c] !== 0, tm: { offset: 0x2c, cs: 'PersonalInfo9ZA.cs' }, evos: 'za' },
};

/** BinLinkerAccessor16: "XY" + u16 contagem + (contagem + 1) offsets u16. */
export function binLinker16(b) {
  const n = b.readUInt16LE(2);
  return Array.from({ length: n }, (_, i) => b.subarray(b.readUInt16LE(4 + 2 * i), b.readUInt16LE(6 + 2 * i)));
}

/** Entrada de learnset: [[nível, golpe]] na ordem do jogo. */
export function parseLearnset(d) {
  // divisão INTEIRA como no LearnsetReader.cs: o Z-A tem byte de preenchimento (Chikorita: 40 bytes = 13 golpes × 3 + 1)
  const n = Math.floor(d.length / 3);
  return Array.from({ length: n }, (_, i) => [d[2 * n + i], d.readUInt16LE(2 * i)]);
}

export function loadPkhex(rootUrl, gameId) {
  const cfg = PKHEX_GAMES[gameId];
  if (!cfg) throw new Error(`sem PKHeX para ${gameId}`);
  const res = new URL('PKHeX.Core/Resources/', rootUrl);
  const text = (n) => readFileSync(new URL(`text/other/en/text_${n}_en.txt`, res), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’.:]/g, '').replace(/♀/g, '-f').replace(/♂/g, '-m').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const types = text('Types').map(slug), abilities = text('Abilities').map(slug), moveNames = text('Moves');
  const personal = readFileSync(new URL(`byte/personal/personal_${cfg.personal}`, res));
  const levelup = binLinker16(readFileSync(new URL(`byte/levelup/${cfg.lvl}`, res)));
  const species = {};
  const count = personal.length / cfg.size;
  for (let id = 1; id < count && id <= 1025; id++) {
    const d = personal.subarray(id * cfg.size, (id + 1) * cfg.size);
    const ab = cfg.abil.map((o) => (cfg.wide ? d.readUInt16LE(o) : d[o]));
    species[id] = {
      present: cfg.present ? cfg.present(d) : true,
      stats: { hp: d[0], attack: d[1], defense: d[2], speed: d[3], 'special-attack': d[4], 'special-defense': d[5] },
      types: [...new Set([types[d[6]], types[d[7]]])],
      abilities: [...new Set(ab.filter((a) => a > 0).map((a) => abilities[a]))],
      levelOrdered: levelup[id] ? parseLearnset(levelup[id]) : [],
    };
  }
  return { cfg, species, moveNames, count };
}

/** Commit do checkout local (o .git do clone esparso). */
export function pkhexCommit(rootUrl) {
  try { return readFileSync(new URL('.git/HEAD', rootUrl), 'utf8').trim().replace(/^ref: .*/, (r) => readFileSync(new URL(`.git/${r.slice(5)}`, rootUrl), 'utf8').trim()); } catch { return null; }
}
