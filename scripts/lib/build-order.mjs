import { GAMES } from '../games.mjs';

// S4 (PLANO-EXECUCAO-6): jogo que lê os dados de outro — remake pelo estágio do original (build-detonado-modern TWIN_STAGE),
// USUM pelo Sun/Moon (apply-bulbapedia-walkthrough), Z-A pelos golpes do Scarlet/Violet (movesFrom). O outro é montado antes
// quando os dois estão na lista; montando só o dependente, o arquivo do outro tem de existir.
export const DEPENDS = { 'omega-ruby-alpha-sapphire': ['ruby-sapphire'], 'brilliant-diamond-shining-pearl': ['diamond-pearl'], 'lets-go-pikachu-lets-go-eevee': ['yellow'], 'ultra-sun-ultra-moon': ['sun-moon'],
  ...Object.fromEntries(Object.entries(GAMES).filter(([, g]) => g.movesFrom).map(([id, g]) => [id, [g.movesFrom]])) };
export function buildOrder(list) {
  const want = new Set(list), out = [], seen = new Set();
  const visit = (id) => { if (seen.has(id)) return; seen.add(id); for (const d of DEPENDS[id] ?? []) if (want.has(d)) visit(d); out.push(id); };
  for (const id of list) visit(id);
  return out;
}
