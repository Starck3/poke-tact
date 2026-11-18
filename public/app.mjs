import { recommend, recommendTeam, LEVEL_MARGIN, effectiveness, humanize, likelyMoveset, whereToGet, formatSources, describeEvolution, preEvolutionRoute, stageLabel, catchReport, evolutionReport, typeIndex, strongestMovesByLevel, estimatedMoveset, moveWorth, battleForm, pctText, shownDetail, withoutDlc, hasDlc } from './engine.mjs';
import { filterGames, groupByGeneration, generationSummaries, roman, parseRoute, homeHash, spritePath } from './catalog.mjs';
import { findOpponent, searchOpponents, opponentWarning } from './pokedex.mjs';
import { matchup, monsFor, chartDiffs, TYPE_PT } from './typechart.mjs';

const COLORS = {
  normal: '#8a8a59', fire: '#e8742c', water: '#5a7fe8', electric: '#d9ad12', grass: '#5ca83c', ice: '#6bb8b8',
  fighting: '#a8231c', poison: '#923a92', ground: '#c9a24a', flying: '#8a73d8', psychic: '#e8457a', bug: '#8a9a14',
  rock: '#9a8528', ghost: '#5f4a8a', dragon: '#5a24e8', dark: '#5a4a3f', steel: '#8a8aa5', fairy: '#d685ad',
};
const $ = (id) => document.getElementById(id);
// sprites da própria versão do jogo (pasta do repositório PokeAPI/sprites)
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const sprite = (id) => `${SPRITES}versions/${spritePath(data.game.generation, currentGame, $('version').value)}/${id}.png`;
// <img> com substituto: se a pasta da versão não existir (ex.: Gen 9), usa o sprite padrão
// forma regional (Legends: Arceus: Typhlosion de Hisui = variedade 10233 da PokéAPI) → sprite da forma
const img = (id0) => { const id = data?.pokemon.find((p) => p.id === id0)?.spriteId ?? id0; return `<img src="${sprite(id)}" alt="" onerror="this.onerror=null;this.src='${SPRITES}${id}.png'">`; };
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
// tags do que o jogo tem no app (ao lado do selo de verificação): detonado e onde capturar (com fotos/mapa no tooltip)
const featureTags = (g) => (g.hasWalkthrough ? lozenge('info', '📖 detonado no app', 'Aba Detonado: a história em ordem, com os Pokémon, presentes e treinadores de cada lugar.') : '') +
  (g.capture ? lozenge('info', '📍 capturas disponíveis', 'Aba Onde capturar: todos os locais de cada Pokémon' + [g.capture.places && ` · fotos de ${g.capture.places} lugares (detonado)`, g.capture.regionMap && ' · mapa da região'].filter(Boolean).join('') + '.') : '');
const QUALITY_SHORT = { ok: '✓ Verificado', partial: '◐ Parcial', pokeapi: 'PokéAPI' }; // cabeçalho do jogo numa linha (0.83.0)
const qualityBadge = (g, short = false) => { const q = qualityOf(g), [k, t, tip] = QUALITY[q]; return lozenge(k, short ? QUALITY_SHORT[q] : t, tip); };
// contexto da partida (versão, progresso, nível) guardado por jogo no navegador — a URL tem prioridade
// o inicial fica de fora: o jogo sempre abre em "não informar" (só a URL ?inicial= escolhe um)
const CTX_FIELDS = ['version', 'stage', 'level'];
// stageText: o rótulo do estágio como a tela mostra (insígnias, rank do Z-A, nobres…) — o card "Continuar" da tela inicial usa
const saveCtx = () => { try { const st = $('stage'); localStorage.setItem(`poketact:${currentGame}`, JSON.stringify({ ...Object.fromEntries(CTX_FIELDS.map((f) => [f, $(f).value])), stageText: st.value === '' ? '' : st.selectedOptions[0]?.textContent ?? '' })); } catch {} };
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
let trainersFromWalk = false;
let regionMap = null; // <jogo>-regionmap.json: posições dos lugares no mapa da região (decomp) — Gens 1–3
let places = null; // <jogo>-places.json: fotos dos lugares de captura (referências ao detonado do PokeMythology)
let typeSel = []; // aba Pokémon por tipo: tipos escolhidos (até 2)
let typesAll = false; // aba Pokémon por tipo: "ver todos" sem filtro (0.78.0)
// Pokémon selecionado (oponente, Onde capturar ou Golpes): as outras abas abrem já com ele — Detonado (busca), Pokémon por
// tipo (bons contra ele), Golpes e Onde capturar. applied: o que cada aba já recebeu (limpar a busca não o traz de volta).
let selMon = null, typesVs = null, walkQ = '', dexFromCounter = null, lastOppSel = null;
const applied = {};
function selectMon(name, from) { if (!name) return; selMon = name; if (from) applied[from] = name; }
let evoItems = null; // <jogo>-evoitems.json: onde o detonado diz que acha os itens de evolução (jogos sem itens do decomp)
let walk = null; // detonado gerado (carregado ao abrir a aba)
let known = null; // { moves, item } do Pokémon de treinador selecionado; null quando o usuário digita manualmente
let teamMode = null; // treinador quando o modo "contra o time inteiro" está ativo
// dados vistos pelo cálculo: sem as DLCs quando o filtro "Tenho as DLCs" está desmarcado (decisão do usuário, 2026-10-28)
const view = () => (acq && !$('dlcWrap').hidden && !$('dlc').checked ? withoutDlc(data, acq) : { data, acq });
const vData = () => view().data;
const vAcq = () => view().acq;
let pokedex = null; // Pokédex nacional [[número, nome]]: só para avisar que um Pokémon é de outra geração
fetch('data/pokedex.json').then((r) => r.json()).then((d) => { pokedex = d; }).catch(() => {});

let loadTok = 0, loadP = null; // abertura de jogo em andamento (0.83.0: corrida entre dois jogos abertos em seguida)
async function load(gameId) {
  const g = catalog.games.find((x) => x.id === gameId);
  currentGame = gameId;
  try { localStorage.setItem('poketact:last', gameId); } catch {} // "Continuar de onde parou" na tela inicial
  known = null; teamMode = null; oppLocked = false; pickerOpen = false; starterOpen = false;
  for (const id of ['opp', 'oppLevel']) $(id).value = '';
  $('team').innerHTML = '';
  $('resultsHead').hidden = true;
  $('resultsBody').innerHTML = skeleton();
  $('oppInfo').innerHTML = '';
  $('gameTitle').textContent = 'Pokémon ' + g.label;
  // 0.83.0: no cabeçalho, só o selo de qualidade (uma linha); os 3 selos ficam no ⓘ "Sobre os dados"
  $('qualityBadge').innerHTML = qualityBadge(g, true);
  $('aboutBadges').innerHTML = qualityBadge(g) + featureTags(g);
  // mecânicas do jogo que o cálculo não considera (Mega Evolução, golpes Z, Dynamax, Terastal, tempo real…)
  // Mega Evolução já entra no cálculo (0.26.0); o aviso fica para as outras mecânicas
  const outside = (g.mechanics ?? []).filter((m) => m !== 'Mega Evolução' && m !== 'golpes Z' && m !== 'Terastal' && m !== 'Dynamax e Gigantamax');
  $('mechNote').hidden = !outside.length;
  $('mechNote').textContent = outside.length ? `⚠ Fora do cálculo neste jogo: ${outside.join('; ')}. As sugestões consideram só tipos, atributos, golpes e habilidades${(g.mechanics ?? []).includes('Mega Evolução') ? ' (e a Mega Evolução' + ((g.mechanics ?? []).includes('golpes Z') ? ' e os golpes Z' : '') + ')' : ''}.` : '';
  $('tabWalk').hidden = !g.hasWalkthrough; // a aba Onde capturar existe em todos os jogos
  $('validationNote').hidden = !['pokeapi', 'decomp-core', 'pkhex'].includes(g.validation);
  $('onlyObtainable').disabled = false;
  $('validationNote').textContent = g.validation === 'pokeapi' ? 'Atenção: este jogo usa dados da PokéAPI com as regras da geração, ainda SEM conferência com o código do jogo (decomp). Treinadores, onde obter e progresso ainda não estão disponíveis.'
    : g.validation === 'decomp-core' ? 'Espécies, golpes, learnsets, TM/HM, tabela de tipos e treinadores conferidos com o código do jogo (decomp). Onde obter e progresso ainda não estão disponíveis.'
    : g.validation === 'pkhex' ? 'Atributos, tipos, habilidades e golpes aprendidos por nível (na ordem do jogo) conferidos com as tabelas extraídas do próprio jogo (PKHeX). Valores dos golpes: PokéAPI conferida com o Pokémon Showdown.' : '';
  $('walkthrough').innerHTML = !g.walkthrough ? '' : g.hasWalkthrough
    ? 'Ordem da história (aba Detonado) baseada no detonado do <a href="' + g.walkthrough + '" target="_blank" rel="noopener">PokeMythology</a>.'
    : 'Detonado deste jogo ainda não está no app; referência externa: <a href="' + g.walkthrough + '" target="_blank" rel="noopener">PokeMythology</a>.';
  document.title = g.label + ' — Poke Tact';
  $('version').innerHTML = g.versions.map((v) => '<option value="' + v.id + '">' + v.label + '</option>').join('');
  $('gameInfo').textContent = 'Carregando dados…';
  walk = null; learnFor = null; learnMove = null; learnSlot = -1; // aba Golpes: "Vale a pena aprender?" do jogo novo
  places = null; // fotos dos lugares (aba Onde capturar) — do jogo novo
  typeSel = []; typesAll = false; // filtro de tipo da aba Pokémon por tipo
  selMon = null; typesVs = null; walkQ = ''; lastOppSel = null; for (const k in applied) delete applied[k];
  evoItems = null;
  regionMap = null;
  showTab('rec');
  // 0.83.0: os arquivos chegam em variáveis locais e só viram o jogo aberto se nenhum outro jogo começou a abrir no meio.
  // Antes, abrir um jogo e logo outro misturava `data` de um com `acq` do outro (e a versão do 2º) → TypeError em
  // whereToGet ("reading 'bulbasaur'"), visto ao abrir #/jogo/firered-leafgreen?pokemon=gyarados com outra aba navegando
  const tok = ++loadTok;
  const d = await (await fetch(`data/${gameId}.json`)).json();
  // trainersFromWalk: times transcritos do detonado (jogos sem decomp) — espécie e nível; golpes estimados
  let tr = [], fromWalk = false, a = null;
  try { const td = await (await fetch(`data/${gameId}-trainers.json`)).json(); tr = td.trainers; fromWalk = !!td.fromWalkthrough;
    if (td.subwaySource) try { tr = tr.concat(subwayTrainers(await (await fetch(`data/${gameId}-subway.json`)).json(), tr)); } catch {}
  } catch { tr = []; fromWalk = false; }
  try { a = await (await fetch(`data/${gameId}-acquisition.json`)).json(); } catch { a = null; }
  if (tok !== loadTok || currentGame !== gameId) return false; // outro jogo foi aberto enquanto este carregava
  data = d; trainers = tr; trainersFromWalk = fromWalk; acq = a;
  if (g.validation === 'pkhex') $('validationNote').textContent += acq?.encountersOnly
    ? (rateCredit(acq) ? ` Onde obter: tabelas de encontro do jogo (PKHeX), com local e nível; ${rateCredit(acq)}.` : ' Onde obter: tabelas de encontro do jogo (PKHeX), com local e nível, sem taxa de aparição.') +
      (trainersFromWalk ? ' Treinadores: times transcritos do detonado do PokeMythology (espécie e nível); golpes estimados pelo moveset padrão do jogo.' : ' Treinadores ainda não disponíveis.') +
      (acq.progress ? ' Progresso por insígnia pela ordem dos líderes no detonado.' : ' Sem progresso por insígnia.')
    : ' Treinadores, onde obter e progresso ainda não estão disponíveis.';
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
  $('trainerHint').textContent = trainersFromWalk ? '— time do detonado (espécie e nível); golpes estimados pelo nível' : '— usa o time e os golpes reais';
  // 0.82.0: a busca fica no topo (pedido do usuário) — o rótulo deixa claro que dá para escolher o treinador logo abaixo
  $('oppLabel').firstChild.textContent = trainers.length ? 'Pokémon do oponente (ou escolha o treinador abaixo) ' : 'Pokémon que você está enfrentando ';
  // inicial só faz sentido com 2+ opções (Yellow: só Pikachu); progresso só com linha do tempo
  const choosable = (data.starters?.species?.length ?? 0) > 1;
  $('starterWrap').style.display = choosable ? '' : 'none';
  $('stageWrap').style.display = acq?.progress ? '' : 'none';
  $('tradeEvos').closest('label').style.display = acq ? '' : 'none';
  $('megaWrap').hidden = !data.pokemon.some((p) => p.megas?.length); // jogos com Mega Evolução
  $('zWrap').hidden = !Object.values(data.moves).some((m) => m.zPower); // jogos com golpe Z
  $('teraWrap').hidden = !acq?.progress?.keyItems?.tera; // Scarlet/Violet (Tera Orb no detonado)
  $('dynWrap').hidden = !acq?.progress?.keyItems?.dynamax; // Sword/Shield (Dynamax Band no detonado)
  // DLCs (Sword/Shield, Scarlet/Violet, Z-A): filtro "Tenho as DLCs", desmarcado por padrão; a escolha fica guardada por jogo
  $('dlcWrap').hidden = !hasDlc(acq);
  try { $('dlc').checked = localStorage.getItem(`poketact:dlc:${gameId}`) === '1'; } catch { $('dlc').checked = false; }
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
  // Gens 6–9: onde obter pelas tabelas de encontro do PKHeX — local e nível, sem taxa e sem linha do tempo de insígnias
  else if (acq.encountersOnly) $('disclaimer').textContent =
    `Sugestões usam os dados de ${g.label} com as regras da Geração ${roman(data.game.generation)}: atributos, tipos, habilidades e golpes por nível conferidos com as tabelas do jogo (PKHeX). ` +
    'Disponibilidade = aparece nas tabelas de encontro do jogo nesta versão (selvagem, presente, encontro único, troca no jogo) ou evolui de algo assim, ou nasce de um ovo na creche; eventos e transferências não contam. ' +
    (acq.progress ? `As tabelas trazem local e faixa de nível${rateCredit(acq) ? '; ' + rateCredit(acq) : ', sem taxa de aparição'};o ponto da história de cada local vem do detonado. ` : 'As tabelas trazem local e faixa de nível, mas não a taxa de aparição nem em que ponto da história a área abre; o nível estimado é o menor nível de encontro. ') +
    (acq.notes ?? []).map((n) => n + ' ').join('') +
    (trainersFromWalk ? 'Treinadores: times do detonado (espécie e nível); os golpes são os que o Pokémon teria no nível (moveset padrão), não necessariamente os reais. ' : trainers.length ? 'Ao escolher um treinador do jogo, usamos o nível e os golpes reais do time dele. ' : 'Ainda sem treinadores do jogo. ') +
    'Com o nível do oponente, a ameaça vem do moveset padrão do jogo; sem nível, dos tipos dele.';
  else $('disclaimer').textContent =
    `Sugestões usam apenas dados da Geração ${roman(data.game.generation)} (tipos, stats base, golpes${data.game.generation >= 3 ? ' e habilidades' : ''} daquela geração). ` +
    'Disponibilidade = pode ser obtido nesta versão (selvagem, presente, troca dentro do jogo, prêmio…) ou evolui de algo assim, ou nasce de um ovo na creche; trocas com outros jogos e eventos não contam. ' +
    `Ao escolher um treinador do jogo, usamos o nível e os golpes reais do time dele (dados do próprio ${g.label})` +
    (data.game.generation >= 3 ? '; a habilidade do Pokémon dele não é determinada, então só imunidades de habilidade única entram na conta. ' : '. ') +
    'Sem treinador: com o nível do oponente, a ameaça vem do moveset padrão do jogo; sem nível, dos tipos dele.';
  restoreCtx();
  trainerCat = null; pickerOpen = false;
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
  // o cartão antigo com os iniciais poluía a tela; a escolha fica logo acima do campo do oponente, com os sprites
  $('starters').hidden = true;
  const cur = $('starter').value;
  // 0.78.0 (decisão do usuário): oponente escolhido que não é o rival → o inicial não muda a luta; vira uma linha com "trocar"
  const t = trainers.find((x) => x.key === $('trainer').value);
  // 0.83.0: vale para os dois caminhos (Pokémon buscado ou treinador) — só o rival continua com os 3 iniciais à mostra
  const compact = (oppLocked || !!teamMode) && !(t && (t.group === 'Rival' || t.forStarter)) && !starterOpen && data.starters?.species?.length > 1;
  $('starterLabel').hidden = !!compact;
  $('starterPick').classList.toggle('compact', !!compact);
  if (compact) {
    const ts = !cur && teamStarter();
    $('starterPick').innerHTML = '<p class="starter-line">Seu inicial: <strong>' + (cur ? humanize(cur) : ts ? humanize(ts) + ' (do seu time)' : 'não informado') + '</strong> · <button type="button" class="linkish" data-starter-open>trocar</button></p>';
    return;
  }
  $('starterHint').textContent = trainers.length ? '— opcional: define o time do rival' : '— opcional';
  const opt = (value, inner, label, cls = '') => `<button type="button" role="radio" class="${cls}" data-v="${value}" aria-checked="${cur === value}" aria-label="${label}">${inner}</button>`;
  $('starterPick').innerHTML = (data.starters?.species ?? []).map((n) => { const p = data.pokemon.find((x) => x.name === n); return p ? opt(n, img(p.id) + `<span>${humanize(n)}</span>`, humanize(n)) : ''; }).join('') +
    opt('', '<span>não informar</span>', 'não informar', 'none');
}
// clique num sprite = escolher no <select> escondido (mesmo caminho do ?inicial= da URL)
let starterOpen = false; // a linha compacta do inicial foi aberta com "trocar" (volta a recolher ao escolher outro oponente)
$('starterPick').addEventListener('click', (e) => {
  if (e.target.closest('[data-starter-open]')) { starterOpen = true; renderStarters(); $('starterPick').querySelector('button')?.focus(); return; }
  const b = e.target.closest('button[data-v]');
  if (!b || b.dataset.v === $('starter').value) return;
  $('starter').value = b.dataset.v;
  $('starter').dispatchEvent(new Event('input'));
});

function renderWhere(mon, reach, stageNeeded) {
  if (!acq) return '';
  const version = $('version').value;
  const w = whereToGet(vData(), vAcq(), mon, version);
  if (!w.direct.length) return '<li class="meta">Onde obter: sem forma direta nesta versão</li>';
  const when = stageNeeded != null ? ' <span class="meta">(disponível: ' + stageLabel(stageNeeded, acq.progress?.leaderOrder, acq.progress) + ')</span>' : Number.isFinite(reach) && reach > 1 ? ' <span class="meta">(estimado: a partir do nv ' + reach + ')</span>' : '';
  let html = '<li><strong>Onde obter</strong>' + when + ': ' + routeHtml(w);
  // os dois caminhos: com fonte direta, mostra também capturar a pré-evolução e evoluir (sem troca: exige outro cartucho)
  const alt = !w.from && !/^TRADE/.test(mon.evo?.kind ?? '') && preEvolutionRoute(vData(), vAcq(), mon, version);
  if (alt) html += '<span class="meta">ou </span>' + routeHtml(alt);
  return html + '</li>';
}

