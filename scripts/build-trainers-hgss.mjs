// Treinadores de HeartGold/SoulSilver a partir do decomp pret/pokeheartgold → public/data/<jogo>-trainers.json
//   include/constants/trainers.h               #define TRAINER_X n   (n = índice em trainers.json)
//   files/poketool/trainer/trainers.json       trainers[n] { class, name "{TRNAME}Abe", double, party [{ difficulty, level, species, item?, moves? }] }
//                                              src/trainer_data.c: iv = (u8)(difficulty·31/255) em todos os atributos
//   src/data/map_headers.h                     [MAP_X] = { .scriptsBank = scr_seq_NNNN_<código>_bin, .eventsBank = NARC_zone_event_NNN_<código>_bin }
//   lugar: objeto "std_trainer(TRAINER_X)" no zone_event/<código>.json ou "TrainerBattle TRAINER_X" no scr_seq_*_<código>.s
//   rival ↔ inicial do JOGADOR: "GetStarterChoice VAR / Compare VAR, 152 / GoToIfNe _L / TrainerBattle A" … o último
//     TrainerBattle sem Compare é o inicial que sobrou (152 Chikorita, 155 Cyndaquil, 158 Totodile)
// Uso: node scripts/build-trainers-hgss.mjs <jogo>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { likelyMoveset } from '../public/engine.mjs';
import { loadHgss, mapLabel } from './lib/gen4-hgss.mjs';

const gameId = process.argv[2] ?? 'heartgold-soulsilver';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const g = loadHgss(root);
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const moveName = (c) => moveIdOf.get(g.moveId[c]) ?? null;
const monOf = (c) => data.pokemon.find((p) => p.id === g.speciesId[c]);
const title = (s) => s.toLowerCase().replace(/(^|[\s.&-])([a-zé])/g, (m, a, b) => a + b.toUpperCase());

