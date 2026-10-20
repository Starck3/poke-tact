import { recommend, recommendTeam, effectiveness, humanize, likelyMoveset, whereToGet, formatSources, describeEvolution, preEvolutionRoute, stageLabel } from './engine.mjs';
import { filterGames, groupByGeneration, generationSummaries, roman, parseRoute, homeHash, spriteFolder } from './catalog.mjs';
import { findOpponent, searchOpponents, opponentWarning } from './pokedex.mjs';

const COLORS = {
  normal: '#8a8a59', fire: '#e8742c', water: '#5a7fe8', electric: '#d9ad12', grass: '#5ca83c', ice: '#6bb8b8',
  fighting: '#a8231c', poison: '#923a92', ground: '#c9a24a', flying: '#8a73d8', psychic: '#e8457a', bug: '#8a9a14',
  rock: '#9a8528', ghost: '#5f4a8a', dragon: '#5a24e8', dark: '#5a4a3f', steel: '#8a8aa5', fairy: '#d685ad',
};
const $ = (id) => document.getElementById(id);
// sprites da própria versão do jogo (pasta do repositório PokeAPI/sprites)
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const sprite = (id) => `${SPRITES}versions/generation-${roman(data.game.generation).toLowerCase()}/${spriteFolder(currentGame, $('version').value)}/${id}.png`;
// <img> com substituto: se a pasta da versão não existir (ex.: Gen 9), usa o sprite padrão
const img = (id) => `<img src="${sprite(id)}" alt="" onerror="this.onerror=null;this.src='${SPRITES}${id}.png'">`;
const typeBadge = (t) => `<span class="type" style="background:${COLORS[t]}">${t}</span>`;
const fmtMult = (m) => (m === 0 ? '0×' : m === 0.5 ? '½×' : m === 0.25 ? '¼×' : `${m}×`);
const lozenge = (kind, text, title = '') => `<span class="lozenge ${kind}"${title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''}>${text}</span>`;
// selo de qualidade dos dados (um só, no lugar dos avisos longos): verificado no decomp / parcial / só PokéAPI
const QUALITY = {
  ok: ['ok', '✓ Verificado no código do jogo', 'Espécies, golpes, treinadores, onde obter e progresso conferidos com o decomp do jogo.'],
  partial: ['warn', '◐ Parcialmente verificado', 'Parte dos dados foi conferida com o código do jogo ou com as tabelas extraídas dele; o resto vem da PokéAPI. Detalhes em "Sobre os dados".'],
  pokeapi: ['neutral', 'Dados da PokéAPI', 'Dados da PokéAPI com as regras da geração, sem conferência com o código do jogo.'],
};
// pkhex = núcleo conferido com as tabelas do jogo extraídas pelo PKHeX (jogos sem decomp) → parcial
const qualityOf = (g) => (g.validation === 'pokeapi' ? 'pokeapi' : g.partial || g.validation === 'pkhex' || (g.validation === 'decomp-core' && !g.hasWalkthrough) ? 'partial' : 'ok');
const qualityBadge = (g) => { const [k, t, tip] = QUALITY[qualityOf(g)]; return lozenge(k, t, tip); };
// contexto da partida (versão, progresso, nível) guardado por jogo no navegador — a URL tem prioridade
// o inicial fica de fora: o jogo sempre abre em "não informar" (só a URL ?inicial= escolhe um)
const CTX_FIELDS = ['version', 'stage', 'level'];
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
let pokedex = null; // Pokédex nacional [[número, nome]]: só para avisar que um Pokémon é de outra geração
fetch('data/pokedex.json').then((r) => r.json()).then((d) => { pokedex = d; }).catch(() => {});

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
  $('validationNote').hidden = !['pokeapi', 'decomp-core', 'pkhex'].includes(g.validation);
  $('onlyObtainable').disabled = false;
  $('validationNote').textContent = g.validation === 'pokeapi' ? 'Atenção: este jogo usa dados da PokéAPI com as regras da geração, ainda SEM conferência com o código do jogo (decomp). Treinadores, onde obter e progresso ainda não estão disponíveis.'
    : g.validation === 'decomp-core' ? 'Espécies, golpes, learnsets, TM/HM, tabela de tipos e treinadores conferidos com o código do jogo (decomp). Onde obter e progresso ainda não estão disponíveis.'
    : g.validation === 'pkhex' ? 'Atributos, tipos, habilidades e golpes aprendidos por nível (na ordem do jogo) conferidos com as tabelas extraídas do próprio jogo (PKHeX). Valores dos golpes: PokéAPI conferida com o Pokémon Showdown. Treinadores, onde obter e progresso ainda não estão disponíveis.' : '';
  $('walkthrough').innerHTML = !g.walkthrough ? '' : g.hasWalkthrough
    ? 'Ordem da história (aba Detonado) baseada no detonado do <a href="' + g.walkthrough + '" target="_blank" rel="noopener">PokeMythology</a>.'
    : 'Detonado deste jogo ainda não está no app; referência externa: <a href="' + g.walkthrough + '" target="_blank" rel="noopener">PokeMythology</a>.';
  document.title = g.label + ' — Poke Tact';
  $('version').innerHTML = g.versions.map((v) => '<option value="' + v.id + '">' + v.label + '</option>').join('');
  $('gameInfo').textContent = 'Carregando dados…';
  walk = null;
  showTab('rec');
  data = await (await fetch(`data/${gameId}.json`)).json();
  try { trainers = (await (await fetch(`data/${gameId}-trainers.json`)).json()).trainers; } catch { trainers = []; }
  try { acq = await (await fetch(`data/${gameId}-acquisition.json`)).json(); } catch { acq = null; }
  // núcleo + aquisição já conferidos (Gen 1): a nota diz só o que ainda falta
  if (g.validation === 'decomp-core') {
    // diz exatamente o que já foi conferido e o que falta
    const done = ['espécies, golpes, learnsets, TM/HM e tabela de tipos', trainers.length && 'treinadores', acq && 'onde obter e progresso'].filter(Boolean);
    const missing = [!trainers.length && 'treinadores', !acq && 'onde obter e progresso', !g.hasWalkthrough && 'detonado dentro do app'].filter(Boolean);
    $('validationNote').textContent = `Conferido com o código do jogo (decomp): ${done.join('; ')}.` + (missing.length ? ` Ainda não disponível: ${missing.join(', ')}.` : '');
    $('validationNote').hidden = !missing.length; // completo como a Gen 3: sem aviso
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
    (data.corrections ? ` + correções ${/PKHeX/.test(data.corrections.source) ? 'das tabelas do jogo extraídas pelo' : 'do decomp'} ${data.corrections.source} (${data.corrections.list.length})` : '') +
    (data.moveCrosscheck ? ` + golpes conferidos com ${data.moveCrosscheck.source}: ${data.moveCrosscheck.corrected} corrigidos, ${data.moveCrosscheck.flagged} divergências só sinalizadas` : '');
  renderStarters();
  if (!data.pokemon.some((p) => Object.values(p.obtainable ?? {}).some(Boolean))) {
    $('onlyObtainable').disabled = true;
    $('validationNote').textContent += ' A PokéAPI não tem dados de encontro deste jogo: o filtro "só o que dá para obter" fica desligado.';
  }
  // Jogos sem treinadores/onde obter: aviso próprio (antes era sobrescrito pelo texto abaixo e falava de treinadores e habilidades)
  if (!acq) $('disclaimer').textContent = `Sugestões usam os dados da PokéAPI para ${g.label} com as regras da Geração ${roman(data.game.generation)} (tabela de tipos, ${data.game.generation <= 3 ? 'categoria física/especial pelo tipo' : 'categoria física/especial de cada golpe'}${data.game.generation < 3 ? ', sem habilidades' : ''}). ` +
    (g.validation === 'decomp-core' ? 'Espécies, golpes e tabela conferidos com o código do jogo (decomp)' : g.validation === 'pkhex' ? 'Atributos, tipos, habilidades e golpes por nível conferidos com as tabelas do jogo (PKHeX)' : 'Ainda não conferidos com o código do jogo') +
    (trainers.length ? '; treinadores com os times e golpes do jogo; ainda sem onde obter e progresso.' : '; sem treinadores, onde obter e progresso.') +
    ' Com o nível do oponente, a ameaça vem do moveset padrão do jogo; sem nível, dos tipos dele.';
  else $('disclaimer').textContent =
    `Sugestões usam apenas dados da Geração ${roman(data.game.generation)} (tipos, stats base, golpes${data.game.generation >= 3 ? ' e habilidades' : ''} daquela geração). ` +
    'Disponibilidade = pode ser obtido nesta versão (selvagem, presente, troca dentro do jogo, prêmio…) ou evolui de algo assim; trocas com outros jogos, eventos e criação (breeding) não contam. ' +
    `Ao escolher um treinador do jogo, usamos o nível e os golpes reais do time dele (dados do próprio ${g.label})` +
    (data.game.generation >= 3 ? '; a habilidade do Pokémon dele não é determinada, então só imunidades de habilidade única entram na conta. ' : '. ') +
    'Sem treinador: com o nível do oponente, a ameaça vem do moveset padrão do jogo; sem nível, dos tipos dele.';
  restoreCtx();
  trainerCat = null;
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
  // o inicial fica só no seletor da barra do topo; o cartão com os iniciais poluía a tela
  $('starters').hidden = true;
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
  renderTrainerPicker();
}

