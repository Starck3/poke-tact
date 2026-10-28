// R0/R1 — Banco de lutas de referência para medir a recomendação (ver docs/PLANO.md, seção R).
// Lutas: líderes, Elite, Campeão e rivais de cada jogo com detonado, no ESTÁGIO em que acontecem (do detonado gerado, com o
// estágio da luta pelo time) e com o nível do seu time = nível do ás do oponente. Para cada Pokémon do oponente: as 3
// sugestões e a TROCA DE GOLPES de cada uma (public/battle.mjs: turnos para nocautear, quem age primeiro, vence ou não).
// "antes": as sugestões gravadas em reports/benchmark/antes/ são reavaliadas com a mesma fórmula (comparação justa).
// Uso: node scripts/build-benchmark.mjs [jogo ...]  → reports/benchmark/<jogo>.json e resumo no console
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { recommend, effectiveness, availableMoves, battleForm } from '../public/engine.mjs';
import { statsAt, badgeBoost, duel } from '../public/battle.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const has = (f) => existsSync(new URL(`../public/data/${f}`, import.meta.url));
// jogo sem detonado (Ultra Sun/Ultra Moon) entra pelos treinadores com estágio (Q3, 0.49.0)
const staged = (g) => has(`${g}-trainers.json`) && load(`${g}-trainers.json`).trainers.some((t) => t.stage != null);
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GAMES).filter((g) => has(`${g}-walkthrough.json`) || staged(g));
const DELTA = Number(process.env.BENCH_DELTA ?? 0); // níveis abaixo do ás do oponente
const IMPORTANT = new Set(['Líderes de ginásio', 'Partidas de promoção', 'Elite dos Quatro', 'Campeão', 'Rival']);

/** Reavalia UMA sugestão (Pokémon + golpe) contra o Pokémon do oponente com a fórmula de dano. */
export function evaluatePick(data, acq, monName, moveName, p, level, stage) {
  const gen = data.game.generation;
  const mon = data.pokemon.find((x) => x.name === monName), opp = battleForm(data.pokemon.find((x) => x.name === p.species), p);
  const me = { mon, level, stats: badgeBoost(gen, statsAt(gen, mon, level), acq?.progress, stage) };
  const them = { mon: opp, level: p.level, stats: statsAt(gen, opp, p.level, { dvs: p.dvs ?? null, iv: p.iv ?? null }) };
  return duel(data, gen, me, them, [moveName], p.moves);
}

