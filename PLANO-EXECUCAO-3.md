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
- **N5 ⬜ Nível de Dynamax dos líderes** (vida 1,5× → o certo, até 2×), se a página do treinador der o nível de Dynamax.
- **N6 ⬜ Ultra Sun/Ultra Moon**: líderes da história (kahunas, capitães/totens, Elite, campeão, rivais) e a ordem das
  provações pelas páginas da Bulbapedia → treinadores e progresso no USUM (hoje não tem). Pronto quando: aba de oponentes
  e progresso existem no USUM com crédito; aba Detonado continua fora (não há detonado).
- **N7 ⬜ Legends: Arceus — estilos Ágil/Forte e ordem de ação**: só se a página da Bulbapedia trouxer a regra em números
  (poder, ordem). Senão ⚠ e fica no aviso. Z-A (tempo real) fica no aviso (sem regra em números).
- **N8 ⬜ 15 TMs de loja do Black 2/White 2**: local da loja pela página de cada TM.

## Bloco P — detalhes pequenos (fontes atuais ou novas)
- **P1 ⬜ Efeitos extras dos golpes Max** (Showdown `data/moves.ts`: clima, atributo): os que mudam a conta da troca (Max
  Airstream +Vel, Max Knuckle +Atq, Max Steelspike +Def…, e clima que muda dano: Max Flare/Geyser 1,5×) aplicados nos 3
  turnos do Dynamax. Pronto quando: teste do bônus; banco do SwSh.
- **P2 ⬜ FRLG: "Ssanne Exterior" no mapa** (warp do decomp para o Vermilion) e o vagante marcado "anda pelo mapa".
- **P3 ⬜ Estimativas pelo nível revistas** (Route 9 do SM etc.): quando a Bulbapedia tiver a ordem da rota na história
  (página do local), usar a ordem em vez da estimativa; senão manter a estimativa marcada.
- **P4 ⬜ Taxa de aparição nas Gens 6–9** (opcional, grande): tabelas de encontro da página de cada rota. Só se N0 tornar
  isso barato; senão ⏸ com o custo estimado.

## Bloco D — fechamento
- **D1 ⬜** STATUS.md, memória, resumo final aqui.

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
