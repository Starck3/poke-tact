// Ponto da história dos selvagens da Wild Area do Sword/Shield (R3, PLANO-EXECUCAO-5) pela regra do jogo: sem insígnia só
// dá para capturar até o nv 20, e cada insígnia sobe o limite (página "Badge" da Bulbapedia, seção "Catch level limit":
// "Up to Lv. 25 — Grass Badge"…). A Wild Area inteira abre no começo, então o estágio de um encontro é o nº de insígnias que
// deixa capturar o nível mínimo dele — antes era estimado pelo nível dos líderes (stageEstimated). Subáreas pela tabela da
// página "Wild Area". Raid (Max Raid) tem outra regra e fica como estava; as áreas das DLCs também (o nível acompanha as
// insígnias). Uso: node scripts/apply-bulbapedia-catchlimit.mjs <jogo>   (≥ 5 s por página nova)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { page, plain } from './lib/bulbapedia.mjs';

const gameId = process.argv[2];
if (gameId !== 'sword-shield') { console.log(`[${gameId}] limite de captura por insígnia não se aplica — nada a fazer`); process.exit(0); }
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
let badge, wild;
try { badge = await page('Badge'); wild = await page('Wild Area'); } catch (e) { console.log(e.message); process.exit(2); }
// limites em ordem: [20, 25, 30, …] — índice = nº de insígnias
const sec = badge.slice(badge.indexOf('===Catch level limit==='));
const caps = [...sec.slice(0, sec.indexOf('\n|}\n|}')).matchAll(/! Up to Lv\. (\d+)/g)].map((m) => Number(m[1]));
// última linha: "! All Pokémon — Dragon Badge" (8 insígnias = qualquer nível)
if (/! All Pokémon/.test(sec.slice(0, sec.indexOf('\n|}\n|}')))) caps.push(100);
if (caps.length !== 9 || caps[0] !== 20) { console.log(`[${gameId}] tabela "Catch level limit" diferente do esperado (${caps}) — parado`); process.exit(2); }
// subáreas: 1ª coluna das tabelas de subárea (a do sul e a do norte): `| style="…; text-align: center" | {{color2|000|Rolling Fields}}`
const key = (s) => plain(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const subareas = new Set([...wild.matchAll(/text-align: center" \| \{\{color2\|[^|}]*\|([^|}]+)\}\}/g)].map((m) => key(m[1])));
if (subareas.size < 15) { console.log(`[${gameId}] subáreas da Wild Area não encontradas (${subareas.size}) — parado`); process.exit(2); }

const report = { caps, subareas: [...subareas], changed: 0, estimatedReplaced: 0, raised: 0, places: {} };
for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) {
  if (s.type !== 'wild' || !subareas.has(key(s.where)) || /Raid/i.test(s.detail ?? '') || /Raid/i.test(s.method ?? '')) continue;
  const need = caps.findIndex((c) => c >= (s.min ?? s.level ?? 1));
  if (need < 0) continue;
  const before = s.stage;
  // a Wild Area abre inteira no começo (página "Wild Area": só a entrada de Hammerlocke espera a Fire Badge) — vale a regra,
  // também sobre o estágio pela citação no detonado (Watchtower Ruins e Lake of Outrage vinham no pós-jogo por serem citados lá)
  const st = need;
  if (s.stageEstimated) report.estimatedReplaced++;
  else if (st !== before) report.raised++;
  delete s.stageEstimated;
  s.stage = st; s.stageBy = 'limite de captura por insígnia (Bulbapedia)';
  if (st !== before) report.changed++;
  (report.places[s.where] ??= {})[st] = ((report.places[s.where] ?? {})[st] ?? 0) + 1;
}
acq.catchLimitSource = 'Bulbapedia (Badge: Catch level limit; Wild Area: subáreas) — CC BY-NC-SA, fatos extraídos';
writeFileSync(acqFile, JSON.stringify(acq));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-catchlimit.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}] limite de captura por insígnia: ${report.estimatedReplaced} estimativas trocadas pela regra; ${report.raised} estágios do detonado trocados; ${report.changed} mudaram`);
