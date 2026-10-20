// Treinadores de Black 2 / White 2 a partir do decomp fuddlesworth/pokebw2 → public/data/<jogo>-trainers.json
//   generated/trainers.txt            ordem dos ids TRAINER_* (TRAINER_NONE = 0)
//   res/trainers/data/<x>.json        name, class, battle_style, party [{ species, level, difficulty, item, moves }]
//                                     iv = difficulty·31/255 (o mesmo cálculo da Gen 4)
// LUGAR de cada luta:
//   • NPC do mapa com script 3000 + n (simples) ou 5000 + n (dupla) → treinador n (src/ov012/trainer_script.c:
//     "scriptId - 0xbb8" / "- 0x1388")
//   • no script do mapa: CallTrainerBattle A, B, flags; CallTrainerMultiBattle PARCEIRO, A, B, flags (o 1º é o aliado —
//     src/ov036/scrcmd_trainer.c)
// Rival ↔ inicial do JOGADOR: a escolha grava EVENT_WORK_0x4030 = 0/1/2 junto com a espécie (aspertia_city.s); a luta testa
// a mesma variável. 🧪 VMJumpIf CMP_STACK SALTA quando a comparação é FALSA (s001F_VMJumpIf: "if (VM_StackPop(vm) != 1)
// VM_Jump"), ao contrário do comentário de include/constants/field_script.h: o bloco logo depois do teste é o caso "igual".
// Uso: node scripts/build-trainers-gen5.mjs <jogo>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { likelyMoveset } from '../public/engine.mjs';
import { loadBw2, loadBw2Field, constList, zoneLabel } from './lib/gen5-bw2.mjs';

const gameId = process.argv[2] ?? 'black-2-white-2';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const g = loadBw2(root);
const F = loadBw2Field(root);
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const monOf = (c) => data.pokemon.find((p) => p.id === (typeof c === 'number' ? c : g.speciesId[c]));
const title = (s) => s.toLowerCase().replace(/(^|[\s.&-])([a-zé])/g, (m, a, b) => a + b.toUpperCase());
const trainerList = constList(root, 'trainers');
const trainerId = Object.fromEntries(trainerList.map((c, i) => [c, i]));
const num = (a) => (/^\d+$/.test(a) ? Number(a) : trainerId[a] ?? g.speciesId[a] ?? null);
const isVar = (v) => v == null || v >= 0x4000;

// ---- 1) lugar
const where = {}; // n → Set(rótulo)
const add = (n, z) => { if (!isVar(n) && n > 0) (where[n] ??= new Set()).add(zoneLabel(z, F.zone(z))); };
const forStarter = {};
const seenScripts = new Set();
// inicial ↔ valor de EVENT_WORK_0x4030 (a escolha grava os dois no mesmo bloco)
const starterOfVar = {};
for (const z of F.zones) {
  const zone = F.zone(z);
  for (const o of F.events(z)?.npcs ?? []) {
    if (o.script >= 3000 && o.script < 5000) add(o.script - 3000, z);
    else if (o.script >= 5000 && o.script < 7000) add(o.script - 5000, z);
  }
  if (!zone.scripts || seenScripts.has(zone.scripts)) continue;
  seenScripts.add(zone.scripts);
  const s = F.script(zone.scripts);
  if (!s) continue;
  for (const lines of s.labels.values()) {
    lines.forEach((l, i) => {
      if (l.cmd === 'CallTrainerBattle') { add(num(l.args[0]), z); add(num(l.args[1]), z); }
      if (l.cmd === 'CallTrainerMultiBattle') { add(num(l.args[1]), z); add(num(l.args[2]), z); }
      if (l.cmd === 'WorkSetConst' && l.args[0] === 'EVENT_WORK_0x4030') {
        const sp = lines.slice(i + 1, i + 6).find((x) => x.cmd === 'WorkSetConst' && x.args[0] === '0x8025');
        if (sp) starterOfVar[l.args[1]] = monOf(num(sp.args[1]))?.name;
      }
    });
  }
}
// ramos do rival: "VMStackPush EVENT_WORK_0x4030; VMStackPushConst k; VMStackCmp CMP_EQ; VMJumpIf CMP_STACK, L" → as linhas
// seguintes (até VMJump/VMEnd) são o caso 0x4030 == k; o alvo L testa o próximo valor e o último bloco é o que sobrou
const rivalBranches = (lines, labels) => {
  const out = [];
  const tested = new Set();
  const walk = (ls, depth) => {
    if (!ls || depth > 6) return;
    for (let i = 0; i + 3 < ls.length; i++) {
      const [a, b, c, d] = ls.slice(i, i + 4);
      if (a.cmd === 'VMStackPush' && a.args[0] === 'EVENT_WORK_0x4030' && b.cmd === 'VMStackPushConst' && c.cmd === 'VMStackCmp' && c.args[0] === 'CMP_EQ' && d.cmd === 'VMJumpIf') {
        const k = b.args[0];
        tested.add(k);
        const body = [];
        for (const x of ls.slice(i + 4)) { if (['VMJump', 'VMEnd', 'VMReturn'].includes(x.cmd)) break; body.push(x); }
        for (const x of body) if (x.cmd === 'CallTrainerBattle') out.push({ k, trainer: num(x.args[0]) });
        walk(labels.get(d.args[1]), depth + 1);
        // o alvo do último teste é o "senão": o valor que não foi testado
        const target = labels.get(d.args[1]);
        if (target && !target.some((x) => x.cmd === 'VMStackPush' && x.args[0] === 'EVENT_WORK_0x4030')) {
          const rest = ['0', '1', '2'].find((v) => !tested.has(v));
          for (const x of target) { if (['VMJump', 'VMEnd', 'VMReturn'].includes(x.cmd)) break; if (x.cmd === 'CallTrainerBattle' && rest) out.push({ k: rest, trainer: num(x.args[0]) }); }
        }
        return;
      }
    }
  };
  walk(lines, 0);
  return out;
};
for (const c of seenScripts) {
  const s = F.script(c);
  if (!s) continue;
  // a cadeia só se lê do COMEÇO: um rótulo que é alvo de um teste de 0x4030 é o meio dela (o "senão" sairia errado)
  const inner = new Set();
  for (const lines of s.labels.values()) lines.forEach((x, i) => { if (x.cmd === 'VMJumpIf' && lines[i - 3]?.args[0] === 'EVENT_WORK_0x4030') inner.add(x.args[1]); });
  for (const [label, lines] of s.labels) if (!inner.has(label)) for (const { k, trainer } of rivalBranches(lines, s.labels)) if (/^TRAINER_RIVAL/.test(trainerList[trainer] ?? '') && starterOfVar[k]) forStarter[trainer] = [starterOfVar[k]];
}

