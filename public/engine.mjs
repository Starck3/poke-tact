// Motor de recomendação — puro (sem DOM), roda no navegador e no Node (testes).
import { statsAt, badgeBoost, duel } from './battle.mjs';
// Tudo é derivado do dataset gerado por scripts/build-data.mjs; nenhum golpe/tipo é codificado aqui,
// exceto as listas de exclusão documentadas abaixo.

// Golpes com custo/condição que tornam o "dano bruto" enganoso numa sugestão automática.
export const UNRELIABLE_MOVES = new Set([
  'explosion', 'self-destruct', 'focus-punch', 'dream-eater', 'hyper-beam', 'blast-burn',
  'frenzy-plant', 'hydro-cannon', 'sky-attack', 'solar-beam', 'razor-wind', 'skull-bash',
  'fake-out', 'snore', 'spit-up', 'last-resort', 'superpower', 'overheat',
]);

// Com a fórmula de dano (battle.mjs) estes passam a contar com metade do dano por turno (dois turnos / recarga)
const TWO_TURN_OK = new Set(['hyper-beam', 'blast-burn', 'frenzy-plant', 'hydro-cannon', 'sky-attack', 'solar-beam', 'razor-wind', 'skull-bash']);

// Habilidades da Gen 3 que concedem imunidade total a um tipo.
const ABILITY_IMMUNITY = { levitate: 'ground', 'volt-absorb': 'electric', 'water-absorb': 'water', 'flash-fire': 'fire' };

export function effectiveness(data, atkType, defender) {
  let m = 1;
  for (const t of defender.types) m *= data.chart[atkType][t];
  const imm = defender.abilities.length > 0 && defender.abilities.every((a) => ABILITY_IMMUNITY[a] === atkType);
  return imm ? 0 : m;
}

// partes vazias são puladas: itens do decomp HGSS "GUARD_SPEC_" / "X_SP__DEF" derrubavam a aba Detonado inteira
const titleWords = (s) => s.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
// forma regional: "rattata-alola" → "Rattata de Alola"; "tauros-paldea-aqua-breed" → "Tauros de Paldea (Aqua Breed)"
export const humanize = (slug) => {
  const s = String(slug ?? '');
  const m = s.match(/^(.+)-(alola|galar|hisui|paldea)(?:-([a-z]+-breed))?$/);
  return m ? `${titleWords(m[1])} de ${titleWords(m[2])}${m[3] ? ` (${titleWords(m[3])})` : ''}` : titleWords(s);
};

// Golpes disponíveis: level-up até o nível informado + TM/HM + tutor. Ovo (breeding) fica de fora.
export function availableMoves(data, mon, level, { machines = true, machineSources = null, tutorSources = null, stage = null } = {}) {
  const out = new Set();
  for (const l of mon.learnset) {
    if (!['level-up', 'machine', 'tutor'].includes(l.method)) continue;
    if (!machines && l.method !== 'level-up') continue; // usuário pode desligar TM/HM/tutor (nem sempre já obtidos)
    // com a origem dos TMs conhecida: só vale o TM obtido até o nível do time (TM sem origem no jogo, ex.: Dive no FRLG, fica fora)
    if (l.method === 'machine' && machineSources && !tmSourceAt(machineSources, l.move, level, stage)) continue;
    if (l.method === 'tutor' && tutorSources && !tmSourceAt(tutorSources, l.move, level, stage)) continue; // tutor também tem lugar e momento // ovo, ovo com Light Ball (Volt Tackle) etc. exigem criação
    if (l.method === 'level-up' && l.level > level) continue;
    out.add(l.move);
  }
  return [...out];
}

// Moveset padrão de um Pokémon de nível N na Gen 3 (GiveBoxMonInitialMoveset do jogo): percorre o learnset por
// level-up em ordem até o nível; golpe já conhecido é ignorado; com 4 golpes, o mais antigo sai.
// Usado para selvagens e treinadores SEM golpes customizados.
// Learnset na ordem do jogo (mon.levelUpInGameOrder, vindo do decomp): o jogo NÃO ordena — para no 1º golpe de nível
// maior (Yellow: Primeape tem Thrash 46 antes de Screech 45, então um Primeape nv. 45 selvagem não tem Screech).
export function likelyMoveset(mon, level) {
  const all = mon.learnset.filter((l) => l.method === 'level-up');
  const stop = mon.levelUpInGameOrder ? all.findIndex((l) => l.level > level) : -1;
  const ups = mon.levelUpInGameOrder ? all.slice(0, stop < 0 ? all.length : stop) : all.filter((l) => l.level <= level).sort((a, b) => a.level - b.level);
  const moves = [];
  for (const l of ups) {
    if (moves.includes(l.move)) continue;
    if (moves.length === 4) moves.shift();
    moves.push(l.move);
  }
  return moves;
}

export function family(data, mon) {
  const byId = new Map(data.pokemon.map((p) => [p.id, p]));
  let cur = mon;
  while (cur.evolvesFrom && byId.has(cur.evolvesFrom)) cur = byId.get(cur.evolvesFrom);
  return cur.id;
}

// Habilidades que mudam o dano e são certas (todas as habilidades possíveis da espécie são a mesma).
const only = (mon, ...abs) => mon.abilities.length > 0 && mon.abilities.every((a) => abs.includes(a));
export function abilityFactor(mon) {
  return only(mon, 'truant') ? 0.5 : 1; // Truant: só age a cada dois turnos
}

