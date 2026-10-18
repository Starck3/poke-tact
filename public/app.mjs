import { recommend, recommendTeam, humanize, likelyMoveset, whereToGet, formatSources, describeEvolution, preEvolutionRoute, stageLabel } from './engine.mjs';
import { filterGames, groupByGeneration, platformsOf, generationsOf, roman, parseRoute, homeHash } from './catalog.mjs';

const COLORS = {
  normal: '#8a8a59', fire: '#e8742c', water: '#5a7fe8', electric: '#d9ad12', grass: '#5ca83c', ice: '#6bb8b8',
  fighting: '#a8231c', poison: '#923a92', ground: '#c9a24a', flying: '#8a73d8', psychic: '#e8457a', bug: '#8a9a14',
  rock: '#9a8528', ghost: '#5f4a8a', dragon: '#5a24e8', dark: '#5a4a3f', steel: '#8a8aa5', fairy: '#d685ad',
};
const $ = (id) => document.getElementById(id);
// sprites da própria versão do jogo (pasta do repositório PokeAPI/sprites; conferida para os jogos suportados)
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const sprite = (id) => `${SPRITES}versions/generation-${roman(data.game.generation).toLowerCase()}/${currentGame}/${id}.png`;
// <img> com substituto: se a pasta da versão não existir (ex.: Gen 9), usa o sprite padrão
const img = (id) => `<img src="${sprite(id)}" alt="" onerror="this.onerror=null;this.src='${SPRITES}${id}.png'">`;
const typeBadge = (t) => `<span class="type" style="background:${COLORS[t]}">${t}</span>`;
const fmtMult = (m) => (m === 0 ? '0×' : m === 0.5 ? '½×' : `${m}×`);

let data;
let catalog = null;
let currentGame = null;
const filters = { platform: null, generation: null };
let trainers = [];
let acq = null;
let walk = null; // detonado gerado (carregado ao abrir a aba)
let known = null; // { moves, item } do Pokémon de treinador selecionado; null quando o usuário digita manualmente
let teamMode = null; // treinador quando o modo "contra o time inteiro" está ativo

