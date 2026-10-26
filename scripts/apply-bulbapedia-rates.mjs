// Taxa de aparição dos selvagens nos jogos sem decomp (Q4, PLANO-EXECUCAO-4), pela página de cada lugar na Bulbapedia:
// as linhas {{Catch/entry6|nº|espécie|X|Y|método|níveis|taxa}} da seção Pokémon. O PKHeX só diz espécie e nível (método
// "Selvagem"); casa por LUGAR (nome antes do parêntese) + espécie + faixa de nível que se sobrepõe; mais de uma linha casando
// com a mesma sobreposição → fica sem taxa (relatório). Grava pct, pctSource: 'Bulbapedia' e methodDetail (Grass, Surfing…).
// Uso: node scripts/apply-bulbapedia-rates.mjs <jogo>   (≥ 5 s por página nova; para no 1º erro HTTP)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { page } from './lib/bulbapedia.mjs';

const gameId = process.argv[2];
// título da página por lugar do app e colunas de versão da predefinição de cada jogo
const CFG = {
  'x-y': { entry: 'entry6', region: 'Kalos', cols: ['x', 'y'] },
};
const cfg = CFG[gameId];
if (!cfg) { console.log(`[${gameId}] taxa de aparição pela Bulbapedia não configurada — nada a fazer`); process.exit(0); }
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
const key = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const placeOf = (where) => where.replace(/\s*\(.*$/, '').trim();
const METHOD_PT = { grass: 'Grama', 'tall grass': 'Grama alta', 'yellow flowers': 'Flores amarelas', 'purple flowers': 'Flores roxas', 'red flowers': 'Flores vermelhas', cave: 'Caverna',
  surf: 'Surf', 'fish old': 'Vara velha', 'fish good': 'Vara boa', 'fish super': 'Super vara', 'rock smash': 'Rock Smash', swamp: 'Pântano', ceiling: 'Teto da caverna',
  snow: 'Neve', terrain: 'Terreno', dirt: 'Terra', sky: 'Céu', 'rustling bush': 'Arbusto que mexe', 'shaking trash cans': 'Lixeira que mexe', 'horde encounter': 'Horda' };

/** Linhas de captura da página: [{ species, versions: {x: true…}, method, min, max, rate }]. */
function catchRows(text) {
  const out = [];
  for (const m of text.matchAll(new RegExp(`\\{\\{Catch/${cfg.entry}\\|([^\\n]*)\\}\\}`, 'gi'))) {
    const f = m[1].split('|').filter((x) => !/^\w+=/.test(x));
    const form = m[1].match(/\|form=([^|]+)/)?.[1]?.replace(/&nbsp;/g, ' ').replace(/\s+Size$/i, ''); // "Average&nbsp;Size" → Average
    const [, species, ...rest] = f;
    const flags = rest.slice(0, cfg.cols.length), [method, levels, rate] = rest.slice(cfg.cols.length);
    const lv = String(levels ?? '').match(/(\d+)(?:\s*[-–]\s*(\d+))?/), pct = String(rate ?? '').match(/^(~?)(\d+(?:\.\d+)?)%$/);
    if (!lv || !pct) continue;
    out.push({ species: key(species), versions: Object.fromEntries(cfg.cols.map((c, i) => [c, flags[i] === 'yes'])), method: method.trim(), min: Number(lv[1]), max: Number(lv[2] ?? lv[1]), rate: Number(pct[2]), approx: !!pct[1], ...(form && { form: key(form) }) });
  }
  return out;
}

const report = { pages: {}, matched: 0, wild: 0, ambiguous: [], unmatched: [] };
const rowsOf = new Map();
const places = [...new Set(Object.values(acq.versions).flatMap((v) => Object.values(v).flat().filter((s) => s.type === 'wild').map((s) => placeOf(s.where))))];
for (const place of places) {
  let rows = [];
  for (const title of /^Route \d+$/.test(place) ? [`${cfg.region} ${place}`] : [place, `${place} (${cfg.region})`]) {
    let text;
    try { text = await page(title); } catch (e) { console.log(e.message); process.exit(2); }
    if (text && /\{\{disambig/i.test(text)) continue;
    rows = catchRows(text ?? '');
    report.pages[place] = `${title}: ${rows.length} linhas`;
    if (rows.length) break;
  }
  rowsOf.set(place, rows);
}
const overlap = (s, r) => Math.min(s.max, r.max) - Math.max(s.min, r.min);
for (const [version, v] of Object.entries(acq.versions)) {
  const col = cfg.cols.find((c) => version.startsWith(c) || version === c) ?? version;
  for (const [sp, list] of Object.entries(v)) for (const s of list) {
    if (s.type !== 'wild' || s.method === 'Horda') continue; // horda (5 de uma vez) tem tabela própria; fica sem taxa
    report.wild++;
    delete s.pct; delete s.pctSource; delete s.pctApprox; delete s.methodDetail;
    // forma (basculin-red-striped, pumpkaboo-average): a tabela da Bulbapedia escreve só a espécie
    const rows = rowsOf.get(placeOf(s.where)) ?? [];
    const spKey = rows.some((r) => r.species === key(sp)) ? key(sp) : key(sp.split('-')[0]);
    // linha de outra forma ("form=Blue-Striped") não vale para basculin-red-striped
    const cands = rows.filter((r) => r.species === spKey && (!r.form || spKey === key(sp) || key(sp).endsWith(r.form)) && r.versions[col] !== false && overlap(s, r) >= 0);
    if (!cands.length) { report.unmatched.push(`${version} ${sp} ${s.where} nv ${s.min}-${s.max}`); continue; }
    const best = Math.max(...cands.map((r) => overlap(s, r)));
    const top = cands.filter((r) => overlap(s, r) === best);
    // mesma taxa em todas as linhas empatadas (Grass e Yellow Flowers com o mesmo %) → vale; senão fica sem
    if (new Set(top.map((r) => r.rate)).size > 1) { report.ambiguous.push(`${version} ${sp} ${s.where}: ${top.map((r) => `${r.method} ${r.rate}%`).join(', ')}`); continue; }
    s.pct = top[0].rate; s.pctSource = 'Bulbapedia'; s.methodDetail = [...new Set(top.map((r) => r.method))].join('/');
    const pt = [...new Set(top.map((r) => METHOD_PT[r.method.toLowerCase()] ?? r.method))].join('/');
    // "Selvagem"/"Grama" do PKHeX (genérico: até o teto da caverna vem como grama) → como se encontra (Teto da caverna, Surf…)
    if (/^(Selvagem|Grama)$/.test(s.methodPkhex ?? s.method) && pt !== s.method) { s.methodPkhex ??= s.method; s.method = pt; }
    if (top.some((r) => r.approx)) s.pctApprox = true; // "~80%" na tabela
    report.matched++;
  }
}
acq.ratesSource = 'Bulbapedia (tabela de captura da página de cada lugar) — CC BY-NC-SA, fatos extraídos';
writeFileSync(acqFile, JSON.stringify(acq));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-rates.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}] taxa de aparição pela Bulbapedia: ${report.matched}/${report.wild} selvagens; ambíguos ${report.ambiguous.length}; sem linha ${report.unmatched.length}`);