// De onde vem o golpe no nível dado: level-up (com nível) tem prioridade sobre TM/HM e tutor.
/** Primeira origem do TM com nível estimado <= level (ou null). */
export function tmSourceAt(machineSources, move, level, stage = null) {
  return (machineSources[move] ?? []).find((s) => (stage != null ? (s.stage ?? 9) <= stage : (s.level ?? 1) <= level)) ?? null;
}

function moveVia(mon, move, level, machineSources, stage = null, tutorSources = null) {
  const ls = mon.learnset.filter((l) => l.move === move);
  const up = ls.filter((l) => l.method === 'level-up' && l.level <= level).sort((a, b) => a.level - b.level)[0];
  if (up) return { method: 'level-up', level: up.level };
  const isTm = ls.some((l) => l.method === 'machine');
  const srcs = isTm ? machineSources : tutorSources;
  return { method: isTm ? 'machine' : 'tutor', ...(srcs && { source: tmSourceAt(srcs, move, level, stage) }) };
}

export function bestMoveVs(data, mon, opp, level, { machines = true, machineSources = null, tutorSources = null, stage = null } = {}) {
  let best = null;
  for (const name of availableMoves(data, mon, level, { machines, machineSources, tutorSources, stage })) {
    const mv = data.moves[name];
    if (!mv.power || mv.category === 'status' || UNRELIABLE_MOVES.has(name)) continue;
    // Huge Power / Pure Power dobram o Ataque (só conta se for a única habilidade possível, ex.: Medicham)
    const atk = mon.stats[mv.category === 'physical' ? 'attack' : 'special-attack'] * (mv.category === 'physical' && only(mon, 'huge-power', 'pure-power') ? 2 : 1);
    const eff = effectiveness(data, mv.type, opp);
    const stab = mon.types.includes(mv.type) ? 1.5 : 1;
    const score = mv.power * stab * eff * ((mv.accuracy ?? 100) / 100) * (atk / 100);
    if (!best || score > best.score) best = { name, ...mv, eff, stab, score, via: moveVia(mon, name, level, machineSources, stage, tutorSources) };
  }
  return best;
}

/**
 * opts: { level, oppMoves?, oppLevel?, version, onlyObtainable, fullyEvolvedOnly, includeLegendary, machines?, acq?, tradeEvolutions?, stage? }
 * starter: inicial escolhido (ex.: 'charmander') — os outros dois iniciais e o vagante errado saem.
 * stage: insígnias (0–8) ou 9 = pós-jogo; com ele, a disponibilidade usa o estágio do detonado em vez do nível.
 * oppMoves: golpes reais do oponente (time de treinador do jogo) — têm prioridade sobre oppLevel.
 * version: 'firered' | 'leafgreen' (usado para filtrar o que dá para obter nessa versão)
 * Ameaça do oponente: com oppLevel, tipos dos golpes ofensivos do moveset provável;
 * sem ele (ou sem golpes ofensivos), os tipos do próprio oponente (STAB).
 */
