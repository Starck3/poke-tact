// Taxa de aparição dos selvagens nos jogos sem decomp (Q4, PLANO-EXECUCAO-4), pela página de cada lugar na Bulbapedia:
// as linhas {{Catch/entry6|nº|espécie|X|Y|método|níveis|taxa}} da seção Pokémon. O PKHeX só diz espécie e nível (método
// "Selvagem"); casa por LUGAR (nome antes do parêntese) + espécie + faixa de nível que se sobrepõe; mais de uma linha casando
// com a mesma sobreposição → fica sem taxa (relatório). Grava pct, pctSource: 'Bulbapedia' e methodDetail (Grass, Surfing…).
// Uso: node scripts/apply-bulbapedia-rates.mjs <jogo>   (≥ 5 s por página nova; para no 1º erro HTTP)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { page } from './lib/bulbapedia.mjs';

const gameId = process.argv[2];
// predefinição de cada jogo e região no título das rotas ("Kalos Route 2"); as colunas de versão seguem a ordem das versões
// do jogo; times: taxa por período em colunas ("20%|-" em Alola, ou "all=20%"; manhã|dia|noite no BDSP)
const CFG = {
  'x-y': { entry: 'entry6', region: 'Kalos' },
  'omega-ruby-alpha-sapphire': { entry: 'entryoras', region: 'Hoenn' },
  'sun-moon': { entry: 'entry7', region: 'Alola', times: ['dia', 'noite'] },
  'ultra-sun-ultra-moon': { entry: 'entryusum', region: 'Alola', times: ['dia', 'noite'] },
  'brilliant-diamond-shining-pearl': { entry: 'entrybdsp', region: 'Sinnoh', times: ['manhã', 'dia', 'noite'] },
  'lets-go-pikachu-lets-go-eevee': { entry: 'entrype', region: 'Kanto' },
};
// método já específico no PKHeX → só as linhas desse método na tabela (BDSP)
const METHOD_ROWS = { Surf: /^Surf/i, 'Old Rod': /^Fish Old/i, 'Good Rod': /^Fish Good/i, 'Super Rod': /^Fish Super/i };
const cfg = CFG[gameId];
if (!cfg) { console.log(`[${gameId}] taxa de aparição pela Bulbapedia não configurada — nada a fazer`); process.exit(0); }
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
const versions = Object.keys(acq.versions);
const key = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const placeOf = (where) => where.replace(/\s*\(.*$/, '').trim();
const METHOD_PT = { grass: 'Grama', 'tall grass': 'Grama alta', 'yellow flowers': 'Flores amarelas', 'purple flowers': 'Flores roxas', 'red flowers': 'Flores vermelhas', cave: 'Caverna',
  surf: 'Surf', 'fish old': 'Vara velha', 'fish good': 'Vara boa', 'fish super': 'Super vara', 'rock smash': 'Rock Smash', swamp: 'Pântano', ceiling: 'Teto da caverna',
  snow: 'Neve', terrain: 'Terreno', dirt: 'Terra', sky: 'Céu', 'rustling bush': 'Arbusto que mexe', 'shaking trash cans': 'Lixeira que mexe', 'horde encounter': 'Horda' };

// forma da tabela → sufixo do nome no app ("Alolan Form" → alola, "Average&nbsp;Size" → average)
const formKey = (f) => key(f.replace(/&nbsp;/g, ' ').replace(/\s+(Size|Form)$/i, '').replace(/^Alolan$/i, 'alola').replace(/^Galarian$/i, 'galar').replace(/^Hisuian$/i, 'hisui').replace(/^Paldean$/i, 'paldea'));
const REGIONAL = new Set(['alola', 'galar', 'hisui', 'paldea']);
const pctOf = (t) => { const m = String(t ?? '').trim().match(/^(~?)(\d+(?:\.\d+)?)%$/); return m ? { rate: Number(m[2]), approx: !!m[1] } : null; };

/** Linhas de captura da página: [{ species, versions: [true, false], method, min, max, rate, approx, times?, form? }]. */
function catchRows(text) {
  const out = [];
  for (const m of text.matchAll(new RegExp(`\\{\\{Catch/${cfg.entry}\\|([^\\n]*)\\}\\}`, 'gi'))) {
    const parts = m[1].split('|');
    const named = Object.fromEntries(parts.filter((x) => /^\w+=/.test(x)).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
    const [, species, ...rest] = parts.filter((x) => !/^\w+=/.test(x));
    const flags = rest.slice(0, versions.length), [method, levels, ...rates] = rest.slice(versions.length);
    const lv = String(levels ?? '').match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
    // taxa: uma coluna; ou uma por período ("-"/"0%" = não aparece nesse período); ou all=
    let r = named.all ? pctOf(named.all) : pctOf(rates[0]), times = null;
    if (cfg.times && !named.all) {
      const ps = cfg.times.map((_, i) => pctOf(rates[i]));
      const nums = ps.map((p) => p?.rate ?? 0);
      r = ps.some(Boolean) ? { rate: Math.max(...nums), approx: ps.some((p) => p?.approx) } : null;
      if (r && new Set(nums).size > 1) times = Object.fromEntries(cfg.times.map((t, i) => [t, nums[i]])); // { dia: 0, noite: 30 }
    }
    if (!lv || !r || !method) continue;
    out.push({ species: key(species), versions: flags.map((x) => x === 'yes'), method: method.trim(), min: Number(lv[1]), max: Number(lv[2] ?? lv[1]), rate: r.rate, approx: r.approx, ...(times && { times }), ...(named.form && { form: formKey(named.form) }) });
  }
  return out;
}

const report = { pages: {}, matched: 0, wild: 0, ambiguous: [], unmatched: [] };
const rowsOf = new Map();
// horda (5 de uma vez) e chamado SOS têm conta própria; Grand Underground e árvore de mel não estão na tabela do lugar
const rated = (s) => s.type === 'wild' && !/^(Horda|Chamado SOS|Grand Underground|Árvore de mel)$/.test(s.method);
const places = [...new Set(Object.values(acq.versions).flatMap((v) => Object.values(v).flat().filter(rated).map((s) => placeOf(s.where))))];
for (const place of places) {
  let rows = [];
  const t = place.replace(/’/g, "'"); // "Hau’oli City" no app; a página é "Hau'oli City"
  for (const title of /^Route \d+$/.test(t) ? [`${cfg.region} ${t}`] : [t, `${t} (${cfg.region})`]) {
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
  const col = versions.indexOf(version);
  for (const [sp, list] of Object.entries(v)) for (const s of list) {
    if (!rated(s)) continue;
    report.wild++;
    delete s.pct; delete s.pctSource; delete s.pctApprox; delete s.pctTimes; delete s.methodDetail;
    // forma (basculin-red-striped, rattata-alola): a tabela da Bulbapedia escreve só a espécie, com form=
    const rows = rowsOf.get(placeOf(s.where)) ?? [];
    const spKey = rows.some((r) => r.species === key(sp)) ? key(sp) : key(sp.split('-')[0]);
    // linha de outra forma ("form=Blue-Striped", "form=Alolan Form") não vale para basculin-red-striped nem para o rattata de Kanto
    const formOk = (r) => !r.form || (spKey === key(sp) ? !REGIONAL.has(r.form) : key(sp).endsWith(r.form));
    const methodOk = (r) => !METHOD_ROWS[s.methodPkhex ?? s.method] || METHOD_ROWS[s.methodPkhex ?? s.method].test(r.method);
    const cands = rows.filter((r) => r.species === spKey && formOk(r) && methodOk(r) && r.versions[col] !== false && overlap(s, r) >= 0);
    if (!cands.length) { report.unmatched.push(`${version} ${sp} ${s.where} nv ${s.min}-${s.max}`); continue; }
    const best = Math.max(...cands.map((r) => overlap(s, r)));
    const top = cands.filter((r) => overlap(s, r) === best);
    // mesma taxa em todas as linhas empatadas (Grass e Yellow Flowers com o mesmo %) → vale; senão fica sem
    if (new Set(top.map((r) => `${r.rate}|${JSON.stringify(r.times ?? null)}`)).size > 1) { report.ambiguous.push(`${version} ${sp} ${s.where}: ${top.map((r) => `${r.method} ${r.rate}%`).join(', ')}`); continue; }
    s.pct = top[0].rate; s.pctSource = 'Bulbapedia'; s.methodDetail = [...new Set(top.map((r) => r.method))].join('/');
    const pt = [...new Set(top.map((r) => METHOD_PT[r.method.toLowerCase()] ?? r.method))].join('/');
    // "Selvagem"/"Grama" do PKHeX (genérico: até o teto da caverna vem como grama) → como se encontra (Teto da caverna, Surf…)
    if (/^(Selvagem|Grama)$/.test(s.methodPkhex ?? s.method) && pt !== s.method) { s.methodPkhex ??= s.method; s.method = pt; }
    if (top.some((r) => r.approx)) s.pctApprox = true; // "~80%" na tabela
    if (top[0].times) s.pctTimes = top[0].times; // { dia: 0, noite: 30 } (Alola), { manhã, dia, noite } (BDSP)
    report.matched++;
  }
}
acq.ratesSource = 'Bulbapedia (tabela de captura da página de cada lugar) — CC BY-NC-SA, fatos extraídos';
writeFileSync(acqFile, JSON.stringify(acq));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-rates.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}] taxa de aparição pela Bulbapedia: ${report.matched}/${report.wild} selvagens; ambíguos ${report.ambiguous.length}; sem linha ${report.unmatched.length}`);
