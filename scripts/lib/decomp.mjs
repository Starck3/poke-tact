// Parser dos dados do decomp pret/pokefirered (headers C). Retorna estruturas por espécie, golpes identificados por ID numérico.
import { readFileSync } from 'node:fs';
import { GAMES } from '../games.mjs';

/** Caminhos do decomp de um jogo (conforme scripts/games.mjs): arquivos de dados e clone dos scripts dos mapas. */
export function decompPaths(gameId = 'firered-leafgreen') {
  const game = GAMES[gameId];
  const { repo, commit } = game.decomp;
  const name = repo.split('/')[1];
  const root = new URL(`../../data-sources/${name}/${commit}/`, import.meta.url);
  const alias = (p) => game.decomp.aliases?.[p] ?? p;
  return { game, commit, name, alias, read: (p) => readFileSync(new URL(alias(p), root), 'utf8'), mapsDir: new URL(`../../data-sources/${name}-scripts/data/maps/`, import.meta.url) };
}

// aceita decimal e hexadecimal (pokeruby usa 0x..)
const defines = (text, prefix) => Object.fromEntries([...text.matchAll(new RegExp(`#define ${prefix}(\\w+)\\s+(0x[0-9a-fA-F]+|\\d+)\\b`, 'g'))].map((m) => [m[1], Number(m[2])]));

export function loadDecomp(gameId = 'firered-leafgreen') {
  const { commit, read } = decompPaths(gameId);
  const moveId = defines(read('include/constants/moves.h'), 'MOVE_'); // NOME -> id
  const speciesId = defines(read('include/constants/species.h'), 'SPECIES_');
  const idToSpecies = Object.fromEntries(Object.entries(speciesId).map(([n, i]) => [i, n]));
  const levelUpOrdered = {}; // NOME -> [[nível, GOLPE]] na ordem do arquivo (importa para o moveset padrão)
  const species = {}; // NOME_CONSTANTE -> { level:Set('id@lvl'), machine:Set(id), tutor:Set(id), egg:Set(id) }
  const get = (n) => (species[n] ??= { level: new Set(), machine: new Set(), tutor: new Set(), egg: new Set() });

  // Level-up: ponteiros espécie -> rótulo; rótulo -> lista de LEVEL_UP_MOVE
  const labels = {};
  for (const m of read('src/data/pokemon/level_up_learnsets.h').matchAll(/(?:static )?const u16 (\w+)\[\] = \{([\s\S]*?)LEVEL_UP_END/g)) {
    labels[m[1]] = [...m[2].matchAll(/LEVEL_UP_MOVE\(\s*(\d+),\s*MOVE_(\w+)\)/g)].map((x) => [Number(x[1]), x[2]]);
  }
  const ptrText = read('src/data/pokemon/level_up_learnset_pointers.h');
  let ptrs = [...ptrText.matchAll(/\[SPECIES_(\w+)\]\s*=\s*(\w+),/g)].map((m) => [m[1], m[2]]);
  if (!ptrs.length) {
    // pokeruby: lista posicional — o índice é o número da espécie (0 = NONE)
    const body = ptrText.slice(ptrText.indexOf('gLevelUpLearnsets'));
    ptrs = [...body.slice(body.indexOf('{') + 1, body.indexOf('};')).matchAll(/(\w+LevelUpLearnset)/g)].map((m, i) => [idToSpecies[i], m[1]]);
  }
  for (const m of ptrs.map(([sp, label]) => [null, sp, label])) {
    if (!m[1] || m[1] === 'NONE' || !labels[m[2]]) continue;
    levelUpOrdered[m[1]] = labels[m[2]];
    for (const [lvl, mv] of labels[m[2]]) get(m[1]).level.add(`${moveId[mv]}@${lvl}`);
  }

  // TM/HM. Dois formatos conforme o repositório:
  //   pokefirered: [SPECIES_X] = TMHM_LEARNSET(TMHM(TM06_TOXIC) | ...)
  //   pokeemerald: [SPECIES_X] = { .learnset = { .TOXIC = TRUE, ... } }
  const tm = read('src/data/pokemon/tmhm_learnsets.h');
  // pokeruby: a tabela de TMs escreve TM22_SOLARBEAM, mas moves.h define MOVE_SOLAR_BEAM → casar ignorando "_"
  const moveByLoose = Object.fromEntries(Object.entries(moveId).map(([n, i]) => [n.replace(/_/g, ''), i]));
  const addTm = (species, move) => {
    const id = moveId[move] ?? moveByLoose[move.replace(/_/g, '')];
    if (id === undefined) throw new Error(`TM/HM sem golpe: ${move}`);
    get(species).machine.add(id);
  };
  if (tm.includes('TMHM_LEARNSET(')) {
    for (const m of tm.matchAll(/\[SPECIES_(\w+)\]\s*=\s*TMHM_LEARNSET\(([\s\S]*?)\),?\s*(?=\n\s*\n|\n\s*\[SPECIES_|\n\};)/g)) {
      if (m[1] === 'NONE') continue;
      for (const t of m[2].matchAll(/TMHM\((?:TM|HM)\d+_(\w+)\)/g)) addTm(m[1], t[1]);
    }
  } else {
    for (const chunk of tm.slice(tm.indexOf('gTMHMLearnsets')).split(/\[SPECIES_/).slice(1)) {
      const name = chunk.match(/^(\w+)\]/)[1];
      if (name === 'NONE') continue;
      for (const t of chunk.matchAll(/\.(\w+) = TRUE/g)) addTm(name, t[1]);
    }
  }

  // Tutor (Gen 3 FRLG: 15 golpes)
  let tut = ''; // Ruby/Sapphire não têm tabela de tutores
  try { tut = read('src/data/pokemon/tutor_learnsets.h'); } catch {}
  for (const chunk of tut.slice(tut.indexOf('sTutorLearnsets')).split(/\[SPECIES_/).slice(1)) {
    const name = chunk.match(/^(\w+)\]/)[1];
    if (name === 'NONE') continue;
    for (const t of chunk.matchAll(/TUTOR\(MOVE_(\w+)\)/g)) get(name).tutor.add(moveId[t[1]]);
  }

  // Ovos
  const eggText = read('src/data/pokemon/egg_moves.h');
  const egg = eggText.slice(eggText.indexOf('gEggMoves[]')); // pula o #define egg_moves(species, ...)
  for (const m of egg.matchAll(/egg_moves\((\w+),([\s\S]*?)\)(?=,\s*\n|\s*\n\s*(?:egg_moves|EGG_MOVES_TERMINATOR|\}))/g)) {
    for (const t of m[2].matchAll(/MOVE_(\w+)/g)) get(m[1]).egg.add(moveId[t[1]]);
  }
  return { commit, moveId, species, speciesId, idToSpecies, levelUpOrdered };
}
