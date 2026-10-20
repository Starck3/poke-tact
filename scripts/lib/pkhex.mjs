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
  // forms: FormStatsIndex u16 @0x1E / FormCount @0x20 (PersonalInfo8LA.cs) — espécies só de Hisui; loja de golpes @0xA8
  'legends-arceus': { personal: 'la', size: 0xb0, abil: [0x18, 0x1a, 0x1c], wide: true, lvl: 'lvlmove_la.pkl', present: (d) => ((d[0x21] >> 6) & 1) === 1, maxSpecies: 905, forms: { index: 0x1e, count: 0x20 }, moveShop: { offset: 0xa8, cs: 'PersonalInfo8LA.cs' } },
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
  // loja de golpes (Legends: Arceus): bits u64 em cfg.moveShop.offset na ordem de MoveShopMoves do PersonalInfo8LA.cs
  // (nomes do enum Move → id pelo text_Moves_en sem espaços/pontuação)
  let shopMoves = null;
  if (cfg.moveShop) {
    const cs = readFileSync(new URL(`PKHeX.Core/PersonalInfo/Info/${cfg.moveShop.cs}`, rootUrl), 'utf8');
    const byKey = new Map(moveNames.map((n, i) => [n.replace(/[^A-Za-z0-9]/g, '').toLowerCase(), i]));
    shopMoves = [...cs.match(/MoveShopMoves\s*=>\s*\[([\s\S]*?)\];/)[1].matchAll(/Move\.(\w+)/g)].map((m) => byKey.get(m[1].toLowerCase()));
    if (shopMoves.some((x) => x == null)) throw new Error('MoveShopMoves: golpe sem id');
  }
  const entryAt = (index) => {
    const d = personal.subarray(index * cfg.size, (index + 1) * cfg.size);
    const ab = cfg.abil.map((o) => (cfg.wide ? d.readUInt16LE(o) : d[o]));
    const shop = shopMoves ? d.readBigUInt64LE(cfg.moveShop.offset) : 0n;
    return {
      present: cfg.present ? cfg.present(d) : true,
      stats: { hp: d[0], attack: d[1], defense: d[2], speed: d[3], 'special-attack': d[4], 'special-defense': d[5] },
      types: [...new Set([types[d[6]], types[d[7]]])],
      abilities: [...new Set(ab.filter((a) => a > 0).map((a) => abilities[a]))],
      levelOrdered: levelup[index] ? parseLearnset(levelup[index]) : [],
      ...(shopMoves && { moveShop: shopMoves.filter((_, i) => (shop >> BigInt(i)) & 1n) }),
    };
  };
  for (let id = 1; id < count && id <= (cfg.maxSpecies ?? 1025); id++) {
    species[id] = entryAt(id);
    // espécie que só existe em forma regional no jogo (Legends: Arceus: Typhlosion, Goodra… só de Hisui): a forma 0 vem
    // zerada e "ausente"; vale a 1ª forma presente — índice = FormStatsIndex + forma − 1 (PersonalInfo.FormIndex)
    if (cfg.forms && !species[id].present) {
      const d = personal.subarray(id * cfg.size, (id + 1) * cfg.size);
      const fi = d.readUInt16LE(cfg.forms.index), fc = d[cfg.forms.count];
      for (let f = 1; fi && f < fc; f++) { const e = entryAt(fi + f - 1); if (e.present) { species[id] = { ...e, form: f }; break; } }
    }
  }
  return { cfg, species, moveNames, count };
}

/** Commit do checkout local (o .git do clone esparso). */
export function pkhexCommit(rootUrl) {
  try { return readFileSync(new URL('.git/HEAD', rootUrl), 'utf8').trim().replace(/^ref: .*/, (r) => readFileSync(new URL(`.git/${r.slice(5)}`, rootUrl), 'utf8').trim()); } catch { return null; }
}