export function recommend(data, opp, opts) {
  let threats;
  let threatSource;
  if (opts.oppMoves?.length || opts.oppLevel) {
    const names = opts.oppMoves?.length ? opts.oppMoves : likelyMoveset(opp, opts.oppLevel);
    const dmg = names.filter((n) => data.moves[n].power && data.moves[n].category !== 'status');
    threats = [...new Set(dmg.map((n) => data.moves[n].type))];
    threatSource = { kind: opts.oppMoves?.length ? 'known' : 'moveset', moves: names };
  }
  if (!threats || threats.length === 0) {
    threats = [...opp.types];
    threatSource = { kind: 'stab', types: threats };
  }

  const useStage = opts.stage != null && opts.stage !== '' && !!opts.acq?.progress;
  const gen = data.game.generation;
  const oppLevel = opts.oppLevel || opts.level;
  // oponente: DVs (Gen 1–2) / IV (Gen 3) do treinador quando conhecidos; senão valor médio
  const oppSide = { mon: opp, level: oppLevel, stats: statsAt(gen, opp, oppLevel, { dvs: opts.oppDvs ?? null, iv: opts.oppIv ?? null }) };
  const oppMoveNames = opts.oppMoves?.length ? opts.oppMoves : likelyMoveset(opp, oppLevel);
  // sem dados de encontro para a versão (PokéAPI: BDSP, Legends: Arceus, Scarlet/Violet) o filtro de obtíveis esvaziaria tudo
  const hasEncounterData = data.pokemon.some((p) => p.obtainable?.[opts.version]);
  // Mega Evolução (X/Y, ORAS, SM/USUM, Let's Go, Z-A): liberada com o Mega Ring/Key Stone — com o progresso informado, só a
  // partir do ponto em que o detonado diz que você o ganha (acq.progress.keyItems.mega); opts.megaEvolution === false desliga
  const megaItem = opts.acq?.progress?.keyItems?.mega ?? null;
  const megaOk = opts.megaEvolution !== false && data.pokemon.some((p) => p.megas?.length) && (!useStage || !megaItem || opts.stage >= megaItem.stage);
  // Inicial informado: as famílias dos outros dois só existem por troca; vagante que depende do inicial idem
  const excluded = new Set();
  if (opts.starter && data.starters?.species?.includes(opts.starter)) {
    const others = data.starters.species.filter((s) => s !== opts.starter).map((s) => data.pokemon.find((p) => p.name === s)?.id);
    for (const p of data.pokemon) if (others.includes(family(data, p))) excluded.add(p.name);
    if (opts.acq) for (const [sp, list] of Object.entries(opts.acq.versions[opts.version] ?? {})) {
      const roam = list.filter((s) => s.type === 'roamer' && s.forStarter);
      if (roam.length && roam.length === list.length && !roam.some((s) => s.forStarter.includes(opts.starter))) excluded.add(sp);
    }
  }
  const scored = [];
  for (const mon of data.pokemon) {
    if (mon.id === opp.id) continue;
    if (opts.onlyObtainable && hasEncounterData && !mon.obtainable[opts.version]) continue;
    if (excluded.has(mon.name)) continue;
    if (mon.minLevel > opts.level) continue; // ainda não evoluiu no nível do seu time (ex.: Tyranitar só a partir do nv 55)
    // Progresso: com os dados de obtenção, exige uma forma de obter com nível <= o do seu time (ex.: Eevee é dado no nv 25)
    const reach = opts.acq && mon.obtainable[opts.version] && !useStage ? reachLevel(data, opts.acq, mon, opts.version) : mon.minLevel;
    if (reach > opts.level) continue;
    const stageNeeded = useStage && mon.obtainable[opts.version] ? reachStage(data, opts.acq, mon, opts.version) : null;
    if (useStage && stageNeeded > opts.stage) continue;
    // Evolução por troca exige outro jogo: só entra se o usuário pedir (padrão: não)
    if (opts.acq && !opts.tradeEvolutions && needsTradeEvolution(data, opts.acq, mon, opts.version)) continue;
    if (opts.fullyEvolvedOnly && !mon.fullyEvolved) continue;
    if (!opts.includeLegendary && mon.legendary) continue;
    // R3: troca de golpes com a fórmula de dano da geração (public/battle.mjs) — atributos no nível, golpes reais do
    // oponente, bônus de insígnia do jogador. Antes: poder × STAB × tipo × ataque bruto (ignorava defesa, nível e o dano
    // recebido) e o Espeon com Confusion 1× vencia lutadores contra a Miltank da Whitney.
    const gopts = { machines: opts.machines !== false, machineSources: opts.acq?.machines ?? null, tutorSources: opts.acq?.tutors ?? null, stage: useStage ? opts.stage : null };
    const myMoves = availableMoves(data, mon, opts.level, gopts).filter((n) => !UNRELIABLE_MOVES.has(n) || TWO_TURN_OK.has(n));
    const unreliable = opts.acq && mon.obtainable[opts.version] ? unreliableFor(data, opts.acq, mon, opts.version, useStage ? { stage: opts.stage } : { level: opts.level })
      : !opts.acq && hasEncounterData ? mon.randomOnly?.[opts.version] ?? null : null;
    // a forma normal e, com a Mega Evolução liberada, cada Mega da espécie (atributos, tipos e habilidade da Mega; os golpes
    // são os mesmos): fica a que pontua mais. Gen 6: no turno em que evolui, a ordem usa a Velocidade de antes da Mega
    const baseStats = badgeBoost(gen, statsAt(gen, mon, opts.level), opts.acq?.progress, useStage ? opts.stage : null);
    let best = null;
    for (const form of [null, ...(megaOk ? mon.megas ?? [] : [])]) {
      if (form?.primal && !opts.includeLegendary) continue;
      const fm = form ? { ...mon, types: form.types, stats: form.stats, abilities: form.abilities } : mon;
      const me = { mon: fm, level: opts.level, stats: form ? badgeBoost(gen, statsAt(gen, fm, opts.level), opts.acq?.progress, useStage ? opts.stage : null) : baseStats, ...(form && gen === 6 && { speedTurn1: baseStats.speed }) };
      const d = duel(data, gen, me, oppSide, myMoves, oppMoveNames);
      if (!d.move) continue;
      const mv = data.moves[d.move];
      const move = { name: d.move, ...mv, eff: d.myDmg.typeMul, stab: fm.types.includes(mv.type) ? 1.5 : 1, turns: d.myTurns, via: moveVia(mon, d.move, opts.level, gopts.machineSources, gopts.stage, gopts.tutorSources) };
      const incoming = threats.map((t) => ({ type: t, mult: effectiveness(data, t, fm) }));
      const worst = Math.max(...incoming.map((x) => x.mult));
      const fasterBase = d.faster === 1;
      // 1º quem vence a troca; depois a folga (turnos dele ÷ meus, até 6); depois menos turnos meus e quem age primeiro
      // E2: só obtível por fonte aleatória (surto, Poké Radar, árvore de mel, sorteio diário, slot de 1–2%…) perde 20 pontos —
      // menos que uma vitória (100), mais que duas faixas de folga: entre vencedores parecidos, fica o que dá para ir buscar
      // sem "onde obter" (camada PokéAPI, Diamond/Pearl): marca da PokéAPI de "só surto/Poké Radar" (build-data)
      const score = ((d.win ? 100 : 0) + Math.min(d.margin, 6) * 10 - Math.min(d.myTurns, 20) + (fasterBase ? 2 : 0) - (unreliable ? 20 : 0)) * abilityFactor(fm);
      // Mega só quando ganha da forma normal (empate: a normal, que não pede pedra)
      if (!best || score > best.score) best = { mon, move, incoming, worst, fasterBase, score, reach, stageNeeded, duel: d, unreliable, mega: form ? { name: form.name, stone: form.stone, spriteId: form.spriteId, types: form.types, primal: !!form.primal, ring: megaItem ?? null } : null };
    }
    if (best) scored.push(best);
  }
  scored.sort((a, b) => b.score - a.score);

  const picks = [];
  const usedFamilies = new Set();
  for (const s of scored) {
    const fam = family(data, s.mon);
    if (usedFamilies.has(fam)) continue;
    usedFamilies.add(fam);
    picks.push(s);
    if (picks.length === 3) break;
  }
  return { picks, threats, threatSource, candidates: scored }; // candidates: todos os que passaram nos filtros (R0 mede o motor)
}

