# Plano de execução autônoma — pendências 1 a 8 (STATUS.md)

Criado em 2026-10-20, a partir da versão 0.15.0. O usuário está ausente: executar em ordem, validar cada etapa por critério
objetivo e **não travar** — se uma etapa não fecha no limite de tentativas, marcar e seguir para a próxima.

## Regras
- Uma etapa por vez, num branch próprio (`etapa-N-…`). Concluída e validada → `npm test`, testes num clone limpo, merge
  `--no-ff` em `main`, push, CHANGELOG + versão (`package.json`) + `build-catalog` (novidades).
- Toda correção/achado validado ganha teste de regressão (`test/regressions.test.mjs`) e nota em `docs/ADICIONAR-JOGO.md`.
- Código com regex/backticks: editar só com Edit/Write (nunca `sed`/`node -e`) — ver memória "shell edit escapes".
- **Limite**: até 3 tentativas de abordagem por etapa. Se não validar: desfazer o branch (não mesclar nada pela metade),
  marcar ⚠ (parcial, mesclado o que validou) ou ❌ (não feito) com o motivo e o que foi tentado, e seguir.
- Nada que dependa de decisão do usuário (licença, fonte nova, mudança de produto): marcar ⏸ e seguir.
- Não regredir: o banco de lutas (`build-benchmark`) e os testes existentes não podem piorar.

Legenda: ⬜ a fazer · 🔄 em andamento · ✅ feito e validado · ⚠ parcial · ❌ não feito · ⏸ aguardando o usuário

## Etapas

### 1. Estágio pela citação anterior no detonado (jogos com decomp) — ✅ 0.16.0
- **Objetivo**: lugares descritos numa seção do pós-jogo mas citados antes no detonado (`acq.progress.reviewEarlierMention`)
  ganham o estágio da citação anterior **só quando um mapa vizinho (conexão/warp do decomp) já está liberado nesse estágio**.
- **Validação**: Emerald/RS Safari Zone ≤ 6; FRLG Power Plant ≤ 6; Crystal Silver Cave continua pós-jogo (9); Gold/Silver
  Viridian City continua ≥ 8; testes passam; banco de lutas não piora.
- **Se travar**: aplicar só nos jogos em que a regra valida (marcar ⚠ com a lista).

### 2. Sun/Moon — provação da Mina (Fairium) — ✅ (não era pendência real)
- **Objetivo**: entrar como marco do progresso sem pegar presentes (Steelium/Buginium/Poisonium/Eevium).
- **Validação**: `sun-moon-acquisition.json` → `progress.stageNames` com a provação do Fairium; nenhum dos presentes.
- **Se travar**: ❌ com o motivo (o texto não dá pista confiável).

### 3 + 4. Rival/companheiro com "inicial" genérico (Gens 5–9, inclusive Z-A Urbain/Taunie) — ✅ 0.17.0
- **Objetivo**: lutas com "inicial lv.5" / "Chikorita/Tepig/Totodile lv.5" deixam de perder esse Pokémon. Se o texto disser a
  regra (pega o forte/fraco contra o seu), gerar `forStarter`; se não, uma variante por inicial possível com o rótulo
  "(se o inicial dele for X)" — sem inventar a regra.
- **Validação**: contagem de "inicial genérico pulado" cai a 0 (ou perto) nos relatórios `reports/<jogo>/detonado-modern.json`;
  times de rival continuam com espécies do jogo; testes.
- **Se travar**: ⚠ com os jogos que ficaram.

### 5. Locais "Fora do detonado" — ⚠ 0.18.0 (parcial)
- **Objetivo**: reduzir os locais sem posição (BDSP 25, SwSh 19, LGPE 15, BW 14, SM 9…) usando só evidência do detonado
  (nomes em português, cidade/rota vizinha citada junto) — sem estimar por nível.
- **Validação**: total de `placesWithoutStage` cai; nenhuma rota do começo vai para depois (conferir 3 jogos à mão).
- **Se travar**: ⚠ com o que melhorou.

### 6. Black 2/White 2 — Hidden Grottoes conferidas pelo PKHeX — ✅ 0.19.0
- **Objetivo**: as espécies das grutas (hoje da PokéAPI) conferidas com o PKHeX por versão (Beedrill no B2 / Butterfree no
  W2); a rota continua da PokéAPI (o PKHeX não tem).
