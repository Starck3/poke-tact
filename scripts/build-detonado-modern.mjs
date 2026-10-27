// Jogos sem decomp com detonado do PokeMythology (BW, XY, ORAS, SM, Let's Go, SwSh, BDSP, Legends: Arceus, SV): o que dá
// para tirar do detonado + dados do jogo (PKHeX), sem fonte nova:
//   1) <jogo>-trainers.json — lutas "<nome> usa:" (scripts/lib/pokemythology-modern.mjs): espécie e nível do detonado;
//      golpes = moveset padrão do jogo no nível (defaultMoves) — o detonado não lista golpes. Fonte marcada 'detonado'.
//   2) progresso — estágio = líderes vencidos antes do trecho (1ª aparição de cada líder no detonado; SM: grandes
//      provações); pós-jogo depois do campeão. Cada local do "onde obter" (nome do PKHeX, em inglês) recebe o estágio da
//      seção do detonado que o nomeia (placeStage, o mesmo da Gen 1–5).
//   3) <jogo>-walkthrough.json — aba Detonado: por estágio, os locais na ordem do detonado com selvagens, presentes/trocas e
//      os treinadores da seção.
// 🧪 Espécie pelo NOME escrito (o nº da imagem do serebii não é o da Pokédex nacional no SV); erro de grafia → nome mais
// próximo do jogo (distância ≤ 2); formas regionais pelo texto ("Hisuian Braviary") ou sufixo da imagem (-h/-a/-g/-p).
// Uso: node scripts/build-detonado-modern.mjs <jogo>   (depois do build-acquisition-pkhex)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { parseModernSections, parseModernBattles, parseBadgeEvents } from './lib/pokemythology-modern.mjs';
import { words, placeStage, POSTGAME } from './lib/progress.mjs';
import { likelyMoveset } from '../public/engine.mjs';

const gameId = process.argv[2];
const game = GAMES[gameId];
const wtFile = new URL(`../data-sources/pokemythology/${game?.walkthrough}.html`, import.meta.url);
if (!game?.walkthrough || !existsSync(wtFile)) { console.log(`[${gameId}] sem detonado local — nada a fazer`); process.exit(0); }
const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const data = load(`${gameId}.json`);
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
const html = readFileSync(wtFile, 'utf8');
const sections = parseModernSections(html);
const battles = parseModernBattles(html);
const badges = parseBadgeEvents(html, battles);

// ---- espécie do detonado → entrada do dataset
const key = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/♀/g, 'f').replace(/♂/g, 'm').replace(/[^a-z0-9]/g, '');
const baseByKey = new Map(data.pokemon.filter((p) => !p.regionalForm).map((p) => [key(p.name.replace(/-(incarnate|altered|male|female|red-striped|ordinary|aria|land|plant|normal|average|50|midday|solo|amped|full-belly|single-strike|baile|shield|disguised|ice|zero|family-of-four|green-plumage|two-segment|curly|chest|standard|overcast|west|east)$/, '')), p]));
const regionalOf = (sid, region) => data.pokemon.find((p) => p.regionalForm && p.speciesId === sid && p.name.includes(`-${region}`));
const REGION = { hisuian: 'hisui', alolan: 'alola', galarian: 'galar', paldean: 'paldea', hisui: 'hisui', alola: 'alola', galar: 'galar', paldea: 'paldea' };
const SUFFIX = { h: 'hisui', a: 'alola', g: 'galar', p: 'paldea' };
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const unresolved = [], fuzzy = [];
function resolve(p) {
  let text = String(p.species ?? '').replace(/\(.*?\)|\[.*?\]/g, ' ').trim();
  let region = null;
  const m = text.match(/\b(hisuian|alolan|galarian|paldean)\b|\bde (hisui|alola|galar|paldea)\b/i);
  if (m) { region = REGION[(m[1] ?? m[2]).toLowerCase()]; text = text.replace(m[0], ' ').trim(); }
  if (!region && typeof p.form === 'string' && SUFFIX[p.form]) region = SUFFIX[p.form];
  if (!region && p.tags) region = REGION[p.tags.find((t) => REGION[t])] ?? null;
  const k = key(text.split(/\s+@|\s+–/)[0]);
  // nº da imagem do serebii = Pokédex nacional (menos no SV, onde o leitor devolve dex null): vence a grafia do texto
  // (SM: Gladion "Golbat" com a imagem do Crobat)
  const byDex = p.dex && !p.dexByName ? data.pokemon.find((x) => x.id === p.dex) : null;
  let base = byDex ?? baseByKey.get(k);
  if (!base && k.length >= 4) {
    const best = [...baseByKey].map(([n, x]) => [lev(k, n), x]).sort((a, b) => a[0] - b[0])[0];
    if (best && best[0] <= 2) { base = best[1]; fuzzy.push(`${p.species} → ${base.name}`); }
  }
  if (!base) { unresolved.push(p.species); return null; }
  return (region && regionalOf(base.id, region)) || base;
}

