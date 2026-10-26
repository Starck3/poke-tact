// Cálculo de dano e de "golpes para nocautear" por geração — puro (navegador e Node). R2 do docs/PLANO.md.
// Tudo conferido no código dos jogos (ver docs/ADICIONAR-JOGO.md, "Fórmula de dano"):
//   Gen 1  pokered engine/battle/core.asm   CalculateDamage / AdjustDamageForMoveType / RandomizeDamage / ApplyBadgeStatBoosts
//   Gen 2  pokecrystal engine/battle/effect_commands.asm BattleCommand_DamageCalc / _Stab / _DamageVariation; core.asm BadgeStatBoosts
//   Gen 3  pokeemerald/pokefirered src/pokemon.c CalculateBaseDamage (+ battle_main.c: bônus de Velocidade da insígnia 3)
// base = ⌊⌊⌊2L/5+2⌋·Poder·A/D⌋/50⌋ (+2; Gen 1–2 com teto 997 antes do +2) → STAB ×1,5 → tipo → aleatório
// (Gen 1–2: 217–255/255; Gen 3: 85–100%). O ranking usa o dano MÉDIO, sem crítico.
import { effectiveness } from './engine.mjs';

// Atributos no nível. Gen 1–2: ⌊((B+DV)·2 + ⌊√statExp/4⌋)·L/100⌋+5 (PS: +L+10); Gen 3: ⌊(2B+IV+EV/4)·L/100⌋+5 (PS: +L+10).
// Seu Pokémon: DV 8 / IV 15 e sem EV/stat exp (valor médio, conservador); natureza neutra.
// dvs (Gen 1–2): { attack, defense, speed, special }; PS DV = bit baixo de cada um (atk·8 + def·4 + spd·2 + spc).
export function statsAt(gen, mon, level, { dvs = null, iv = null } = {}) {
  const b = mon.stats;
  if (gen <= 2) {
    const d = dvs ?? { attack: 8, defense: 8, speed: 8, special: 8 };
    const hpDv = ((d.attack & 1) << 3) | ((d.defense & 1) << 2) | ((d.speed & 1) << 1) | (d.special & 1);
    const st = (base, dv) => Math.floor(((base + dv) * 2 * level) / 100) + 5;
    return {
      hp: Math.floor(((b.hp + hpDv) * 2 * level) / 100) + level + 10,
      attack: st(b.attack, d.attack), defense: st(b.defense, d.defense), speed: st(b.speed, d.speed),
      'special-attack': st(b['special-attack'], d.special), 'special-defense': st(b['special-defense'], d.special),
    };
  }
  const i = iv ?? 15;
  const st = (base) => Math.floor(((2 * base + i) * level) / 100) + 5;
  return { hp: Math.floor(((2 * b.hp + i) * level) / 100) + level + 10, attack: st(b.attack), defense: st(b.defense), speed: st(b.speed), 'special-attack': st(b['special-attack']), 'special-defense': st(b['special-defense']) };
}

// Bônus de insígnia do JOGADOR (não vale para o oponente). Por nome (Gen 1–2) ou nº (Gen 3) da insígnia.
const BADGE_BOOST = {
  1: { BOULDER: ['attack'], THUNDER: ['defense'], SOUL: ['speed'], VOLCANO: ['special-attack', 'special-defense'] }, // ×9/8
  2: { ZEPHYR: ['attack'], PLAIN: ['speed'], MINERAL: ['defense'], GLACIER: ['special-attack'] }, // ×9/8 (SpDef da Glacier: código com bug)
  3: { 1: ['attack'], 3: ['speed'], 5: ['defense'], 7: ['special-attack', 'special-defense'] }, // ×1,1
};
/** progress: acquisition.progress (badges + leaderOrder); stage: insígnias (na ordem do detonado). */
export function badgeBoost(gen, stats, progress, stage) {
  if (stage == null || !progress?.badges?.length) return stats;
  const owned = new Set((progress.leaderOrder ?? []).slice(0, Math.min(stage, 8)).map((n) => n.toUpperCase()));
  const out = { ...stats };
  for (const b of progress.badges) {
    if (!b.leader || !owned.has(b.leader.toUpperCase())) continue;
    for (const k of BADGE_BOOST[gen]?.[gen <= 2 ? b.name : b.n] ?? []) out[k] = gen <= 2 ? out[k] + Math.floor(out[k] / 8) : Math.floor((out[k] * 110) / 100);
  }
  return out;
}

