// Busca por tipo da tela inicial (0.71.0): o que vence o quê, pela tabela de tipos do próprio jogo
// (public/data/typecharts.json, gerada por build-pokedex.mjs a partir de `chart` de cada <jogo>.json).
// Funções puras — sem DOM — para os testes.
import { effectiveness } from './engine.mjs';

/** Multiplicador de um golpe do tipo `atk` contra um Pokémon com os tipos `def` (1 ou 2). */
export const mult = (chart, atk, def) => def.reduce((m, t) => m * (chart[atk]?.[t] ?? 1), 1);

// grupos na ordem em que a tela mostra
const ORDER = [4, 2, 1, 0.5, 0.25, 0];
const group = (pairs) => ORDER.map((m) => ({ mult: m, types: pairs.filter(([, x]) => x === m).map(([t]) => t) })).filter((g) => g.types.length);

/**
 * side 'enfrentar': `types` são do adversário.
 *   attack  — cada tipo de golpe contra ele (×4 … ×0)
 *   defense — cada tipo de Pokémon (um tipo só) contra os golpes do tipo dele: o pior multiplicador que ele leva
 *   best    — tipos que acertam ×2 ou mais E não levam ×2 dos tipos dele, do melhor para o pior
 * side 'usar': `types` são do seu Pokémon.
 *   attack  — cada tipo de Pokémon (um tipo só) contra os golpes do seu tipo: o melhor multiplicador que você tira
 *   defense — cada tipo de golpe contra você (×4 … ×0)
 *   best    — alvos: tipos que você acerta ×2 ou mais E que não te acertam ×2
 */
export function matchup({ types: all, chart }, types, side = 'enfrentar') {
  if (side === 'enfrentar') {
    const attack = all.map((t) => [t, mult(chart, t, types)]);
    const defense = all.map((t) => [t, Math.max(...types.map((a) => chart[a][t]))]);
    const best = all.map((t, i) => ({ type: t, atk: attack[i][1], def: defense[i][1] })).filter((x) => x.atk >= 2 && x.def < 2)
      .sort((a, b) => b.atk - a.atk || a.def - b.def);
    return { attack: group(attack), defense: group(defense), best };
  }
  const attack = all.map((t) => [t, Math.max(...types.map((a) => chart[a][t]))]);
  const defense = all.map((t) => [t, mult(chart, t, types)]);
  // o alvo do tipo t revida com golpe do tipo t: defense[i]
  const best = all.map((t, i) => ({ type: t, atk: attack[i][1], def: defense[i][1] })).filter((x) => x.atk >= 2 && x.def < 2)
    .sort((a, b) => b.atk - a.atk || a.def - b.def);
  return { attack: group(attack), defense: group(defense), best };
}

const total = (p) => Object.values(p.stats ?? {}).reduce((a, b) => a + b, 0);
/**
 * Pokémon do jogo para a busca por tipo (decisão do usuário: "Pokémon desse jogo com os melhores tipos").
 * 'enfrentar': quem acerta o adversário ×2+ com um tipo próprio (golpe do mesmo tipo) e não leva ×2 dos tipos dele;
 * 'usar': os alvos — quem o seu tipo acerta ×2+ e não te acerta ×2 com um tipo próprio.
 * Habilidade que anula um tipo (Levitate…) conta, como no resto do app (engine.effectiveness).
 * Só os que dá para obter em alguma versão; opções: só evolução final, sem lendários. Ordem: mais dano, menos risco, mais
 * atributos somados. Devolve [{ p, atk, def, versions }].
 */
export function monsFor(data, types, side = 'enfrentar', { finalOnly = true, legendary = false } = {}) {
  const foe = { types, abilities: [] };
  const out = [];
  for (const p of data.pokemon) {
    const versions = Object.entries(p.obtainable ?? {}).filter(([, ok]) => ok).map(([v]) => v);
    if (!versions.length || (finalOnly && !p.fullyEvolved) || (!legendary && p.legendary)) continue;
    const atk = side === 'enfrentar' ? Math.max(...p.types.map((t) => effectiveness(data, t, foe))) : Math.max(...types.map((t) => effectiveness(data, t, p)));
    const def = side === 'enfrentar' ? Math.max(...types.map((t) => effectiveness(data, t, p))) : Math.max(...p.types.map((t) => effectiveness(data, t, foe)));
    if (atk >= 2 && def < 2) out.push({ p, atk, def, versions });
  }
  return out.sort((a, b) => b.atk - a.atk || a.def - b.def || total(b.p) - total(a.p) || a.p.id - b.p.id);
}

// nomes em português (a busca aceita os dois; a tela mostra o do jogo, em inglês, como no resto do app)
export const TYPE_PT = { normal: 'normal', fire: 'fogo', water: 'água', electric: 'elétrico', grass: 'planta', ice: 'gelo', fighting: 'lutador', poison: 'venenoso', ground: 'terra', flying: 'voador', psychic: 'psíquico', bug: 'inseto', rock: 'pedra', ghost: 'fantasma', dragon: 'dragão', dark: 'sombrio', steel: 'aço', fairy: 'fada' };

/** Diferenças entre duas tabelas para os tipos escolhidos: [{ atk, def, from, to }] — aviso "na Gen 1 é diferente". */
export function chartDiffs(a, b, types, side = 'enfrentar') {
  const out = [];
  for (const t of a.types) {
    if (!b.types.includes(t)) continue;
    for (const x of types) {
      if (!a.types.includes(x) || !b.types.includes(x)) continue;
      const [atk, def] = side === 'enfrentar' ? [t, x] : [x, t];
      if (a.chart[atk][def] !== b.chart[atk][def]) out.push({ atk, def, from: b.chart[atk][def], to: a.chart[atk][def] });
    }
  }
  return out;
}