// ---- progresso: líderes na ordem da 1ª aparição; campeão fecha o jogo
// líder = nome ligado a insígnia/carimbo de ilha no texto (≥ 4 nomes; SM: kahunas, sem o Guzma) ou, sem isso, a luta
// classificada como líder. Líderes com a 1ª luta na mesma seção = alternativas de versão (Gordie/Melony) → um estágio só.
const hinted = [...new Set(badges.filter((e) => ['gym', 'insignia', 'stamp'].includes(e.kind) && e.leaderHint).map((e) => e.leaderHint))];
const isLeader = hinted.length >= 4 ? (b) => hinted.includes(b.name) : (b) => b.kind === 'leader';
const firstAt = new Map();
for (const b of battles) if (isLeader(b) && !firstAt.has(b.name)) firstAt.set(b.name, b);
// a luta que vale é a última do nome ANTES da 1ª insígnia ligada a ele (Giovanni: ginásio de Viridian, não o esconderijo)
for (const [n] of firstAt) {
  const ev = badges.find((e) => e.leaderHint === n);
  const b = ev && [...battles].reverse().find((x) => x.name === n && x.at < ev.at);
  if (b) firstAt.set(n, b);
}
const byAt = [...firstAt].sort((a, b) => a[1].at - b[1].at);
firstAt.clear();
for (const [n, b] of byAt) firstAt.set(n, b);
const merged = [];
for (const [n, b] of firstAt) {
  // alternativa de versão: mesma seção, mesmo nível (±1) e lutas coladas (Gordie/Melony); Piers → Raihan (nv 46 → 48) não
  const lv = Math.max(0, ...b.party.map((p) => p.level ?? 0));
  const same = merged.find((m) => m.section && m.section === b.section && Math.abs(m.lv - lv) <= 1 && b.at - m.last < 4000);
  if (same) { same.names.push(n); same.last = b.at; } else merged.push({ names: [n], at: b.at, last: b.at, lv, section: b.section });
}
let leaderOrder = merged.slice(0, 8).map((m) => m.names.join('/'));
let leaderAt = merged.slice(0, 8).map((m) => m.at);
const promoBattles = new Set(); // Z-A: as lutas de promoção viram a categoria "Partidas de promoção"
let stageNames = null; // rótulo de cada estágio quando o marco não é insígnia (Z-A: rank; Legends: Arceus: nobres)
// Jogos sem ginásio: marcos próprios tirados dos títulos de seção do detonado
//   Z-A: "PARTIDA DE PROMOÇÃO – RANK Z → RANK Y" (a luta de promoção é a 1ª "usa:" da seção)
//   Legends: Arceus: "… – ACALMANDO O NOBLE KLEAVOR" (vale o fim da seção: o nobre é acalmado nela)
const promos = sections.filter((s) => /PARTIDA DE PROMO/i.test(s.full) && /RANK\s+([A-Z])\s*(?:→|->|&#8594;)\s*RANK\s+([A-Z])/i.test(s.full));
const nobles = sections.filter((s) => /ACALMANDO (?:O|A) NOBLE\s+(\S+)/i.test(s.full) && !/REVANCHE/i.test(s.full));
if (promos.length >= 3) {
  const ms = promos.map((s) => {
    const [, from, to] = s.full.match(/RANK\s+([A-Z])\s*(?:→|->|&#8594;)\s*RANK\s+([A-Z])/i);
    const b = battles.find((x) => x.at > s.at);
    if (b) promoBattles.add(b);
    return { from: from.toUpperCase(), to: to.toUpperCase(), name: b?.name ?? `Rank ${to}`, at: b?.endAt ?? b?.at ?? s.at };
  });
  leaderOrder = ms.map((m) => m.name);
  leaderAt = ms.map((m) => m.at);
  stageNames = [`Rank ${ms[0].from} (início)`, ...ms.map((m) => `Rank ${m.to} (depois de vencer ${m.name})`)];
} else if (nobles.length >= 3) {
  const ms = nobles.map((s) => {
    const name = s.full.match(/ACALMANDO (?:O|A) NOBLE\s+(\S+)/i)[1];
    const next = sections.find((x) => x.at > s.at);
    return { name: name[0] + name.slice(1).toLowerCase(), at: (next?.at ?? s.at) - 1 };
  });
  leaderOrder = ms.map((m) => m.name);
  leaderAt = ms.map((m) => m.at);
  stageNames = ['antes do 1º nobre', ...ms.map((m, i) => `${i + 1} nobre${i ? 's' : ''} acalmado${i ? 's' : ''} (depois de ${m.name})`)];
}
// Sun/Moon: provações dos capitães + grandes provações (carimbos de ilha). Provação = Z-Crystal recebido até 2500
// caracteres depois de um "totem" no texto (Normalium, Waterium, Firium, Grassium, Electrium, Ghostium, Dragonium); os
// de presente (Steelium junto com o Electrium, Buginium, Poisonium, Eevium) não contam ou se juntam ao marco do mesmo
// momento (≤ 1500 caracteres). A provação da Mina (Fairium) não tem totem e fica de fora.
const stamps = badges.filter((e) => e.kind === 'stamp');
if (!stageNames && stamps.length >= 3) {
  const totem = (e) => /totem/i.test(html.slice(Math.max(0, e.at - 2500), e.at).replace(/<[^>]+>/g, ' '));
  const evs = [...stamps.map((e) => ({ at: e.at, label: `grande provação de ${e.badge.replace(/ Island$/, '')}${e.leaderHint ? ` (${e.leaderHint})` : ''}` })),
    ...badges.filter((e) => e.kind === 'trial' && totem(e)).map((e) => ({ at: e.at, label: `provação do ${e.badge}${(e.text.match(/\bde ([A-Z]\w+)/) ?? [])[1] ? ` (${e.text.match(/\bde ([A-Z]\w+)/)[1]})` : ''}` }))]
    .sort((a, b) => a.at - b.at);
  const ms = [];
  for (const e of evs) { const last = ms.at(-1); if (!last || e.at - last.at > 1500) ms.push({ ...e }); } // mesmo momento: vale o 1º (Electrium, não o Steelium)
  leaderOrder = ms.map((m) => m.label);
  leaderAt = ms.map((m) => m.at);
  stageNames = ['antes da 1ª provação', ...ms.map((m, i) => `${i + 1} provaç${i ? 'ões' : 'ão'} (depois da ${m.label})`)];
}
// pós-jogo = estágio depois do último marco (insígnias: 9, como nas Gens 1–5; Z-A: 11)
const POST = stageNames ? stageNames.length : POSTGAME;
const topLevel = (b) => Math.max(0, ...b.party.map((p) => p.level ?? 0));
// fim da história: a 1ª menção ao Hall da Fama / créditos depois do último líder (o campeão varia: Leon no SwSh é "rival",
// N/Ghetsis no BW); o campeão é a última luta antes disso
const endRe = /hall (?:of fame|da fama)|cr[ée]ditos/gi;
endRe.lastIndex = leaderAt.at(-1) ?? 0;
const endAt = endRe.exec(html)?.index ?? Infinity;
const champ = [...battles].reverse().find((b) => b.at < endAt && b.at > (leaderAt.at(-1) ?? 0));
const postAt = leaderOrder.length >= 3 ? endAt : Infinity;
const hasProgress = leaderOrder.length >= 3;
const stageAt = (pos) => (pos > postAt ? POST : leaderAt.filter((x) => x <= pos).length);

// linha do tempo no formato do progress.mjs (seções + trechos cortados nos líderes)
const strip = (h) => h.replace(/<[^>]+>/g, ' ');
const tl = {
  sections: sections.map((s) => ({ title: s.title, at: s.at, words: words(s.title), text: words(strip(s.html)), stage: stageAt(s.at) })),
};
const cuts = [...new Set([...sections.map((s) => s.at), ...leaderAt])].sort((a, b) => a - b);
tl.chunks = cuts.map((at, i) => { const sec = [...sections].reverse().find((s) => s.at <= at); return { title: sec?.title ?? '', at, stage: stageAt(at), text: words(strip(html.slice(at, cuts[i + 1] ?? html.length))) }; });
const secIndex = new Map(tl.sections.map((s, i) => [s.title, i]));

// ---- treinadores
const GROUP = { leader: 'Líderes de ginásio', elite: 'Elite dos Quatro', champion: 'Campeão', rival: 'Rival', boss: 'Chefes', other: 'Outros treinadores' };
const titleCase = (s) => String(s ?? '').toLowerCase().replace(/(^|[\s(/-])(\S)/g, (m, a, c) => a + c.toUpperCase());
const starters = data.starters?.species ?? [];
const trainers = [];
let skippedPlaceholders = 0;
// ---- Pokémon "inicial" genérico no time ("[chespin][fennekin][froakie] inicial lv.5", "inicial com vantagem ao seu"):
// a regra vem do TEXTO — no próprio nome ("inicial de vantagem ao seu") ou numa frase anterior com o nome do treinador
// ("Hop irá pegar o inicial de fraqueza ao seu", "Calem/Serena ficará com inicial com vantagem ao seu"). Com a regra e o
// triângulo de tipos (Fogo > Planta, Água > Fogo, Planta > Água) sai um time por inicial do jogador (forStarter); sem a
// regra, uma variante por inicial possível do treinador, rotulada — sem inventar a regra.
const plainText = html.replace(/<[^>]+>/g, ' ').replace(/&#8211;/g, '–').replace(/\s+/g, ' ');
const textAt = (at) => html.slice(0, at).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').length; // posição no texto puro
// regra = em relação ao SEU inicial ("de vantagem ao seu", "com fraqueza ao seu", "que tem desvantagem ao seu"); "golpe de
// vantagem ao inicial de Hop" fala da SUA vantagem e não conta
const RULE = (s) => { const m = String(s).match(/(desvantagem|fraqueza|vantagem)\s+(?:ao|contra o|sobre o)\s+seu\b/i); return m ? (/vantagem$/i.test(m[1]) && !/^des/i.test(m[1]) ? 'strong' : 'weak') : null; };
function ruleFor(b, ph) {
  const own = RULE(ph.species ?? '');
  if (own) return { rule: own, by: `"${ph.species}"` };
  const names = String(b.name).split(/\s*\/\s*|\s+e\s+/).map((n) => n.trim()).filter((n) => n.length >= 3);
  const before = plainText.slice(0, textAt(b.at));
  // só o TRECHO da frase com o nome: "Shauna ficará com o de desvantagem, e Calem/Serena com o de vantagem ao seu";
  // "Hop irá pegar o inicial de fraqueza ao seu, enquanto Leon ficará com o que tem vantagem"
  const clauses = before.split(/(?<=[.!?])\s+/).filter((s) => /inicial/i.test(s)).flatMap((s) => s.split(/,\s*|;\s*|\s+enquanto\s+|\s+e\s+(?=[A-Z])/));
  const hit = clauses.filter((c) => names.some((n) => c.includes(n)) && RULE(c)).at(-1);
  return hit ? { rule: RULE(hit), by: hit.trim().slice(0, 140) } : null;
}
const TRI = ['grass', 'fire', 'water'];
const triIdx = (mon) => TRI.findIndex((t) => mon?.types.includes(t));
const starterMons = starters.map((n) => data.pokemon.find((p) => p.name === n)).filter(Boolean);
const optionMon = (o) => (o.dex ? data.pokemon.find((p) => p.id === o.dex) : o.image ? baseByKey.get(key(o.image)) : null) ?? null;
const placeholderReport = [];
/** Times concretos de uma luta: [{ party (com os genéricos resolvidos), forStarter?, note? }]. */
function expandTeam(b, rawParty0) {
  // "Chikorita/Tepig/Totodile lv.5", "Pikachu/Eevee lv.6", "Reshiram/Zekrom": vira genérico com as opções pelos nomes
  const rawParty = rawParty0.map((p) => {
    if (p.placeholder || !/\//.test(p.species ?? '')) return p;
    const parts = p.species.replace(/\(.*?\)/g, '').split('/').map((x) => x.trim()).filter(Boolean);
    const ms = parts.map((x) => baseByKey.get(key(x)));
    return ms.length >= 2 && ms.every(Boolean) ? { ...p, placeholder: true, options: ms.map((m) => ({ dex: m.id })) } : p;
  });
  const ph = rawParty.filter((p) => p.placeholder && p.options?.length);
  const fixed = (pick) => rawParty.flatMap((p) => {
    if (p.placeholder) { const m = pick(p); return m && p.level ? [[m, p.level, p]] : []; }
    if (!p.level) return [];
    const m = resolve(p);
    return m ? [[m, p.level, p]] : [];
  });
  if (!ph.length) return [{ party: fixed(() => null) }];
  const r = ruleFor(b, ph[0]);
  const opts = (p) => p.options.map(optionMon).filter(Boolean);
  if (r && starterMons.length === 3 && ph.every((p) => opts(p).length === 3 && opts(p).every((m) => triIdx(m) >= 0))) {
    placeholderReport.push({ battle: b.name, rule: r.rule, by: r.by });
    return starterMons.map((s) => {
      const target = (triIdx(s) + (r.rule === 'strong' ? 1 : 2)) % 3;
      return { party: fixed((p) => opts(p).find((m) => triIdx(m) === target)), forStarter: [s.name] };
    });
  }
  // sem regra no texto: uma variante por inicial possível (pela posição da opção)
  const n = Math.max(...ph.map((p) => opts(p).length));
  placeholderReport.push({ battle: b.name, rule: null, variants: n });
  return Array.from({ length: n }, (_, k) => ({ party: fixed((p) => opts(p)[k] ?? null), note: `se o inicial dele for ${titleCase((opts(ph[0])[k]?.name ?? '?').replace(/-/g, ' '))}` }));
}
// Mega do chefe: a forma Mega do jogo (add-pkhex-megas) quando o time escreve "Mega <espécie>" (X/Y pelo sufixo: "Mega
// Charizard X") ou quando uma frase perto da luta diz que ele pode mega evoluir ("o Alakazam dele pode mega evoluir"; SM: Dexio)
const megaSentences = (b) => {
  const near = strip(html.slice(Math.max(0, b.at - 800), b.at + 2500)).replace(/\s+/g, ' ');
  return [...near.matchAll(/(?:o|a)\s+([A-Z][a-zé]+)\s+(?:dele|dela)\s+(?:pode|vai|irá)\s+mega\s*evoluir/g)].map((m) => key(m[1]));
};
function megaOf(mon, raw, b) {
  const forms = mon.megas ?? [];
  if (!forms.length) return null;
  const tagged = raw?.tags?.includes('mega');
  if (!tagged && !megaSentences(b).includes(key(mon.name))) return null;
  const xy = String(raw?.species ?? '').match(/\b([XYZ])\s*$/)?.[1]?.toLowerCase();
  return (xy && forms.find((f) => f.name.endsWith('-mega-' + xy)))?.name ?? forms[0].name;
}
for (const [i, b] of battles.entries()) {
  const teams = b.teams?.length ? b.teams : [{ label: b.variant ?? '', party: b.party }];
  for (const [j, t] of teams.entries()) {
    for (const [k, x] of expandTeam(b, t.party).entries()) {
      // Mega ("Mega Camerupt lv.43" ou "o Alakazam dele pode mega evoluir" perto da luta) e tipo Tera ("(Tera Bug)") do detonado
      const party = x.party.map(([mon, level, raw]) => ({ species: mon.name, level, item: null, iv: null, moves: likelyMoveset(mon, level), defaultMoves: true,
        ...(megaOf(mon, raw, b) && { mega: megaOf(mon, raw, b) }), ...(raw?.notes?.tera && { tera: raw.notes.tera.toLowerCase() }),
        // Sword/Shield: "Dynamax Eldegoss lv.19" / "Gigantamax Centiskorch lv.25" — o Pokémon do líder que dinamaxiza
        ...(raw?.tags?.includes('gigantamax') ? { dynamax: 'gigantamax' } : raw?.tags?.includes('dynamax') ? { dynamax: 'dynamax' } : {}) }));
      if (!party.length) continue;
      const label = `${t.label ?? ''} ${b.variant ?? ''}`;
      const forStarter = x.forStarter ?? starters.filter((s) => new RegExp(`\\b${s.split('-')[0]}\\b`, 'i').test(label));
      const where = titleCase(b.section ?? '');
      trainers.push({
        key: `DETONADO_${i}_${j}${k ? `_${k}` : ''}`, name: b.name, label: b.name + (j > 0 && t.label && !forStarter.length ? ` (${t.label})` : '') + (x.note ? ` (${x.note})` : ''), class: b.name,
        group: promoBattles.has(b) ? 'Partidas de promoção' : firstAt.has(b.name) ? GROUP.leader : b.kind === 'leader' ? GROUP.other : (GROUP[b.kind] ?? GROUP.other),
        double: false, map: where ? [where] : [], party, ...(forStarter.length && { forStarter }), stage: hasProgress ? stageAt(b.at) : null, source: 'detonado', at: b.at,
      });
    }
    // genéricos que ficaram sem resolver (sem opções ou sem nível)
    skippedPlaceholders += t.party.filter((p) => p.placeholder && !(p.options?.length && p.level)).length;
  }
}

// ---- estágio de cada fonte do "onde obter"
const stageOfPlace = new Map();
// espécies selvagens de cada local (todas as versões) — para achar o trecho quando o detonado não diz o nome ("nesta rota
// encontramos Sandshrew, Ekans…" no Let's Go; rotas sem número no BW/BDSP)
const speciesAt = new Map();
for (const v of Object.values(acq.versions)) for (const [n, list] of Object.entries(v)) for (const s of list) if (s.type === 'wild' && !s.random) { // sem aparições raras/surtos
  const base = n.replace(/-(alola|galar|hisui|paldea).*$/, '').split('-')[0];
  if (base.length >= 4) (speciesAt.get(s.where) ?? speciesAt.set(s.where, new Set()).get(s.where)).add(base);
}
const bySpecies = (where) => {
  const sp = [...(speciesAt.get(where) ?? [])];
  if (sp.length < 3) return null;
  // o 1º trecho que cita ≥ 3 espécies do local (ou metade delas): o mais cedo, não o que cita mais (o pós-jogo do Let's Go
  // lista as aparições raras de todas as rotas)
  const need = Math.max(3, Math.ceil(sp.length / 2));
  for (const c of tl.chunks) {
    const txt = ' ' + c.text.join(' ') + ' ';
    const n = sp.filter((x) => txt.includes(' ' + x + ' ')).length;
    if (n >= need) return { stage: c.stage, section: c.title, by: 'espécies', name: `${n}/${sp.length} espécies` };
  }
  return null;
};
const placeOf = (where) => {
  if (!stageOfPlace.has(where)) {
    const byName = placeStage(tl, where.replace(/\(.*?\)/g, ' '), { generic: ['forest', 'cave', 'tower', 'path', 'area', 'zone'] }) ?? placeStage(tl, where);
    // título de seção com o nome vence; citação só no texto pode ser tardia (SM: "siga pela rota" sem número no começo e
    // "Route 1" só depois da 2ª provação) → vale a evidência mais cedo entre o nome e o trecho que lista as espécies
    const sp = byName?.by === 'título' ? null : bySpecies(where);
    let r = byName && sp ? (sp.stage < byName.stage ? sp : byName) : byName ?? sp;
    // subárea ("Route 1 (Hau'oli Outskirts)"): não fica depois do local-pai ("Route 1")
    const parent = where.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    if (parent !== where && r?.by !== 'título') { const pr = placeOf(parent); if (pr && (!r || pr.stage < r.stage)) r = pr; }
    // remake sem o lugar no detonado (o do BDSP não numera as rotas: "ao entrar nesta rota"): estágio do MESMO lugar no
    // jogo original (decomp), convertido pelo nome do líder — a ordem pode mudar (Let's Go: Sabrina antes de Koga)
    // sem título próprio, a citação no texto pode ser tardia (ORAS: Route 102 citada só no estágio 8) → vale a mais cedo
    // entre o texto e o jogo original
    if (r?.by !== 'título') { const tw = twinStage(where) ?? twinStage(parent); if (tw && (!r || tw.stage < r.stage)) r = tw; }
    stageOfPlace.set(where, r);
  }
  return stageOfPlace.get(where);
};
// remakes → jogo original com estágio tirado do decomp (mesma história e mesmos líderes)
const TWIN_STAGE = { 'brilliant-diamond-shining-pearl': 'diamond-pearl', 'lets-go-pikachu-lets-go-eevee': 'yellow', 'omega-ruby-alpha-sapphire': 'ruby-sapphire' };
let twin = null;
function twinStage(where) {
  if (!TWIN_STAGE[gameId] || !hasProgress) return null;
  if (twin === null) {
    try {
      const a = JSON.parse(readFileSync(new URL(`../public/data/${TWIN_STAGE[gameId]}-acquisition.json`, import.meta.url), 'utf8'));
      const byLabel = new Map();
      for (const m of Object.values(a.progress?.maps ?? {})) if (m.stage != null && (!byLabel.has(m.label) || m.stage < byLabel.get(m.label))) byLabel.set(m.label, m.stage);
      twin = { byLabel, order: a.progress?.leaderOrder ?? [] };
    } catch { twin = { byLabel: new Map(), order: [] }; }
  }
  // o original pode dividir o lugar ("Route 204 South" / "Route 204 North"): vale o menor estágio das partes
  const parts = [...twin.byLabel].filter(([l]) => l.startsWith(where + ' ')).map(([, st]) => st);
  const s = twin.byLabel.get(where) ?? (parts.length ? Math.min(...parts) : null);
  if (s == null) return null;
  const fold = (x) => String(x).toLowerCase().replace(/[^a-z]/g, '');
  let stage;
  if (s === 0) stage = 0;
  else if (s >= POSTGAME) stage = POST;
  else {
    const leader = fold(twin.order[s - 1] ?? '');
    const i = leaderOrder.findIndex((n) => n.split('/').some((x) => fold(x) && (fold(x).includes(leader) || leader.includes(fold(x)))));
    if (i < 0) return null;
    stage = i + 1;
  }
  return { stage, section: `${TWIN_STAGE[gameId]} (decomp)`, by: 'jogo original', name: where };
}
// itens-chave das mecânicas (simulador): o 1º trecho em que o detonado diz que você GANHA o item — Mega Ring/Mega
// Bracelet/Key Stone (Mega), Z-Ring (golpes Z), Dynamax Band, Tera Orb. "É necessário que o treinador tenha um Mega Ring"
// não conta (sem verbo de receber). Retorna { mega: { stage, section, text } … } só com os achados.
function keyItems() {
  const KEYS = { mega: /Mega Ring|Mega Bracelet|Key Stone|Mega[- ]Anel/i, z: /Z-?(Power )?Ring/i, dynamax: /Dynamax Band/i, tera: /Tera Orb/i };
  // sem \b no fim: "á" não é caractere de palavra no regex do JS ("dará" não casava); frase com "não" fica de fora
  // (ORAS: "não poderia entregar a Key Stone")
  const GIVE = /(^|[^\wÀ-ú])(receber[áa]?|recebe|ganh[a-zá-ú]*|dar[áa]|d[áa] (?:a|o|um|uma) |entreg[a-zá-ú]*|levar[^.]*até você|consegu[a-zá-ú]*)/i;
  const out = {};
  for (const [k, re] of Object.entries(KEYS)) {
    const g = new RegExp(re.source, 'gi');
    for (let m; (m = g.exec(html));) {
      // a frase em volta (sem tags), do ponto anterior ao próximo
      // corte no meio de uma tag deixava lixo de atributo ("323.png?w=640…>"): descarta até o fim da tag cortada
      const before = strip(html.slice(Math.max(0, m.index - 400), m.index).replace(/^[^<]*>/, '')), after = strip(html.slice(m.index, m.index + 400).replace(/<[^>]*$/, ''));
      const sentence = (before.split(/[.!?]\s/).at(-1) + after.split(/(?<=[.!?])\s/)[0]).replace(/\s+/g, ' ').trim();
      if (!GIVE.test(sentence) || /\bnão\b/i.test(sentence)) continue;
      const sec = [...sections].reverse().find((s) => s.at <= m.index);
      out[k] = { stage: stageAt(m.index), section: sec?.title ?? '', text: sentence };
      break;
    }
  }
  // creche (ovos): a 1ª menção ao Day Care/Nursery/Picnic; se o detonado diz que só a partir de um ponto se pode cruzar
  // ("Agora já podemos … cruzar pokémons no DayCare" — Black/White), vale esse ponto
  {
    const re = /Day ?Care|Pok[ée]mon Nursery|Picnic/gi, found = [];
    for (let m; (m = re.exec(html));) {
      const before = strip(html.slice(Math.max(0, m.index - 400), m.index).replace(/^[^<]*>/, '')), after = strip(html.slice(m.index, m.index + 400).replace(/<[^>]*$/, ''));
      const sentence = (before.split(/[.!?]\s/).at(-1) + after.split(/(?<=[.!?])\s/)[0]).replace(/\s+/g, ' ').trim();
      found.push({ at: m.index, name: m[0], sentence });
    }
    const permit = found.find((f) => /(permiss[ãa]o|agora (j[áa] )?pode(mos)?)[^.]*(cruzar|ovos?|breeding)/i.test(f.sentence));
    const pick = permit ?? found[0];
    if (pick) {
      const sec = [...sections].reverse().find((s) => s.at <= pick.at);
      // o texto da página traz script de anúncio solto ("(adsbygoogle = …).push({});") e entidades HTML
      const text = pick.sentence.replace(/\(?\w*adsbygoogle[^;]*;\s*/g, '').replace(/&#8211;|&ndash;/g, '–').replace(/&#038;|&amp;/g, '&').trim();
      // onde fica: o trecho da 1ª menção (Black/White: a permissão é em Nimbasa, a creche está na Route 3)
      const place = [...sections].reverse().find((s) => s.at <= found[0].at);
      out.daycare = { stage: stageAt(pick.at), section: sec?.title ?? '', place: place?.title ?? '', name: found[0].name, text, picnic: /picnic/i.test(pick.name) };
    }
  }
  // Z-Crystals de tipo (golpes Z): onde o detonado diz que você recebe/pega cada um ("receba de Lana o Waterium Z",
  // "Pegue o Buginium Z no baú"). Os nomes têm que existir na lista de itens do PKHeX
  if (out.z) {
    const items = new Set(readFileSync(new URL('../data-sources/pkhex-src/PKHeX.Core/Resources/text/items/text_Items_en.txt', import.meta.url), 'utf8').split(/\r?\n/).map((s) => s.trim()));
    const CRYSTAL = { normal: 'Normalium Z', fire: 'Firium Z', water: 'Waterium Z', electric: 'Electrium Z', grass: 'Grassium Z', ice: 'Icium Z', fighting: 'Fightinium Z', poison: 'Poisonium Z', ground: 'Groundium Z', flying: 'Flyinium Z', psychic: 'Psychium Z', bug: 'Buginium Z', rock: 'Rockium Z', ghost: 'Ghostium Z', dragon: 'Dragonium Z', dark: 'Darkinium Z', steel: 'Steelium Z', fairy: 'Fairium Z' };
    const TAKE = /(^|[^\wÀ-ú])(receb[a-zá-ú]*|peg[a-zá-ú]*|ganh[a-zá-ú]*|dar[áa]|d[áa] (?:a|o|um|uma) |entreg[a-zá-ú]*|encontr[a-zá-ú]*|ach[a-zá-ú]*|consegu[a-zá-ú]*|ficar com|pedestal com)/i; // "pedestal com o Icium Z"; "ficar com o Dragonium Z"
    out.zCrystals = {};
    for (const [type, name] of Object.entries(CRYSTAL)) {
      if (!items.has(name)) throw new Error(`Z-Crystal fora da lista de itens do PKHeX: ${name}`);
      const g = new RegExp(name.replace(' ', '\\s*'), 'g');
      for (let m; (m = g.exec(html));) {
        const before = strip(html.slice(Math.max(0, m.index - 400), m.index).replace(/^[^<]*>/, '')), after = strip(html.slice(m.index, m.index + 300).replace(/<[^>]*$/, ''));
        const sentence = (before.split(/[.!?]\s/).at(-1) + after.split(/(?<=[.!?])\s/)[0]).replace(/\s+/g, ' ').trim();
        if (!TAKE.test(sentence) || /\bnão\b/i.test(sentence)) continue;
        out.zCrystals[type] = { stage: stageAt(m.index), name, text: sentence };
        break;
      }
    }
  }
  return out;
}
let withStage = 0, total = 0;
// B3 (0.36.0) — local que o detonado não cita: ESTIMATIVA pelo nível — o menor nível dos selvagens comuns do local comparado
// ao nível mais alto dos treinadores de cada estágio: entra no 1º estágio em que os treinadores já chegam a esse nível.
// Marcada (stageEstimated) — a tela diz "estimativa pelo nível".
const stageTop = [];
for (const t of trainers) if (t.stage != null) stageTop[t.stage] = Math.max(stageTop[t.stage] ?? 0, ...t.party.map((p) => p.level ?? 0));
const wildMin = new Map();
// só encontro em terra: Surf e vara dependem de HM/item e as faixas de nível deles puxavam a Route 17 do BW (só água,
// "Surf nv 5–15") para o estágio 0; local só de água fica sem estimativa
const LAND = (s) => !/surf|rod|vara|pesca|fish/i.test(s.method ?? '');
for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) if (s.type === 'wild' && !s.random && s.min && LAND(s)) (wildMin.get(s.where) ?? wildMin.set(s.where, []).get(s.where)).push(s.min);
// mediana dos níveis mínimos do local: um encontro fora do padrão (SM Route 10: Pikipek nv 2–3 entre selvagens nv 24+)
// não puxa o local para o começo
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
const estimateOf = (where) => {
  const L = median(wildMin.get(where) ?? []);
  if (!L || !stageTop.length) return null;
  let st = stageTop.findIndex((top) => (top ?? 0) >= L);
  if (st < 0) st = POST;
  return { stage: st, section: 'estimativa pelo nível', by: 'estimativa', name: `selvagens a partir do nv ${L}` };
};
let estimated = 0;
for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) {
  if (s.type === 'breed') continue; // ovo da creche (apply-breeding): o estágio é o da creche, não o de um local
  total++;
  let r = placeOf(s.where);
  delete s.stageEstimated;
  if (!r && hasProgress) { r = estimateOf(s.where); if (r) { s.stageEstimated = true; estimated++; } }
  if (r && hasProgress) { s.stage = r.stage; withStage++; } else delete s.stage;
}
if (hasProgress) {
  acq.progress = {
    leaderOrder, ...(stageNames && { stageNames, post: POST }), leadersFound: leaderOrder.length, eliteFound: battles.filter((b) => b.kind === 'elite').length,
    source: `PokeMythology ${game.walkthrough} (ordem dos líderes) + locais das tabelas do PKHeX`,
    trainerStage: Object.fromEntries(trainers.filter((t) => t.stage != null).map((t) => [t.key, t.stage])),
    placesWithStage: [...stageOfPlace.values()].filter(Boolean).length, placesTotal: stageOfPlace.size,
    keyItems: keyItems(),
  };
} else delete acq.progress;
writeFileSync(acqFile, JSON.stringify(acq));

// ---- trainers.json
const pub = trainers.map(({ at, ...t }) => t);
writeFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), JSON.stringify({
  source: `PokeMythology ${game.walkthrough} (times: espécie e nível; golpes = moveset padrão do jogo no nível)`, fromWalkthrough: true, trainers: pub, unplaced: [],
}));

// ---- walkthrough.json: locais por estágio, na ordem do detonado
const versions = {};
for (const [v, byMon] of Object.entries(acq.versions)) {
  const locs = new Map();
  const locOf = (where, r) => {
    if (!locs.has(where)) locs.set(where, { section: r?.section ?? where, name: where, stage: hasProgress ? (r?.stage ?? null) : 0, order: r ? (secIndex.get(r.section) ?? 1e6) : 1e6, maps: [where], wild: [], others: [], items: [], tutors: [], trainers: [] });
    return locs.get(where);
  };
  for (const [species, list] of Object.entries(byMon)) for (const s of list) {
    const l = locOf(s.where, placeOf(s.where));
    if (s.type === 'wild') l.wild.push({ species, where: s.where, method: s.method, min: s.min, max: s.max, ...(s.detail && { detail: s.detail }), ...(s.pct != null && { pct: s.pct }), ...(s.pctApprox && { pctApprox: true }), ...(s.pctTimes && { pctTimes: s.pctTimes }) });
    else l.others.push({ species, type: s.type, level: s.level, where: s.where, ...(s.detail && { detail: s.detail }) });
  }
  // treinadores: no local cujo nome está no título da seção da luta; senão um local com o nome da seção
  for (const t of trainers) {
    const sec = t.map[0] ?? '';
    const hit = [...locs.values()].find((l) => sec && words(sec).join(' ').includes(words(l.name.replace(/\(.*?\)/g, ' ')).join(' ')));
    const l = hit ?? locOf(sec || 'Outros', { section: sec, stage: t.stage ?? (hasProgress ? null : 0) });
    if (l.order === 1e6) l.order = secIndex.get(tl.sections.find((s) => s.title && sec.toUpperCase().includes(s.title))?.title) ?? l.order;
    l.trainers.push({ key: t.key, label: t.label, group: t.group, party: t.party.map(({ species, level }) => ({ species, level })), ...(t.forStarter && { forStarter: t.forStarter }) });
  }
  const placed = [...locs.values()].filter((l) => l.stage != null);
  const stages = (hasProgress ? [...Array(POST + 1).keys()] : [0]).map((st) => {
    const L = leaderOrder[st];
    const lt = L ? trainers.find((t) => L.split('/').includes(t.name)) : null;
    return {
      stage: st,
      leader: lt ? { key: lt.key, name: L, where: lt.map[0] ?? '', party: lt.party.map((p) => ({ species: p.species, level: p.level, item: null, moves: p.moves })), prize: [] } : null,
      locations: placed.filter((l) => l.stage === st).sort((a, b) => a.order - b.order).map(({ order, ...l }) => ({ ...l, minLevel: Math.min(...l.wild.map((w) => w.min), ...l.others.map((o) => o.level ?? 100)) })),
    };
  }).filter((s) => s.locations.length || s.leader);
  versions[v] = { stages, undetermined: [...locs.values()].filter((l) => l.stage == null).map(({ order, ...l }) => l), unplacedTrainers: [], rematches: [] };
}
writeFileSync(new URL(`../public/data/${gameId}-walkthrough.json`, import.meta.url), JSON.stringify({
  game: gameId, source: `PokeMythology ${game.walkthrough} + tabelas do PKHeX`, noBadges: !hasProgress, ...(stageNames && { stageNames, post: POST }), ...(promoBattles.size && { leaderTitle: 'Próxima partida de promoção' }),
  credit: 'Ordem da história baseada no detonado do PokeMythology (pokemythology.net). Times do detonado; locais e Pokémon das tabelas do jogo.',
  leaders: leaderOrder, versions,
}));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/detonado-modern.json`, import.meta.url), JSON.stringify({ leaderOrder, badges: badges.map((b) => `${b.badge}←${b.leaderHint ?? '?'}`), unresolved, fuzzy, skippedPlaceholders, placeholderReport, withStage, total, placesWithoutStage: [...stageOfPlace].filter(([, r]) => !r).map(([w]) => w) }, null, 1));
const g = trainers.reduce((a, t) => ((a[t.group] = (a[t.group] ?? 0) + 1), a), {});
console.log(`[${gameId}] detonado: ${sections.length} seções, ${battles.length} lutas → ${trainers.length} treinadores ${JSON.stringify(g)}; líderes: ${leaderOrder.join(' > ') || '—'}${champ && hasProgress ? `; campeão ${champ.name}` : ''}`);
console.log(`  espécies não reconhecidas ${unresolved.length}${unresolved.length ? ` (${[...new Set(unresolved)].slice(0, 12).join(', ')})` : ''}; por aproximação ${fuzzy.length}${fuzzy.length ? ` (${[...new Set(fuzzy)].slice(0, 8).join('; ')})` : ''}; inicial genérico pulado ${skippedPlaceholders}`);
console.log(`  fontes do onde obter com estágio: ${withStage}/${total} (${estimated} por estimativa de nível); locais sem seção no detonado: ${[...stageOfPlace].filter(([, r]) => !r).length}/${stageOfPlace.size}`);
