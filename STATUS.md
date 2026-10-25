# Poke Tact — status e pendências

Atualizado em 2026-10-20 · versão **0.25.0** (publicada no GitHub).
Leia junto com `CHANGELOG.md` (o que mudou em cada versão) e `docs/ADICIONAR-JOGO.md` (como cada dado é obtido e as armadilhas
já encontradas).

## Como está cada jogo

**Selo "Verificado"**: dados conferidos com o código do jogo (decomp). **Selo "Parcial"**: núcleo pelas tabelas do jogo
extraídas pelo PKHeX; treinadores e progresso vêm do detonado do PokeMythology.

| Jogo | Ger. | Fonte do núcleo | Onde obter | Progresso por insígnia | Treinadores | Aba Detonado | Fora do cálculo (aviso na tela) |
|---|---|---|---|---|---|---|---|
| Red/Blue, Yellow | 1 | decomp (pret) | decomp | sim | decomp (golpes reais) | sim | — |
| Gold/Silver, Crystal | 2 | decomp (pret) | decomp | sim | decomp | sim | — |
| Ruby/Sapphire, Emerald, FireRed/LeafGreen | 3 | decomp (pret) | decomp | sim | decomp | sim | — |
| Diamond/Pearl, Platinum, HeartGold/SoulSilver | 4 | decomp (pret; binários lidos pelo código) | decomp | sim | decomp | sim | — |
| Black 2/White 2 | 5 | decomp (pokebw2) | decomp | sim | decomp | sim | — |
| Black/White | 5 | PKHeX | PKHeX | sim | detonado (golpes estimados) | sim | — |
| X/Y, Omega Ruby/Alpha Sapphire | 6 | PKHeX | PKHeX | sim | detonado | sim | Mega Evolução |
| Sun/Moon | 7 | PKHeX | PKHeX | sim (provações + grandes provações) | detonado | sim | Mega, golpes Z |
| **Ultra Sun/Ultra Moon** | 7 | PKHeX | PKHeX | **não** | **não** | **não** | Mega, golpes Z |
| Let's Go Pikachu/Eevee | 7 | PKHeX | PKHeX | sim | detonado | sim | Mega Evolução |
| Sword/Shield | 8 | PKHeX | PKHeX | sim | detonado | sim | Dynamax/Gigantamax |
| Brilliant Diamond/Shining Pearl | 8 | PKHeX | PKHeX | sim | detonado | sim | — |
| Legends: Arceus | 8 | PKHeX | PKHeX | sim (5 nobres) | detonado | sim | estilos ágil/forte, valores próprios de golpes |
| Scarlet/Violet | 9 | PKHeX | PKHeX | sim | detonado | sim | Terastal |
| Legends: Z-A | 9 | PKHeX (sem PokéAPI) | PKHeX | sim (rank Z → A) | detonado | sim | tempo real, Mega, valores próprios de golpes |

