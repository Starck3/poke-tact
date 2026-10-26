// Onde achar os itens de evolução e as Mega Stones nos jogos sem decomp (N3, PLANO-EXECUCAO-3), pela tabela "Acquisition"
// da página de cada item na Bulbapedia (linha do jogo: achado / outros).
//   • <jogo>-evoitems.json ganha `bulbapedia: { ITEM: [{ text, kind: 'achado'|'outros' }] }` — a tela mostra com o crédito
//   • acq.items (que hoje só existe nos jogos com decomp) ganha as fontes cujo lugar é um local que o app conhece, com o
//     estágio desse local — e acq.itemsPartial = true: item sem fonte casada NÃO bloqueia a evolução (antes de casar tudo)
// Uso: node scripts/apply-bulbapedia-items.mjs <jogo>   (≥ 5 s por página nova)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { page, acquisition, GAME_CODES } from './lib/bulbapedia.mjs';

const gameId = process.argv[2];
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const evoFile = new URL(`../public/data/${gameId}-evoitems.json`, import.meta.url);
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const acq = existsSync(acqFile) ? JSON.parse(readFileSync(acqFile, 'utf8')) : null;
if (!acq) { console.log(`[${gameId}] sem onde obter — nada a fazer`); process.exit(0); }
// jogos com decomp (acq.items do código do jogo): só os INCENSOS que faltam (N4 — o bebê de incenso precisa saber onde achar)
const decompItems = !!(acq.items && !acq.itemsPartial && Object.keys(acq.items).length);
const INCENSES = ['SEA_INCENSE', 'LAX_INCENSE', 'ROSE_INCENSE', 'ODD_INCENSE', 'ROCK_INCENSE', 'FULL_INCENSE', 'WAVE_INCENSE', 'LUCK_INCENSE', 'PURE_INCENSE'];
const codes = Object.entries(GAME_CODES).filter(([, gs]) => gs.includes(gameId)).map(([c]) => c);
const TITLE = { KINGS_ROCK: "King's Rock", UPGRADE: 'Up-Grade', DEEP_SEA_TOOTH: 'Deep Sea Tooth', DEEP_SEA_SCALE: 'Deep Sea Scale' };
const title = (p) => TITLE[p] ?? (p.includes('_') || p === p.toUpperCase() ? p.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').replace(/ Of /g, ' of ') : p);
const params = decompItems ? INCENSES.filter((x) => !acq.items[x])
  : [...new Set([...data.pokemon.flatMap((p) => [/ITEM/.test(p.evo?.kind ?? '') && typeof p.evo.param === 'string' ? p.evo.param : null, ...(p.megas ?? []).map((m) => m.stone)]), ...(data.game.generation <= 8 ? INCENSES : [])].filter(Boolean))].sort();

// lugares que o app conhece neste jogo (onde obter) → estágio mais cedo
const placeStage = new Map();
for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) if (s.where && s.stage != null && s.type !== 'breed') {
  const k = s.where.toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').trim();
  placeStage.set(k, Math.min(placeStage.get(k) ?? 99, s.stage));
}
// + mapas do decomp (progress.maps: "Mt Pyre 1F", "Lost Cave Room 1") — o nome da Bulbapedia é o do lugar inteiro ("Mt. Pyre")
for (const m of Object.values(acq.progress?.maps ?? {})) if (m.label && m.stage != null) { const k = m.label.toLowerCase(); placeStage.set(k, Math.min(placeStage.get(k) ?? 99, m.stage)); }
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const stageOfText = (txt) => {
  // cada lugar da célula ("Route 9, Route 13; Lumiose City (Stone Emporium)"): o nome antes do parêntese; casa com o lugar
  // do app de mesmo nome ou que começa por ele ("Mt. Pyre" → "Mt Pyre 1F")
  const st = [];
  for (const seg of txt.split(/[,;]/).map((x) => norm(x.replace(/\(.*$/, ''))).filter((x) => x.length >= 4)) {
    // contido no nome do app ("Lost Cave" ⊂ "Five Island Lost Cave Room 1") só se o nome for específico: ≥ 2 palavras ou
    // ≥ 8 letras ("Market" sozinho não casa)
    const specific = seg.includes(' ') || seg.length >= 8;
    for (const [k, v] of placeStage) { const nk = norm(k); if (nk === seg || nk.startsWith(seg + ' ') || (specific && (' ' + nk + ' ').includes(' ' + seg + ' '))) st.push(v); }
  }
  return st.length ? Math.min(...st) : null;
};
const evo = existsSync(evoFile) ? JSON.parse(readFileSync(evoFile, 'utf8')) : { items: {} };
evo.bulbapedia = {};
const items = decompItems ? acq.items : {};
let found = 0, staged = 0, stop = false;
for (const p of params) {
  let text;
  try { text = await page(title(p)); } catch (e) { console.log(e.message); stop = true; break; }
  const rows = acquisition(text ?? '').filter((r) => r.games.some((c) => codes.includes(c)));
  if (!rows.length) continue;
  found++;
  evo.bulbapedia[p] = rows.flatMap((r) => [r.found && { text: r.found, kind: 'achado', dlc: r.games.filter((c) => !codes.includes(c)) }, r.other && { text: r.other, kind: 'outros', dlc: r.games.filter((c) => !codes.includes(c)) }]).filter(Boolean);
  const srcs = evo.bulbapedia[p].map((x) => ({ where: x.text, type: x.kind === 'achado' ? 'ground' : 'other', by: 'Bulbapedia', stage: stageOfText(x.text) })).filter((x) => x.stage != null);
  if (srcs.length) { items[p] = srcs; staged++; }
}
if (stop) process.exit(2);
evo.bulbapediaSource = 'Bulbapedia (tabela Acquisition de cada item) — CC BY-NC-SA, fatos extraídos';
if (!decompItems) { writeFileSync(evoFile, JSON.stringify(evo)); acq.items = items; acq.itemsPartial = true; acq.itemsSource = 'Bulbapedia (lugar casado com o onde obter do app)'; }
else acq.itemsBulbapedia = Object.keys(evo.bulbapedia); // incensos que vieram da Bulbapedia (o resto é do decomp)
writeFileSync(acqFile, JSON.stringify(acq));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-items.json`, import.meta.url), JSON.stringify({ params: params.length, withRow: found, withStage: staged, missing: params.filter((p) => !evo.bulbapedia[p]) }, null, 1));
console.log(`[${gameId}] Bulbapedia itens: ${found}/${params.length} com linha do jogo; ${staged} com lugar no ponto da história`);