// ---------------------------------------------------------------- oponente por categoria (abas) — no lugar do dropdown único
// ordem das abas; grupos que só alguns jogos têm (Equipe Aqua / Magma, Frontier Brains) entram antes dos comuns
const CAT_ORDER = ['Líderes de ginásio', 'Líderes de Kanto', 'Elite dos Quatro', 'Campeão', 'Rival'];
const CAT_LABEL = { 'Líderes de ginásio': 'Líderes', 'Treinadores comuns': 'Outros treinadores' };
let trainerCat = null;
const topLevel = (t) => Math.max(...t.party.map((p) => p.level));
function trainerCategories() {
  const mine = $('starter').value;
  const visible = trainers.filter((t) => !(mine && t.forStarter && !t.forStarter.includes(mine)));
  const groups = [...new Set(visible.map((t) => t.group))];
  const order = (g) => (CAT_ORDER.includes(g) ? CAT_ORDER.indexOf(g) : g === 'Treinadores comuns' ? 99 : 50);
  return groups.sort((a, b) => order(a) - order(b)).map((g) => ({ g, list: visible.filter((t) => t.group === g) }));
}
// dentro da categoria: ordem da história (líderes pela linha do tempo; demais pelo nível) e revanches no fim — inclusive as
// que o dado não marca (Emerald: 5 "Leader Roxanne" com níveis crescentes → a 1ª é a luta, as outras são revanches)
function orderTrainers(g, list) {
  const lead = (acq?.progress?.leaderOrder ?? []).map((n) => fold(n).replace(/[^a-z]/g, ''));
  const leadIdx = (t) => { const i = lead.indexOf(fold(t.name ?? '').replace(/[^a-z]/g, '')); return i < 0 ? 99 : i; };
  const sorted = [...list].sort((a, b) => (/Líderes/.test(g) ? leadIdx(a) - leadIdx(b) : 0) || topLevel(a) - topLevel(b));
  const seen = new Map();
  return sorted.map((t) => { const k = t.label + '|' + (t.forStarter ?? []).join() + (g === 'Rival' ? '|' + (t.map?.[0] ?? '') : ''); const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); return { t, rematch: !!t.rematch || n > 1 }; })
    .sort((a, b) => Number(a.rematch) - Number(b.rematch));
}
function renderTrainerPicker() {
  const cats = trainerCategories();
  $('trainerBox').hidden = !cats.length;
  if (!cats.length) return;
  const current = trainers.find((x) => x.key === $('trainer').value);
  if (current && cats.some((c) => c.g === current.group)) trainerCat = current.group;
  if (!cats.some((c) => c.g === trainerCat)) trainerCat = null;
  $('trainerCats').innerHTML = cats.map((c) => `<button type="button" role="tab" data-cat="${c.g}" aria-selected="${c.g === trainerCat}">${CAT_LABEL[c.g] ?? c.g}<span class="count">${c.list.length}</span></button>`).join('');
  for (const b of $('trainerCats').querySelectorAll('button')) b.addEventListener('click', () => { trainerCat = trainerCat === b.dataset.cat ? null : b.dataset.cat; renderTrainerPicker(); });
  const cat = cats.find((c) => c.g === trainerCat);
  const box = $('trainerPick');
  // sem categoria aberta, a lista de oponentes não aparece: só a orientação do que dá para escolher
  if (!cat) {
    const names = cats.map((c) => CAT_LABEL[c.g] ?? c.g);
    box.innerHTML = `<div class="hint">👆 Toque em <strong>${names.length > 1 ? names.slice(0, -1).join(', ') + ' ou ' + names.at(-1) : names[0]}</strong> para ver quem você pode enfrentar — com o time e os golpes reais. Se preferir, digite o Pokémon do oponente logo abaixo.</div>`;
    return;
  }
  if (cat.g === 'Treinadores comuns' || cat.list.length > 60) {
    // muitos: seletor agrupado por classe, com o lugar (vários "Youngster Joey" em mapas diferentes)
    const byClass = Object.groupBy(cat.list, (t) => t.class ?? 'Outros');
    box.innerHTML = `<select id="trainerCommon" aria-label="${CAT_LABEL[cat.g] ?? cat.g}"><option value="">— escolher um treinador (${cat.list.length}) —</option>` +
      Object.keys(byClass).sort((a, b) => a.localeCompare(b)).map((cl) => `<optgroup label="${cl}">` + byClass[cl].map((t) => `<option value="${t.key}"${t.key === current?.key ? ' selected' : ''}>${t.label}${t.map?.[0] ? ' — ' + t.map[0] : ''} · nv ${topLevel(t)}${t.rematch ? ' · revanche' : ''}</option>`).join('') + '</optgroup>').join('') + '</select>';
    $('trainerCommon').addEventListener('change', (e) => selectTrainer(e.target.value));
    return;
  }
  // poucos: botões com o ás do time, nome e nível; revanches separadas
  const items = orderTrainers(cat.g, cat.list);
  // com "Progresso" informado, o líder seguinte ganha o selo "próximo" (N insígnias → o (N+1)-º da linha do tempo)
  const stage = $('stage').value === '' ? null : Number($('stage').value);
  const nextLeader = /Líderes/.test(cat.g) && stage != null && acq?.progress?.leaderOrder?.[stage] ? fold(acq.progress.leaderOrder[stage]).replace(/[^a-z]/g, '') : null;
  const chip = ({ t, rematch }) => {
    const ace = data.pokemon.find((p) => p.name === t.party.at(-1)?.species);
    // lugar: mapa do decomp ou, na Gen 3, o que sobra do rótulo ("Brendan Route 103 Mudkip" → "Route 103"; "Vr" = Victory Road)
    const starterWords = new RegExp(`\\b(${(data.starters?.species ?? []).join('|') || '_'})\\b`, 'ig');
    const place = t.map?.[0] ?? (t.label.toLowerCase().startsWith(String(t.name).toLowerCase()) ? t.label.slice(String(t.name).length).replace(starterWords, '').replace(/\bVr\b/, 'Victory Road').trim() : '');
    const sub = [cat.g === 'Rival' && place, `nv ${topLevel(t)}`, `${t.party.length} Pokémon`, t.double && 'dupla'].filter(Boolean).join(' · ');
    const cap = (s) => (s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s.])(\S)/g, (m, a, b) => a + b.toUpperCase()) : s); // Gen 3: "BRENDAN" → "Brendan"
    const name = cap(cat.g === 'Rival' ? (t.carries ? `${t.name} (com ${humanize(t.carries)})` : t.name) : t.label.replace(/^(Leader|Elite Four|Champion|Gym Leader|Líder)\s+/i, ''));
    const isNext = !rematch && nextLeader && fold(t.name ?? '').replace(/[^a-z]/g, '') === nextLeader;
    return `<button type="button" class="tchip" data-key="${t.key}" aria-pressed="${t.key === current?.key}">${ace ? img(ace.id) : ''}<span><span class="t-name">${name}${isNext ? ' ' + lozenge('info', 'próximo') : ''}</span><span class="t-sub">${sub}</span></span></button>`;
  };
  const main = items.filter((x) => !x.rematch), again = items.filter((x) => x.rematch);
  const openAgain = again.some((x) => x.t.key === current?.key);
  box.innerHTML = `<div class="tgrid">${main.map(chip).join('')}</div>` +
    (again.length ? `<details class="filters"${openAgain ? ' open' : ''}><summary>Revanches (${again.length})</summary><div class="tgrid" style="margin-top:6px">${again.map(chip).join('')}</div></details>` : '');
  for (const b of box.querySelectorAll('.tchip')) b.addEventListener('click', () => selectTrainer(b.dataset.key));
}
function selectTrainer(key) {
  $('trainer').value = key;
  const t = trainers.find((x) => x.key === key);
  if (!t) { known = null; teamMode = null; $('team').innerHTML = ''; renderTrainerPicker(); update(); return; }
  pickTrainerMon(t, 0);
  renderTrainerPicker();
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
  return findOpponent(data.pokemon, $('opp').value);
}

