# Plano de implementação (2026-10-17, execução autônoma)

Cada **sequência** pode ser executada sozinha (tem entrada, saída, testes e critério de pronto) e depois é unificada na
Sequência U. Regra geral em todas: **ao achar um problema → reproduzir com teste → corrigir → registrar em
`docs/ADICIONAR-JOGO.md`**. Se uma etapa travar (fonte indisponível, formato desconhecido, bloqueio de site), registrar o
motivo em `docs/STATUS.md` e **seguir para a próxima sequência** — nada fica parado esperando.

Regras que valem sempre: não inventar dados (toda informação vem do decomp, da PokéAPI ou do detonado, com a fonte
registrada); acessar sites com ≥5 s entre requisições e parar no 1º erro; não publicar conteúdo de terceiros.

---

## S1 — Campo "Seu inicial"
**Objetivo:** o jogador informa o inicial que escolheu; o app passa a considerar só ele (os outros dois só por troca).

| Passo | Detalhe |
|---|---|
| 1 | Seletor "Seu inicial" na tela do jogo, preenchido com `data.starters` (vem do código do jogo). Fica na URL (`?inicial=`). |
| 2 | Motor: com inicial informado, os outros dois iniciais (e suas evoluções) deixam de ser "obtíveis" — exceto por troca, se a opção de troca estiver ligada. |
| 3 | FRLG: o lendário vagante depende do inicial (`roamer.c`): só ele fica disponível. |
| 4 | Rival: os times do rival dependem do inicial. Descobrir no decomp qual variante (`TRAINER_RIVAL_*_<ESPÉCIE>`) o jogo usa para cada escolha (scripts que testam a variável do inicial) e filtrar a lista de treinadores. |

**Problemas previstos:** (a) nome da variante do rival pode indicar o inicial DO RIVAL, não o do jogador → confirmar pelo script, não pelo nome; (b) Emerald: o vagante (Latios/Latias) depende de outra escolha, não do inicial → manter "um dos dois"; (c) evoluções do inicial (Ivysaur…) também precisam sair.
**Testes:** escolher Charmander remove Bulbasaur/Squirtle (e linhas) das sugestões; Raikou só com Squirtle no FRLG; rival filtrado conforme o script.
**Pronto quando:** testes passam e a tela mostra o seletor funcionando (captura headless).

## S2 — Detonado dentro do app (gerado a partir dos dados)
**Objetivo:** aba "Detonado" na tela do jogo, em português, sem depender de outro site.
**Conteúdo (só fatos, com fonte):** para cada estágio (antes da 1ª insígnia … pós-jogo), na ordem do jogo:
- locais desse estágio; em cada local: Pokémon selvagens (método, níveis, chance), presentes/trocas/estáticos, itens e TMs (com posição x,y), tutores, treinadores com times;
- o líder do estágio (time completo) e o que ele dá (TM, insígnia, HM liberado);
- a Elite dos Quatro e o campeão; seção de pós-jogo.

| Passo | Detalhe |
|---|---|
| 1 | Gerador `scripts/build-walkthrough.mjs <jogo>` → `public/data/<jogo>-walkthrough.json` (estágios → locais → conteúdo). Treinadores por mapa: ligar `trainerbattle TRAINER_X` do script ao mapa (mesma técnica dos NPCs). |
| 2 | Tela: aba Detonado com índice por estágio, busca por local/Pokémon, e destaque do estágio escolhido em "Seu progresso". |
| 3 | Crédito: "ordem da história baseada no detonado do PokeMythology" + link (só crédito, sem copiar texto/imagem). |

**Problemas previstos:** (a) mapas sem estágio → seção "estágio não determinado" (nunca esconder); (b) interiores demais poluem → agrupar por local principal (cidade/rota) usando as portas; (c) treinadores de revanche (Emerald) → só a 1ª luta no detonado; (d) arquivo grande → carregar só ao abrir a aba.
**Testes:** todo líder aparece no seu estágio; o Brock está no estágio 0 com o TM39; Cerulean Cave no pós-jogo; nenhum local some (soma dos locais do detonado = mapas com conteúdo); a aba renderiza (captura headless).

