# Poke Tact

Escolha o jogo Pokémon que você está jogando e o oponente (ou um treinador do jogo) e receba **3 sugestões de Pokémon para
vencer a luta**, usando só os Pokémon, golpes e regras **daquele jogo** — com o que você já consegue ter no seu ponto da
história.

- 22 jogos da série principal no catálogo, todos disponíveis.
- 11 jogos conferidos com o código do jogo (decomps do [pret](https://github.com/pret) e o
  [pokebw2](https://github.com/fuddlesworth/pokebw2)), com treinadores, onde obter cada Pokémon, progresso por insígnia e
  detonado dentro do app: Red/Blue, Yellow, Gold/Silver, Crystal, Ruby/Sapphire, Emerald, FireRed/LeafGreen, Diamond/Pearl,
  Platinum, HeartGold/SoulSilver, Black 2/White 2. No Diamond/Pearl e no HeartGold/SoulSilver parte dos
  dados está em binário no decomp (scripts em bytecode, eventos, encontros, NARCs) e é lida com as regras tiradas do próprio
  código do jogo.
- Black/White e Gens 6–9: treinadores, progresso por insígnia e aba Detonado a partir dos detonados do PokeMythology
  (times com espécie e nível); formas regionais, evoluções e TMs pelas tabelas do jogo. Núcleo (atributos, tipos, habilidades, golpes por nível na ordem do jogo) conferido com as tabelas
  do próprio jogo extraídas pelo [PKHeX](https://github.com/kwsch/PKHeX); nas Gens 6–9 também onde obter (local e nível, sem taxa)
  pelos encontros do PKHeX; Legends: Z-A montado inteiro pelas tabelas do PKHeX (a PokéAPI não tem o jogo). O resto, dados da
  PokéAPI com as regras da geração, golpes conferidos com o Pokémon Showdown.
- Cálculo de dano da geração (troca de golpes com nível, atributos, golpes reais do oponente e bônus de insígnia).

## Rodar

Requer **Node.js 22+** (sem dependências externas).

```bash
npm run serve      # http://localhost:5173
npm test           # testes de regressão e de consistência dos dados
```

Os dados já gerados estão em `public/data/` — o app funciona logo após clonar.

## Reconstruir os dados

```bash
npm run fetch:decomp -- <jogo>       # clone esparso do decomp pret fixado em scripts/games.mjs
node scripts/fetch-pokemythology.mjs <detonado>   # detonados (≥5 s entre requisições)
node scripts/fetch-showdown-moves.mjs              # golpes por geração (Gens 5–8)
npm run build:data -- <jogo>         # pipeline completo do jogo (sem argumento: todos)
npm run build:catalog
node scripts/build-benchmark.mjs     # banco de lutas: mede a qualidade das sugestões
```

As fontes brutas ficam em `data-sources/` e o cache da PokéAPI em `.cache/` — **fora do git** (ver abaixo).

## Regras do projeto

- **Não inventar dados.** O decomp do jogo é a fonte da verdade; PokéAPI é a base; tudo que diverge é auditado
  (`reports/<jogo>/`) e cada achado vira um teste em `test/regressions.test.mjs`.
- **Fontes externas com cuidado:** ≥5 s entre requisições, parar no primeiro bloqueio, respeitar robots.txt.
- **Nada de ROMs.** O projeto não usa nem distribui ROMs.
- **Conteúdo de terceiros** (decomps, detonados) é usado localmente para validação e não é redistribuído; o app cita as fontes.

## Documentação

- [`docs/STATUS.md`](docs/STATUS.md) — o que está pronto, jogo a jogo, e os limites conhecidos.
- [`docs/PLANO.md`](docs/PLANO.md) — planos executados e o que ainda falta.
- [`docs/ADICIONAR-JOGO.md`](docs/ADICIONAR-JOGO.md) — guia para portar um jogo, com todas as armadilhas de dados encontradas.

## Estrutura

```
public/            app (HTML + ES modules) e dados gerados (public/data/)
  engine.mjs       recomendação, onde obter, moveset padrão
  battle.mjs       fórmula de dano por geração e troca de golpes
scripts/           pipeline de dados (build-*, apply-*-overlay, validate-*, fetch-*)
test/              testes (node --test)
reports/           auditorias contra o decomp e banco de lutas
docs/              status, plano e guia de portabilidade
```

## Créditos

[PokéAPI](https://pokeapi.co/), [pret](https://github.com/pret) (decomps), [PokeMythology](https://www.pokemythology.net/)
(detonados em português), [Pokémon Showdown](https://github.com/smogon/pokemon-showdown). Pokémon e seus nomes são marcas da
Nintendo, Creatures Inc. e GAME FREAK inc.; este é um projeto pessoal de fã, sem fins comerciais.