A tela inicial busca Pokémon (padrão: em que jogos dá para obter) ou líder/jogo (seletor ao lado do campo).
Todos os jogos têm a aba **Onde capturar** (todos os locais de um Pokémon na versão, com o ponto da história), com fotos do
lugar (detonado do PokeMythology, por referência) e o mapa esquemático da região com o lugar destacado (14 jogos: Gens 1–4
com decomp, BDSP, ORAS e Let's Go pela região do original). A aba Detonado também mostra as fotos e o mapa de cada etapa.
Tags no app: "📖 detonado no app" e "📍 capturas disponíveis". Novidades: botão 🔔 no canto (link `#/?novidades`), lido do CHANGELOG.
Também feito nos jogos sem decomp (Gens 5–9): formas regionais como Pokémon próprios (Alola, Galar, Hisui, Paldea), evoluções
do próprio jogo (troca, item, forma, impossíveis no jogo), TMs pelas tabelas do jogo e as espécies de Hisui do Legends: Arceus.
Testes: `npm test` (238 com `data-sources/`, 223 num clone limpo como o CI). Banco de lutas: 20 jogos, 99% das sugestões vencem.

## O que falta (do mais importante para o menos)

### Próxima etapa (anotada pelo usuário em 2026-10-25)
- **Trabalho grande no simulador de luta** (item 15): Mega Evolução, golpes Z, Dynamax, Terastal e as batalhas diferentes
  do Legends: Arceus e do Z-A. Hoje o app só avisa que esses jogos têm essas mecânicas.
- Os 5 pontos que esperavam decisão do usuário já foram resolvidos na 0.24.0. Depois do simulador, o ganho mais visível é
  a **creche no Black 2/White 2** ou os **itens de evolução do Sword/Shield** (item 13).
- ✅ (0.25.0) **Pokémon do jogo por tipo**: ao escolher o jogo, ver todos os Pokémon dele separados por tipo e ir filtrando.

### Dá para fazer com as fontes que já temos
1. ✅ (0.16.0) **Estágio pela citação anterior no detonado (jogos com decomp).** O detonado descreve áreas opcionais numa seção do
   pós-jogo; a regra atual ("título vence") marca como pós-jogo lugares que abrem antes: Safari Zone de Hoenn (RSE, citada em
   Fortree, estágio 6), Power Plant do FRLG (citada em "Agora você tem Surf!", estágio 6), Abandoned Ship, Tin Tower… A lista
   está em `acq.progress.reviewEarlierMention` de cada jogo (centenas de mapas). Aceitar a citação anterior direto erraria
   Silver Cave (Crystal) e Viridian City (Gold/Silver). Plano: aceitar só quando um mapa vizinho (conexão/warp do decomp) já
   está liberado naquele estágio; mexe nos 7 `build-acquisition*` (gen1, gen2, gen3, gen4, dp, hgss, gen5) + testes.
2. ✅ **Sun/Moon — provação da Mina (Fairium)**: não é pendência — no SM ela entrega o Fairium sem provação (o detonado diz).
3. ✅ (0.17.0) **Legends: Z-A — o rival/companheiro (Urbain/Taunie) e as lutas com inicial genérico** ("Chikorita/Tepig/Totodile").
4. ✅ (0.17.0) **Rival com "inicial" genérico** ("[chespin][fennekin][froakie] inicial lv.5"): esse Pokémon fica fora do time. Dá para
   montar uma variante por inicial do jogador, mas a regra (o rival pega o forte ou o fraco contra o seu?) muda por jogo e
   precisa vir do texto.
5. ⚠ (0.18.0: BDSP, Let's Go e ORAS resolvidos pelo jogo original) **Locais "Fora do detonado"** (sem posição na história): BDSP 25, Sword/Shield 19, Let's Go 15, Black/White 14, Sun/Moon 9,
   ORAS 4, Scarlet/Violet 4, X/Y 1 (ver `reports/<jogo>/detonado-modern.json` → `placesWithoutStage`). Ideias: nomes em
   português no detonado, cidades vizinhas, nível dos selvagens comparado aos líderes (seria estimativa — marcar como tal).
6. ✅ (0.19.0) **Black 2/White 2 — Hidden Grottoes pelo PKHeX** em vez da PokéAPI. O PKHeX tem as espécies, mas não diz em que rota fica
   cada gruta (manteria a rota da PokéAPI).
7. ✅ (0.20.0: BW, B2W2 e cavernas do FRLG feitos) **Mapa da região**: falta
   X/Y, Sun/Moon/USUM, Sword/Shield, Legends: Arceus, Scarlet/Violet e Z-A (sem decomp). FRLG: cavernas e florestas sem
   posição no `region_map_sections.json` (99/142).
8. ✅ (0.21.0: também pelo nome do arquivo da imagem; RB, GS, Crystal, HGSS e FRLG subiram) **Fotos dos lugares** só onde o
   título do trecho do detonado é o próprio lugar (ex.: X/Y 16/44, SV 15/76, Z-A 3/106). Nos jogos modernos as imagens têm
   nome numérico/do imgur — sem evidência no nome, continuam sem foto (melhor que foto errada).

### Depende de fonte que não temos
9. **Ultra Sun/Ultra Moon** — o PokeMythology não tem detonado desse jogo: sem treinadores, progresso e Detonado.
10. **Golpes reais dos treinadores nas Gens 5–9 sem decomp** — o detonado traz espécie e nível; os golpes são estimados pelo
   moveset do nível. Nenhuma fonte em texto disponível tem os golpes escolhidos dos chefes.
11. **Treinadores comuns de rota nas Gens 5–9** — só existem as lutas que o detonado transcreve.
12. **Onde obter sem taxa de aparição** (Gens 5–9) e com métodos misturados: nas Gens 6/7 grama, surf e varas vêm numa lista
    só; no BDSP, Poké Radar e surto vêm dentro da grama (o Nidoran da Route 201 aparece como grama); no Scarlet/Violet os
    exclusivos de versão aparecem nas duas versões (há aviso na tela).
13. **Itens e TMs no Detonado das Gens 5–9** — o PKHeX não tem a posição dos itens; a evolução por pedra não é limitada pelo
    ponto da história nesses jogos. Desde a 0.22.0 a aba Onde capturar mostra, para os itens de evolução, as frases do
    detonado que dizem onde achar — mas Sword/Shield (0/28) e Let's Go (0/6) não citam nenhum, e nos outros faltam vários
    (ver `reports/<jogo>/evo-items.json`).
14. **Black 2/White 2 — 15 TMs vendidas em lojas** comuns: não estão no decomp em texto.

### Trabalho grande no motor
15. **Mecânicas não simuladas** (hoje só há aviso): Mega Evolução, golpes Z, Dynamax/Gigantamax, Terastal, estilos e valores
    próprios de golpes do Legends: Arceus, batalha em tempo real do Z-A.

### Fica como está (correto)
- BDSP: Darkrai, Arceus, Shaymin, Deoxys e Phione não aparecem — são de evento.
- Jogos sem decomp continuam com o selo "Parcialmente verificado".

## Regras do projeto (para retomar)
- Decomp = fonte da verdade; PokéAPI é a base com erros conhecidos; PKHeX e detonados para os jogos sem decomp. Nada inventado
  (sem taxa, sem estágio, sem golpe que a fonte não tenha — quando é estimativa, a tela diz).
- Todo achado/correção validado ganha teste em `test/regressions.test.mjs` e a armadilha vai para `docs/ADICIONAR-JOGO.md`.
- Fluxo: branch → testes (inclusive num clone limpo, sem `data-sources/`) → merge `--no-ff` em main → push; CHANGELOG e
  `package.json` com a mesma versão. `data-sources/` e `.cache/` nunca vão para o git.
- Pipeline de um jogo: `node scripts/build-game.mjs <jogo>`; servidor local: `npm run serve` (http://localhost:5173).