function update() {
  renderOppWarn();
  const opp = currentOpp();
  const out = $('results');
  if (!opp) {
    $('oppInfo').innerHTML = '';
    // estado vazio com o próximo passo (em vez de tela em branco)
    out.innerHTML = data && !trainers.length ? '<div class="card empty"><strong>Quem você vai enfrentar?</strong><br>Digite o nome do Pokémon — atalho <kbd>/</kbd>.</div>' : '';
    return;
  }
  const oppLevel = Number($('oppLevel').value) || 0;
  // o que interessa para vencer: tipos de golpe que ele SOFRE mais (tabela de tipos do jogo + imunidade de habilidade única)
  const eff = data.types.map((t) => ({ t, m: effectiveness(data, t, opp) }));
  const row = (label, list, cls) => (list.length ? `<div class="weak-row"><span class="weak-label ${cls}">${label}</span>${list.map((x) => `<span class="weak-item">${typeBadge(x.t)}<span class="${cls}">${fmtMult(x.m)}</span></span>`).join('')}</div>` : '');
  const weakHtml = '<div class="weak">' +
    row('Fraco contra', eff.filter((x) => x.m > 1).sort((a, b) => b.m - a.m), 'good') +
    row('Resiste', eff.filter((x) => x.m > 0 && x.m < 1).sort((a, b) => a.m - b.m), 'bad') +
    row('Imune', eff.filter((x) => x.m === 0), 'bad') + '</div>';
  $('oppInfo').innerHTML = `<div class="opp">${img(opp.id)}
    <div><strong>#${opp.id} ${humanize(opp.name)}</strong><br>${opp.types.map(typeBadge).join('')}
    <div class="meta">${data.game.generation >= 3 ? 'Habilidades: ' + (opp.abilities.map(humanize).join(', ') || '—') : ''}${known ? `<br>Golpes ${known.default ? '(padrão do jogo para o nível)' : '(definidos pelo jogo)'}: ${known.moves.map(humanize).join(', ')}${known.item ? `<br>Item: ${known.item}` : ''}` : oppLevel ? `<br>Golpes prováveis nv ${oppLevel}: ${likelyMoveset(opp, oppLevel).map(humanize).join(', ')}` : ''}</div></div></div>` + weakHtml;

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

  // a ameaça é o que ELE usa contra você (não as fraquezas dele, que ficam no quadro do oponente)
  const threatLine = threatSource.kind === 'known'
    ? `Ele ataca com (golpes reais do time): ${threats.map(typeBadge).join('')}`
    : threatSource.kind === 'moveset'
      ? `Ele deve atacar com (golpes prováveis no nível): ${threats.map(typeBadge).join('')}`
      : `Ele deve atacar com golpes dos próprios tipos (sem nível informado): ${threats.map(typeBadge).join('')}`;

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
$('stage').addEventListener('input', () => renderTrainerPicker()); // selo "próximo" acompanha o progresso
for (const id of CTX_FIELDS) $(id).addEventListener('input', saveCtx);
// atalho "/" (como no Linear/GitHub): vai para a busca do oponente, fora de campos de texto
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') || $('tool').hidden) return;
  e.preventDefault();
  if ($('recView').hidden) showTab('rec');
  $('opp').focus(); $('opp').select();
});
// Digitar manualmente o Pokémon ou o nível do oponente sai do modo "treinador" (os golpes deixam de ser os do jogo)
for (const id of ['opp', 'oppLevel']) $(id).addEventListener('input', () => { known = null; teamMode = null; $('trainer').value = ''; $('team').innerHTML = ''; renderTrainerPicker(); update(); });
// autocompletar do oponente: só os Pokémon do jogo aberto (↑ ↓ escolhem, Enter confirma, Esc fecha)
function renderOppWarn() {
  const w = data && opponentWarning({ pokemon: data.pokemon, pokedex, generation: data.game.generation, gameLabel: catalog.games.find((g) => g.id === currentGame)?.label ?? data.game.label }, $('opp').value);
  $('oppWarn').hidden = !w;
  $('oppWarn').textContent = w ? '⚠ ' + w.text : '';
}
{
  const input = $('opp'), list = $('oppList');
  let items = [], sel = 0;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-activedescendant', ''); };
  const paint = () => {
    // já é um Pokémon do jogo (escolhido ou digitado por inteiro): nada a sugerir
    items = data && !findOpponent(data.pokemon, input.value) ? searchOpponents(data.pokemon, input.value) : [];
    sel = Math.min(sel, Math.max(items.length - 1, 0));
    if (!items.length) return close();
    list.innerHTML = items.map((p, i) => `<li role="option" id="oa${i}" aria-selected="${i === sel}" data-name="${p.name}">${img(p.id)}<strong>${humanize(p.name)}</strong><span class="ac-num">#${p.id}</span><span class="ac-types">${p.types.map(typeBadge).join('')}</span></li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', 'oa' + sel);
    list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (name) => { input.value = name; close(); input.dispatchEvent(new Event('input')); };
  input.addEventListener('input', () => { sel = 0; paint(); });
  input.addEventListener('focus', paint);
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; paint(); }
    else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); pick(items[sel].name); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-name]'); if (li) { e.preventDefault(); pick(li.dataset.name); } });
}
$('trainer').addEventListener('change', () => {
  const t = trainers.find((x) => x.key === $('trainer').value);
  if (!t) { known = null; teamMode = null; $('team').innerHTML = ''; update(); return; }
  pickTrainerMon(t, 0);
});

// ---------------------------------------------------------------- tela inicial (catálogo)
// fotos dos consoles (Evan-Amos, Wikimedia Commons, domínio público); o Switch 2 usa a do Switch
const CONSOLE_IMG = { 'Game Boy': 'game-boy', 'Game Boy Color': 'game-boy-color', 'Game Boy Advance': 'game-boy-advance', 'Nintendo DS': 'nintendo-ds', 'Nintendo 3DS': 'nintendo-3ds', 'Nintendo Switch': 'nintendo-switch', 'Nintendo Switch 2': 'nintendo-switch' };
const consoleImgs = (platforms) => [...new Set(platforms.map((p) => CONSOLE_IMG[p]).filter(Boolean))].map((f) => `<img src="img/consoles/${f}.png" alt="" loading="lazy">`).join('');

function renderHome() {
  const games = catalog.games;
  // a tela inicial mostra só as gerações (com os consoles); os jogos aparecem ao escolher uma
  $('genList').innerHTML = generationSummaries(games).map((s) => {
    const on = s.generation === filters.generation;
    const years = s.years[0] === s.years[1] ? s.years[0] : s.years.join('–');
    return `<a class="gen" href="${homeHash({ generation: on ? null : s.generation })}" aria-current="${on}"><span class="gen-art">${consoleImgs(s.platforms)}</span><strong>Geração ${roman(s.generation)}</strong><span class="meta">${s.platforms.join(' + ')} · ${years}</span><span class="meta">${s.count} ${s.count === 1 ? 'jogo' : 'jogos'}${s.supported < s.count ? ` · ${s.supported} no app` : ''}</span></a>`;
  }).join('');
  const list = filters.generation ? filterGames(games, { generation: filters.generation }) : [];
  $('gameCount').textContent = games.length + ' jogos · ' + games.filter((g) => g.status === 'supported').length + ' disponíveis no app';
  $('gameList').innerHTML = groupByGeneration(list).map(([gen, gs]) =>
    '<h2 class="gen-head" id="genGames">Geração ' + roman(gen) + ' <a class="note" href="#/">fechar ✕</a></h2><div class="games">' + gs.map((g) => {
      const on = g.status === 'supported';
      // arte do cartão: os iniciais do jogo (sobem ao passar o mouse); sem iniciais confirmados, uma Poké Ball
      const art = '<div class="game-art">' + (g.starters?.length ? g.starters.map((id) => `<img src="${SPRITES}${id}.png" alt="" loading="lazy">`).join('') : '<span class="pokeball"></span>') + '</div>';
      // um selo de qualidade por cartão (legenda explica uma vez) + "detonado no app" só quando existe de fato
      const body = art + '<strong>' + g.label + '</strong><span class="meta">' + g.platforms.join(' + ') + ' · ' + g.year + '</span>' +
        (g.note ? '<span class="meta">' + g.note + '</span>' : '') +
        '<span class="row">' + (on ? qualityBadge(g) : lozenge('neutral', 'Em breve')) + (on && g.hasWalkthrough ? lozenge('info', '📖 detonado no app') : '') + '</span>';
      return on ? '<a class="game" href="#/jogo/' + g.id + '">' + body + '</a>' : '<div class="game off">' + body + '</div>';
    }).join('') + '</div>').join('');
  $('catalogSources').textContent = 'Fontes do catálogo: ' + catalog.sources.join(' · ') + ' · Fotos dos consoles: Evan-Amos (Wikimedia Commons, domínio público)';
  // legenda só dos selos em uso (sem jogo parcial, o "Parcialmente verificado" não aparece)
  const used = new Set(games.filter((g) => g.status === 'supported').map(qualityOf));
  $('qualityLegend').innerHTML = Object.entries(QUALITY).filter(([q]) => used.has(q)).map(([, [k, t, tip]]) => `<span>${lozenge(k, t)} <span class="meta">${tip}</span></span>`).join('');
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
  $('resume').innerHTML = lg ? `<a class="card resume" href="#/jogo/${lg.id}">${pic(lg.starters?.[0])}<div><div class="meta">Continuar de onde parou</div><strong>Pokémon ${lg.label}</strong><div class="meta">${[ctx?.stage !== '' && ctx?.stage != null && (ctx.stage === '9' ? 'pós-jogo' : ctx.stage + ' insígnia(s)'), ctx?.level && 'time nv ' + ctx.level].filter(Boolean).join(' · ')}</div></div><span class="spacer"></span><span class="lozenge info">Abrir →</span></a>` : '';
  // números (Vercel): tudo calculado dos dados
  const verified = on.filter((g) => qualityOf(g) === 'ok').length, trainersN = on.reduce((a, g) => a + (g.trainerCount ?? 0), 0), b = catalog.benchmark;
  $('stats').innerHTML = [[on.length, 'jogos no app'], [verified, 'conferidos no código do jogo'], [trainersN.toLocaleString('pt-BR'), 'treinadores com o time real'], b && [b.winPct + '%', `das sugestões vencem a troca (${b.picks.toLocaleString('pt-BR')} testadas${b.games ? ` em ${b.games} jogos` : ''})`]]
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
    // ao escolher uma geração, leva até os jogos dela
    if (filters.generation) $('genGames')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
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
  if (t) { $('trainer').value = t.key; pickTrainerMon(t, Math.min(Number(p.i) || 0, t.party.length - 1)); renderTrainerPicker(); return; }
  if (p.pokemon) { known = null; $('opp').value = p.pokemon; $('oppLevel').value = p.nivel ?? ''; }
  update();
}
window.addEventListener('hashchange', route);
route();

$('starter').addEventListener('input', () => { const t = $('trainer').value; fillTrainers(); $('trainer').value = [...$('trainer').options].some((o) => o.value === t) ? t : ''; renderStarters(); update(); });

$('tabRec').addEventListener('click', () => showTab('rec'));
$('tabWalk').addEventListener('click', () => showTab('walk'));
for (const id of ['version', 'stage', 'starter']) $(id).addEventListener('input', () => { if (!$('walk').hidden) renderWalk(); });
