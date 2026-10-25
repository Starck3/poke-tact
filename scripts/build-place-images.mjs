// Fotos dos lugares de captura: para cada local do "onde obter" (<jogo>-acquisition.json), as capturas de tela do trecho do
// detonado do PokeMythology que fala desse lugar → public/data/<jogo>-places.json. Guarda só a REFERÊNCIA (endereço da
// imagem no site deles, trecho e crédito) — as imagens são do PokeMythology e não são copiadas para o repositório.
//   • trecho = seção cujo título nomeia o lugar (placeStage, o mesmo do progresso); sem título, o 1º trecho que o cita
//   • imagem cujo NOME de arquivo cita o lugar vence ("mtmoon1.png" para Mt. Moon, "icepath2.png" para Ice Path)
//   • ficam de fora sprites de Pokémon/treinador (serebii, /sprites/), ícones e anúncios
// Uso: node scripts/build-place-images.mjs <jogo>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { parseModernSections } from './lib/pokemythology-modern.mjs';
import { words, placeStage } from './lib/progress.mjs';

const gameId = process.argv[2];
const game = GAMES[gameId];
const wt = new URL(`../data-sources/pokemythology/${game?.walkthrough}.html`, import.meta.url);
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
if (!game?.walkthrough || !existsSync(wt) || !existsSync(acqFile)) { console.log(`[${gameId}] sem detonado local ou sem onde obter — nada a fazer`); process.exit(0); }
const html = readFileSync(wt, 'utf8');
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
const PAGE = `https://www.pokemythology.net/detonados/${game.walkthrough}/`;

