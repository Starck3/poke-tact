# Poke Tact — status e pendências

Atualizado em 2026-10-25 · versão **0.44.0** (publicada no GitHub).
Leia junto com `CHANGELOG.md` (o que mudou em cada versão), `docs/ADICIONAR-JOGO.md` (como cada dado é obtido e as armadilhas
já encontradas) e `PLANO-EXECUCAO-2.md` (o plano autônomo depois da 0.28.0, com o registro de cada etapa).

## Como está cada jogo

**Selo "Verificado"**: dados conferidos com o código do jogo (decomp). **Selo "Parcial"**: núcleo pelas tabelas do jogo
extraídas pelo PKHeX; treinadores e progresso vêm do detonado do PokeMythology.

| Jogo | Ger. | Fonte do núcleo | Onde obter | Progresso | Treinadores | Ovos da creche | Mecânica simulada | Fora do cálculo (aviso) |
|---|---|---|---|---|---|---|---|---|
| Red/Blue, Yellow | 1 | decomp (pret) | decomp | sim | decomp (golpes reais) | — (não há) | — | — |
| Gold/Silver, Crystal | 2 | decomp (pret) | decomp | sim | decomp | sim | — | — |
| Ruby/Sapphire, Emerald, FireRed/LeafGreen | 3 | decomp (pret) | decomp | sim | decomp | sim | — | — |
| Diamond/Pearl, Platinum, HeartGold/SoulSilver | 4 | decomp (pret) | decomp | sim | decomp | sim | — | — |
| Black 2/White 2 | 5 | decomp (pokebw2) | decomp | sim | decomp | sim | — | — |
| Black/White | 5 | PKHeX | PKHeX | sim (+ estimativa) | detonado (golpes estimados) | sim | — | — |
| X/Y, Omega Ruby/Alpha Sapphire | 6 | PKHeX | PKHeX | sim | detonado | sim | Mega (você e chefes) | — |
| Sun/Moon | 7 | PKHeX | PKHeX | sim (+ estimativa) | detonado | sim | Mega, golpe Z (você) | golpe Z dos chefes |
| **Ultra Sun/Ultra Moon** | 7 | PKHeX | PKHeX | **não** | **não** | **não** | Mega, golpe Z (todos os tipos) | — |
| Let's Go Pikachu/Eevee | 7 | PKHeX | PKHeX | sim | detonado | — (não há) | Mega (você e chefes) | — |
| Sword/Shield | 8 | PKHeX | PKHeX | sim (+ estimativa) | detonado | sim | Dynamax (você e chefes) | efeitos extras dos golpes Max |
| Brilliant Diamond/Shining Pearl | 8 | PKHeX | PKHeX | sim | detonado | sim | — | — |
| Legends: Arceus | 8 | PKHeX | PKHeX | sim (5 nobres) | detonado | — (não há) | — | estilos ágil/forte, valores de golpes, ordem de ação |
| Scarlet/Violet | 9 | PKHeX | PKHeX | sim (+ estimativa) | detonado | sim (piquenique) | Terastal (você e chefes) | — |
| Legends: Z-A | 9 | PKHeX (sem PokéAPI) | PKHeX | sim (rank Z → A) | detonado | — (não há) | Mega (você e chefes) | tempo real, valores de golpes |

A tela do jogo tem as abas **Recomendação**, **Detonado**, **Onde capturar** (todos os locais, evoluções e onde achar o item de
evolução, os dois caminhos — capturar direto ou evoluir —, ovos da creche, fotos e mapa da região) e **Pokémon por tipo**.
"(+ estimativa)": locais que o detonado não cita ganham o ponto da história estimado pelo nível dos selvagens (marcado).
Novidades (🔔) com resumo em linguagem simples por versão. Testes: `npm test` (275 com `data-sources/`, 260 num clone limpo).
Banco de lutas: 21 jogos, 37.872 sugestões — 37.694 vencem (99,5%), 36.380 com folga; ≈ 6 minutos.

## O que falta (do mais importante para o menos)

### Plano de execução 2 (concluído em 2026-10-25 — detalhes em `PLANO-EXECUCAO-2.md`)
- ✅ Simulador: Mega (0.26–0.27), golpe Z (0.28), Terastal (0.29), Dynamax (0.30), Velocidade da Mega na Gen 6 (0.31).
- ✅ Banco de lutas 5–9× mais rápido (0.32); mundo aberto — nível compatível com o time (0.33).
- ✅ Ovos da creche no B2W2 (0.34) e nos jogos do PKHeX (0.35); estágio estimado pelo nível (0.36); creches no mapa (0.37).
- ⚠ Itens de evolução/Mega Stones sem citação no detonado do Sword/Shield e do Z-A — só com outra fonte.
- ⚠ Legends: Arceus e Z-A: sem fonte para os estilos, a ordem de ação e o tempo real — ficam no aviso.
- ⏸ Golpe Z dos chefes: o detonado não marca em nenhuma luta.
- **Esperando o usuário**: fonte nova para os itens acima (decisão do projeto: só decomp, PKHeX, Showdown e detonados).

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
15. ✅ (0.26–0.31) **Mecânicas simuladas**: Mega, golpe Z, Terastal e Dynamax. Ficam só no aviso: estilos e valores próprios de
    golpes do Legends: Arceus, tempo real do Z-A, efeitos extras dos golpes Max e golpe Z dos chefes (sem fonte).

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
