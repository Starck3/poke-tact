// Gera public/data/pokedex.json: a Pokédex nacional (número + nome), juntando os datasets dos jogos.
// Serve só para o aviso do campo de oponente ("esse Pokémon é da Geração N, não existe neste jogo");
// as sugestões continuam usando apenas o dataset do jogo aberto.
// O script FALHA se faltar algum número entre 1 e o maior encontrado, ou se o mesmo número tiver dois nomes.
// Uso: node scripts/build-pokedex.mjs   (rodar depois de gerar/atualizar os datasets dos jogos)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const DATA = new URL('../public/data/', import.meta.url);
const byId = new Map();
for (const f of readdirSync(DATA)) {
  if (!f.endsWith('.json') || /-(acquisition|trainers|walkthrough)\.json$/.test(f) || f === 'games.json' || f === 'pokedex.json' || f === 'pokemon-games.json' || f === 'typecharts.json') continue;
  for (const { id, name, regionalForm } of JSON.parse(readFileSync(new URL(f, DATA), 'utf8')).pokemon ?? []) {
    if (regionalForm) continue; // formas regionais (id da variedade, 10091…) não são números da Pokédex
    if (byId.has(id) && byId.get(id) !== name) throw new Error(`#${id}: "${byId.get(id)}" x "${name}" (${f})`);
    byId.set(id, name);
  }
}
const max = Math.max(...byId.keys());
const missing = Array.from({ length: max }, (_, i) => i + 1).filter((id) => !byId.has(id));
if (missing.length) throw new Error(`faltam na Pokédex: #${missing.join(', #')}`);
// [[número, nome], ...] — compacto (é baixado pela página)
writeFileSync(new URL('pokedex.json', DATA), JSON.stringify([...byId].sort((a, b) => a[0] - b[0])));
console.log(`pokedex.json: ${byId.size} Pokémon (#1–#${max})`);

// public/data/pokemon-games.json: { nome: { jogo: [versões onde dá para obter] } } — busca de Pokémon da tela inicial
// ("onde capturar o Pikachu?") sem baixar os datasets dos 22 jogos. Inclui as formas regionais (rattata-alola).
const where = {};
for (const f of readdirSync(DATA)) {
  if (!f.endsWith('.json') || /-(acquisition|trainers|walkthrough)\.json$/.test(f) || ['games.json', 'pokedex.json', 'pokemon-games.json', 'typecharts.json'].includes(f)) continue;
  const d = JSON.parse(readFileSync(new URL(f, DATA), 'utf8'));
  if (!d.pokemon || !d.game) continue;
  for (const p of d.pokemon) {
    const vs = Object.entries(p.obtainable ?? {}).filter(([, ok]) => ok).map(([v]) => v);
    if (vs.length) (where[p.name] ??= {})[d.game.id] = vs;
  }
}
// nome → [nº da espécie, sprite] para as formas (o sprite da forma é o id da variedade)
const forms = {};
for (const f of readdirSync(DATA)) {
  if (!f.endsWith('.json') || /-(acquisition|trainers|walkthrough)\.json$/.test(f) || ['games.json', 'pokedex.json', 'pokemon-games.json', 'typecharts.json'].includes(f)) continue;
  for (const p of JSON.parse(readFileSync(new URL(f, DATA), 'utf8')).pokemon ?? []) if (p.regionalForm) forms[p.name] = [p.speciesId, p.id];
}
writeFileSync(new URL('pokemon-games.json', DATA), JSON.stringify({ where, forms }));
console.log(`pokemon-games.json: ${Object.keys(where).length} Pokémon com jogo onde obter (${Object.keys(forms).length} formas regionais)`);

// public/data/typecharts.json — busca por tipo da tela inicial (0.71.0) sem baixar os datasets dos 22 jogos:
//   charts: as tabelas de tipo DIFERENTES dos jogos (do próprio jogo, não digitadas: hoje Gen 1, Gen 2–5 e Gen 6+), cada uma
//           com as gerações e os jogos que a usam; games: jogo → índice da tabela
//   mons:   nome → [tipos em cada tabela] ("fire/flying"; "" = não existe naquela época). Vale o 1º jogo (na ordem do catálogo)
//           em que dá para obter o Pokémon — no Legends: Arceus o "Growlithe" é o de Hisui (Fogo/Pedra) e não deve valer para
//           a Gen 6+ inteira; com um jogo escolhido a tela usa os tipos do próprio jogo
const catalogGames = JSON.parse(readFileSync(new URL('games.json', DATA), 'utf8')).games.filter((g) => g.status === 'supported');
const charts = [], chartOf = {}, monsBy = [];
for (const g of catalogGames) {
  const d = JSON.parse(readFileSync(new URL(g.id + '.json', DATA), 'utf8'));
  const key = JSON.stringify([d.types, d.chart]);
  let i = charts.findIndex((c) => c.key === key);
  if (i < 0) { i = charts.push({ key, gens: [], games: [], types: d.types, chart: d.chart }) - 1; monsBy.push({}); }
  if (!charts[i].gens.includes(g.generation)) charts[i].gens.push(g.generation);
  charts[i].games.push(g.id);
  chartOf[g.id] = i;
  for (const p of d.pokemon) {
    const got = Object.values(p.obtainable ?? {}).some(Boolean), had = monsBy[i][p.name];
    if (!had || (!had.got && got)) monsBy[i][p.name] = { types: p.types.join('/'), got };
  }
}
const mons = {};
for (const name of new Set(monsBy.flatMap((m) => Object.keys(m)))) mons[name] = monsBy.map((m) => m[name]?.types ?? '');
writeFileSync(new URL('typecharts.json', DATA), JSON.stringify({ charts: charts.map(({ key, ...c }) => c), games: chartOf, mons }));
console.log(`typecharts.json: ${charts.length} tabelas de tipo (${charts.map((c) => 'Gen ' + c.gens.join(',')).join(' · ')}); ${Object.keys(mons).length} Pokémon`);