/** Capturas de tela de um trecho de HTML, com endereço absoluto (o detonado usa caminhos "/conteudo/…"). */
export function screenshots(sectionHtml) {
  const out = [];
  for (const m of sectionHtml.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
    let src = m[1].replace(/&#0?38;/g, '&');
    if (!/\.(jpe?g|png|gif)(\?|$)/i.test(src)) continue;
    if (/serebii|\/sprites\/|\/pokemon\/|trainer\d*\.png|gravatar|emoji|logo|banner|icon|adsby|pokebola|\/itens?\//i.test(src)) continue;
    if (src.startsWith('//')) src = 'https:' + src;
    else if (src.startsWith('/')) src = 'https://www.pokemythology.net' + src;
    if (!out.includes(src)) out.push(src);
  }
  return out;
}

const sections = parseModernSections(html);
const strip = (h) => h.replace(/<[^>]+>/g, ' ');
const tl = { sections: sections.map((s) => ({ title: s.title, at: s.at, words: words(s.title), text: words(strip(s.html)), stage: 0 })) };
tl.chunks = tl.sections;
const fileKey = (src) => decodeURIComponent(src.split('?')[0].split('/').pop()).toLowerCase().replace(/\.\w+$/, '').replace(/[^a-z0-9]/g, '');

const places = {};
const all = new Set();
for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) if (s.where) all.add(s.where);
const baseOf = (where) => where.replace(/\s*\(.*?\)\s*/g, ' ').trim();
/** Chaves do lugar para o nome do arquivo: o nome e os prefixos de 2+ palavras, sem o andar ("Ice Path B1F" → icepathb1f,
 *  icepathb, icepath; "Mount Mortar" = mtmortar). Uma palavra só nunca ("route", "celadon" = outro lugar da cidade). */
export function stemsOf(where) {
  const w = words(baseOf(where)).map((x) => (x === 'mount' ? 'mt' : x));
  const out = [];
  for (let n = w.length; n >= 2; n--) { const k = w.slice(0, n).join(''); if (k.length >= 6) out.push(k); }
  return out;
}
/** O nome do arquivo cita o lugar por inteiro ("icepath2.png" → Ice Path; "route4black.png" → Route 4, não Route 40). */
export function fileNames(src, ks) {
  const f = fileKey(src);
  for (const k of ks) for (let i = f.indexOf(k); i >= 0; i = f.indexOf(k, i + 1)) if (!(/\d$/.test(k) && /\d/.test(f[i + k.length] ?? ''))) return true;
  return false;
}
const allStems = [...new Set([...all].flatMap(stemsOf))];
// a foto cujo nome cita OUTRO lugar (e não este) não é deste lugar (GS: as fotos "icepath*.png" no trecho de Blackthorn)
const otherPlace = (u, ks) => !fileNames(u, ks) && allStems.some((o) => !ks.some((k) => k.includes(o)) && fileNames(u, [o]));
const everyImg = sections.flatMap((s) => screenshots(s.html).map((u) => ({ u, sec: s })));
let found = 0, byFile = 0, dropped = 0;
for (const where of [...all].sort()) {
  const base = baseOf(where), k = stemsOf(where);
  const r = placeStage(tl, base) ?? placeStage(tl, where);
  // trecho cujo TÍTULO nomeia o lugar: citação no texto leva a fotos de outro lugar (SM: "Route 1" citada no trecho de
  // Ten Carat Hill) — melhor sem foto do que com foto errada
  const sec = r?.by === 'título' ? sections.find((s) => s.title === r.section) : null;
  let imgs = sec ? screenshots(sec.html) : [];
  const n = imgs.length;
  imgs = imgs.filter((u) => !otherPlace(u, k));
  dropped += n - imgs.length;
  if (imgs.length) {
    // o arquivo cujo nome cita o lugar vem primeiro (mapas/fotos da própria área)
    const w1 = words(base).join(''), own = (u) => fileNames(u, k) || (w1.length >= 4 && fileKey(u).includes(w1.slice(0, Math.max(4, w1.length - 2)))); // "Violet" → 019violet.png
    imgs = [...imgs.filter(own), ...imgs.filter((u) => !own(u))];
    places[where] = { section: sec.full ?? sec.title, by: r.by, images: imgs.slice(0, 4) };
    found++;
    continue;
  }
  // sem trecho com o título: só imagens cujo NOME de arquivo cita o lugar, em qualquer trecho ("mtmoon1.png")
  const hit = everyImg.filter((x) => fileNames(x.u, k));
  if (!hit.length) continue;
  places[where] = { section: hit[0].sec.full ?? hit[0].sec.title, by: 'arquivo', images: [...new Set(hit.map((x) => x.u))].slice(0, 4) };
  found++; byFile++;
}
// lugar sem nenhuma foto no detonado: imagem de outra fonte, por referência e com crédito (só quando o detonado não tem).
// Blackthorn (GS/Crystal): o trecho do detonado só tem fotos do Ice Path (tiradas acima) e o PokeMythology não tem foto da
// cidade nesses jogos — o mapa da cidade da Bulbapedia (Blackthorn_City_GSC.png), conferido a olho: ginásio, lago, Mart, PC
const BULBA_BLACKTHORN = { section: 'Blackthorn City', by: 'outra fonte', credit: 'Bulbapedia', page: 'https://bulbapedia.bulbagarden.net/wiki/Blackthorn_City', images: ['https://archives.bulbagarden.net/media/upload/f/fa/Blackthorn_City_GSC.png'] };
const EXTRA = { 'gold-silver': { 'Blackthorn City': BULBA_BLACKTHORN }, crystal: { 'Blackthorn City': BULBA_BLACKTHORN } };
for (const [where, p] of Object.entries(EXTRA[gameId] ?? {})) if (all.has(where) && !places[where]) { places[where] = p; found++; }
writeFileSync(new URL(`../public/data/${gameId}-places.json`, import.meta.url), JSON.stringify({
  source: `PokeMythology ${game.walkthrough}`, page: PAGE,
  credit: 'Imagens do detonado do PokeMythology (pokemythology.net), exibidas a partir do site deles.', places,
}));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/place-images.json`, import.meta.url), JSON.stringify({ withImages: found, total: all.size, without: [...all].filter((w) => !places[w]) }, null, 1));
console.log(`[${gameId}] fotos dos lugares: ${found}/${all.size} locais com imagem do detonado (${byFile} pelo nome do arquivo; ${dropped} fotos de outro lugar tiradas)`);
