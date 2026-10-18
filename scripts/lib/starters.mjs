// Inicial do jogador × variantes do rival e vagante — tudo derivado dos scripts/código do decomp.
// ATENÇÃO (erro evitado): os nomes das variantes NÃO seguem a mesma convenção entre jogos — no Emerald
// TRAINER_MAY_ROUTE_103_TREECKO é a luta de quem ESCOLHEU Treecko; no FRLG o valor 0 (Bulbasaur) leva ao rótulo
// "...Charmander" (o inicial DO RIVAL). Por isso a ligação é feita seguindo os scripts, nunca pelo nome.
import { parseBlocks, reachable } from './script-graph.mjs';

/** Índice do inicial (VAR_STARTER_MON) → espécie do jogador. */
export function starterByIndex(mapScripts, starterChooseC) {
  const out = {};
  for (const t of mapScripts) for (const m of t.matchAll(/setvar PLAYER_STARTER_NUM, (\d)\s*\n\s*setvar PLAYER_STARTER_SPECIES, SPECIES_(\w+)/g)) out[m[1]] = m[2];
  if (Object.keys(out).length) return out; // FRLG
  const list = starterChooseC?.match(/sStarterMons?\[[^\]]*\]\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? ''; // Emerald (gSpecialVar_Result = índice)
  [...list.matchAll(/SPECIES_(\w+)/g)].forEach((m, i) => (out[i] = m[1]));
  return out;
}

/** Treinador → valores de VAR_STARTER_MON em que ele aparece (seguindo goto_if_eq / switch…case até o trainerbattle). */
export function trainersByStarter(mapScripts, sharedBlocks = new Map()) {
  const result = {};
  for (const text of mapScripts) {
    const blocks = new Map([...sharedBlocks, ...parseBlocks(text)]);
    const branches = [];
    for (const m of text.matchAll(/(?:goto|call)_if_eq VAR_STARTER_MON, (\d), (\w+)/g)) branches.push([m[1], m[2]]);
    for (const sw of text.matchAll(/switch VAR_STARTER_MON\s*\n((?:\s*case \d, \w+\s*\n)+)/g)) for (const c of sw[1].matchAll(/case (\d), (\w+)/g)) branches.push([c[1], c[2]]);
    for (const [n, label] of branches) {
      // sem "queda" para o rótulo seguinte: num ramo de escolha ela levava à luta do inicial vizinho
      for (const l of reachable(blocks, label, { fallthrough: false })) for (const line of blocks.get(l)?.lines ?? []) {
        const tb = line.match(/^trainerbattle\w*\s+(TRAINER_\w+)/);
        if (tb) (result[tb[1]] ??= new Set()).add(n);
      }
    }
  }
  return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, [...v].sort()]));
}

/** Vagante conforme o inicial (roamer.c: switch (GetStarterSpecies()) { case SPECIES_X: a = SPECIES_Y; default: ... }). */
export function roamerByStarter(roamerC) {
  const body = roamerC.match(/GetRoamerSpecies\(\)[\s\S]*?switch \(GetStarterSpecies\(\)\)\s*\\?\s*\{([\s\S]*?)\}/)?.[1];
  if (!body) return null;
  const out = {};
  let pending = [];
  for (const line of body.split('\n')) {
    const c = line.match(/case SPECIES_(\w+):/);
    if (c) pending.push(c[1]);
    if (/default:/.test(line)) pending.push('*');
    const a = line.match(/a = SPECIES_(\w+);/);
    if (a) { for (const p of pending) out[p] = a[1]; pending = []; }
  }
  return out; // ex.: { '*': 'RAIKOU', BULBASAUR: 'ENTEI', CHARMANDER: 'SUICUNE' }
}