// ---------------------------------------------------------------- aba Pokémon por tipo
// todos os Pokémon do jogo separados por tipo; os botões de tipo filtram (2 tipos = quem tem os dois); clicar num Pokémon
// abre a aba Onde capturar
function renderTypes() {
  if (!data) return;
  const version = $('version').value;
  const vLabel = $('version').selectedOptions[0]?.textContent ?? version;
  const r = typeIndex(data, { version, q: $('typesQ').value, types: typeSel, onlyObtainable: $('typesObt').checked, finalOnly: $('typesFinal').checked });
  $('typesObt').parentElement.lastChild.textContent = ' só os que dá para obter em ' + vLabel;
  $('typesChips').innerHTML = data.types.map((t) => '<button type="button" data-type="' + t + '" aria-pressed="' + typeSel.includes(t) + '" style="background:' + COLORS[t] + '">' + t + '<span class="n">' + r.counts[t] + '</span></button>').join('') +
    (typeSel.length ? '<button type="button" class="clear" data-clear>limpar tipos</button>' : '');
  const card = (p) => '<button type="button" class="mon-card' + (p.obtainable?.[version] ? '' : ' off') + '" data-mon="' + p.name + '" title="' + (p.obtainable?.[version] ? 'Ver onde capturar' : 'Não dá para obter em ' + vLabel) + '">' + img(p.id) +
    '<span><span class="nm">' + humanize(p.name) + '</span><br><span class="sub">#' + (p.speciesId ?? p.id) + '</span> ' + p.types.map(typeBadge).join('') + '</span></button>';
  const grid = (list) => '<div class="mon-grid">' + list.map(card).join('') + '</div>';
  // Pokémon selecionado em outra aba → os Pokémon do jogo bons contra ele (acertam ×2+ sem levar ×2 dos tipos dele),
  // na ordem da busca por tipo da tela inicial (monsFor); os filtros de nome, versão e forma final continuam valendo
  const foe = typesVs && data.pokemon.find((p) => p.name === typesVs);
  if (foe) {
    const nameQ = fold($('typesQ').value.trim());
    const vs = monsFor(data, foe.types, 'enfrentar', { finalOnly: $('typesFinal').checked, legendary: true })
      .filter(({ p }) => (!$('typesObt').checked || p.obtainable?.[version]) && (!nameQ || fold(humanize(p.name)).includes(nameQ)));
    const vsCard = ({ p, atk, def }) => card(p).replace('</span></button>', '<br><span class="sub">acerta ' + MULT[atk] + ' · leva ' + MULT[def] + '</span></span></button>');
    $('typesOut').innerHTML = '<div class="vs-head">' + img(foe.id) + '<strong>Bons contra ' + humanize(foe.name) + '</strong> ' + foe.types.map(typeBadge).join('') +
      '<span class="meta">' + vs.length + '</span><button type="button" class="btn" data-vs-clear>ver todos por tipo</button></div>' +
      (vs.length ? '<div class="mon-grid">' + vs.map(vsCard).join('') + '</div>' : '<p class="meta">Nenhum Pokémon do jogo acerta ×2 sem levar ×2 com esses filtros.</p>') +
      '<p class="meta">Acerta = o melhor tipo do próprio Pokémon contra ' + humanize(foe.name) + '; leva = o pior golpe dos tipos dele. Clique para ver onde capturar; para a luta com golpes e nível, a aba Recomendação.</p>';
  }
  const head = '<p class="meta">' + r.mons.length + ' Pokémon' + (typeSel.length ? ' com o tipo ' + typeSel.map(typeBadge).join(' + ') : '') + (typeSel.length ? '' : ' — quem tem dois tipos aparece nos dois grupos') + '. Clique num Pokémon para ver onde capturar.</p>';
  // 0.78.0: sem tipo nem nome, só a orientação — antes a aba despejava todos os Pokémon do jogo agrupados (6.000 px no celular);
  // "ver todos" mostra a lista inteira como antes
  if (!foe && !typeSel.length && !$('typesQ').value.trim() && !typesAll) {
    $('typesOut').innerHTML = '<p class="meta">Toque num tipo acima (até 2) ou escreva um nome. <button type="button" class="linkish" data-types-all>ver todos os ' + r.mons.length + ' Pokémon por tipo</button></p>';
    $('typesOut').querySelector('[data-types-all]').addEventListener('click', () => { typesAll = true; renderTypes(); });
  } else if (!foe) $('typesOut').innerHTML = !r.mons.length ? '<p class="meta">Nenhum Pokémon com esses filtros.</p>'
    : head + (typeSel.length ? grid(r.mons) : r.groups.map((g) => '<section class="types-group"><h3>' + typeBadge(g.type) + '<span class="meta">' + g.mons.length + '</span></h3>' + grid(g.mons) + '</section>').join(''));
  $('typesChips').querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.type;
    typeSel = typeSel.includes(t) ? typeSel.filter((x) => x !== t) : [...typeSel, t].slice(-2);
    typesVs = null;
    renderTypes();
  }));
  $('typesChips').querySelector('[data-clear]')?.addEventListener('click', () => { typeSel = []; renderTypes(); });
  $('typesOut').querySelectorAll('[data-mon]').forEach((b) => b.addEventListener('click', () => { dexFromCounter = typesVs ? b.dataset.mon : null; applied.dex = selMon; $('dexQ').value = humanize(b.dataset.mon); showTab('dex'); }));
  $('typesOut').querySelector('[data-vs-clear]')?.addEventListener('click', () => { typesVs = null; renderTypes(); });
}

// ---------------------------------------------------------------- aba Detonado (gerado a partir dos dados do jogo)
function showTab(which) {
  $('tabRec').setAttribute('aria-selected', String(which === 'rec'));
  $('tabWalk').setAttribute('aria-selected', String(which === 'walk'));
  $('tabDex').setAttribute('aria-selected', String(which === 'dex'));
  $('tabTypes').setAttribute('aria-selected', String(which === 'types'));
  $('tabMoves').setAttribute('aria-selected', String(which === 'moves'));
  $('recView').hidden = which !== 'rec';
  $('walk').hidden = which !== 'walk';
  $('dex').hidden = which !== 'dex';
  $('types').hidden = which !== 'types';
  $('moves').hidden = which !== 'moves';
  $('tabTeam').setAttribute('aria-selected', String(which === 'team'));
  $('teamView').hidden = which !== 'team';
  if (which === 'team') renderMyTeam();
  if (which === 'rec' && data) update(); // o time pode ter mudado em Meu time
  // a aba abre com o Pokémon selecionado em outra aba (só uma vez por seleção: limpar a busca não o traz de volta)
  if (selMon && which !== 'rec' && which !== 'team' && applied[which] !== selMon) {
    applied[which] = selMon;
    if (which === 'walk') walkQ = selMon;
    if (which === 'types') { typesVs = selMon; typeSel = []; $('typesQ').value = ''; }
    if (which === 'dex') $('dexQ').value = humanize(selMon);
    if (which === 'moves') $('movesQ').value = humanize(selMon);
  }
  if (which === 'walk') renderWalk();
  if (which === 'dex') renderDex();
  if (which === 'types') renderTypes();
  if (which === 'moves') renderMoves();
}

// ---------------------------------------------------------------- aba Golpes
// os golpes de dano mais fortes do Pokémon, nível a nível (engine strongestMovesByLevel): level-up + TMs/tutores que já dá
// para pegar no progresso escolhido (ou pelo nível estimado de cada TM, sem progresso)
function renderMoves() {
  const out = $('movesOut');
  if (!data) return;
  renderMovesTeam();
  const q = $('movesQ').value.trim();
  const mon = findOpponent(data.pokemon, q);
  if (!mon) {
    const w = q && opponentWarning({ pokemon: data.pokemon, pokedex, generation: data.game.generation, gameLabel: currentGameLabel() }, q);
    out.innerHTML = w ? '<p class="warn">⚠ ' + w.text + '</p>' : '<p class="meta">Digite um Pokémon para ver os golpes mais fortes dele em cada nível em ' + currentGameLabel() + '.</p>';
    return;
  }
  selectMon(mon.name, 'moves');
  const a = vAcq();
  const cur = $('stage').value === '' ? null : Number($('stage').value);
  const useStage = !!a?.progress && cur != null;
  // jogo sem a origem das TMs (lista vazia, ex.: Scarlet/Violet) → todas as TMs da lista do Pokémon contam
  const has = (o) => (o && Object.keys(o).length ? o : null);
  const ms = has(a?.machines), ts = has(a?.tutors);
  const r = strongestMovesByLevel(vData(), mon, { machineSources: ms, tutorSources: ts, stage: useStage ? cur : null });
  const src = (m) => {
    if (m.via.method === 'level-up') return 'nv ' + m.via.level;
    const s = m.via.source;
    return (m.via.method === 'machine' ? 'TM/HM' : 'tutor') + (s?.where ? ' · ' + (s.type === 'gym' && s.leader ? 'ginásio de ' + s.leader : s.where) : '');
  };
  const cat = { physical: 'físico', special: 'especial' };
  const mv = (m) => '<span class="mv" title="' + (cat[m.category] ?? m.category) + ', precisão ' + (m.accuracy ?? '—') + (m.half ? ', 2 turnos ou recarga: conta metade' : '') + '">' + typeBadge(m.type) + '<strong>' + humanize(m.name) + '</strong> ' + m.power + (m.stab > 1 ? ' ★' : '') + (m.half ? ' ½' : '') + ' <span class="src">(' + src(m) + ')</span></span>';
  const ctx = useStage ? 'TMs e tutores que dá para pegar até: ' + stageLabel(cur, a.progress?.leaderOrder, a.progress) + ' (mude o progresso lá em cima).'
    : ms || ts ? 'TMs e tutores pelo nível estimado em que cada um aparece no jogo' + (a?.progress ? ' — escolha o progresso lá em cima para contar pelas insígnias.' : '.')
      : 'Todas as TMs e tutores da lista do Pokémon (o app ainda não sabe onde achar cada TM neste jogo).';
  const head = '<div class="opp">' + img(mon.id) + '<div><strong>#' + (mon.speciesId ?? mon.id) + ' ' + humanize(mon.name) + '</strong><br>' + mon.types.map(typeBadge).join('') +
    '<div class="meta">Ataque ' + mon.stats.attack + ' · Atq. Esp. ' + mon.stats['special-attack'] + '</div></div></div>';
  const rows = r.rows.map((row, i) => '<tr><td class="lv">nv ' + row.level + (i === 0 && r.start > 1 ? '+' : '') + '</td><td>' + (row.moves.length ? row.moves.map(mv).join('') : '<span class="meta">nenhum golpe de dano</span>') + '</td></tr>').join('');
  out.innerHTML = head + '<div id="learnBox" class="learn"></div>' + '<p class="meta" style="margin:0">' + ctx + (r.start > 1 ? ' Começa no nv ' + r.start + ', o menor nível em que dá para tê-lo.' : '') + '</p>' +
    '<table class="moves-table"><thead><tr><th>Nível</th><th>Os 4 golpes mais fortes (uma linha a cada mudança)</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<details class="how"><summary>Como ler a tabela</summary><p class="meta">★ mesmo tipo dele (×1,5). Ordem pela força: poder × ★ × precisão × o Ataque ou Atq. Esp. dele, conforme o golpe. ½ = dois turnos ou recarga (conta metade). ' +
    'Ficam de fora golpes de poder variável e os que custam caro (Explosion, Dream Eater…). Não olha o adversário — para isso, a aba Recomendação.</p></details>';
  renderLearn(mon);
}