/**
 * R5 — contra o time inteiro de um treinador: roda recommend() para cada Pokémon do time e soma as trocas de golpes por
 * candidato (quem não tem golpe útil contra um deles conta como derrota). Ordem: mais vitórias; depois a soma das folgas.
 * party: [{ species, level, moves, dvs?, iv? }]. Retorna { picks: [{ mon, wins, total, vs: [{ opp, duel, move }] }] }.
 */
/**
 * A espécie lutando como a Mega `megaName` (atributos, tipos e habilidade da Mega; id e nome da espécie ficam, para os
 * sprites e o filtro "não sugerir a própria espécie"). Sem Mega com esse nome, a própria espécie.
 */
export function megaForm(mon, megaName) {
  const f = megaName && mon?.megas?.find((m) => m.name === megaName);
  return f ? { ...mon, types: f.types, stats: f.stats, abilities: f.abilities, megaName: f.name, megaSprite: f.spriteId } : mon;
}

export function recommendTeam(data, party, opts) {
  const byMon = new Map();
  party.forEach((p, i) => {
    const opp = megaForm(data.pokemon.find((x) => x.name === p.species), p.mega);
    const r = recommend(data, opp, { ...opts, oppMoves: p.moves, oppLevel: p.level, oppDvs: p.dvs, oppIv: p.iv });
    for (const c of r.candidates) {
      const e = byMon.get(c.mon.name) ?? byMon.set(c.mon.name, { mon: c.mon, reach: c.reach, stageNeeded: c.stageNeeded, unreliable: c.unreliable, vs: [] }).get(c.mon.name);
      e.vs[i] = { opp: p.species, level: p.level, duel: c.duel, move: c.move };
    }
  });
  const scored = [...byMon.values()].map((e) => {
    const vs = party.map((p, i) => e.vs[i] ?? { opp: p.species, level: p.level, duel: null, move: null });
    const wins = vs.filter((x) => x.duel?.win).length;
    const folga = vs.reduce((a, x) => a + Math.min(x.duel?.margin ?? 0, 6), 0);
    return { ...e, vs, wins, total: party.length, score: wins * 100 + folga - (e.unreliable ? 20 : 0) }; // E2: mesma penalidade
  }).sort((a, b) => b.score - a.score);
  const picks = [], fams = new Set();
  for (const s of scored) { const f = family(data, s.mon); if (fams.has(f)) continue; fams.add(f); picks.push(s); if (picks.length === 3) break; }
  return { picks };
}

/**
 * Onde obter uma espécie na versão. acq = conteúdo de <jogo>-acquisition.json.
 * Retorna { direct: fontes diretas, from?: espécie capturável, steps: [{to, evo}] (evoluções a fazer), events }.
 * Se a espécie não é obtível diretamente, sobe pela cadeia evolutiva até achar uma forma obtível.
 */
export function whereToGet(data, acq, mon, version) {
  const byId = new Map(data.pokemon.map((p) => [p.id, p]));
  const all = (n) => acq.versions[version][n] ?? [];
  const usable = (n) => all(n).filter((s) => s.type !== 'event');
  if (usable(mon.name).length) return { direct: usable(mon.name), steps: [], events: [] };
  const steps = [];
  let cur = mon;
  while (cur.evolvesFrom && byId.has(cur.evolvesFrom) && cur.evo?.possible !== false) {
    steps.unshift({ to: cur.name, evo: cur.evo });
    cur = byId.get(cur.evolvesFrom);
    if (usable(cur.name).length) return { direct: usable(cur.name), from: cur.name, steps, events: [] };
  }
  return { direct: [], steps: [], events: all(mon.name).filter((s) => s.type === 'event') };
}

