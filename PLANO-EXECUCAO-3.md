# Plano de execução 3 — fonte nova (Bulbapedia) e os detalhes que faltam

Criado em 2026-10-25, na versão 0.37.0, a pedido do usuário: "Monte um plano com liberar uma fonte nova e depois atacar
os detalhes pequenos com as fontes atuais ou mesmo com as fontes novas". Continua o `PLANO-EXECUCAO-2.md` (concluído).

Legenda: ⬜ a fazer · 🔄 em andamento · ✅ feita · ⚠ parcial · ⏸ pulada (motivo) · ❌ inviável

## A fonte nova: Bulbapedia (liberada pelo usuário em 2026-10-25)
- **Lugar na hierarquia**: decomp > PKHeX > Bulbapedia ≈ detonado > PokéAPI. A Bulbapedia **completa** o que o código do
  jogo e o PKHeX não têm (golpes dos chefes, onde achar itens, regras de batalha); quando contradiz o decomp/PKHeX, vale o
  decomp/PKHeX e a diferença vai para o relatório.
- **Como baixar** (regras que já valiam no `fetch-bulbapedia.mjs`): wikitext pela `action=raw`, **≥ 5 s entre pedidos**
  (Crawl-delay), User-Agent identificado, **para no 1º erro HTTP** sem insistir, retoma do disco; manifesto com URL, data e
  sha256. Guardado em `data-sources/bulbapedia/` (**fora do git**).
- **Licença**: texto CC BY-NC-SA — uso local para extrair fatos (time, golpe, lugar), sem copiar texto da wiki para o app;
  a tela dá o crédito ("Bulbapedia") onde o dado aparece.
- **Serebii**: só para conferir um caso duvidoso, nunca como fonte principal (sem API, HTML instável).

## Regras de execução (as mesmas do plano 2)
1. Uma etapa por vez, na ordem; cada etapa = branch, versão, CHANGELOG com `> resumo` simples, teste de regressão, armadilha
   em `docs/ADICIONAR-JOGO.md`, banco de lutas completo quando muda dado de luta ("vencem" não cai sem explicação).
2. Até 3 abordagens por etapa; se nenhuma validar: desfaz o branch, marca ⏸ com o motivo e segue.
3. Nada inventado; estimativa sempre marcada. Edição com regex só por Edit/Write (o `\b` já virou backspace).
4. Registro no fim deste arquivo + memória `poke-tact-status` a cada etapa.
5. Decisão de regra do projeto que não esteja aqui → ⏸ "esperando o usuário".

## Bloco N — com a fonte nova
- **N0 ✅ Infraestrutura** (0.38.0): `scripts/lib/bulbapedia.mjs` (baixar página com as regras acima, cache, manifesto) e um leitor
  de wikitext para as predefinições usadas: time de treinador (`{{Party/…}}`/`{{Pokémon/…}}` com `move1…4`, `z-move`,
  `level`, `held`), tabela "Acquisition" de item (`{{gameabbrev…}}` + local). Pronto quando: lê o time do Hala (SM) e as
  linhas da Fire Stone por jogo, com teste usando uma cópia pequena do wikitext em `test/fixtures/` (o clone limpo não tem
  `data-sources/`).
- **N1 ⚠ Golpes reais dos chefes (Gens 5–9 sem decomp)** (0.38.0: 635 de 1.098 lutas; SwSh/LGPE/BDSP abaixo de 65%): para líderes, Elite, campeões e rivais que o app já tem (pelo
  detonado), puxar os golpes da página do treinador na Bulbapedia (mesma espécie e nível ±2) — hoje são estimados pelo nível.
  Pronto quando: cada luta casada troca "golpes estimados" por "golpes da Bulbapedia"; relatório com as não casadas; banco.
- **N2 ✅ Golpe Z dos chefes (Sun/Moon)** (0.38.0: 29 Pokémon): marca `z-move` do time (Hala: Crabrawler com All-Out Pummeling) → o chefe usa o
  Z no 1º turno (mesmo cálculo do seu lado). Pronto quando: Hala luta com Z; banco.