- **Validação**: toda espécie de gruta no app existe no PKHeX na mesma versão; diferenças em `reports/black-2-white-2/`.
- **Se travar**: ❌ com o motivo.

### 7. Mapa da região: B2W2/BW e cavernas do FRLG — ✅ 0.20.0
- **Objetivo**: FRLG — cavernas/florestas sem posição (0,0) ganham a posição da entrada (warps de `data/maps/*/map.json`);
  B2W2 — posições pelas zonas na matriz do mundo, se o pokebw2 tiver o vínculo zona↔célula; BW pela região do B2W2 (TWIN).
- **Validação**: FRLG > 130/142 locais no mapa; B2W2/BW com mapa e > 70% dos locais; testes.
- **Se travar**: fazer só o FRLG (⚠).

### 8. Fotos dos lugares — mais cobertura sem foto errada — ✅ 0.21.0
- **Objetivo**: aceitar também trechos citados só no texto **quando o nome do arquivo da imagem cita o lugar**
  ("mtmoon1.png") — sem voltar a pegar foto de outro lugar.
- **Validação**: cobertura sobe em ≥ 3 jogos; nenhuma foto do Sun/Moon "Route 1" vinda de Ten Carat Hill (teste existente).
- **Se travar**: ❌ (fica como está).

## Registro
(preenchido durante a execução: data/hora, resultado, versão publicada, motivo de ⚠/❌)

- **Etapa 1 — ✅ 0.16.0.** `applyEarlierMentions` (lib/progress.mjs) em 5 geradores. Validação: Safari Zone RS/E = 6, Power
  Plant FRLG = 6, Silver Cave = 9, Viridian (GS) = 9; banco de lutas igual em vitórias e com mais folgadas (34447 → 34478).
  1ª tentativa tinha 2 falsos positivos (Magma Hideout 6→3; Abandoned Ship RS 9→3) → regras "só pós-jogo" e "rota só de
  água conta a partir do Surf". Aceito: Pal Park (DP/Pt) no estágio 5 (sem fonte de captura). Abandoned Ship do RS
  continua pós-jogo (conservador; no jogo abre com Surf, estágio 5).
- **Etapa 2 — ✅ sem mudança de dados.** O detonado diz que no Sun/Moon a Mina "não tem nenhum trial para lhe oferecer" e
  entrega o Fairium como presente — o progresso atual (7 provações + 4 grandes provações) está certo. Teste de regressão
  registra o motivo. Sem versão nova (só teste + plano).
- **Etapas 3+4 — ✅ 0.17.0.** "Inicial genérico pulado" = 0 em X/Y, SM, SwSh, BDSP, LA, SV e Z-A. Regra do texto em X/Y
  (Shauna desvantagem, Calem/Serena vantagem), SwSh (Hop fraqueza), BDSP (Barry vantagem), LA (Rei/Akari desvantagem),
  SV (Nemona fraqueza), SM (Kukui vantagem); sem regra → variantes rotuladas: Hau (SM), Urbain/Taunie (Z-A), rival do
  Let's Go, N (BW, Reshiram/Zekrom), Honey (SwSh). Banco de lutas: 36171 → 37872 sugestões, 99% vencem. Tentativas: a 1ª
  leitura da regra pegava a frase inteira (X/Y: Calem herdava a "desvantagem" da Shauna) e "golpe de vantagem ao inicial
  de Hop" → corrigido para o trecho com o nome e a forma "… ao seu".
