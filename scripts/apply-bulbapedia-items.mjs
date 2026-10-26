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
if (!acq || (acq.items && !acq.itemsPartial && Object.keys(acq.items).length)) { console.log(`[${gameId}] itens já vêm do decomp (ou sem onde obter) — nada a fazer`); process.exit(0); }
const codes = Object.entries(GAME_CODES).filter(([, gs]) => gs.includes(gameId)).map(([c]) => c);
const TITLE = { KINGS_ROCK: "King's Rock", UPGRADE: 'Up-Grade', DEEP_SEA_TOOTH: 'Deep Sea Tooth', DEEP_SEA_SCALE: 'Deep Sea Scale' };
const title = (p) => TITLE[p] ?? (p.includes('_') || p === p.toUpperCase() ? p.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').replace(/ Of /g, ' of ') : p);
const params = [...new Set(data.pokemon.flatMap((p) => [/ITEM/.test(p.evo?.kind ?? '') && typeof p.evo.param === 'string' ? p.evo.param : null, ...(p.megas ?? []).map((m) => m.stone)]).filter(Boolean))].sort();

// lugares que o app conhece neste jogo (onde obter) → estágio mais cedo
const placeStage = new Map();
for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) if (s.where && s.stage != null && s.type !== 'breed') {
  const k = s.where.toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').trim();
  placeStage.set(k, Math.min(placeStage.get(k) ?? 99, s.stage));
}
const stageOfText = (txt) => {
  // cada lugar da célula ("Route 9, Route 13; Lumiose City (Stone Emporium)"): o nome antes do parêntese
  const st = txt.split(/[,;]/).map((x) => x.replace(/\(.*$/, '').trim().toLowerCase()).map((x) => placeStage.get(x)).filter((x) => x != null);
  return st.length ? Math.min(...st) : null;
};
const evo = existsSync(evoFile) ? JSON.parse(readFileSync(evoFile, 'utf8')) : { items: {} };
evo.bulbapedia = {};
const items = {};
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
writeFileSync(evoFile, JSON.stringify(evo));
acq.items = items; acq.itemsPartial = true; acq.itemsSource = 'Bulbapedia (lugar casado com o onde obter do app)';
writeFileSync(acqFile, JSON.stringify(acq));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-items.json`, import.meta.url), JSON.stringify({ params: params.length, withRow: found, withStage: staged, missing: params.filter((p) => !evo.bulbapedia[p]) }, null, 1));
console.log(`[${gameId}] Bulbapedia itens: ${found}/${params.length} com linha do jogo; ${staged} com lugar no ponto da história`);
