// Evoluções dos jogos SEM decomp (Black/White e Gens 6–9) pelas tabelas do PKHeX.Core (kwsch/PKHeX, GPL-3.0). Sem rede.
//   Resources/byte/evolve/evos_<id>.pkl   BinLinkerAccessor16 (EvolutionTree.cs → Get("g5"|"g6"|"uu"|"gg"|"ss"|"bs"|"la"|"sv"|"za"))
//                                         cada entrada = registros de 8 bytes (EvolutionSet.cs):
//                                         tipo u8 @0, argumento u16 @2, espécie destino u16 @4, forma destino u8 @6 (0xFF = mantém
//                                         a forma de origem — EvolutionMethod.GetDestinationForm), nível u8 @7
//   ÍNDICE da entrada (EvolutionTree.cs):
//     GetViaSpecies  (g5, g6)               índice = espécie (sem distinção de forma)
//     GetViaPersonal (uu, gg, ss, bs, la, sv, za)  índice = PersonalInfo.FormIndex: espécie para a forma 0,
//                                         FormStatsIndex + forma − 1 para as outras (PersonalInfo.cs); FormStatsIndex/FormCount em
//                                         0x1C/0x20 (PersonalInfo7*, 7GG), 0x1E/0x20 (8SWSH, 8BDSP, 8LA), 0x18/0x1A (9SV, 9ZA)
//   Sun/Moon NÃO tem arquivo próprio: o PKHeX usa evos_uu (indexado pela tabela personal_uu) para todo o contexto Gen 7;
//   aqui a presença no jogo vem de personal_sm (PersonalTable.SM: até a espécie 802, formas de personal_sm).
//   Tipos: Legality/Evolutions/Methods/EvolutionType.cs. No Legends: Arceus os códigos 48/49 (TowerOfDarkness/TowerOfWaters no
//   enum) são "usar item de dia/à noite" (Happiny + Oval Stone, Gligar + Razor Fang, Sneasel + Razor Claw); 90–92 são os
//   IDs falsos do PKHeX para Ursaluna/Wyrdeer/Overqwil.
import { readFileSync } from 'node:fs';
import { PKHEX_GAMES, binLinker16 } from './pkhex.mjs';

// jogo do poke-tact → arquivo de evoluções e esquema de índice
const EVO_GAMES = {
  'black-white': { evos: 'g5', via: 'species', maxSpecies: 649 },
  'x-y': { evos: 'g6', via: 'species', maxSpecies: 721 },
  'omega-ruby-alpha-sapphire': { evos: 'g6', via: 'species', maxSpecies: 721 },
  'sun-moon': { evos: 'uu', via: 'personal', index: 'ultra-sun-ultra-moon', forms: [0x1c, 0x20], maxIndexSpecies: 807, presence: 'gen7', maxSpecies: 802, versions: ['Sun', 'Moon'], alola: true },
  'ultra-sun-ultra-moon': { evos: 'uu', via: 'personal', forms: [0x1c, 0x20], maxSpecies: 807, presence: 'gen7', versions: ['Ultra Sun', 'Ultra Moon'], alola: true },
  'lets-go-pikachu-lets-go-eevee': { evos: 'gg', via: 'personal', forms: [0x1c, 0x20], maxSpecies: 809, presence: 'gg', versions: ["Let's Go, Pikachu!", "Let's Go, Eevee!"] },
  'sword-shield': { evos: 'ss', via: 'personal', forms: [0x1e, 0x20], maxSpecies: 898, presence: 'flag', versions: ['Sword', 'Shield'] },
  'brilliant-diamond-shining-pearl': { evos: 'bs', via: 'personal', forms: [0x1e, 0x20], maxSpecies: 493, presence: 'bdsp', versions: ['Brilliant Diamond', 'Shining Pearl'] },
  'legends-arceus': { evos: 'la', via: 'personal', forms: [0x1e, 0x20], maxSpecies: 905, presence: 'flag', la: true },
  'scarlet-violet': { evos: 'sv', via: 'personal', forms: [0x18, 0x1a], maxSpecies: 1025, presence: 'flag', versions: ['Scarlet', 'Violet'], noTowers: true },
  'legends-za': { evos: 'za', via: 'personal', forms: [0x18, 0x1a], maxSpecies: 1000, presence: 'flag' },
};

