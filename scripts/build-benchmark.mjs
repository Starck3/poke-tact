// R0/R1 — Banco de lutas de referência para medir a recomendação (ver docs/PLANO.md, seção R).
// Lutas: líderes, Elite, Campeão e rivais de cada jogo com detonado, no ESTÁGIO em que acontecem (do detonado gerado, com o
// estágio da luta pelo time) e com o nível do seu time = nível do ás do oponente. Para cada Pokémon do oponente: as 3
// sugestões e a TROCA DE GOLPES de cada uma (public/battle.mjs: turnos para nocautear, quem age primeiro, vence ou não).
// "antes": as sugestões gravadas em reports/benchmark/antes/ são reavaliadas com a mesma fórmula (comparação justa).
// Uso: node scripts/build-benchmark.mjs [jogo ...]  → reports/benchmark/<jogo>.json e resumo no console
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { recommend, effectiveness, availableMoves } from '../public/engine.mjs';
import { statsAt, badgeBoost, duel } from '../public/battle.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const has = (f) => existsSync(new URL(`../public/data/${f}`, import.meta.url));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GAMES).filter((g) => has(`${g}-walkthrough.json`));
const DELTA = Number(process.env.BENCH_DELTA ?? 0); // níveis abaixo do ás do oponente
const IMPORTANT = new Set(['Líderes de ginásio', 'Elite dos Quatro', 'Campeão', 'Rival']);

/** Reavalia UMA sugestão (Pokémon + golpe) contra o Pokémon do oponente com a fórmula de dano. */
export function evaluatePick(data, acq, monName, moveName, p, level, stage) {
  const gen = data.game.generation;
  const mon = data.pokemon.find((x) => x.name === monName), opp = data.pokemon.find((x) => x.name === p.species);
  const me = { mon, level, stats: badgeBoost(gen, statsAt(gen, mon, level), acq?.progress, stage) };
  const them = { mon: opp, level: p.level, stats: statsAt(gen, opp, p.level, { dvs: p.dvs ?? null, iv: p.iv ?? null }) };
  return duel(data, gen, me, them, [moveName], p.moves);
}