// ---------------------------------------------------------------- aba Golpes: "Vale a pena aprender?" (0.73.0)
// compara o golpe novo com os 4 que ele tem (estimados pelo nível ou digitados — guardados no navegador por jogo e Pokémon)
// e diz em quantos Pokémon das próximas lutas (progresso escolhido, times do detonado) o golpe funciona
let moveEffects = null; // public/data/move-effects.json (efeito de cada golpe de status, por geração — Showdown)
let learnMove = null; // golpe novo pedido pelo link (?aprender=sleep-powder) ou escolhido
let learnFor = null, learnLevel = 1; // Pokémon do formulário atual (troca de Pokémon → nível novo) e o nível dele
const LEARN_KEY = () => `poketact:golpes:${currentGame}`;
const savedSets = () => { try { return JSON.parse(localStorage.getItem(LEARN_KEY()) ?? '{}') ?? {}; } catch { return {}; } };
const saveSet = (name, entry) => { try { const all = savedSets(); if (entry) all[name] = entry; else delete all[name]; localStorage.setItem(LEARN_KEY(), JSON.stringify(all)); } catch {} };
// Meu time (0.74.0): até 6 Pokémon com nível e golpes, guardados no navegador por jogo — [{ species, level, moves, estimated }]
let learnSlot = -1; // membro do time aberto na aba Golpes (dois do mesmo Pokémon: o chip escolhido)
// readTeam/writeTeam valem para qualquer jogo (a tela inicial edita o time sem abrir o jogo — 0.75.0)
const readTeam = (gameId, d) => { try { const t = JSON.parse(localStorage.getItem(`poketact:time:${gameId}`) ?? '[]'); return Array.isArray(t) ? t.filter((m) => m && d.pokemon.some((p) => p.name === m.species)) : []; } catch { return []; } };
const writeTeam = (gameId, team) => { try { localStorage.setItem(`poketact:time:${gameId}`, JSON.stringify(team.slice(0, 6))); } catch {} };
const loadTeam = () => readTeam(currentGame, data);
const saveTeam = (team) => writeTeam(currentGame, team);
const teamSlotOf = (mon, team = loadTeam()) => (team[learnSlot]?.species === mon.name ? learnSlot : team.findIndex((t) => t.species === mon.name));
// grava golpes/nível: no membro do time quando ele está no time; senão, no guardado por Pokémon (0.73.0)
function writeSaved(mon, entry) {
  const team = loadTeam();
  const slot = teamSlotOf(mon, team);
  if (slot >= 0) { team[slot] = { ...team[slot], ...(entry.moves && { moves: entry.moves, estimated: false }), ...(entry.level && { level: entry.level }) }; saveTeam(team); return; }
  const s = savedFor(mon);
  if (s && s.from !== mon.name) saveSet(s.from, null);
  saveSet(mon.name, { moves: entry.moves ?? s?.moves, level: entry.level ?? s?.level ?? null });
}
// golpes do membro do time; senão os guardados deste Pokémon ou, se ele evoluiu, os da forma anterior (os golpes continuam)
function savedFor(mon) {
  const team = loadTeam();
  const slot = teamSlotOf(mon, team);
  if (slot >= 0) return { moves: team[slot].moves ?? [], level: team[slot].level, from: mon.name, slot, estimated: !!team[slot].estimated };
  const all = savedSets();
  for (let m = mon, i = 0; m && i < 4; m = data.pokemon.find((p) => p.id === m.evolvesFrom), i++) if (all[m.name]) return { ...all[m.name], from: m.name };
  return null;
}
const moveByLabel = () => new Map(Object.keys(data.moves).flatMap((k) => [[humanize(k).toLowerCase(), k], [k, k]]));
async function renderLearn(mon) {
  let box = $('learnBox');
  if (!box) return;
  if (!moveEffects) {
    try { moveEffects = await (await fetch('data/move-effects.json')).json(); } catch { moveEffects = { moves: {} }; }
    // 0.77.0: a aba pode ter sido refeita enquanto o arquivo carregava (link com ?insignias= desenha a aba 2 vezes) — o
    // `box` antigo ficava fora da página e o formulário saía nele: "Cannot read properties of null (reading 'value')"
    if (!box.isConnected) return;
    box = $('learnBox');
  }
  const d = vData();
  const opts = [];
  const seen = new Set();
  for (const l of mon.learnset.filter((x) => x.method === 'level-up').sort((a, b) => a.level - b.level)) if (!seen.has(l.move) && data.moves[l.move]) { seen.add(l.move); opts.push({ move: l.move, label: (l.level > 1 ? 'nv ' + l.level : 'nv 1') + ' · ' + humanize(l.move), level: l.level }); }
  for (const l of mon.learnset.filter((x) => ['machine', 'tutor'].includes(x.method)).sort((a, b) => a.move.localeCompare(b.move))) if (!seen.has(l.move) && data.moves[l.move]) { seen.add(l.move); opts.push({ move: l.move, label: (l.method === 'machine' ? 'TM/HM' : 'tutor') + ' · ' + humanize(l.move) }); }
  const saved = savedFor(mon);
  // a aba refaz a área a cada mudança (progresso, versão): o formulário volta com o golpe e o nível já escolhidos
  if (learnFor !== mon.name || saved?.slot != null) { learnFor = mon.name; learnLevel = saved?.level ?? (Number($('level').value) || mon.minLevel || 1); }
  {
    const lv = learnLevel;
    const pick = (learnMove && opts.find((o) => o.move === learnMove)) ?? opts.find((o) => o.level >= lv && !(saved?.moves ?? []).includes(o.move)) ?? opts[0];
    box.innerHTML = '<div class="walk-h">Vale a pena aprender?</div>' +
      '<div class="learn-form"><label>Golpe novo <select id="learnMove">' + opts.map((o) => '<option value="' + o.move + '"' + (o === pick ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select></label>' +
      '<label>Nível dele <input type="number" id="learnLevel" min="1" max="100" value="' + lv + '"></label></div>' +
      '<div class="learn-cur"><span class="meta" id="learnCurLabel"></span><div class="learn-moves">' + [0, 1, 2, 3].map((i) => '<input type="text" class="learnCur" list="learnMoveList" aria-label="Golpe ' + (i + 1) + ' que ele tem" spellcheck="false" autocomplete="off">').join('') + '</div>' +
      '<datalist id="learnMoveList">' + Object.keys(data.moves).map((k) => '<option value="' + humanize(k) + '">').join('') + '</datalist></div>' +
      '<div id="learnRes"></div>';
    fillLearnCurrent(mon, saved);
    $('learnMove').addEventListener('change', () => { learnMove = $('learnMove').value; if (!savedFor(mon)) fillLearnCurrent(mon, null); renderLearnResult(mon); });
    $('learnLevel').addEventListener('change', () => { learnLevel = Number($('learnLevel').value) || learnLevel; if (savedFor(mon)) writeSaved(mon, { level: learnLevel }); else fillLearnCurrent(mon, null); renderLearnResult(mon); });
    for (const el of box.querySelectorAll('.learnCur')) el.addEventListener('change', () => {
      // o usuário corrigiu: guarda os 4 golpes (e o nível) para a próxima vez — no time, se ele está no time
      const moves = readLearnCurrent();
      writeSaved(mon, { moves, level: Number($('learnLevel').value) || null });
      fillLearnCurrent(mon, savedFor(mon));
      renderLearnResult(mon);
    });
  }
  renderLearnResult(mon, d);
}
function readLearnCurrent() {
  const map = moveByLabel();
  return [...document.querySelectorAll('.learnCur')].map((el) => map.get(el.value.trim().toLowerCase()) ?? null).filter(Boolean);
}
function fillLearnCurrent(mon, saved) {
  const lv = Number($('learnLevel').value) || 1;
  const moves = saved?.moves ?? estimatedMoveset(data, mon, lv, { skip: $('learnMove').value });
  [...document.querySelectorAll('.learnCur')].forEach((el, i) => { el.value = moves[i] ? humanize(moves[i]) : ''; });
  const canAdd = !saved?.slot && saved?.slot !== 0 && loadTeam().length < 6;
  $('learnCurLabel').innerHTML = saved?.slot != null
    ? 'Golpes dele no <strong>seu time</strong> (aba Meu time)' + (saved.estimated ? ' — ainda estimados pelo nível; corrija se for diferente' : '') + '. O que você mudar aqui muda lá também.'
    : (saved
      ? 'Golpes que ele tem agora (guardados por você' + (saved.from !== mon.name ? ' quando era ' + humanize(saved.from) : '') + ') · <button type="button" class="linkish" id="learnReset">voltar à estimativa</button>'
      : 'Golpes que ele tem agora — <strong>estimados pelo nível</strong> (o que ele e as formas anteriores aprendem subindo de nível). Se for diferente, corrija: o app guarda para a próxima vez.') +
      (canAdd ? ' · <button type="button" class="linkish" id="learnAddTeam">pôr no meu time</button>' : '');
  $('learnReset')?.addEventListener('click', () => { saveSet(saved.from, null); fillLearnCurrent(mon, null); renderLearnResult(mon); });
  $('learnAddTeam')?.addEventListener('click', () => {
    const team = loadTeam();
    team.push({ species: mon.name, level: Number($('learnLevel').value) || 1, moves: readLearnCurrent(), estimated: !saved });
    saveTeam(team);
    learnSlot = team.length - 1;
    if (saved) saveSet(saved.from, null); // passa a valer o do time
    renderMovesTeam();
    fillLearnCurrent(mon, savedFor(mon));
  });
}
// Pokémon das próximas lutas: as do progresso escolhido no detonado (líder + treinadores dos lugares dessa etapa)
async function nextFights() {
  const a = vAcq();
  const cur = $('stage').value === '' ? null : Number($('stage').value);
  if (!a?.progress || cur == null) return { why: 'Escolha o <strong>progresso</strong> lá em cima para ver em quantos Pokémon das próximas lutas o golpe funciona.' };
  if (!walk) { try { walk = await (await fetch(`data/${currentGame}-walkthrough.json`)).json(); } catch { return { why: 'Este jogo ainda não tem as lutas da história no app.' }; } }
  const v = walk.versions[$('version').value] ?? Object.values(walk.versions)[0];
  const st = v?.stages.find((s) => s.stage === cur);
  if (!st) return { why: 'O detonado não tem lutas nessa etapa.' };
  const mine = $('starter').value;
  const fights = [];
  if (st.leader?.party?.length) fights.push({ label: humanize(String(st.leader.name).toLowerCase()), leader: true, party: st.leader.party });
  for (const l of st.locations) for (const t of l.trainers ?? []) if (t.party?.length && !(mine && t.forStarter && !t.forStarter.includes(mine)) && t.key !== st.leader?.key) fights.push({ label: t.label, party: t.party });
  return { stage: stageLabel(cur, a.progress.leaderOrder, a.progress), fights };
}
async function renderLearnResult(mon) {
  if (!$('learnRes')) return;
  const d = vData();
  const newMove = $('learnMove').value;
  const current = readLearnCurrent();
  const nf = await nextFights();
  const res = $('learnRes'); // a aba pode ter sido refeita enquanto carregava
  if (!res || $('learnMove').value !== newMove) return;
  const opponents = nf.fights?.flatMap((f) => f.party.map((p) => ({ species: p.species, level: p.level, fight: f.label, leader: !!f.leader })));
  const r = moveWorth(d, moveEffects, mon, newMove, { current, opponents });
  const N = '<strong>' + humanize(newMove) + '</strong>';
  const verdict = {
    room: ['ok', '✅ Pode aprender: ele tem só ' + current.length + (current.length === 1 ? ' golpe' : ' golpes') + ', não precisa esquecer nenhum.'],
    learn: ['ok', '✅ Vale a pena: aprenda ' + N + ' e esqueça <strong>' + humanize(r.forget ?? '') + '</strong>.'],
    same: ['neutral', '🤏 Tanto faz: aprender ' + N + ' no lugar de <strong>' + humanize(r.forget ?? '') + '</strong> muda pouco.'],
    skip: ['bad', '❌ Não vale a pena: os golpes que ele tem já são melhores que ' + N + '.'],
    unknown: ['neutral', '❔ O app não sabe dar nota a ' + N + ' — veja abaixo o que ele faz e em quem funciona.'],
  }[r.verdict];
  const fmt = (n) => (n == null ? '—' : n.toFixed(1).replace('.', ','));
  const rows = r.rows.map((x) => '<tr><td>' + typeBadge(d.moves[x.name].type) + '<strong>' + humanize(x.name) + '</strong>' + (x.isNew ? ' ' + lozenge('info', 'novo') : '') + (x.name === r.forget ? ' ' + lozenge('warn', 'esquecer') : '') + '</td><td class="lv">' + fmt(x.note) + '</td><td>' + x.why + '</td></tr>').join('');
  // próximas lutas: em quantos Pokémon o golpe novo funciona
  let fightsHtml;
  const c = r.coverage;
  if (!c) fightsHtml = '<p class="meta">' + nf.why + '</p>';
  else if (!c.total) fightsHtml = '<p class="meta">Nenhuma luta com time conhecido nessa etapa (' + nf.stage + ').</p>';
  else {
    const isDmg = r.rows.find((x) => x.isNew).damage;
    const fail = c.list.filter((l) => l.ok !== true);
    const uniq = (l) => [...new Map(l.map((x) => [x.species + '|' + x.why, x])).values()];
    const leader = c.list.filter((l) => l.leader);
    const effTxt = (e) => (e === 0 ? '×0' : e >= 2 ? '×' + e : e < 1 ? '×' + String(e).replace('.', ',') : '×1');
    fightsHtml = '<p><strong>Próximas lutas</strong> (' + nf.stage + ', ' + nf.fights.length + (nf.fights.length > 1 ? ' lutas' : ' luta') + '): ' + N + ' funciona em <strong>' + c.ok + ' de ' + c.total + '</strong> Pokémon' + (c.maybe ? ' (+' + c.maybe + ' talvez)' : '') + '.' +
      (isDmg ? ' Super efetivo em ' + c.list.filter((l) => l.eff >= 2).length + ', pouco efetivo em ' + c.list.filter((l) => l.eff > 0 && l.eff < 1).length + '.' : '') + '</p>' +
      (leader.length ? '<p class="meta">Líder ' + leader[0].fight + ': ' + leader.map((l) => humanize(l.species) + ' nv ' + l.level + ' ' + (isDmg ? effTxt(l.eff) : l.ok === true ? '✔' : l.ok === 'maybe' ? '❔' : '✖')).join(' · ') + '</p>' : '') +
      (fail.length ? '<p class="meta">Não funciona ou pode falhar: ' + uniq(fail).map((l) => humanize(l.species) + (l.why ? ' (' + l.why + ')' : '')).join('; ') + '.</p>' : '');
    if (!isDmg && c.ok < c.total / 2) verdict[1] += ' Mas atenção: não funciona em boa parte das próximas lutas.';
  }
  const learnBtn = r.verdict === 'room' || current.length < 4
    ? '<button type="button" class="btn" id="learnDone">Aprendi ' + humanize(newMove) + '</button>'
    : '<label class="learn-done">Esquecendo <select id="learnForget">' + current.map((m) => '<option value="' + m + '"' + (m === r.forget ? ' selected' : '') + '>' + humanize(m) + '</option>').join('') + '</select></label> <button type="button" class="btn" id="learnDone">Aprendi ' + humanize(newMove) + '</button>';
  res.innerHTML = '<p class="learn-verdict ' + verdict[0] + '">' + verdict[1] + '</p>' +
    '<table class="learn-table"><thead><tr><th>Golpe</th><th>Nota</th><th>Por quê</th></tr></thead><tbody>' + rows + '</tbody></table>' + fightsHtml +
    '<div class="learn-actions">' + learnBtn + '</div>' +
    '<details class="how"><summary>Como a nota é calculada</summary><p class="note">Nota de 0 a 3 = estimativa do app, não regra do jogo. Dano: força como na tabela abaixo (3 = o mais forte dele). Status: sono e congelamento 3, paralisia 2,5, veneno forte e queimadura 2, veneno 1,5, confusão 1,5, vezes a precisão' +
    (mon.abilities?.length && mon.abilities.every((x) => x === 'compound-eyes') ? ' (Compound Eyes: ×1,3)' : '') + '; o alvo só tem um problema de status por vez. Subir Ataque só conta com golpe físico (Atq. Esp. com especial). Efeito dos golpes: ' + (moveEffects.source ?? 'Pokémon Showdown') + '.</p></details>';
  $('learnDone').addEventListener('click', () => {
    const forget = $('learnForget')?.value;
    const moves = current.length < 4 ? [...current, newMove] : current.map((m) => (m === forget ? newMove : m));
    writeSaved(mon, { moves, level: Number($('learnLevel').value) || null });
    // próximo golpe por nível que ele ainda não tem
    const lv = Number($('learnLevel').value) || 1;
    const next = [...$('learnMove').options].find((o) => { const m = /^nv (\d+)/.exec(o.textContent); return m && Number(m[1]) >= lv && !moves.includes(o.value); });
    if (next) { $('learnMove').value = next.value; learnMove = next.value; }
    fillLearnCurrent(mon, savedFor(mon));
    renderLearnResult(mon);
  });
}

// ---------------------------------------------------------------- aba Meu time (0.74.0)
// o time atual (até 6): Pokémon, nível e golpes — guardado no navegador por jogo; a aba Golpes usa nível e golpes no
// "Vale a pena aprender?" e o botão "Aprendi" atualiza o membro do time
const teamMonLabel = (m) => humanize(m.species) + ' nv ' + m.level;
// atalhos na aba Golpes: um chip por membro do time
function renderMovesTeam() {
  const box = $('movesTeam');
  if (!box || !data) return;
  const team = loadTeam();
  const q = findOpponent(data.pokemon, $('movesQ').value.trim())?.name;
  box.innerHTML = team.length
    ? '<span class="meta">Seu time:</span> ' + team.map((m, i) => '<button type="button" class="tchip mini" data-slot="' + i + '" aria-pressed="' + (q === m.species && (teamSlotOf({ name: q }, team) === i)) + '">' + img(data.pokemon.find((p) => p.name === m.species)?.id) + '<span>' + teamMonLabel(m) + '</span></button>').join('')
    : '<span class="meta">Dica: escreva seu time na aba <button type="button" class="linkish" id="movesGoTeam">Meu time</button> — aqui ele já vem com o nível e os golpes de cada um.</span>';
  for (const b of box.querySelectorAll('[data-slot]')) b.addEventListener('click', () => openTeamMoves(Number(b.dataset.slot)));
  $('movesGoTeam')?.addEventListener('click', () => showTab('team'));
}
function openTeamMoves(i) {
  const m = loadTeam()[i];
  if (!m) return;
  learnSlot = i; learnFor = null; learnMove = null;
  selectMon(m.species, 'moves');
  $('movesQ').value = humanize(m.species);
  if ($('moves').hidden) showTab('moves'); else renderMoves();
}
// aba Meu time do jogo aberto
function renderMyTeam() {
  if (!data) return;
  teamEditor($('teamOut'), { gameId: currentGame, d: data, label: currentGameLabel(), level: Number($('level').value) || 5, onLearn: openTeamMoves,
    intro: 'A Recomendação e o "Vale a pena aprender?" (aba Golpes) usam o nível e os golpes daqui.' });
}
/**
 * Editor do time (aba Meu time e tela inicial — 0.75.0): até 6 Pokémon, nível e 4 golpes, guardados por jogo.
 * ctx: { gameId, d (dados do jogo), label, level (nível sugerido ao adicionar), onLearn(i), intro }
 * Sem ids dentro (as duas telas podem estar na página ao mesmo tempo): tudo por classe dentro de `box`.
 */
function teamEditor(box, ctx) {
  if (!box) return;
  const { gameId, d } = ctx;
  const team = readTeam(gameId, d);
  const map = new Map(Object.keys(d.moves).flatMap((k) => [[humanize(k).toLowerCase(), k], [k, k]]));
  const sprite = (mon) => { const id = mon?.spriteId ?? mon?.id; return id ? `<img src="${SPRITES}${id}.png" alt="">` : ''; };
  const L = (s) => gameId + '-' + s; // datalists com id por jogo
  const card = (m, i) => {
    const mon = d.pokemon.find((p) => p.name === m.species);
    return '<div class="team-card" data-i="' + i + '">' + sprite(mon) +
      '<div class="team-fields"><div class="team-row"><label>Pokémon <input type="text" class="teamSpecies" list="' + L('teamMonList') + '" value="' + humanize(m.species) + '" spellcheck="false" autocomplete="off"></label>' +
      '<label>Nível <input type="number" class="teamLevel" min="1" max="100" value="' + m.level + '"></label></div>' +
      '<div class="learn-moves">' + [0, 1, 2, 3].map((k) => '<input type="text" class="teamMove" list="' + L('teamMoveList') + '" aria-label="Golpe ' + (k + 1) + ' de ' + humanize(m.species) + '" value="' + (m.moves?.[k] ? humanize(m.moves[k]) : '') + '" spellcheck="false" autocomplete="off">').join('') + '</div>' +
      (m.estimated ? '<p class="meta" style="margin:0">Golpes estimados pelo nível — corrija se for diferente.</p>' : '') +
      '<div class="learn-actions"><button type="button" class="btn teamLearn">Vale a pena aprender?</button><button type="button" class="linkish teamDel">tirar do time</button></div></div></div>';
  };
  // 0.77.0: o campo de adicionar vem primeiro quando o time está vazio; a explicação ficou curta
  box.innerHTML = '<p class="meta" style="margin:0">Seu time em ' + ctx.label + ' (até 6), guardado neste navegador. Os golpes vêm estimados pelo nível — corrija o que for diferente. ' + (ctx.intro ?? '') + '</p>' +
    (team.length ? '<div class="team-list">' + team.map(card).join('') + '</div>' : '') +
    (team.length < 6 ? '<div class="team-add"><label>Adicionar Pokémon <input type="text" class="teamNew" list="' + L('teamMonList') + '" placeholder="ex.: butterfree" spellcheck="false" autocomplete="off"></label><label>Nível <input type="number" class="teamNewLevel" min="1" max="100" value="' + ctx.level + '"></label><button type="button" class="btn teamAddBtn">Adicionar</button></div><p class="warn teamWarn" hidden></p>' : '<p class="meta">Time completo (6).</p>') +
    '<datalist id="' + L('teamMonList') + '">' + d.pokemon.map((p) => '<option value="' + humanize(p.name) + '">').join('') + '</datalist>' +
    '<datalist id="' + L('teamMoveList') + '">' + Object.keys(d.moves).map((k) => '<option value="' + humanize(k) + '">').join('') + '</datalist>';
  const again = () => teamEditor(box, ctx);
  const upd = (i, f) => { const t = readTeam(gameId, d); if (!t[i]) return; f(t[i], t); writeTeam(gameId, t); };
  for (const c of box.querySelectorAll('.team-card')) {
    const i = Number(c.dataset.i);
    c.querySelector('.teamSpecies').addEventListener('change', (e) => {
      const mon = findOpponent(d.pokemon, e.target.value.trim());
      if (!mon) { e.target.value = humanize(readTeam(gameId, d)[i].species); return; }
      // evoluiu: troca a espécie e os golpes continuam (só estima se ainda não tinha golpes)
      upd(i, (m) => { m.species = mon.name; if (!m.moves?.length) { m.moves = estimatedMoveset(d, mon, m.level); m.estimated = true; } });
      again();
    });
    c.querySelector('.teamLevel').addEventListener('change', (e) => { const lv = Number(e.target.value); if (lv >= 1 && lv <= 100) upd(i, (m) => { m.level = lv; }); });
    for (const el of c.querySelectorAll('.teamMove')) el.addEventListener('change', () => {
      const moves = [...c.querySelectorAll('.teamMove')].map((x) => map.get(x.value.trim().toLowerCase()) ?? null).filter(Boolean);
      upd(i, (m) => { m.moves = moves; m.estimated = false; });
      again();
    });
    c.querySelector('.teamLearn').addEventListener('click', () => ctx.onLearn(i));
    c.querySelector('.teamDel').addEventListener('click', () => { const t = readTeam(gameId, d); t.splice(i, 1); writeTeam(gameId, t); learnSlot = -1; again(); });
  }
  const q = box.querySelector('.teamNew'), btn = box.querySelector('.teamAddBtn'), warn = box.querySelector('.teamWarn');
  q?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } });
  btn?.addEventListener('click', () => {
    const mon = findOpponent(d.pokemon, q.value.trim());
    if (!mon) {
      const w = q.value.trim() && opponentWarning({ pokemon: d.pokemon, pokedex, generation: d.game.generation, gameLabel: ctx.label }, q.value.trim());
      warn.hidden = false; warn.innerHTML = '⚠ ' + (w ? w.text : 'Escreva o nome de um Pokémon deste jogo.');
      return;
    }
    const level = Math.min(100, Math.max(1, Number(box.querySelector('.teamNewLevel').value) || 1));
    const t = readTeam(gameId, d);
    t.push({ species: mon.name, level, moves: estimatedMoveset(d, mon, level), estimated: true });
    writeTeam(gameId, t);
    again();
  });
}

// tela inicial (0.75.0): o time de qualquer jogo, sem abrir o jogo — escolhe o jogo (padrão: o último aberto) e edita;
// "Vale a pena aprender?" abre o jogo na aba Golpes com esse Pokémon
let homeTeamGame = null, homeTeamOpen = null;
const homeTeamCache = {};
async function renderHomeTeam() {
  const box = $('homeTeam');
  if (!box || !catalog) return;
  const on = catalog.games.filter((g) => g.status === 'supported');
  let last = null;
  try { last = localStorage.getItem('poketact:last'); } catch {}
  // jogo inicial: o último aberto; senão, o 1º que já tem time guardado
  const withTeam = on.find((g) => { try { return JSON.parse(localStorage.getItem(`poketact:time:${g.id}`) ?? '[]').length; } catch { return false; } });
  homeTeamGame ??= (on.find((g) => g.id === last) ?? withTeam)?.id ?? '';
  // recolhido numa linha (0.77.0); 0.78.0, decisão do usuário: SEMPRE recolhido ao abrir — pode haver um time em cada jogo,
  // e a linha diz quais jogos já têm time guardado ("FireRed / LeafGreen (2) · Emerald (3)")
  const summary = () => {
    const saved = on.map((g) => { try { return [g, JSON.parse(localStorage.getItem(`poketact:time:${g.id}`) ?? '[]').length]; } catch { return [g, 0]; } }).filter(([, n]) => n > 0);
    return saved.length ? 'times guardados: ' + saved.map(([g, n]) => g.label + ' (' + n + ')').join(' · ') : 'opcional — escreva o seu time para as sugestões usarem';
  };
  homeTeamOpen ??= false;
  box.innerHTML = '<details' + (homeTeamOpen ? ' open' : '') + '><summary><h2 style="margin:0">Meu time</h2><span class="meta" id="homeTeamSum">' + summary() + '</span></summary>' +
    '<div class="stack"><div class="home-team-head"><label class="meta">Jogo <select id="homeTeamGame"><option value="">— escolher —</option>' +
    groupByGeneration(on).map(([gen, gs]) => '<optgroup label="Geração ' + roman(gen) + '">' + gs.map((g) => '<option value="' + g.id + '"' + (g.id === homeTeamGame ? ' selected' : '') + '>' + g.label + '</option>').join('') + '</optgroup>').join('') +
    '</select></label></div><div id="homeTeamBody" class="stack"></div></div></details>';
  box.querySelector('details').addEventListener('toggle', (e) => { homeTeamOpen = e.target.open; });
  $('homeTeamGame').addEventListener('change', (e) => { homeTeamGame = e.target.value; homeTeamOpen = true; renderHomeTeam(); });
  // adicionar/tirar Pokémon muda a linha de resumo
  for (const ev of ['click', 'change']) $('homeTeamBody').addEventListener(ev, () => setTimeout(() => { const s = $('homeTeamSum'); if (s) s.textContent = summary(); }, 0));
  const body = $('homeTeamBody');
  if (!homeTeamGame) { body.innerHTML = '<p class="meta" style="margin:0">Escolha o jogo para escrever o seu time: Pokémon, nível e golpes. Depois, veja se vale a pena aprender cada golpe novo.</p>'; return; }
  const gid = homeTeamGame;
  if (!homeTeamCache[gid]) {
    body.innerHTML = '<div class="skel" style="width:60%"></div><div class="skel"></div>';
    try { homeTeamCache[gid] = await (await fetch(`data/${gid}.json`)).json(); } catch { body.innerHTML = '<p class="warn">Não deu para carregar os dados do jogo.</p>'; return; }
    if (homeTeamGame !== gid || !$('homeTeamBody')) return;
  }
  const g = on.find((x) => x.id === gid);
  let lv = 5;
  try { lv = Number(JSON.parse(localStorage.getItem(`poketact:${gid}`) ?? 'null')?.level) || 5; } catch {}
  teamEditor($('homeTeamBody'), { gameId: gid, d: homeTeamCache[gid], label: g.label, level: lv,
    intro: '"Vale a pena aprender?" abre o jogo na aba Golpes com o nível e os golpes daqui.',
    onLearn: (i) => { location.hash = `#/jogo/${gid}?aba=golpes&time=${i}`; } });
}

// ---------------------------------------------------------------- aba Onde capturar
/** De onde vem a taxa de aparição do jogo (crédito na tela): Bulbapedia por lugar, peso no bioma (SV), tabelas do Ultra Sun. */
function rateCredit(acq) {
  const parts = [];
  if (acq?.ratesSource) parts.push('taxa de aparição da Bulbapedia (quando o lugar casa)');
  if (acq?.usumDumpSource) parts.push('no Ultra Sun também pelas tabelas do jogo publicadas no CPokemon/usum-data');
  if (acq?.spawnWeightsSource) parts.push('chance estimada pelo peso de cada espécie no bioma (Bulbapedia)');
  return parts.join('; ');
}
const currentGameLabel = () => catalog?.games.find((g) => g.id === currentGame)?.label ?? data.game.label;
function renderDex() {
  const out = $('dexOut');
  if (!data) return;
  const q = $('dexQ').value.trim();
  const mon = findOpponent(data.pokemon, q);
  if (!mon) {
    const w = q && opponentWarning({ pokemon: data.pokemon, pokedex, generation: data.game.generation, gameLabel: currentGameLabel() }, q);
    out.innerHTML = w ? '<p class="warn">⚠ ' + w.text + '</p>' : '<p class="meta">Digite um Pokémon para ver onde capturar em ' + currentGameLabel() + ' — todos os locais da versão escolhida, com método e nível.</p>';
    return;
  }
  if (dexFromCounter === mon.name) applied.dex = mon.name; else selectMon(mon.name, 'dex');
  const version = $('version').value;
  const vLabel = $('version').selectedOptions[0]?.textContent ?? version;
  const head = '<div class="opp">' + img(mon.id) + '<div><strong>#' + (mon.speciesId ?? mon.id) + ' ' + humanize(mon.name) + '</strong><br>' + mon.types.map(typeBadge).join('') + '</div></div>';
  if (!acq) { out.innerHTML = head + '<p class="meta">Este jogo ainda não tem dados de onde obter.</p>'; return; }
  const r = catchReport(data, acq, mon, version);
  const cur = $('stage').value === '' ? null : Number($('stage').value);
  // est: estágio estimado pelo nível dos selvagens (local que o detonado não cita — B3)
  const stageTxt = (st, est = false) => (st == null ? '' : ' <span class="meta">— ' + stageLabel(st, acq.progress?.leaderOrder, acq.progress) + (est ? ' (estimativa pelo nível)' : '') + (cur != null && st > cur ? ' (ainda não liberado no seu progresso)' : '') + '</span>');
  let html = head;
  if (r.lines.length) {
    if (r.from) html += '<p><strong>Não aparece direto em ' + vLabel + '.</strong> Capture ' + humanize(r.from) + ' e evolua: ' + r.steps.map((st) => { const d = describeEvolution(st.evo); return humanize(st.to) + (d ? ' (' + d + ')' : ''); }).join(' → ') + '</p><div class="walk-h">Onde capturar ' + humanize(r.from) + '</div>';
    else html += '<div class="walk-h">Em ' + vLabel + ' (' + r.lines.length + (r.lines.length > 1 ? ' formas de obter' : ' forma de obter') + ')</div>';
    html += '<ul class="walk-list">' + r.lines.map((l) => '<li>' + l.text + (l.random ? ' <span class="meta">(aleatório)</span>' : '') + stageTxt(l.stage, l.estimated) + '</li>').join('') + '</ul>';
    // os dois caminhos: além da captura direta, capturar a forma anterior e evoluir (às vezes sai bem mais cedo)
    if (r.alt) html += '<div class="walk-h">Ou pela evolução' + (r.alt.earlier ? ' <span class="lozenge info">mais cedo</span>' : '') + '</div><p>Capture ' + humanize(r.alt.from) + ' e evolua: ' + r.alt.steps.map((st) => { const d = describeEvolution(st.evo); return humanize(st.to) + (d ? ' (' + d + ')' : ''); }).join(' → ') + stageTxt(r.alt.stage) + '</p>' +
      '<ul class="walk-list">' + r.alt.lines.map((l) => '<li>' + l.text + (l.random ? ' <span class="meta">(aleatório)</span>' : '') + stageTxt(l.stage, l.estimated) + '</li>').join('') + (r.alt.more ? '<li class="meta">+' + r.alt.more + ' outras formas de obter ' + humanize(r.alt.from) + '</li>' : '') + '</ul>';
  } else html += '<p><strong>Não dá para obter em ' + vLabel + '</strong> — nem capturando, nem evoluindo algo que se captura' + (r.events.length ? '; só por evento: ' + r.events.join('; ') : ' (só trocando com outro jogo)') + '.</p>';
  if (r.others.length) html += '<p class="meta">Nas outras versões: ' + r.others.map((o) => ($('version').querySelector('option[value="' + o.version + '"]')?.textContent ?? o.version) + ' (' + o.count + (o.count > 1 ? ' formas de obter' : ' forma de obter') + ')').join(', ') + '.</p>';
  if (acq.encountersOnly) html += rateCredit(acq) ? `<p class="note">Locais e níveis das tabelas do jogo (PKHeX); ${rateCredit(acq)}.</p>` : '<p class="note">Locais e níveis das tabelas do jogo (PKHeX), sem taxa de aparição.</p>';
  out.innerHTML = html + '<div id="dexEvo"></div><div id="dexMap"></div><div id="dexPlaces"></div>';
  renderEvolutions(mon, stageTxt);
  renderRegionMap(r.lines.map((l) => l.where));
  renderPlaces(r.lines.map((l) => l.where));
}