mkdirSync(new URL('../reports/benchmark/', import.meta.url), { recursive: true });
// antes/depois: só jogos com linha de base (comparação justa); atual: TODOS os jogos do banco (o número da tela inicial)
const zero = () => ({ wins: 0, picks: 0, covered: 0, mons: 0, comfy: 0, turnsSum: 0, turnsN: 0 });
const total = { antes: zero(), depois: zero(), atual: { ...zero(), games: [] } };
for (const gameId of ids) {
  const data = load(`${gameId}.json`), acq = load(`${gameId}-acquisition.json`);
  const trainers = new Map(load(`${gameId}-trainers.json`).trainers.map((t) => [t.key, t]));
  // sem detonado: cada versão com os treinadores importantes no estágio deles (sem as lutas em que o treinador é parceiro)
  const walk = has(`${gameId}-walkthrough.json`) ? load(`${gameId}-walkthrough.json`) : { versions: Object.fromEntries(data.game.versions.map((v) => [v, { stages: [...new Set([...trainers.values()].filter((t) => t.stage != null).map((t) => t.stage))].sort((a, b) => a - b)
    .map((stage) => ({ stage, locations: [{ trainers: [...trainers.values()].filter((t) => t.stage === stage && !t.partner && t.party.every((p) => p.level > 0)) }] })) }])) };
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
            const opp = battleForm(data.pokemon.find((x) => x.name === p.species), p); // chefe que luta Mega (detonado)
            const r = recommend(data, opp, { level, oppMoves: p.moves, oppLevel: p.level, oppDvs: p.dvs, oppIv: p.iv, version, onlyObtainable: true, fullyEvolvedOnly: false, includeLegendary: false, acq, stage, starter, dynamaxBattle: t.party.some((x) => x.dynamax) });
            const oldPicks = (old?.mons?.[i]?.picks ?? []).map((k) => ({ mon: k.mon, move: k.move, ...pickOut(evaluatePick(data, acq, k.mon, k.move, p, level, stage)) }));
            return {
              opp: p.species, level: p.level, moves: p.moves,
              superEffectiveAvailable: r.candidates.filter((c) => c.move.eff >= 2).length,
              winnersAvailable: r.candidates.filter((c) => c.duel.win).length, candidates: r.candidates.length,
              picks: r.picks.map((k) => ({ mon: k.mon.name, move: k.move.name, eff: k.move.eff, via: k.move.via?.method, stageNeeded: k.stageNeeded, ...pickOut(k.duel), ...((u) => (u.length ? { uncertain: u } : {}))(uncertainty(data, acq, k, version, stage)) })),
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
  const unc = {};
  for (const p of rows.flatMap((m) => m.picks)) for (const r of p.uncertain ?? []) unc[r] = (unc[r] ?? 0) + 1;
  const s = { fights: fights.length, depois: sum((m) => m.picks), antes: sum((m) => m.before), semVencedorPossivel: rows.filter((m) => !m.winnersAvailable).length,
    incertas: rows.flatMap((m) => m.picks).filter((p) => p.uncertain).length, incertasPor: unc };
  // jogo sem linha de base (antes/) não entra em nenhum dos dois totais — a comparação fica justa
  if (before) for (const k of ['antes', 'depois']) for (const f of Object.keys(total[k])) total[k][f] += s[k][f];
  for (const f of Object.keys(zero())) total.atual[f] += s.depois[f];
  total.atual.games.push(gameId);
  writeFileSync(new URL(`../reports/benchmark/${gameId}.json`, import.meta.url), JSON.stringify({ game: gameId, summary: s, fights }, null, 1));
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const avg = (x) => (x.turnsN ? (x.turnsSum / x.turnsN).toFixed(2) : '—');
  console.log(`[${gameId}] ${s.fights} lutas | 1+ vence: ${pct(s.antes.covered, s.antes.mons)} → ${pct(s.depois.covered, s.depois.mons)} | vencem: ${pct(s.antes.wins, s.antes.picks)} → ${pct(s.depois.wins, s.depois.picks)} | folgadas: ${pct(s.antes.comfy, s.antes.picks)} → ${pct(s.depois.comfy, s.depois.picks)} | turnos p/ nocautear: ${avg(s.antes)} → ${avg(s.depois)} | sem vencedor possível: ${s.semVencedorPossivel} | dado incerto: ${s.incertas} ${JSON.stringify(unc)}`);
}
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const avgT = (x) => (x.turnsN ? (x.turnsSum / x.turnsN).toFixed(2) : '—');
console.log(`ATUAL (${total.atual.games.length} jogos) | 1+ vence: ${pct(total.atual.covered, total.atual.mons)} | vencem: ${pct(total.atual.wins, total.atual.picks)} (${total.atual.picks} sugestões) | folgadas: ${pct(total.atual.comfy, total.atual.picks)}`);
console.log(`TOTAL com linha de base (time ${DELTA} nv abaixo) | 1+ vence: ${pct(total.antes.covered, total.antes.mons)} → ${pct(total.depois.covered, total.depois.mons)} | vencem: ${pct(total.antes.wins, total.antes.picks)} → ${pct(total.depois.wins, total.depois.picks)} | folgadas: ${pct(total.antes.comfy, total.antes.picks)} → ${pct(total.depois.comfy, total.depois.picks)} | turnos: ${avgT(total.antes)} → ${avgT(total.depois)}`);
writeFileSync(new URL(`../reports/benchmark/_total${DELTA ? '-' + DELTA : ''}.json`, import.meta.url), JSON.stringify(total, null, 1));

/**
 * S1 (PLANO-EXECUCAO-6): o que a sugestão usa sem o app saber quando fica disponível — o banco "vence" mesmo assim, então
 * isso mede o risco de sugerir algo que ainda não existe naquele ponto (como o Armarouge na 1ª luta da Nemona):
 *   • item: a espécie só chega por evolução com item que não tem lugar/estágio nos dados
 *   • estimado: até esse estágio a espécie só aparece em fonte de estágio estimado pelo nível
 *   • tm / tutor: o golpe vem de TM ou tutor sem lugar conhecido
 */
export function uncertainty(data, acq, k, version, stage) {
  const out = [];
  const byId = new Map(data.pokemon.map((p) => [p.id, p]));
  const srcs = (m) => (acq.versions?.[version]?.[m.name] ?? []).filter((s) => s.type !== 'breed');
  const ok = (s) => stage == null || (s.stage ?? 0) <= stage;
  // a espécie (ou a pré-evolução de onde ela sai) tem fonte certa até aqui?
  let m = k.mon, chainItem = false, certain = false, estimated = false;
  for (let i = 0; m && i < 4; i++) {
    const here = srcs(m).filter(ok);
    if (here.some((s) => !s.stageEstimated)) { certain = true; break; }
    if (here.length) estimated = true;
    if (/ITEM/.test(m.evo?.kind ?? '') && typeof m.evo.param === 'string' && !(acq.items?.[m.evo.param]?.length)) chainItem = true;
    const p = byId.get(m.evolvesFrom);
    m = p && p.id !== m.id ? p : null;
  }
  if (!certain && chainItem) out.push('item');
  if (!certain && estimated) out.push('estimado');
  const via = k.move.via;
  if (via?.method === 'machine' && !via.source) out.push('tm');
  if (via?.method === 'tutor' && !via.source) out.push('tutor');
  return out;
}

function pickOut(d) {
  return { win: d.win, myTurns: Number.isFinite(d.myTurns) ? d.myTurns : null, theirTurns: Number.isFinite(d.theirTurns) ? d.theirTurns : null, faster: d.faster, theirMove: d.theirMove };
}