- **Etapa 5 — ⚠ 0.18.0 (parcial).** BDSP 25 → 1 (sobrou "Traveling Man", que é quem dá o ovo), Let's Go 15 → 0, ORAS 4 → 1;
  ORAS Route 102 deixou de ficar no estágio 8. **Desvio do plano (validar)**: além do texto do detonado, usei o estágio do
  MESMO lugar no jogo original com decomp (BDSP→DP, Let's Go→Yellow, ORAS→RS), convertido pelo nome do líder — o
  detonado do BDSP não numera rotas e não havia outra evidência. **Sem solução**: BW 14, Sword/Shield 19 (subáreas da Wild
  Area nunca nomeadas no texto), Sun/Moon 9, Scarlet/Violet 4, Z-A 7 — sem jogo original nem citação. **Achado novo**:
  Yellow põe a Route 6 no estágio 4 (no jogo abre depois da Misty, 2) — vem do gerador da Gen 1, fica para revisão.
- **Etapa 6 — ✅ 0.19.0.** 0 espécies de gruta só na PokéAPI; exclusivos por versão conferem. Das 15 a mais do PKHeX, entram
  só Glameow, Stunky e Togetic (sem outra forma de obter); 24 registros ficam como "confirmados". 1ª tentativa acrescentava
  todas e o banco de lutas do B2W2 caiu (6 lutas sem vencedor: a gruta sem rota escondeu a Glaceon via Eevee) → revertido
  para a regra acima; banco igual ao de antes. **Achado novo (motor)**: com fonte direta, `whereToGet`/`reachStage` não
  comparam com o caminho por evolução — fica como pendência.
- **Etapa 7 — ✅ 0.20.0.** FRLG 99 → 140/142 locais no mapa (entrada pelos warps dos map.json; bug encontrado: duas seções
  "Route 4" viravam um ponto com o id errado). B2W2 86/91 pela grade de zonas do `overworld.json` (warps herdam a zona de
  origem; coordenadas dos warps não usadas — escala não confirmada). BW 47/54 pela mesma Unova. Mapa em 15/22 jogos.
  Correção de número: a 0.14.0 dizia 14 jogos com mapa; eram 13.
- **Etapa 8 — ✅ 0.21.0.** Sem trecho com o título, entram só imagens cujo nome de arquivo cita o lugar (prefixos de 2+
  palavras, "mount" = "mt"). Cobertura: RB 19 → 23, GS 9 → 35, Crystal 33 → 36, HGSS 76 → 86, FRLG 73 → 80, B2W2 42 → 43
  (5 jogos com ganho real). Bônus: no trecho pelo título sai a foto cujo nome é de OUTRO lugar — Blackthorn (GS/Crystal)
  perdeu as fotos do Ice Path (fica sem foto), Mossdeep (ORAS) o mapa da Shoal Cave, Silver Cave a do Mt. Mortar, Dojo de
  Saffron (FRLG) a da Silph Co. Teste do SM "Route 1" continua passando. Jogos modernos (X/Y, SM, SwSh, SV, Z-A, BDSP):
  nomes de imagem numéricos/imgur — nenhum ganho possível por esse caminho. 1ª tentativa (chave = nome inteiro) só achava
  1 lugar ("Ice Path B1F" ≠ icepath) → prefixos.

## Resumo final (2026-10-20)
- **Feitas e validadas**: 1 (0.16.0), 2 (sem mudança: não era pendência), 3+4 (0.17.0), 6 (0.19.0), 7 (0.20.0), 8 (0.21.0).
- **Parcial**: 5 (0.18.0) — BDSP/Let's Go/ORAS resolvidos; BW 14, SwSh 19, SM 9, SV 4, Z-A 7 sem evidência.
- **Para o usuário validar**:
  1. Etapa 5 usa o estágio do jogo original (BDSP→DP, Let's Go→Yellow, ORAS→RS) — desvio do "só detonado".
  2. Yellow: Route 6 no estágio 4 (deveria ser 2) — gerador da Gen 1.
  3. Motor: com fonte direta, `whereToGet`/`reachStage` não comparam com o caminho por evolução (achado na etapa 6).
  4. Fotos: Blackthorn (GS/Crystal) agora fica sem foto (o trecho dela só tinha fotos do Ice Path).
- Nada ficou pela metade em branch: todas as etapas foram mescladas em `main` e publicadas.
- **Validado pelo usuário em 2026-10-25** (0.24.0): 1. mantido (estágio do jogo original nos remakes); 2. corrigido — o
  portão do guarda que pede bebida não liga a rota ao Saffron e o presente da Officer Jenny não fecha o Vermilion (Route 6
  no 2 no Yellow e no Red/Blue); 3. corrigido — o motor compara a captura direta com o caminho pela evolução e a tela mostra
  os dois; 4. Blackthorn com o mapa da cidade da Bulbapedia (o PokeMythology não tem foto dela nos jogos do GBC); 5. resumo
  em linguagem simples em cada versão do painel Novidades.
