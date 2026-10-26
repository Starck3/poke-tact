# Plano de execução 2 — tudo o que ainda falta (execução autônoma)

Criado em 2026-10-25, na versão 0.28.0, a pedido do usuário: "Monte um plano longo de tudo que ainda temos que fazer,
quero que você consiga implementar o plano sozinho caso alguma etapa trave pois não vou poder acompanhar".
Continua o `PLANO-EXECUCAO.md` (etapas 1–8, concluído) e absorve o `PLANO-SIMULADOR.md` (fases 1 e 2 feitas).

Legenda: ⬜ a fazer · 🔄 em andamento · ✅ feita · ⚠ parcial (ver nota) · ⏸ pulada (travou — ver motivo) · ❌ inviável

## Regras de execução (valem para toda etapa)
1. **Uma etapa por vez, na ordem.** Cada etapa = um branch, uma versão (`0.29.0`, `0.30.0`…), uma entrada no CHANGELOG
   **com o `> resumo` em linguagem simples** (o teste exige), teste de regressão em `test/regressions.test.mjs` e a
   armadilha em `docs/ADICIONAR-JOGO.md`.
2. **Validação antes de mesclar:** `npm test` (com `data-sources/`) + clone limpo (`ship.sh` faz) + banco de lutas
   completo (`node scripts/build-benchmark.mjs` SEM argumento — com um jogo só ele reescreve o `_total.json` errado)
   quando a etapa mexe no motor ou nos dados de luta. Banco: "vencem" não pode cair sem explicação escrita no registro.
3. **Critério de pronto** de cada etapa está escrito nela. Se não for atingido, a etapa fica ⚠ com o que faltou.
4. **Travou?** Até **3 abordagens** por etapa. Se nenhuma validar: desfazer o branch (nada pela metade em `main`),
   marcar ⏸ com o motivo e a ideia que faltou testar, e seguir para a próxima. Nunca inventar dado para destravar.
5. **Nada inventado:** sem fonte, a tela diz "não está nos dados"; estimativa só marcada como estimativa.
6. **Edição de código com regex/`\b`/template:** só com Edit/Write — pelo shell o `\b` virou backspace (o teste de
   caractere de controle pega).
7. **Registro:** ao fim de cada etapa, uma linha em "Registro" abaixo (data, versão, números, o que ficou de fora) e a
   memória `poke-tact-status` atualizada.
8. **Decisões que são do usuário** (mudança de regra do projeto, fonte nova que não seja detonado/PKHeX/decomp/Showdown
   já usados): não decidir sozinho — marcar ⏸ "esperando o usuário" e seguir.

## Etapas

### Bloco A — Simulador (continuação do `PLANO-SIMULADOR.md`)
- **A1 ✅ Terastal (Scarlet/Violet).** (0.29.0)
  - Chefe: o tipo Tera do detonado (`party[].tera`, 103 já guardados) troca os tipos de defesa do Pokémon pelo tipo
    Tera; o ataque ganha STAB no tipo Tera além dos originais (2× quando o Tera é um dos tipos originais).
  - Você: com a Tera Orb (keyItems.tera, Mesagoza) o seu Pokémon pode terastalizar num dos tipos dele (o padrão do jogo
    é o tipo do Pokémon): STAB 2× nesse tipo; defesa vira o tipo único. Fica com o Tera só se pontua mais.
  - Fonte da regra: Showdown (`sim/battle-actions.ts`/`data/conditions.ts` — baixar fixado no mesmo commit).
  - Pronto quando: Katy com o Teddiursa Tera Bug luta como Bug; teste da regra do STAB; filtro "Usar Terastal";
    banco SV rodado; cartão diz o tipo Tera.
- **A2 ✅ Dynamax (Sword/Shield).** (0.30.0)
  - Só onde o jogo deixa (ginásios e lutas de campeonato): no detonado, lutas de líder/campeão; o último Pokémon do
    líder dynamaxa/gigantamaxa (tags `dynamax`/`gigantamax` do leitor; frase "o último pokémon dele vai dinamaxizar").
  - Regra: 3 turnos; HP × 2 (Gen 8: vida e máxima dobram); golpes viram Max com `maxPower` (já gravado) e não erram;
    efeitos de clima/atributo dos golpes Max ficam fora na 1ª versão (marcar na tela).
  - Você: com a Dynamax Band (keyItems.dynamax) e na luta de líder: um Dynamax por luta, se pontua mais.
  - Pronto quando: líder com Dynamax luta com HP dobrado nos 3 primeiros turnos; teste da conta; filtro "Usar Dynamax".
- **A3 ⏸ Chefes com golpe Z** (SM): procurar no detonado frases de golpe Z de chefe (kahunas, capitães). Se não houver
  marca por luta → ⏸ com o motivo (não inventar).
