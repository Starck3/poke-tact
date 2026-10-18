// Corrige campos numéricos dos golpes no dataset usando o decomp pret/pokefirered (valores reais do jogo).
// Motivo: a PokéAPI não tem histórico de prioridade e omite algumas mudanças de PP/poder entre gerações.
// Cada correção fica registrada em data.corrections e em reports/overlay-corrections.json.
// Uso: node scripts/apply-decomp-overlay.mjs   (depois de build-data; idempotente)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { decompPaths } from './lib/decomp.mjs';
import { loadDecomp } from './lib/decomp.mjs';

const gameId = process.argv[2] ?? 'firered-leafgreen';
const { game, commit, read, mapsDir: decompMapsDir } = decompPaths(gameId);
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
const file = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));

const moveIdByName = Object.fromEntries([...read('include/constants/moves.h').matchAll(/#define MOVE_(\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]));
const apiMoveById = new Map(Object.keys(data.moves).map((n) => [JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n]));

const corrections = [];
for (const b of read('src/data/battle_moves.h').split(/\n\s*\[(?=MOVE_)/).slice(1)) {
  const name = b.match(/^MOVE_(\w+)\]/)?.[1];
  const apiName = apiMoveById.get(moveIdByName[name]);
  if (!apiName) continue;
  const f = (k) => Number(b.match(new RegExp(`\\.${k}\\s*=\\s*(-?\\d+)`))[1]);
  const mv = data.moves[apiName];
  const fix = (field, value) => {
    if (mv[field] !== value) { corrections.push({ move: apiName, field, from: mv[field], to: value }); mv[field] = value; }
  };
  fix('pp', f('pp'));
  fix('priority', f('priority'));
  // poder/precisão só para golpes de dano com valor real (o jogo usa 1 como placeholder de dano variável e 100 em golpes sem teste de precisão)
  if (mv.power > 0 && f('power') > 1) fix('power', f('power'));
  // dano variável no jogo (poder 0/1 no decomp) mas a PokéAPI dá um número: ex. Low Kick no Ruby/Sapphire (depende do peso)
  else if (mv.power > 1 && f('power') <= 1) fix('power', null);
  if (mv.power > 0 && mv.accuracy != null) fix('accuracy', f('accuracy'));
}
// Ordem do learnset por level-up = ordem do arquivo do jogo (a PokéAPI não a preserva; em empates de nível ela define
// quais golpes entram no moveset padrão de treinadores/selvagens).
const decomp = loadDecomp(gameId);
const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
const decompOrder = Object.fromEntries(Object.entries(decomp.levelUpOrdered).map(([n, v]) => [norm(n), v]));
let reordered = 0;
for (const mon of data.pokemon) {
  const ordered = decompOrder[norm(mon.name)] ?? decompOrder[norm(mon.name.split('-')[0])];
  if (!ordered) continue;
  const seen = new Set();
  const level = ordered.map(([lvl, mv]) => ({ move: apiMoveById.get(decomp.moveId[mv]), method: 'level-up', level: lvl })).filter((l) => !seen.has(l.move + '@' + l.level) && seen.add(l.move + '@' + l.level)); // o jogo repete algumas entradas (ex.: Dugtrio)
  if (level.some((l) => !l.move)) continue; // golpe fora do dataset: mantém a ordem original
  const key = (l) => l.move + '@' + l.level;
  const before = [...new Set(mon.learnset.filter((l) => l.method === 'level-up').map(key))].sort().join();
  if (before !== level.map(key).sort().join()) throw new Error('learnset de nível difere do jogo em ' + mon.name);
  mon.learnset = [...level, ...mon.learnset.filter((l) => l.method !== 'level-up')];
  reordered++;
}
console.log(reordered + ' learnsets reordenados conforme o jogo');

// Nível mínimo de cada espécie = maior nível de evolução da cadeia (EVO_LEVEL*). Pedra/troca/amizade não exigem nível.
// (As evoluções por horário foram removidas no FR/LG — ver pokemon.c — e já estão fora de 'obtainable'.)
const evoText = read('src/data/pokemon/evolution.h');
const evoLevel = {}; // NOME_DO_FILHO -> nível exigido (0 se não for por nível)
const evoInfo = {}; // NOME_DO_FILHO -> { kind: LEVEL|ITEM|TRADE|TRADE_ITEM|FRIENDSHIP|FRIENDSHIP_DAY|..., param }
for (const m of evoText.matchAll(/\{EVO_(\w+),\s*(\w+),\s*SPECIES_(\w+)\}/g)) {
  // cada espécie evolui a partir de uma só; o parâmetro é o nível só nas evoluções por nível (EVO_LEVEL*)
  evoLevel[norm(m[3])] = m[1].startsWith('LEVEL') ? Number(m[2]) : 0;
  evoInfo[norm(m[3])] = { kind: m[1], param: m[1].startsWith('LEVEL') ? Number(m[2]) : m[2].replace(/^ITEM_/, '') };
}
const byId = new Map(data.pokemon.map((p) => [p.id, p]));
const minLevel = (mon) => {
  const parent = byId.get(mon.evolvesFrom);
  const own = evoLevel[norm(mon.name)] ?? 0;
  return Math.max(parent ? minLevel(parent) : 1, own, 1);
};
for (const mon of data.pokemon) {
  mon.minLevel = minLevel(mon);
  // Como evolui A PARTIR da forma anterior. Evoluções por horário do dia só valem em jogos com relógio (game.decomp.hasRtc).
  const e = evoInfo[norm(mon.name)];
  mon.evo = e ? { ...e, possible: game.decomp.hasRtc || !/_(DAY|NIGHT)$/.test(e.kind) } : null;
}
console.log('minLevel: tyranitar=' + data.pokemon.find((p) => p.name === 'tyranitar').minLevel + ', raichu=' + data.pokemon.find((p) => p.name === 'raichu').minLevel);
const all = [...(data.corrections?.list ?? []), ...corrections]; // idempotente: não perde correções de execuções anteriores
data.corrections = { source: `${game.decomp.repo}@${commit.slice(0, 7)}`, list: all };
writeFileSync(file, JSON.stringify(data));
writeFileSync(new URL(`../reports/${gameId}/overlay-corrections.json`, import.meta.url), JSON.stringify(all, null, 1));
console.log(`${corrections.length} correções aplicadas a partir do decomp:`);
for (const c of corrections) console.log(`  ${c.move}.${c.field}: ${c.from} → ${c.to}`);
