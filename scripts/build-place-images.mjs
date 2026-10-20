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
let found = 0;
for (const where of [...all].sort()) {
  const base = where.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const r = placeStage(tl, base) ?? placeStage(tl, where);
  // só trecho cujo TÍTULO nomeia o lugar: citação no texto leva a fotos de outro lugar (SM: "Route 1" citada no trecho de
  // Ten Carat Hill) — melhor sem foto do que com foto errada
  if (!r || r.by !== 'título') continue;
  const sec = sections.find((s) => s.title === r.section);
  if (!sec) continue;
  let imgs = screenshots(sec.html);
  if (!imgs.length) continue;
  // o arquivo cujo nome cita o lugar vem primeiro (mapas/fotos da própria área)
  const k = words(base).join('');
  imgs = [...imgs.filter((u) => k.length >= 4 && fileKey(u).includes(k.slice(0, Math.max(4, k.length - 2)))), ...imgs.filter((u) => !(k.length >= 4 && fileKey(u).includes(k.slice(0, Math.max(4, k.length - 2)))))];
  places[where] = { section: sec.full ?? sec.title, by: r.by, images: imgs.slice(0, 4) };
  found++;
}
writeFileSync(new URL(`../public/data/${gameId}-places.json`, import.meta.url), JSON.stringify({
  source: `PokeMythology ${game.walkthrough}`, page: PAGE,
  credit: 'Imagens do detonado do PokeMythology (pokemythology.net), exibidas a partir do site deles.', places,
}));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/place-images.json`, import.meta.url), JSON.stringify({ withImages: found, total: all.size, without: [...all].filter((w) => !places[w]) }, null, 1));
console.log(`[${gameId}] fotos dos lugares: ${found}/${all.size} locais com imagem do detonado`);
