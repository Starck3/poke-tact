// Estágio de progresso (0–8 insígnias; 9 = pós-jogo) a partir do detonado, ligado aos mapas do decomp.
// Funções puras (sem rede/disco) para poder testar.
import { parseDetonadoSections, parseTrainerBlocks } from './pokemythology.mjs';

export const POSTGAME = 9;
const GENERIC_BASE = new Set(['route', 'city', 'town', 'island', 'house', 'room', 'gym', 'center', 'pokemon', 'mart', 'floor', 'entrance', 'exit', 'inside', 'outside', 'north', 'south', 'east', 'west', 'the', 'of']);

/** Palavras normalizadas (sem acento; "rota" = "route"; "mt." = "mt"). */
export function words(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, '').toLowerCase() /* "Diglett’s" = Digletts */.replace(/([a-z])(\d)/g, '$1 $2').replace(/\brota\b/g, 'route') /* separa "rota119" antes */.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}
const has = (hay, needle) => (' ' + hay.join(' ') + ' ').includes(' ' + needle.join(' ') + ' ');

/**
 * Linha do tempo: seções com o estágio = insígnias obtidas ANTES da seção (o bloco do líder fica dentro da seção
 * em que ele é enfrentado); pós-jogo = depois do último membro da Elite dos Quatro na 1ª passagem.
 */
/** Assinatura de time tolerante a erro de grafia do detonado: 5 primeiras letras da espécie + nível. */
export function teamSig(party) {
  return party.map((p) => words(p.species).join('').slice(0, 5) + '@' + p.level).sort().join(',');
}

/**
 * leaders/elite: [{ name, teams: [party, ...] }] — o líder é reconhecido pelo TIME do ginásio (não pelo nome:
 * o 1º bloco "Giovanni" do FRLG é o chefe da Rocket em Celadon, não o líder de Viridian).
 */
export function buildTimeline(html, leaders, elite, { blocks: given, sectionRe } = {}) {
  const sections = parseDetonadoSections(html, sectionRe).map((s, i, all) => ({ title: s.title, at: html.indexOf(s.html), words: words(s.title), text: words(s.html.replace(/<[^>]+>/g, ' ')) }));
  // blocks: Gen 1 passa parseTrainerRuns (times em texto corrido); padrão = blocos com sprite de treinador (Gen 3)
  const blocks = given ?? parseTrainerBlocks(html);
  // espécies sem nível: o detonado às vezes erra o nível (RS: Wattson, Tate & Liza) — aceito se o NOME também está no bloco
  const speciesSig = (party) => party.map((p) => words(p.species).join('').slice(0, 5)).sort().join(',');
  const firstAt = (people) => {
    const seen = new Map();
    for (const b of blocks) {
      const sig = teamSig(b.party);
      const spSig = speciesSig(b.party);
      const text = words(`${b.title} ${b.context ?? ''}`.replace(/ e /gi, ' '));
      for (const p of people) {
        if (seen.has(p.name)) continue;
        const named = has(text, words(p.name.replace(/&/g, ' ')));
        // B2W2: o detonado lista o time normal e o do Challenge Mode no mesmo bloco → com o NOME no bloco, basta o time
        // inteiro do jogo estar contido nele (multiconjunto de espécie + nível)
        const contains = (t) => { const pool = sig.split(','); return teamSig(t).split(',').every((x) => { const i = pool.indexOf(x); return i >= 0 && pool.splice(i, 1); }); };
        if (p.teams.some((t) => teamSig(t) === sig) || (named && p.teams.some((t) => speciesSig(t) === spSig || contains(t)))) seen.set(p.name, b.at);
      }
    }
    return seen;
  };
  const leaderSeen = firstAt(leaders);
  const leaderAt = [...leaderSeen.values()].sort((a, b) => a - b);
  const leaderOrder = [...leaderSeen].sort((a, b) => a[1] - b[1]).map(([n]) => n);
  const eliteAt = [...firstAt(elite).values()];
  const postAt = eliteAt.length === elite.length ? Math.max(...eliteAt) : Infinity;
  // <= : o trecho que COMEÇA no bloco do líder já é depois da luta (com < a Route 3 ficava antes do Brock)
  const stageAt = (pos) => (pos > postAt ? POSTGAME : Math.min(8, leaderAt.filter((x) => x <= pos).length));
  for (const s of sections) s.stage = stageAt(s.at);
  // Trechos: as seções são cortadas também nos blocos de líder — citação feita DEPOIS da luta já conta a insígnia
  // (ex.: "Rota 3" no texto de Pewter aparece depois do Brock → estágio 1, não 0).
  const cuts = [...new Set([...sections.map((s) => s.at), ...leaderAt])].sort((a, b) => a - b);
  const chunks = cuts.map((at, i) => {
    const sec = [...sections].reverse().find((s) => s.at <= at);
    return { title: sec?.title ?? '', stage: stageAt(at), text: words(html.slice(at, cuts[i + 1] ?? html.length).replace(/<[^>]+>/g, ' ')) };
  });
  return { sections, chunks, leaderOrder, leadersFound: leaderAt.length, eliteFound: eliteAt.length, blocks: blocks.map((b) => ({ ...b, stage: stageAt(b.at) })) };
}

