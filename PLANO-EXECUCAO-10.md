# Plano de execução 10 — "Vale a pena aprender?" na aba Golpes (2026-11-17)

Pedido do usuário: "Tenho um butterfree no firered e ele quer aprender o Sleep powder, quero conseguir entender se vale a
pena aprender esse". Mesmas regras dos planos anteriores (branch, versão, `> resumo`, teste de regressão, nada inventado).

Decisões do usuário (2026-11-17):
1. Comparar o golpe novo **com os golpes do próprio Pokémon e com as próximas lutas** (os dois).
2. Golpes atuais **estimados pelo nível**, com opção de digitar os 4; o app **guarda** para usar quando outro golpe for aprendido.
3. Fica **dentro da aba Golpes**.

Legenda: ⬜ a fazer · ✅ feita · ⚠ parcial · ⏸ pulada (motivo) · 🚩 problema para revisar com o usuário

| # | Item | Estado |
|---|---|---|
| V1 | Efeito de cada golpe de status por geração (`move-effects.json`, do Showdown + mods Gen 1–8) | ✅ 0.73.0 |
| V2 | Motor: golpes atuais pela linha evolutiva, nota de cada golpe, qual esquecer, regras de quem não pega status | ✅ 0.73.0 |
| V3 | Tela: golpe novo, nível, 4 golpes (estimados ou guardados), veredito, próximas lutas, botão "Aprendi", `?aprender=` | ✅ 0.73.0 |
| V4 | Teste de regressão + `npm run test:ui` + CHANGELOG | ✅ 0.73.0 |

## Registro

- V1 ✅ — 271 golpes de status; todos os 3.322 golpes de status dos 22 jogos têm efeito (o teste exige). Efeito só em código no
  Showdown (Rest, Belly Drum, Curse…) fica "o app não sabe dar nota". A imunidade a pó e de Elétrico à paralisia (Gen 6+) é
  regra no motor, não no arquivo (o Showdown faz isso pela tabela de tipos).
- V2 ✅ — a regra do jogo para os golpes estimados é a mesma do `likelyMoveset` (o mais antigo sai), agora seguindo a linha
  evolutiva: golpe da forma nova só a partir do nível em que evoluiu (evolução sem nível: pedra, troca → não dá para saber).
- V2 🚩 — **as notas são estimativa do app** (sono 3, paralisia 2,5…; dano 3 = o mais forte dele), escritas na tela. Se o
  usuário achar que alguma está errada (ex.: paralisia valendo tanto quanto sono), é trocar `STATUS_VALUE` no motor.
- V3 ✅ — próximas lutas = etapa do progresso escolhido no detonado (líder + treinadores dos lugares). Sem progresso, a tela pede.
  Golpes guardados em `poketact:golpes:<jogo>` (navegador); valem para a evolução.

## Resumo final (2026-11-17)
V1–V4 ✅ em 0.73.0. 🚩 Para o usuário: as notas dos golpes de status são estimativa (V2).

## Continuação — Meu time (0.74.0, 2026-11-17)

Pedido do usuário: "quero entrar no app e escrever qual o meu time atual, nível de cada Pokémon e golpes e com isso conectar
a essa etapa de golpes que vale a pena aprender".

| # | Item | Estado |
|---|---|---|
| V5 | Aba **Meu time**: até 6 Pokémon, nível e golpes (estimados ao adicionar, corrigíveis), guardado por jogo | ✅ 0.74.0 |
| V6 | Aba Golpes: atalhos do time; "Vale a pena aprender?" usa e atualiza o membro do time; "pôr no meu time" | ✅ 0.74.0 |
| V7 | Teste da tela (4 verificações) + teste de regressão (nomes de função repetidos no app.mjs) + CHANGELOG | ✅ 0.74.0 |

Escolhas minhas (sem pergunta, fáceis de mudar): aba própria "Meu time" (e não um bloco na Recomendação); o time ainda **não**
alimenta a aba Recomendação (o "Nível do seu time" continua separado) — 🚩 próximo passo possível, se o usuário quiser.

## Continuação — Meu time na tela inicial (0.75.0, 2026-11-17)

Pedido do usuário: "Queria que a opção de montar o time ficasse na tela inicial".

| # | Item | Estado |
|---|---|---|
| V8 | Bloco **Meu time** na tela inicial (escolhe o jogo; mesmo editor e dados da aba) + `?aba=golpes&time=<n>` | ✅ 0.75.0 |

Escolha minha: a aba Meu time dentro do jogo **continua** (mesmos dados); se o usuário quiser só na tela inicial, é tirar a aba.