// evoluções da família: método de cada uma e, quando pede item (pedra, Metal Coat…), onde achar o item no jogo
// <jogo>-evoitems.json: onde o detonado diz que acha os itens de evolução e as Mega Stones (baixado na 1ª vez)
async function loadEvoItems() {
  if (evoItems === null) {
    // jogos com decomp: itens em acq.items (sem arquivo) — só os outros têm <jogo>-evoitems.json
    if (acq?.items && Object.keys(acq.items).length) evoItems = { items: {} };
    else { try { evoItems = await (await fetch(`data/${currentGame}-evoitems.json`)).json(); } catch { evoItems = { items: {} }; } }
  }
  return evoItems;
}
async function renderEvolutions(mon, stageTxt) {
  const game = currentGame;
  await loadEvoItems();
  const version = $('version').value;
  const vLabel = $('version').selectedOptions[0]?.textContent ?? version;
  const r = evolutionReport(data, acq, mon, evoItems, version);
  // espécie da família que não é deste jogo (Pichu no FireRed): os jogos onde aparece vêm de pokemon-games.json
  if (r.nodes.some((n) => !n.inGame)) await loadPokeGames();
  const box = $('dexEvo');
  if (!box || game !== currentGame) return;
  const outside = (n) => {
    const where = pokeGames?.where?.[n.name] ?? {};
    const vName = (g, v) => g.versions.find((x) => x.id === v)?.label ?? v;
    const here = catalog.games.find((g) => g.id === game);
    if (where[game]?.length && here) return ' <span class="lozenge warn">não se obtém em ' + vLabel + '</span> <span class="meta">— só em ' + where[game].map((v) => vName(here, v)).join(', ') + '</span>';
    const on = catalog.games.filter((g) => g.status === 'supported' && where[g.id]).sort((a, b) => a.generation - b.generation || a.year - b.year);
    const chip = (g) => '<a href="#/jogo/' + g.id + '?capturar=' + n.name + '">' + g.label + (where[g.id].length < g.versions.length ? ' (só ' + where[g.id].map((v) => vName(g, v)).join(', ') + ')' : '') + '</a>';
    return ' <span class="lozenge warn">não é deste jogo</span><div class="meta">' + (on.length ? 'Aparece em: ' + on.map(chip).join(', ') : 'Não dá para obter em nenhum jogo do app sem troca ou evento.') + '</div>';
  };
  if (r.nodes.length < 2) { box.innerHTML = '<div class="walk-h">Evoluções</div><p class="meta">' + humanize(mon.name) + ' não evolui nem vem de evolução.</p>'; return; }
  const link = (n) => (n.name === mon.name ? '<strong>' + humanize(n.name) + '</strong>' : '<a href="#" data-evo="' + n.name + '">' + humanize(n.name) + '</a>');
  const itemHtml = (it) => {
    // jogos sem decomp: linhas da Bulbapedia (achado / loja-presente-prêmio), com o ponto da história quando o lugar casa
    if (it.bulba?.length) return '<ul class="walk-list">' + it.bulba.map((b) => {
      const st = it.sources.find((s) => s.text.startsWith(b.text))?.stage ?? null;
      return '<li>' + (b.kind === 'achado' ? 'Achado: ' : 'Loja, presente ou prêmio: ') + b.text + (b.dlc?.length ? ' <span class="meta">(DLC ' + b.dlc.join('/') + ')</span>' : '') + stageTxt(st) + '</li>';
    }).join('') + '</ul><p class="note">Fonte: Bulbapedia (nomes dos lugares em inglês).</p>';
    if (it.sources.length) return '<ul class="walk-list">' + it.sources.map((s) => '<li>' + s.text + stageTxt(s.stage) + '</li>').join('') + '</ul>';
    if (it.cited.length) return '<ul class="walk-list">' + it.cited.slice(0, 4).map((c) => '<li>“' + c.text + '” <span class="meta">— detonado, trecho ' + c.section.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()) + '</span></li>').join('') + '</ul><p class="note">Citação do detonado do PokeMythology, não posição conferida no código do jogo.</p>';
    return '<p class="meta">Onde achar ' + it.label + ': não está nos dados deste jogo nem no detonado.</p>';
  };
  box.innerHTML = '<div class="walk-h">Evoluções</div><ul class="evo-tree">' + r.nodes.map((n) => '<li style="margin-left:' + n.depth * 1.4 + 'em">' + (n.depth ? '↳ ' : '') + img(n.id) + link(n) +
    (n.depth ? ' — ' + (n.how || 'método não informado') + (n.possible ? '' : ' <span class="lozenge warn">não dá neste jogo</span>') : ' <span class="meta">(forma base)</span>') + (n.inGame ? (n.byEgg ? ' <span class="lozenge info">por ovo na creche</span>' : '') : outside(n)) +
    (n.item && n.possible ? '<div class="evo-item"><span class="meta">Onde achar ' + n.item.label + ':</span>' + itemHtml(n.item) + '</div>' : '') + '</li>').join('') + '</ul>';
  box.querySelectorAll('[data-evo]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); $('dexQ').value = humanize(a.dataset.evo); renderDex(); }));
}

// fotos dos lugares: capturas do trecho do detonado do PokeMythology que fala de cada lugar (até 4 lugares, 2 fotos cada)
// mapa esquemático da região (desenho nosso com as posições do decomp): todos os lugares em cinza, os de captura destacados
// arquivos de imagens do jogo aberto (baixados na 1ª vez que uma aba precisa deles)
async function loadRegionMap() {
  // o catálogo já diz se o jogo tem mapa (capture.regionMap): sem mapa, nem pede o arquivo (era um 404 a cada jogo novo)
  const hasMap = catalog?.games.find((g) => g.id === currentGame)?.capture?.regionMap !== false;
  if (regionMap === null) { try { if (!hasMap) throw 0; regionMap = await (await fetch(`data/${currentGame}-regionmap.json`)).json(); } catch { regionMap = { regions: [], placeOf: {} }; } }
  return regionMap;
}
async function loadPlaces() {
  if (places === null) { try { places = await (await fetch(`data/${currentGame}-places.json`)).json(); } catch { places = { places: {} }; } }
  return places;
}
const placeOfWhere = (w) => places?.places?.[w] ?? places?.places?.[w.replace(/\s*\(.*?\)\s*/g, ' ').trim()];
const mapSourceNote = () => 'Desenho com as posições do mapa da região tiradas do código do jogo (' + regionMap.source.replace(/\s*\(.*\)$/, '') + '). Passe o mouse nos pontos para ver os nomes.';

/** SVG(s) do mapa da região com os lugares `wheres` destacados; '' se nenhum lugar está no mapa. */
function regionSvg(wheres, caption = 'mapa esquemático') {
  if (!regionMap?.regions?.length) return '';
  const hits = new Map(); // região → Set de índices de ponto
  for (const w of wheres) { const at = regionMap.placeOf?.[w]; if (at) (hits.get(at[0]) ?? hits.set(at[0], new Set()).get(at[0])).add(at[1]); }
  if (!hits.size) return '';
  return [...hits].map(([ri, set]) => {
    const r = regionMap.regions[ri];
    const pad = Math.max(r.w, r.h) * 0.06, u = Math.max(r.w, r.h) / 60; // unidade de desenho proporcional à grade do jogo
    // cidades com o nome em letra pequena (referência para se localizar); o resto só o ponto
    const town = (p) => /\b(town|city|island|plateau|village)\b/i.test(p.name) && !/route|gate|port/i.test(p.name);
    const side = (p, d) => (p.x > r.w * 0.62 ? `x="${p.x - d}" text-anchor="end"` : `x="${p.x + d}"`);
    const dots = r.points.map((p, i) => set.has(i) ? '' : `<circle cx="${p.x}" cy="${p.y}" r="${u * (town(p) ? 1.3 : 0.8)}" class="rm-dot${town(p) ? ' rm-town' : ''}"><title>${p.name}</title></circle>` + (town(p) ? `<text ${side(p, u * 1.8)} y="${p.y + u * 0.8}" font-size="${u * 2}" class="rm-town-label">${p.name.replace(/ (City|Town)$/, '')}</text>` : '')).join('');
    const hot = [...set].map((i) => { const p = r.points[i]; return `<circle cx="${p.x}" cy="${p.y}" r="${u * 2}" class="rm-hit"><title>${p.name}</title></circle><text x="${p.x}" y="${p.y - u * 2.6}" text-anchor="${p.x < r.w * 0.22 ? 'start' : p.x > r.w * 0.78 ? 'end' : 'middle'}" font-size="${u * 2.8}" class="rm-label">${p.name}</text>`; }).join('');
    return `<figure class="region-map"><svg viewBox="${-pad} ${-pad} ${r.w + pad * 2} ${r.h + pad * 2}" role="img" aria-label="Mapa de ${r.name} com os lugares destacados"><rect x="${-pad}" y="${-pad}" width="${r.w + pad * 2}" height="${r.h + pad * 2}" rx="${u * 2}" class="rm-bg"/>${dots}${hot}</svg><figcaption class="meta">${r.name} — ${caption}</figcaption></figure>`;
  }).join('');
}

async function renderRegionMap(wheres) {
  const game = currentGame;
  await loadRegionMap();
  const box = $('dexMap');
  if (!box || game !== currentGame) return;
  const svg = regionSvg(wheres);
  box.innerHTML = svg ? '<div class="walk-h">No mapa da região</div><div class="region-maps">' + svg + '</div><p class="note">' + mapSourceNote() + '</p>' : '';
}

async function renderPlaces(wheres) {
  const game = currentGame;
  if (places === null) { try { places = await (await fetch(`data/${game}-places.json`)).json(); } catch { places = { places: {} }; } }
  const box = $('dexPlaces');
  if (!box || game !== currentGame) return;
  const seen = new Set(), cards = [];
  for (const w of wheres) {
    const p = places.places?.[w] ?? places.places?.[w.replace(/\s*\(.*?\)\s*/g, ' ').trim()];
    if (!p || seen.has(p.section)) continue;
    seen.add(p.section);
    cards.push('<figure class="place"><div class="place-imgs">' + p.images.slice(0, 2).map((src) => '<a href="' + src + '" target="_blank" rel="noopener"><img src="' + src + '" alt="' + w + '" loading="lazy" referrerpolicy="no-referrer"></a>').join('') + '</div><figcaption><strong>' + w + '</strong>' + (p.credit ? ' <span class="meta">— imagem: <a href="' + p.page + '" target="_blank" rel="noopener">' + p.credit + '</a> (o detonado não tem foto deste lugar)</span>' : p.section.toLowerCase() === w.toLowerCase() ? '' : ' <span class="meta">— trecho do detonado: ' + p.section.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, c) => a + c.toUpperCase()) + '</span>') + '</figcaption></figure>');
    if (cards.length === 4) break;
  }
  box.innerHTML = cards.length ? '<div class="walk-h">Como é o lugar</div><div class="places">' + cards.join('') + '</div><p class="note">' + places.credit + ' <a href="' + places.page + '" target="_blank" rel="noopener">Abrir o detonado</a></p>' : '';
}

async function renderWalk() {
  const box = $('walk');
  if (!walk) {
    box.innerHTML = '<div class="card" aria-busy="true"><div class="skel" style="width:40%"></div><div class="skel"></div></div>' + '<div class="skel tall"></div>'.repeat(3);
    try { walk = await (await fetch(`data/${currentGame}-walkthrough.json`)).json(); } catch { box.innerHTML = '<div class="card">Este jogo ainda não tem detonado.</div>'; return; }
  }
  await Promise.all([loadPlaces(), loadRegionMap()]); // fotos dos lugares e mapa da região (Onde capturar e Detonado)
  const v = walk.versions[$('version').value] ?? Object.values(walk.versions)[0];
  // mapa da região de cada etapa: os locais dela destacados (onde a história passa nesse trecho); recolhível
  const stageMap = (s) => { const svg = q ? '' : regionSvg(s.locations.flatMap((l) => [l.name, ...(l.maps ?? [])]), 'locais desta etapa'); return svg ? '<details class="stage-map"><summary class="meta">🗺 Ver no mapa da região</summary><div class="region-maps">' + svg + '</div></details>' : ''; };
  const q = walkQ.trim().toLowerCase();
  const mine = $('starter').value;
  const cur = $('stage').value === '' ? null : Number($('stage').value);
  const lead = walk.leaders;
  const mons = (party) => party.map((p) => humanize(p.species) + ' ' + p.level).join(', ');
  const locHtml = (l) => {
    const trainers = l.trainers.filter((t) => !mine || !t.forStarter || t.forStarter.includes(mine));
    const bySp = {};
    for (const w of l.wild) (bySp[w.species] ??= []).push(w);
    const parts = [];
    if (l.wild.length) parts.push('<div class="walk-h">Pokémon selvagens</div><ul class="walk-list">' + Object.entries(bySp).map(([sp, ws]) => '<li>' + humanize(sp) + ' — ' + ws.map((w) => w.method + (w.times ? ' (' + w.times.join('/') + ')' : '') + (shownDetail(w) ? ' [' + shownDetail(w) + ']' : '') + (w.gate ? ' [exige ' + (w.gate.leader ? 'HM + insígnia de ' + humanize(w.gate.leader.toLowerCase()) : w.method) + ']' : '') + ' nv ' + (w.min === w.max ? w.min : w.min + '–' + w.max) + (w.pct != null || l.maps.length > 1 ? ' (' + [w.pct != null && pctText(w),l.maps.length > 1 && w.where].filter(Boolean).join(', ') + ')' : '')).join('; ') + '</li>').join('') + '</ul>');
    // linhas iguais viram uma com "×N" (o Power Plant tem dois Electrode — encontros de verdade, não repetição)
    const otherLines = l.others.map((o) => humanize(o.species) + ' — ' + ({ gift: 'presente', static: 'encontro único', egg: 'ovo de presente', breed: 'ovo na creche', trade: 'troca', prize: 'prêmio', event: 'evento', starter: 'inicial', roamer: 'errante' }[o.type] ?? o.type) + (o.level ? ' nv ' + o.level : '') + ' (' + o.where + ')' + (o.detail ? ' — ' + o.detail : ''));
    const otherCount = new Map();
    for (const t of otherLines) otherCount.set(t, (otherCount.get(t) ?? 0) + 1);
    if (l.others.length) parts.push('<div class="walk-h">Presentes, trocas e encontros</div><ul class="walk-list">' + [...otherCount].map(([t, n]) => '<li>' + t + (n > 1 ? ' ×' + n : '') + '</li>').join('') + '</ul>');
    if (l.items.length) parts.push('<div class="walk-h">Itens e TMs</div><ul class="walk-list">' + l.items.map((i) => '<li>' + (i.kind === 'TM/HM' ? 'TM/HM ' + humanize(i.move) : humanize(i.item.toLowerCase().replace(/_/g, '-'))) + ' — ' + ({ gym: 'prêmio do líder', gift: 'presente', mart: 'loja', ground: 'no chão', hidden: 'escondido' }[i.type] ?? i.type) + ' em ' + i.where + (i.x != null ? ' (' + i.x + ',' + i.y + ')' : '') + (i.by && i.type !== 'ground' && i.type !== 'hidden' ? ' — ' + i.by : '') + '</li>').join('') + '</ul>');
    if (l.tutors.length) parts.push('<div class="walk-h">Tutores</div><ul class="walk-list">' + l.tutors.map((t) => '<li>' + humanize(t.move) + ' — ' + t.where + (t.x != null ? ' (' + t.x + ',' + t.y + ')' : '') + (t.detail ? ' — ' + t.detail : '') + '</li>').join('') + '</ul>');
    if (trainers.length) parts.push('<div class="walk-h">Treinadores</div><ul class="walk-list">' + trainers.map((t) => '<li><strong>' + t.label + '</strong>' + (t.double ? ' (dupla)' : '') + ': ' + mons(t.party) + '</li>').join('') + '</ul>');
    // fotos do lugar (detonado do PokeMythology, por referência) — carregam só quando o local é aberto (loading=lazy)
    const ph = [l.name, ...(l.maps ?? [])].map(placeOfWhere).find(Boolean); // o local do detonado reúne vários mapas ("Mt Moon 1F"…)
    const photos = ph ? '<div class="loc-photos">' + ph.images.slice(0, 2).map((src) => '<a href="' + src + '" target="_blank" rel="noopener"><img src="' + src + '" alt="' + l.name + '" loading="lazy" referrerpolicy="no-referrer"></a>').join('') + (ph.credit ? '<span class="meta">imagem: <a href="' + ph.page + '" target="_blank" rel="noopener">' + ph.credit + '</a></span>' : '') + '</div>' : '';
    return '<details class="loc"' + (q ? ' open' : '') + '><summary>' + l.name + (l.minLevel ? ' <span class="meta">nv ' + l.minLevel + '+</span>' : '') + (ph ? ' <span class="meta" title="tem fotos do lugar">📷</span>' : '') + '</summary>' + photos + parts.join('') + '</details>';
  };
  const match = (l) => !q || l.name.toLowerCase().includes(q) || l.wild.some((w) => w.species.includes(q)) || l.others.some((o) => o.species.includes(q)) || l.trainers.some((t) => t.label.toLowerCase().includes(q) || t.party.some((p) => p.species.includes(q)));
  const stagesHtml = v.stages.map((s) => {
    const locs = s.locations.filter(match);
    if (q && !locs.length && !s.leader?.party.some((p) => p.species.includes(q))) return '';
    const L = s.leader;
    const leaderHtml = L && L.party.length ? '<div class="walk-h">' + (walk.leaderTitle ?? 'Próximo líder') + '</div><p><strong>' + humanize(L.name.toLowerCase()) + '</strong> — ' + (L.where ?? '') + '<br>' + L.party.map((p) => humanize(p.species) + ' nv ' + p.level + (p.item ? ' (' + p.item + ')' : '') + ': ' + p.moves.map(humanize).join(', ')).join('<br>') + (L.prize.length ? '<br><span class="meta">Prêmio: TM ' + L.prize.map(humanize).join(', ') + '</span>' : '') + '</p>' : '';
    const open = q || cur === s.stage || (cur == null && s.stage === 0);
    return '<details class="stage' + (cur === s.stage ? ' current' : '') + '"' + (open ? ' open' : '') + '><summary>' + (walk.noBadges ? 'Ordem da história' : stageLabel(s.stage, lead, walk).replace(/^./, (c) => c.toUpperCase())) + ' <span class="meta">— ' + s.locations.length + ' locais</span></summary>' + leaderHtml + stageMap(s) + locs.map(locHtml).join('') + '</details>';
  }).join('') +
    // Gens 5–9: locais das tabelas do jogo que o detonado não cita — sem posição na história
    ((v.undetermined ?? []).filter(match).length ? '<details class="stage"' + (q ? ' open' : '') + '><summary>Fora do detonado <span class="meta">— ' + v.undetermined.filter(match).length + ' locais sem posição na história</span></summary>' + v.undetermined.filter(match).map(locHtml).join('') + '</details>' : '');
  // 0.78.0: só a busca no topo; o crédito do detonado foi para o fim (era um parágrafo entre a busca e as etapas)
  box.innerHTML = '<div class="card"><input type="text" id="walkSearch" placeholder="Buscar local, Pokémon ou treinador" aria-label="Buscar no detonado" value="' + q.replace(/"/g, '') + '"></div>' + (stagesHtml || '<div class="card">Nada encontrado.</div>') +
    '<p class="note">' + walk.credit + ' Os estágios são estimados pela ordem do detonado e pelas conexões do mapa.</p>';
  const input = $('walkSearch');
  input.addEventListener('input', () => { walkQ = input.value; const pos = input.selectionStart; renderWalk().then(() => { const i = $('walkSearch'); i.focus(); i.setSelectionRange(pos, pos); }); });
}

function fillStarters() {
  const sel = $('starter');
  sel.innerHTML = '<option value="">não informar</option>' + (data.starters?.species ?? []).map((n) => '<option value="' + n + '">' + humanize(n) + '</option>').join('');
}

function fillStages() {
  const sel = $('stage');
  const p = acq?.progress;
  sel.innerHTML = '<option value="">não sei (usa o nível)</option>' + // texto curto: o antigo era cortado no celular
    (p ? Array.from({ length: (p.post ?? 9) + 1 }, (_, s) => '<option value="' + s + '">' + stageLabel(s, p.leaderOrder, p) + '</option>').join('') : '');
  sel.disabled = !p;
  sel.title = p ? 'Estimado pela ordem do detonado (' + p.source + ')' : 'Sem linha do tempo para este jogo';
}

// treinadores comuns do Battle Subway (Smogon, 0.70.0): sem time fixo — o "time" é a lista de conjuntos de onde ele sorteia
// 3 (simples) ou 4 (dupla); progresso = o dos chefes do Subway
function subwayTrainers(sw, list) {
  const stage = list.find((t) => /^Subway Boss/.test(t.label))?.stage ?? null;
  return sw.trainers.map((t) => ({ key: t.key, label: t.label, name: t.label, class: t.class, group: 'Battle Subway', map: [t.section], stage, pool: true,
    party: t.pool.map((n) => ({ ...sw.sets[n], set: n, level: sw.level, defaultMoves: false, movesSource: 'Smogon' })) }));
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
      o.textContent = t.pool ? `${t.label} (sorteia de ${t.party.length} conjuntos)` : `${t.label} (${t.party.length} Pokémon${t.double ? ', dupla' : ''})`;
      og.append(o);
    }
    sel.append(og);
  }
  renderTrainerPicker();
}

