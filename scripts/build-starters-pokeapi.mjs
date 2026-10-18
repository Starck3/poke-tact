// E4 — inicial do jogador nos jogos da camada PokéAPI (sem decomp). Duas fontes precisam concordar:
//   1) detonado do PokeMythology: a 1ª janela de texto (300 caracteres) que cita três espécies ainda não evoluídas, uma de
//      cada tipo Planta/Fogo/Água ("escolher entre 3 pokémons: Turtwig do tipo planta, Chimchar do tipo fogo ou Piplup…");
//   2) PokéAPI (dataset do jogo): as três existem no jogo, não são lendárias e têm linha de 3 estágios.
// Sem as duas → não grava nada (o app esconde o campo "Seu inicial").
// Uso: node scripts/build-starters-pokeapi.mjs <jogo>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { GAMES } from './games.mjs';

const gameId = process.argv[2];
const game = GAMES[gameId];
const wt = new URL(`../data-sources/pokemythology/${game?.walkthrough}.html`, import.meta.url);
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
// Diamond/Pearl (E5): decomp sem os iniciais em texto (estão num overlay em assembly) → também usa esta regra
if (!game || game.decomp || (game.asmDecomp && game.asmDecomp.steps !== 'dp') || !game.walkthrough || !existsSync(wt) || !existsSync(dataFile)) { console.log(`[${gameId}] fora do E4 (sem detonado ou jogo com decomp)`); process.exit(0); }
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const text = readFileSync(wt, 'utf8').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#\d+;|&\w+;/g, ' ').replace(/\s+/g, ' ');
const kids = (m) => data.pokemon.filter((p) => p.evolvesFrom === m.id);
const depth = (m) => Math.max(0, ...kids(m).map((k) => 1 + depth(k)));
const base = data.pokemon.filter((p) => !p.evolvesFrom && !p.legendary && depth(p) === 2);
const occ = [];
for (const p of base) for (const m of text.matchAll(new RegExp(`\\b${p.name.split('-')[0]}\\b`, 'gi'))) occ.push({ i: m.index, p });
occ.sort((a, b) => a.i - b.i);
let found = null;
for (const o of occ) {
  const win = occ.filter((x) => x.i >= o.i && x.i < o.i + 300);
  const trio = ['grass', 'fire', 'water'].map((t) => win.find((x) => x.p.types.includes(t))?.p);
  // e o trecho fala de ESCOLHA ("escolha/escolher", "inicial/iniciais") — o Legends: Arceus lista Turtwig/Chimchar/Piplup
  // entre "onde encontrar" antes de citar os iniciais de verdade
  const last = trio.every(Boolean) ? Math.max(...trio.map((p) => win.find((x) => x.p === p).i)) : o.i;
  const near = text.slice(Math.max(0, o.i - 150), last + 120);
  if (trio.every(Boolean) && new Set(trio.map((x) => x.name)).size === 3 && /escolh|inicia/i.test(near)) { found = { at: o.i, trio, ctx: text.slice(Math.max(0, o.i - 60), o.i + 160).trim() }; break; }
}
if (!found) { delete data.starters; writeFileSync(dataFile, JSON.stringify(data)); console.log(`[${gameId}] iniciais: não confirmados (campo escondido)`); process.exit(0); }
data.starters = { where: 'início do jogo (detonado)', level: null, species: found.trio.map((p) => p.name), source: `PokeMythology ${game.walkthrough} + PokéAPI (linha de 3 estágios)`, evidence: found.ctx };
writeFileSync(dataFile, JSON.stringify(data));
console.log(`[${gameId}] iniciais: ${data.starters.species.join(', ')} | "${found.ctx.slice(0, 160)}"`);