/**
 * Estágio de uma luta pelo TIME no detonado: o 1º bloco cujo time bate em ≥ max(2, 60%) dos Pokémon (5 letras + nível;
 * time de 1 Pokémon = 1). Uma mesma rota pode ter lutas de momentos diferentes (Red/Blue: o 2º rival da Route 22,
 * nv 53, é antes da Liga; o mapa é do estágio 0). null se o time não aparece.
 */
export function teamStage(timeline, party) {
  const key = (p) => words(p.species).join('').slice(0, 5) + '@' + p.level;
  const want = party.map(key);
  const need = want.length === 1 ? 1 : Math.max(2, Math.ceil(want.length * 0.6));
  for (const b of timeline.blocks ?? []) {
    const got = new Set(b.party.map(key));
    if (want.filter((k) => got.has(k)).length >= need) return b.stage;
  }
  return null;
}

/**
 * Mapas sem estágio herdam dos vizinhos conhecidos, em várias passadas:
 *   • conexões (rota ↔ rota/cidade): MAIOR estágio — o caminho exige ter chegado aos dois lados;
 *   • portas (interior ← exterior): MENOR estágio — entra-se pelo lado de fora. (Usar o maior pelas portas puxava a
 *     Route 110 do Emerald para o pós-jogo por causa da Trick House.)
 */
