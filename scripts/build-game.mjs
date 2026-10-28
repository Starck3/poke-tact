// Pipeline completo de um ou mais jogos: dados (PokeAPI) → correções do decomp → onde obter → treinadores → auditorias.
// Uso: node scripts/build-game.mjs [jogo ...]   (sem argumentos: todos os jogos de scripts/games.mjs)
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GAMES } from './games.mjs';
import { READERS } from './lib/pkhex-enc.mjs';

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GAMES);
const cwd = fileURLToPath(new URL('..', import.meta.url));
const STEPS = ['build-data', 'apply-decomp-overlay', 'build-trainers', 'build-acquisition', 'apply-bulbapedia-items', 'apply-breeding', 'build-walkthrough', 'validate-vs-decomp', 'validate-stats-vs-decomp', 'validate-vs-pokemythology', 'validate-tms-vs-pokemythology'];
// Gen 1/2 (decomp em assembly, game.asmDecomp): a auditoria roda DEPOIS da correção e deve dar 0; o detonado (build-walkthrough-gen1) serve às duas
const ASM_STEPS = {
  1: ['build-data', 'apply-gen1-overlay', 'validate-gen1-vs-decomp', 'build-trainers-gen1', 'build-acquisition-gen1', 'build-walkthrough-gen1'],
  2: ['build-data', 'apply-gen2-overlay', 'validate-gen2-vs-decomp', 'build-trainers-gen2', 'build-acquisition-gen2', 'apply-breeding', 'build-walkthrough-gen1'],
  hgss: ['build-data', 'apply-hgss-overlay', 'validate-hgss-vs-decomp', 'build-trainers-hgss', 'build-acquisition-hgss', 'apply-breeding', 'build-walkthrough-gen1'], // E1: HeartGold/SoulSilver parcial
  dp: ['build-data', 'apply-dp-overlay', 'validate-dp-vs-decomp', 'validate-dp-scripts', 'build-trainers-dp', 'build-acquisition-dp', 'apply-breeding', 'build-walkthrough-gen1'], // Diamond/Pearl (binários lidos pelo código do jogo)
  5: ['build-data', 'apply-gen5-overlay', 'validate-gen5-vs-decomp', 'build-trainers-gen5', 'build-acquisition-gen5', 'apply-bulbapedia-tms', 'apply-bulbapedia-items', 'apply-breeding', 'build-walkthrough-gen1'], // Black 2 / White 2 (fuddlesworth/pokebw2)
  4: ['build-data', 'apply-gen4-overlay', 'validate-gen4-vs-decomp', 'build-trainers-gen4', 'build-acquisition-gen4', 'apply-breeding', 'build-walkthrough-gen1'], // Platinum (decomp em JSON)
};
// camada PokéAPI (sem decomp): dados + conferência dos golpes com o Showdown (E3; o script ignora gerações fora de 5–8)
// + iniciais pelo detonado e pela PokéAPI (E4; sem as duas fontes o campo fica escondido)
// apply-breeding (depois do onde obter): ovos da creche nas Gens 2–4 com decomp — sai sem erro nos outros jogos
const PLAIN_STEPS = ['build-data', 'crosscheck-moves-showdown', 'build-starters-pokeapi'];
// + núcleo pelas tabelas do jogo extraídas pelo PKHeX (Black/White e Gens 6–9), auditado depois (tem que dar 0)
// + onde obter pelas tabelas de encontro do PKHeX (Black/White e Gens 6–9: os jogos com leitor em READERS)
// fill-pkhex-species: espécies do jogo que a PokéAPI não tem (Legends: Arceus, formas de Hisui) + loja de golpes;
// add-pkhex-forms: formas regionais (Alola, Galar, Hisui, Paldea) como entradas próprias; add-pkhex-megas: Megas do jogo
// (só nos jogos com Mega Evolução); apply-zmax-powers: poder dos golpes Z/Max (Showdown; só SM/USUM e SwSh)
// apply-pkhex-machines: TM/HM/TR do jogo; apply-pkhex-evos: método de evolução do jogo (troca, item, forma…)
const PKHEX_STEPS = ['apply-pkhex-overlay', 'fill-pkhex-species', 'add-pkhex-forms', 'add-pkhex-megas', 'apply-pkhex-machines', 'apply-pkhex-evos', 'apply-zmax-powers', 'validate-pkhex'];
// build-detonado-modern: treinadores, progresso por insígnia e aba Detonado a partir do detonado do PokeMythology
// apply-breeding depois do detonado: a creche e o ponto da história vêm do keyItems.daycare
// apply-bulbapedia-items: onde achar itens de evolução/Mega Stones (sem decomp) e os incensos que faltam (com decomp) —
// antes do apply-breeding (bebê de incenso); apply-bulbapedia-trainers: golpes reais, item e golpe Z dos chefes pela Bulbapedia (o time vem do detonado)
// build-trainers-bulbapedia: jogo sem detonado (USUM) ganha os treinadores pela Bulbapedia
const PKHEX_ACQ_STEPS = ['build-acquisition-pkhex', 'apply-bulbapedia-rates', 'apply-bulbapedia-exclusives', 'build-detonado-modern', 'build-trainers-bulbapedia', 'apply-bulbapedia-trainers', 'apply-bulbapedia-walkthrough', 'apply-bulbapedia-catchlimit', 'apply-bulbapedia-trades', 'apply-bulbapedia-items', 'apply-breeding']; // a ordem da história (walkthrough) antes dos itens: no USUM ela dá os estágios
// jogo que a PokéAPI não tem (Legends: Z-A): dataset inteiro das tabelas do PKHeX
// (o detonado e as etapas da Bulbapedia também: sem elas a reconstrução perdia a ordem da história e os golpes reais)
const PKHEX_ONLY_STEPS = ['build-data-pkhex', 'add-pkhex-forms', 'add-pkhex-megas', 'apply-pkhex-evos', 'validate-pkhex', ...PKHEX_ACQ_STEPS];
// todos os jogos, no fim: fotos dos lugares (detonado), mapa esquemático da região (decomp) e onde achar os itens de
// evolução citados no detonado (só jogos sem lista de itens do decomp); saem sem erro quando o jogo não tem a fonte
const IMAGE_STEPS = ['build-place-images', 'build-region-maps', 'build-evo-items'];
for (const id of ids) {
  if (!GAMES[id]) throw new Error(`Jogo desconhecido: ${id}`);
  console.log(`\n===== ${id} =====`);
  const plain = !GAMES[id].decomp && !GAMES[id].asmDecomp;
  const pk = GAMES[id].pkhex ? [...PKHEX_STEPS, ...(READERS[id] ? PKHEX_ACQ_STEPS : [])] : [];
  const steps = GAMES[id].asmDecomp ? ASM_STEPS[GAMES[id].asmDecomp.steps ?? GAMES[id].generation] : GAMES[id].pkhexOnly ? PKHEX_ONLY_STEPS : plain ? [...PLAIN_STEPS, ...pk] : STEPS;
  for (const step of [...steps, ...IMAGE_STEPS]) {
    console.log(`--- ${step}`);
    try {
      execFileSync(process.execPath, [`scripts/${step}.mjs`, id], { cwd, stdio: 'inherit' });
    } catch (e) {
      // build-data sai com 3 quando a PokéAPI não tem o jogo (Legends: Z-A): pula o jogo e segue com os outros
      if (step === 'build-data' && e.status === 3) { console.log(`(${id} sem dados — pulado)`); break; }
      throw e;
    }
  }
}
