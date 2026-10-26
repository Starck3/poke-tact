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
- **A3 ⬜ Chefes com golpe Z** (SM): procurar no detonado frases de golpe Z de chefe (kahunas, capitães). Se não houver
  marca por luta → ⏸ com o motivo (não inventar).
- **A4 ⬜ Gen 6: Velocidade de antes da Mega também para o chefe** no 1º turno (hoje só o seu lado).
- **A7 ⬜ Mundo aberto (SV, LA, Z-A, SwSh Wild Area): nível do selvagem vs. o seu time.** Achado na A1: com progresso
  por insígnia, o SV sugere Pupitar selvagem de nv 42–44 (South Province Area Six, "antes da 1ª insígnia") para um time
  de nv 16. Com o progresso, o motor só olha o estágio. Ideia: no modo estágio também exigir que a fonte tenha nível
  ≤ nível do time + margem (ou marcar "selvagem de nível alto"). Pronto quando: o Pupitar sai/fica marcado nesse caso e
  o banco não perde vitórias sem explicação.
- **A5 ⬜ Legends: Arceus e Z-A** — avaliar: estilo Ágil/Forte (LA) e tempo real (Z-A). Critério: só implementar o que
  tiver regra numa fonte (PKHeX/Showdown/detonado); o resto vira aviso claro na tela. Esperado: ⚠ (aviso melhor).
- **A6 ⬜ Banco de lutas mais rápido** (hoje ≈ 11 min com o Z): cache de `availableMoves`/`statsAt` por candidato e
  pular formas Mega/Z que não podem ganhar. Pronto quando: mesmos números, tempo menor.

### Bloco B — Dados que dá para fazer com as fontes que temos
- **B1 ⬜ Creche no Black 2/White 2** (decomp pokebw2): achar a zona da creche e a regra do ovo/incenso no código
  (`field_daycare.h` e afins). Pronto quando: bebê que só nasce de ovo vira obtível no B2W2 com a fonte do código.
  Sem a regra no código → ⏸.
- **B2 ⬜ Ovos nos jogos do PKHeX** (Black/White, X/Y, ORAS, SM, SwSh, BDSP, SV): grupos de ovo e sexo pela tabela
  pessoal do PKHeX; espécie do ovo pela cadeia de evolução; incensos pela regra da geração (tabela do PKHeX se houver);
  creche: onde o detonado diz (frase com "creche"/"Day Care"/"Nursery"/"Picnic" no SV). Pronto quando: os bebês/pré-
  evoluções que só saem de ovo ganham a fonte `breed` com o ponto da história. Jogo sem creche no detonado → fica fora.
- **B3 ⬜ Locais "fora do detonado"** (BW 14, SwSh 19, SM 9, SV 4, Z-A 7): estimativa pelo nível dos selvagens
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
