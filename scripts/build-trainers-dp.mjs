// Treinadores de Diamond/Pearl a partir do decomp pret/pokediamond (JSON) → public/data/<jogo>-trainers.json
//   include/constants/trainers.h   #define TRAINER_X n  (n = índice em trdata.json)
//   files/poketool/trainer/trdata.json  trdata[n] { class, name "{TRNAME}Roark", doubleBattle, party: [{ difficulty, level, species, moves?, item? }] }
//   arm9/src/trainer_data.c        iv = (u8)(difficulty·31/255)
// Os scripts e eventos (onde cada um luta) estão em binário → só os CHEFES entram (líderes, Elite dos Quatro, campeã, rival),
// sem lugar. O rival não tem sufixo de inicial e o desvio pelo inicial está no script binário → não se infere: cada time
// do Barry é rotulado pelo inicial que ELE leva (o usuário escolhe), sem forStarter.
// Uso: node scripts/build-trainers-dp.mjs <jogo>
import { readFileSync, writeFileSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { likelyMoveset, family } from '../public/engine.mjs';
import { loadDp } from './lib/gen4-dp.mjs';

const gameId = process.argv[2] ?? 'diamond-pearl';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const g = loadDp(root);
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const monOf = (c) => data.pokemon.find((p) => p.id === g.speciesId[c]);
const title = (s) => s.toLowerCase().replace(/(^|[\s.&-])([a-zé])/g, (m, a, b) => a + b.toUpperCase());
const tr = JSON.parse(read('files/poketool/trainer/trdata.json')).trdata;
const BOSS = { LEADER: 'Líderes de ginásio', ELITE_FOUR: 'Elite dos Quatro', CHAMPION: 'Campeão' };
const starterFam = new Map((data.starters?.species ?? []).map((s) => [family(data, data.pokemon.find((p) => p.name === s)), s]));
const out = [];
for (const [c, n] of [...read('include/constants/trainers.h').matchAll(/#define (TRAINER_\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])])) {
  const j = tr[n];
  if (!j?.party?.length) continue;
  const kind = c.match(/^TRAINER_(LEADER|ELITE_FOUR|CHAMPION)_/)?.[1];
  const rival = /^TRAINER_PKMN_TRAINER_BARRY_/.test(c);
  if (!kind && !rival) continue;
  const party = j.party.map((p) => {
    const mon = monOf(p.species);
    const explicit = p.moves?.map((m) => moveIdOf.get(g.moveId[m])).filter(Boolean);
    return { species: mon.name, level: p.level, item: p.item && p.item !== 'ITEM_NONE' ? title(p.item.replace(/^ITEM_/, '').replace(/_/g, ' ')) : null,
      iv: Math.floor(((p.difficulty ?? 0) * 31) / 255), moves: explicit?.length ? explicit : likelyMoveset(mon, p.level), defaultMoves: !explicit?.length };
  });
  const cls = title(j.class.replace(/^TRAINER_CLASS_/, '').replace(/_/g, ' '));
  const name = rival ? 'Barry' : j.name.replace('{TRNAME}', '').trim();
  const carried = rival ? party.map((p) => starterFam.get(family(data, data.pokemon.find((x) => x.name === p.species)))).find(Boolean) : null;
  const top = Math.max(...party.map((p) => p.level));
  // rótulo = cargo + nome do treinador (a classe TRAINER_CLASS_ELITE_FOUR_LUCIEN tem o nome grafado errado no decomp)
  out.push({ key: c, name, label: rival ? `Rival Barry${carried ? ` (time com ${title(carried)})` : ''} — nv ${top}` : `${title(kind.replace(/_/g, ' '))} ${name}`,
    class: cls, group: rival ? 'Rival' : BOSS[kind], double: !!j.doubleBattle, map: [], party, ...(rival && carried && { carries: carried }), ...(/_\d+$/.test(c) && !rival && { rematch: true }) });
}
out.sort((a, b) => Math.max(...a.party.map((p) => p.level)) - Math.max(...b.party.map((p) => p.level)));
writeFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, note: 'só chefes; lugar das lutas em binário no decomp', trainers: out, unplaced: [] }));
const by = out.reduce((a, t) => ((a[t.group] = (a[t.group] ?? 0) + 1), a), {});
console.log(`[${gameId}] ${out.length} chefes ${JSON.stringify(by)}; rival com inicial identificado ${out.filter((t) => t.carries).length}/${out.filter((t) => t.group === 'Rival').length}; revanches ${out.filter((t) => t.rematch).length}`);