// ---------------------------------------------------------------- oponente por categoria (abas) — no lugar do dropdown único
// ordem das abas; grupos que só alguns jogos têm (Equipe Aqua / Magma, Frontier Brains) entram antes dos comuns
const CAT_ORDER = ['Líderes de ginásio', 'Partidas de promoção', 'Líderes de Kanto', 'Elite dos Quatro', 'Campeão', 'Rival'];
const CAT_LABEL = { 'Líderes de ginásio': 'Líderes', 'Treinadores comuns': 'Outros treinadores' };
let trainerCat = null;
let pickerOpen = false; // 0.77.0: com um oponente escolhido, a lista fica recolhida até tocar em "Trocar oponente"
const topLevel = (t) => Math.max(...t.party.map((p) => p.level));
const capName = (s) => (s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s.])(\S)/g, (m, a, b) => a + b.toUpperCase()) : s); // Gen 3: "BRENDAN" → "Brendan"
/** Nome curto do treinador como os botões mostram ("Leader Brock" → "Brock"; rival com o inicial que ele leva). */
// sem o número da luta no fim: o Emerald rotula "Leader Roxanne 1" … "Roxanne 5" e a luta principal aparecia como "Roxanne 1"
// (0.79.0, pedido do usuário); as revanches já ficam separadas e marcadas por orderTrainers
const trainerName = (t) => capName(t.group === 'Rival' ? (t.carries ? `${t.name} (com ${humanize(t.carries)})` : t.name) : t.label.replace(/^(Leader|Elite Four|Champion|Gym Leader|Líder)\s+/i, '').replace(/\s+\d+$/, ''));
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
  // rótulo sem o número da luta: no Emerald os líderes vêm "Roxanne 1" … "Roxanne 5" e as 5 apareciam como lutas principais
  // (40 botões em Líderes) — agora "Roxanne 1" é a luta e as outras vão para Revanches (0.78.0)
  return sorted.map((t) => { const k = t.label.replace(/\s+\d+$/, '') + '|' + (t.forStarter ?? []).join() + (g === 'Rival' ? '|' + (t.map?.[0] ?? '') : ''); const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); return { t, rematch: !!t.rematch || n > 1 }; })
    .sort((a, b) => Number(a.rematch) - Number(b.rematch));
}
function renderTrainerPicker() {
  if (data) renderStarters(); // o inicial recolhe/abre conforme o oponente (0.78.0)
  const cats = trainerCategories();
  $('trainerBox').hidden = !cats.length;
  if (!cats.length) return;
  const current = trainers.find((x) => x.key === $('trainer').value);
  if (current && cats.some((c) => c.g === current.group)) trainerCat = current.group;
  // 0.77.0: a 1ª categoria (Líderes) já vem aberta — antes era preciso tocar numa aba para ver qualquer oponente
  if (!cats.some((c) => c.g === trainerCat)) trainerCat = cats[0].g;
  $('trainerCats').innerHTML = cats.map((c) => `<button type="button" role="tab" data-cat="${c.g}" aria-selected="${c.g === trainerCat}">${CAT_LABEL[c.g] ?? c.g}<span class="count">${c.g === 'Treinadores comuns' || c.list.length > 60 ? c.list.length : orderTrainers(c.g, c.list).filter((x) => !x.rematch).length}</span></button>`).join(''); // revanches fora da conta (Emerald: Líderes 8, não 40)
  // aba já aberta continua aberta (antes, tocar de novo fechava a lista — aba que some ao tocar confunde)
  for (const b of $('trainerCats').querySelectorAll('button')) b.addEventListener('click', () => { trainerCat = b.dataset.cat; pickerOpen = true; renderTrainerPicker(); });
  const cat = cats.find((c) => c.g === trainerCat);
  const box = $('trainerPick');
  // 0.83.0: com o oponente escolhido, a lista inteira fica escondida (renderAsk) e o chip mostra a escolha; o resumo
  // "Brock · nv 14 + Trocar oponente" da 0.77.0 saiu (repetia o chip)
  renderAsk();
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
    const name = trainerName(t);
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
  pickerOpen = false; starterOpen = false; oppLocked = true; // 0.83.0: escolheu → a pergunta recolhe no chip
  const t = trainers.find((x) => x.key === key);
  if (!t) { known = null; teamMode = null; $('team').innerHTML = ''; renderTrainerPicker(); update(); return; }
  setLevelFor(t);
  if (t.pool) { known = null; teamMode = t; renderTeam(t, -1); update(); } // Subway: abre direto contra todos os conjuntos possíveis
  else pickTrainerMon(t, 0);
  renderTrainerPicker();
}
// nível do seu time = o do Pokémon mais forte do treinador (como no banco de lutas): com o padrão 30, o Brock (nv 12–14)
// recebia sugestões de nível 30. O usuário pode mudar o campo depois.
// Progresso = o ponto da história da luta: líder pela ordem das insígnias (Brock = 0 insígnias); outro treinador pelo
// estágio dele nos dados. Sem isso, TMs e Pokémon de bem depois (Giga Drain, Surf) entravam na conta.
function setLevelFor(t) {
  const ace = Math.max(0, ...t.party.map((p) => p.level ?? 0));
  if (ace > 0) $('level').value = ace;
  if (!t.rematch && acq?.progress) {
    const order = acq.progress.leaderOrder ?? [];
    const key = (s) => fold(String(s ?? '')).replace(/[^a-z]/g, '');
    const li = /Líderes/.test(t.group ?? '') ? order.findIndex((n) => String(n).split('/').some((x) => key(x) === key(t.name))) : -1;
    const st = li >= 0 ? li : Number.isInteger(t.stage) ? t.stage : null;
    if (st != null && [...$('stage').options].some((o) => o.value === String(st))) { $('stage').value = String(st); renderTrainerPicker(); }
  }
  saveCtx();
}

function pickTrainerMon(t, i) {
  const p = t.party[i];
  oppLocked = true;
  $('opp').value = p.species;
  $('oppLevel').value = p.level;
  // dvs (Gen 1–2) / iv (Gen 3): atributos reais do Pokémon do treinador no cálculo de dano
  known = { moves: p.moves, item: p.item, default: p.defaultMoves, dvs: p.dvs ?? null, iv: p.iv ?? null, species: p.species, mega: p.mega ?? null, tera: p.tera ?? null, dynamax: p.dynamax ?? null, zMove: p.zMove ?? null, movesSource: p.movesSource ?? null };
  teamMode = null;
  renderTeam(t, i);
  update();
}


function renderTeam(t, active) {
  const box = $('team');
  box.innerHTML = '';
  // Subway: até 96 conjuntos — um botão "contra todos" e a lista num seletor (espécie, item e golpes)
  if (t.pool) {
    box.innerHTML = `<span class="team-label">Calcular contra:</span><button type="button" aria-pressed="${!!teamMode}">Todos os ${t.party.length} conjuntos</button>` +
      `<select aria-label="Um conjunto da lista"><option value="">— ou ver um conjunto da lista —</option>${t.party.map((p, i) => `<option value="${i}"${!teamMode && i === active ? ' selected' : ''}>${humanize(p.species)}${p.item ? ' @ ' + p.item : ''} — ${p.moves.map(humanize).join(', ')}</option>`).join('')}</select>`;
    box.querySelector('button').addEventListener('click', () => { teamMode = t; known = null; renderTeam(t, -1); update(); });
    box.querySelector('select').addEventListener('change', (e) => { if (e.target.value !== '') pickTrainerMon(t, Number(e.target.value)); });
    return;
  }
  // 0.83.0: segmentos com mini sprite dentro do cartão da luta (o título "Contra o Onix de Brock" diz de quem é o time)
  box.setAttribute('aria-label', 'Pokémon de ' + trainerName(t));
  t.party.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    const mon = data.pokemon.find((x) => x.name === p.species);
    b.innerHTML = (mon ? img(mon.id) : '') + `<span>${humanize(p.species)} nv ${p.level}</span>`;
    b.setAttribute('aria-pressed', String(!teamMode && i === active));
    b.addEventListener('click', () => pickTrainerMon(t, i));
    box.append(b);
  });
  if (t.party.length > 1) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'all';
    b.textContent = 'Time inteiro';
    b.setAttribute('aria-pressed', String(!!teamMode));
    b.addEventListener('click', () => { teamMode = t; renderTeam(t, -1); update(); });
    box.append(b);
  }
}

// S3 (0.60.0): com que nível e progresso a conta foi feita — o app ajusta os dois ao escolher a luta e o campo fica longe
// ("Calculado com o seu time no nv 14 · antes da 1ª insígnia — mudar")
// inicial pelo time montado: um Pokémon do time da família de um dos iniciais do jogo (Charmeleon → Charmander)
function teamStarter() {
  const starters = data?.starters?.species ?? [];
  if (!starters.length) return null;
  for (const t of loadTeam()) {
    let m = data.pokemon.find((p) => p.name === t.species);
    for (let i = 0; m && i < 4; i++) { if (starters.includes(m.name)) return m.name; m = data.pokemon.find((p) => p.id === m.evolvesFrom); }
  }
  return null;
}
function ctxLine() {
  const ts = !$('starter').value && teamStarter();
  const st = ($('stage').value === '' ? '' : ' · ' + ($('stage').selectedOptions[0]?.textContent ?? '')) + (ts ? ' · inicial: ' + humanize(ts) + ' (do seu time)' : '');
  return `<p class="note ctx">Calculado com o seu time no <strong>nv ${$('level').value || '—'}</strong>${st} — <a href="#" data-ctx-edit>mudar</a></p>`;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-ctx-edit]')) return;
  e.preventDefault();
  $('filters').open = true; // nível e filtros ficam recolhidos (0.77.0)
  $('level').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('level').focus(); $('level').select();
});

// "nocauteia em 2 golpes; aguenta 4 (Stomp); age primeiro → vence"
function duelLine(d) {
  if (!d) return 'sem golpe útil contra ele';
  const n = (x) => (Number.isFinite(x) ? `${x} golpe${x > 1 ? 's' : ''}` : 'não nocauteia');
  const order = d.faster === 1 ? 'age primeiro' : d.faster === 0.5 ? 'velocidade igual' : 'age depois';
  const theirs = Number.isFinite(d.theirTurns) ? `ele precisa de ${n(d.theirTurns)} (${humanize(d.theirMove)})` : 'os golpes dele não o nocauteiam';
  return `${!d.move ? 'Sem golpe útil' : Number.isFinite(d.myTurns) ? 'Nocauteia em ' + n(d.myTurns) + ' com ' + humanize(d.move) : 'Não nocauteia com ' + humanize(d.move)}; ${theirs}; ${order} → <strong class="${d.win ? 'good' : 'bad'}">${d.win ? 'vence a troca' : 'perde a troca'}</strong>`;
}

function currentOpp() {
  const mon = findOpponent(data.pokemon, $('opp').value);
  // Pokémon de treinador que luta Mega (detonado): atributos, tipos e habilidade da Mega
  return mon && (known?.mega || known?.tera || known?.dynamax || known?.zMove) && known.species === mon.name ? battleForm(mon, known) : mon;
}

// ---- 0.83.0 "pergunta": escolhido o oponente (busca ou treinador), o campo vira um chip [sprite Nome nv X ✕] e a lista de
// treinadores fica atrás de "Trocar treinador" — antes os dois caminhos ficavam abertos juntos ("onix" no campo e o Brock
// escolhido na lista). ✕ tira o oponente; tocar no nome volta ao campo para digitar
let oppLocked = false, askWasLocked = null;
function lockOpp() { if (findOpponent(data.pokemon, $('opp').value)) { oppLocked = true; pickerOpen = false; update(); } }
function unlockOpp(clear) {
  oppLocked = false; pickerOpen = false;
  if (clear) { $('opp').value = ''; $('oppLevel').value = ''; known = null; teamMode = null; $('trainer').value = ''; $('team').innerHTML = ''; renderTrainerPicker(); }
  update();
  $('opp').focus(); $('opp').select();
}
function renderAsk() {
  if (!data) return;
  const t = trainers.find((x) => x.key === $('trainer').value);
  const opp = findOpponent(data.pokemon, $('opp').value);
  const locked = !!teamMode || (oppLocked && !!opp);
  $('oppField').hidden = locked;
  $('oppChip').hidden = !locked;
  $('trainerBox').hidden = !trainers.length || (locked && !pickerOpen);
  if (locked !== askWasLocked) { askWasLocked = locked; renderStarters(); } // o inicial recolhe junto
  if (!locked) { $('oppChip').innerHTML = ''; return; }
  const who = teamMode ? data.pokemon.find((p) => p.name === teamMode.party.at(-1)?.species) : currentOpp();
  const lv = Number($('oppLevel').value);
  const name = teamMode ? (teamMode.pool ? trainerName(teamMode) + ' · time sorteado' : trainerName(teamMode) + ' · time inteiro')
    : humanize(opp.name) + (lv ? ' nv ' + lv : '') + (t ? ' · ' + trainerName(t) : '');
  $('oppChip').innerHTML = `<span class="opp-chip">${who ? img(who.megaSprite ?? who.id) : ''}<button type="button" class="chip-name" data-chip-edit title="Digitar outro Pokémon">${name}</button>` +
    '<button type="button" class="chip-x" data-chip-clear aria-label="Tirar o oponente" title="Tirar o oponente">✕</button></span>' +
    (trainers.length ? `<button type="button" class="btn" id="oppPickTrainer" aria-expanded="${pickerOpen}" aria-controls="trainerBox">${pickerOpen ? 'Fechar a lista' : `<span class="long">${t || teamMode ? 'Trocar' : 'Escolher'} treinador</span><span class="short">${t || teamMode ? 'Trocar' : 'Treinador'}</span>`}</button>` : '');
}
$('oppChip').addEventListener('click', (e) => {
  if (e.target.closest('[data-chip-clear]')) return unlockOpp(true);
  if (e.target.closest('[data-chip-edit]')) { if (teamMode) return unlockOpp(true); return unlockOpp(false); }
  if (e.target.closest('#oppPickTrainer')) { pickerOpen = !pickerOpen; renderTrainerPicker(); update(); }
});

