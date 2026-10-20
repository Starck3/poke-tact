# Fontes para as Gens 5–9 — medição de 2026-10-19

Medição das fontes da lista do usuário (e do que apareceu no caminho) para decidir o que pode ser fonte da verdade nos jogos
que hoje só têm a PokéAPI. Método igual ao dos decomps de DS: abrir o repositório, achar os arquivos, ler o formato, conferir
valores conhecidos. Nada aqui foi usado ainda — é a base para a próxima etapa.

## Matriz por jogo

Legenda: ✓ serve como fonte · ◐ parcial (com ressalva) · ✗ não tem.

| Jogo | Espécies / learnset por jogo | Golpes (poder etc.) | Encontros selvagens | Fixos / presentes / iniciais | Treinadores | Itens e TMs no mapa |
|---|---|---|---|---|---|---|
| Black / White | PokéAPI; Showdown `gen5bw1` (conferir) | PokéAPI + Showdown | PokéAPI ✓ (com estações) | PokéAPI | ✗ (só disassemblies com arquivos da ROM — fora) | ✗ |
| **Black 2 / White 2** | **pokebw2 ✓** (ordem do jogo) | pokebw2 ✓ | **pokebw2 ✓** (por estação e versão) | pokebw2 ✓ (eventos, scripts) | **pokebw2 ✓ (815)** | pokebw2 (eventos — a medir) |
| X / Y | **PKHeX ✓** | PokéAPI + Showdown (PKHeX só PP/tipo) | PKHeX ◐ (espécie + nível, sem taxa) · PokéAPI ✓ | PKHeX ✓ | ✗ | ✗ |
| ORAS | PKHeX ✓ | idem | PKHeX ◐ · PokéAPI ✗ (quase sem grama) | PKHeX ✓ | ✗ | ✗ |
| Sun / Moon, USUM | PKHeX ✓ | idem | PKHeX ◐ (sem dia/noite) · PokéAPI ◐ (taxas somando 150%) | PKHeX ✓ | ✗ | ✗ |
| Let's Go | PKHeX ✓ · Showdown `gen7letsgo` (golpes próprios) | Showdown `gen7letsgo` ✓ | PKHeX ◐ (faixas de nível agregadas) | PKHeX ✓ | ✗ | ✗ |
| Sword / Shield | PKHeX ✓ | PokéAPI + Showdown | PKHeX ◐ (com clima) · PokéAPI ✓ | PKHeX ✓ | ✗ | ✗ |
| BDSP | PKHeX ✓ · Showdown `gen8bdsp` | idem | PKHeX ◐ · **PokéAPI ✗ (0)** | PKHeX ✓ | ✗ | ✗ (PokéAPI: só 17/100 TMs) |
| Legends: Arceus | PKHeX ✓ (+ mestria) | ✗ (ninguém modela a batalha do LA) | PKHeX ◐ · PokéAPI ✗ | PKHeX ✓ | ✗ | ✗ |
| Scarlet / Violet | PKHeX ✓ | PokéAPI + Showdown | PKHeX ◐ (horário/clima, mas sem separar S × V e com "crossover") · PokéAPI ✗ | PKHeX ✓ | ✗ | ✗ |
| Legends: Z-A | PKHeX ✓ | ✗ | PKHeX ◐ | PKHeX ✓ | ✗ | ✗ |

**Treinadores das Gens 6–9 não existem em nenhuma fonte em texto.** O pkNX (do mesmo autor do PKHeX) extrai, mas lendo o romfs
do jogo — fora da regra do projeto (não usamos ROMs).

## Por fonte

- **fuddlesworth/pokebw2** (GPL-3.0; novo — 2026-10-04 — e muito ativo: fixar commit). Decomp de B2/W2 que reconstrói as ROMs
  byte a byte; dados em JSON: `res/pokemon/<x>/data.json` (657), `res/moves/` (561), `res/trainers/data/*.json` (815),
  `res/field/encounters/*.json` (136, por estação/versão), `res/field/events`, trocas. **Melhor candidato: B2W2 no nível do DP.**
- **kwsch/PKHeX — PKHeX.Core** (GPL-3.0). Binários extraídos dos jogos pelo pkNX, com leitores simples em C#:
  `Resources/byte/personal/personal_<jogo>`, `lvlmove_*.pkl` (golpes + níveis na ordem do jogo), `eggmove_*`, `evos_*`,
  `encounter_*.pkl`, encontros fixos em `Legality/Encounters/Data/Gen6..9/Encounters*.cs`, nomes de lugares em
  `Resources/text/locations/`. Feito para legalidade: encontros sem taxa, com "crossover" e eventos misturados. Golpes: só PP e tipo.
- **smogon/pokemon-showdown** (MIT). Learnsets por jogo (`mods/gen5bw1`, `gen6xy`, `gen7sm`, `gen7letsgo`, `gen8bdsp`,
  `gen8legends`; base = B2W2/ORAS/USUM/SwSh/SV), golpes/tipos por geração, golpes próprios do Let's Go. Sem encontros nem
  treinadores. Armadilha: o arquivo base guarda só UM nível por golpe (Ivysaur Growl 1 e 3 → só 1). Caso suspeito: Bulbasaur
  em `gen7sm` (Vine Whip 9/7, Leech Seed sem nível) — conferir antes de usar.
- **PokéAPI** (já usada). Lacunas medidas: nenhum treinador; encontros 0 em BDSP, LA, SV; ORAS quase sem grama; SM/USUM sem
  dia/noite e taxas somando 150%; BDSP com 17/100 TMs; `order` do learnset preenchido em ~25% das linhas.
- **Não usar:** gradenGnostic/pokemoon (reconstrução do executável do Moon com IA, 5–16%, sem dados, sem licença);
  pokemondb/database (só valores atuais); veekun (parado em 2021, cópia da PokéAPI); squiddonaut/pokeblack e
  nds197/pokeblack2 (arquivos da ROM commitados = dados de dump).
- **Irrelevantes para dados:** Atmosphere, Skyline, armips, DSPRE (editor sobre ROM), spin-offs (Pinball, TCG, Mystery Dungeon,
  Colosseum/XD).

## Decisões pendentes (do usuário)

1. **Licença:** pokebw2 e PKHeX são GPL-3.0; o poke-tact não declara licença. Gerar `public/data` a partir deles pede definir
   como fica (atribuição + GPL no que for derivado, ou só usar para CONFERIR os dados da PokéAPI, como fazemos com o Showdown).
2. **Ordem sugerida:** (a) B2W2 pelo pokebw2 → "Verificado"; (b) PKHeX para espécies, learnsets, evoluções e encontros fixos das
   Gens 6–9 (corrige o que a PokéAPI erra; encontros selvagens só como lista de espécie/nível); (c) Showdown como 2ª conferência
   de learnsets e golpes do Let's Go. Treinadores das Gens 6–9 continuam sem fonte.
