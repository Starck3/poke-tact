// Chance de aparição no Scarlet/Violet (F1, PLANO-EXECUCAO-8) pela tabela de cada lugar na Bulbapedia: o jogo não tem
// "taxa" por rota como os outros — cada ponto de aparição sorteia uma espécie do BIOMA pelo peso ({{Catch/entry9|…|níveis|
// peso|…}}). A fatia de uma espécie é o peso dela ÷ a soma dos pesos do bioma (mesma versão, terreno e horário) — é uma
// ESTIMATIVA (o jogo também filtra pelo nível da área, e há grupos e surtos), marcada como tal na tela ("≈", pctApprox).
// Grava pctBiome { floresta: 15, planície: 9 } e pct = a maior; pctSource 'Bulbapedia (peso no bioma)'.
// Casa por LUGAR + espécie (+ forma) + versão + faixa de nível que se sobrepõe, só no método "Selvagem" do PKHeX.
// Uso: node scripts/apply-bulbapedia-spawn-weights.mjs <jogo>   (≥ 5 s por página nova; para no 1º erro HTTP)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { page } from './lib/bulbapedia.mjs';
import { nameKey } from './lib/names.mjs';
import { biomeRows, biomeShares } from './lib/bulbapedia-catch.mjs';

const gameId = process.argv[2];
if (gameId !== 'scarlet-violet') { console.log(`[${gameId}] peso por bioma só existe no Scarlet/Violet — nada a fazer`); process.exit(0); }
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
const versions = Object.keys(acq.versions);
const REGIONAL = new Set(['alola', 'galar', 'hisui', 'paldea']);
const placeOf = (where) => where.replace(/\s*\(DLC.*$/, '').trim();
const isWild = (s) => s.type === 'wild' && (s.methodPkhex ?? s.method) === 'Selvagem';

const report = { pages: {}, matched: 0, wild: 0, unmatched: [] };
const rowsOf = new Map();
const places = [...new Set(Object.values(acq.versions).flatMap((v) => Object.values(v).flat().filter(isWild).map((s) => placeOf(s.where))))];
for (const place of places) {
  let rows = [];
  const t = place.replace(/’/g, "'");
  for (const title of [t, `${t} (Paldea)`]) {
    let text;
    try { text = await page(title); } catch (e) { console.log(e.message); process.exit(2); }
    if (text && /\{\{disambig/i.test(text)) continue;
    rows = biomeRows(text ?? '');
    report.pages[place] = `${title}: ${rows.length} linhas`;
    if (rows.length) break;
  }
  rowsOf.set(place, rows);
}
const overlap = (s, r) => Math.min(s.max, r.max) - Math.max(s.min, r.min);
const fmt = (x) => (x >= 1 ? Math.round(x) : x); // menos de 1%: uma casa decimal
for (const [version, v] of Object.entries(acq.versions)) {
  const col = versions.indexOf(version);
  const shares = new Map([...rowsOf].map(([p, rows]) => [p, biomeShares(rows, col)]));
  for (const [sp, list] of Object.entries(v)) for (const s of list) {
    if (!isWild(s)) continue;
    report.wild++;
    if (s.pctSource === 'Bulbapedia (peso no bioma)') { delete s.pct; delete s.pctSource; delete s.pctApprox; delete s.pctBiome; }
    const rows = shares.get(placeOf(s.where)) ?? [];
    const spKey = rows.some((r) => r.species === nameKey(sp)) ? nameKey(sp) : nameKey(sp.split('-')[0]);
    const formOk = (r) => !r.form || (spKey === nameKey(sp) ? !REGIONAL.has(r.form) : nameKey(sp).endsWith(r.form));
    const cands = rows.filter((r) => r.species === spKey && formOk(r) && overlap(s, r) >= 0);
    if (!cands.length) { report.unmatched.push(`${version} ${sp} ${s.where} nv ${s.min}-${s.max}`); continue; }
    const byBiome = {};
    for (const r of cands) byBiome[r.biome] = Math.max(byBiome[r.biome] ?? 0, r.share);
    s.pctBiome = Object.fromEntries(Object.entries(byBiome).sort((a, b) => b[1] - a[1]).map(([b, x]) => [b, fmt(x)]));
    s.pct = Math.max(...Object.values(s.pctBiome)); s.pctApprox = true; s.pctSource = 'Bulbapedia (peso no bioma)';
    report.matched++;
  }
}
acq.spawnWeightsSource = 'Bulbapedia (tabela de aparição por bioma de cada lugar: peso ÷ soma do bioma, estimativa) — CC BY-NC-SA, fatos extraídos';
writeFileSync(acqFile, JSON.stringify(acq));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-spawn-weights.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}] peso por bioma pela Bulbapedia: ${report.matched}/${report.wild} selvagens; sem linha ${report.unmatched.length}`);