- **N3 ✅ Onde achar itens de evolução e Mega Stones** (0.39.0) (Sword/Shield 0/28, Z-A 0, e os que faltam nos outros jogos do PKHeX):
  linhas "Acquisition" da página de cada item, por jogo → local; o ponto da história pelo local (estágio do onde obter/
  detonado). Pronto quando: SwSh e Z-A mostram onde achar as pedras com crédito "Bulbapedia"; a evolução por pedra passa a
  ser limitada pelo ponto da história nesses jogos.
- **N4 ⚠ Incensos** (0.40.0: Gen 3 resolvida; nos jogos novos o lugar do incenso não casa com os locais do app) (bebês de incenso fora por falta de onde achar o incenso): onde achar cada incenso pela Bulbapedia nos
  jogos que não têm (Emerald Sea Incense, FRLG Lax Incense, Gens 5–8…). Com o incenso, o bebê entra pelo apply-breeding.
- **N5 ⏸ Nível de Dynamax dos líderes** (vida 1,5× → o certo, até 2×), se a página do treinador der o nível de Dynamax.
- **N6 ✅ Ultra Sun/Ultra Moon** (0.43.0 treinadores; 0.46.0 progresso): líderes da história (kahunas, capitães/totens, Elite, campeão, rivais) e a ordem das
  provações pelas páginas da Bulbapedia → treinadores e progresso no USUM (hoje não tem). Pronto quando: aba de oponentes
  e progresso existem no USUM com crédito; aba Detonado continua fora (não há detonado).
- **N7 ⚠ Legends: Arceus — estilos Ágil/Forte e ordem de ação** (0.45.0: ordem de ação sim; estilos não): só se a página da Bulbapedia trouxer a regra em números
  (poder, ordem). Senão ⚠ e fica no aviso. Z-A (tempo real) fica no aviso (sem regra em números).
- **N8 ✅ 15 TMs de loja do Black 2/White 2** (0.44.0): local da loja pela página de cada TM.

## Bloco P — detalhes pequenos (fontes atuais ou novas)
- **P1 ✅ Efeitos extras dos golpes Max** (0.41.0) (Showdown `data/moves.ts`: clima, atributo): os que mudam a conta da troca (Max
  Airstream +Vel, Max Knuckle +Atq, Max Steelspike +Def…, e clima que muda dano: Max Flare/Geyser 1,5×) aplicados nos 3
  turnos do Dynamax. Pronto quando: teste do bônus; banco do SwSh.
- **P2 ✅ FRLG: "Ssanne Exterior" no mapa** (0.42.0) (warp do decomp para o Vermilion) e o vagante marcado "anda pelo mapa".
- **P3 ✅ Estimativas pelo nível revistas** (0.46.0) (Route 9 do SM etc.): quando a Bulbapedia tiver a ordem da rota na história
  (página do local), usar a ordem em vez da estimativa; senão manter a estimativa marcada.
- **P4 ⏸ Taxa de aparição nas Gens 6–9** (opcional, grande): tabelas de encontro da página de cada rota. Só se N0 tornar
  isso barato; senão ⏸ com o custo estimado.

## Bloco D — fechamento
- **D1 ✅** STATUS.md, memória, resumo final aqui.

## Ordem
N0 → N1 → N2 → N3 → N4 → N5 → P1 → P2 → N6 → N8 → N7 → P3 → P4 → D1.

## Registro
- **2026-10-25 — N0+N1+N2 (0.38.0)**: `scripts/lib/bulbapedia.mjs` (página com cache, ≥ 5 s, para no erro; o fetch do Node
  levava HTTP 403 da proteção do site — usa o curl com o mesmo User-Agent) e leitor de {{Party}}/{{Pokémon}} e da tabela
  Acquisition. `apply-bulbapedia-trainers`: luta casada pelo jogo (inclui códigos por versão Sw/Sh, OR/AS, Su/Mo…; "Y" e
  "E" ficam de fora — Yellow/Emerald) e espécie+nível ±3 (≥ 60% do time). Lutas com golpes reais: BW 69/76, XY 64/77,
  ORAS 56/74, SM 76/81, LGPE 34/57, SwSh 48/96 (as lutas do Hop antes do pós-jogo não estão na página), BDSP 45/74, LA
  83/107, SV 110/145, Z-A 50/71. Golpe Z de chefe: 29 (SM). Banco: vencem 37.694 (igual); folgadas 36.380 → 35.915 — os
  chefes agora usam os golpes de verdade (mais cobertura que os estimados).
