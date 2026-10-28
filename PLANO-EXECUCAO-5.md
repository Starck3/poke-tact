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
- **R4 ⚠ Encontros ainda sem ponto da história** (SV 72, BW 22, X/Y 18, SM 14, Z-A 7): caso a caso pela página do lugar.
- **R5 ⚠ Taxa de aparição no Sword/Shield, Scarlet/Violet, Legends: Arceus e Z-A** (formato de tabela diferente: clima,
  bioma). Medir num jogo primeiro; estender só se o casamento for confiável.
- **C1 ✅ Revisão geral**: ler o sistema inteiro, testar as telas num Chrome headless e escrever as críticas do que melhorar.
- **D1 ✅** STATUS.md, memória, resumo final.

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
- **2026-10-28 — R4 ⚠ (0.56.0)**: trocas pela página "In-game trade" (lugar na 1ª coluna; {{rt|…}}; rowspan; "Any Pokémon";
  SV "troca com NPC" = League Club Room da Indigo Disk, conferido espécie a espécie: 30/30). Sem estágio: SV 72 → 6, X/Y 18
  → 12, SM 14 → 4. Ficam sem estágio (sem fonte do ponto da história do lugar): Vaniville Town e hotéis de Kalos (X/Y),
  Malie City e Konikoni City (SM), Ralts (X/Y, sem linha na tabela); ovos de presente (Larvesta BW, Wynaut/Togepi ORAS,
  Happiny BDSP, iniciais de Sinnoh do Jacq SV), Route 17 do BW (água), Virizion (BW), Giratina (LA) e os lendários da DLC
  Mega Dimension do Z-A — todos de pós-jogo ou de NPC sem lugar no dado; ficam para uma rodada com a página de cada um.
- **2026-10-28 — R5 ⚠ (0.57.0)**: Sword/Shield com taxa por clima (2.417/3.490): seção da página (Hidden × Visible) casa com o
  método do PKHeX (escondido × no mapa); o clima da linha cruza o do encontro. ⏸ Scarlet/Violet, Legends: Arceus e Z-A: a
  página dos lugares não tem tabela de captura por lugar no mesmo formato (bioma/região) — fica para outra rodada.
- **2026-10-28 — achados da revisão corrigidos já (0.57.0)**: Detonado remontado depois das etapas da Bulbapedia
  (sync-walkthrough-modern; SwSh tinha 440 estágios divergentes); link ?treinador= ajusta nível/progresso; item citado no
  detonado limita a evolução (Armarouge na 1ª luta da Nemona); aviso de disponibilidade sobre ovos. 🚩 O item citado usa
  a 1ª citação do detonado — pode ser mais tarde que a 1ª chance real (Water Stone do Z-A ficou no pós-jogo).

## Críticas (C1) — leitura do sistema + teste no Chrome headless
Teste: Chrome headless pelo protocolo DevTools (sem dependências), 20 etapas — tela inicial, busca, FireRed (Brock pelo
seletor e pelo link), Onde capturar, Detonado, Pokémon por tipo, Sword/Shield, Scarlet/Violet, Ultra Sun, Legends: Arceus,
Novidades e celular (390 px). Nenhum erro de JavaScript; só 404 do favicon e do mapa da região de jogos sem mapa. Achados já
corrigidos na 0.57.0: link da luta sem nível automático, Armarouge na 1ª luta da Nemona, Detonado divergente do Onde
capturar, aviso de disponibilidade desatualizado.

### Tela (do mais importante para o menos)
1. **O app supõe que todo Pokémon sugerido está no nível do seu time** — é a origem das duas reclamações (Brock, Mankey).
   Falta dizer no card "capture nv 2–5 e treine até o nv 11" (backlog) e, talvez, um filtro "sem treinar".
2. **O ajuste automático de nível/progresso é invisível**: o campo "Nível do seu time" fica longe do seletor de treinador.
   Mostrar uma linha acima das sugestões: "Calculado com o seu time no nv 14 e 0 insígnias (o nível do Brock) — mudar".