## S3 — Ruby/Sapphire
**Objetivo:** terceiro jogo, seguindo `docs/ADICIONAR-JOGO.md`.

| Passo | Detalhe |
|---|---|
| 1 | Verificar o repositório `pret/pokeruby` (commit fixo) e a **estrutura de arquivos** antes de qualquer código (é o decomp mais antigo — pode usar formatos diferentes). |
| 2 | Configurar em `scripts/games.mjs` (versões ruby/sapphire, sufixos de encontro, iniciais, vagante, ingressos, tutores). |
| 3 | `fetch-decomp` → `build-game` → ler todas as auditorias; baixar o detonado `detonado-ruby-sapphire` (1 requisição). |
| 4 | Adaptar parsers onde o formato diferir, **com teste para cada formato novo**. |

**Problemas previstos:** (a) pokeruby pode ter dados em assembly (`.s`/`.inc`) em vez de `.h`/JSON → escrever parsers novos, mantendo os antigos; (b) diferenças Ruby × Sapphire por `#ifdef`/`.ifdef` (como o Game Corner do FRLG); (c) RS não tem Battle Frontier/tutores do Emerald; (d) RS **não tem relógio-dependente?** — RS TEM relógio (RTC) → verificar evolução por horário no código, não supor; (e) se algum passo travar, entregar o que estiver validado e marcar o resto em `STATUS.md`.
**Testes:** invariantes de `test/datasets.test.mjs` (rodam para todo jogo configurado) + regressões específicas de RS.

## Gerações seguintes (cada uma é uma sequência independente, na ordem abaixo)

Antes delas, **S0 — motor por geração** (pré-requisito de S4 em diante, mas não de S3):
mover para `scripts/games.mjs`/dataset as regras que hoje o motor assume da Gen 3 — tabela de tipos da geração (já vem
da PokéAPI), físico/especial (por tipo até a Gen 3; por golpe a partir da Gen 4), existência de habilidades (não na
Gen 1) e de itens segurados (não na Gen 1), stat "Special" único (Gen 1), golpes/STAB de tipos que não existem.
Testes: os mesmos casos da Gen 3 continuam iguais; casos novos por geração (ex.: Gen 1: Ghost não afeta Psychic — erro
famoso do jogo, que é o valor CERTO para a Gen 1; Gen 2+: 2×).

| Seq. | Jogos | Fonte-da-verdade | Problemas previstos | Se travar |
|---|---|---|---|---|
| **S4 — Gen 1** | Red/Blue, Yellow | `pret/pokered`, `pret/pokeyellow` (**assembly** `.asm`, não C) | parsers novos para `.asm` (learnsets, times, encontros, mapas); Special único; sem habilidades/itens; tabela de tipos da Gen 1 (bugs incluídos); Yellow com Pikachu inicial e times de rival diferentes; versões com exclusivos | entregar dados da PokéAPI marcados "não validado por decomp" e seguir |
| **S5 — Gen 2** | Gold/Silver, Crystal | `pret/pokegold`, `pret/pokecrystal` (assembly) | relógio (manhã/dia/noite muda encontros); itens segurados e evolução por item segurado; Dark/Steel; Special dividido; Kanto pós-jogo | idem S4 |
| **S6 — Gen 4** | Diamond/Pearl, Platinum, HeartGold/SoulSilver | `pret/pokediamond`, `pret/pokeplatinum`, `pret/pokeheartgold` (**incompletos**, NDS) | divisão físico/especial por golpe; formatos de dados de DS (narc/arquivos binários); parte dos dados pode não estar decompilada → PokéAPI como primária, decomp só onde existir | marcar como "validação parcial" e seguir |
| **S7 — Gen 5 a 9** | Black/White … Legends: Z-A | **sem decomp** → PokéAPI + Showdown (mods por geração, só como alerta) + detonados do PokeMythology (times e ordem) | sem posições exatas de NPC/itens; formas regionais (Gen 7+), Mega/Dynamax/Tera (mecânicas que o motor ainda não modela); Let's Go e Legends têm regras próprias (sem habilidades em Let's Go; batalha diferente em Legends) | lançar só "recomendação por tipo/golpe" e o detonado, sem garantias de progresso; listar o que não foi validado |

