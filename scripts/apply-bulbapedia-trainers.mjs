// Golpes reais dos chefes nos jogos sem decomp (N1, PLANO-EXECUCAO-3), pela Bulbapedia: o time que o app tem (do detonado:
// espécie e nível, golpes estimados pelo nível) ganha os golpes, o item e o golpe Z da página do treinador.
//   • página: o nome do treinador sem título ("Battle Chatelaine Nita" → Nita; "Calem/Serena" → Calem e Serena); página
//     de desambiguação ou sem time do jogo → fica como estava (relatório)
//   • luta: o {{Party}} do MESMO jogo (campo game) com mais Pokémon iguais (espécie e nível ±3); precisa casar ≥ 60% do time
//   • golpe da Bulbapedia que não existe no dataset do jogo → o Pokémon fica com os golpes estimados (relatório)
// Grava em <jogo>-trainers.json: moves, defaultMoves: false, movesSource: 'Bulbapedia', item; zMove (golpe que vira Z).
// Uso: node scripts/apply-bulbapedia-trainers.mjs <jogo>   (rede: ≥ 5 s por página nova; o cache fica em data-sources/)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { page, parties } from './lib/bulbapedia.mjs';

const gameId = process.argv[2];
// campo "game" do {{Party}} que vale para cada jogo do app
// (códigos por versão — Sw/Sh, OR/AS, Su/Mo… — quando o time muda entre as versões; "Y" e "E" ficam de fora: são Yellow e Emerald)
const CODES = { 'black-white': /^(BW|BWB2W2|B|W)$/, 'x-y': /^(XY|XYORAS|X)$/, 'omega-ruby-alpha-sapphire': /^(ORAS|XYORAS|OR|AS)$/, 'sun-moon': /^(SM|SMUSUM|Su|Mo|SUS|MUM)$/,
  'ultra-sun-ultra-moon': /^(USUM|SMUSUM|US|UM|SUS|MUM)$/, 'lets-go-pikachu-lets-go-eevee': /^PE$/, 'sword-shield': /^(SwSh|Sw|Sh)$/, 'brilliant-diamond-shining-pearl': /^(BDSP|BD|SP)$/,
  'legends-arceus': /^LA$/, 'scarlet-violet': /^(SV|Sc|V)$/, 'legends-za': /^ZA$/ };
if (!CODES[gameId]) { console.log(`[${gameId}] sem times na Bulbapedia configurados (jogos com decomp já têm golpes reais) — nada a fazer`); process.exit(0); }
const offline = process.argv.includes('--offline');
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const trFile = new URL(`../public/data/${gameId}-trainers.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const tr = JSON.parse(readFileSync(trFile, 'utf8'));
const key = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const base = (n) => n.replace(/-(alola|galar|hisui|paldea)(-.*)?$/, '').replace(/-(male|female|midday|midnight|dusk|.*-breed)$/, '');
const moveKey = new Map(Object.keys(data.moves).map((n) => [key(n), n]));
// nomes que não são pessoa ou que a Bulbapedia escreve de outro jeito
const SKIP = /^(Seu rival|Team (Magma|Aqua) Grunt|Paradise Protection Protocol|Jessie e James)/i;
const TITLE = { 'Tate e Liza': 'Tate and Liza', 'Professor Kukui': 'Kukui', 'AI Sada': 'Sada', 'AI Turo': 'Turo', 'Illima': 'Ilima', 'Wiksttrom': 'Wikstrom', Red: 'Red (game)', Blue: 'Blue (game)', Green: 'Green (game)', 'Boss Lysandre': 'Lysandre', 'Ingo – but tougher': 'Ingo' };
const pagesFor = (label) => {
  const name = label.replace(/\s*\(.*\)\s*$/, '').trim();
  if (SKIP.test(name)) return [];
  if (TITLE[name]) return [TITLE[name]];
  return name.split('/').map((n) => n.replace(/^(Battle Chatelaine|Subway Boss|Pro Wrestler|Boss)\s+/, '').trim()).flatMap((n) => (n.includes(' & ') ? n.split(' & ') : [n])).filter(Boolean);
};

const report = { matched: [], unmatched: [], missingMoves: [], pages: {} };
const cache = new Map();
async function partiesOf(title) {
  if (!cache.has(title)) {
    const text = await page(title, { offline });
    const ps = text && !/\{\{disambig/i.test(text) ? parties(text).filter((p) => CODES[gameId].test(p.game ?? '')) : [];
    report.pages[title] = text == null ? 'sem cache (offline)' : text === '' ? 'não existe' : ps.length ? `${ps.length} times` : 'sem time deste jogo';
    cache.set(title, ps);
  }
  return cache.get(title);
}
let changedMons = 0;
for (const t of tr.trainers) {
  if (!t.party?.some((p) => p.defaultMoves)) continue; // só times com golpes estimados
  let best = null;
  for (const title of pagesFor(t.label)) {
    let ps;
    try { ps = await partiesOf(title); } catch (e) { console.log(String(e.message)); process.exitCode = 2; break; }
    for (const party of ps) {
      const used = new Set();
      const pairs = t.party.map((p) => {
        const i = party.mons.findIndex((m, k) => !used.has(k) && key(m.species) === key(base(p.species)) && Math.abs((m.level ?? 0) - p.level) <= 3);
        if (i >= 0) used.add(i);
        return i >= 0 ? party.mons[i] : null;
      });
      const hits = pairs.filter(Boolean).length;
      if (hits >= Math.max(1, Math.ceil(t.party.length * 0.6)) && (!best || hits > best.hits)) best = { hits, pairs, title, party };
    }
  }
  if (process.exitCode === 2) break;
  if (!best) { report.unmatched.push(`${t.key} ${t.label}`); continue; }
  report.matched.push(`${t.key} ${t.label} ← ${best.title} (${best.party.section.at(-1) ?? ''}) ${best.hits}/${t.party.length}`);
  t.party.forEach((p, i) => {
    const m = best.pairs[i];
    if (!m) return;
    const moves = m.moves.map((mv) => moveKey.get(key(mv.name)));
    if (!moves.length || moves.some((x) => !x)) { report.missingMoves.push(`${t.label} ${p.species}: ${m.moves.map((mv) => mv.name).join(', ')}`); return; }
    p.moves = moves; p.defaultMoves = false; p.movesSource = 'Bulbapedia';
    if (m.held) p.item = m.held;
    const z = m.moves.find((mv) => mv.z);
    if (z) p.zMove = moveKey.get(key(z.name)); else delete p.zMove;
    changedMons++;
  });
  t.movesSource = 'Bulbapedia';
}
tr.movesSource = 'Bulbapedia (times dos chefes: golpes, item, golpe Z) — CC BY-NC-SA, fatos extraídos';
writeFileSync(trFile, JSON.stringify(tr));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-trainers.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}] Bulbapedia: ${report.matched.length} lutas com golpes reais (${changedMons} Pokémon); sem casar ${report.unmatched.length}; golpe fora do dataset ${report.missingMoves.length}`);