// Casos especiais pelo efeito do golpe (texto de efeito da PokéAPI + nome). Valor indeterminável → fora do ranking.
const FIXED = { 'dragon-rage': () => 40, 'sonic-boom': () => 20, 'seismic-toss': (L) => L, 'night-shade': (L) => L };
const EXCLUDE = new Set(['psywave', 'super-fang', 'focus-punch', 'dream-eater', 'fake-out', 'snore', 'spit-up', 'last-resort', 'bide', 'counter', 'mirror-coat', 'present', 'magnitude', 'beat-up', 'hidden-power', 'false-swipe', 'endeavor', 'future-sight', 'doom-desire']);
export function moveProfile(data, name) {
  const mv = data.moves[name];
  const eff = (mv?.effect ?? '').toLowerCase();
  if (!mv || mv.category === 'status' || EXCLUDE.has(name) || /one-hit ko/.test(eff)) return null;
  if (FIXED[name]) return { fixed: FIXED[name], hits: 1, turns: 1 };
  if (!mv.power || mv.power <= 1) return null; // poder variável (Return, Low Kick, Flail…)
  const hits = name === 'triple-kick' ? 6 : /hits 2-5 times/.test(eff) ? 3 : /hits (twice|three times)/.test(eff) ? (/three/.test(eff) ? 3 : 2) : 1;
  const turns = /charge|hits next turn|recharge/.test(eff) ? 2 : 1; // dois turnos ou recarga: metade por turno
  // poder dobra a cada uso seguido: Rollout/Ice Ball até 5 usos e recomeça (pokecrystal rollout.asm, MAX_ROLLOUT_COUNT 5);
  // Fury Cutter para em 16× (fury_cutter.asm: "capped at 5 turns' worth")
  const escalate = name === 'rollout' || name === 'ice-ball' ? 'reset' : name === 'fury-cutter' ? 'cap' : null;
  return { hits, turns, escalate, recharge: /recharge/.test(eff), selfKo: /user faints/.test(eff) };
}

const rand = (gen) => (gen <= 2 ? (217 + 255) / 2 / 255 : 0.925); // média da variação aleatória

/**
 * Dano médio de UM uso do golpe. att/def: { mon, level, stats }. Retorna null se o golpe não entra no ranking.
 * Tipo: multiplicadores da tabela da geração (produto); STAB 1,5; categoria pelo dataset (Gen ≤ 3: pelo tipo).
 */