function update() {
  renderOppWarn();
  // resumo do que está recolhido em "Nível e filtros"
  $('tuneSum').textContent = '— seu time nv ' + ($('level').value || '—') + ($('oppLevel').value ? ' · oponente nv ' + $('oppLevel').value : '');
  // só quando o oponente muda (update roda a cada filtro; não pode desfazer um Pokémon escolhido em outra aba)
  const oppName = findOpponent(data.pokemon, $('opp').value)?.name;
  if (oppName !== lastOppSel) { lastOppSel = oppName; selectMon(oppName); }
  const opp = currentOpp();
  const out = $('resultsBody');
  renderAsk();
  // cartão da luta (#resultsHead): título, time do treinador, oponente, "Ele ataca com…", "Calculado com…" e os filtros
  const t = trainers.find((x) => x.key === $('trainer').value);
  $('oppInfo').innerHTML = ''; $('oppWeak').innerHTML = ''; $('fightThreat').hidden = true; $('fightCtx').innerHTML = '';
  $('resultsHead').hidden = !opp && !teamMode;
  if (teamMode) $('fightTitle').textContent = teamMode.pool ? `Contra ${trainerName(teamMode)} (time sorteado)` : `Contra o time inteiro de ${trainerName(teamMode)}`;
  else if (opp) $('fightTitle').textContent = `Contra ${t ? 'o ' + humanize(opp.name) + ' de ' + trainerName(t) : humanize(opp.name)}${Number($('oppLevel').value) ? ' (nv ' + $('oppLevel').value + ')' : ''}`;
  if (teamMode?.pool) { renderTeamResults(teamMode, baseOptions(), out); return; }
  if (!opp) {
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
  $('oppInfo').innerHTML = `<div class="opp">${img(opp.megaSprite ?? opp.id)}
    <div><strong>#${opp.speciesId ?? opp.id} ${opp.megaName ? 'Mega ' + humanize(opp.name) + (/-mega-([xyz])$/.test(opp.megaName) ? ' ' + opp.megaName.slice(-1).toUpperCase() : '') + ' <span class="lozenge warn">luta Mega (detonado)</span>' : humanize(opp.name)}</strong><br>${opp.teraType ? opp.baseTypes.map(typeBadge).join('') + ' → Tera ' + typeBadge(opp.teraType) + ' <span class="lozenge warn">terastaliza (detonado)</span>' : opp.types.map(typeBadge).join('')}${opp.dynamax ? ` <span class="lozenge warn">${opp.dynamax === 'gigantamax' ? 'Gigantamax' : 'Dynamax'} (detonado): vida 1,5× e golpes Max nos 3 primeiros turnos</span>` : ''}
    <div class="meta">${data.game.generation >= 3 ? 'Habilidades: ' + (opp.abilities.map(humanize).join(', ') || '—') : ''}${known ? `<br>Golpes ${known.default ? '(padrão do jogo para o nível)' : known.movesSource === 'Bulbapedia' ? '(do time na Bulbapedia)' : known.movesSource === 'Smogon' ? '(do time na Smogon)' : '(definidos pelo jogo)'}${known.zMove ? ` — usa golpe Z a partir de ${humanize(known.zMove)} no 1º turno` : ''}: ${known.moves.map(humanize).join(', ')}${known.item ? `<br>Item: ${known.item}` : ''}` : oppLevel ? `<br>Golpes prováveis nv ${oppLevel}: ${likelyMoveset(opp, oppLevel).map(humanize).join(', ')}` : ''}</div></div></div>`;
  $('oppWeak').innerHTML = weakHtml; // ao lado do oponente no computador, embaixo no celular

  const baseOpts = baseOptions();
  if (teamMode) { $('oppInfo').innerHTML = ''; $('oppWeak').innerHTML = ''; renderTeamResults(teamMode, baseOpts, out); return; }
  const { picks, threats, threatSource, team } = recommend(vData(), opp, { ...baseOpts, oppLevel, oppMoves: known?.moves, oppDvs: known?.dvs, oppIv: known?.iv });
  renderPicks(out, picks, threats, threatSource, team);
}

// filtros da tela → opções do cálculo
function baseOptions() {
  return {
    level: Number($('level').value) || 1,
    version: $('version').value,
    onlyObtainable: $('onlyObtainable').checked,
    fullyEvolvedOnly: $('fullEvo').checked,
    includeLegendary: $('legend').checked,
    machines: $('machines').checked,
    stage: $('stage').value === '' ? null : Number($('stage').value),
    starter: $('starter').value || teamStarter(), // sem inicial escolhido: o do seu time (0.76.0)
    tradeEvolutions: $('tradeEvos').checked,
    megaEvolution: $('megaEvo').checked,
    zMoves: $('zMoves').checked,
    terastal: $('terastal').checked,
    dynamax: $('dynamax').checked,
    // luta em que o jogo deixa dinamaxizar: a do treinador escolhido, quando um Pokémon dele dinamaxiza (detonado)
    dynamaxBattle: !!trainers.find((x) => x.key === $('trainer').value)?.party.some((p) => p.dynamax),
    acq: vAcq(),
    myTeam: loadTeam(), // Meu time (0.76.0): nível e golpes de cada um
  };
}


// Meu time (0.76.0) na Recomendação: quem do time que você montou usar contra este Pokémon — com o nível e os golpes de cada um
// sem time: uma linha só (era um cartão inteiro entre a ameaça e as sugestões — 0.77.0)
const teamHint = () => '<div class="card my-team-card slim"><p class="note" style="margin:0">💡 Monte o seu time na aba <button type="button" class="linkish" data-go-team>Meu time</button> — aqui aparece quem dele usar nesta luta.</p></div>';
document.addEventListener('click', (e) => { if (e.target.closest('[data-go-team]')) { e.preventDefault(); showTab('team'); } });
function myTeamCard(team) {
  if (!team.length) return teamHint();
  const best = team[0];
  const head = best.duel?.win
    ? '✅ Use o <strong>' + humanize(best.mon.name) + '</strong> do seu time' + (best.move ? ' com ' + humanize(best.move.name) : '') + '.'
    : '⚠ Ninguém do seu time vence a troca de golpes contra ele' + (best.duel ? ' — o que vai melhor é o ' + humanize(best.mon.name) : '') + '. Veja abaixo quem capturar ou treinar.';
  const row = (t) => '<li class="my-team-row">' + img(t.mon.id) + '<div><strong>' + humanize(t.mon.name) + ' nv ' + t.level + '</strong> ' +
    (t.duel ? verdictChips(t.duel, t.move) : lozenge('bad', t.moves.length ? 'sem golpe de dano' : 'sem golpes no time')) +
    (t.move ? '<div class="meta">' + humanize(t.move.name) + ' ' + typeBadge(t.move.type) + ' ' + fmtMult(t.move.eff) + '</div>' : '') +
    '<details><summary>por quê</summary><div class="meta">' + (t.duel ? duelLine(t.duel) : 'Escreva os golpes dele em Meu time.') +
    ' · recebe ' + t.incoming.map((x) => typeBadge(x.type) + '<span class="' + (x.mult < 1 ? 'good' : x.mult > 1 ? 'bad' : '') + '">' + fmtMult(x.mult) + '</span>').join(' ') + '</div></details></div></li>';
  return '<div class="card my-team-card"><strong>Seu time</strong> <span class="meta">(nível e golpes de Meu time)</span><p class="my-team-verdict ' + (best.duel?.win ? 'ok' : 'bad') + '">' + head + '</p><ul class="my-team-list">' + team.map(row).join('') + '</ul></div>';
}
function myTeamPartyCard(team, t) {
  if (!team.length) return teamHint();
  const best = team[0];
  const head = best.wins ? '✅ Do seu time, quem vai melhor contra ' + t.label + ': <strong>' + humanize(best.mon.name) + '</strong> (vence ' + best.wins + ' de ' + best.total + ').' : '⚠ Ninguém do seu time vence a troca contra nenhum Pokémon de ' + t.label + '. Veja abaixo quem capturar ou treinar.';
  const row = (m) => '<li class="my-team-row">' + img(m.mon.id) + '<div><strong>' + humanize(m.mon.name) + ' nv ' + m.level + '</strong> ' + lozenge(m.wins === m.total ? 'ok' : m.wins ? 'warn' : 'bad', 'vence ' + m.wins + ' de ' + m.total) +
    '<div class="meta">' + m.vs.map((x) => (x.duel?.win ? '<span class="good">✓</span>' : '<span class="bad">✗</span>') + ' ' + humanize(x.opp) + (x.move ? ' (' + humanize(x.move.name) + ')' : '')).join(' · ') + '</div></div></li>';
  return '<div class="card my-team-card"><strong>Seu time</strong> <span class="meta">(nível e golpes de Meu time)</span><p class="my-team-verdict ' + (best.wins ? 'ok' : 'bad') + '">' + head + '</p><ul class="my-team-list">' + team.map(row).join('') + '</ul></div>';
}
function renderPicks(out, picks, threats, threatSource, team = []) {
  // a ameaça é o que ELE usa contra você (não as fraquezas dele, que ficam no quadro do oponente)
  const threatLine = threatSource.kind === 'known'
    ? `Ele ataca com (${known?.movesSource === 'Bulbapedia' ? 'golpes do time na Bulbapedia' : known?.movesSource === 'Smogon' ? 'golpes do time na Smogon' : trainersFromWalk ? 'golpes estimados pelo nível — time do detonado' : 'golpes reais do time'}): ${threats.map(typeBadge).join('')}`
    : threatSource.kind === 'moveset'
      ? `Ele deve atacar com (golpes prováveis no nível): ${threats.map(typeBadge).join('')}`
      : `Ele deve atacar com golpes dos próprios tipos (sem nível informado): ${threats.map(typeBadge).join('')}`;

  $('fightThreat').innerHTML = threatLine; $('fightThreat').hidden = false;
  $('fightCtx').innerHTML = ctxLine();
  out.innerHTML = myTeamCard(team) + '<h2 class="picks-title">Para capturar ou treinar</h2>' + (picks.length ? '<div class="picks">' + picks.map((s, i) => {
    const m = s.move;
    const src = m.via.source;
    const via = m.via.method === 'level-up' ? `aprende no nv ${m.via.level}`
      : m.via.method === 'machine' ? 'TM/HM' + (src ? ` (${src.type === 'gym' ? 'prêmio do ginásio de ' + src.leader : src.type === 'mart' ? 'loja: ' + src.where : src.where}${src.level != null ? `, estimativa nv ${src.level}+` : ''})` : '') /* loja sem selvagens por perto (Goldenrod Dept Store 5F): sem estimativa */
      : 'tutor' + (src ? ` (${src.where}${src.by ? ', ' + src.by : ''})` : '');
    const inc = s.incoming.map((x) => `${typeBadge(x.type)}<span class="${x.mult < 1 ? 'good' : x.mult > 1 ? 'bad' : ''}">${fmtMult(x.mult)}</span>`).join(' ');
    const mg = s.mega;
    return `<div class="card pick">
      <div class="pick-head">${img(mg ? mg.spriteId : s.mon.id)}<div><div class="rank">#${i + 1} sugestão${team.some((x) => x.mon.name === s.mon.name) ? ' ' + lozenge('info', 'já está no seu time') : ''}</div><h3>${mg ? megaTitle(mg, s.mon) : humanize(s.mon.name)}</h3><div>${(mg ? mg.types : s.mon.types).map(typeBadge).join('')}</div></div></div>
      <div class="verdict">${verdictChips(s.duel, m, s.unreliable)}</div>${mg ? megaLine(mg) : ''}${s.zMove ? zLine(s.zMove, m) : ''}${s.tera ? teraLine(s.tera) : ''}${s.dynamax ? dynLine(s.dynamax) : ''}
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
  }).join('') + '</div>' : '<div class="card empty">Nenhuma sugestão com esses filtros — tente desmarcar algum em <strong>Nível e filtros</strong> ou subir o nível do seu time.</div>');
}

// Mega Evolução na sugestão: nome da Mega, a pedra e quando se ganha o Mega Ring (detonado)
const megaTitle = (mg, mon) => (mg.primal ? 'Primal ' : 'Mega ') + humanize(mon.name) + (/-mega-([xyz])$/.test(mg.name) ? ' ' + mg.name.slice(-1).toUpperCase() : '') + ' <span class="meta">(' + humanize(mon.name) + ' + Mega Evolução)</span>';
function megaLine(mg) {
  const ring = mg.ring ? ` · ${mg.primal ? 'Reversão Primal' : 'Mega Ring'}: ${mg.ring.section.toLowerCase().replace(/(^|\s)(\S)/g, (x, a, b) => a + b.toUpperCase())} (${stageLabel(mg.ring.stage, acq?.progress?.leaderOrder, acq?.progress)})` : ' · quando se ganha o Mega Ring: não está nos dados deste jogo';
  // onde achar a pedra: frases do detonado (build-evo-items); baixa o arquivo na 1ª sugestão Mega e redesenha
  if (evoItems === null) loadEvoItems().then(update);
  const cited = evoItems?.items?.[mg.stone] ?? [], bulba = evoItems?.bulbapedia?.[mg.stone] ?? [];
  // Bulbapedia (tabela Acquisition da pedra) vem antes da frase do detonado
  const where = bulba.length ? `Onde achar (Bulbapedia): ${bulba.map((b) => b.text).join('; ')}` : cited.length ? `Onde achar (detonado): “${cited[0].text}” <span class="meta">— trecho ${cited[0].section.toLowerCase().replace(/(^|\s)(\S)/g, (x, a, b) => a + b.toUpperCase())}</span>`
    : `<span class="meta">Onde achar a ${mg.stone}: o detonado não diz — a sugestão vale se você tiver a pedra (desligue em Nível e filtros → Usar Mega Evolução).</span>`;
  return `<div class="kv"><b>${mg.primal ? 'Reversão Primal' : 'Mega Evolução'}</b>segurando ${mg.stone}${ring}<br>${where}</div>`;
}

// Dynamax na sugestão: o golpe Max dos 3 primeiros turnos, a vida maior e quando se ganha a Dynamax Band (detonado)
function dynLine(x) {
  const band = x.band && acq?.progress ? ` (${stageLabel(x.band.stage, acq.progress.leaderOrder, acq.progress)})` : '';
  return `<div class="kv"><b>Dynamax</b>golpe Max ${typeBadge(x.type)} a partir de ${humanize(x.name)} (poder ${x.power}, não erra) nos 3 primeiros turnos; vida 1,5×<br><span class="meta">Precisa da Dynamax Band${band}; só em luta de ginásio/campeonato. Vida 1,5× = nível de Dynamax 0 (o de quem você captura); efeitos extras do golpe Max (clima, atributos) não entram na conta.</span></div>`;
}

// Terastal na sugestão: o tipo Tera (um dos tipos do Pokémon), o efeito e quando se ganha a Tera Orb (detonado)
function teraLine(t) {
  const orb = t.orb && acq?.progress ? ` (${stageLabel(t.orb.stage, acq.progress.leaderOrder, acq.progress)})` : '';
  return `<div class="kv"><b>Terastal</b>tipo Tera ${typeBadge(t.type)}: golpes desse tipo com STAB 2× e defesa só como ${t.type}<br><span class="meta">Precisa da Tera Orb${orb} e que o tipo Tera do seu Pokémon seja ${t.type} (o normal de quem você captura é um dos tipos dele).</span></div>`;
}

// golpe Z na sugestão: de qual golpe sai, o poder, o cristal e quando se ganha (detonado) e o golpe dos turnos seguintes
function zLine(z, m) {
  const when = (x) => (x && acq?.progress ? ` (${stageLabel(x.stage, acq.progress.leaderOrder, acq.progress)})` : '');
  const crystal = z.crystal ? `${z.crystal.name}${when(z.crystal)}` : `o Z-Crystal do tipo ${z.type}`;
  const after = z.name === m.name || m.turns <= 1 ? '' : `; depois, ${humanize(m.name)}`; // o Z sozinho já nocauteia: sem "depois"
  return `<div class="kv"><b>Golpe Z no 1º turno</b>${typeBadge(z.type)} a partir de ${humanize(z.name)} (poder ${z.power}, não erra)${after}<br><span class="meta">Precisa do Z-Ring${when(z.ring)} e de ${crystal}.${z.crystal ? '' : ' Onde achar o cristal: não está nos dados deste jogo.'}</span></div>`;
}

// veredito em selos: vence/perde, quantos golpes, quem age primeiro, aviso de origem aleatória
function verdictChips(d, m, unreliable) {
  if (!d) return lozenge('bad', 'sem golpe útil');
  const n = (x) => (Number.isFinite(x) ? `${x} golpe${x > 1 ? 's' : ''}` : '—');
  return [d.win ? lozenge('ok', '✓ Vence a troca') : lozenge('bad', '✗ Perde a troca'),
    lozenge('neutral', Number.isFinite(d.myTurns) ? `nocauteia em ${n(d.myTurns)}` : 'não nocauteia'),
    d.faster === 1 ? lozenge('info', 'age primeiro') : lozenge('neutral', d.faster === 0.5 ? 'velocidade igual' : 'age depois'),
    unreliable ? lozenge('warn', '⚠ origem aleatória', unreliable) : ''].join('');
}

// uma linha de "como conseguir" (a 1ª fonte, já ordenada por estágio) + quando fica disponível
function howToGet(s) {
  if (!acq) return '';
  const w = whereToGet(vData(), vAcq(), s.mon, $('version').value);
  if (!w.direct.length) return '';
  // a fonte que libera mais cedo (estágio/nível), não a 1ª selvagem: o Machop no HGSS saía "Mt. Mortar" (estágio 6) com a
  // troca da Goldenrod (estágio 2) disponível
  const at = (x) => (s.stageNeeded != null ? Math.max(x.stage ?? (acq.progress?.post ?? 9), x.gate?.stage ?? 0) : Math.max(x.min ?? x.level ?? 1, x.gate?.level ?? 1));
  // com progresso, prefere a fonte de nível compatível com o time (A7: o motor só conta essas)
  const lvOk = (x) => s.stageNeeded == null || Math.max(x.min ?? x.level ?? 1, x.area?.level ?? 1, x.gate?.level ?? 1) <= (Number($('level').value) || 100) + LEVEL_MARGIN;
  const pick = (list) => [...list].sort((a, b) => lvOk(b) - lvOk(a) || at(a) - at(b) || (b.pct ?? 0) - (a.pct ?? 0))[0];
  let best = pick(w.direct), from = w.from;
  // a captura direta sai depois do que o motor achou (s.stageNeeded / s.reach)? então é pela pré-evolução: mostra essa
  const need = s.stageNeeded ?? s.reach;
  const alt = !w.from && at(best) > need && !/^TRADE/.test(s.mon.evo?.kind ?? '') && preEvolutionRoute(vData(), vAcq(), s.mon, $('version').value);
  if (alt) { best = pick(alt.direct); from = alt.from; }
  const first = formatSources([best], 1)[0] ?? '';
  const when = s.stageNeeded != null ? stageLabel(s.stageNeeded, acq.progress?.leaderOrder, acq.progress) : Number.isFinite(s.reach) && s.reach > 1 ? `a partir do nv ${s.reach}` : '';
  return `<div class="kv"><b>Como conseguir${when ? ` <span class="when">· ${when}</span>` : ''}</b>${from ? `evolua de ${humanize(from)} · ` : ''}${first.replace(/ — (exige|estimativa:) .*$/, '')}${trainLine(s, best, from)}</div>`; /* porta (HM/insígnia) e estimativa de área ficam em "Detalhes" */
}
// o cálculo põe o Pokémon no nível do seu time: quando ele é capturado mais baixo, diz até onde treinar e por quê
// ("Capture no nv 2–5 e treine até o nv 11 — aprende Karate Chop no nv 11")
function trainLine(s, src, from) {
  const lo = src?.min ?? src?.level;
  if (!lo || !s.move) return '';
  const why = [];
  const evoLv = from ? s.mon.minLevel ?? 0 : 0; // nível em que a evolução sai (Butterfree: 10)
  if (evoLv > lo) why.push(`evolui para ${humanize(s.mon.name)} no nv ${evoLv}`);
  const mvLv = s.move.via?.method === 'level-up' ? s.move.via.level : 0;
  if (mvLv > lo) why.push(`aprende ${humanize(s.move.name)} no nv ${mvLv}`);
  const target = Math.max(evoLv, mvLv);
  if (target <= lo) return '';
  const range = src.max && src.max !== lo ? `${lo}–${src.max}` : lo;
  const verb = { starter: 'Receba', gift: 'Receba', trade: 'Receba na troca', breed: 'Choque o ovo', egg: 'Choque o ovo' }[src.type] ?? 'Capture';
  return `<br><span class="train">⬆ ${verb} no nv ${range} e treine até o nv ${target} — ${why.join('; ')}. A troca de golpes acima considera o seu time no nv ${$('level').value}.</span>`;
}

// modo "contra o time inteiro": as 3 que vencem mais Pokémon do time, com a troca contra cada um
let poolTok = 0;
function renderTeamResults(t, opts, out) {
  // Subway: a conta contra até 96 conjuntos leva ~0,6 s — mostra "calculando" antes; resultado velho (outra escolha no meio) é descartado
  if (t.pool) {
    const tok = ++poolTok;
    $('fightCtx').innerHTML = ctxLine() + `<p class="note">Calculando contra os ${t.party.length} conjuntos possíveis de ${t.label}…</p>`;
    out.innerHTML = skeleton();
    setTimeout(() => { if (tok === poolTok && teamMode === t) renderPoolResults(t, opts, out); }, 30);
    return;
  }
  const { picks, team } = recommendTeam(vData(), t.party, opts);
  $('fightCtx').innerHTML = ctxLine() + `<p class="note">As sugestões vencem a troca de golpes contra mais Pokémon do time (cálculo de dano da Geração ${roman(data.game.generation)}, com o nível e os golpes reais de cada um).</p>`;
  out.innerHTML = myTeamPartyCard(team, t) + '<h2 class="picks-title">Para capturar ou treinar</h2>' +
    (picks.length ? '<div class="picks">' + picks.map((s, i) => `<div class="card pick">
      <div class="pick-head">${img(s.mon.id)}<div><div class="rank">#${i + 1} sugestão</div><h3>${humanize(s.mon.name)}</h3><div>${s.mon.types.map(typeBadge).join('')}</div></div></div>
      <div class="verdict">${lozenge(s.wins === s.total ? 'ok' : s.wins ? 'warn' : 'bad', `vence ${s.wins} de ${s.total}`)}${s.unreliable ? lozenge('warn', '⚠ origem aleatória', s.unreliable) : ''}</div>
      <div class="kv"><b>Contra cada um</b>${s.vs.map((x) => `${x.duel?.win ? '<span class="good">✓</span>' : '<span class="bad">✗</span>'} ${humanize(x.opp)} nv ${x.level}`).join('<br>')}</div>
      ${howToGet(s)}
      <details class="more"><summary>Detalhes</summary><ul class="why">${s.vs.map((x) => `<li><strong>${humanize(x.opp)} nv ${x.level}</strong>: ${duelLine(x.duel)}</li>`).join('')}
        ${renderWhere(s.mon, s.reach, s.stageNeeded)}${unreliableLine(s)}</ul></details></div>`).join('') + '</div>' : '<div class="card empty">Nenhuma sugestão com esses filtros.</div>');
}

// Subway (0.70.0): o treinador sorteia 3 (simples) ou 4 (dupla) da lista — a sugestão boa é a que vence mais conjuntos dela;
// "perde para" diz quais espécies da lista ganham dela (o resto é a mesma conta do time inteiro)
function renderPoolResults(t, opts, out) {
  const { picks } = recommendTeam(vData(), t.party, opts);
  const loses = (s) => [...new Set(s.vs.filter((x) => !x.duel?.win).map((x) => humanize(x.opp)))];
  // 0.78.0: a frase principal fica; o resto da explicação em "Como é calculado"
  $('fightCtx').innerHTML = ctxLine() + `<p class="note">${t.label} (${t.map[0]}) não tem time fixo: sorteia 3 Pokémon (4 na dupla) entre ${t.party.length} conjuntos, no nível 50. As sugestões vencem o maior número deles.</p>` +
    `<details class="how"><summary>Como é calculado</summary><p class="meta">Os conjuntos são os da lista da Smogon (vale para o Black/White e o Black 2/White 2). A conta é a troca de golpes da Geração ${roman(data.game.generation)}, com os golpes e itens de cada conjunto.</p></details>`;
  out.innerHTML = '<h2 class="picks-title">Para capturar ou treinar</h2>' + (picks.length ? '<div class="picks">' + picks.map((s, i) => `<div class="card pick">
      <div class="pick-head">${img(s.mon.id)}<div><div class="rank">#${i + 1} sugestão</div><h3>${humanize(s.mon.name)}</h3><div>${s.mon.types.map(typeBadge).join('')}</div></div></div>
      <div class="verdict">${lozenge(s.wins === s.total ? 'ok' : s.wins * 2 >= s.total ? 'warn' : 'bad', `vence ${s.wins} de ${s.total} conjuntos`)}${s.unreliable ? lozenge('warn', '⚠ origem aleatória', s.unreliable) : ''}</div>
      <div class="kv"><b>Perde para</b>${loses(s).join(', ') || 'nenhum conjunto da lista'}</div>
      ${howToGet(s)}
      <details class="more"><summary>Contra cada conjunto</summary><ul class="why">${s.vs.map((x, j) => `<li><strong>${humanize(x.opp)}${t.party[j].item ? ' @ ' + t.party[j].item : ''}</strong>: ${duelLine(x.duel)}</li>`).join('')}
        ${renderWhere(s.mon, s.reach, s.stageNeeded)}${unreliableLine(s)}</ul></details></div>`).join('') + '</div>' : '<div class="card empty">Nenhuma sugestão com esses filtros.</div>');
}

// E2: aviso quando, até aqui, a espécie só sai por origem aleatória/condicionada (surto, Poké Radar, sorteio diário…)
function unreliableLine(s) {
  return s.unreliable ? `<li class="bad">⚠ Até aqui só por origem aleatória ou condicionada: ${s.unreliable}.</li>` : '';
}

for (const id of ['level', 'version', 'onlyObtainable', 'fullEvo', 'legend', 'machines', 'tradeEvos', 'megaEvo', 'zMoves', 'terastal', 'dynamax', 'stage', 'dlc']) $(id).addEventListener('input', update);
$('dlc').addEventListener('input', () => { try { localStorage.setItem(`poketact:dlc:${currentGame}`, $('dlc').checked ? '1' : '0'); } catch {} });
$('stage').addEventListener('input', () => renderTrainerPicker()); // selo "próximo" acompanha o progresso
for (const id of CTX_FIELDS) $(id).addEventListener('input', saveCtx);
// atalho "/" (como no Linear/GitHub): vai para a busca do oponente, fora de campos de texto
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') || $('tool').hidden) return;
  e.preventDefault();
  if ($('recView').hidden) showTab('rec');
  if (!$('oppField').hidden) { $('opp').focus(); $('opp').select(); } else unlockOpp(false); // com o chip: volta ao campo
});
// Digitar manualmente o Pokémon ou o nível do oponente sai do modo "treinador" (os golpes deixam de ser os do jogo)
for (const id of ['opp', 'oppLevel']) $(id).addEventListener('input', () => { if (id === 'opp') { oppLocked = false; pickerOpen = false; } known = null; teamMode = null; $('trainer').value = ''; $('team').innerHTML = ''; renderTrainerPicker(); update(); });
// autocompletar do oponente: só os Pokémon do jogo aberto (↑ ↓ escolhem, Enter confirma, Esc fecha)
function renderOppWarn() {
  const w = data && opponentWarning({ pokemon: data.pokemon, pokedex, generation: data.game.generation, gameLabel: catalog.games.find((g) => g.id === currentGame)?.label ?? data.game.label }, $('opp').value);
  $('oppWarn').hidden = !w;
  $('oppWarn').textContent = w ? '⚠ ' + w.text : '';
}
// autocompletar com os Pokémon do jogo (campo do oponente e aba Onde capturar)
function bindPokemonAc(inputId, listId, prefix, onPick) {
  const input = $(inputId), list = $(listId);
  let items = [], sel = 0;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-activedescendant', ''); };
  const paint = () => {
    // já é um Pokémon do jogo (escolhido ou digitado por inteiro): nada a sugerir
    items = data && !findOpponent(data.pokemon, input.value) ? searchOpponents(data.pokemon, input.value) : [];
    sel = Math.min(sel, Math.max(items.length - 1, 0));
    if (!items.length) return close();
    list.innerHTML = items.map((p, i) => `<li role="option" id="${prefix}${i}" aria-selected="${i === sel}" data-name="${p.name}">${img(p.id)}<strong>${humanize(p.name)}</strong><span class="ac-num">#${p.speciesId ?? p.id}</span><span class="ac-types">${p.types.map(typeBadge).join('')}</span></li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', prefix + sel);
    list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (name) => { input.value = name; close(); input.dispatchEvent(new Event('input')); onPick?.(); };
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
bindPokemonAc('opp', 'oppList', 'oa', lockOpp); // escolheu na lista → chip (0.83.0)
// Enter com o nome inteiro, ou sair do campo com um Pokémon do jogo escrito → chip
$('opp').addEventListener('keydown', (e) => { if (e.key === 'Enter' && $('oppList').hidden) lockOpp(); });
$('opp').addEventListener('blur', () => setTimeout(() => { if (!oppLocked && document.activeElement !== $('opp') && !$('tool').hidden) lockOpp(); }, 200));
bindPokemonAc('dexQ', 'dexList', 'da');
bindPokemonAc('movesQ', 'movesList', 'ma');
$('trainer').addEventListener('change', () => {
  const t = trainers.find((x) => x.key === $('trainer').value);
  if (!t) { known = null; teamMode = null; $('team').innerHTML = ''; update(); return; }
  setLevelFor(t);
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
        '<span class="row">' + (on ? qualityBadge(g) : lozenge('neutral', 'Em breve')) + (on ? featureTags(g) : '') + '</span>';
      return on ? '<a class="game" href="#/jogo/' + g.id + '">' + body + '</a>' : '<div class="game off">' + body + '</div>';
    }).join('') + '</div>').join('');
  $('catalogSources').textContent = 'Fontes do catálogo: ' + catalog.sources.join(' · ') + ' · Fotos dos consoles: Evan-Amos (Wikimedia Commons, domínio público)';
  // legenda só dos selos em uso (sem jogo parcial, o "Parcialmente verificado" não aparece)
  const used = new Set(games.filter((g) => g.status === 'supported').map(qualityOf));
  $('qualityLegend').innerHTML = Object.entries(QUALITY).filter(([q]) => used.has(q)).map(([, [k, t, tip]]) => `<span>${lozenge(k, t)} <span class="meta">${tip}</span></span>`).join('');
  renderHero();
  homeTeamOpen = false; // sempre recolhido ao voltar à tela inicial (decisão do usuário, 0.78.0)
  renderHomeTeam();
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
  $('resume').innerHTML = lg ? `<a class="card resume" href="#/jogo/${lg.id}">${pic(lg.starters?.[0])}<div><div class="meta">Continuar de onde parou</div><strong>Pokémon ${lg.label}</strong><div class="meta">${[ctx?.stage !== '' && ctx?.stage != null && (ctx.stageText || (ctx.stage === '9' ? 'pós-jogo' : ctx.stage + ' insígnia(s)')), ctx?.level && 'time nv ' + ctx.level].filter(Boolean).join(' · ')}</div></div><span class="spacer"></span><span class="lozenge info">Abrir →</span></a>` +
    // 0.80.0, pedido do usuário: ✕ para tirar o último jogo da tela inicial (o contexto do jogo continua guardado)
    `<button type="button" class="resume-x" data-forget-last aria-label="Tirar ${lg.label} da tela inicial" title="Tirar da tela inicial">✕</button>` : '';
  $('resume').querySelector('[data-forget-last]')?.addEventListener('click', () => {
    try { localStorage.removeItem('poketact:last'); } catch {}
    $('resume').innerHTML = '';
  });
  // números (Vercel): tudo calculado dos dados
  const verified = on.filter((g) => qualityOf(g) === 'ok').length, trainersN = on.reduce((a, g) => a + (g.trainerCount ?? 0), 0), b = catalog.benchmark;
  $('stats').innerHTML = [[on.length, 'jogos no app'], [verified, 'conferidos no código do jogo'], [trainersN.toLocaleString('pt-BR'), 'treinadores com o time do jogo'], b && [b.winPct + '%', `das sugestões vencem a troca (${b.picks.toLocaleString('pt-BR')} testadas${b.games ? ` em ${b.games} jogos` : ''})`]]
    .filter(Boolean).map(([n, t]) => `<div class="stat card"><b>${n}</b><span class="meta">${t}</span></div>`).join('');
  startTypingPlaceholder();
}
// placeholder que "digita" exemplos (Mobbin); para ao focar ou com movimento reduzido — exemplos do modo de busca
let setSearchMode = () => {}, clearHomeSearch = () => {}; // definidas no bloco da busca
// 0.78.0: uma busca só — Pokémon, jogos, líderes e tipos na mesma lista (antes, um seletor de 3 modos ao lado da busca).
// searchMode agora só diz se o painel da busca por tipo está aberto: 'pokemon' (fechado) | 'tipo' (aberto)
let searchMode = 'pokemon';
const PLACEHOLDER = 'Busque um Pokémon, jogo, líder ou tipo…';
const EXAMPLES = ['Pikachu', 'Whitney', 'Emerald', 'Água', 'Eevee', 'Cynthia', 'Dragão', 'Rattata de Alola', 'HeartGold', 'Lucario'];
function startTypingPlaceholder() {
  const el = $('homeSearch');
  clearTimeout(typeTimer);
  el.placeholder = PLACEHOLDER;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ex = EXAMPLES;
  let i = 0, j = 0, back = false;
  const tick = () => {
    if (document.activeElement === el || el.value || $('home').hidden) { el.placeholder = PLACEHOLDER; typeTimer = setTimeout(tick, 1200); return; }
    const w = ex[i % ex.length];
    j += back ? -1 : 1;
    el.placeholder = 'Busque: ' + w.slice(0, j) + (j % 2 ? '▏' : '');
    if (!back && j >= w.length) { back = true; typeTimer = setTimeout(tick, 1400); return; }
    if (back && j <= 0) { back = false; i++; }
    typeTimer = setTimeout(tick, back ? 45 : 95);
  };
  tick();
}

// ---- busca de Pokémon na tela inicial: em que jogos dá para obter (data/pokemon-games.json, baixado na 1ª busca)
let pokeGames = null, pokeGamesLoading = null;
const loadPokeGames = () => (pokeGamesLoading ??= fetch('data/pokemon-games.json').then((r) => r.json()).then((d) => { pokeGames = d; return d; }).catch(() => null));
const plain = (s) => fold(s).replace(/[^a-z0-9]/g, '');
function pokemonResults(q) {
  const t = plain(q);
  if (!t || !pokedex) return [];
  // espécies da Pokédex nacional + formas regionais ("Rattata de Alola" / "rattata alola")
  const names = [...pokedex.map(([id, n]) => [n, id, id]), ...Object.entries(pokeGames?.forms ?? {}).map(([n, [dex, sprite]]) => [n, dex, sprite])];
  const hits = [];
  for (const [n, dex, sprite] of names) {
    const ks = [plain(n), plain(humanize(n))];
    const score = ks.some((k) => k.startsWith(t)) ? 0 : ks.some((k) => k.includes(t)) ? 1 : -1;
    if (score >= 0) hits.push({ n, dex, sprite, score });
  }
  return hits.sort((a, b) => a.score - b.score || a.dex - b.dex || a.sprite - b.sprite).slice(0, 8).map(({ n, dex, sprite }) => {
    const games = Object.keys(pokeGames?.where?.[n] ?? {}).length;
    return { kind: 'pokemon', name: n, title: humanize(n), sub: '#' + dex + (pokeGames ? ' · ' + (games ? `obtível em ${games} jogo${games > 1 ? 's' : ''}` : 'não dá para obter em nenhum jogo do app') : ''), img: sprite };
  });
}
/** Painel abaixo da busca: os jogos (por geração) em que dá para obter o Pokémon, cada um abrindo a aba Onde capturar. */
function renderHomeDex(name) {
  const box = $('homeDex');
  if (!name) { box.hidden = true; box.innerHTML = ''; return; }
  const where = pokeGames?.where?.[name] ?? {};
  const sprite = pokeGames?.forms?.[name]?.[1] ?? pokedex?.find(([, n]) => n === name)?.[0];
  const on = catalog.games.filter((g) => g.status === 'supported' && where[g.id]).sort((a, b) => a.generation - b.generation || a.year - b.year);
  const byGen = new Map();
  for (const g of on) (byGen.get(g.generation) ?? byGen.set(g.generation, []).get(g.generation)).push(g);
  const chip = (g) => {
    const vs = where[g.id];
    const only = vs.length < g.versions.length ? ` (só ${vs.map((v) => g.versions.find((x) => x.id === v)?.label ?? v).join(', ')})` : '';
    // &pokemon= também deixa o Pokémon como oponente na aba Recomendação (antes só abria o Onde capturar)
    return `<a href="#/jogo/${g.id}?capturar=${name}&pokemon=${name}">${g.label}${only}</a>`;
  };
  box.innerHTML = `<div class="card"><div class="dex-head">${pic(sprite)}<div><strong>Onde capturar ${humanize(name)}</strong><div class="meta">${on.length ? 'Escolha o jogo para ver os locais, o método, o nível e em que ponto da história. A aba Recomendação já abre com ' + humanize(name) + ' como oponente.' :'Não dá para obter em nenhum jogo do app sem troca ou evento.'}</div><button type="button" class="linkish" data-types-of="${name}">O que vence ${humanize(name)}? (tipos)</button></div></div>` +
    [...byGen].map(([gen, gs]) => `<div class="gen-row"><b>Geração ${roman(gen)}</b>${gs.map(chip).join('')}</div>`).join('') + '</div>';
  box.hidden = false;
}

// busca com teclado: ↑ ↓ escolhem, Enter abre, Esc limpa
{
  const input = $('homeSearch'), box = $('homeResults');
  let items = [], sel = 0;
  // tudo junto: tipos (no máx. 2), Pokémon (onde capturar) e jogos/lutas — o que começa com o texto vem antes
  const results = () => {
    const q = input.value, t = fold(q.trim());
    const games = searchResults(q).slice(0, 5);
    const strong = games.filter((it) => fold(it.title).split(/[\s/·]+/).some((w) => w.startsWith(t)));
    return [...typeResults(q).filter((x) => x.kind === 'tipo').slice(0, 2), ...strong, ...pokemonResults(q).slice(0, 5), ...games.filter((x) => !strong.includes(x))].slice(0, 9);
  };
  const kindTag = (it) => (it.kind === 'tipo' ? '<span class="r-kind lozenge neutral">tipo</span>' : it.kind === 'tipomon' ? '<span class="r-kind lozenge info">tipos dele</span>' : it.kind === 'pokemon' ? '<span class="r-kind lozenge info">onde capturar</span>' : `<span class="r-kind lozenge ${it.kind === 'jogo' ? 'neutral' : 'info'}">${it.kind === 'jogo' ? 'jogo' : 'ir para a luta'}</span>`);
  const paint = () => {
    box.hidden = !input.value.trim();
    $('searchBox').setAttribute('aria-expanded', String(!box.hidden));
    box.innerHTML = items.length ? items.map((it, i) => `<li role="option" id="hr${i}" aria-selected="${i === sel}" ${it.href ? `data-href="${it.href}"` : `data-name="${it.name}"`}>${it.kind === 'tipo' ? typeBadge(it.name) : pic(it.img)}<div><strong>${it.title}</strong><div class="meta">${it.sub}</div></div>${kindTag(it)}</li>`).join('')
      : '<li class="meta" style="cursor:default">Nada encontrado — tente um Pokémon (Pikachu), um jogo (Emerald), um líder (Brock) ou um tipo (Água).</li>';
    input.setAttribute('aria-activedescendant', items.length ? 'hr' + sel : '');
  };
  const refresh = () => { items = results(); sel = 0; paint(); };
  const choose = (it) => {
    if (!it) return;
    if (it.href) { location.hash = it.href; input.value = ''; items = []; paint(); return; }
    if (it.kind === 'tipo' || it.kind === 'tipomon') {
      input.value = ''; items = []; box.hidden = true;
      if (searchMode === 'tipo') { chooseType(it); return; }
      tq.types = []; tq.from = null; chooseType(it); setSearchMode('tipo', false); return; // abre o painel de tipos já com ele
    }
    // Pokémon: onde capturar (fecha o painel de tipos, se aberto)
    if (searchMode === 'tipo') { searchMode = 'pokemon'; $('homeType').hidden = true; syncTypeHash(false); }
    input.value = it.title; items = []; box.hidden = true; renderHomeDex(it.name);
  };
  input.addEventListener('input', () => {
    renderHomeDex(null);
    if (!pokeGames) loadPokeGames().then(() => { if (input.value.trim()) refresh(); });
    if (!typecharts) loadTypecharts().then(() => { if (input.value.trim()) refresh(); });
    refresh();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; paint(); } }
    else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); choose(items[sel]); }
    else if (e.key === 'Escape') { input.value = ''; items = []; paint(); if (searchMode !== 'tipo') renderHomeDex(null); }
  });
  box.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-href], li[data-name]');
    if (!li) return;
    e.preventDefault();
    choose(items.find((it) => (li.dataset.href ? it.href === li.dataset.href : it.name === li.dataset.name)));
  });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 120));
  input.addEventListener('focus', () => { if (input.value.trim() && $('homeDex').hidden) paint(); });
  // abre ('tipo') ou fecha ('pokemon') o painel da busca por tipo; o link "Tabela de tipos" e o "fechar" do painel usam
  setSearchMode = (mode, focus = true) => {
    searchMode = mode;
    input.value = ''; items = []; box.hidden = true; renderHomeDex(null);
    $('homeType').hidden = mode !== 'tipo';
    if (mode === 'tipo') loadTypecharts().then(renderTypeSearch); else syncTypeHash(false);
    startTypingPlaceholder();
    if (focus) input.focus();
    loadPokeGames(); // sprite das formas regionais na lista
  };
  $('openTypes').addEventListener('click', () => { setSearchMode(searchMode === 'tipo' ? 'pokemon' : 'tipo', false); if (searchMode === 'tipo') $('homeType').scrollIntoView({ block: 'nearest' }); });
  // painel "Onde capturar X" → "o que vence X?" abre a busca por tipo com os tipos dele
  $('homeDex').addEventListener('click', (e) => { const b = e.target.closest('[data-types-of]'); if (!b) return; tq.from = b.dataset.typesOf; tq.types = []; tq.all = false; setSearchMode('tipo', false); });
  // 3 h parado ou fechado: a busca da tela inicial volta ao começo (resetHome)
  clearHomeSearch = () => { tq.types = []; tq.from = null; tq.gen = null; tq.game = null; tq.all = false; setSearchMode('pokemon', false); };
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !$('home').hidden && document.activeElement !== input && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')) { e.preventDefault(); input.focus(); }
  });
}

