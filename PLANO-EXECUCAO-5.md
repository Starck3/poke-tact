# Plano de execução 5 — o que dá para fazer com as fontes atuais

Criado em 2026-10-28, na versão 0.53.1, a pedido do usuário: "monte um plano de execução e siga sem precisar de minhas
intervenções … a cada item com problema deixe marcado para resolvermos quando você terminar. Depois leia todo o sistema,
teste as etapas por um chrome headless e faça críticas do que podemos melhorar".
Mesmas regras dos planos 2–4 (branch, versão, `> resumo` ≤ 260 caracteres, teste de regressão, banco de lutas, até 3
abordagens, ⏸ com motivo, nada inventado; Bulbapedia com ≥ 5 s por página, para no 1º erro, cache fora do git).

Legenda: ⬜ a fazer · 🔄 em andamento · ✅ feita · ⚠ parcial · ⏸ pulada (motivo) · 🚩 problema para revisar com o usuário

## Etapas
- **R1 ✅ Taxa de aparição no Black/White** pela tabela de captura da Bulbapedia ({{Catch/entry5}}), no mesmo
  `apply-bulbapedia-rates`. Pronto quando: BW com taxa na maioria dos selvagens; teste; banco rodado.
- **R2 ✅ Exclusivos de versão no Scarlet/Violet**: o PKHeX não separa as versões; a tabela da Bulbapedia marca a versão de
  cada encontro. Tirar da versão errada só quando a página diz que é exclusivo da outra. Pronto quando: um exclusivo
  conhecido (ex.: Larvitar só no Scarlet, Bagon só no Violet) sai da outra versão; aviso da tela ajustado.
- **R3 ⚠ Ponto da história no Sword/Shield** (4.648 encontros só estimados pelo nível, quase todos da Wild Area): tentar o
  índice do detonado da Bulbapedia e a página de cada área. Pronto quando: as estimativas caem ou ⏸ com o motivo medido.
- **R4 ⬜ Encontros ainda sem ponto da história** (SV 72, BW 22, X/Y 18, SM 14, Z-A 7): caso a caso pela página do lugar.
- **R5 ⬜ Taxa de aparição no Sword/Shield, Scarlet/Violet, Legends: Arceus e Z-A** (formato de tabela diferente: clima,
  bioma). Medir num jogo primeiro; estender só se o casamento for confiável.
- **C1 ⬜ Revisão geral**: ler o sistema inteiro, testar as telas num Chrome headless e escrever as críticas do que melhorar.
- **D1 ⬜** STATUS.md, memória, resumo final.

## Backlog (pedido do usuário: fica para depois)
- Aba Detonado: o ovo aparece como "breed" (falta a tradução "ovo na creche").
- Card da sugestão: deixar claro que é preciso treinar até o nível do golpe ("capture o Mankey nv 2–5 e treine até o nv 11")
  — opções 1, 2 ou 3 da conversa de 2026-10-26, a decidir.

## Ordem
R1 → R2 → R3 → R4 → R5 → C1 → D1.

## Registro
- **2026-10-28 — R1/R2 (0.54.0)**: BW: {{catch/entry5}} tem 3 colunas de versão; seção "Swarm" e linhas de fenômeno
  (Rustling, Dust, Shadow, Rippling) fora; "Fishing" = Super Rod; "Victory Road (Black and White)". 562/1.016 com taxa (o
  resto é fenômeno, estação ou White Forest). SV: lista "Version-exclusive Pokémon" por bloco (Paldea/Kitakami/Blueberry;
  "Sudachi 1/2" do PKHeX = DLCs); raids ficam; evoluções recalculadas (Tyranitar no Violet). 74 espécies/versão deixam de ser
  obtíveis; 4 formas fundidas (Kyurem, Necrozma) sem par no app. Banco: vencem igual; folgadas BW +12, SV −19.
- **2026-10-28 — R3 ⚠ (0.55.0)**: regra do jogo em vez de estimativa: limite de captura por insígnia (Bulbapedia "Badge",
  "Catch level limit": 20/25/…/55/qualquer) nas 18 subáreas da Wild Area (página "Wild Area"; abre inteira no começo). 835
  estimativas + 879 estágios da citação no detonado trocados. Banco sem mudança. Sobram estimadas: raids (outra regra) e
  DLCs (nível acompanha as insígnias). 🚩 Depois do Darkest Day a Wild Area ganha Pokémon de nível mais alto; pela regra eles
  ficam em "8 insígnias", um ponto antes do pós-jogo — o PKHeX não diz quais slots são só do pós-jogo.