// opts.zPower: o golpe Z feito a partir deste golpe — poder do Z, um golpe só, sem carregar/recarregar e sem errar
export function damage(data, gen, att, def, name, { zPower = null } = {}) {
  let p = moveProfile(data, name);
  if (!p) return null;
  if (zPower) { if (p.fixed || p.selfKo) return null; p = { hits: 1, turns: 1 }; }
  const mv = data.moves[name];
  const typeMul = effectiveness(data, mv.type, def.mon);
  if (p.fixed) return { per: typeMul === 0 ? 0 : p.fixed(att.level), ...p, typeMul };
  const phys = mv.category === 'physical';
  let A = att.stats[phys ? 'attack' : 'special-attack'], D = def.stats[phys ? 'defense' : 'special-defense'];
  if (p.selfKo) D = Math.max(1, Math.floor(D / 2)); // Explosion/Self-Destruct dividem a defesa (Gen 1–3)
  if (gen <= 2 && (A > 255 || D > 255)) { A = Math.max(1, Math.floor(A / 4)); D = Math.max(1, Math.floor(D / 4)); }
  // terastalizado: golpe do tipo Tera com poder < 60, sem prioridade e de um golpe só, vai a 60 (battle-actions.ts)
  const power = zPower ?? (att.mon.teraType === mv.type && mv.power < 60 && (mv.priority ?? 0) <= 0 && p.hits === 1 ? 60 : mv.power);
  let dmg = Math.floor(Math.floor(Math.floor((2 * att.level) / 5 + 2) * power * A / D) / 50);
  if (gen <= 2) dmg = Math.min(dmg, 997);
  dmg += 2;
  // STAB; terastalizado (Gen 9, Showdown battle-actions.ts): vale para os tipos originais e o Tera; 2× quando o tipo
  // Tera é um dos originais
  const tera = att.mon.teraType, own = att.mon.baseTypes ?? att.mon.types;
  if (tera && tera === mv.type && own.includes(tera)) dmg = Math.floor(dmg * 2);
  else if (att.mon.types.includes(mv.type) || own.includes(mv.type)) dmg = Math.floor(dmg * 1.5);
  dmg = Math.floor(dmg * typeMul);
  const per = dmg * rand(gen) * p.hits * (zPower ? 1 : (mv.accuracy ?? 100) / 100);
  return { per, ...p, typeMul };
}

/** Turnos esperados para nocautear (∞ se não causa dano). Recarga só pesa se precisar de mais de um golpe. */
export function turnsToKo(d, hp) {
  if (!d || d.per <= 0) return Infinity;
  const n = Math.ceil(hp / d.per);
  if (d.escalate) { // soma 1×, 2×, 4×, 8×, 16× (e recomeça ou fica em 16×)
    let sum = 0;
    for (let t = 1; t <= 50; t++) { const k = d.escalate === 'reset' ? (t - 1) % 5 : Math.min(t - 1, 4); sum += d.per * 2 ** k; if (sum >= hp) return t; }
    return Infinity;
  }
  if (d.selfKo) return n === 1 ? 1 : Infinity; // autodestruição só vale se nocauteia de uma vez
  if (d.recharge) return n === 1 ? 1 : n * 2 - 1; // Hyper Beam: recarrega entre os golpes
  return n * d.turns;
}

/** Melhor golpe de `moves` contra `def` (menos turnos; empate → mais dano). */
export function bestAgainst(data, gen, att, def, moves) {
  let best = null;
  for (const name of moves) {
    const d = damage(data, gen, att, def, name);
    if (!d) continue;
    const t = turnsToKo(d, def.stats.hp);
    if (!best || t < best.turns || (t === best.turns && d.per > best.dmg.per)) best = { name, dmg: d, turns: t };
  }
  // golpe Z (att.zTypes = tipos com Z-Crystal): um por luta — o 1º golpe vira Z e os seguintes são o melhor golpe normal.
  // Só fica se nocauteia em menos turnos (empate: o normal, que não gasta o Z)
  // att.zMoveOnly: chefe com golpe Z marcado na Bulbapedia (Hala: Power-Up Punch → All-Out Pummeling) — só esse golpe vira Z
  if (best && (att.zTypes?.size || att.zMoveOnly)) for (const name of moves) {
    const mv = data.moves[name];
    if (!mv?.zPower || (att.zMoveOnly ? name !== att.zMoveOnly : !att.zTypes.has(mv.type))) continue;
    const z = damage(data, gen, att, def, name, { zPower: mv.zPower });
    if (!z || z.per <= 0) continue;
    const t = z.per >= def.stats.hp ? 1 : 1 + turnsToKo(best.dmg, def.stats.hp - z.per);
    if (t < best.turns) best = { ...best, turns: t, z: { name, power: mv.zPower, type: mv.type, dmg: z } };
  }
  return best;
}

