// Lugar e ponto da história das trocas dentro do jogo (R4, PLANO-EXECUCAO-5): o PKHeX não diz onde é a troca (o app gravava
// "a Link Trade", sem estágio). A página "In-game trade" da Bulbapedia tem, por jogo, a tabela com o lugar (1ª coluna) e o
// Pokémon que o personagem dá (2º {{p|…}} da linha). O estágio é o do lugar no próprio jogo (o mais cedo entre as fontes e
// os locais do Detonado com esse nome). Scarlet/Violet: as trocas sem nome ("troca com NPC") são as da League Club Room
// (seção "The Indigo Disk") — ficam no estágio das áreas dessa DLC.
// Uso: node scripts/apply-bulbapedia-trades.mjs <jogo>   (≥ 5 s por página nova)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { page, plain } from './lib/bulbapedia.mjs';
import { nameKey } from './lib/names.mjs';

const gameId = process.argv[2];
const SECTION = { 'x-y': 'Pokémon X and Y', 'sun-moon': 'Pokémon Sun and Moon', 'scarlet-violet': 'Pokémon Scarlet and Violet' };
if (!SECTION[gameId]) { console.log(`[${gameId}] trocas pela Bulbapedia não configuradas — nada a fazer`); process.exit(0); }
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
let text;
try { text = await page('In-game trade'); } catch (e) { console.log(e.message); process.exit(2); }
const key = nameKey;

// linhas da tabela da seção do jogo: { place, species }
const start = text.indexOf(`====${SECTION[gameId]}====`);
if (start < 0) { console.log(`[${gameId}] seção "${SECTION[gameId]}" não encontrada — parado`); process.exit(2); }
const sec = text.slice(start, text.indexOf('\n|}', start));
const rows = [];
let place = null;
for (const r of sec.split(/\n\|-[^\n]*/).slice(1)) {
  // célula: "| rowspan="3" | [[Vaniville Town]]" ou "| {{rt|2|Alola}}" — sem o atributo
  const cells = r.split('\n').filter((l) => /^\|(?![-}])/.test(l)).map((l) => l.replace(/^\|\s*/, '').replace(/^(?:rowspan|colspan)="\d+"\s*\|\s*/, ''));
  const loc = cells[0] && /\[\[|\{\{rt\|/.test(cells[0]) && !/\{\{MSP|\[\[File:/.test(cells[0]) ? plain(cells[0]) : null;
  if (loc) place = loc;
  // Pokémon do personagem: o 2º {{p|…}} (o 1º é o que você dá); só um quando você dá "Any Pokémon" (iniciais em Vaniville)
  // ou na linha de continuação de um lugar com rowspan
  const ps = [...r.matchAll(/\{\{p\|([^}|]+)\}\}/g)].map((m) => m[1]);
  if (ps.length && place) rows.push({ place, species: ps.length >= 2 ? ps[1] : ps[0] });
}
// estágio de um lugar: o mais cedo entre as fontes do onde obter e os locais do Detonado com esse nome
const stageOf = new Map();
const note = (w, st) => { if (w && Number.isInteger(st) && !(stageOf.get(key(w)) <= st)) stageOf.set(key(w), st); };
for (const v of Object.values(acq.versions)) for (const l of Object.values(v)) for (const s of l) note(s.where, s.stage);
const wtFile = new URL(`../public/data/${gameId}-walkthrough.json`, import.meta.url);
if (existsSync(wtFile)) for (const v of Object.values(JSON.parse(readFileSync(wtFile, 'utf8')).versions)) for (const st of v.stages) for (const l of st.locations) note(l.name, st.stage);
// cidade sem selvagem (Malie City): o estágio dos treinadores que lutam lá
const trFile = new URL(`../public/data/${gameId}-trainers.json`, import.meta.url);
if (existsSync(trFile)) for (const t of JSON.parse(readFileSync(trFile, 'utf8')).trainers) for (const m of t.map ?? []) note(m, t.stage);
const placeStage = (p) => stageOf.get(key(p)) ?? stageOf.get(key(p.replace(/ City$| Town$/, '')));
// Scarlet/Violet: estágio das áreas da DLC The Indigo Disk (Blueberry)
const blueberry = Math.min(...Object.values(acq.versions).flatMap((v) => Object.values(v).flat()).filter((s) => /DLC Blueberry/.test(s.detail ?? '') && Number.isInteger(s.stage)).map((s) => s.stage));

const report = { rows: rows.length, placed: [], noStage: [], unmatched: [] };
for (const v of Object.values(acq.versions)) for (const [sp, list] of Object.entries(v)) for (const s of list) {
  if (s.type !== 'trade' || s.where !== 'a Link Trade') continue;
  const row = rows.find((r) => key(r.species) === key(sp.split('-')[0]) || key(r.species) === key(sp));
  if (row) {
    s.where = row.place; s.whereSource = 'Bulbapedia';
    const st = placeStage(row.place);
    if (st != null) { s.stage = st; report.placed.push(`${sp} ← ${row.place} (estágio ${st})`); } else report.noStage.push(`${sp} ← ${row.place}`);
  } else if (gameId === 'scarlet-violet' && s.detail === 'troca com NPC' && Number.isFinite(blueberry)) {
    s.where = 'League Club Room (Blueberry Academy)'; s.whereSource = 'Bulbapedia'; s.stage = blueberry;
    report.placed.push(`${sp} ← League Club Room (estágio ${blueberry})`);
  } else report.unmatched.push(sp);
}
writeFileSync(acqFile, JSON.stringify(acq));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-trades.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}] trocas pela Bulbapedia: ${report.placed.length} com lugar e estágio; ${report.noStage.length} com lugar sem estágio; ${report.unmatched.length} sem linha na tabela`);