- **A4 ✅ Gen 6: Velocidade de antes da Mega também para o chefe** (0.31.0) no 1º turno (hoje só o seu lado).
- **A7 ✅ Mundo aberto (SV, LA, Z-A, SwSh Wild Area): nível do selvagem vs. o seu time.** Achado na A1: com progresso
  por insígnia, o SV sugere Pupitar selvagem de nv 42–44 (South Province Area Six, "antes da 1ª insígnia") para um time
  de nv 16. Com o progresso, o motor só olha o estágio. Ideia: no modo estágio também exigir que a fonte tenha nível
  ≤ nível do time + margem (ou marcar "selvagem de nível alto"). Pronto quando: o Pupitar sai/fica marcado nesse caso e
  o banco não perde vitórias sem explicação.
- **A5 ⬜ Legends: Arceus e Z-A** — avaliar: estilo Ágil/Forte (LA) e tempo real (Z-A). Critério: só implementar o que
  tiver regra numa fonte (PKHeX/Showdown/detonado); o resto vira aviso claro na tela. Esperado: ⚠ (aviso melhor).
- **A6 ✅ Banco de lutas mais rápido** (0.32.0) (hoje ≈ 11 min com o Z): cache de `availableMoves`/`statsAt` por candidato e
  pular formas Mega/Z que não podem ganhar. Pronto quando: mesmos números, tempo menor.

### Bloco B — Dados que dá para fazer com as fontes que temos
- **B1 ✅ Creche no Black 2/White 2** (0.34.0) (decomp pokebw2): achar a zona da creche e a regra do ovo/incenso no código
  (`field_daycare.h` e afins). Pronto quando: bebê que só nasce de ovo vira obtível no B2W2 com a fonte do código.
  Sem a regra no código → ⏸.
- **B2 ✅ Ovos nos jogos do PKHeX** (0.35.0) (Black/White, X/Y, ORAS, SM, SwSh, BDSP, SV): grupos de ovo e sexo pela tabela
  pessoal do PKHeX; espécie do ovo pela cadeia de evolução; incensos pela regra da geração (tabela do PKHeX se houver);
  creche: onde o detonado diz (frase com "creche"/"Day Care"/"Nursery"/"Picnic" no SV). Pronto quando: os bebês/pré-
  evoluções que só saem de ovo ganham a fonte `breed` com o ponto da história. Jogo sem creche no detonado → fica fora.
- **B3 ✅ Locais "fora do detonado"** (0.36.0) (BW 14, SwSh 19, SM 9, SV 4, Z-A 7): estimativa pelo nível dos selvagens
  comparado aos times dos líderes, **marcada "estimativa"** na tela. Pronto quando: cada local ganha estágio estimado
  com o motivo; nenhum local muda de estágio quando já tinha estágio do detonado.