/**
 * Troca de golpes (1 contra 1): quantos turnos cada lado precisa e quem age primeiro (Velocidade; empate = 50%).
 * win: eu nocauteio antes de ser nocauteado. margin: turnos dele ÷ meus (quanto maior, mais folgado).
 */
// Dynamax (Sword/Shield; Showdown data/conditions.ts): 3 turnos; vida × (1,5 + 0,05 × nível de Dynamax) — o detonado não dá
// o nível, então vale o 0 (1,5×, o de quem você captura); ao acabar, a vida volta na mesma proporção. Golpes viram Max
// (poder maxPower, um golpe só, não erram — mesma conta do golpe Z em damage()); efeitos de clima/atributo ficam fora
export const DYNAMAX_TURNS = 3, DYNAMAX_HP = 1.5;
/** Melhor golpe Max (maior dano) de `moves` contra `def`. */
function bestMax(data, gen, att, def, moves) {
  let best = null;
  for (const name of moves) {
    const mv = data.moves[name];
    if (!mv?.maxPower) continue;
    const d = damage(data, gen, att, def, name, { zPower: mv.maxPower });
    if (d && d.per > 0 && (!best || d.per > best.dmg.per)) best = { name, power: mv.maxPower, dmg: d };
  }
  return best;
}
/** Turnos para nocautear com Dynamax de um lado ou dos dois: turno a turno, a fração de vida que cada golpe tira. */
function dynamaxTurns(reg, max, hp, attDyn, defDyn) {
  let left = 1;
  for (let t = 1; t <= 60; t++) {
    const d = attDyn && t <= DYNAMAX_TURNS && max ? max.dmg : reg?.dmg;
    const per = d ? d.per / (d.turns ?? 1) : 0;
    left -= per / (defDyn && t <= DYNAMAX_TURNS ? hp * DYNAMAX_HP : hp);
    if (left <= 1e-9) return t;
  }
  return Infinity;
}

export function duel(data, gen, me, opp, myMoves, oppMoves) {
  const mine = bestAgainst(data, gen, me, opp, myMoves);
  const theirs = bestAgainst(data, gen, opp, me, oppMoves);
  let myT = mine?.turns ?? Infinity, theirT = theirs?.turns ?? Infinity;
  let dyn = null;
  if (me.dynamax || opp.dynamax) {
    const myMax = me.dynamax ? bestMax(data, gen, me, opp, myMoves) : null, theirMax = opp.dynamax ? bestMax(data, gen, opp, me, oppMoves) : null;
    myT = dynamaxTurns(mine, myMax, opp.stats.hp, !!me.dynamax, !!opp.dynamax);
    theirT = dynamaxTurns(theirs, theirMax, me.stats.hp, !!opp.dynamax, !!me.dynamax);
    if (myMax) dyn = { name: myMax.name, power: myMax.power, type: data.moves[myMax.name].type };
  }
  // me.speedTurn1 (Mega na Gen 6): no turno em que evolui, a ordem usa a Velocidade de antes — só decide se a troca acaba
  // no 1º turno para os dois; do 2º turno em diante vale a da Mega
  const both1 = myT === 1 && theirT === 1;
  const sp = me.speedTurn1 != null && both1 ? me.speedTurn1 : me.stats.speed, osp = opp.speedTurn1 != null && both1 ? opp.speedTurn1 : opp.stats.speed;
  const faster = sp > osp ? 1 : sp === osp ? 0.5 : 0;
  const win = myT === Infinity ? false : faster === 1 ? myT <= theirT : faster === 0.5 ? myT < theirT || (myT === theirT) : myT < theirT;
  return { move: mine?.name ?? null, myTurns: myT, theirMove: theirs?.name ?? null, theirTurns: theirT, faster, win, margin: myT === Infinity ? 0 : theirT === Infinity ? 99 : theirT / myT, myDmg: mine?.dmg ?? null, theirDmg: theirs?.dmg ?? null, z: mine?.z ?? null, dynamax: dyn };
}
