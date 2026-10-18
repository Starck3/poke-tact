# Guia de Recursos e Fontes de Dados para Desenvolvedores Pokémon

Este documento reúne uma lista de APIs, bancos de dados, repositórios open-source e ferramentas essenciais para validação cruzada de dados, cálculos mecânicos e integração de recursos para projetos sobre Pokémon.

---

## 1. Bases de Dados e Guias de Referência Completa

| Fonte | Descrição | Principais Casos de Uso |
| :--- | :--- | :--- |
| **Serebii.net** | Um dos maiores e mais antigos portais de notícias e dados de Pokémon. | Validação de taxas de encontro (*spawn rates*), mecânicas de gerações recentes, eventos, e detalhes específicos de itens. |
| **Bulbapedia** | Enciclopédia comunitária com detalhes extensos de *lore*, mecânicas internas e tabelas de aprendizado de golpes. | Verificação de histórico de mecânicas, IDs internos e detalhes estruturais do universo Pokémon. |
| **Pokémon Database** | Interface limpa e direta com dados consolidados de todas as gerações. | Rápida consulta de *stats* base, linhas evolutivas, efetividade de tipos e *learnsets*. |

---

## 2. Repositórios Open-Source e Código-Fonte (GitHub)

### A. Desmontagem e Engenharia Reversa (Jogos Oficiais)
- **`pret/pokeemerald` e `pret/pokered`**
  - **O que é:** Desmontagem em C/Assembly dos jogos originais (GBA/GB).
  - **Uso:** Fonte definitiva de verdade para fórmulas de captura, prioridades, probabilidade de acerto crítico e mecânicas originais das Gerações 1 a 3.
  - **Link:** `github.com/pret/pokeemerald` / `github.com/pret/pokered`

### B. Editores e Validadores de Legalidade
- **`kwsch/PKHeX`**
  - **O que é:** O editor de *saves* e estrutura de dados mais completo da comunidade (C#).
  - **Uso:** A biblioteca interna `PKHeX.Core` é excelente para validar se uma combinação de IV, EV, Pokébola, Golpe, ID ou Shininess é anatomicamente e legalmente válida no jogo.
  - **Link:** `github.com/kwsch/PKHeX`

### C. Estruturas de Dados Prontas (TypeScript / JSON)
- **`smogon/pokemon-showdown`**
  - **O que é:** O código-fonte do maior simulador de batalhas do mundo.
  - **Uso:** A pasta `data/` contém arquivos estruturados com estatísticas, golpes, itens, habilidades e aprendizado de movimentos (`learnsets.ts`, `moves.ts`, `pokedex.ts`).
  - **Link:** `github.com/smogon/pokemon-showdown`

- **`PokeAPI/pokeapi`**
  - **O que é:** O repositório contendo os dumps brutos em JSON/CSV mantidos pela comunidade PokéAPI.
  - **Uso:** Importação massiva de dados sem depender de limites de requisições à API pública.
  - **Link:** `github.com/PokeAPI/pokeapi`

---

## 3. Análise Competitiva, Mecânicas e Calculadoras

- **Smogon Strategy Dex & Fóruns**
  - **Uso:** Análise de mecânicas complexas, interações de habilidades, regreções de bugs e metagame competitivo de cada geração.
  - **Link:** `smogon.com/dex`

- **Calculadora de Dano do Showdown (`smogon/damage-calc`)**
  - **Uso:** Pacote NPM e repositório com o código responsável pelo cálculo exato de dano (STAB, clima, *screens*, modificadores de estágio de status, etc.).
  - **Biblioteca NPM:** `@smogon/calc`
  - **Link:** `github.com/smogon/damage-calc`

---

## 4. Assets Visuais e Outros Nichos

- **`pokesprite/pokesprite`**
  - **O que é:** Repositório com ícones de menu, sprites e gráficos padronizados de Pokémon e itens em PNG/SVG.
  - **Uso:** Padronização de assets visuais para interfaces.
  - **Link:** `github.com/msikma/pokesprite`

- **Pokémon TCG API (`pokemontcg.io`)**
  - **O que é:** API REST voltada ao Trading Card Game.
  - **Uso:** Busca de cartas colecionáveis, expansões, ilustrações e raridades.
  - **Link:** `pokemontcg.io`

---

## 5. Estratégia Sugerida para Validação de Dados

1. **Estatísticas Base e Aprendizado de Golpes:** Validar via `smogon/pokemon-showdown` ou `PokeAPI`.
2. **Cálculos de Batalha:** Utilizar a biblioteca `@smogon/calc`.
3. **Validação de Mecânicas Antigas:** Consultar os repositórios do grupo `pret`.
4. **Regras de Legalidade / Saves:** Consultar o ecossistema do `PKHeX.Core`.