// EvolutionType.cs (valor → nome)
const TYPE_NAMES = ['None', 'LevelUpFriendship', 'LevelUpFriendshipMorning', 'LevelUpFriendshipNight', 'LevelUp', 'Trade', 'TradeHeldItem',
  'TradeShelmetKarrablast', 'UseItem', 'LevelUpATK', 'LevelUpAeqD', 'LevelUpDEF', 'LevelUpECl5', 'LevelUpECgeq5', 'LevelUpNinjask',
  'LevelUpShedinja', 'LevelUpBeauty', 'UseItemMale', 'UseItemFemale', 'LevelUpHeldItemDay', 'LevelUpHeldItemNight', 'LevelUpKnowMove',
  'LevelUpWithTeammate', 'LevelUpMale', 'LevelUpFemale', 'LevelUpElectric', 'LevelUpForest', 'LevelUpCold', 'LevelUpInverted',
  'LevelUpAffection50MoveType', 'LevelUpMoveType', 'LevelUpWeather', 'LevelUpMorning', 'LevelUpNight', 'LevelUpFormFemale1', 'UNUSED',
  'LevelUpVersion', 'LevelUpVersionDay', 'LevelUpVersionNight', 'LevelUpSummit', 'LevelUpDusk', 'LevelUpWormhole', 'UseItemWormhole',
  'CriticalHitsInBattle', 'HitPointsLostInBattle', 'Spin', 'LevelUpNatureAmped', 'LevelUpNatureLowKey', 'TowerOfDarkness', 'TowerOfWaters',
  'LevelUpWalkStepsWith', 'LevelUpUnionCircle', 'LevelUpInBattleEC100', 'LevelUpInBattleECElse', 'LevelUpCollect999', 'LevelUpDefeatEquals',
  'LevelUpUseMoveSpecial', 'LevelUpKnowMoveECElse', 'LevelUpKnowMoveEC100', 'LevelUpRecoilDamageMale', 'LevelUpRecoilDamageFemale', 'Hisui',
  'UseMoveBarbBarrage'];
TYPE_NAMES[90] = 'UseItemFullMoon';
TYPE_NAMES[91] = 'UseMoveAgileStyle';
TYPE_NAMES[92] = 'UseMoveStrongStyle';

// golpes "usar N vezes" (EvolutionRestrictions.GetSpeciesEvolutionMove do PKHeX) — o argumento traz a contagem (0 no LA → 20)
const USE_MOVE_OF = { 979: 'RAGE_FIST', 899: 'PSYSHIELD_BASH', 904: 'BARB_BARRAGE' }; // destino → golpe
// Basculegion: 294 PS de dano de recuo (argumento no SV; 0 no LA)
const RECOIL_HP = 294;