export function propagateStages(known, connections, warps = new Map(), passes = 8) {
  const out = new Map(known);
  const ids = new Set([...connections.keys(), ...warps.keys()]);
  for (let p = 0; p < passes; p++) {
    let changed = false;
    for (const id of ids) {
      if (out.has(id)) continue;
      const viaConn = [...(connections.get(id) ?? [])].map((l) => out.get(l)).filter((x) => x !== undefined);
      const viaWarp = [...(warps.get(id) ?? [])].map((l) => out.get(l)).filter((x) => x !== undefined);
      if (viaConn.length) out.set(id, Math.max(...viaConn));
      else if (viaWarp.length) out.set(id, Math.min(...viaWarp));
      else continue;
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}

/**
 * Citação anterior no detonado (r.earlierMention): o título da seção põe o lugar num estágio, mas o texto o cita antes —
 * típico de áreas opcionais descritas no pós-jogo (Safari Zone de Hoenn citada em Fortree; Power Plant do FRLG citada em
 * "Agora você tem Surf!"). Vale a citação anterior SÓ quando um vizinho (conexão ou porta) já está liberado nesse estágio —
 * sem isso a Silver Cave (Crystal) e a Viridian City (Gold/Silver), citadas cedo mas fechadas, iriam para antes.
 * Repete até estabilizar: a entrada da Safari libera a área sul, que libera as outras. Altera `st`; devolve os mapas mudados.
 */
// Opções: fromStage — só lugares que o título pôs a partir desse estágio (padrão: o pós-jogo; o Magma Hideout do Emerald,
// estágio 6, tem a entrada citada cedo mas trancada); access(n) — estágio a partir do qual o vizinho n dá acesso (rota só de
// água: o do Surf — senão a Route 108, só mar, liberava o Abandoned Ship no estágio 3 do Ruby/Sapphire).
export function applyEarlierMentions(st, detail, conn, warp, { skip = () => false, passes = 8, fromStage = POSTGAME, access = () => 0 } = {}) {
  const used = [];
  for (let p = 0; p < passes; p++) {
    let changed = false;
    for (const [id, r] of Object.entries(detail)) {
      const e = r?.earlierMention?.stage;
      if (e == null || skip(id) || (r.stage ?? 0) < fromStage) continue;
      const cur = st.get(id);
      if (cur == null || cur <= e) continue;
      const near = [...(conn.get(id) ?? []), ...(warp.get(id) ?? [])];
      if (!near.some((n) => st.has(n) && Math.max(st.get(n), access(n)) <= e)) continue;
      st.set(id, e);
      used.push({ id, from: cur, to: e, section: r.earlierMention.section });
      changed = true;
    }
    if (!changed) break;
  }
  return used;
}

/**
 * Estágio de um nome de lugar ("Route 24", "Mt Moon 1F", "Cerulean Cave B1F"): 1º a seção cujo TÍTULO nomeia o lugar;
 * senão, a 1ª seção cujo texto o cita. Tenta o nome completo e depois versões encurtadas (sem andar/sala).
 */
// opts.generic: palavras genéricas extras do jogo (Gen 2: "tower", "cave"… — "Sprout Tower" casava com outra torre)
// opts.earliestText (Gen 4, só exteriores): sem título, vale a citação MAIS CEDO entre os trechos significativos do nome
// — o detonado escreve "Cidade de Celestic"/"Jubilife" no começo e "Celestic Town"/"Jubilife City" só bem depois
export function placeStage(timeline, label, { generic: extra, earliestText = false } = {}) {
  const GENERIC = extra ? new Set([...GENERIC_BASE, ...extra]) : GENERIC_BASE;
  const full = words(label);
  // trechos contínuos do nome, do maior para o menor ("Route 119 Weather Institute 2F" → … → "weather institute")
  const windows = [];
  for (let n = full.length; n >= 1; n--) for (let i = 0; i + n <= full.length; i++) windows.push(full.slice(i, i + n));
  if (earliestText) {
    const ok = (name) => (name.some((w) => /\d/.test(w)) ? name.length >= 2 : name.some((w) => !GENERIC.has(w) && w.length >= 5));
    const titled = windows.filter(ok).map((name) => ({ name, s: timeline.sections.find((x) => has(x.words, name)) })).find((x) => x.s);
    if (titled) return { stage: titled.s.stage, section: titled.s.title, by: 'título', name: titled.name.join(' ') };
    const chunks = timeline.chunks ?? timeline.sections;
    let best = null;
    for (const name of windows.filter(ok)) { const i = chunks.findIndex((s) => has(s.text, name)); if (i >= 0 && (!best || i < best.i)) best = { i, name }; }
    if (best) return { stage: chunks[best.i].stage, section: chunks[best.i].title, by: 'texto', name: best.name.join(' ') };
    return null;
  }
  for (const name of windows) {
    const n = name.length;
    const meaningful = name.some((w) => /\d/.test(w)) ? name.length >= 2 : name.filter((w) => !GENERIC.has(w)).length >= (n === 1 ? 1 : 1) && !(n === 1 && (GENERIC.has(name[0]) || name[0].length < 5));
    if (!meaningful) continue;
    const byTitle = timeline.sections.find((s) => has(s.words, name));
    const byText = (timeline.chunks ?? timeline.sections).find((s) => has(s.text, name));
    // título vence (conservador); se o texto cita antes, registra para revisão (áreas opcionais descritas após a Liga)
    if (byTitle) return { stage: byTitle.stage, section: byTitle.title, by: 'título', name: name.join(' '), ...(byText && byText.stage < byTitle.stage && { earlierMention: { stage: byText.stage, section: byText.title } }) };
    if (byText) return { stage: byText.stage, section: byText.title, by: 'texto', name: name.join(' ') };
  }
  return null;
}