const TITLE = (s) => String(s).toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const NAME = (n) => String(n).split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '); // "mr-mime" → "Mr Mime"
export function describeEvolution(evo) {
  if (!evo) return '';
  // Gens 5–9 (PKHeX): métodos sem equivalente no decomp vêm com o texto pronto (ex.: "nv 20 (à noite)", "girar segurando um doce")
  if (evo.text) return evo.text;
  // Tyrogue (Gen 2+): nv 20 conforme Ataque × Defesa
  const STAT = { ATK_GT_DEF: ' (Ataque > Defesa)', ATK_LT_DEF: ' (Ataque < Defesa)', ATK_EQ_DEF: ' (Ataque = Defesa)' };
  if (evo.kind.startsWith('LEVEL')) return `nv ${evo.param}${STAT[evo.kind.replace(/^LEVEL_/, '')] ?? ''}`;
  if (evo.kind === 'ITEM') return TITLE(evo.param);
  if (evo.kind === 'TRADE') return 'troca';
  if (evo.kind === 'TRADE_ITEM') return `troca segurando ${TITLE(evo.param)}`;
  // Gen 5: Karrablast ↔ Shelmet evoluem trocando um pelo outro
  if (evo.kind === 'TRADE_SPECIES') return `troca por ${TITLE(evo.param)}`;
  if (evo.kind === 'FRIENDSHIP') return 'amizade alta';
  if (evo.kind === 'FRIENDSHIP_DAY') return 'amizade alta (de dia)';
  if (evo.kind === 'FRIENDSHIP_NIGHT') return 'amizade alta (à noite)';
  if (evo.kind === 'BEAUTY') return 'beleza alta';
  // Gen 4: métodos novos (antes saía "evolua: Ambipom ()")
  if (evo.kind === 'KNOW_MOVE') return `subir de nível sabendo ${TITLE(evo.param)}`;
  if (evo.kind === 'HELD_ITEM_DAY') return `subir de nível de dia segurando ${TITLE(evo.param)}`;
  if (evo.kind === 'HELD_ITEM_NIGHT') return `subir de nível à noite segurando ${TITLE(evo.param)}`;
  if (evo.kind === 'PARTY') return `subir de nível com ${TITLE(evo.param)} no time`;
  if (evo.kind === 'LOCATION') {
    const where = { MOSS_ROCK: 'perto da Moss Rock', ICE_ROCK: 'perto da Ice Rock', MAGNETIC_FIELD: 'num campo magnético', CORONET: 'no Mt. Coronet (campo magnético)', ETERNA: 'perto da Moss Rock (Eterna Forest)', ROUTE217: 'perto da Ice Rock (Route 217)' }[String(evo.raw ?? '').replace(/^EVO_(LEVEL_)?/, '')];
    return `subir de nível ${where ?? 'num lugar específico'}`;
  }
  return '';
}

const SRC_LABEL = {
  gift: (s) => `Presente — ${s.where}${s.level ? ` (nv ${s.level})` : ''}`,
  static: (s) => `Encontro único — ${s.where} (nv ${s.level})`,
  egg: (s) => `Ovo — ${s.where}`,
  // ovo da creche (apply-breeding): o pai, o parceiro (Ditto/macho; sem nada = macho da mesma espécie) e o incenso
  breed: (s) => `Ovo na creche — ${s.where}: deixe ${NAME(s.want)} com ${s.partner ? (s.partner === 'ditto' ? 'Ditto' : `um macho do mesmo grupo de ovo (ex.: ${NAME(s.partner)})`) : 'outro ' + NAME(s.want) + ' do sexo oposto'}${s.item ? `, um dos dois segurando ${TITLE(s.item)}` : ''} (choca no nv ${s.level})`,
  trade: (s) => `Troca no jogo — ${s.where} (${s.detail})`,
  prize: (s) => `${s.where} — ${s.detail}`,
  starter: (s) => `${s.where} — ${s.detail}`,
  roamer: (s) => `${s.where} — ${s.detail}`,
};
/** Linhas de texto para exibir (até `maxWild` locais selvagens, mais todas as outras formas de obter). */
export function formatSources(sources, maxWild = 3) {
  // locais mais cedo primeiro (estágio), depois os mais comuns — senão a Gen 2 mostrava a Route 26 (estágio 8) antes da Route 29
  // Gens 6–9 (encontros do PKHeX): sem taxa (pct) → ordena pelo menor nível
  const wild = sources.filter((s) => s.type === 'wild').sort((a, b) => (a.stage ?? 9) - (b.stage ?? 9) || (b.pct ?? 0) - (a.pct ?? 0) || a.min - b.min);
  // Gen 2: horário (manhã/dia/noite) e enxame/concurso aparecem junto do método
  const lines = wild.slice(0, maxWild).map((s) => `${s.where} — ${s.method}${s.times ? ` (${s.times.join('/')})` : ''}${s.detail ? ` [${s.detail}]` : ''}, nv ${s.min === s.max ? s.min : `${s.min}–${s.max}`}${s.pct != null ? ` (${s.pct}%)` : ''}` + (s.gate ? ` — exige ${s.gate.badge ? `HM de ${s.method} + insígnia ${s.gate.badge} (${s.gate.leader})` : (s.gateAs ?? s.method)}; estimativa: nv ${s.gate.level}+` : ''));
  if (wild.length > maxWild) lines.push(`+${wild.length - maxWild} outros locais`);
  for (const s of sources) if (s.type !== 'wild' && SRC_LABEL[s.type]) lines.push(SRC_LABEL[s.type](s) + (s.area ? ` — estimativa: área de selvagens nv ${s.area.level}+ (${s.area.near})` : ''));
  return lines;
}

