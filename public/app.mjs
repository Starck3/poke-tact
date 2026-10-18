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
const lozenge = (kind, text, title = '') => `<span class="lozenge ${kind}"${title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''}>${text}</span>`;
// selo de qualidade dos dados (um só, no lugar dos avisos longos): verificado no decomp / parcial / só PokéAPI
const QUALITY = {
  ok: ['ok', '✓ Verificado no código do jogo', 'Espécies, golpes, treinadores, onde obter e progresso conferidos com o decomp do jogo.'],
  partial: ['warn', '◐ Parcialmente verificado', 'Parte dos dados foi conferida com o decomp; o resto vem da PokéAPI. Detalhes em "Sobre os dados".'],
  pokeapi: ['neutral', 'Dados da PokéAPI', 'Dados da PokéAPI com as regras da geração, sem conferência com o código do jogo.'],
};
const qualityOf = (g) => (g.validation === 'pokeapi' ? 'pokeapi' : g.partial || (g.validation === 'decomp-core' && !g.hasWalkthrough) ? 'partial' : 'ok');
const qualityBadge = (g) => { const [k, t, tip] = QUALITY[qualityOf(g)]; return lozenge(k, t, tip); };
// contexto da partida (versão, inicial, progresso, nível) guardado por jogo no navegador — a URL tem prioridade
const CTX_FIELDS = ['version', 'starter', 'stage', 'level'];
const saveCtx = () => { try { localStorage.setItem(`poketact:${currentGame}`, JSON.stringify(Object.fromEntries(CTX_FIELDS.map((f) => [f, $(f).value])))); } catch {} };
const restoreCtx = () => {
  let c = null;
  try { c = JSON.parse(localStorage.getItem(`poketact:${currentGame}`) ?? 'null'); } catch {}
  if (!c) return;
  for (const f of CTX_FIELDS) { const el = $(f); if (c[f] == null) continue; if (el.tagName === 'SELECT' ? [...el.options].some((o) => o.value === c[f]) : true) el.value = c[f]; }
};
const skeleton = (n = 3) => '<div class="picks">' + Array.from({ length: n }, () => '<div class="card"><div class="skel" style="width:60%"></div><div class="skel"></div><div class="skel" style="width:80%"></div><div class="skel tall"></div></div>').join('') + '</div>';

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
  try { localStorage.setItem('poketact:last', gameId); } catch {} // "Continuar de onde parou" na tela inicial
  known = null; teamMode = null;
  for (const id of ['opp', 'oppLevel']) $(id).value = '';
  $('team').innerHTML = '';
  $('results').innerHTML = skeleton();
  $('oppInfo').innerHTML = '';
  $('gameTitle').textContent = 'Pokémon ' + g.label;
  $('qualityBadge').innerHTML = qualityBadge(g);
  $('tabWalk').hidden = !g.hasWalkthrough;
  document.querySelector('.tabs').hidden = !g.hasWalkthrough; // uma aba só não precisa de barra de abas
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
  // inicial só faz sentido com 2+ opções (Yellow: só Pikachu); progresso só com linha do tempo
  const choosable = (data.starters?.species?.length ?? 0) > 1;
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
  restoreCtx();
  fillTrainers();
  renderStarters();
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
  // escolher o inicial é o 1º passo do fluxo: os cartões são botões; depois de escolhido o cartão some (fica na barra do topo)
  if (!st?.species?.length || $('starter').value) { box.hidden = true; return; }
  box.hidden = false;
  const pickable = st.species.length > 1;
  box.innerHTML = '<div class="label">' + (pickable ? 'Qual foi o seu inicial? ' : 'Inicial deste jogo — ') + '<span class="meta">' + st.where + (st.level ? ' (nv ' + st.level + ')' : '') + '</span></div><div class="starters">' +
    st.species.map((n) => {
      const p = data.pokemon.find((x) => x.name === n);
      const inner = img(p.id) + '<div><strong>' + humanize(n) + '</strong></div><div>' + p.types.map(typeBadge).join('') + '</div>';
      return pickable ? '<button type="button" class="starter" data-starter="' + n + '" style="font:inherit;color:inherit;cursor:pointer">' + inner + '</button>' : '<div class="starter">' + inner + '</div>';
    }).join('') + '</div>' + (pickable ? '<p class="note" style="margin-bottom:0">Com o inicial, o rival e os Pokémon que só vêm por troca ficam certos.</p>' : '');
  for (const b of box.querySelectorAll('[data-starter]')) b.addEventListener('click', () => { $('starter').value = b.dataset.starter; $('starter').dispatchEvent(new Event('input')); });
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
  $('tabRec').setAttribute('aria-selected', String(which === 'rec'));
  $('tabWalk').setAttribute('aria-selected', String(which === 'walk'));
  $('recView').hidden = which !== 'rec';
  $('walk').hidden = which !== 'walk';
  if (which === 'walk') renderWalk();
}