3. **Os cartões grandes dos iniciais ficam entre o treinador e o oponente** e empurram as sugestões para baixo da dobra;
   viraria uma linha compacta (ou recolhida depois de escolhida).
4. **Clima repetido e em inglês** no Onde capturar do Sword/Shield: "[clima: Overcast] … (só com nublado 40%)". Quando há
   taxa por clima, esconder o detail do PKHeX (ou traduzir os nomes).
5. **"breed" sem tradução** na aba Detonado (backlog).
6. 404 evitáveis: favicon e <jogo>-regionmap.json pedido em jogos sem mapa (o catálogo já sabe — capture.regionMap).
7. Textos longos de aviso ("Sobre os dados") misturam o que vale para cada fonte; um quadro por fonte (decomp, PKHeX,
   Bulbapedia, detonado) seria mais fácil de ler.

### Pipeline de dados (revisão do código; detalhes no relatório da revisão)
8. **Ordem entre jogos**: ORAS lê o Ruby/Sapphire, BDSP o Diamond/Pearl, Let's Go o Yellow, USUM o Sun/Moon, Z-A o
   Scarlet/Violet — mas `build-game` sem argumentos monta na ordem do games.mjs (ORAS antes do RS) e um arquivo faltando
   vira mapa vazio sem aviso. Declarar dependências e ordenar.
9. **Etapa sem fonte local sai com 0 e deixa o arquivo velho** (detonado/evo-items sem o HTML do PokeMythology): num clone
   limpo o resultado é uma mistura. Separar "não se aplica" de "fonte ausente" (modo --strict).
10. **Etapas que não são idempotentes** (apply-bulbapedia-items no modo decomp, apply-bulbapedia-walkthrough escolhe o modo
    pelo próprio resultado, trades só age sobre "a Link Trade"): só o pipeline completo dá o resultado certo.
11. **Duplicação**: `key()` com 7 versões diferentes; lugar → estágio reimplementado 4 vezes; adivinhar título de página 3
    vezes; o "obtível por evolução" copiado em 8 scripts. Juntar em scripts/lib.
12. **Testes conferem os dados versionados, não o código**: os leitores de wikitext não são exportados. Exportar e testar
    com trechos curtos de wikitext; um teste de idempotência (rodar a etapa 2× e comparar).
13. **O banco de lutas quase sempre dá 100%** e não pegou os erros que o usuário achou (nível 30 padrão, item sem
    estágio): ele usa o nível do ás e o estágio da luta. Falta medir "sugestão disponível de verdade nesse ponto" (fonte,
    item e golpe no estágio) e testar o caminho da tela (link, seletor) — o Chrome headless desta rodada pode virar teste.
14. `builtAt` em cada <jogo>.json muda a cada reconstrução e polui o diff; 404 da Bulbapedia fica gravado para sempre no
    cache.

## Resumo final
Versões 0.54.0 → 0.57.0 (mais a 0.53.1 do início):
- R1 ✅ Black/White com taxa (562/1.016). R2 ✅ exclusivos de versão do Scarlet/Violet (74 espécies/versão).
- R3 ⚠ Wild Area do Sword/Shield pelo limite de captura por insígnia (1.714 estágios); raids e DLC continuam estimados.
- R4 ⚠ trocas com lugar e estágio (SV 72 → 6 sem estágio; X/Y 18 → 12; SM 14 → 4).
- R5 ⚠ Sword/Shield com taxa por clima (2.417/3.490); ⏸ SV, LA e Z-A (sem tabela por lugar no mesmo formato).
- C1 ✅ revisão + Chrome headless; 4 achados já corrigidos; 14 críticas acima.
🚩 Para revisar com o usuário: (a) Pokémon de nível alto da Wild Area depois do Darkest Day ficam em "8 insígnias", um ponto
antes do pós-jogo; (b) item citado no detonado vale a partir da 1ª citação — pode ser tarde demais (Water Stone do Z-A no
pós-jogo); (c) backlog: "breed" no Detonado e o aviso de treino no card.
