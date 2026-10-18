// Gera public/data/firered-leafgreen-trainers.json a partir do decomp pret/pokefirered (trainers.h + trainer_parties.h).
// Golpes: os customizados do jogo; sem customização, o moveset padrão calculado pelo mesmo algoritmo do jogo.
// Uso: node scripts/build-trainers.mjs   (depois de build-data)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { decompPaths } from './lib/decomp.mjs';
import { loadDecomp } from './lib/decomp.mjs';
import { starterByIndex, trainersByStarter } from './lib/starters.mjs';
import { parseBlocks } from './lib/script-graph.mjs';
import { readdirSync as lsDir } from 'node:fs';
import { likelyMoveset } from '../public/engine.mjs';

const gameId = process.argv[2] ?? 'firered-leafgreen';
const { game, commit, read, mapsDir: decompMapsDir } = decompPaths(gameId);
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const decomp = loadDecomp(gameId);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const human = (s) => s.toLowerCase().split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const monByName = Object.fromEntries(data.pokemon.map((p) => [norm(p.name), p]));
const monOf = (c) => monByName[norm(c)] ?? monByName[norm(c) + 'normal'];
const idMemo = new Map(Object.keys(data.moves).map((n) => [JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n]));
const moveOf = (c) => idMemo.get(decomp.moveId[c]);

// --- Parties: sParty_X -> [{ level, species, item, moves|null }]
const parties = {};
const partyText = read('src/data/trainer_parties.h');
for (const m of partyText.matchAll(/(?:static )?const struct TrainerMon\w+ ((?:sParty|gTrainerParty)_\w+)\[\] = \{([\s\S]*?)\n\};/g)) {
  const mons = [];
  for (const b of m[2].matchAll(/\{([^{}]*?)\}(?=,|\s*$)/g)) {
    // cada bloco de Pokémon (os golpes têm chaves aninhadas; capturamos o bloco externo mais abaixo)
  }
  for (const blk of m[2].split(/\n    \{\n/).slice(1)) {
    const species = blk.match(/\.species = SPECIES_(\w+)/)?.[1];
    // pokeruby usa .level (e às vezes repete o campo: em C vale o ÚLTIMO)
    const lvl = Number([...blk.matchAll(/\.(?:lvl|level) = (\d+)/g)].at(-1)?.[1]);
    if (!species || !lvl) continue;
    const item = blk.match(/\.heldItem = ITEM_(\w+)/)?.[1];
    const mv = blk.match(/\.moves = \{([^}]*)\}/)?.[1];
    // .iv (0–255): o jogo usa iv * 31 / 255 em TODOS os atributos (battle_main.c: fixedIV) — usado no cálculo de dano
    const iv = Number(blk.match(/\.iv = (\d+)/)?.[1] ?? 0);
    mons.push({ species, lvl, iv, item: item && item !== 'NONE' ? item : null, moves: mv ? [...mv.matchAll(/MOVE_(\w+)/g)].map((x) => x[1]).filter((x) => x !== 'NONE') : null });
  }
  parties[m[1]] = mons;
}

const GROUPS = {
  LEADER: 'Líderes de ginásio', ELITE_FOUR: 'Elite dos Quatro', CHAMPION: 'Campeão', RIVAL_EARLY: 'Rival', RIVAL_LATE: 'Rival', RIVAL: 'Rival',
  AQUA_LEADER: 'Equipe Aqua / Magma', MAGMA_LEADER: 'Equipe Aqua / Magma', AQUA_ADMIN: 'Equipe Aqua / Magma', MAGMA_ADMIN: 'Equipe Aqua / Magma',
  SALON_MAIDEN: 'Frontier Brains', PYRAMID_KING: 'Frontier Brains', PIKE_QUEEN: 'Frontier Brains', PALACE_MAVEN: 'Frontier Brains', FACTORY_HEAD: 'Frontier Brains', DOME_ACE: 'Frontier Brains', ARENA_TYCOON: 'Frontier Brains',
};
const SKIP = game.decomp.skipTrainerClasses; // classes de outro jogo/cutscenes
const trainers = [];
const dropped = [];
const text = read('src/data/trainers.h');
for (const blk of text.split(/\n    \[(?=TRAINER_)/).slice(1)) {
  const key = blk.match(/^(TRAINER_\w+)\]/)[1];
  if (key === 'TRAINER_NONE') continue;
  const cls = blk.match(/\.trainerClass = TRAINER_CLASS_(\w+)/)?.[1];
  const label = blk.match(/\.trainerName = _\("([^"]*)"\)/)?.[1];
  const partyName = blk.match(/\(\s*(sParty_\w+)\s*\)/)?.[1] ?? blk.match(/=\s*(gTrainerParty_\w+)\s*\}/)?.[1];
  if (!cls || SKIP.test(cls)) continue;
  if (!partyName || !parties[partyName]?.length) { dropped.push(`${key}: sem time`); continue; }
  const party = [];
  let ok = true;
  for (const p of parties[partyName]) {
    const mon = monOf(p.species);
    if (!mon) { ok = false; break; }
    const customMoves = p.moves?.map(moveOf);
    if (customMoves?.some((x) => !x)) { ok = false; break; }
    party.push({ species: mon.name, level: p.lvl, iv: Math.floor((p.iv * 31) / 255), item: p.item ? human(p.item) : null, moves: customMoves ?? likelyMoveset(mon, p.lvl), defaultMoves: !customMoves });
  }
  if (!ok) { dropped.push(`${key}: espécie/golpe fora do dataset`); continue; }
  trainers.push({
    key, name: label, label: human(key.replace(/^TRAINER_/, '')), class: human(cls), group: GROUPS[cls] ?? 'Treinadores comuns',
    double: /\.doubleBattle = TRUE/.test(blk), party,
  });
}
// Rival × inicial do JOGADOR: seguindo goto/call_if_eq e switch…case de VAR_STARTER_MON até o trainerbattle
{
  const { mapsDir } = decompPaths(gameId);
  const scripts = lsDir(mapsDir).map((f) => { try { return readFileSync(new URL(`${f}/scripts.inc`, mapsDir), 'utf8'); } catch { return ''; } }).filter(Boolean);
  const sharedDir = new URL('../scripts/', mapsDir);
  const shared = new Map(lsDir(sharedDir).filter((n) => n.endsWith('.inc')).flatMap((n) => [...parseBlocks(readFileSync(new URL(n, sharedDir), 'utf8'))]));
  let starterC = null;
  try { starterC = read('src/starter_choose.c'); } catch {}
  const idx = starterByIndex(scripts, starterC);
  const byKey = trainersByStarter(scripts, shared);
  let linked = 0;
  for (const t of trainers) if (byKey[t.key]) { t.forStarter = byKey[t.key].map((i) => monOf(idx[i])?.name).filter(Boolean); linked++; }
  console.log(`rival × inicial: ${linked} lutas ligadas a um inicial do jogador (${Object.values(idx).join('/')})`);
}
const order = ['Líderes de ginásio', 'Elite dos Quatro', 'Campeão', 'Rival', 'Equipe Aqua / Magma', 'Frontier Brains', 'Treinadores comuns'];
trainers.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
writeFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), JSON.stringify({ source: `${game.decomp.repo}@${commit.slice(0, 7)}`, trainers }));
const g = {};
for (const t of trainers) g[t.group] = (g[t.group] ?? 0) + 1;
console.log(`${trainers.length} treinadores`, g);
console.log(`descartados: ${dropped.filter((d) => d.endsWith('sem time')).length} sem time (entradas de classe sem equipe) | ${dropped.filter((d) => d.includes('fora')).length} fora do dataset`);