// ---- busca por tipo na tela inicial (0.71.0): "vou enfrentar" ou "vou usar" um tipo (ou os tipos de um Pokémon) →
// melhor tipo, a tabela nos dois sentidos e, com um jogo escolhido, os Pokémon do jogo. A tabela é a do próprio jogo
// (data/typecharts.json: Gen 1, Gen 2–5, Gen 6+); sem filtro, a mais nova. Link: #/?tipo=water,flying&lado=usar&ger=3&jogo=emerald
// (tipo= também aceita o nome de um Pokémon: #/?tipo=gyarados)
let typecharts = null, typechartsLoading = null;
const loadTypecharts = () => (typechartsLoading ??= fetch('data/typecharts.json').then((r) => r.json()).then((d) => { typecharts = d; return d; }).catch(() => null));
const gameJson = new Map(); // jogo → <jogo>.json (Pokémon do jogo; baixado só ao escolher o jogo)
const loadGameJson = (id) => { if (!gameJson.has(id)) gameJson.set(id, fetch('data/' + id + '.json').then((r) => r.json()).catch(() => null)); return gameJson.get(id); };
const tq = { types: [], from: null, side: 'enfrentar', gen: null, game: null, finalOnly: true, legendary: false, all: false };
const typeName = (t) => t + (TYPE_PT[t] && TYPE_PT[t] !== t ? ' (' + TYPE_PT[t] + ')' : '');
const MULT = { 4: '×4', 2: '×2', 1: '×1', 0.5: '×½', 0.25: '×¼', 0: '×0' };
/** Tabela em uso: a do jogo escolhido, a da geração escolhida ou a mais nova. */
const tqChartIndex = () => (tq.game ? typecharts.games[tq.game] : tq.gen ? typecharts.charts.findIndex((c) => c.gens.includes(tq.gen)) : typecharts.charts.length - 1);
function typeResults(q) {
  const t = plain(q);
  if (!t || !typecharts) return [];
  const all = typecharts.charts.at(-1).types;
  const types = all.filter((ty) => [plain(ty), plain(TYPE_PT[ty] ?? ty)].some((k) => k.startsWith(t)))
    .map((ty) => ({ kind: 'tipo', name: ty, title: typeName(ty), sub: 'tipo' }));
  const dexOf = (n) => pokeGames?.forms?.[n]?.[1] ?? pokedex?.find(([, x]) => x === n)?.[0];
  const mons = Object.keys(typecharts.mons).filter((n) => [plain(n), plain(humanize(n))].some((k) => k.startsWith(t)))
    .slice(0, 8 - types.length).map((n) => ({ kind: 'tipomon', name: n, title: humanize(n), sub: typecharts.mons[n].at(-1) || typecharts.mons[n].find(Boolean), img: dexOf(n) }));
  return [...types, ...mons];
}
function chooseType(it) {
  if (it.kind === 'tipomon') { tq.from = it.name; tq.types = []; }
  else { tq.from = null; tq.types = tq.types.includes(it.name) ? tq.types : [...tq.types, it.name].slice(-2); }
  tq.all = false;
  renderTypeSearch();
}
/** Mantém o link (#/?tipo=…) em dia sem recarregar a tela (replaceState não dispara hashchange). */
function syncTypeHash(on = true) {
  if (parseRoute(location.hash).view !== 'home') return;
  const q = new URLSearchParams();
  if (on && (tq.from || tq.types.length)) {
    q.set('tipo', tq.from ?? tq.types.join(','));
    if (tq.side !== 'enfrentar') q.set('lado', tq.side);
    if (tq.gen) q.set('ger', String(tq.gen));
    if (tq.game) q.set('jogo', tq.game);
  }
  // só mexe no link que é da busca por tipo (não apaga ?capturar=, ?geracao=…)
  const cur = parseRoute(location.hash).params;
  if (!q.toString() && cur.tipo == null) return;
  const want = '#/' + (q.toString() ? '?' + q : '');
  if (location.hash !== want) history.replaceState(null, '', want);
}
const rangeLabel = (c) => 'Geração ' + (c.gens.length > 1 ? roman(c.gens[0]) + '–' + roman(c.gens.at(-1)) : roman(c.gens[0]));
async function renderTypeSearch() {
  const box = $('homeType');
  if (searchMode !== 'tipo' || !typecharts) { box.hidden = searchMode !== 'tipo'; return; }
  box.hidden = false;
  const ci = tqChartIndex(), table = typecharts.charts[ci];
  const on = catalog.games.filter((g) => g.status === 'supported');
  const gens = [...new Set(on.map((g) => g.generation))].sort((a, b) => a - b);
  const gameOpts = on.filter((g) => !tq.gen || g.generation === tq.gen);
  const scope = tq.game ? 'Pokémon ' + on.find((g) => g.id === tq.game)?.label : tq.gen ? 'Geração ' + roman(tq.gen) : rangeLabel(table) + ' (a tabela mais nova)';
  const inScope = (tq.game ? 'em ' : 'na ') + scope;
  // tipos: os escolhidos, ou os do Pokémon no jogo (ou na época da tabela)
  let types = tq.types, note = '', fightLink = '';
  if (tq.from) {
    const d = tq.game ? await loadGameJson(tq.game) : null;
    const own = d?.pokemon.find((p) => p.name === tq.from)?.types;
    // vou enfrentar um Pokémon do jogo → atalho para a aba Recomendação já com ele de oponente
    if (own && tq.side === 'enfrentar') fightLink = ' · <a href="#/jogo/' + tq.game + '?pokemon=' + tq.from + '">ver a recomendação contra ' + humanize(tq.from) + ' no jogo</a>';
    types = own ?? (typecharts.mons[tq.from]?.[ci] || '').split('/').filter(Boolean);
    if (!types.length) note = humanize(tq.from) + ' não existe ' + inScope + '.';
  }
  const missing = types.filter((t) => !table.types.includes(t));
  if (missing.length) { note = 'O tipo ' + missing.map(typeName).join(' e ') + ' não existe ' + inScope + '.'; types = types.filter((t) => table.types.includes(t)); }
  const sel = (id, label, opts, val) => '<label>' + label + ' <select id="' + id + '">' + opts.map(([v, t]) => '<option value="' + v + '"' + (String(val ?? '') === String(v) ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>';
  const head = '<div class="tq-bar"><div class="search-mode" role="radiogroup" aria-label="Vou enfrentar ou vou usar" id="tqSide">' +
    [['enfrentar', 'Vou enfrentar'], ['usar', 'Vou usar']].map(([v, t]) => '<button type="button" role="radio" data-side="' + v + '" aria-checked="' + (tq.side === v) + '">' + t + '</button>').join('') + '</div>' +
    sel('tqGen', 'Geração', [['', 'Todas (tabela mais nova)'], ...gens.map((g) => [g, 'Geração ' + roman(g)])], tq.gen) +
    sel('tqGame', 'Jogo', [['', tq.gen ? 'Qualquer jogo da geração' : 'Qualquer jogo'], ...gameOpts.map((g) => [g.id, g.label])], tq.game) + '</div>' +
    '<div class="type-chips" id="tqChips">' + table.types.map((t) => '<button type="button" data-type="' + t + '" aria-pressed="' + (!tq.from && tq.types.includes(t)) + '" title="' + typeName(t) + '" style="background:' + COLORS[t] + '">' + t + '</button>').join('') +
    (tq.from || tq.types.length ? '<button type="button" class="clear" data-clear>limpar</button>' : '') + '<button type="button" class="clear type-close" data-type-close>fechar ✕</button></div>';
  const fromLine = tq.from && types.length ? '<div class="tq-head">' + pic(pokeGames?.forms?.[tq.from]?.[1] ?? pokedex?.find(([, n]) => n === tq.from)?.[0]) + '<div><strong>' + humanize(tq.from) + '</strong> ' + types.map(typeBadge).join('') + '<div class="meta">tipos ' + inScope + fightLink + '</div></div></div>' : '';
  if (!types.length) {
    box.innerHTML = '<div class="card">' + head + '<p class="meta" style="margin:0">' + (note || 'Escolha 1 ou 2 tipos acima, ou digite um tipo (Água, Fire…) ou um Pokémon (Gyarados) na busca.') + '</p></div>';
    bindTypeSearch(); syncTypeHash(); return;
  }
  const r = matchup(table, types, tq.side);
  const them = types.map(typeBadge).join('');
  const link = (t) => (tq.game ? '<a href="#/jogo/' + tq.game + '?aba=tipos&tipo=' + t + '" title="Ver os Pokémon ' + t + ' do jogo">' + typeBadge(t) + '</a>' : typeBadge(t));
  const bestList = r.best.map((b) => link(b.type) + '<span class="meta">acerta ' + MULT[b.atk] + ', leva ' + MULT[b.def] + '</span>').join(' ');
  const best = tq.side === 'enfrentar'
    ? (r.best.length ? '<strong>Melhor tipo contra</strong> ' + them + ': ' + bestList : 'Nenhum tipo acerta ' + them + ' com ×2 sem levar ×2 de volta — veja a tabela abaixo.')
    : (r.best.length ? '<strong>Bons alvos para o seu</strong> ' + them + ': ' + bestList : 'Nenhum tipo leva ×2 do seu ' + them + ' sem acertar ×2 de volta — veja a tabela abaixo.');
  const rows = (groups, label) => groups.map((g) => '<div class="tq-row"><b>' + label(g.mult) + '</b>' + g.types.map(typeBadge).join('') + '</div>').join('');
  const atkLabel = (m) => (m === 0 ? 'sem efeito ' : m < 1 ? 'pouco efetivo ' : m > 1 ? 'super efetivo ' : 'normal ') + MULT[m];
  const takeLabel = (m) => (m === 0 ? 'imune ' : m < 1 ? 'resiste ' : m > 1 ? 'leva ' : 'normal ') + MULT[m];
  const groupsHtml = tq.side === 'enfrentar'
    ? '<div><h3>Seus golpes contra ' + them + '</h3>' + rows(r.attack, atkLabel) + '</div><div><h3>Seu Pokémon contra os golpes ' + them + '</h3>' + rows(r.defense, takeLabel) + '</div>'
    : '<div><h3>Golpe ' + them + ' contra cada tipo</h3>' + rows(r.attack, atkLabel) + '</div><div><h3>Golpes contra o seu ' + them + '</h3>' + rows(r.defense, takeLabel) + '</div>';
  // o que muda nas outras tabelas (ex.: Gen 1, Fantasma não afeta Psíquico)
  const diffs = typecharts.charts.flatMap((c, i) => (i === ci ? [] : chartDiffs(table, c, types, tq.side).map((d) => d.atk + ' contra ' + d.def + ' é ' + MULT[d.to] + ' aqui e ' + MULT[d.from] + ' na ' + rangeLabel(c))));
  const diffHtml = diffs.length ? '<p class="meta" style="margin:0">⚠ Muda com a geração: ' + diffs.join('; ') + '.</p>' : '';
  const credit = '<p class="meta" style="margin:0">Tabela de tipos do próprio jogo (' + scope + '). Habilidade que anula um tipo (Levitate…) só conta na lista de Pokémon do jogo.</p>';
  box.innerHTML = '<div class="card">' + head + (note ? '<p class="meta" style="margin:0">' + note + '</p>' : '') + fromLine + '<div class="tq-best">' + best + '</div><div class="tq-groups">' + groupsHtml + '</div>' + diffHtml +
    '<div id="tqMons">' + (tq.game ? '<p class="meta">Carregando os Pokémon do jogo…</p>' : '<p class="meta" style="margin:0">Escolha um jogo para ver os Pokémon dele com esses tipos.</p>') + '</div>' + credit + '</div>';
  bindTypeSearch(); syncTypeHash();
  if (tq.game) renderTypeMons(types);
}
async function renderTypeMons(types) {
  const game = tq.game, d = await loadGameJson(game), out = $('tqMons');
  if (!out || game !== tq.game) return;
  if (!d) { out.innerHTML = '<p class="meta">Não deu para carregar os Pokémon do jogo.</p>'; return; }
  const g = catalog.games.find((x) => x.id === game);
  const list = monsFor(d, types, tq.side, { finalOnly: tq.finalOnly, legendary: tq.legendary });
  const shown = tq.all ? list : list.slice(0, 12);
  const only = (vs) => (vs.length < g.versions.length ? ' · só ' + vs.map((v) => g.versions.find((x) => x.id === v)?.label ?? v).join(', ') : '');
  const card = ({ p, atk, def, versions }) => '<a class="mon-card" href="#/jogo/' + game + '?capturar=' + p.name + '" title="Onde capturar ' + humanize(p.name) + ' no ' + g.label + '">' + pic(p.spriteId ?? p.id) +
    '<span><span class="nm">' + humanize(p.name) + '</span><br>' + p.types.map(typeBadge).join('') + '<br><span class="sub">acerta ' + MULT[atk] + ' · leva ' + MULT[def] + only(versions) + '</span></span></a>';
  const title = tq.side === 'enfrentar' ? 'Pokémon do ' + g.label + ' para usar contra ' + types.map(typeBadge).join('') : 'Alvos no ' + g.label + ' para o seu ' + types.map(typeBadge).join('');
  out.innerHTML = '<h3 style="margin:0 0 6px;font-size:var(--fs-sm)">' + title + ' <span class="meta">' + list.length + '</span></h3>' +
    '<div class="tq-bar" style="margin-bottom:6px"><label><input type="checkbox" id="tqFinal"' + (tq.finalOnly ? ' checked' : '') + '> só a evolução final</label><label><input type="checkbox" id="tqLeg"' + (tq.legendary ? ' checked' : '') + '> incluir lendários</label></div>' +
    (list.length ? '<div class="mon-grid">' + shown.map(card).join('') + '</div>' + (list.length > shown.length ? '<button type="button" class="btn" id="tqAll" style="margin-top:6px">ver todos (' + list.length + ')</button>' : '')
      : '<p class="meta">Nenhum Pokémon que dá para obter no jogo ' + (tq.side === 'enfrentar' ? 'acerta ×2 sem levar ×2' : 'é alvo assim') + ' com esses filtros.</p>') +
    '<p class="meta" style="margin:6px 0 0">' + (tq.side === 'enfrentar' ? 'Acerta = o melhor golpe do tipo do próprio Pokémon; leva = o pior golpe dos tipos do adversário.' : 'Acerta = o seu golpe contra ele; leva = o golpe do tipo dele contra você.') + ' Ordem: mais dano, menos risco, mais atributos. Clique para ver onde capturar.</p>';
  $('tqFinal').addEventListener('input', (e) => { tq.finalOnly = e.target.checked; renderTypeMons(types); });
  $('tqLeg').addEventListener('input', (e) => { tq.legendary = e.target.checked; renderTypeMons(types); });
  $('tqAll')?.addEventListener('click', () => { tq.all = true; renderTypeMons(types); });
}
function bindTypeSearch() {
  $('tqSide').addEventListener('click', (e) => { const b = e.target.closest('[data-side]'); if (b && b.dataset.side !== tq.side) { tq.side = b.dataset.side; tq.all = false; renderTypeSearch(); } });
  $('tqGen').addEventListener('input', (e) => { tq.gen = e.target.value ? Number(e.target.value) : null; if (tq.game && catalog.games.find((g) => g.id === tq.game)?.generation !== tq.gen) tq.game = null; tq.all = false; renderTypeSearch(); });
  $('tqGame').addEventListener('input', (e) => { tq.game = e.target.value || null; if (tq.game) tq.gen = catalog.games.find((g) => g.id === tq.game).generation; tq.all = false; renderTypeSearch(); });
  $('tqChips').addEventListener('click', (e) => {
    if (e.target.closest('[data-type-close]')) { setSearchMode('pokemon', false); return; }
    if (e.target.closest('[data-clear]')) { tq.types = []; tq.from = null; renderTypeSearch(); return; }
    const b = e.target.closest('[data-type]');
    if (!b) return;
    const t = b.dataset.type;
    tq.from = null; tq.all = false;
    tq.types = tq.types.includes(t) ? tq.types.filter((x) => x !== t) : [...tq.types, t].slice(-2);
    renderTypeSearch();
  });
}
/** #/?tipo=water,flying&lado=usar&ger=3&jogo=emerald (ou tipo=gyarados) → busca por tipo já respondida. */
function openTypeSearch(p) {
  const on = catalog.games.filter((g) => g.status === 'supported');
  tq.side = p.lado === 'usar' ? 'usar' : 'enfrentar';
  tq.game = on.some((g) => g.id === p.jogo) ? p.jogo : null;
  tq.gen = tq.game ? on.find((g) => g.id === tq.game).generation : Number(p.ger) || null;
  tq.all = false;
  if (searchMode !== 'tipo') setSearchMode('tipo', false);
  loadTypecharts().then((d) => {
    if (!d) return;
    const parts = String(p.tipo).toLowerCase().split(',').filter(Boolean);
    const all = d.charts.at(-1).types;
    if (parts.length && parts.every((t) => all.includes(t))) { tq.types = parts.slice(0, 2); tq.from = null; } else if (d.mons[parts[0]]) { tq.from = parts[0]; tq.types = []; }
    renderTypeSearch();
  });
}

// ---- 3 horas parado ou fechado → a tela inicial volta ao começo (decisão do usuário, 2026-11-10): sem "Continuar de onde
// parou" e sem a busca anterior. A hora do último uso fica no navegador (poketact:lastAt), gravada no máximo a cada 30 s.
// O contexto de cada jogo (versão, progresso, nível) continua guardado — só a tela inicial recomeça.
const IDLE_RESET_MS = 3 * 60 * 60 * 1000;
const LAST_AT = 'poketact:lastAt';
let lastAtMem = 0;
try { lastAtMem = Number(localStorage.getItem(LAST_AT)) || 0; } catch {}
function resetHome(atLoad) {
  try { localStorage.removeItem('poketact:last'); } catch {}
  if (atLoad) {
    // aba restaurada ou recarregada com a busca antiga no link (#/?capturar=…, #/?tipo=…) → tela inicial limpa; um link
    // aberto agora (compartilhado) continua valendo
    const nav = performance.getEntriesByType?.('navigation')?.[0]?.type;
    if ((nav === 'reload' || nav === 'back_forward') && parseRoute(location.hash).view === 'home' && location.hash.includes('?')) history.replaceState(null, '', '#/');
    return;
  }
  clearHomeSearch();
  if (parseRoute(location.hash).view === 'home') { if (location.hash.includes('?')) location.hash = '#/'; else route(); }
}
function touch() {
  const now = Date.now();
  if (now - lastAtMem > IDLE_RESET_MS) resetHome(false);
  if (now - lastAtMem > 30000) { lastAtMem = now; try { localStorage.setItem(LAST_AT, String(now)); } catch {} }
}
{
  // ao abrir: sem hora guardada (versão anterior do app) ou mais de 3 h → recomeça
  if (Date.now() - lastAtMem > IDLE_RESET_MS) resetHome(true);
  lastAtMem = Date.now();
  try { localStorage.setItem(LAST_AT, String(lastAtMem)); } catch {}
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, touch, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') touch(); });
  window.addEventListener('focus', touch);
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
    // #/?novidades → abre o painel de novidades (link para compartilhar)
    if (r.params.novidades != null) openNews(true);
    // 1ª visita à tela inicial (sem link com busca): "Como funciona" abre sozinho até tocar em "Entendi" (0.78.0)
    else if (!Object.keys(r.params).length && !howSeen()) openHow();
    // #/?capturar=pikachu → busca de Pokémon já respondida (em que jogos dá para obter)
    if (r.params.capturar) loadPokeGames().then(() => { if (!pokedex) return; $('homeSearch').value = humanize(r.params.capturar); renderHomeDex(r.params.capturar); });
    // #/?tipo=water,flying&lado=usar&jogo=emerald → busca por tipo já respondida (0.71.0)
    if (r.params.tipo) openTypeSearch(r.params);
    // ao escolher uma geração, leva até os jogos dela
    if (filters.generation) $('genGames')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  // a mesma partida ainda carregando (2ª mudança de link no meio): espera o carregamento em vez de usar dados pela metade
  if (currentGame !== game.id) { loadP = load(game.id); if (await loadP === false) return; window.scrollTo(0, 0); }
  else if (loadP && (await loadP) === false) return;
  if (currentGame !== game.id) return; // outro jogo foi aberto enquanto este carregava
  applyGameParams(r.params);
}

// Estado opcional vindo da URL: ?versao=…&treinador=…&i=…  ou  ?pokemon=…&nivel=…&meu=…
function applyGameParams(p) {
  if (p.versao && [...$('version').options].some((o) => o.value === p.versao)) $('version').value = p.versao;
  if (p.meu) $('level').value = p.meu;
  if (p.inicial && [...$('starter').options].some((o) => o.value === p.inicial)) { $('starter').value = p.inicial; fillTrainers(); renderStarters(); }
  if (p.aba === 'detonado') showTab('walk');
  // o Pokémon do link vale mais que o selecionado antes (selectMon antes de abrir a aba)
  const linkMon = (q) => findOpponent(data.pokemon, q)?.name;
  if (p.aba === 'golpes' && p.pokemon) { selectMon(linkMon(p.pokemon), 'moves'); $('movesQ').value = humanize(p.pokemon); learnFor = null; learnMove = p.aprender ?? null; }
  if (p.aba === 'golpes' && p.time != null && loadTeam()[Number(p.time)]) openTeamMoves(Number(p.time)); // membro do time (tela inicial)
  else if (p.aba === 'golpes') showTab('moves');
  if (p.aba === 'time') showTab('team');
  if (p.aba === 'tipos') { if (p.tipo && data.types.includes(p.tipo)) typeSel = [p.tipo]; showTab('types'); }
  // ?capturar=pikachu → aba Onde capturar já preenchida
  if (p.capturar) { selectMon(linkMon(p.capturar), 'dex'); $('dexQ').value = p.capturar; showTab('dex'); }
  if (p.insignias != null && [...$('stage').options].some((o) => o.value === p.insignias)) $('stage').value = p.insignias;
  if (p.insignias != null && !$('moves').hidden) renderMoves(); // a aba Golpes conta as TMs pelo progresso do link
  const t = p.treinador && trainers.find((x) => x.key === p.treinador);
  // link da luta (atalhos da tela inicial, busca "ir para a luta"): nível e progresso da luta, como no seletor — salvo se o
  // link já diz o nível (?meu=) ou o progresso (?insignias=)
  if (t) {
    const keep = { level: $('level').value, stage: $('stage').value };
    $('trainer').value = t.key; setLevelFor(t);
    if (p.meu) $('level').value = keep.level;
    if (p.insignias != null) $('stage').value = keep.stage;
    if (t.pool && p.i == null) { known = null; teamMode = t; renderTeam(t, -1); update(); } // Subway: contra todos os conjuntos
    else pickTrainerMon(t, Math.min(Number(p.i) || 0, t.party.length - 1));
    renderTrainerPicker(); return;
  }
  if (p.pokemon) { known = null; $('opp').value = p.pokemon; $('oppLevel').value = p.nivel ?? ''; oppLocked = true; }
  update();
}
// ---- "Como funciona" (0.78.0): aviso com os 3 passos e os números; "Entendi" marca como lido neste navegador. Reabre pelo
// link "Como funciona?" da tela inicial. Fechar no ✕ ou no Esc não marca: aparece de novo na próxima visita.
const HOW_KEY = 'poketact:como-funciona';
function howSeen() { try { return localStorage.getItem(HOW_KEY) === '1'; } catch { return false; } }
function openHow() { const d = $('howDialog'); if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } }
function closeHow(read) {
  if (read) { try { localStorage.setItem(HOW_KEY, '1'); } catch {} }
  const d = $('howDialog'); if (d.close) d.close(); else d.removeAttribute('open');
}
$('howOk').addEventListener('click', () => closeHow(true));
$('howClose').addEventListener('click', () => closeHow(false));
$('openHow').addEventListener('click', openHow);
$('howDialog').addEventListener('click', (e) => { if (e.target === $('howDialog')) closeHow(false); }); // toque fora do quadro

window.addEventListener('hashchange', route);
route();

$('starter').addEventListener('input', () => { const t = $('trainer').value; fillTrainers(); $('trainer').value = [...$('trainer').options].some((o) => o.value === t) ? t : ''; renderStarters(); update(); });

$('version').addEventListener('input', renderStarters); // sprites da pasta da versão
// ⓘ do cabeçalho abre/fecha "Sobre os dados" (0.83.0)
$('aboutBtn').addEventListener('click', () => { const a = $('about'); a.open = !a.open; });
$('about').addEventListener('toggle', () => $('aboutBtn').setAttribute('aria-expanded', String($('about').open)));
$('tabRec').addEventListener('click', () => showTab('rec'));
$('tabWalk').addEventListener('click', () => showTab('walk'));
$('tabDex').addEventListener('click', () => showTab('dex'));
$('tabTypes').addEventListener('click', () => showTab('types'));
$('tabMoves').addEventListener('click', () => showTab('moves'));
$('tabTeam').addEventListener('click', () => showTab('team'));
$('movesQ').addEventListener('input', renderMoves);
for (const id of ['version', 'stage', 'dlc']) $(id).addEventListener('input', () => { if (!$('moves').hidden) renderMoves(); });
for (const id of ['typesQ', 'typesObt', 'typesFinal']) $(id).addEventListener('input', () => renderTypes());
$('version').addEventListener('input', () => { if (!$('types').hidden) renderTypes(); });
$('dexQ').addEventListener('input', () => { dexFromCounter = null; renderDex(); });
$('version').addEventListener('input', () => { if (!$('dex').hidden) renderDex(); });
$('stage').addEventListener('input', () => { if (!$('dex').hidden) renderDex(); });
for (const id of ['version', 'stage', 'starter']) $(id).addEventListener('input', () => { if (!$('walk').hidden) renderWalk(); });

// ---------------------------------------------------------------- novidades (CHANGELOG): sino no canto
// link direto: #/?novidades (abre o painel ao carregar)
let openNews = () => {};
// data/changelog.json (gerado do CHANGELOG.md). "Visto" = a versão mais nova que o visitante já abriu, guardada no navegador
// (sem ela, só a última versão conta como novidade). Abrir o painel marca tudo como visto.
{
  const SEEN = 'poketact:news-seen';
  let versions = [];
  const seen = () => { try { return localStorage.getItem(SEEN); } catch { return null; } };
  const unseen = () => { const i = versions.findIndex((v) => v.version === seen()); return i < 0 ? versions.slice(0, 1) : versions.slice(0, i); };
  const paintCount = () => { const n = unseen().length; $('newsCount').hidden = !n; $('newsCount').textContent = n; $('newsBtn').title = n ? `${n} novidade${n > 1 ? 's' : ''} no app` : 'Novidades do app'; };
  const fmtDate = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d ?? '');
  const render = () => {
    const fresh = new Set(unseen().map((v) => v.version));
    const ver = (v, i) => `<details class="news-ver"${i === 0 || fresh.has(v.version) ? ' open' : ''}><summary>Versão ${v.version} <span class="meta">${fmtDate(v.date)}</span>${fresh.has(v.version) ? ' ' + lozenge('info', 'novo') : ''}</summary>` +
      // resumo em linguagem simples primeiro; a lista técnica fica recolhida em "Detalhes"
      (v.summary ? `<p class="news-sum">${v.summary}</p><details class="news-more"><summary class="meta">Detalhes</summary>` : '') +
      v.sections.map((s) => `<h3>${s.title}</h3><ul>${s.items.map((x) => `<li>${x}</li>`).join('')}</ul>`).join('') + (v.summary ? '</details>' : '') + '</details>';
    // 0.78.0: as 5 mais novas (ou todas as não vistas); as outras ~75 ficam em "Versões anteriores"
    const n = Math.max(5, fresh.size);
    $('newsList').innerHTML = versions.slice(0, n).map(ver).join('') +
      (versions.length > n ? `<details class="news-older"><summary>Versões anteriores (${versions.length - n})</summary>${versions.slice(n).map((v, i) => ver(v, i + n)).join('')}</details>` : '');
  };
  const open = (show) => {
    $('newsPanel').hidden = !show;
    $('newsBtn').setAttribute('aria-expanded', String(show));
    if (!show) return;
    render();
    try { if (versions[0]) localStorage.setItem(SEEN, versions[0].version); } catch {}
    paintCount();
    $('newsClose').focus();
  };
  // a rota pede para abrir (#/?novidades) antes de o changelog.json chegar → fica pendente
  let pending = false;
  openNews = (show) => (versions.length ? open(show) : (pending = show));
  fetch('data/changelog.json').then((r) => r.json()).then((d) => { versions = d; paintCount(); if (pending) open(true); }).catch(() => { $('newsBtn').hidden = true; });
  $('newsBtn').addEventListener('click', () => open($('newsPanel').hidden));
  $('newsClose').addEventListener('click', () => { open(false); $('newsBtn').focus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('newsPanel').hidden) { open(false); $('newsBtn').focus(); } });
  document.addEventListener('mousedown', (e) => { if (!$('newsPanel').hidden && !e.target.closest('#newsPanel, #newsBtn')) open(false); });
}
