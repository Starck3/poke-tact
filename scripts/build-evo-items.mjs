// Onde achar os itens de evolução (pedras, Metal Coat…) nos jogos SEM lista de itens do decomp (Black/White e Gens 6–9, que
// vêm do PKHeX): os trechos do detonado do PokeMythology que dizem onde o item é achado, ganho ou comprado →
// public/data/<jogo>-evoitems.json. É citação do detonado (com o trecho), não posição verificada no jogo.
//   • item = parâmetro da evolução no próprio jogo (evo.param com "ITEM" no método); nome em inglês, como o detonado escreve
//   • só frases com verbo de obter (achar, encontrar, ganhar, receber, comprar, vender, loja…) — "evolui com Thunder Stone"
//     não diz onde achar
// Uso: node scripts/build-evo-items.mjs <jogo>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { parseModernSections } from './lib/pokemythology-modern.mjs';

const gameId = process.argv[2];
const game = GAMES[gameId];
const wt = new URL(`../data-sources/pokemythology/${game?.walkthrough}.html`, import.meta.url);
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const out = new URL(`../public/data/${gameId}-evoitems.json`, import.meta.url);
if (!game?.walkthrough || !existsSync(wt) || !existsSync(acqFile)) { console.log(`[${gameId}] sem detonado local ou sem onde obter — nada a fazer`); process.exit(0); }
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
// itemsPartial: a lista veio da Bulbapedia (0.39.0), não do decomp — continua gerando as citações do detonado
if (acq.items && !acq.itemsPartial && Object.keys(acq.items).length) { console.log(`[${gameId}] itens já vêm do decomp (acquisition.items) — nada a fazer`); process.exit(0); }
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));

/** Itens de evolução do jogo: o parâmetro dos métodos com item (ITEM, TRADE_ITEM, HELD_ITEM_DAY, ITEM_MALE…). */
export function evoItems(pokemon) {
  return [...new Set(pokemon.filter((p) => /ITEM/.test(p.evo?.kind ?? '') && typeof p.evo.param === 'string').map((p) => p.evo.param))].sort();
}
/** "THUNDER_STONE" / "THUNDERSTONE" → regex que acha "Thunder Stone", "Thunderstone", "King's Rock", "Up-Grade" — com
 *  maiúscula no começo, como nome de item ("um upgrade no Mega Ring" não é o Up-Grade). */
export function itemRegex(param) {
  const letters = param.toLowerCase().replace(/[^a-z]/g, '').split('');
  return new RegExp('\\b' + letters.map((c, i) => (i ? '[' + c + c.toUpperCase() + ']' : c.toUpperCase())).join("[\\s\\-'’]?") + 's?\\b');
}
/** "Fire/Water/Thunder Stone" → "Fire Stone/Water Stone/Thunder Stone" (ORAS: a troca de Shards). */
// "Charizardite X e Y" (Let's Go) → "Charizardite X e Charizardite Y": sem isso a Charizardite Y não tinha citação
export const expandSlashes = (t) => t.replace(/\b((?:[A-Z][a-z]+\/)+[A-Z][a-z]+) (Stone|Shard)s?\b/g, (m, list, noun) => list.split('/').map((w) => w + ' ' + noun).join('/'))
  .replace(/\b([A-Z][a-z]+ite) ([XYZ]) e ([XYZ])\b/g, (m, stone, a, b) => `${stone} ${a} e ${stone} ${b}`);
const GET = /\b(ach\w*|encontr\w*|peg\w*|ganh\w*|receb\w*|compr\w*|vend\w*|loja\w*|ch[ãa]o|escondid\w*|presente\w*|pr[êe]mio\w*|d[áa]|dar[áa]|entrega\w*|troca\w* (?:por|pel)\w*|coletar|obt\w*)/i;

const strip = (h) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&#8217;|&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '–').replace(/\s+/g, ' ').trim();
const sections = parseModernSections(readFileSync(wt, 'utf8'));
const items = {};
// Mega Stones (add-pkhex-megas): a chave é o nome da pedra ("Charizardite X") — o simulador mostra onde achar
const megaStones = [...new Set(data.pokemon.flatMap((p) => (p.megas ?? []).map((m) => m.stone)))].sort();
for (const param of [...evoItems(data.pokemon), ...megaStones]) {
  const re = itemRegex(param), seen = new Set();
  for (const s of sections) {
    // frases do trecho que citam o item com um verbo de obter
    for (const sentence of expandSlashes(strip(s.html)).split(/(?<=[.!?])\s+/)) {
      // LA: "é possível evoluir Eevee para Leafeon aqui sem precisar da Leaf Stone" não diz onde achar a pedra
      if (!re.test(sentence) || !GET.test(sentence) || /sem precisar|não precisa/i.test(sentence) || sentence.length > 400) continue;
      const key = (s.full ?? s.title) + '|' + sentence;
      if (seen.has(key)) continue;
      seen.add(key);
      (items[param] ??= []).push({ section: s.full ?? s.title, text: sentence, stage: acq.progress?.sectionStage?.[s.title] ?? null });
    }
  }
}
// mantém as linhas da Bulbapedia (apply-bulbapedia-items roda antes, no fluxo do jogo)
const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
writeFileSync(out, JSON.stringify({
  source: `PokeMythology ${game.walkthrough}`, page: `https://www.pokemythology.net/detonados/${game.walkthrough}/`,
  note: 'Trechos do detonado que citam onde achar o item — não é posição verificada no jogo.', items,
  ...(prev.bulbapedia && { bulbapedia: prev.bulbapedia, bulbapediaSource: prev.bulbapediaSource }),
}));
// item sem fonte da Bulbapedia (acq.itemsPartial: não bloqueava a evolução) mas citado no detonado → entra em acq.items com o
// estágio do trecho que o cita (Auspicious Armor no Scarlet/Violet: trecho de Zapapico — antes o Armarouge saía no começo)
if (acq.itemsPartial) {
  acq.items ??= {};
  for (const [p, list] of Object.entries(acq.items)) { const keep = list.filter((x) => x.type !== 'cited'); if (keep.length) acq.items[p] = keep; else delete acq.items[p]; } // idempotente
  for (const [param, cites] of Object.entries(items)) {
    if (acq.items[param]?.length) continue;
    const staged = cites.filter((c) => Number.isInteger(c.stage));
    if (staged.length) acq.items[param] = staged.map((c) => ({ type: 'cited', where: c.section.toLowerCase().replace(/(^|\s)(\S)/g, (m, x, y) => x + y.toUpperCase()), stage: c.stage }));
  }
  writeFileSync(acqFile, JSON.stringify(acq));
}
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
const all = [...evoItems(data.pokemon), ...megaStones]; // itens de evolução + Mega Stones (a conta "x/y" usa os dois)
writeFileSync(new URL(`../reports/${gameId}/evo-items.json`, import.meta.url), JSON.stringify({ withMentions: Object.keys(items).length, total: all.length, without: all.filter((p) => !items[p]) }, null, 1));
console.log(`[${gameId}] itens de evolução citados no detonado: ${Object.keys(items).length}/${all.length}`);