async function renderWalk() {
  const box = $('walk');
  if (!walk) {
    box.innerHTML = '<div class="card" aria-busy="true"><div class="skel" style="width:40%"></div><div class="skel"></div></div>' + '<div class="skel tall"></div>'.repeat(3);
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
    // estado vazio com o próximo passo (em vez de tela em branco)
    out.innerHTML = data ? `<div class="card empty"><strong>Quem você vai enfrentar?</strong><br>${trainers.length ? 'Escolha um treinador do jogo acima (usa o time real) ou digite' : 'Digite'} o nome do Pokémon — atalho <kbd>/</kbd>.</div>` : '';
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

  out.innerHTML = `<p class="note threat">${threatLine}</p>` + (picks.length ? '<div class="picks">' + picks.map((s, i) => {
    const m = s.move;
    const src = m.via.source;
    const via = m.via.method === 'level-up' ? `aprende no nv ${m.via.level}`
      : m.via.method === 'machine' ? 'TM/HM' + (src ? ` (${src.type === 'gym' ? 'prêmio do ginásio de ' + src.leader : src.type === 'mart' ? 'loja: ' + src.where : src.where}${src.level != null ? `, estimativa nv ${src.level}+` : ''})` : '') /* loja sem selvagens por perto (Goldenrod Dept Store 5F): sem estimativa */
      : 'tutor' + (src ? ` (${src.where}${src.by ? ', ' + src.by : ''})` : '');
    const inc = s.incoming.map((x) => `${typeBadge(x.type)}<span class="${x.mult < 1 ? 'good' : x.mult > 1 ? 'bad' : ''}">${fmtMult(x.mult)}</span>`).join(' ');
    return `<div class="card pick">
      <div class="pick-head">${img(s.mon.id)}<div><div class="rank">#${i + 1} sugestão</div><h3>${humanize(s.mon.name)}</h3><div>${s.mon.types.map(typeBadge).join('')}</div></div></div>
      <div class="verdict">${verdictChips(s.duel, m, s.unreliable)}</div>
      <div class="kv"><b>Golpe</b>${humanize(m.name)} ${typeBadge(m.type)} <strong class="${m.eff > 1 ? 'good' : ''}">${fmtMult(m.eff)}</strong>${m.stab > 1 ? ' <span class="meta">STAB</span>' : ''}<br><span class="meta">${via}</span></div>
      ${howToGet(s)}
      <details class="more"><summary>Detalhes</summary><ul class="why">
        <li>${m.category === 'physical' ? 'Físico' : 'Especial'} · poder ${m.power} · precisão ${m.accuracy ?? '—'}</li>
        <li>Troca de golpes: ${duelLine(s.duel)}</li>
        <li>Dano que recebe: ${inc}</li>
        ${renderWhere(s.mon, s.reach, s.stageNeeded)}
        ${unreliableLine(s)}
        ${data.game.generation >= 3 ? '<li class="meta">Habilidades: ' + (s.mon.abilities.map(humanize).join(' / ') || '—') + '</li>' : ''}
        <li class="meta">Stats base: HP ${s.mon.stats.hp} · Atq ${s.mon.stats.attack} · Def ${s.mon.stats.defense} · AtqE ${s.mon.stats['special-attack']} · DefE ${s.mon.stats['special-defense']} · Vel ${s.mon.stats.speed}</li>
      </ul></details></div>`;
  }).join('') + '</div>' : '<div class="card empty">Nenhuma sugestão com esses filtros — tente desmarcar algum em <strong>Filtros</strong> ou subir o nível do seu time.</div>');
}

// veredito em selos: vence/perde, quantos golpes, quem age primeiro, aviso de origem aleatória
function verdictChips(d, m, unreliable) {
  if (!d) return lozenge('bad', 'sem golpe útil');
  const n = (x) => (Number.isFinite(x) ? `${x} golpe${x > 1 ? 's' : ''}` : '—');
  return [d.win ? lozenge('ok', '✓ Vence a troca') : lozenge('bad', '✗ Perde a troca'),
    lozenge('neutral', `nocauteia em ${n(d.myTurns)}`),
    d.faster === 1 ? lozenge('info', 'age primeiro') : lozenge('neutral', d.faster === 0.5 ? 'velocidade igual' : 'age depois'),
    unreliable ? lozenge('warn', '⚠ origem aleatória', unreliable) : ''].join('');
}

// uma linha de "como conseguir" (a 1ª fonte, já ordenada por estágio) + quando fica disponível
function howToGet(s) {
  if (!acq) return '';
  const w = whereToGet(data, acq, s.mon, $('version').value);
  if (!w.direct.length) return '';
  // a fonte que libera mais cedo (estágio/nível), não a 1ª selvagem: o Machop no HGSS saía "Mt. Mortar" (estágio 6) com a
  // troca da Goldenrod (estágio 2) disponível
  const at = (x) => (s.stageNeeded != null ? Math.max(x.stage ?? 9, x.gate?.stage ?? 0) : Math.max(x.min ?? x.level ?? 1, x.gate?.level ?? 1));
  const best = [...w.direct].sort((a, b) => at(a) - at(b) || (b.pct ?? 0) - (a.pct ?? 0))[0];
  const first = formatSources([best], 1)[0] ?? '';
  const when = s.stageNeeded != null ? stageLabel(s.stageNeeded, acq.progress?.leaderOrder) : Number.isFinite(s.reach) && s.reach > 1 ? `a partir do nv ${s.reach}` : '';
  return `<div class="kv"><b>Como conseguir${when ? ` · ${when}` : ''}</b>${w.from ? `evolua de ${humanize(w.from)} · ` : ''}${first.replace(/ — (exige|estimativa:) .*$/, '')}</div>`; /* porta (HM/insígnia) e estimativa de área ficam em "Detalhes" */
}

// modo "contra o time inteiro": as 3 que vencem mais Pokémon do time, com a troca contra cada um
function renderTeamResults(t, opts, out) {
  const { picks } = recommendTeam(data, t.party, opts);
  out.innerHTML = `<p class="note">Contra o time inteiro de ${t.label}: as sugestões que vencem a troca de golpes contra mais Pokémon do time (cálculo de dano da Geração ${roman(data.game.generation)}, com o nível e os golpes reais de cada um).</p>` +
    (picks.length ? '<div class="picks">' + picks.map((s, i) => `<div class="card pick">
      <div class="pick-head">${img(s.mon.id)}<div><div class="rank">#${i + 1} sugestão</div><h3>${humanize(s.mon.name)}</h3><div>${s.mon.types.map(typeBadge).join('')}</div></div></div>
      <div class="verdict">${lozenge(s.wins === s.total ? 'ok' : s.wins ? 'warn' : 'bad', `vence ${s.wins} de ${s.total}`)}${s.unreliable ? lozenge('warn', '⚠ origem aleatória', s.unreliable) : ''}</div>
      <div class="kv"><b>Contra cada um</b>${s.vs.map((x) => `${x.duel?.win ? '<span class="good">✓</span>' : '<span class="bad">✗</span>'} ${humanize(x.opp)} nv ${x.level}`).join('<br>')}</div>
      ${howToGet(s)}
      <details class="more"><summary>Detalhes</summary><ul class="why">${s.vs.map((x) => `<li><strong>${humanize(x.opp)} nv ${x.level}</strong>: ${duelLine(x.duel)}</li>`).join('')}
        ${renderWhere(s.mon, s.reach, s.stageNeeded)}${unreliableLine(s)}</ul></details></div>`).join('') + '</div>' : '<div class="card empty">Nenhuma sugestão com esses filtros.</div>');
}

// E2: aviso quando, até aqui, a espécie só sai por origem aleatória/condicionada (surto, Poké Radar, sorteio diário…)
function unreliableLine(s) {
  return s.unreliable ? `<li class="bad">⚠ Até aqui só por origem aleatória ou condicionada: ${s.unreliable}.</li>` : '';
}

for (const id of ['level', 'version', 'onlyObtainable', 'fullEvo', 'legend', 'machines', 'tradeEvos', 'stage']) $(id).addEventListener('input', update);
for (const id of CTX_FIELDS) $(id).addEventListener('input', saveCtx);
// atalho "/" (como no Linear/GitHub): vai para a busca do oponente, fora de campos de texto
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') || $('tool').hidden) return;
  e.preventDefault();
  if ($('recView').hidden) showTab('rec');
  $('opp').focus(); $('opp').select();
});
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
      // arte do cartão: os iniciais do jogo (sobem ao passar o mouse); sem iniciais confirmados, uma Poké Ball
      const art = '<div class="game-art">' + (g.starters?.length ? g.starters.map((id) => `<img src="${SPRITES}${id}.png" alt="" loading="lazy">`).join('') : '<span class="pokeball"></span>') + '</div>';
      // um selo de qualidade por cartão (legenda explica uma vez) + "detonado no app" só quando existe de fato
      const body = art + '<strong>' + g.label + '</strong><span class="meta">' + g.platforms.join(' + ') + ' · ' + g.year + '</span>' +
        (g.note ? '<span class="meta">' + g.note + '</span>' : '') +
        '<span class="row">' + (on ? qualityBadge(g) : lozenge('neutral', 'Em breve')) + (on && g.hasWalkthrough ? lozenge('info', '📖 detonado no app') : '') + '</span>';
      return on ? '<a class="game" href="#/jogo/' + g.id + '">' + body + '</a>' : '<div class="game off">' + body + '</div>';
    }).join('') + '</div>').join('') || '<div class="card">Nenhum jogo com esses filtros.</div>';
  $('catalogSources').textContent = 'Fontes do catálogo: ' + catalog.sources.join(' · ');
  $('qualityLegend').innerHTML = Object.entries(QUALITY).map(([, [k, t, tip]]) => `<span>${lozenge(k, t)} <span class="meta">${tip}</span></span>`).join('');
  renderHero();
}