Regra para todas: um jogo só fica "Disponível" no catálogo quando passa nos invariantes de
`test/datasets.test.mjs`; o que não puder ser validado aparece na tela como "não validado".

## U — Unificação e conferência final
1. `npm run build:data` (todos os jogos) e `npm test` sem falhas.
2. Capturas headless: catálogo, cada jogo, aba Detonado, seletor de inicial.
3. Atualizar `docs/ADICIONAR-JOGO.md` (novos aprendizados) e `docs/STATUS.md` (o que ficou pronto, o que travou e por quê).

---

## R — Qualidade da recomendação (antes da Gen 4) — ✅ concluído (ver STATUS.md)
Problema: a pontuação é `poder × STAB × efetividade × precisão × atk/100` — ignora a defesa do oponente, os níveis, a
categoria do golpe por geração e quanto dano o meu Pokémon RECEBE (só o pior multiplicador de tipo). Ex.: Crystal, Miltank
da Whitney com 2 insígnias → Espeon com Confusion (1×) na frente de lutadores.

Regra: nada de opinião nos testes — só critérios medidos com dados do jogo; a fórmula de dano vem do decomp de cada geração.

- **R0 — Banco de lutas de referência** (`scripts/build-benchmark.mjs` → `reports/benchmark/<jogo>.json`): todos os
  líderes, Elite, Campeão e rivais dos 7 jogos completos, para cada inicial, no estágio da luta e no nível do ás do oponente.
  Para cada luta: as 3 sugestões atuais e as métricas abaixo. Serve de "antes" para comparar.
- **R1 — Métricas objetivas** (por sugestão × cada Pokémon do oponente): golpes para nocautear (meu → ele e ele → mim,
  com os golpes REAIS dele), quem age primeiro, se dá para obter naquele estágio, se o golpe já está disponível (nível /
  origem do TM / tutor no estágio). Taxa de "sugestões ruins": perde a troca de golpes ou não dá para ter na época.
- **R2 — Fórmula de dano por geração**, confirmada no código: Gen 1–2 (pokered/pokecrystal `engine/battle/core.asm`),
  Gen 3 (pokeemerald/pokefirered `CalculateBaseDamage`). Nível, atk/def ou spa/spd conforme a categoria da geração, STAB,
  tipo (tabela da geração), precisão; casos especiais pelo efeito do golpe: dano fixo (Dragon Rage, Sonic Boom, Seismic
  Toss/Night Shade = nível), dois turnos (Solar Beam, Sky Attack, Fly/Dig), recarga (Hyper Beam), autodestruição
  (Explosion/Self-Destruct), golpes de status fora. Sem crítico/aleatoriedade no ranking (usar o dano médio).
- **R3 — Nova pontuação**: razão "golpes que eu aguento ÷ golpes que preciso", com bônus de quem age primeiro; versão
  "contra o time inteiro" do treinador (média/pior caso nos Pokémon dele). Mantém filtros atuais (versão, estágio,
  inicial, troca, lendários).
- **R4 — Testes de regressão**: a taxa de sugestões ruins do banco (R1) não pode subir; casos fixos com critério medido
  (ex.: contra a Miltank da Whitney, ao menos 1 das 3 vence a troca de golpes; nenhuma sugestão fica antes de poder ser
  obtida). Os testes da fórmula conferem exemplos calculados à mão a partir do código.
- **R5 — Tela**: mostrar o porquê ("nocauteia em 2 golpes; aguenta 4"), e o modo "contra o time inteiro".
- Riscos: Pokémon obtível só por troca no jogo (Machop por Abra) → conta só se a troca é possível no estágio; golpes com
  efeito complexo ficam fora do ranking em vez de inventar valor; habilidades (Gen 3) só onde já tratamos (imunidades).

Depois de R: **S6 começa com uma medição** do quanto cada decomp de DS (pokediamond, pokeplatinum, pokeheartgold) está
pronto, antes de portar.

