// Busca do Pokémon oponente (sem DOM): autocompletar só com os Pokémon do jogo aberto e aviso quando o nome
// digitado é de outra geração ou não aparece no jogo. Usada pela tela do jogo e pelos testes.
import { humanize } from './engine.mjs';
import { roman } from './catalog.mjs';

/** Chave de comparação: sem acento, maiúsculas, espaço ou pontuação — "Mr. Mime" e "mr-mime" viram "mrmime". */
export const nameKey = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// último número da Pokédex nacional de cada geração (I…IX)
const GEN_LAST = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
/** Geração em que o Pokémon estreou, pelo número da Pokédex nacional. */
export const generationOfDex = (id) => GEN_LAST.findIndex((last) => id <= last) + 1 || null;

// chaves de um Pokémon: o slug e o nome da tela ("rattata-alola" e "Rattata de Alola")
const keysOf = (p) => [nameKey(p.name), nameKey(humanize(p.name))];

/** O Pokémon do jogo com esse nome (aceita "Mr. Mime", "mr mime", "mr-mime"), ou undefined. */
export function findOpponent(pokemon, query) {
  const k = nameKey(query);
  return k ? pokemon.find((p) => keysOf(p).includes(k)) : undefined;
}

/** Sugestões do autocompletar: só Pokémon do jogo; começa com o texto primeiro, depois contém; "25" ou "#25" busca pelo número. */
export function searchOpponents(pokemon, query, limit = 8) {
  const q = String(query ?? '').trim();
  const num = q.match(/^#?(\d+)$/);
  // forma regional: número da espécie (Rattata de Alola = #19)
  if (num) return pokemon.filter((p) => String(p.speciesId ?? p.id).startsWith(num[1])).sort((a, b) => (a.speciesId ?? a.id) - (b.speciesId ?? b.id) || a.id - b.id).slice(0, limit);
  const k = nameKey(q);
  if (!k) return [];
  const starts = [], has = [];
  for (const p of pokemon) { const ns = keysOf(p); if (ns.some((n) => n.startsWith(k))) starts.push(p); else if (ns.some((n) => n.includes(k))) has.push(p); }
  return [...starts.sort((a, b) => a.id - b.id), ...has.sort((a, b) => a.id - b.id)].slice(0, limit);
}

/**
 * Aviso para o que foi digitado, ou null quando não há o que avisar (vazio, Pokémon do jogo ou ainda há sugestões).
 * pokedex = [[número, nome], ...] da Pokédex nacional (data/pokedex.json); sem ela, o aviso fica genérico.
 */
export function opponentWarning({ pokemon, pokedex = null, generation, gameLabel }, query) {
  const k = nameKey(query);
  if (!k || findOpponent(pokemon, query) || /^#?\d+$/.test(String(query).trim())) return null;
  const nat = pokedex?.find(([, n]) => nameKey(n) === k);
  if (nat) {
    const [id, n] = nat, g = generationOfDex(id);
    return g > generation
      ? { kind: 'newer', text: `${humanize(n)} é da Geração ${roman(g)} — ainda não existia em Pokémon ${gameLabel} (Geração ${roman(generation)}).` }
      : { kind: 'absent', text: `${humanize(n)} (Geração ${roman(g)}) não aparece em Pokémon ${gameLabel}.` };
  }
  if (searchOpponents(pokemon, query, 1).length) return null; // ainda digitando: as sugestões do jogo bastam
  const other = pokedex?.find(([, n]) => nameKey(n).startsWith(k));
  return other
    ? { kind: 'newer', text: `Nenhum Pokémon de ${gameLabel} começa com “${String(query).trim()}”. ${humanize(other[1])}, por exemplo, é da Geração ${roman(generationOfDex(other[0]))}.` }
    : { kind: 'unknown', text: `Nenhum Pokémon chamado “${String(query).trim()}”. Confira o nome — as sugestões mostram só os Pokémon de ${gameLabel}.` };
}