/** Menor nível com que dá para ter a espécie: nível da forma de obter (selvagem/presente/estático) e da evolução. */
export function reachLevel(data, acq, mon, version, seen = new Set()) {
  if (seen.has(mon.name)) return Infinity;
  seen.add(mon.name);
  const w = whereToGet(data, acq, mon, version);
  if (!w.direct.length) return Infinity;
  const levelOf = (s) => {
    let lv = Math.max(s.min ?? s.level ?? 1, s.area?.level ?? 1, s.gate?.level ?? 1); // área/porta = estimativas do progresso
    if (s.type === 'trade' && s.want) {
      const want = data.pokemon.find((p) => p.name === s.want);
      lv = Math.max(lv, want ? reachLevel(data, acq, want, version, seen) : Infinity); // precisa ter o Pokémon pedido
    }
    // ovo da creche: precisa ter o pai (e o parceiro: Ditto ou macho de outra espécie)
    if (s.type === 'breed') for (const n of [s.want, s.partner].filter(Boolean)) {
      const p = data.pokemon.find((x) => x.name === n);
      lv = Math.max(lv, p ? reachLevel(data, acq, p, version, new Set(seen)) : Infinity);
    }
    return lv;
  };
  // evolução por item (pedra, Metal Coat…): precisa ter o item → nível estimado de onde ele é obtido
  const itemLv = (w.steps ?? []).filter((st) => /ITEM/.test(st.evo?.kind ?? '')).map((st) => {
    const src = acq.items?.[st.evo.param];
    return src ? Math.min(...src.map((x) => x.level ?? 1)) : acq.items ? Infinity : 1;
  });
  const direct = Math.max(Math.min(...w.direct.map(levelOf)), mon.minLevel ?? 1, ...itemLv);
  // com fonte direta, a pré-evolução pode sair mais cedo (capturar e evoluir): fica com o menor
  const pre = evolutionAlternative(data, acq, mon, w);
  if (!pre) return direct;
  const evoItem = /ITEM/.test(mon.evo.kind ?? '') ? (acq.items?.[mon.evo.param] ? Math.min(...acq.items[mon.evo.param].map((x) => x.level ?? 1)) : acq.items ? Infinity : 1) : 1;
  return Math.min(direct, Math.max(reachLevel(data, acq, pre, version, new Set(seen)), mon.minLevel ?? 1, evoItem));
}

/** Pré-evolução para comparar com a fonte direta (evolução possível no jogo e sem troca — troca exige outro cartucho). */
function evolutionAlternative(data, acq, mon, w) {
  if (!w.direct.length || w.from || !mon.evolvesFrom || mon.evo?.possible === false || /^TRADE/.test(mon.evo?.kind ?? '')) return null;
  return data.pokemon.find((p) => p.id === mon.evolvesFrom && p.id !== mon.id) ?? null;
}

/** A rota até a espécie exige evolução por troca (outro cartucho)? Ex.: Steelix, Alakazam, Gengar. */
export function needsTradeEvolution(data, acq, mon, version) {
  const w = whereToGet(data, acq, mon, version);
  return !!w.from && w.steps.some((st) => /^TRADE/.test(st.evo?.kind ?? ''));
}

/** Rota alternativa pela pré-evolução (ex.: Magneton a 1% → capturar Magnemite e evoluir). */
export function preEvolutionRoute(data, acq, mon, version) {
  const parent = data.pokemon.find((p) => p.id === mon.evolvesFrom);
  if (!parent || mon.evo?.possible === false) return null;
  const w = whereToGet(data, acq, parent, version);
  if (!w.direct.length) return null;
  return { from: w.from ?? parent.name, steps: [...w.steps, { to: mon.name, evo: mon.evo }], direct: w.direct };
}

/** Menor estágio (0–8 insígnias, 9 = pós-jogo) em que dá para ter a espécie. Estágio desconhecido conta como pós-jogo. */
export function reachStage(data, acq, mon, version, seen = new Set()) {
  if (seen.has(mon.name)) return Infinity;
  seen.add(mon.name);
  const w = whereToGet(data, acq, mon, version);
  if (!w.direct.length) return Infinity;
  const stageOf = (s) => {
    let st = Math.max(s.stage ?? (acq.progress?.post ?? 9), s.gate?.stage ?? 0);
    if (s.type === 'trade' && s.want) {
      const want = data.pokemon.find((p) => p.name === s.want);
      st = Math.max(st, want ? reachStage(data, acq, want, version, seen) : Infinity);
    }
    if (s.type === 'breed') for (const n of [s.want, s.partner].filter(Boolean)) {
      const p = data.pokemon.find((x) => x.name === n);
      st = Math.max(st, p ? reachStage(data, acq, p, version, new Set(seen)) : Infinity);
    }
    return st;
  };
  const itemSt = (w.steps ?? []).filter((x) => /ITEM/.test(x.evo?.kind ?? '')).map((x) => {
    const src = acq.items?.[x.evo.param];
    return src ? Math.min(...src.map((i) => i.stage ?? 9)) : acq.items ? Infinity : 0; // sem lista de itens (PKHeX): não bloqueia
  });
  const direct = Math.max(Math.min(...w.direct.map(stageOf)), ...itemSt);
  // com fonte direta, a pré-evolução pode sair mais cedo (ex.: capturar a forma anterior e evoluir): fica com o menor
  const pre = evolutionAlternative(data, acq, mon, w);
  if (!pre) return direct;
  const evoItem = /ITEM/.test(mon.evo.kind ?? '') ? (acq.items?.[mon.evo.param] ? Math.min(...acq.items[mon.evo.param].map((i) => i.stage ?? 9)) : acq.items ? Infinity : 0) : 0;
  return Math.min(direct, Math.max(reachStage(data, acq, pre, version, new Set(seen)), evoItem));
}