/** UPPER_SNAKE a partir do nome em inglês do PKHeX ("King's Rock" → KINGS_ROCK, "Mr. Mime" → MR_MIME, "Nidoran♀" → NIDORAN_F). */
export function upperSnake(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/♀/g, '_F').replace(/♂/g, '_M')
    .replace(/['’.:]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();
}

const lvl = (e) => e.level || null;

/**
 * Tradução de cada tipo do PKHeX para o vocabulário do poke-tact.
 * Recebe o registro cru + contexto; devolve { kind, param, ...extras }.
 */
function mapMethod(t, e, ctx) {
  const item = () => ctx.item(e.arg), move = () => ctx.move(e.arg), species = () => ctx.species(e.arg);
  const version = () => (ctx.cfg.versions ? ctx.cfg.versions[e.arg & 1] : null); // GameVersion: par = 1ª versão (SN/US/SW/SL)
  switch (t) {
    case 'LevelUp':
    case 'LevelUpECl5': case 'LevelUpECgeq5': // Wurmple: nv 7, ramo pelo valor de personalidade (o decomp da Gen 5 também usa LEVEL)
    case 'LevelUpNinjask': case 'LevelUpShedinja': // Nincada (Shedinja = vaga no time + Poké Ball)
    case 'LevelUpInBattleEC100': case 'LevelUpInBattleECElse': // Tandemaus → Maushold (família de 4 rara = EC % 100 == 0)
      return { kind: 'LEVEL', param: e.level };
    case 'LevelUpATK': return { kind: 'LEVEL_ATK_GT_DEF', param: e.level };
    case 'LevelUpDEF': return { kind: 'LEVEL_ATK_LT_DEF', param: e.level };
    case 'LevelUpAeqD': return { kind: 'LEVEL_ATK_EQ_DEF', param: e.level };
    case 'LevelUpFriendship': return { kind: 'FRIENDSHIP', param: null };
    case 'LevelUpFriendshipMorning': return { kind: 'FRIENDSHIP_DAY', param: null };
    case 'LevelUpFriendshipNight': return { kind: 'FRIENDSHIP_NIGHT', param: null };
    case 'UseItem': return { kind: 'ITEM', param: item() };
    case 'UseItemMale': return { kind: 'ITEM_MALE', param: item() };
    case 'UseItemFemale': return { kind: 'ITEM_FEMALE', param: item() };
    case 'Trade': return { kind: 'TRADE', param: null, trade: true };
    case 'TradeHeldItem': return { kind: 'TRADE_ITEM', param: item(), trade: true };
    // Karrablast ↔ Shelmet: o argumento é 0; o parceiro é a outra espécie
    case 'TradeShelmetKarrablast': return { kind: 'TRADE_SPECIES', param: ctx.species(e.fromSpecies === 588 ? 616 : 588), trade: true };
    case 'LevelUpBeauty': return { kind: 'BEAUTY', param: e.arg };
    case 'LevelUpHeldItemDay': return { kind: 'HELD_ITEM_DAY', param: item() };
    case 'LevelUpHeldItemNight': return { kind: 'HELD_ITEM_NIGHT', param: item() };
    case 'LevelUpKnowMove': case 'LevelUpKnowMoveECElse': case 'LevelUpKnowMoveEC100': return { kind: 'KNOW_MOVE', param: move() };
    case 'LevelUpWithTeammate': return { kind: 'PARTY', param: species() };
    case 'LevelUpElectric': return { kind: 'LOCATION', param: 'MAGNETIC_FIELD' };
    case 'LevelUpForest': return { kind: 'LOCATION', param: 'MOSS_ROCK' };
    case 'LevelUpCold': return { kind: 'LOCATION', param: 'ICE_ROCK' };
    case 'LevelUpSummit': return { kind: 'LOCATION', param: 'SUMMIT' }; // Crabrawler: Mount Lanakila (Alola)
    case 'LevelUpMale': return { kind: 'LEVEL_MALE', param: e.level };
    case 'LevelUpFemale': case 'LevelUpFormFemale1': return { kind: 'LEVEL_FEMALE', param: e.level };
    case 'LevelUpMorning': return { kind: 'LEVEL_DAY', param: e.level };
    case 'LevelUpNight': return { kind: 'LEVEL_NIGHT', param: e.level };
    case 'LevelUpDusk': return { kind: 'LEVEL_DUSK', param: e.level };
    case 'LevelUpWeather': return { kind: 'LEVEL_RAIN', param: e.level };
    case 'LevelUpMoveType': return { kind: 'LEVEL_DARK_IN_PARTY', param: e.level }; // Pancham (o argumento não é o tipo)
    case 'LevelUpInverted': return { kind: 'LEVEL_UPSIDE_DOWN', param: e.level };
    case 'LevelUpNatureAmped': return { kind: 'LEVEL_NATURE_AMPED', param: e.level };
    case 'LevelUpNatureLowKey': return { kind: 'LEVEL_NATURE_LOW_KEY', param: e.level };
    case 'LevelUpVersion': return { kind: 'LEVEL_VERSION', param: e.level, version: version() };
    case 'LevelUpVersionDay': return { kind: 'LEVEL_VERSION_DAY', param: e.level, version: version() };
    case 'LevelUpVersionNight': return { kind: 'LEVEL_VERSION_NIGHT', param: e.level, version: version() };
    // Sun/Moon/USUM: "Wormhole" = evoluir fora de Alola → forma de Kanto; não há como fazer dentro do jogo
    case 'LevelUpWormhole': return { kind: 'LEVEL_NOT_ALOLA', param: e.level, possible: false };
    case 'UseItemWormhole': return { kind: 'ITEM_NOT_ALOLA', param: item(), possible: false };
    case 'LevelUpAffection50MoveType': return { kind: 'AFFECTION_MOVE_TYPE', param: ctx.type(e.arg) };
    case 'CriticalHitsInBattle': return { kind: 'CRITICAL_HITS', param: e.arg };
    case 'HitPointsLostInBattle': return { kind: 'DAMAGE_TAKEN', param: e.arg };
    case 'Spin': return { kind: 'SPIN', param: null };
    case 'TowerOfDarkness':
      if (ctx.cfg.la) return { kind: 'ITEM_DAY', param: item() };
      return { kind: 'TOWER_DARKNESS', param: null, ...(ctx.cfg.noTowers && { possible: false }) };
    case 'TowerOfWaters':
      if (ctx.cfg.la) return { kind: 'ITEM_NIGHT', param: item() };
      return { kind: 'TOWER_WATERS', param: null, ...(ctx.cfg.noTowers && { possible: false }) };
    case 'LevelUpWalkStepsWith': return { kind: 'WALK_STEPS', param: e.arg };
    case 'LevelUpUnionCircle': return { kind: 'UNION_CIRCLE', param: e.level, multiplayer: true };
    case 'LevelUpCollect999': return { kind: 'COLLECT', param: e.arg, item: 'GIMMIGHOUL_COIN' };
    case 'LevelUpDefeatEquals': return { kind: 'DEFEAT_LEADERS', param: e.arg, item: 'LEADERS_CREST' };
    case 'LevelUpUseMoveSpecial': case 'UseMoveBarbBarrage':
      return { kind: 'USE_MOVE', param: USE_MOVE_OF[e.toSpecies] ?? null, count: e.arg || 20 };
    case 'UseMoveAgileStyle': return { kind: 'USE_MOVE_AGILE', param: USE_MOVE_OF[e.toSpecies] ?? null, count: e.arg || 20 };
    case 'UseMoveStrongStyle': return { kind: 'USE_MOVE_STRONG', param: USE_MOVE_OF[e.toSpecies] ?? null, count: e.arg || 20 };
    case 'LevelUpRecoilDamageMale': return { kind: 'RECOIL_DAMAGE', param: e.arg || RECOIL_HP, gender: 'male' };
    case 'LevelUpRecoilDamageFemale': return { kind: 'RECOIL_DAMAGE', param: e.arg || RECOIL_HP, gender: 'female' };
    case 'UseItemFullMoon': return { kind: 'ITEM_FULL_MOON', param: item() };
    default: return null;
  }
}

const T = (s) => String(s ?? '').toLowerCase().split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
/** param de LOCATION → texto (o engine hoje mapeia pelo raw do decomp; aqui o raw é o nome do PKHeX). */
export const LOCATION_PT = { MAGNETIC_FIELD: 'num campo magnético', MOSS_ROCK: 'perto da Moss Rock', ICE_ROCK: 'perto da Ice Rock', SUMMIT: 'no topo do Mount Lanakila' };

/** Descrições curtas em português dos kinds novos (os antigos ficam no describeEvolution do engine). */
export const NEW_KIND_PT = {
  LEVEL_MALE: (e) => `nv ${e.param} (macho)`,
  LEVEL_FEMALE: (e) => `nv ${e.param} (fêmea)`,
  ITEM_MALE: (e) => `${T(e.param)} (macho)`,
  ITEM_FEMALE: (e) => `${T(e.param)} (fêmea)`,
  LEVEL_DAY: (e) => `nv ${e.param} (de dia)`,
  LEVEL_NIGHT: (e) => `nv ${e.param} (à noite)`,
  LEVEL_DUSK: (e) => `nv ${e.param} (ao entardecer, com Own Tempo)`,
  LEVEL_RAIN: (e) => `nv ${e.param} (com chuva ou neblina no mapa)`,
  LEVEL_DARK_IN_PARTY: (e) => `nv ${e.param} (com Pokémon do tipo Sombrio no time)`,
  LEVEL_UPSIDE_DOWN: (e) => `nv ${e.param} (com o console de cabeça para baixo)`,
  LEVEL_NATURE_AMPED: (e) => `nv ${e.param} (natureza "Amped")`,
  LEVEL_NATURE_LOW_KEY: (e) => `nv ${e.param} (natureza "Low Key")`,
  LEVEL_VERSION: (e) => `nv ${e.param} (só em ${e.version ?? 'uma das versões'})`,
  LEVEL_VERSION_DAY: (e) => `nv ${e.param} (de dia, em ${e.version ?? 'uma das versões'})`,
  LEVEL_VERSION_NIGHT: (e) => `nv ${e.param} (à noite, em ${e.version ?? 'uma das versões'})`,
  LEVEL_NOT_ALOLA: (e) => `nv ${e.param} fora de Alola (impossível no jogo)`,
  ITEM_NOT_ALOLA: (e) => `${T(e.param)} fora de Alola (impossível no jogo)`,
  AFFECTION_MOVE_TYPE: (e) => `subir de nível com afeição/amizade alta sabendo golpe do tipo ${T(e.param)}`,
  CRITICAL_HITS: (e) => `acertar ${e.param} golpes críticos numa mesma batalha`,
  DAMAGE_TAKEN: (e) => `perder ${e.param}+ PS sem desmaiar e passar sob o arco de pedra`,
  SPIN: () => 'girar o personagem segurando um doce (Sweet)',
  TOWER_DARKNESS: (e) => `Tower of Darkness${e.possible === false ? ' (não existe neste jogo)' : ''}`,
  TOWER_WATERS: (e) => `Tower of Waters${e.possible === false ? ' (não existe neste jogo)' : ''}`,
  ITEM_DAY: (e) => `${T(e.param)} (de dia)`,
  ITEM_NIGHT: (e) => `${T(e.param)} (à noite)`,
  ITEM_FULL_MOON: (e) => `${T(e.param)} (na lua cheia)`,
  WALK_STEPS: (e) => `subir de nível após andar ${e.param} passos com ele fora da Poké Ball`,
  UNION_CIRCLE: (e) => `nv ${e.param} no Union Circle (com outro jogador)`,
  COLLECT: (e) => `subir de nível com ${e.param} ${T(e.item ?? 'GIMMIGHOUL_COIN')}s`,
  DEFEAT_LEADERS: (e) => `subir de nível após derrotar ${e.param} Bisharp líderes (segurando ${T(e.item ?? 'LEADERS_CREST')})`,
  USE_MOVE: (e) => `usar ${T(e.param)} ${e.count ?? 20} vezes`,
  USE_MOVE_AGILE: (e) => `usar ${T(e.param)} em estilo ágil ${e.count ?? 20} vezes`,
  USE_MOVE_STRONG: (e) => `usar ${T(e.param)} em estilo forte ${e.count ?? 20} vezes`,
  RECOIL_DAMAGE: (e) => `sofrer ${e.param} PS de dano de recuo sem desmaiar${e.gender ? ` (${e.gender === 'male' ? 'macho' : 'fêmea'})` : ''}`,
};

export function readEvolutions(rootUrl, gameId) {
  const cfg = EVO_GAMES[gameId];
  if (!cfg) throw new Error(`sem evoluções do PKHeX para ${gameId}`);
  const res = new URL('PKHeX.Core/Resources/', rootUrl);
  const lines = (rel) => readFileSync(new URL(rel, res), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const speciesNames = lines('text/other/en/text_Species_en.txt'), moveNames = lines('text/other/en/text_Moves_en.txt');
  const typeNames = lines('text/other/en/text_Types_en.txt'), itemNames = lines('text/items/text_Items_en.txt');
  const name = (arr, id, what) => {
    const n = arr[id];
    if (!n || n === '???' || !n.trim()) throw new Error(`${gameId}: ${what} ${id} sem nome`);
    return upperSnake(n);
  };
  const ctx = {
    cfg,
    item: (id) => name(itemNames, id, 'item'), move: (id) => name(moveNames, id, 'golpe'),
    species: (id) => name(speciesNames, id, 'espécie'), type: (id) => name(typeNames, id, 'tipo'),
  };
  const evos = binLinker16(readFileSync(new URL(`byte/evolve/evos_${cfg.evos}.pkl`, res)));

  // tabela personal: índice → (espécie, forma) e presença no jogo
  const loadPersonal = (g) => {
    const p = PKHEX_GAMES[g];
    const buf = readFileSync(new URL(`byte/personal/personal_${p.personal}`, res));
    const at = (i) => buf.subarray(i * p.size, (i + 1) * p.size);
    return { p, buf, at, count: buf.length / p.size };
  };
  const formInfo = (P, species) => {
    const d = P.at(species);
    return { fi: d.readUInt16LE(cfg.forms[0]), fc: d[cfg.forms[1]] };
  };
  const hasForm = (P, species, form) => { const { fi, fc } = formInfo(P, species); return form > 0 && fi > 0 && form < fc; };

  // índice → [{ species, form, shared }]
  const byIndex = new Map();
  let presentIn;
  if (cfg.via === 'species') {
    for (let s = 1; s <= cfg.maxSpecies && s < evos.length; s++) byIndex.set(s, { species: s, form: null });
    presentIn = (s) => s >= 1 && s <= cfg.maxSpecies;
  } else {
    const IDX = loadPersonal(cfg.index ?? gameId);
    const maxIdx = cfg.maxIndexSpecies ?? cfg.maxSpecies;
    for (let s = 1; s <= maxIdx; s++) {
      const { fi, fc } = formInfo(IDX, s);
      // forma 0 = a própria espécie; sem FormStatsIndex, todas as formas usam esta entrada (shared)
      byIndex.set(s, { species: s, form: 0, shared: fi === 0 && fc > 1 });
      for (let f = 1; fi > 0 && f < fc; f++) if (!byIndex.has(fi + f - 1)) byIndex.set(fi + f - 1, { species: s, form: f });
    }
    // presença (IPersonalTable.IsPresentInGame do respectivo PersonalTable*.cs)
    const PR = loadPersonal(gameId);
    const flag = (d) => PR.p.present(d);
    const GEN7_EXTRA = { 201: 28, 412: 3, 414: 3, 493: 18, 649: 5, 664: 18, 665: 18, 666: 20, 585: 4, 586: 4, 669: 5, 671: 5, 670: 6, 773: 18 };
    presentIn = (s, f) => {
      f ??= 0;
      if (s < 1 || s > cfg.maxSpecies) return false;
      switch (cfg.presence) {
        case 'gen7': return f === 0 || hasForm(PR, s, f) || (GEN7_EXTRA[s] != null && f < GEN7_EXTRA[s]) || (s === 716 && f === 1);
        case 'gg':
          if (!(s <= 151 || s === 808 || s === 809)) return false;
          if (f === 0) return true;
          return s === 25 ? f === 8 : hasForm(PR, s, f);
        case 'bdsp': return f === 0 || hasForm(PR, s, f);
        case 'flag': {
          if (f === 0) return flag(PR.at(s));
          if (!hasForm(PR, s, f)) return false;
          const { fi } = formInfo(PR, s);
          return flag(PR.at(fi + f - 1));
        }
        default: throw new Error(cfg.presence);
      }
    };
  }

  const list = [], unmapped = [], dropped = [];
  const counts = {};
  for (const [index, src] of [...byIndex].sort((a, b) => a[0] - b[0])) {
    const d = evos[index];
    if (!d || !d.length) continue;
    for (let o = 0; o + 8 <= d.length; o += 8) {
      const e = { type: d[o], arg: d.readUInt16LE(o + 2), toSpecies: d.readUInt16LE(o + 4), form: d[o + 6], level: d[o + 7], fromSpecies: src.species };
      if (!e.toSpecies) continue;
      const raw = TYPE_NAMES[e.type] ?? `Type${e.type}`;
      // forma: 0xFF = mantém a de origem; entradas por espécie (Gen 5/6) ou compartilhadas → null = "qualquer forma"
      const anyForm = src.form == null || src.shared;
      const fromForm = anyForm ? null : src.form;
      const toForm = e.form === 0xff ? fromForm : e.form;
      if (!presentIn(src.species, fromForm) || !presentIn(e.toSpecies, toForm)) {
        dropped.push({ index, from: ctx.species(src.species), fromForm, to: ctx.species(e.toSpecies), toForm, raw });
        continue;
      }
      const m = mapMethod(raw, e, ctx);
      if (!m) { unmapped.push({ index, raw, arg: e.arg, to: ctx.species(e.toSpecies) }); continue; }
      const { kind, param, possible = true, ...extra } = m;
      list.push({
        fromSpecies: src.species, fromForm, toSpecies: e.toSpecies, toForm,
        fromName: ctx.species(src.species), toName: ctx.species(e.toSpecies),
        kind, param, level: lvl(e), raw, arg: e.arg, possible, ...extra,
      });
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
  }
  const report = {
    game: gameId, file: `evos_${cfg.evos}.pkl`, index: cfg.via === 'species' ? 'species' : `personal form index (personal_${PKHEX_GAMES[cfg.index ?? gameId].personal})`,
    total: list.length, counts, unmapped, droppedNotInGame: dropped.length, dropped,
    impossible: list.filter((x) => !x.possible).map((x) => `${x.fromName}→${x.toName}${x.toForm ? `-${x.toForm}` : ''} ${x.kind}`),
  };
  return { list, report };
}