Fontes avaliadas em `Infos2.txt` (2026-10-17, conferido): pret/pokered, pokecrystal, pokeemerald, pokefirered — já usados.
Anaminus/pkm (Gen 3) e projectpokemon/rawdb (DS/3DS) existem, mas **exigem ROM** (pkm testa com dump do Emerald; RawDB lê
os binários do jogo) → fora do projeto (não usamos nem distribuímos ROMs). iPokedex-DB: base antiga, não independente.
Pokémon Wiki: complementar, origem a verificar. O caso "Heat Wave do Charizard no FRLG" já está resolvido: o decomp
confirma nível 1 (`level_up_learnsets.h`), igual ao dataset.

## Ordem de execução
S1 → S2 → S3 → S0 → S4 → S5 → R → S6 → S7 → U. Cada uma é independente: se uma travar, registrar em `STATUS.md` e seguir
para a próxima; U sempre roda no fim (e pode rodar entre elas para consolidar o que já está pronto).

---

# Fase 2 — o que falta (planejado em 2026-10-17, execução autônoma)

Mesmas regras de cima. Cada etapa tem **critério de pronto** e um **plano B**. Regra de troca: se uma etapa não fica pronta
depois de 2 tentativas de correção (ou a fonte não existe/bloqueia), registrar em `docs/STATUS.md` como ⛔ com o motivo e o
ponto exato onde parou, e **passar para a próxima etapa**. Cuidado com memória da máquina: nada de processo longo em segundo
plano; rodar um jogo por vez.

## E1 — HeartGold/SoulSilver (parcial: decomp pret/pokeheartgold em JSON + learnset da PokéAPI) — ✅ concluído (ver STATUS.md)
1. Clonar esparso só `files/poketool/`, `files/fielddata/`, `include/`, `src/` necessários (1 operação git).
2. Núcleo: `personal.json` (atributos, tipos, habilidades), `evo.json`, `waza_oshie.json` (tutores) → auditoria contra a
   PokéAPI; learnset por nível **fica da PokéAPI** (binário `wotbl.narc`) e a tela diz isso.
3. Treinadores (`trainers.json`), encontros (`gs_enc_data.json`: manhã/dia/noite, Headbutt, Rock Smash, enxames, Safari),
   onde obter, progresso (detonado HGSS do PokeMythology, 1 requisição), detonado no app.
- Pronto: auditoria do núcleo 0 divergências (ou explicadas), treinadores com lugar, benchmark rodando, testes verdes.
- Plano B: se o formato dos scripts/eventos não der lugar aos treinadores → publicar só núcleo + treinadores (como a Gen 2 no
  começo) e seguir para E2.

## E2 — Recomendação: confiabilidade da origem (R6) — ✅ concluído (ver STATUS.md)
- Hoje uma sugestão pode depender de enxame (aviso aleatório), Poké Radar, árvore de mel ou sorteio diário. Pontuar a
  ORIGEM: fonte comum (grama/presente/troca) > rara/aleatória; mostrar o aviso na tela. Medir no banco de lutas.
- Pronto: banco sem piora; teste que fixa a regra. Plano B: só mostrar o aviso na tela (sem mudar a ordem).

## E3 — Gens 5–8 sem decomp: segunda fonte para golpes por geração — ✅ concluído (ver STATUS.md)
- A PokéAPI traz prioridade/PP atuais (Gen 9) — já provado no Platinum. Conferir com os dados por geração do Pokémon
  Showdown (mods gen5…gen8, já usados antes como comparação) **só para sinalizar** divergências; corrigir apenas quando
  Showdown e uma 2ª evidência concordarem. Registrar tudo em `reports/<jogo>/moves-crosscheck.json`.
- Plano B: se não der para baixar com segurança → manter o aviso de limite no STATUS e seguir.

## E4 — Iniciais nos jogos da camada PokéAPI (Gens 5–9) — ✅ concluído (ver STATUS.md)
- Fonte: detonado do PokeMythology (lista dos 3 iniciais) + PokéAPI (espécies existem no jogo). Sem fonte confirmada → não
  mostrar o campo. Pronto: campo "Seu inicial" nos jogos onde as duas fontes concordam; teste.