/**
 * E2 — origem aleatória/condicionada: a fonte existe, mas o jogador não consegue contar com ela quando quiser.
 * Retorna o motivo (texto curto) ou null quando a fonte é comum (grama, presente, troca, estático…).
 */
export function unreliableReason(s) {
  if (s.type !== 'wild') return null;
  const d = s.detail ?? '';
  if (s.swarm) return 'surto (depende do dia)';
  if (s.random) return `${s.method} (sorteio/condição)`; // Gens 6–9 (PKHeX): surto, Radar, árvore de mel, aparição rara…
  if (s.method === 'Poké Radar') return 'Poké Radar';
  if (s.method === 'Árvore de mel') return 'árvore de mel (sorteio)';
  if (/sorteio diário|espécie do dia/.test(d)) return 'sorteio diário';
  if (/pontos de Feebas/.test(d)) return 'pontos de Feebas sorteados';
  if (/árvore rara|árvore secreta/.test(d)) return 'árvore rara (depende do ID do treinador)';
  if (/Hoenn Sound|Sinnoh Sound/.test(d)) return 'som no rádio (dia da semana)';
  if (/Concurso de insetos/.test(d)) return 'só no Concurso de insetos (ter/qui/sáb)';
  if (/com \d+ objeto/.test(d)) return 'Safari: exige montar objetos na área';
  if ((s.pct ?? 100) <= 2) return `raro (${s.pct}%)`;
  return null;
}
/**
 * Motivo se TODAS as fontes da espécie (ou da forma que evolui nela) disponíveis até o estágio/nível forem aleatórias;
 * null se houver ao menos uma fonte comum.
 */
export function unreliableFor(data, acq, mon, version, { stage = null, level = null } = {}) {
  const w = whereToGet(data, acq, mon, version);
  const ok = (s) => (stage != null ? Math.max(s.stage ?? (acq.progress?.post ?? 9), s.gate?.stage ?? 0) <= stage : level == null || Math.max(s.min ?? s.level ?? 1, s.gate?.level ?? 1) <= level);
  const avail = w.direct.filter(ok);
  if (!avail.length) return null;
  const reasons = avail.map(unreliableReason);
  return reasons.every(Boolean) ? [...new Set(reasons)].join('; ') : null;
}

/** Rótulo do estágio para a tela. */
// progress.stageNames/post: jogos cujo marco não é insígnia (Z-A: rank do Z-A Royale; Legends: Arceus: nobres acalmados)
export function stageLabel(stage, leaderOrder = [], progress = null) {
  if (progress?.stageNames) return stage >= progress.post ? 'pós-jogo' : progress.stageNames[stage] ?? 'pós-jogo';
  if (stage >= 9) return 'pós-jogo';
  if (stage === 0) return 'antes da 1ª insígnia';
  // "LT. SURGE" / "Lt.Surge" → "Lt. Surge" (cada palavra com maiúscula)
  const name = (n) => n.replace(/\.(?=\S)/g, '. ').toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
  return `${stage} insígnia${stage > 1 ? 's' : ''}${leaderOrder[stage - 1] ? ` (depois de ${name(leaderOrder[stage - 1])})` : ''}`;
}

/**
 * Aba "Onde capturar": todas as formas de obter a espécie na versão (sem limite de locais), na ordem da história, com o
 * estágio de cada uma; a rota por evolução quando não há forma direta; e o que existe nas outras versões do jogo.
 * Retorna { lines: [{ text, stage, random }], from, steps, events, others: [{ version, count }], obtainable }.
 */
