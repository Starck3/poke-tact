// Gera public/data/pokedex.json: a Pokédex nacional (número + nome), juntando os datasets dos jogos.
// Serve só para o aviso do campo de oponente ("esse Pokémon é da Geração N, não existe neste jogo");
// as sugestões continuam usando apenas o dataset do jogo aberto.
// O script FALHA se faltar algum número entre 1 e o maior encontrado, ou se o mesmo número tiver dois nomes.
// Uso: node scripts/build-pokedex.mjs   (rodar depois de gerar/atualizar os datasets dos jogos)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const DATA = new URL('../public/data/', import.meta.url);
const byId = new Map();
for (const f of readdirSync(DATA)) {
  if (!f.endsWith('.json') || /-(acquisition|trainers|walkthrough)\.json$/.test(f) || f === 'games.json' || f === 'pokedex.json') continue;
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