// ---------------------------------------------------------------- tela inicial: herói, busca, continuar, números
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pic = (id) => (id ? `<img src="${SPRITES}${id}.png" alt="" loading="lazy">` : '<span class="pokeball" style="width:32px;height:32px;margin:4px"></span>');
let searchIndex = null, heroTimer = null, typeTimer = null;
function buildSearchIndex() {
  const on = catalog.games.filter((g) => g.status === 'supported');
  // siglas que os jogadores usam, tiradas das maiúsculas de cada versão: HeartGold → hg, FireRed + LeafGreen → frlg, Black 2 → b2
  const abbr = (g) => { const a = g.versions.map((v) => (v.label.match(/[A-Z0-9]/g) ?? []).join('')); return [...a, a.join('')].join(' '); };
  return [
    ...on.map((g) => ({ kind: 'jogo', href: `#/jogo/${g.id}`, title: 'Pokémon ' + g.label, sub: `Geração ${roman(g.generation)} · ${g.platforms.join(' + ')} · ${g.year}`, img: g.starters?.[0], hay: fold([g.label, abbr(g), ...g.versions.map((v) => v.label), ...g.platforms, g.year, 'geracao ' + g.generation, 'gen ' + g.generation].join(' ')) })),
    ...on.flatMap((g) => (g.bosses ?? []).map((b) => ({ kind: 'luta', href: `#/jogo/${g.id}?treinador=${b.key}`, title: b.label, sub: g.label, img: b.ace, hay: fold(b.label + ' ' + g.label + ' ' + abbr(g)) }))),
  ];
}
function searchResults(q) {
  const t = fold(q.trim());
  if (!t) return [];
  const words = t.split(/\s+/);
  return searchIndex.map((it) => {
    if (!words.every((w) => it.hay.includes(w))) return null;
    const title = fold(it.title);
    return { it, score: (title.startsWith(t) ? 0 : title.split(/\s+/).some((w) => w.startsWith(words[0])) ? 1 : 2) + (it.kind === 'jogo' ? 0 : 0.5) };
  }).filter(Boolean).sort((a, b) => a.score - b.score).slice(0, 8).map((x) => x.it);
}
function renderHero() {
  searchIndex ??= buildSearchIndex();
  const on = catalog.games.filter((g) => g.status === 'supported');
  // "Qual Pokémon [inicial] vence a sua próxima luta [ás do líder]?" — os pares giram (sem movimento se o usuário pedir)
  const pairs = on.flatMap((g) => (g.bosses ?? []).filter((b) => b.ace && /Leader|Champion|Elite/.test(b.label)).map((b) => [g.starters?.[0], b.ace])).filter(([a]) => a);
  let k = Math.floor(Math.random() * pairs.length);
  const showPair = () => { const [a, b] = pairs[k++ % pairs.length] ?? []; $('heroA').innerHTML = pic(a); $('heroB').innerHTML = pic(b); };
  showPair();
  clearInterval(heroTimer);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) heroTimer = setInterval(showPair, 3200);
  // atalhos: lutas famosas que existem nos dados
  const want = [['heartgold-soulsilver', 'Whitney'], ['red-blue', 'Brock'], ['platinum', 'Cynthia'], ['emerald', 'Wallace'], ['crystal', 'Clair']];
  $('quickPicks').innerHTML = '<span class="meta" style="align-self:center">Experimente:</span>' + want.map(([gid, n]) => {
    const g = on.find((x) => x.id === gid); const b = g?.bosses?.find((x) => x.label.includes(n));
    return b ? `<a href="#/jogo/${gid}?treinador=${b.key}">${pic(b.ace)}${n} · ${g.label}</a>` : '';
  }).join('');
  // continuar de onde parou (última partida salva no navegador)
  let last = null, ctx = null;
  try { last = localStorage.getItem('poketact:last'); ctx = JSON.parse(localStorage.getItem(`poketact:${last}`) ?? 'null'); } catch {}
  const lg = last && on.find((g) => g.id === last);
  $('resume').innerHTML = lg ? `<a class="card resume" href="#/jogo/${lg.id}">${pic(lg.starters?.[0])}<div><div class="meta">Continuar de onde parou</div><strong>Pokémon ${lg.label}</strong><div class="meta">${[ctx?.starter && 'inicial: ' + humanize(ctx.starter), ctx?.stage !== '' && ctx?.stage != null && (ctx.stage === '9' ? 'pós-jogo' : ctx.stage + ' insígnia(s)'), ctx?.level && 'time nv ' + ctx.level].filter(Boolean).join(' · ')}</div></div><span class="spacer"></span><span class="lozenge info">Abrir →</span></a>` : '';
  // números (Vercel): tudo calculado dos dados
  const verified = on.filter((g) => qualityOf(g) === 'ok').length, trainersN = on.reduce((a, g) => a + (g.trainerCount ?? 0), 0), b = catalog.benchmark;
  $('stats').innerHTML = [[on.length, 'jogos no app'], [verified, 'conferidos no código do jogo'], [trainersN.toLocaleString('pt-BR'), 'treinadores com o time real'], b && [b.winPct + '%', `das sugestões vencem a troca (${b.picks.toLocaleString('pt-BR')} testadas)`]]
    .filter(Boolean).map(([n, t]) => `<div class="stat card"><b>${n}</b><span class="meta">${t}</span></div>`).join('');
  startTypingPlaceholder();
}
// placeholder que "digita" exemplos (Mobbin); para ao focar ou com movimento reduzido
function startTypingPlaceholder() {
  const el = $('homeSearch');
  clearTimeout(typeTimer);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ex = ['Whitney', 'HeartGold', 'Cynthia', 'Game Boy Advance', 'Misty', 'Geração 3', 'Lance'];
  let i = 0, j = 0, back = false;
  const tick = () => {
    if (document.activeElement === el || el.value || $('home').hidden) { el.placeholder = 'Busque um jogo ou um líder…'; typeTimer = setTimeout(tick, 1200); return; }
    const w = ex[i % ex.length];
    j += back ? -1 : 1;
    el.placeholder = 'Busque: ' + w.slice(0, j) + (j % 2 ? '▏' : '');
    if (!back && j >= w.length) { back = true; typeTimer = setTimeout(tick, 1400); return; }
    if (back && j <= 0) { back = false; i++; }
    typeTimer = setTimeout(tick, back ? 45 : 95);
  };
  tick();
}
// busca com teclado: ↑ ↓ escolhem, Enter abre, Esc limpa
{
  const input = $('homeSearch'), box = $('homeResults');
  let items = [], sel = 0;
  const paint = () => {
    box.hidden = !input.value.trim();
    $('searchBox').setAttribute('aria-expanded', String(!box.hidden));
    box.innerHTML = items.length ? items.map((it, i) => `<li role="option" id="hr${i}" aria-selected="${i === sel}" data-href="${it.href}">${pic(it.img)}<div><strong>${it.title}</strong><div class="meta">${it.sub}</div></div><span class="r-kind lozenge ${it.kind === 'jogo' ? 'neutral' : 'info'}">${it.kind === 'jogo' ? 'jogo' : 'ir para a luta'}</span></li>`).join('')
      : '<li class="meta" style="cursor:default">Nada encontrado — tente o nome de um jogo (ex.: Emerald) ou de um líder (ex.: Brock).</li>';
    input.setAttribute('aria-activedescendant', items.length ? 'hr' + sel : '');
  };
  input.addEventListener('input', () => { items = searchResults(input.value); sel = 0; paint(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; paint(); } }
    else if (e.key === 'Enter' && items[sel]) { location.hash = items[sel].href; input.value = ''; paint(); }
    else if (e.key === 'Escape') { input.value = ''; items = []; paint(); }
  });
  box.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-href]'); if (li) { e.preventDefault(); location.hash = li.dataset.href; input.value = ''; paint(); } });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 120));
  input.addEventListener('focus', () => { if (input.value.trim()) paint(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !$('home').hidden && document.activeElement !== input && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')) { e.preventDefault(); input.focus(); }
  });
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
  if (p.inicial && [...$('starter').options].some((o) => o.value === p.inicial)) { $('starter').value = p.inicial; fillTrainers(); renderStarters(); }
  if (p.aba === 'detonado') showTab('walk');
  if (p.insignias != null && [...$('stage').options].some((o) => o.value === p.insignias)) $('stage').value = p.insignias;
  const t = p.treinador && trainers.find((x) => x.key === p.treinador);
  if (t) { $('trainer').value = t.key; pickTrainerMon(t, Math.min(Number(p.i) || 0, t.party.length - 1)); return; }
  if (p.pokemon) { known = null; $('opp').value = p.pokemon; $('oppLevel').value = p.nivel ?? ''; }
  update();
}
window.addEventListener('hashchange', route);
route();

$('starter').addEventListener('input', () => { const t = $('trainer').value; fillTrainers(); $('trainer').value = [...$('trainer').options].some((o) => o.value === t) ? t : ''; renderStarters(); update(); });

$('tabRec').addEventListener('click', () => showTab('rec'));
$('tabWalk').addEventListener('click', () => showTab('walk'));
for (const id of ['version', 'stage', 'starter']) $(id).addEventListener('input', () => { if (!$('walk').hidden) renderWalk(); });