// ---- 2) times
const GROUP = (cls) => (/^TRAINER_CLASS_LEADER_/.test(cls) ? 'Líderes de ginásio' : /^TRAINER_CLASS_ELITE_FOUR_/.test(cls) ? 'Elite dos Quatro' : cls === 'TRAINER_CLASS_CHAMPION' ? 'Campeão'
  : cls === 'TRAINER_CLASS_PKMN_TRAINER_RIVAL' ? 'Rival' : /^TRAINER_CLASS_TEAM_PLASMA/.test(cls) ? 'Equipe Plasma' : 'Treinadores comuns');
const out = [], unplaced = [];
trainerList.forEach((c, n) => {
  if (!n) return;
  const f = new URL(`res/trainers/data/${c.replace(/^TRAINER_/, '').toLowerCase()}.json`, root);
  if (!existsSync(f)) return;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  if (!j.party?.length) return;
  if (!where[n]) { unplaced.push(c); return; }
  const party = j.party.map((p) => {
    const mon = monOf(p.species);
    const explicit = p.moves?.map((m) => moveIdOf.get(g.moveId[m])).filter(Boolean);
    return { species: mon.name, level: p.level, item: p.item && p.item !== 'ITEM_NONE' ? title(p.item.replace(/^ITEM_/, '').replace(/_/g, ' ')) : null,
      iv: Math.floor(((p.difficulty ?? 0) * 31) / 255), moves: explicit?.length ? explicit : likelyMoveset(mon, p.level), defaultMoves: !explicit?.length };
  });
  const cls = title(j.class.replace(/^TRAINER_CLASS_/, '').replace(/^PKMN_TRAINER_/, '').replace(/_\d+$/, '').replace(/_(M|F)$/, '').replace(/_/g, ' '));
  const group = GROUP(j.class);
  const name = j.name;
  const label = group === 'Rival' ? (name === 'Rival' ? 'Rival' : `Rival ${name}`) : cls.toLowerCase().endsWith(name.toLowerCase()) ? cls : `${cls} ${name}`;
  out.push({ key: c, name, label, class: cls, group, double: j.battle_style !== 'BTL_STYLE_SINGLE', map: [...where[n]], party,
    ...(forStarter[n] && { forStarter: forStarter[n] }), ...(/_\d+$/.test(c) && group !== 'Rival' && /Líderes|Elite|Campeão/.test(group) && { rematch: true }) });
});
writeFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, trainers: out, unplaced }));
const by = out.reduce((a, t) => ((a[t.group] = (a[t.group] ?? 0) + 1), a), {});
console.log(`[${gameId}] ${out.length} treinadores ${JSON.stringify(by)}; inicial ↔ 0x4030 ${JSON.stringify(starterOfVar)}; rivais com inicial ${out.filter((t) => t.forStarter).length}/${out.filter((t) => t.group === 'Rival').length}; ${unplaced.length} sem lugar (ex.: ${unplaced.slice(0, 10).join(' ')})`);
