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

### 5. Locais "Fora do detonado" — ⬜
- **Objetivo**: reduzir os locais sem posição (BDSP 25, SwSh 19, LGPE 15, BW 14, SM 9…) usando só evidência do detonado
  (nomes em português, cidade/rota vizinha citada junto) — sem estimar por nível.
- **Validação**: total de `placesWithoutStage` cai; nenhuma rota do começo vai para depois (conferir 3 jogos à mão).
- **Se travar**: ⚠ com o que melhorou.

### 6. Black 2/White 2 — Hidden Grottoes conferidas pelo PKHeX — ⬜
- **Objetivo**: as espécies das grutas (hoje da PokéAPI) conferidas com o PKHeX por versão (Beedrill no B2 / Butterfree no
  W2); a rota continua da PokéAPI (o PKHeX não tem).
- **Validação**: toda espécie de gruta no app existe no PKHeX na mesma versão; diferenças em `reports/black-2-white-2/`.
- **Se travar**: ❌ com o motivo.

### 7. Mapa da região: B2W2/BW e cavernas do FRLG — ⬜
- **Objetivo**: FRLG — cavernas/florestas sem posição (0,0) ganham a posição da entrada (warps de `data/maps/*/map.json`);
  B2W2 — posições pelas zonas na matriz do mundo, se o pokebw2 tiver o vínculo zona↔célula; BW pela região do B2W2 (TWIN).
- **Validação**: FRLG > 130/142 locais no mapa; B2W2/BW com mapa e > 70% dos locais; testes.
- **Se travar**: fazer só o FRLG (⚠).

### 8. Fotos dos lugares — mais cobertura sem foto errada — ⬜
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