mkdirSync(new URL('../reports/benchmark/', import.meta.url), { recursive: true });
const total = { antes: { wins: 0, picks: 0, covered: 0, mons: 0, comfy: 0, turnsSum: 0, turnsN: 0 }, depois: { wins: 0, picks: 0, covered: 0, mons: 0, comfy: 0, turnsSum: 0, turnsN: 0 } };
for (const gameId of ids) {
  const data = load(`${gameId}.json`), acq = load(`${gameId}-acquisition.json`), walk = load(`${gameId}-walkthrough.json`);
  const trainers = new Map(load(`${gameId}-trainers.json`).trainers.map((t) => [t.key, t]));
  const starters = data.starters?.species?.length > 1 ? data.starters.species : [null];
  const beforeFile = new URL(`../reports/benchmark/antes/${gameId}.json`, import.meta.url);
  const before = existsSync(beforeFile) ? JSON.parse(readFileSync(beforeFile, 'utf8')) : null;
  const beforeKey = new Map((before?.fights ?? []).map((f) => [`${f.version}|${f.key}|${f.starter}`, f]));
  const fights = [];
  for (const [version, v] of Object.entries(walk.versions)) {
    for (const st of v.stages) {
      const list = [...(st.leader ? [{ key: st.leader.key, stage: st.stage }] : []), ...st.locations.flatMap((l) => l.trainers.filter((t) => IMPORTANT.has(t.group)).map((t) => ({ key: t.key, stage: st.stage })))];
      for (const { key, stage } of list) {
        const t = trainers.get(key);
        if (!t) continue;
        for (const starter of starters) {
          if (starter && t.forStarter && !t.forStarter.includes(starter)) continue;
          const level = Math.max(...t.party.map((p) => p.level)) - DELTA;
          const old = beforeKey.get(`${version}|${key}|${starter}`);
          const mons = t.party.map((p, i) => {
            const opp = data.pokemon.find((x) => x.name === p.species);
            const r = recommend(data, opp, { level, oppMoves: p.moves, oppLevel: p.level, oppDvs: p.dvs, oppIv: p.iv, version, onlyObtainable: true, fullyEvolvedOnly: false, includeLegendary: false, acq, stage, starter });
            const oldPicks = (old?.mons?.[i]?.picks ?? []).map((k) => ({ mon: k.mon, move: k.move, ...pickOut(evaluatePick(data, acq, k.mon, k.move, p, level, stage)) }));
            return {
              opp: p.species, level: p.level, moves: p.moves,
              superEffectiveAvailable: r.candidates.filter((c) => c.move.eff >= 2).length,
              winnersAvailable: r.candidates.filter((c) => c.duel.win).length, candidates: r.candidates.length,
              picks: r.picks.map((k) => ({ mon: k.mon.name, move: k.move.name, eff: k.move.eff, via: k.move.via?.method, stageNeeded: k.stageNeeded, ...pickOut(k.duel) })),
              before: oldPicks,
            };
          });
          fights.push({ version, key, label: t.label, group: t.group, stage, starter, level, mons });
        }
      }
    }
  }
  const rows = fights.flatMap((f) => f.mons);
  const sum = (sel) => {
    const ps = rows.flatMap(sel);
    const fin = ps.filter((p) => p.myTurns != null);
    return { mons: rows.length, covered: rows.filter((m) => sel(m).some((p) => p.win)).length, wins: ps.filter((p) => p.win).length, picks: ps.length,
      comfy: ps.filter((p) => p.win && (p.theirTurns == null || p.theirTurns >= p.myTurns + 2)).length, turnsSum: fin.reduce((a, p) => a + p.myTurns, 0), turnsN: fin.length };
  };
  const s = { fights: fights.length, depois: sum((m) => m.picks), antes: sum((m) => m.before), semVencedorPossivel: rows.filter((m) => !m.winnersAvailable).length };
  // jogo sem linha de base (antes/) não entra em nenhum dos dois totais — a comparação fica justa
  if (before) for (const k of ['antes', 'depois']) for (const f of Object.keys(total[k])) total[k][f] += s[k][f];
  writeFileSync(new URL(`../reports/benchmark/${gameId}.json`, import.meta.url), JSON.stringify({ game: gameId, summary: s, fights }, null, 1));
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const avg = (x) => (x.turnsN ? (x.turnsSum / x.turnsN).toFixed(2) : '—');
  console.log(`[${gameId}] ${s.fights} lutas | 1+ vence: ${pct(s.antes.covered, s.antes.mons)} → ${pct(s.depois.covered, s.depois.mons)} | vencem: ${pct(s.antes.wins, s.antes.picks)} → ${pct(s.depois.wins, s.depois.picks)} | folgadas: ${pct(s.antes.comfy, s.antes.picks)} → ${pct(s.depois.comfy, s.depois.picks)} | turnos p/ nocautear: ${avg(s.antes)} → ${avg(s.depois)} | sem vencedor possível: ${s.semVencedorPossivel}`);
}
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const avgT = (x) => (x.turnsN ? (x.turnsSum / x.turnsN).toFixed(2) : '—');
console.log(`TOTAL (time ${DELTA} nv abaixo) | 1+ vence: ${pct(total.antes.covered, total.antes.mons)} → ${pct(total.depois.covered, total.depois.mons)} | vencem: ${pct(total.antes.wins, total.antes.picks)} → ${pct(total.depois.wins, total.depois.picks)} | folgadas: ${pct(total.antes.comfy, total.antes.picks)} → ${pct(total.depois.comfy, total.depois.picks)} | turnos: ${avgT(total.antes)} → ${avgT(total.depois)}`);
writeFileSync(new URL(`../reports/benchmark/_total${DELTA ? '-' + DELTA : ''}.json`, import.meta.url), JSON.stringify(total, null, 1));

function pickOut(d) {
  return { win: d.win, myTurns: Number.isFinite(d.myTurns) ? d.myTurns : null, theirTurns: Number.isFinite(d.theirTurns) ? d.theirTurns : null, faster: d.faster, theirMove: d.theirMove };
}