## E5 — Diamond/Pearl — ✅ concluído (núcleo + chefes; ver STATUS.md)
- Remedir o pokediamond (algo virou texto?). Se não: manter camada PokéAPI e registrar. Não reaproveitar dados do Platinum
  (jogo diferente).

## E6 — Unificação — ✅ concluído (capturas pendentes; ver STATUS.md)
- `node scripts/build-game.mjs` de todos os jogos (um por vez), `npm test`, banco de lutas completo, capturas das telas
  principais (catálogo, Platinum, HGSS), atualizar `docs/STATUS.md` e `docs/ADICIONAR-JOGO.md`.

Ordem: E1 → E2 → E3 → E4 → E5 → E6 (E6 também roda ao fim de cada etapa concluída).

# Fase 3 — o que ainda falta (levantado em 2026-10-17, depois do E6)

## Pendências pequenas
1. ✅ Capturas de tela do E6 feitas (Chrome headless pelo DevTools Protocol; 5 erros achados e corrigidos — ver STATUS.md).
2. Revisão humana dos estágios do HeartGold/SoulSilver (regras novas: rota "corredor", guias de caverna no fim do detonado).
   Conferir no app: Route 47/48, Safari Zone, Embedded Tower, Ruins of Alph.

## Diamond/Pearl, ainda parcial
- Faltam onde obter, progresso por insígnia, detonado no app e treinadores comuns (dados em binário no decomp).
- Barry sem filtro pelo inicial: os 3 times aparecem, rotulados pelo inicial que ele leva.
- Quando o pokediamond decompilar encontros e scripts, portar como o Platinum.

## HeartGold/SoulSilver, limites
- Learnset por nível vem da PokéAPI (binário no decomp); o app avisa.
- 10 TMs sem origem (só em binário: Battle Frontier e Pokéathlon).
- Trocas com NPC: só o Pokémon oferecido, não o pedido.
- Os 5 fósseis ficam no pós-jogo (origem dos itens não está nos dados em texto).

## Gens 5 a 9 (sem decomp, 11 jogos)
- Sem treinadores, onde obter, progresso e detonado no app; só escolha manual do oponente e "Seu inicial".
- Golpes conferidos com o Showdown; divergências sem 2ª evidência só registradas (0–4 por jogo).
- Let's Go e Legends: Arceus fora da conferência de golpes (mecânica própria) e sem campo de inicial, como Ultra Sun/Moon
  (sem detonado). Legends: Z-A sem dados na PokéAPI.
- Próximo passo possível: 2ª fonte de treinadores e encontros por jogo (os detonados têm os times dos líderes), validada com
  cuidado — regra: não inventar dados.

## Fechamento — ✅ feito em 2026-10-17/18
- Versionamento: repositório git (github.com/Starck3/poke-tact, privado), `.gitignore` (sem data-sources/ e .cache/),
  `.gitattributes`, README, CHANGELOG, SemVer em package.json, CI (`npm test`), tags v0.1.0 e v0.2.0.
- Interface (v0.2.0): barra de contexto salva, selo de qualidade dos dados, cartões com veredito primeiro, filtros
  recolhidos, escolha do inicial por cartões, atalho `/`, esqueletos/estado vazio, tokens claro/escuro, conferida em
  1280 px e 375 px (sem rolagem horizontal) com `scripts/screenshot.mjs`.
- Ainda aberto daqui: decisão sobre publicar (hospedagem e direitos de uso das fontes) e o peso de `public/data` (42 MB).

## Qualidade da recomendação (opcional)
- O modelo de batalha ignora a maioria das habilidades, itens segurados, clima e golpes de status (sono, paralisia, buffs) —
  afeta sobretudo as Gens 4+.
- O banco de lutas cobre 9 jogos; os sem treinadores não têm como ser medidos.

Recomendação: (1) capturas de tela; (2) revisão dos estágios do HGSS no app. O resto depende de fontes novas.