export function catchReport(data, acq, mon, version) {
  const w = whereToGet(data, acq, mon, version);
  const post = acq.progress?.post ?? 9;
  // ovo da creche: o estágio é o da creche ou o de quando dá para ter o pai/parceiro, o que vier depois
  const stageOf = (s) => (s.type !== 'breed' ? s.stage : Math.max(s.stage, ...[s.want, s.partner].filter(Boolean).map((n) => { const p = data.pokemon.find((x) => x.name === n); return p ? reachStage(data, acq, p, version) : post; })));
  const order = (s) => [Math.min(stageOf(s) ?? post, post), s.type === 'wild' ? 0 : 1, s.min ?? s.level ?? 0];
  const sorted = [...w.direct].sort((a, b) => { const x = order(a), y = order(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
  const lines = sorted.map((s) => ({ where: s.where, text: formatSources([s], 1)[0], stage: acq.progress && s.stage != null ? Math.min(stageOf(s), post) : null, random: !!unreliableReason(s) }));
  const others = Object.keys(acq.versions).filter((v) => v !== version).map((v) => ({ version: v, count: whereToGet(data, acq, mon, v).direct.length })).filter((o) => o.count);
  // com fonte direta, mostra também o caminho pela evolução (capturar a forma anterior e evoluir) com o estágio dele
  let alt = null;
  const pre = evolutionAlternative(data, acq, mon, w);
  const route = pre && preEvolutionRoute(data, acq, mon, version);
  if (route) {
    const parent = catchReport(data, acq, pre, version);
    const evoItem = /ITEM/.test(mon.evo.kind ?? '') ? (acq.items?.[mon.evo.param] ? Math.min(...acq.items[mon.evo.param].map((i) => i.stage ?? post)) : acq.items ? Infinity : 0) : 0;
    const stage = acq.progress ? Math.min(Math.max(reachStage(data, acq, pre, version), evoItem), post) : null;
    const first = lines.length && acq.progress ? Math.min(...lines.map((l) => l.stage ?? post)) : null;
    alt = { from: route.from, steps: route.steps, stage, earlier: stage != null && first != null && stage < first, lines: parent.lines.slice(0, 3), more: Math.max(parent.lines.length - 3, 0) };
  }
  return { lines, from: w.from ?? null, steps: w.steps, alt, events: w.events.map((s) => formatSources([s], 1)[0] ?? s.where), others, obtainable: !!mon.obtainable?.[version] };
}

/**
 * Aba "Pokémon por tipo": os Pokémon do jogo filtrados e agrupados por tipo (só os tipos que o jogo tem — sem Fada antes da
 * Gen 6). Filtros: `types` (até 2: precisa ter todos), `q` (pedaço do nome), `onlyObtainable` (dá para obter na versão),
 * `finalOnly` (forma final). Quem tem dois tipos aparece nos dois grupos. Ordem: número da Pokédex.
 * Retorna { mons, groups: [{ type, mons }], counts: { tipo: n } } — counts com os outros filtros, sem o de tipo.
 */
export function typeIndex(data, { version = null, q = '', types = [], onlyObtainable = true, finalOnly = false } = {}) {
  const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = fold(q);
  const base = data.pokemon.filter((p) => (!onlyObtainable || !version || p.obtainable?.[version]) && (!finalOnly || p.fullyEvolved) && (!t || fold(p.name).includes(t)))
    .sort((a, b) => (a.speciesId ?? a.id) - (b.speciesId ?? b.id) || a.id - b.id);
  const counts = Object.fromEntries(data.types.map((ty) => [ty, base.filter((p) => p.types.includes(ty)).length]));
  const mons = base.filter((p) => types.every((ty) => p.types.includes(ty)));
  const groups = data.types.map((ty) => ({ type: ty, mons: mons.filter((p) => p.types.includes(ty)) })).filter((g) => g.mons.length);
  return { mons, groups, counts };
}

const ITEM_HOW = { ground: 'no chão', hidden: 'escondido', mart: 'loja', gift: 'presente', gym: 'prêmio do líder', prize: 'prêmio' };
/**
 * Aba "Onde capturar" → evoluções: a família inteira da espécie (da forma base às finais, com ramos — Eevee), o método de
 * cada evolução e, quando ela pede item (pedra, Metal Coat…), onde achar o item no jogo:
 *   • jogos com decomp: `acq.items` (chão, escondido, loja, presente…, com o ponto da história)
 *   • os outros: `evoItems` (<jogo>-evoitems.json) — frases do detonado que dizem onde achar; citação, não posição verificada
 * `inGame` = a espécie dá para obter na versão (`obtainable`, que já conta evolução); falso no Pichu do FireRed — a tela
 * diz que não é deste jogo e em quais jogos aparece.
 * `byEgg` = se obtém pelo ovo da creche (Pichu no FireRed, desde 0.23.0).
 * Retorna { nodes: [{ name, id, depth, how, possible, inGame, byEgg, item: { param, label, sources: [{ text, stage }], cited: [{ section, text }] } }] }.
 */
export function evolutionReport(data, acq, mon, evoItems = null, version = null) {
  const byId = new Map(data.pokemon.map((p) => [p.id, p]));
  const root = byId.get(family(data, mon)) ?? mon;
  const itemOf = (param) => {
    const seen = new Set();
    // detalhe de quem dá/vende ("loja do Pokéathlon (pontos) — quinta", "500 fichas", "Sailor"); sem os genéricos e sem o
    // nome do gráfico do NPC no decomp ("Man 5")
    const detail = (s) => (s.by && !/^(loja|NPC|Clerk|item no chão|escondido)$/.test(s.by) && !/^[A-Z][a-z]+ \d+$/.test(s.by) ? ' (' + s.by + ')' : '');
    const sources = (acq?.items?.[param] ?? []).map((s) => ({ text: s.where + ' — ' + (ITEM_HOW[s.type] ?? s.type) + detail(s), stage: acq.progress && s.stage != null ? s.stage : null }))
      .filter((s) => !seen.has(s.text) && seen.add(s.text)).sort((a, b) => (a.stage ?? 99) - (b.stage ?? 99));
    return { param, label: TITLE(param), sources, cited: evoItems?.items?.[param] ?? [] };
  };
  const nodes = [];
  const walk = (p, depth) => {
    const e = depth ? p.evo : null;
    nodes.push({ name: p.name, id: p.id, depth, how: e ? describeEvolution(e) : '', possible: e?.possible !== false, inGame: version == null || !!p.obtainable?.[version], byEgg: !!version && (acq?.versions?.[version]?.[p.name] ?? []).some((x) => x.type === 'breed'), item: e && /ITEM/.test(e.kind ?? '') && typeof e.param === 'string' ? itemOf(e.param) : null });
    for (const c of data.pokemon.filter((x) => x.evolvesFrom === p.id && x.id !== p.id).sort((a, b) => a.id - b.id)) walk(c, depth + 1);
  };
  walk(root, 0);
  return { nodes };
}