async function load(gameId) {
  const g = catalog.games.find((x) => x.id === gameId);
  currentGame = gameId;
  known = null; teamMode = null;
  for (const id of ['opp', 'oppLevel']) $(id).value = '';
  $('team').innerHTML = '';
  $('results').innerHTML = '';
  $('oppInfo').innerHTML = '';
  $('gameTitle').textContent = 'Pokémon ' + g.label;
  $('tabWalk').hidden = !g.hasWalkthrough;
  $('validationNote').hidden = g.validation !== 'pokeapi' && g.validation !== 'decomp-core';
  $('onlyObtainable').disabled = false;
  $('validationNote').textContent = g.validation === 'pokeapi' ? 'Atenção: este jogo usa dados da PokéAPI com as regras da geração, ainda SEM conferência com o código do jogo (decomp). Treinadores, onde obter e progresso ainda não estão disponíveis.'
    : g.validation === 'decomp-core' ? 'Espécies, golpes, learnsets, TM/HM, tabela de tipos e treinadores conferidos com o código do jogo (decomp). Onde obter e progresso ainda não estão disponíveis.' : '';
  $('walkthrough').innerHTML = !g.walkthrough ? '' : g.hasWalkthrough
    ? 'Ordem da história (aba Detonado) baseada no detonado do <a href="' + g.walkthrough + '" target="_blank" rel="noopener">PokeMythology</a>.'
    : 'Detonado deste jogo ainda não está no app; referência externa: <a href="' + g.walkthrough + '" target="_blank" rel="noopener">PokeMythology</a>.';
  document.title = g.label + ' — Poke Tact';
  $('version').innerHTML = g.versions.map((v) => '<option value="' + v.id + '">' + v.label + '</option>').join('');
  $('gameInfo').textContent = 'Carregando dados…';
  walk = null;
  showTab('rec');
  data = await (await fetch(`data/${gameId}.json`)).json();
  let trainersNote = '';
  try { const tj = await (await fetch(`data/${gameId}-trainers.json`)).json(); trainers = tj.trainers; trainersNote = tj.note ?? ''; } catch { trainers = []; }
  const bossesOnly = /só chefes/.test(trainersNote); // Diamond/Pearl: lugar das lutas em binário no decomp
  try { acq = await (await fetch(`data/${gameId}-acquisition.json`)).json(); } catch { acq = null; }
  // núcleo + aquisição já conferidos (Gen 1): a nota diz só o que ainda falta
  if (g.validation === 'decomp-core') {
    // diz exatamente o que já foi conferido e o que falta (Gen 1 completa; Gen 2 começa só com o núcleo)
    // decomp PARCIAL (HGSS): learnset por nível e tabela de golpes estão em binário no decomp
    const partial = !!data.corrections?.partial;
    const noChart = !!data.corrections?.chartUnchecked; // Diamond/Pearl: tabela de tipos sem fonte em texto no decomp
    const done = [partial ? 'atributos, tipos, habilidades, evoluções, TM/HM, tutores e tabela de tipos' : noChart ? 'espécies, golpes, learnsets e TM/HM' : 'espécies, golpes, learnsets, TM/HM e tabela de tipos', trainers.length && (bossesOnly ?'times dos chefes (líderes, Elite dos Quatro, campeã e rival)' : 'treinadores'), acq && 'onde obter e progresso'].filter(Boolean);
    const missing = [!trainers.length && 'treinadores', !acq && 'onde obter e progresso', !g.hasWalkthrough && 'detonado dentro do app'].filter(Boolean);
    $('validationNote').textContent = `Conferido com o código do jogo (decomp): ${done.join('; ')}.` + (missing.length ? ` Ainda não disponível: ${missing.join(', ')}.` : '') +
      (partial ? ' Learnset por nível vem da PokéAPI (no decomp está em binário) e os valores dos golpes vêm do decomp do Platinum (mesma geração).' : '') +
      (noChart ? ' A tabela de tipos não está em texto neste decomp (usa-se a da Gen 4, a mesma conferida nos decomps de Platinum e HeartGold/SoulSilver).' : '');
    $('validationNote').hidden = !missing.length && !partial; // completo como a Gen 3: sem aviso
  }
  fillStarters();
  fillTrainers();
  fillStages();
  $('trainerBox').hidden = !trainers.length;
  // style.display (o CSS .checks label { display:flex } anula o atributo hidden)
  // inicial só faz sentido com 2+ opções (Yellow: só Pikachu); progresso só com linha do tempo
  const choosable = (data.starters?.species?.length ?? 0) > 1;
  $('starter').closest('label').style.display = !choosable && !acq?.progress ? 'none' : '';
  $('starterWrap').style.display = choosable ? '' : 'none';
  $('stageWrap').style.display = acq?.progress ? '' : 'none';
  $('tradeEvos').closest('label').style.display = acq ? '' : 'none';
  $('gameInfo').textContent = `${data.game.label} · ${data.pokemon.length} Pokémon · ${Object.keys(data.moves).length} golpes · ${data.types.length} tipos · fonte: ${data.game.source}` +
    (data.corrections ? ` + correções do decomp ${data.corrections.source} (${data.corrections.list.length})` : '') +
    (data.moveCrosscheck ? ` + golpes conferidos com ${data.moveCrosscheck.source}: ${data.moveCrosscheck.corrected} corrigidos, ${data.moveCrosscheck.flagged} divergências só sinalizadas` : '');
  renderStarters();
  if (!data.pokemon.some((p) => Object.values(p.obtainable ?? {}).some(Boolean))) {
    $('onlyObtainable').disabled = true;
    $('validationNote').textContent += ' A PokéAPI não tem dados de encontro deste jogo: o filtro "só o que dá para obter" fica desligado.';
  }
  $('mons').innerHTML = data.pokemon.map((p) => `<option value="${p.name}">#${p.id}</option>`).join('');
  // Jogos sem treinadores/onde obter: aviso próprio (antes era sobrescrito pelo texto abaixo e falava de treinadores e habilidades)
  if (!acq) $('disclaimer').textContent = `Sugestões usam os dados da PokéAPI para ${g.label} com as regras da Geração ${roman(data.game.generation)} (tabela de tipos, ${data.game.generation <= 3 ? 'categoria física/especial pelo tipo' : 'categoria física/especial de cada golpe'}${data.game.generation < 3 ? ', sem habilidades' : ''}). ` +
    (g.validation === 'decomp-core' ? (data.corrections?.chartUnchecked ? 'Espécies e golpes conferidos com o código do jogo (decomp)' : 'Espécies, golpes e tabela conferidos com o código do jogo (decomp)') : 'Ainda não conferidos com o código do jogo') +
    (trainers.length ? (bossesOnly ? '; líderes, Elite dos Quatro, campeã e rival com os times e golpes do jogo; ainda sem os outros treinadores, onde obter e progresso.' : '; treinadores com os times e golpes do jogo; ainda sem onde obter e progresso.') : '; sem treinadores, onde obter e progresso.') +
    ' Com o nível do oponente, a ameaça vem do moveset padrão do jogo; sem nível, dos tipos dele.';
  else $('disclaimer').textContent =
    `Sugestões usam apenas dados da Geração ${roman(data.game.generation)} (tipos, stats base, golpes${data.game.generation >= 3 ? ' e habilidades' : ''} daquela geração). ` +
    'Disponibilidade = pode ser obtido nesta versão (selvagem, presente, troca dentro do jogo, prêmio…) ou evolui de algo assim; trocas com outros jogos, eventos e criação (breeding) não contam. ' +
    `Ao escolher um treinador do jogo, usamos o nível e os golpes reais do time dele (dados do próprio ${g.label})` +
    (data.game.generation >= 3 ? '; a habilidade do Pokémon dele não é determinada, então só imunidades de habilidade única entram na conta. ' : '. ') +
    'Sem treinador: com o nível do oponente, a ameaça vem do moveset padrão do jogo; sem nível, dos tipos dele.';
  update();
}