- **B4 ⬜ Itens de evolução e Mega Stones sem citação** (SwSh 0/28, Let's Go 0/6, Z-A 0 pedras): tentar frases com o
  nome em português ou genérico ("Pedra do Trovão", "loja de pedras", "Wild Area"). Só com frase que cite o item. Sem
  achado → ⏸ (sem outra fonte permitida).
- **B5 ⬜ FRLG — cavernas e florestas sem posição no mapa** (99/142): conferir as que faltam pela entrada (warp) como foi
  feito no 0.20.0. Pronto quando: sobe o número sem ponto errado (teste de alguns lugares conhecidos).

### Bloco C — Dependem de fonte que não temos (ficam registradas; não executar sem fonte nova)
- C1 Ultra Sun/Ultra Moon sem detonado · C2 golpes reais dos chefes Gens 5–9 · C3 treinadores de rota Gens 5–9 ·
  C4 taxa de aparição Gens 5–9 · C5 posição de itens/TMs Gens 5–9 · C6 15 TMs de loja do B2W2 · C7 mapa da região dos
  jogos sem decomp · C8 fotos dos lugares nos jogos novos. **Ação única permitida:** na etapa final, revisar se alguma
  fonte já disponível passou a cobrir (ex.: PKHeX novo) e registrar; não buscar fonte nova (decisão do usuário).

### Bloco D — Fechamento
- **D1 ⬜ Revisão geral:** STATUS.md reescrito com o que mudou; memória atualizada; `PLANO-SIMULADOR.md` marcado;
  resumo final no fim deste arquivo com: feitas, parciais, puladas (com motivo) e o que espera o usuário.

## Ordem
A1 → A2 → A3 → A4 → A6 → A7 → B1 → B2 → B3 → B4 → B5 → A5 → D1.
(A6 cedo porque o banco lento atrasa todas as outras validações.)

## Registro
- **2026-10-25 — A1 Terastal (0.29.0)**: regra do Showdown (sim/battle-actions.ts, fixado): defesa só no tipo Tera; STAB nos
  tipos originais e no Tera, 2× quando o Tera é um dos originais; poder mínimo 60 no tipo Tera. 103 Pokémon de treinador
  com Tera do detonado lutam terastalizados; o seu pode terastalizar num dos próprios tipos depois da Tera Orb (Mesagoza).
  Banco: vencem 37.697 (igual), folgadas 36.452 → 36.441 (chefes mais difíceis). Achado anotado como A7 (Pupitar nv 42).
- **2026-10-25 — A2 Dynamax (0.30.0)**: 45 Pokémon de chefe com "Dynamax"/"Gigantamax" no detonado lutam dinamaxizados;
  regra do Showdown (data/conditions.ts): 3 turnos, vida × (1,5 + 0,05 × nível) — nível 0 (1,5×) porque o detonado não
  dá o nível; golpes Max com o poder gravado na 0.28.0, sem errar. Você dinamaxiza só em luta onde o chefe dinamaxiza e
  depois da Dynamax Band. Efeitos extras dos golpes Max fora (aviso na tela). Banco: SwSh turnos 1,66 → 1,39; vencem
  37.697; folgadas 36.441 → 36.445. Achado de novo o caso da A7 (Rhydon nv 55 sugerido no estágio 0 do SwSh).
- **2026-10-25 — A3 ⏸**: o detonado do Sun/Moon não tem nenhuma frase de chefe usando golpe Z (busca por "Z-Move",
  "golpe Z", "usará" + Z perto das lutas: só frases de receber cristal). Sem marca por luta → não inventar. Ideia para
  depois: outra fonte com os times dos kahunas (decisão do usuário).
- **2026-10-25 — A4 (0.31.0)**: `megaForm` guarda `preMegaStats`; o chefe Mega na Gen 6 usa a Velocidade de antes no 1º
  turno (quando a troca acaba no 1º turno para os dois). Banco sem mudança (37.697 / 36.445) — caso raro.
- **2026-10-25 — A6 (0.32.0)**: perfil de CPU mostrou `whereToGet` com 2,7 s de 4,8 s (remontava o índice de espécies a
  cada chamada e era chamado várias vezes por candidato). Cache por objeto `acq` (WeakMap) + índice de espécies em cache:
  recomendação 5–9× mais rápida; banco completo ≈ 11 min → 5,7 min com os mesmos números (37.697 / 36.445, relatórios
  idênticos).
- **2026-10-25 — A7 (0.33.0)**: duas causas. (1) Nos 11 jogos do PKHeX faltava `minLevel` (menor nível em que a espécie
  existe por evolução) — o filtro "ainda não evoluiu no nível do seu time" nunca agia (Pupitar via Larvitar no nv 16);
  agora o apply-pkhex-evos calcula como nos jogos com decomp. (2) Com progresso, `reachStage` só conta fontes com nível
  até o do time + 10 (`LEVEL_MARGIN`, estimativa marcada no código e no CHANGELOG). Banco: vencem 37.697 → 37.694 (3 lutas
  do Let's Go em que só ganhava um Pokémon que você não teria naquele nível); folgadas 36.445 → 36.370 (BW −48, LGPE −10,
  SV −12…). Explicado.
- **2026-10-25 — B1 (0.34.0)**: creche do B2W2 na Route 3 (route_3.s); bebê pelo `baby_species` de res/pokemon/*/data.json
  (tabela ARCID_BABYMONS do getChild), incensos pelo `incenseHandler` de sodateya.c (ids → generated/items.txt), nível 1.
  +36 espécies por versão (Abra, Larvitar, Deino…); Bonsly/Budew fora (incenso sem fonte). Novo: a evolução de um bebê
  novo também vira obtível (Kadabra no B2W2; Hitmontop no FRLG pelo Tyrogue). Banco sem mudança (37.694 / 36.370).
- **2026-10-25 — B2 (0.35.0)**: gênero e grupos de ovo pela tabela pessoal de cada jogo (posições lidas do
  PersonalInfo*.cs do PKHeX); bebê de incenso pela regra do PKHeX (Breeding.cs: Gens 4–8; Gen 9 sem) com os incensos da
  tabela da Gen 4; nível 1 (EggMetLevel). Creche e ponto da história pelo detonado (keyItems.daycare: 1ª menção ou a frase
  de "permissão para cruzar" no BW). BW +54, X/Y +48, ORAS +38, SM +30 (+ evoluções: Togetic…), BDSP +15, SwSh +6, SV 0
  (piquenique; já se obtinha). USUM sem detonado; Let's Go/LA/Z-A sem ovos. Banco sem mudança.
- **2026-10-25 — B3 (0.36.0)**: estágio ESTIMADO (marcado `stageEstimated`; a tela diz "estimativa pelo nível") para local
  que o detonado não cita: mediana dos níveis mínimos dos selvagens em terra × o nível mais alto dos treinadores de cada
  estágio. Duas armadilhas achadas: Surf/vara puxavam para o estágio 0 (Route 17 do BW, só água → sem estimativa) e um
  encontro fora do padrão (Pikipek nv 2–3 na Route 10 do SM) → mediana. BW 11 locais, SwSh 19, SM 8, SV 2, Z-A 1.
  Também: o build-detonado-modern deixa as fontes de ovo (`breed`) em paz. Banco: folgadas 36.370 → 36.380 (BW +10).