const constOf = {};
for (const m of read('include/constants/trainers.h').matchAll(/#define (TRAINER_\w+)\s+(\d+)/g)) constOf[m[1]] = Number(m[2]);
const tj = JSON.parse(read('files/poketool/trainer/trainers.json')).trainers;

// código do mapa (T22GYM0101) → MAP_X (primeiro cabeçalho que usa o arquivo)
const byCode = {};
for (const m of read('src/data/map_headers.h').matchAll(/\[(MAP_\w+)\] = \{([\s\S]*?)\n\s*\},/g)) {
  const s = m[2].match(/\.scriptsBank = scr_seq_\d+_(\w+?)_bin/)?.[1], e = m[2].match(/\.eventsBank = NARC_zone_event_\d+_(\w+?)_bin/)?.[1];
  for (const c of [s, e]) if (c) byCode[c] ??= m[1];
}
const where = {};
const add = (t, code) => { const h = byCode[code]; if (h) (where[t] ??= new Set()).add(mapLabel(h)); };
const ev = new URL('files/fielddata/eventdata/zone_event/', root);
for (const f of readdirSync(ev).filter((x) => x.endsWith('.json'))) {
  const code = f.replace(/^\d+_/, '').replace('.json', '');
  for (const m of readFileSync(new URL(f, ev), 'utf8').matchAll(/std_trainer\((TRAINER_\w+)\)/g)) add(m[1], code);
}
// 1ª luta (Cherrygrove): o rival ainda não tem nome → TRAINER_PASSERBY_BOY (classe PASSERBY), mesmo desvio pelo inicial
const RIVAL = /^TRAINER_(RIVAL_|PASSERBY_BOY)/;
const STARTER = { 152: 'chikorita', 155: 'cyndaquil', 158: 'totodile' };
const forStarter = {};
const sq = new URL('files/fielddata/script/scr_seq/', root);
for (const f of readdirSync(sq).filter((x) => /^scr_seq_\d+_\w+\.s$/.test(x))) {
  const code = f.replace(/^scr_seq_\d+_/, '').replace('.s', '');
  const lines = readFileSync(new URL(f, sq), 'utf8').split(/\r?\n/);
  let left = null, pending = null;
  lines.forEach((l, i) => {
    if (/GetStarterChoice (\w+)/.test(l)) { left = new Set(Object.keys(STARTER).map(Number)); pending = null; return; }
    const c = l.match(/Compare \w+, (\d+)/);
    if (left && c && /GoToIfNe/.test(lines[i + 1] ?? '') && left.has(Number(c[1]))) { pending = Number(c[1]); return; }
    const b = l.match(/TrainerBattle (TRAINER_\w+)(?:, (TRAINER_\w+))?/);
    if (!b) return;
    add(b[1], code); if (b[2] && b[2] !== 'TRAINER_NONE') add(b[2], code);
    if (left && RIVAL.test(b[1])) {
      const sp = pending ?? (left.size === 1 ? [...left][0] : null);
      if (sp) { forStarter[b[1]] = [STARTER[sp]]; left.delete(sp); }
      pending = null;
      if (!left.size) left = null;
    }
  });
}

const BOSS = /^TRAINER_(LEADER|ELITE_FOUR|CHAMPION|PKMN_TRAINER_RED)_/;
const GROUP = (c) => (/^TRAINER_LEADER_/.test(c) ? 'Líderes de ginásio' : /^TRAINER_ELITE_FOUR_/.test(c) ? 'Elite dos Quatro' : /^TRAINER_(CHAMPION_|PKMN_TRAINER_RED_)/.test(c) ? 'Campeão' : RIVAL.test(c) ? 'Rival' : 'Treinadores comuns');
const out = [], unplaced = [];
for (const [c, n] of Object.entries(constOf)) {
  const j = tj[n];
  if (!j?.party?.length) continue;
  if (!where[c]) { unplaced.push(c); continue; }
  const cls = title(j.class.replace(/^TRAINERCLASS_/, '').replace(/_(M|F|MALE|FEMALE|GS)$/, '').replace(/_/g, ' '));
  const name = RIVAL.test(c) ? 'Silver' : j.name.replace(/\{TRNAME\}/, '').trim();
  const party = j.party.map((p) => {
    const mon = monOf(p.species);
    const explicit = p.moves?.map(moveName).filter(Boolean);
    return { species: mon.name, level: p.level, item: p.item && p.item !== 'ITEM_NONE' ? title(p.item.replace(/^ITEM_/, '').replace(/_/g, ' ')) : null,
      iv: Math.floor(((p.difficulty ?? 0) * 31) / 255), moves: explicit?.length ? explicit : likelyMoveset(mon, p.level), defaultMoves: !explicit?.length };
  });
  // classe já traz o nome (LEADER_LT_SURGE + "Lt. Surge") → compara sem pontuação
  const label = GROUP(c) === 'Rival' ? `Rival ${name}` : cls.toLowerCase().replace(/\W/g, '').endsWith(name.toLowerCase().replace(/\W/g, '')) ? cls.replace(/^Leader Lt Surge$/, 'Leader Lt. Surge') : `${cls} ${name}`;
  out.push({ key: c, name, label, class: cls, group: GROUP(c), double: !!j.double, map: [...where[c]], party,
    ...(forStarter[c] && { forStarter: forStarter[c] }),
    // revanches dos chefes (Fighting Dojo, Liga com nível maior): constantes _2/_3 no fim de trainers.h
    ...(BOSS.test(c) && /_\d$/.test(c) && { rematch: true }) });
}
writeFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, trainers: out, unplaced }));
const by = out.reduce((a, t) => ((a[t.group] = (a[t.group] ?? 0) + 1), a), {});
console.log(`[${gameId}] ${out.length} treinadores ${JSON.stringify(by)}; rivais com inicial ${out.filter((t) => t.forStarter).length}/${out.filter((t) => t.group === 'Rival').length}; revanches ${out.filter((t) => t.rematch).length}; ${unplaced.length} sem lugar (ex.: ${unplaced.slice(0, 10).join(' ')})`);
