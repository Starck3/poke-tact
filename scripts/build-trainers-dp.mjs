// Treinadores de Diamond/Pearl a partir do decomp pret/pokediamond → public/data/<jogo>-trainers.json
//   include/constants/trainers.h   #define TRAINER_X n  (n = índice em trdata.json)
//   files/poketool/trainer/trdata.json  trdata[n] { class, name "{TRNAME}Roark", doubleBattle, party: [{ difficulty, level, species, moves?, item? }] }
//   arm9/src/trainer_data.c        iv = (u8)(difficulty·31/255)
// LUGAR de cada luta (eventos e scripts são binários — scripts/lib/gen4-dp-field.mjs e gen4-dp-script.mjs):
//   • objeto do mapa com script 3000 + n − 1 (luta simples) ou 5000 + n − 1 (dupla) → treinador n (faixas do carregador de
//     scripts, arm9/asm/unk_02038C78.s; conferido: Route 202 = Tristan/Logan/Natalie, ginásio de Oreburgh = Jonathon/Darius)
//   • no script do mapa: StartTrainerBattle (0xE5) A, B; StartFirstBattle (0x125); StartTagBattle (0x2A0) _, A, B
// Rival ↔ inicial do JOGADOR: GetPlayerStarterSpecies (0xDE) VAR → CompareVarToValue VAR, SPECIES + GoToIf → o bloco de cada
// ramo tem o StartTrainerBattle do time daquele caso (mesma leitura do Platinum, em bytecode).
// Uso: node scripts/build-trainers-dp.mjs <jogo>
import { readFileSync, writeFileSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { likelyMoveset, family } from '../public/engine.mjs';
import { loadDp } from './lib/gen4-dp.mjs';
import { loadDpField, dpLabel, loadStarters } from './lib/gen4-dp-field.mjs';
import { CMD } from './lib/gen4-dp-script.mjs';

const gameId = process.argv[2] ?? 'diamond-pearl';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const g = loadDp(root);
const F = loadDpField(root);
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const monOf = (c) => data.pokemon.find((p) => p.id === g.speciesId[c]);
const title = (s) => s.toLowerCase().replace(/(^|[\s.&-])([a-zé])/g, (m, a, b) => a + b.toUpperCase());
const tr = JSON.parse(read('files/poketool/trainer/trdata.json')).trdata;
const consts = [...read('include/constants/trainers.h').matchAll(/#define (TRAINER_\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]);
const constOf = Object.fromEntries(consts.map(([c, n]) => [n, c]));
const isVar = (v) => v >= 0x4000; // argumento que é variável (0x4000+, 0x8000+), não um valor

// ---- 1) lugar: eventos (objetos) e scripts (comandos de batalha), cada arquivo pelo 1º mapa que o usa
const where = {}; // n → Set(rótulo)
const add = (n, h) => { if (n && !isVar(n) && tr[n]) (where[n] ??= new Set()).add(dpLabel(h)); };
const seenEv = new Set(), seenScr = new Set();
const forStarter = {};
const STARTERS = { [g.speciesId.SPECIES_TURTWIG]: 'turtwig', [g.speciesId.SPECIES_CHIMCHAR]: 'chimchar', [g.speciesId.SPECIES_PIPLUP]: 'piplup' };
for (const h of F.headers) {
  if (!seenEv.has(h.events)) {
    seenEv.add(h.events);
    for (const o of F.events(h)?.objects ?? []) {
      if (o.script >= 3000 && o.script < 5000) add(o.script - 2999, h);
      else if (o.script >= 5000 && o.script < 7000) add(o.script - 4999, h);
    }
  }
  if (seenScr.has(h.scripts)) continue;
  seenScr.add(h.scripts);
  const s = F.script(h);
  if (!s) continue;
  for (const c of s.code.values()) {
    if (c.op === 0xe5) { add(c.args.readUInt16LE(0), h); add(c.args.readUInt16LE(2), h); }
    if (c.op === 0x125) add(c.args.readUInt16LE(0), h);
    if (c.op === 0x2a0) { add(c.args.readUInt16LE(2), h); add(c.args.readUInt16LE(4), h); }
  }
  // desvio pelo inicial: GetPlayerStarterSpecies VAR; (CompareVarToValue VAR, SPECIES; GoToIf igual, ramo)…; GoTo padrão
  const next = (c) => s.code.get(c.at + 2 + c.args.length);
  const target = (c, k) => c.at + 2 + c.args.length + c.args.readInt32LE(k);
  for (const c of s.code.values()) {
    if (c.op !== 0xde) continue;
    const v = c.args.readUInt16LE(0);
    const branches = [];
    let x = next(c);
    while (x?.op === 0x11 && x.args.readUInt16LE(0) === v) {
      const j = next(x);
      if (j?.op !== CMD.GOTOIF || j.args[0] !== 1) break; // 1 = igual (sScriptConditionTable)
      branches.push({ sp: STARTERS[x.args.readUInt16LE(2)], at: target(j, 1) });
      x = next(j);
    }
    if (!branches.length) continue;
    const rest = Object.values(STARTERS).find((sp) => !branches.some((b) => b.sp === sp));
    if (x?.op === CMD.GOTO) branches.push({ sp: rest, at: target(x, 0) });
    else if (x) branches.push({ sp: rest, at: x.at });
    for (const b of branches) {
      // bloco do ramo: segue em linha (e pelos GoTo) até o 1º StartTrainerBattle, sem entrar em desvios condicionais
      let p = s.code.get(b.at);
      for (let k = 0; p && k < 40; k++) {
        if (p.op === 0xe5) { for (const n of [p.args.readUInt16LE(0), p.args.readUInt16LE(2)]) if (/^TRAINER_PKMN_TRAINER_BARRY/.test(constOf[n] ?? '')) forStarter[n] = [b.sp]; break; }
        if (p.op === CMD.END || p.op === CMD.RETURN) break;
        p = p.op === CMD.GOTO ? s.code.get(target(p, 0)) : next(p);
      }
    }
  }
}

// ---- 2) times
const BOSS = { LEADER: 'Líderes de ginásio', ELITE_FOUR: 'Elite dos Quatro', CHAMPION: 'Campeão' };
// iniciais do próprio jogo (overlay 64) — o time do Barry é rotulado pelo inicial que ELE leva
const starterFam = new Map(loadStarters(root).map((id) => data.pokemon.find((p) => p.id === id)).map((m) => [family(data, m), m.name]));
const out = [], unplaced = [];
for (const [c, n] of consts) {
  const j = tr[n];
  if (!j?.party?.length) continue;
  if (!where[n]) { unplaced.push(c); continue; }
  const kind = c.match(/^TRAINER_(LEADER|ELITE_FOUR|CHAMPION)_/)?.[1];
  const rival = /^TRAINER_PKMN_TRAINER_BARRY_/.test(c);
  const party = j.party.map((p) => {
    const mon = monOf(p.species);
    const explicit = p.moves?.map((m) => moveIdOf.get(g.moveId[m])).filter(Boolean);
    return { species: mon.name, level: p.level, item: p.item && p.item !== 'ITEM_NONE' ? title(p.item.replace(/^ITEM_/, '').replace(/_/g, ' ')) : null,
      iv: Math.floor(((p.difficulty ?? 0) * 31) / 255), moves: explicit?.length ? explicit : likelyMoveset(mon, p.level), defaultMoves: !explicit?.length };
  });
  const cls = title(j.class.replace(/^TRAINER_CLASS_/, '').replace(/_(MALE|FEMALE)$/, '').replace(/_/g, ' '));
  const name = rival ? 'Barry' : j.name.replace('{TRNAME}', '').trim();
  const carried = rival ? party.map((p) => starterFam.get(family(data, data.pokemon.find((x) => x.name === p.species)))).find(Boolean) : null;
  // rótulo = cargo + nome (a classe TRAINER_CLASS_ELITE_FOUR_LUCIEN tem o nome grafado errado no decomp)
  const label = rival ? 'Rival Barry' : kind ? `${title(kind.replace(/_/g, ' '))} ${name}` : cls.toLowerCase().endsWith(name.toLowerCase()) ? cls : `${cls} ${name}`;
  out.push({ key: c, name, label, class: cls, group: rival ? 'Rival' : BOSS[kind] ?? 'Treinadores comuns', double: !!j.doubleBattle, map: [...where[n]], party,
    ...(rival && carried && { carries: carried }), ...(forStarter[n] && { forStarter: forStarter[n] }), ...(/_\d+$/.test(c) && !rival && kind && { rematch: true }) });
}
// lutas sem desvio no script (Fight Area: o time vem de outra lógica): a relação "inicial do Barry → inicial do jogador"
// lida nos desvios acima (Turtwig ↔ Piplup, Chimchar ↔ Turtwig, Piplup ↔ Chimchar) — só se for a mesma em todos os ramos
const rel = {};
for (const t of out.filter((x) => x.forStarter && x.carries)) (rel[t.carries] ??= new Set()).add(t.forStarter[0]);
if (Object.keys(rel).length !== 3 || Object.values(rel).some((s) => s.size !== 1)) throw new Error(`relação inicial do rival × jogador inconsistente: ${JSON.stringify(Object.fromEntries(Object.entries(rel).map(([k, v]) => [k, [...v]])))}`);
for (const t of out.filter((x) => x.group === 'Rival' && !x.forStarter && x.carries)) { t.forStarter = [[...rel[t.carries]][0]]; t.forStarterBy = 'relação dos outros desvios'; }
writeFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, trainers: out, unplaced }));
const by = out.reduce((a, t) => ((a[t.group] = (a[t.group] ?? 0) + 1), a), {});
console.log(`[${gameId}] ${out.length} treinadores ${JSON.stringify(by)}; rivais com inicial ${out.filter((t) => t.forStarter).length}/${out.filter((t) => t.group === 'Rival').length}; revanches ${out.filter((t) => t.rematch).length}; ${unplaced.length} sem lugar (ex.: ${unplaced.slice(0, 10).join(' ')})`);