- **2026-10-26 — N3 (0.39.0)**: `apply-bulbapedia-items` — tabela Acquisition de 134 páginas (40 itens + 94 Mega Stones).
  Linha do jogo: SwSh 28/28 (antes 0), Z-A 114/115, XY 45/55, ORAS 66/74, SM/USUM 75/75, LGPE 21/21, BDSP 23/23, LA 23/23,
  SV 31/33, BW 23/23. Lugar casado com o onde obter → `acq.items` com estágio e `itemsPartial` (sem casamento não
  bloqueia). Dois HTTP 503 no meio: parou como manda a regra e a 2ª rodada completou. Banco: vencem 37.694 → 37.687 (−7 no
  Let's Go: evolução por pedra só depois de achar a pedra); folgadas 35.915 → 35.864.
- **2026-10-26 — N4 (0.40.0)**: `apply-bulbapedia-items` também nos jogos com decomp, só para os incensos que faltam
  (acq.itemsBulbapedia). Lugar da Bulbapedia casado pelo começo do nome ou contido nele, se específico ("Lost Cave" ⊂
  "Five Island Lost Cave Room 1"; "Market" sozinho não casa). Emerald/RS: Sea/Lax Incense no Mt. Pyre → Azurill (e Wynaut no
  RS); FRLG: Lost Cave → Azurill/Wynaut. B2W2/BW/XY/ORAS/SM: incenso em "Market"/lojas sem lugar casado → bebês continuam
  fora. Fluxo: apply-bulbapedia-items antes do apply-breeding; o build-evo-items mantém as linhas da Bulbapedia e não pula
  mais os jogos com itemsPartial. Banco: vencem 37.687 (igual); folgadas 35.864 → 35.862.
- **2026-10-26 — N5 ⏸**: as páginas da Bulbapedia não dão o nível de Dynamax dos treinadores (só `| max = Gigantamax`,
  qual Pokémon dinamaxiza — o leitor passou a ler, mas o detonado já marcava os 45). A vida segue 1,5× (nível 0), marcada.
- **2026-10-26 — P1 (0.41.0)**: efeito extra de cada golpe Max lido do data/moves.ts do Showdown (18 tipos: `this.boost`,
  `setWeather`, `setTerrain`) → `data.maxEffects`; o duelo com Dynamax simula os dois lados turno a turno com estágio de
  atributo, sol/chuva 1,5×/0,5× e terreno 1,3× (Névoa: Dragão 0,5×) por 5 turnos. Fora: Velocidade, dano de areia/granizo,
  efeitos G-Max. Banco: SwSh turnos 1,40 → 1,32; vencem/folgadas iguais (37.687 / 35.862).
- **2026-10-26 — P2 (0.42.0)**: o ponto do S.S. Anne já existia (warp do Vermilion); faltava casar o nome "Ssanne Exterior"
  (decomp, sem pontos) com "S.S. Anne". FRLG 142/143 no mapa — o que falta é o vagante, que não tem lugar fixo (a tela diz
  "pelo mapa (vagante)").
- **2026-10-26 — N6 ⚠ (0.43.0)**: `build-trainers-bulbapedia` monta o arquivo de treinadores do USUM pelas páginas (kahunas,
  capitães, Elite pela classe "Elite Four", Kukui/Hau, Gladion, Skull/Aether/Ultra Recon Squad): 100 lutas, 363 Pokémon,
  45 com golpe Z, formas pelo campo "form"; lutas-tutorial fora. Progresso continua sem fonte (não há detonado; a ordem das
  provações viria de outra página — fica para depois) → sem estágio e fora do banco de lutas (que monta as lutas pela aba
  Detonado).
- **2026-10-26 — N8 (0.44.0)**: `apply-bulbapedia-tms` — número da TM pela tabela do jogo (tmMoves/tmIndex do pokebw2),
  lugar pela linha "TMtable/row … B2W2" da página TMnn; estágio pelo mapa de mesmo nome ou que começa o nome ("Striaton City
  Poké Mart"). 15/15 (Mistralton, Nimbasa, Lacunosa, Striaton, Shopping Mall Nine). Banco sem mudança.
- **2026-10-26 — N7 ⚠ (0.45.0)**: a página "Action order" da Bulbapedia tem a tabela Velocidade → tempo de ação (14 … 5) e
  a regra de empate; o duelo do LA passa a comparar o instante do nocaute (golpes × tempo de ação) — quem é bem mais rápido
  pode agir 2 vezes. Os estilos Ágil/Forte não têm números (a própria página marca "incomplete") → seguem no aviso, assim
  como os valores de golpe próprios do LA. Aviso "ordem de ação" saiu da tela. Banco: totais iguais (LA folgadas 88→89%).
- **2026-10-26 — P3 + N6 (0.46.0)**: `apply-bulbapedia-walkthrough` lê o índice "Appendix:<jogo> walkthrough" (partes em
  ordem com os lugares; ilhas/regiões; pós-jogo). USUM: 12 marcos (8 provações + 4 grandes, com a da Mina) → progress,
  onde obter 2.096/2.369 com estágio, 98/100 treinadores (grande provação pelo marco; revanche/defesa de título → pós-jogo).
  Outros: o lugar estimado pelo nível ganha a MEDIANA dos estágios conhecidos da mesma parte (o menor puxava a Route 15 do
  BW para 4; o maior puxava a Route 16 do SM para o fim); parte de pós-jogo → pós-jogo. SM 7, BW 8, SV 1 lugares (Route 9
  do SM 0 → 5). Armadilhas: o índice do SV recomeça "Part 1" em cada DLC (parte pela POSIÇÃO); rodar o build-detonado-modern
  sozinho apaga os golpes da Bulbapedia — refazer a cadeia toda. Banco: vencem 37.687 (igual); folgadas 35.862 → 35.852.
- **2026-10-26 — P4 ⏸**: custo estimado — ~500 páginas de rota (XY, ORAS, SM/USUM, SwSh, BDSP, LA, SV) ≈ 40 min de download a
  5 s/página, um leitor novo das tabelas de encontro ({{catch/…}}) e o casamento com cada método do PKHeX por jogo. Ganho:
  só a penalidade de "raro" nas sugestões dessas gerações. Fica para quando o usuário pedir.
- **2026-10-26 — D1**: STATUS.md atualizado, memória atualizada, resumo abaixo.

## Resumo final (2026-10-26, versão 0.46.0)
- **Feitas**: N0 base da Bulbapedia + N1 golpes reais dos chefes (635 lutas) + N2 golpe Z dos chefes (0.38.0); N3 onde
  achar itens de evolução e Mega Stones (0.39.0); N4 incensos da Gen 3 (0.40.0); P1 efeitos dos golpes Max (0.41.0); P2
  S.S. Anne no mapa (0.42.0); N6 treinadores (0.43.0) e progresso (0.46.0) do Ultra Sun/Ultra Moon; N8 TMs de loja do
  B2W2 (0.44.0); N7 ordem de ação do Legends: Arceus (0.45.0); P3 estimativas revistas pela ordem da Bulbapedia (0.46.0).
- **Parciais**: N1 (SwSh 48/96, LGPE 34/57 e BDSP 45/74 lutas casadas — o resto segue com golpes estimados); N4 (nos jogos
  novos o incenso é vendido em lojas sem lugar casado); N7 (estilos Ágil/Forte sem números na fonte).
- **Puladas**: N5 (a Bulbapedia não dá o nível de Dynamax dos líderes); P4 (custo alto, ganho pequeno).
- **Achados no caminho**: o fetch do Node leva HTTP 403 da Bulbapedia (o curl passa); códigos de jogo por versão nos times
  (Sw/Sh, OR/AS…) e colisões ("Y" = Yellow); o índice do SV recomeça a numeração em cada DLC; regerar o detonado sozinho
  apaga os golpes da Bulbapedia; o build-evo-items pulava os jogos com a lista de itens da Bulbapedia.
- Banco de lutas no fim: 37.872 sugestões, 37.687 vencem, 35.852 com folga (início do plano: 37.694 / 36.380 — a queda das
  folgadas vem dos chefes com golpes reais, mais duros; as 7 vitórias a menos são do Let's Go, por pedra achada depois).