function routeHtml(w) {
  const chain = w.from ? w.steps.map((s) => { const d = describeEvolution(s.evo); return humanize(s.to) + (d ? ' (' + d + ')' : ''); }).join(' → ') : '';
  const head = w.from ? 'capture ' + humanize(w.from) + ' e evolua: ' + chain : '';
  return head + '<ul class="why">' + formatSources(w.direct).map((l) => '<li>' + l + '</li>').join('') + '</ul>';
}

function renderStarters() {
  const box = $('starters');
  const st = data.starters;
  if (!st?.species?.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<div class="filter-label">Iniciais deste jogo — ' + st.where + (st.level ? ' (nv ' + st.level + ')' : '') + '</div><div class="starters">' +
    st.species.map((n) => {
      const p = data.pokemon.find((x) => x.name === n);
      return '<div class="starter">' + img(p.id) + '<div><strong>' + humanize(n) + '</strong></div><div>' + p.types.map(typeBadge).join('') + '</div></div>';
    }).join('') + '</div>';
}

function renderWhere(mon, reach, stageNeeded) {
  if (!acq) return '';
  const version = $('version').value;
  const w = whereToGet(data, acq, mon, version);
  if (!w.direct.length) return '<li class="meta">Onde obter: sem forma direta nesta versão</li>';
  const when = stageNeeded != null ? ' <span class="meta">(disponível: ' + stageLabel(stageNeeded, acq.progress?.leaderOrder) + ')</span>' : Number.isFinite(reach) && reach > 1 ? ' <span class="meta">(estimado: a partir do nv ' + reach + ')</span>' : '';
  let html = '<li><strong>Onde obter</strong>' + when + ': ' + routeHtml(w);
  // Se a própria espécie é rara na natureza, mostra também o caminho pela pré-evolução
  const bestPct = Math.max(0, ...w.direct.filter((s) => s.type === 'wild').map((s) => s.pct));
  const onlyRareWild = !w.from && w.direct.every((s) => s.type === 'wild') && bestPct < 10;
  const alt = onlyRareWild && preEvolutionRoute(data, acq, mon, version);
  if (alt) html += '<span class="meta">ou </span>' + routeHtml(alt);
  return html + '</li>';
}

// ---------------------------------------------------------------- aba Detonado (gerado a partir dos dados do jogo)
function showTab(which) {
  $('tabRec').setAttribute('aria-pressed', String(which === 'rec'));
  $('tabWalk').setAttribute('aria-pressed', String(which === 'walk'));
  $('recView').hidden = which !== 'rec';
  $('walk').hidden = which !== 'walk';
  if (which === 'walk') renderWalk();
}

async function renderWalk() {
  const box = $('walk');
  if (!walk) {
    box.innerHTML = '<div class="card">Carregando detonado…</div>';
    try { walk = await (await fetch(`data/${currentGame}-walkthrough.json`)).json(); } catch { box.innerHTML = '<div class="card">Este jogo ainda não tem detonado.</div>'; return; }
  }
  const v = walk.versions[$('version').value] ?? Object.values(walk.versions)[0];
  const q = ($('walkSearch')?.value ?? '').trim().toLowerCase();
  const mine = $('starter').value;
  const cur = $('stage').value === '' ? null : Number($('stage').value);
  const lead = walk.leaders;
  const mons = (party) => party.map((p) => humanize(p.species) + ' ' + p.level).join(', ');
  const locHtml = (l) => {
    const trainers = l.trainers.filter((t) => !mine || !t.forStarter || t.forStarter.includes(mine));
    const bySp = {};
    for (const w of l.wild) (bySp[w.species] ??= []).push(w);
    const parts = [];
    if (l.wild.length) parts.push('<div class="walk-h">Pokémon selvagens</div><ul class="walk-list">' + Object.entries(bySp).map(([sp, ws]) => '<li>' + humanize(sp) + ' — ' + ws.map((w) => w.method + (w.times ? ' (' + w.times.join('/') + ')' : '') + (w.detail ? ' [' + w.detail + ']' : '') + (w.gate ? ' [exige ' + (w.gate.leader ? 'HM + insígnia de ' + humanize(w.gate.leader.toLowerCase()) : w.method) + ']' : '') + ' nv ' + (w.min === w.max ? w.min : w.min + '–' + w.max) + ' (' + w.pct + '%' + (l.maps.length > 1 ? ', ' + w.where : '') + ')').join('; ') + '</li>').join('') + '</ul>');
    if (l.others.length) parts.push('<div class="walk-h">Presentes, trocas e encontros</div><ul class="walk-list">' + l.others.map((o) => '<li>' + humanize(o.species) + ' — ' + ({ gift: 'presente', static: 'encontro único', egg: 'ovo', trade: 'troca', prize: 'prêmio', event: 'evento' }[o.type] ?? o.type) + (o.level ? ' nv ' + o.level : '') + ' (' + o.where + ')' + (o.detail ? ' — ' + o.detail : '') + '</li>').join('') + '</ul>');
    if (l.items.length) parts.push('<div class="walk-h">Itens e TMs</div><ul class="walk-list">' + l.items.map((i) => '<li>' + (i.kind === 'TM/HM' ? 'TM/HM ' + humanize(i.move) : humanize(i.item.toLowerCase().replace(/_/g, '-'))) + ' — ' + ({ gym: 'prêmio do líder', gift: 'presente', mart: 'loja', ground: 'no chão', hidden: 'escondido' }[i.type] ?? i.type) + ' em ' + i.where + (i.x != null ? ' (' + i.x + ',' + i.y + ')' : '') + (i.by && i.type !== 'ground' && i.type !== 'hidden' ? ' — ' + i.by : '') + '</li>').join('') + '</ul>');
    if (l.tutors.length) parts.push('<div class="walk-h">Tutores</div><ul class="walk-list">' + l.tutors.map((t) => '<li>' + humanize(t.move) + ' — ' + t.where + (t.x != null ? ' (' + t.x + ',' + t.y + ')' : '') + (t.detail ? ' — ' + t.detail : '') + '</li>').join('') + '</ul>');
    if (trainers.length) parts.push('<div class="walk-h">Treinadores</div><ul class="walk-list">' + trainers.map((t) => '<li><strong>' + t.label + '</strong>' + (t.double ? ' (dupla)' : '') + ': ' + mons(t.party) + '</li>').join('') + '</ul>');
    return '<details class="loc"' + (q ? ' open' : '') + '><summary>' + l.name + (l.minLevel ? ' <span class="meta">nv ' + l.minLevel + '+</span>' : '') + '</summary>' + parts.join('') + '</details>';
  };
  const match = (l) => !q || l.name.toLowerCase().includes(q) || l.wild.some((w) => w.species.includes(q)) || l.others.some((o) => o.species.includes(q)) || l.trainers.some((t) => t.label.toLowerCase().includes(q));
  const stagesHtml = v.stages.map((s) => {
    const locs = s.locations.filter(match);
    if (q && !locs.length) return '';
    const L = s.leader;
    const leaderHtml = L && L.party.length ? '<div class="walk-h">Próximo líder</div><p><strong>' + humanize(L.name.toLowerCase()) + '</strong> — ' + (L.where ?? '') + '<br>' + L.party.map((p) => humanize(p.species) + ' nv ' + p.level + (p.item ? ' (' + p.item + ')' : '') + ': ' + p.moves.map(humanize).join(', ')).join('<br>') + (L.prize.length ? '<br><span class="meta">Prêmio: TM ' + L.prize.map(humanize).join(', ') + '</span>' : '') + '</p>' : '';
    const open = q || cur === s.stage || (cur == null && s.stage === 0);
    return '<details class="stage' + (cur === s.stage ? ' current' : '') + '"' + (open ? ' open' : '') + '><summary>' + stageLabel(s.stage, lead).replace(/^./, (c) => c.toUpperCase()) + ' <span class="meta">— ' + s.locations.length + ' locais</span></summary>' + leaderHtml + locs.map(locHtml).join('') + '</details>';
  }).join('');
  box.innerHTML = '<div class="card"><input type="text" id="walkSearch" placeholder="Buscar local, Pokémon ou treinador" value="' + q.replace(/"/g, '') + '"><p class="note">' + walk.credit + ' Os estágios são estimados pela ordem do detonado e pelas conexões do mapa.</p></div>' + (stagesHtml || '<div class="card">Nada encontrado.</div>');
  const input = $('walkSearch');
  input.addEventListener('input', () => { const pos = input.selectionStart; renderWalk().then(() => { const i = $('walkSearch'); i.focus(); i.setSelectionRange(pos, pos); }); });
}

function fillStarters() {
  const sel = $('starter');
  sel.innerHTML = '<option value="">não informar</option>' + (data.starters?.species ?? []).map((n) => '<option value="' + n + '">' + humanize(n) + '</option>').join('');
}

function fillStages() {
  const sel = $('stage');
  const p = acq?.progress;
  sel.innerHTML = '<option value="">não informar (estimar pelo nível)</option>' +
    (p ? Array.from({ length: 10 }, (_, s) => '<option value="' + s + '">' + stageLabel(s, p.leaderOrder) + '</option>').join('') : '');
  sel.disabled = !p;
  sel.title = p ? 'Estimado pela ordem do detonado (' + p.source + ')' : 'Sem linha do tempo para este jogo';
}

function fillTrainers() {
  const sel = $('trainer');
  sel.innerHTML = '<option value="">— escolher o Pokémon manualmente —</option>';
  const groups = new Map();
  const mine = $('starter').value;
  for (const t of trainers) {
    if (mine && t.forStarter && !t.forStarter.includes(mine)) continue; // luta de rival de outro inicial
    const g = t.group === 'Treinadores comuns' ? `Comuns — ${t.class}` : t.group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  for (const [g, list] of groups) {
    const og = document.createElement('optgroup');
    og.label = g;
    for (const t of list) {
      const o = document.createElement('option');
      o.value = t.key;
      o.textContent = `${t.label} (${t.party.length} Pokémon${t.double ? ', dupla' : ''})`;
      og.append(o);
    }
    sel.append(og);
  }
}

function pickTrainerMon(t, i) {
  const p = t.party[i];
  $('opp').value = p.species;
  $('oppLevel').value = p.level;
  // dvs (Gen 1–2) / iv (Gen 3): atributos reais do Pokémon do treinador no cálculo de dano
  known = { moves: p.moves, item: p.item, default: p.defaultMoves, dvs: p.dvs ?? null, iv: p.iv ?? null };
  teamMode = null;
  renderTeam(t, i);
  update();
}


function renderTeam(t, active) {
  const box = $('team');
  box.innerHTML = '';
  t.party.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${humanize(p.species)} nv ${p.level}`;
    b.setAttribute('aria-pressed', String(!teamMode && i === active));
    b.addEventListener('click', () => pickTrainerMon(t, i));
    box.append(b);
  });
  if (t.party.length > 1) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Contra o time inteiro';
    b.setAttribute('aria-pressed', String(!!teamMode));
    b.addEventListener('click', () => { teamMode = t; renderTeam(t, -1); update(); });
    box.append(b);
  }
}

// "nocauteia em 2 golpes; aguenta 4 (Stomp); age primeiro → vence"
function duelLine(d) {
  if (!d) return 'sem golpe útil contra ele';
  const n = (x) => (Number.isFinite(x) ? `${x} golpe${x > 1 ? 's' : ''}` : 'não nocauteia');
  const order = d.faster === 1 ? 'age primeiro' : d.faster === 0.5 ? 'velocidade igual' : 'age depois';
  const theirs = Number.isFinite(d.theirTurns) ? `ele precisa de ${n(d.theirTurns)} (${humanize(d.theirMove)})` : 'os golpes dele não o nocauteiam';
  return `${d.move ? 'Nocauteia em ' + n(d.myTurns) + ' com ' + humanize(d.move) : 'Sem golpe útil'}; ${theirs}; ${order} → <strong class="${d.win ? 'good' : 'bad'}">${d.win ? 'vence a troca' : 'perde a troca'}</strong>`;
}

function currentOpp() {
  const name = $('opp').value.trim().toLowerCase();
  return data.pokemon.find((p) => p.name === name);
}

function update() {
  const opp = currentOpp();
  const out = $('results');
  if (!opp) {
    $('oppInfo').innerHTML = '';
    out.innerHTML = '';
    return;
  }
  const oppLevel = Number($('oppLevel').value) || 0;
  $('oppInfo').innerHTML = `<div class="opp">${img(opp.id)}
    <div><strong>#${opp.id} ${humanize(opp.name)}</strong><br>${opp.types.map(typeBadge).join('')}
    <div class="meta">${data.game.generation >= 3 ? 'Habilidades: ' + (opp.abilities.map(humanize).join(', ') || '—') : ''}${known ? `<br>Golpes ${known.default ? '(padrão do jogo para o nível)' : '(definidos pelo jogo)'}: ${known.moves.map(humanize).join(', ')}${known.item ? `<br>Item: ${known.item}` : ''}` : oppLevel ? `<br>Golpes prováveis nv ${oppLevel}: ${likelyMoveset(opp, oppLevel).map(humanize).join(', ')}` : ''}</div></div></div>`;

  const baseOpts = {
    level: Number($('level').value) || 1,
    version: $('version').value,
    onlyObtainable: $('onlyObtainable').checked,
    fullyEvolvedOnly: $('fullEvo').checked,
    includeLegendary: $('legend').checked,
    machines: $('machines').checked,
    stage: $('stage').value === '' ? null : Number($('stage').value),
    starter: $('starter').value || null,
    tradeEvolutions: $('tradeEvos').checked,
    acq,
  };
  if (teamMode) { renderTeamResults(teamMode, baseOpts, out); return; }
  const { picks, threats, threatSource } = recommend(data, opp, { ...baseOpts, oppLevel, oppMoves: known?.moves, oppDvs: known?.dvs, oppIv: known?.iv });

  const threatLine = threatSource.kind === 'known'
    ? `Ameaça pelos golpes ofensivos reais do oponente: ${threats.map(typeBadge).join('')}`
    : threatSource.kind === 'moveset'
      ? `Ameaça estimada pelos golpes ofensivos prováveis: ${threats.map(typeBadge).join('')}`
      : `Ameaça estimada pelos tipos do oponente (STAB): ${threats.map(typeBadge).join('')}`;

  out.innerHTML = `<p class="note">${threatLine}</p>` + (picks.length ? picks.map((s, i) => {
    const m = s.move;
    const src = m.via.source;
    const via = m.via.method === 'level-up' ? `aprende no nv ${m.via.level}`
      : m.via.method === 'machine' ? 'TM/HM' + (src ? ` (${src.type === 'gym' ? 'prêmio do ginásio de ' + src.leader : src.type === 'mart' ? 'loja: ' + src.where : src.where}${src.level != null ? `, estimativa nv ${src.level}+` : ''})` : '') /* loja sem selvagens por perto (Goldenrod Dept Store 5F): sem estimativa */
      : 'tutor' + (src ? ` (${src.where}${src.by ? ', ' + src.by : ''})` : '');
    const mvLine = `${humanize(m.name)} ${typeBadge(m.type)} · ${m.category === 'physical' ? 'físico' : 'especial'} · poder ${m.power} · prec. ${m.accuracy ?? '—'} · ${via}`;
    const inc = s.incoming.map((x) => `${typeBadge(x.type)}<span class="${x.mult < 1 ? 'good' : x.mult > 1 ? 'bad' : ''}">${fmtMult(x.mult)}</span>`).join(' ');
    return `<div class="card pick">${img(s.mon.id)}
      <div><h3>${i + 1}. ${humanize(s.mon.name)} <span class="meta">#${s.mon.id}</span></h3>
      <div>${s.mon.types.map(typeBadge).join('')}${data.game.generation >= 3 ? '<span class="meta">Hab.: ' + (s.mon.abilities.map(humanize).join(' / ') || '—') + '</span>' : ''}</div>
      <ul class="why">
        <li>Melhor golpe: ${mvLine} → <strong class="${m.eff > 1 ? 'good' : ''}">${fmtMult(m.eff)}</strong>${m.stab > 1 ? ' (STAB)' : ''}</li>
        <li>Troca de golpes: ${duelLine(s.duel)}</li>
        <li>Dano que recebe: ${inc}</li>
        ${renderWhere(s.mon, s.reach, s.stageNeeded)}
        ${unreliableLine(s)}
        <li class="meta">Stats base: HP ${s.mon.stats.hp} · Atq ${s.mon.stats.attack} · Def ${s.mon.stats.defense} · AtqE ${s.mon.stats['special-attack']} · DefE ${s.mon.stats['special-defense']} · Vel ${s.mon.stats.speed}${s.fasterBase ? ' (mais rápido que o oponente)' : ''}</li>
      </ul></div></div>`;
  }).join('') : '<div class="card">Nenhuma sugestão com esses filtros.</div>');
}

// modo "contra o time inteiro": as 3 que vencem mais Pokémon do time, com a troca contra cada um
function renderTeamResults(t, opts, out) {
  const { picks } = recommendTeam(data, t.party, opts);
  out.innerHTML = `<p class="note">Contra o time inteiro de ${t.label}: as sugestões que vencem a troca de golpes contra mais Pokémon do time (cálculo de dano da Geração ${roman(data.game.generation)}, com o nível e os golpes reais de cada um).</p>` +
    (picks.length ? picks.map((s, i) => `<div class="card pick">${img(s.mon.id)}
      <div><h3>${i + 1}. ${humanize(s.mon.name)} <span class="meta">— vence ${s.wins} de ${s.total}</span></h3>
      <div>${s.mon.types.map(typeBadge).join('')}</div>
      <ul class="why">${s.vs.map((x) => `<li><strong>${humanize(x.opp)} nv ${x.level}</strong>: ${duelLine(x.duel)}</li>`).join('')}
        ${renderWhere(s.mon, s.reach, s.stageNeeded)}${unreliableLine(s)}</ul></div></div>`).join('') : '<div class="card">Nenhuma sugestão com esses filtros.</div>');
}

// E2: aviso quando, até aqui, a espécie só sai por origem aleatória/condicionada (surto, Poké Radar, sorteio diário…)
function unreliableLine(s) {
  return s.unreliable ? `<li class="bad">⚠ Até aqui só por origem aleatória ou condicionada: ${s.unreliable}.</li>` : '';
}

for (const id of ['level', 'version', 'onlyObtainable', 'fullEvo', 'legend', 'machines', 'tradeEvos', 'stage']) $(id).addEventListener('input', update);
// Digitar manualmente o Pokémon ou o nível do oponente sai do modo "treinador" (os golpes deixam de ser os do jogo)
for (const id of ['opp', 'oppLevel']) $(id).addEventListener('input', () => { known = null; teamMode = null; $('trainer').value = ''; $('team').innerHTML = ''; update(); });
$('trainer').addEventListener('change', () => {
  const t = trainers.find((x) => x.key === $('trainer').value);
  if (!t) { known = null; teamMode = null; $('team').innerHTML = ''; update(); return; }
  pickTrainerMon(t, 0);
});

// ---------------------------------------------------------------- tela inicial (catálogo)
function chipRow(el, items, current, label, onPick) {
  el.innerHTML = '';
  for (const [value, text] of [[null, 'Todas'], ...items.map((x) => [x, label(x)])]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => onPick(value === current ? null : value));
    el.append(b);
  }
}

function renderHome() {
  const games = catalog.games;
  chipRow($('platformChips'), platformsOf(games), filters.platform, (p) => p, (v) => { location.hash = homeHash({ ...filters, platform: v }); });
  chipRow($('genChips'), generationsOf(games), filters.generation, (n) => 'Geração ' + roman(n), (v) => { location.hash = homeHash({ ...filters, generation: v }); });
  const list = filterGames(games, filters);
  $('gameCount').textContent = list.length + (list.length === 1 ? ' jogo' : ' jogos') + ' · ' + list.filter((g) => g.status === 'supported').length + ' disponível(is) no app';
  $('gameList').innerHTML = groupByGeneration(list).map(([gen, gs]) =>
    '<h2 class="gen-head">Geração ' + roman(gen) + '</h2><div class="games">' + gs.map((g) => {
      const on = g.status === 'supported';
      const body = '<strong>' + g.label + '</strong><span class="meta">' + g.platforms.join(' + ') + ' · ' + g.year + '</span>' +
        (g.note ? '<br><span class="meta">' + g.note + '</span>' : '') +
        (g.walkthrough ? '<br><span class="meta">📖 detonado disponível</span>' : '') +
        '<br><span class="badge' + (on ? ' on' : '') + '">' + (on ? 'Disponível' : 'Em breve') + '</span>' +
        (on && g.validation === 'pokeapi' ? ' <span class="badge">dados da PokéAPI, sem validação de decomp</span>' : '') +
        (on && g.validation === 'decomp-core' && !g.hasWalkthrough ? ' <span class="badge">núcleo conferido no decomp (parcial)</span>' : '');
      return on ? '<a class="game" href="#/jogo/' + g.id + '">' + body + '</a>' : '<div class="game off">' + body + '</div>';
    }).join('') + '</div>').join('') || '<div class="card">Nenhum jogo com esses filtros.</div>';
  $('catalogSources').textContent = 'Fontes do catálogo: ' + catalog.sources.join(' · ');
}

async function route() {
  if (!catalog) catalog = await (await fetch('data/games.json')).json();
  const r = parseRoute(location.hash);
  const game = r.view === 'game' && catalog.games.find((g) => g.id === r.gameId && g.status === 'supported');
  $('home').hidden = !!game;
  $('tool').hidden = !game;
  if (!game) {
    filters.platform = r.params.plataforma ?? null;
    filters.generation = r.params.geracao ? Number(r.params.geracao) : null;
    document.title = 'Poke Tact';
    renderHome();
    return;
  }
  if (currentGame !== game.id) { await load(game.id); window.scrollTo(0, 0); }
  applyGameParams(r.params);
}

// Estado opcional vindo da URL: ?versao=…&treinador=…&i=…  ou  ?pokemon=…&nivel=…&meu=…
function applyGameParams(p) {
  if (p.versao && [...$('version').options].some((o) => o.value === p.versao)) $('version').value = p.versao;
  if (p.meu) $('level').value = p.meu;
  if (p.inicial && [...$('starter').options].some((o) => o.value === p.inicial)) { $('starter').value = p.inicial; fillTrainers(); }
  if (p.aba === 'detonado') showTab('walk');
  if (p.insignias != null && [...$('stage').options].some((o) => o.value === p.insignias)) $('stage').value = p.insignias;
  const t = p.treinador && trainers.find((x) => x.key === p.treinador);
  if (t) { $('trainer').value = t.key; pickTrainerMon(t, Math.min(Number(p.i) || 0, t.party.length - 1)); return; }
  if (p.pokemon) { known = null; $('opp').value = p.pokemon; $('oppLevel').value = p.nivel ?? ''; }
  update();
}
window.addEventListener('hashchange', route);
route();

$('starter').addEventListener('input', () => { const t = $('trainer').value; fillTrainers(); $('trainer').value = [...$('trainer').options].some((o) => o.value === t) ? t : ''; update(); });

$('tabRec').addEventListener('click', () => showTab('rec'));
$('tabWalk').addEventListener('click', () => showTab('walk'));
for (const id of ['version', 'stage', 'starter']) $(id).addEventListener('input', () => { if (!$('walk').hidden) renderWalk(); });
