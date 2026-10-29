# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões em [SemVer](https://semver.org/lang/pt-BR/).

## [0.64.0] — 2026-10-28

> Manutenção por dentro: remontar um jogo sem mudança real não altera mais nenhum arquivo (antes a data de montagem mudava sempre e sujava o histórico). Nada muda na tela.

### Alterado
- `builtAt` estável (`scripts/lib/built-at.mjs`): `build-game` compara `public/data/<jogo>.json` com o git e, se só a data
  mudou, mantém a do git; `build-catalog` faz o mesmo com `games.json`. Conferido: remontar Red/Blue e X/Y inteiros deixa
  zero arquivos alterados (também mostra que a montagem é determinística).

## [0.63.0] — 2026-10-28

> Manutenção por dentro: remontar os dados duas vezes agora dá sempre o mesmo resultado (um verificador confere isso). Nada muda na tela. O Darkest Day saiu da lista "a revisar" — já foi decidido.

### Adicionado
- `node scripts/check-idempotent.mjs <jogo> [etapa …]`: roda cada etapa duas vezes seguidas e compara `public/data`; sem
  etapas, também roda o ciclo inteiro sobre a montagem salva no git (tem que devolver o mesmo dado). Restaura pelo git no fim.

### Corrigido
- Scarlet/Violet: a nota dos exclusivos de versão era acrescentada de novo a cada vez que a etapa rodava. Os 22 jogos
  passam no verificador.

### Documentação
- STATUS.md e plano 5: Darkest Day e item pela 1ª citação marcados como decididos (0.62.0); grupo 2 (fonte nova) no backlog.

## [0.62.0] — 2026-10-28

> Nova opção "Tenho as DLCs": sem marcar, o app não sugere Pokémon que só existem nas expansões pagas (Sword/Shield, Scarlet/Violet, Z-A). E os Pokémon nível 60 da Wild Area agora contam só depois de zerar o jogo.

### Adicionado
- **Filtro "Tenho as DLCs"** (em Filtros, só nos jogos com expansão; desmarcado por padrão e lembrado por jogo): sem ele, o
  cálculo ignora as fontes das DLCs (Isle of Armor, Crown Tundra, Kitakami, Blueberry, Mega Dimension) e o que só se
  consegue evoluindo algo delas. Sword/Shield: 642 → 396 Pokémon obtíveis; Scarlet/Violet: 676 → 404; Z-A: 380 → 242.

### Alterado
- Wild Area do Sword/Shield: encontro de nível 60 ou mais conta como pós-jogo ("depois do Darkest Day, todos os Pokémon da
  Wild Area ficam no nível 60" — Bulbapedia), não mais "8 insígnias".
- Item de evolução só citado no detonado continua valendo a partir da 1ª citação (cauteloso).
- Banco de lutas (calculado com as DLCs): vitórias iguais; folgadas no Sword/Shield 3.231 → 3.225.

## [0.61.0] — 2026-10-28

> Por dentro: os jogos agora são montados na ordem certa (um remake depois do jogo original de onde tira dados), e uma fonte que falta não deixa mais um arquivo antigo no lugar sem avisar.

### Corrigido
- Montagem na ordem certa: Omega Ruby/Alpha Sapphire depois do Ruby/Sapphire, Brilliant Diamond/Shining Pearl depois do
  Diamond/Pearl, Let's Go depois do Yellow, Ultra Sun/Ultra Moon depois do Sun/Moon e Z-A depois do Scarlet/Violet. Antes,
  `build-game` sem argumentos montava o Omega Ruby/Alpha Sapphire com o Ruby/Sapphire da rodada anterior. Montando só o
  dependente sem o outro pronto, para com erro.
- O estágio pelo jogo original não vira mais "mapa vazio" em silêncio quando o arquivo dele falta (agora é erro).
- Detonado configurado mas fora de `data-sources/`: o aviso diz que o arquivo anterior foi mantido; com
  `node scripts/build-game.mjs --strict` a montagem falha.

## [0.60.0] — 2026-10-28

> As sugestões agora dizem com que nível e progresso foram calculadas, com um atalho para mudar. No Sword/Shield o clima não aparece mais repetido em inglês. E o app ganhou um teste automático da tela num navegador.

### Adicionado
- Linha acima das sugestões: "Calculado com o seu time no nv 14 · antes da 1ª insígnia — mudar" (o app ajusta os dois ao
  escolher a luta, e o campo fica longe).
- **Teste da tela** (`npm run test:ui`): abre o app num Chrome/Edge headless, sem instalar nada, e confere o Brock pelo
  seletor e pelo link, o aviso de treino do Mankey, a 1ª luta da Nemona, o ovo na creche, as abas, o celular e que não há
  erro de JavaScript nem arquivo faltando. Sem navegador instalado, é pulado.
- Ícone da aba do navegador.

### Corrigido
- Sword/Shield: o "[clima: Overcast]" das tabelas do jogo repetia em inglês o que a taxa por clima já diz.
- Jogo sem mapa da região não pede mais o arquivo do mapa (dava "não encontrado" no navegador).

## [0.59.0] — 2026-10-28

> O banco de lutas agora também mede as sugestões que dependem de algo que o app não sabe quando fica disponível. Item de evolução e TM sem lugar: zero em todos os jogos. Ainda há Pokémon só com estágio estimado (DLCs do Sword/Shield).

### Adicionado
- Banco de lutas: cada sugestão marca o que usa sem fonte certa (item de evolução sem lugar, Pokémon só em fonte de estágio
  estimado, TM ou tutor sem lugar) e o resumo de cada jogo conta essas sugestões. Resultado: 0 por item, TM ou tutor; 655
  por estágio estimado — Sword/Shield 551 (áreas das DLCs, onde o nível acompanha as insígnias), Ultra Sun/Ultra Moon 83
  (Ultra Space, no pós-jogo) e Scarlet/Violet 21.

## [0.58.0] — 2026-10-28

> Cada sugestão agora diz até onde treinar o Pokémon: "Capture no nv 2–5 e treine até o nv 11 — aprende Karate Chop no nv 11". Na aba Detonado, o ovo aparece como "ovo na creche".

### Adicionado
- **Aviso de treino no card da sugestão**: quando o Pokémon é capturado (ou recebido) num nível mais baixo que o necessário,
  o card diz o nível de captura, até onde treinar e por quê (evoluir e/ou aprender o golpe), e lembra o nível do time usado
  na conta.

### Corrigido
- Aba Detonado: o tipo "breed" aparecia em inglês; agora "ovo na creche" (e "inicial", "errante", "ovo de presente").

## [0.57.0] — 2026-10-28

> O Sword/Shield agora mostra a frequência de cada Pokémon por clima ("só com nublado 40%"). A aba Detonado passou a bater com o Onde capturar, e o link de uma luta já ajusta o nível do seu time.

### Adicionado
- **Taxa de aparição no Sword/Shield** pela Bulbapedia, por clima: 2.417 de 3.490 encontros. A seção da página separa
  encontro escondido na grama de encontro no mapa; curry, raid e Dynamax Adventure ficam sem taxa.
- Item de evolução sem linha na Bulbapedia, mas citado no detonado, passa a valer a partir do trecho que o cita
  (Auspicious Armor no Scarlet/Violet: Zapapico). Antes não limitava nada: o Armarouge era sugerido na 1ª luta contra a
  Nemona.

### Corrigido
- A aba Detonado dos jogos sem decomp é montada depois de todas as etapas da Bulbapedia: o ponto da história de cada
  Pokémon e o lugar das trocas batem com o Onde capturar (Sword/Shield tinha 440 encontros em pontos diferentes).
- Abrir uma luta por link (atalhos da tela inicial, busca "ir para a luta") agora também ajusta o nível do time e o
  progresso, como o seletor (0.53.1 só tratava o seletor).
- O aviso "Disponibilidade" dizia que ovos não contam; contam desde a 0.23.

### Alterado
- Banco de lutas: vitórias iguais; folgadas no Scarlet/Violet 5.517 → 5.511 (sem o Armarouge antes da hora).

## [0.56.0] — 2026-10-28

> As trocas com personagens do jogo agora dizem onde acontecem e em que ponto da história (Farfetch'd em Santalune City no X/Y, Machop na Route 2 no Sun/Moon, as trocas da League Club Room no Scarlet/Violet).

### Adicionado
- **Lugar e ponto da história das trocas dentro do jogo** pela página "In-game trade" da Bulbapedia (o PKHeX não diz onde
  é a troca; aparecia "a Link Trade"): X/Y, Sun/Moon e Scarlet/Violet. No Scarlet/Violet, as 30 trocas sem nome são as da
  League Club Room (The Indigo Disk). Encontros sem ponto da história: Scarlet/Violet 72 → 6, X/Y 18 → 12, Sun/Moon 14 → 4.
- Lugar sem selvagem (cidade) pega o ponto da história dos treinadores que lutam lá.

### Alterado
- Banco de lutas: sem mudança.

## [0.55.0] — 2026-10-28

> No Sword/Shield, os Pokémon da Wild Area agora aparecem no ponto certo da história pela regra do jogo: sem insígnia só dá para capturar até o nível 20, e cada insígnia sobe esse limite.

### Alterado
- **Wild Area do Sword/Shield** pelo limite de captura por insígnia (Bulbapedia, página "Badge"): até nv 20 sem insígnia,
  25 com 1 … 55 com 7, qualquer nível com 8. A Wild Area abre inteira no começo, então o ponto da história de cada encontro
  é o nº de insígnias que deixa capturar o nível mínimo dele. Troca 835 estimativas pelo nível e 879 estágios que vinham da
  citação no detonado (Watchtower Ruins, Lake of Outrage, Giant's Cap… estavam todos no pós-jogo).
- Raids e as áreas das DLCs (Isle of Armor, Crown Tundra) continuam estimadas: lá o nível acompanha as insígnias.
- Banco de lutas: sem mudança.

## [0.54.0] — 2026-10-28

> O Black/White agora mostra a frequência de cada Pokémon. No Scarlet/Violet, os exclusivos de versão saíram da versão errada: Larvitar só no Scarlet, Bagon só no Violet, Raikou só no Scarlet, e assim por diante.

### Adicionado
- **Taxa de aparição no Black/White** pela Bulbapedia: 562 de 1.016 encontros. Grama que mexe, poeira, sombra, água
  agitada, aparição em massa e os moradores da White Forest ficam sem taxa (são fenômenos, sem uma taxa simples).
- **Exclusivos de versão no Scarlet/Violet** pela página "Version-exclusive Pokémon" da Bulbapedia: o PKHeX não separa as
  versões nos selvagens. A lista do jogo base vale em Paldea; a de cada DLC só nas áreas da DLC (Gligar é do Scarlet só em
  Kitakami). Raid Tera já vinha separada e fica. 74 espécies/versão deixam de ser obtíveis (inclusive as evoluções, como
  Tyranitar no Violet). O aviso "exclusivos aparecem nas duas versões" saiu da tela.

### Alterado
- Banco de lutas: vitórias iguais; folgadas no Black/White 2.344 → 2.356 e no Scarlet/Violet 5.536 → 5.517 (sem os
  exclusivos da outra versão).

## [0.53.1] — 2026-10-26

> Ao escolher um treinador, o nível do seu time e o progresso passam a ser os da luta (Brock: nível 14, nenhuma insígnia). Antes ficava o nível 30 e o app sugeria Pokémon e golpes que só se conseguem bem depois.

### Corrigido
- Escolher um treinador agora preenche "Nível do seu time" com o nível do Pokémon mais forte dele e o "Progresso" com o
  ponto da história da luta (líder pela ordem das insígnias). Com o padrão (nível 30, sem progresso), o Brock no FireRed
  recebia Butterfree e Beedrill com Giga Drain e Squirtle com Surf. Os dois campos continuam editáveis depois.

## [0.53.0] — 2026-10-26

> Mais chefes lutam com os golpes de verdade (Leon e Marnie nos torneios, Jessie e James no Let's Go, Geeta, Klara, Avery e outros): 878 de 960 lutas dos jogos novos, antes 803.

### Adicionado
- Golpes reais pela Bulbapedia em mais 75 lutas (803 → 878 de 960):
  - forma no nome do app ("morpeko-full-belly", "aegislash-shield", "darmanitan-standard") casa com a espécie da página;
  - lutas em que o nível acompanha o jogador (torneios do Sword/Shield, revanches do Scarlet/Violet e do Z-A): a página
    deixa o nível em branco, e o time casa quando todas as espécies batem — se dois times assim tiverem golpes diferentes,
    a luta fica com os golpes estimados;
  - lutas em dupla ({{Party/2}}): Jessie e James no Let's Go, Jupiter e Mars no BDSP, Tierno e Trevor no X/Y;
  - Sun/Moon: times marcados só com a letra da versão ("S"/"M"); Legends: Arceus: o time de Alfas do Ingo.
- Ultra Sun/Ultra Moon: duas lutas do Faba no Episode RR (pós-jogo).

### Corrigido
- Entre dois times da página que servem, vence o de nível mais perto (Calem nv 31/33 pegava a 1ª luta, nv 28/30; agora a
  2ª). Time com nível vence time sem nível (Gwynn no Z-A continua com a 1ª luta).
- Leitor da Bulbapedia: "&nbsp;" no meio do golpe ("Revelation&nbsp;Dance") e campos colados ("| move1 = Light Screen
  |move1type=Psychic").
- Legends: Z-A: `build-game` agora refaz o detonado e as etapas da Bulbapedia (antes uma reconstrução perdia a ordem da
  história). Jogos com decomp da Gen 3 e o Black 2/White 2 mostram a creche na aba Detonado depois de reconstruídos.

### Alterado
- Banco de lutas: vitórias iguais; folgadas no Scarlet/Violet 5.530 → 5.536 e no Z-A 830 → 831.

## [0.52.0] — 2026-10-26

> O Brilliant Diamond/Shining Pearl agora mostra a frequência de cada Pokémon (manhã, dia e noite). O Ultra Sun/Ultra Moon ganhou a creche do Paniola Ranch e sabe quais lugares são do pós-jogo.

### Adicionado
- **Taxa de aparição no Brilliant Diamond/Shining Pearl** pela Bulbapedia: 1.435 de 1.575 encontros, com manhã/dia/noite
  ("manhã 50% / dia 50% / noite 40%"). O Grand Underground e a árvore de mel ficam sem taxa (a conta é outra).
- **Creche no Ultra Sun/Ultra Moon**: a página do Paniola Ranch na Bulbapedia diz que a Pokémon Nursery fica lá; 75 Pokémon
  passam a ser obtidos por ovo (ex.: Treecko de um Grovyle do Island Scan).
- Ultra Sun/Ultra Moon: lugares do pós-jogo pelo índice do detonado da Bulbapedia (Poni Grove, Ruins of Conflict, Lake of
  the Sunne no Ultra Sun), pela página do Episode RR (castelo da Equipe Rocket) e, como estimativa marcada, Ultra Space
  (viagem livre só depois do Campeão) e Poni Meadow/Resolution Cave (pós-jogo no Sun/Moon). Sem ponto da história ficaram
  só a Poké Pelago (muda com o avanço), trocas e ovos de presente: 273 → 66.
- Aba Detonado: a creche aparece no ponto da história dos ovos também no X/Y, Omega Ruby/Alpha Sapphire e Sun/Moon.

### Corrigido
- Encontro "Grama" do PKHeX no mesmo lugar de um encontro de Surf ou vara não pega mais a taxa do Surf (Wingull na Route 213
  do BDSP: grama 20%, surf 30%) — antes ficava ambíguo, sem taxa.
- O índice do detonado da Bulbapedia separa "Altar of the Sunne / Altar of the Moone" e respeita a versão de cada um; rótulo
  de missão em negrito ("Guardians of Alola:") não esconde mais o lugar.
- Black/White: a linha da creche no Detonado vinha no trecho do Dreamyard, antes da permissão para cruzar (Nimbasa); agora
  fica no mesmo ponto dos ovos. A linha também não some mais quando o jogo é reconstruído do zero.

### Alterado
- Banco de lutas: vitórias e folgadas iguais em todos os jogos.

## [0.51.0] — 2026-10-26

> A frequência com que cada Pokémon aparece agora também está no Omega Ruby/Alpha Sapphire, no Sun/Moon, no Ultra Sun/Ultra Moon e no Let's Go. Nos jogos de Alola ela vem separada por dia e noite (ex.: "Route 1 — Grama, nv 2–13 (só de noite 30%)").

### Adicionado
- **Taxa de aparição** pela Bulbapedia em mais quatro jogos: Omega Ruby/Alpha Sapphire (552 de 1.208 encontros), Sun/Moon
  (607 de 878), Ultra Sun/Ultra Moon (730 de 948) e Let's Go (604 de 1.016). Encontro escondido do DexNav, chamado SOS, horda
  e os raros que aparecem em qualquer rota do Let's Go ficam sem taxa (a tabela não dá um número para eles).
- Em Alola, a taxa mostra o período: "dia 20% / noite 10%" ou "só de noite 30%".

### Corrigido
- Página da Bulbapedia que redireciona para o mesmo nome com outra caixa ("Berry Fields" → "Berry fields") travava o
  programa no Windows; agora o destino é guardado à parte.

### Alterado
- Banco de lutas: vencem igual; folgadas no Let's Go 1.018 → 1.021. O Brilliant Diamond/Shining Pearl ficou para depois (o
  site da Bulbapedia respondeu com erro e o programa parou, como manda a regra).

## [0.50.0] — 2026-10-26

> No X/Y, a tela "Onde capturar" agora mostra com que frequência cada Pokémon aparece (ex.: "Santalune Forest — Grama, nv 3–4 (6%)") e como ele é encontrado (grama, surf, vara boa, teto da caverna…). Um Pokémon que quase nunca aparece deixa de ser sugerido.

### Adicionado
- **Taxa de aparição no X/Y** pela Bulbapedia (tabela de captura da página de cada lugar): 666 de 708 encontros
  selvagens. Casada por lugar, espécie, forma e faixa de nível; quando duas linhas servem com taxas diferentes, fica sem taxa.
  Taxa aproximada na tabela ("~80%") aparece com "~".
- O jeito de encontrar vem da mesma tabela (Grama, Flores amarelas, Surf, Vara velha/boa, Super vara, Teto da caverna…), no
  lugar do "Selvagem" genérico.

### Alterado
- Banco de lutas: vencem igual; folgadas no X/Y 2.451 → 2.445 (o Abomasnow da Route 17 aparece 1% das vezes e agora conta
  como raro).

## [0.49.0] — 2026-10-26

> O Ultra Sun/Ultra Moon entrou no banco de lutas que mede as recomendações. Com isso, a luta contra o Hau agora mostra o time certo para a inicial que você escolheu, e algumas lutas desse jogo foram para o ponto certo da história.

### Adicionado
- **Ultra Sun/Ultra Moon no banco de lutas**: sem detonado, as lutas vêm dos treinadores que já têm ponto da história
  (174 lutas, 2.106 sugestões).
- **Time do rival pela inicial** no USUM: a Bulbapedia marca qual inicial o jogador escolheu (Hau e Gladion); antes os três
  times apareciam juntos.

### Corrigido
- Lutas da provação da Mina (capitães, nível 51) estavam no começo do jogo (lugar de origem do capitão); agora ficam na
  provação da Mina.
- Lutas em lugares que o jogador revisita: o Hala nível 63 em Iki Town ia para o começo (agora pós-jogo); Faba, Guzma, Dulse
  e Soliera nível 43–47 iam para o pós-jogo (agora antes de Poni). Esse ponto é estimado pelo nível e fica marcado.
- Lutas em que o Hau, o Gladion ou o Guzma lutam ao seu lado não contam mais como luta contra você.

### Alterado
- Banco de lutas: 22 jogos; vencem 37.687 → 39.793 (todas as novas são do USUM; os outros jogos ficaram iguais).

## [0.48.0] — 2026-10-26

> Agora o app sabe onde comprar os incensos nos jogos mais novos, então bebês como Munchlax, Bonsly e Budew passam a aparecer como "nasce de ovo na creche" no Black/White, Black 2/White 2, X/Y, Omega Ruby/Alpha Sapphire, Sun/Moon e Sword/Shield.

### Adicionado
- **Incensos nos jogos novos** pela Bulbapedia: quando a tabela diz só "Market", o app olha para onde o link aponta
  ("Driftveil City") e casa com o lugar que já conhece. "(post-National Pokédex)" vira pós-jogo. As cidades das lutas
  com ponto da história também valem como lugar conhecido (Coumarine City no X/Y).
- Com isso nenhum jogo fica mais com "bebê sem incenso" na creche. No Black 2/White 2 entram 76 Pokémon novos pela creche.

### Alterado
- Testes antigos que usavam Munchlax/Bonsly como exemplo de "não nasce" agora conferem que nascem com o incenso; o exemplo de
  família fora do jogo passou a ser Cosmog/Cosmoem no Scarlet.
- Banco de lutas: vencem 37.687 (igual); folgadas 35.842 → 35.860 (Omega Ruby/Alpha Sapphire +18).

## [0.47.0] — 2026-10-26

> Os rivais dos jogos mais novos agora também lutam com os golpes de verdade: Hop no Sword/Shield, Barry no Brilliant Diamond/Shining Pearl e Trace no Let's Go. Começa também o plano 4, com o que sobrou.

### Adicionado
- **Golpes reais dos rivais** pela Bulbapedia: o app agora segue a subpágina com todos os times (Hop) e a página certa
  quando o nome é ambíguo (Barry, Dawn, Trace). Lutas com golpes reais: Sword/Shield 48 → 73 de 96, Brilliant Diamond/Shining
  Pearl 45 → 72 de 74, Let's Go 34 → 50 de 57.
- **Plano de execução 4** (`PLANO-EXECUCAO-4.md`) com o que sobrou do plano 3.

### Alterado
- Banco de lutas: vencem 37.687 (igual); folgadas 35.852 → 35.842.

## [0.46.0] — 2026-10-26

> O Ultra Sun/Ultra Moon agora tem progresso pelas provações, como o Sun/Moon: os locais e os treinadores ganham o ponto da história. E os lugares que antes tinham só um ponto estimado pelo nível passam a usar a ordem do detonado da Bulbapedia.

### Adicionado
- **Progresso no Ultra Sun/Ultra Moon** pela ordem do detonado da Bulbapedia: as 8 provações e as 4 grandes provações (com
  a da Mina), na ordem. Os lugares de captura (2.096 fontes) e 98 das 100 lutas ganham o ponto da história; a escolha de
  progresso aparece nesse jogo.
- **Lugares que tinham ponto estimado pelo nível** (Sun/Moon, Black/White, Scarlet/Violet) agora usam a parte do detonado
  da Bulbapedia em que aparecem — ex.: a Route 9 do Sun/Moon sai do começo e vai para depois da 5ª provação.

### Alterado
- Banco de lutas: vencem 37.687 (igual); folgadas 35.862 → 35.852.

## [0.45.0] — 2026-10-26

> No Legends: Arceus, a luta agora segue a ordem de ação do jogo: um Pokémon bem mais rápido pode atacar duas vezes antes do outro, e o app leva isso em conta.

### Adicionado
- **Ordem de ação do Legends: Arceus** (regra da Bulbapedia, página "Action order"): cada Pokémon age quando o seu "tempo
  de ação" acaba, e esse tempo depende da Velocidade (de 14 para os mais lentos a 5 para os mais rápidos). O cálculo da luta
  compara quando cada um nocauteia o outro. O aviso "ordem de ação" saiu da tela.
- Continuam fora (sem a regra em números): os estilos Ágil e Forte e os valores de golpe próprios do jogo.

## [0.44.0] — 2026-10-26

> No Black 2/White 2, as 15 TMs vendidas em lojas (Sunny Day, Hyper Beam, Blizzard, Thunder…) agora dizem onde comprar e em que ponto da história.

### Adicionado
- **TMs de loja do Black 2/White 2** pela Bulbapedia (o código do jogo não tem as lojas em texto): Sunny Day, Rain Dance,
  Hail e Sandstorm em Mistralton; Light Screen, Reflect, Thunder Wave e Gyro Ball em Nimbasa; Blizzard, Thunder e Fire
  Blast em Lacunosa; Hyper Beam e Giga Impact no Shopping Mall Nine; Calm Mind e Bulk Up em Striaton — com o ponto da
  história de cada lugar. Agora as 101 TMs/HMs do jogo têm origem.

## [0.43.0] — 2026-10-26

> O Ultra Sun/Ultra Moon, que não tinha nenhum treinador (não há detonado dele), agora tem 100 lutas para escolher — kahunas, capitães, Elite, rivais e vilões — com os times e golpes de verdade, tirados da Bulbapedia.

### Adicionado
- **Treinadores do Ultra Sun/Ultra Moon** pela Bulbapedia: kahunas (Hala, Olivia, Nanu, Hapu), capitães, Elite (Molayne,
  Olivia, Acerola, Kahili), Hau, Gladion, Kukui, Equipe Skull, Aether e a Ultra Recon Squad — 100 lutas, 363 Pokémon, com
  golpes, itens e golpe Z reais (45 Pokémon usam Z) e formas de Alola.
- Ainda sem a ordem da história nesse jogo: o progresso por provação não aparece no USUM.

## [0.42.0] — 2026-10-26

> Detalhe no FireRed/LeafGreen: o S.S. Anne agora aparece no mapa da região quando um Pokémon é encontrado lá.

### Corrigido
- **Mapa da região (FireRed/LeafGreen)**: "Ssanne Exterior" (o convés do S.S. Anne) não casava com o ponto "S.S. Anne" do
  mapa. Agora 142 de 143 locais têm ponto; o único sem é o Pokémon que anda pelo mapa, que não tem lugar fixo.

## [0.41.0] — 2026-10-26

> No Sword/Shield, os golpes Max agora também trazem os efeitos extras que têm no jogo — subir o Ataque, baixar a Defesa do adversário, chamar sol, chuva ou terreno — e isso entra na conta da luta.

### Adicionado
- **Efeitos extras dos golpes Max** (Sword/Shield), lidos do Pokémon Showdown: Max Knuckle (+1 Ataque), Max Ooze (+1 Ataque
  Especial), Max Phantasm (−1 Defesa do alvo), Max Flare (sol: Fogo mais forte, Água mais fraca), Max Geyser (chuva), Max
  Lightning/Overgrowth/Mindstorm (terreno: o tipo bate 1,3×) e os outros. Valem nos turnos seguintes, para os dois lados.
- Fica fora da conta: Velocidade, dano de areia/granizo e os efeitos próprios dos golpes G-Max.
- Banco de lutas: no Sword/Shield a média de turnos para nocautear cai de 1,40 para 1,32.
- O nível de Dynamax dos líderes não está na Bulbapedia: a vida dinamaxizada segue 1,5× (marcado na tela).

## [0.40.0] — 2026-10-26

> O app agora sabe onde achar os incensos nos jogos do GBA (pela Bulbapedia), e por isso Azurill e Wynaut passam a aparecer como Pokémon que se conseguem por ovo no Ruby/Sapphire, Emerald e FireRed/LeafGreen.

### Adicionado
- **Incensos pela Bulbapedia** nos jogos em que o código do jogo não dizia onde achar: Sea Incense e Lax Incense no Mt.
  Pyre (Ruby/Sapphire, Emerald) e na Lost Cave (FireRed/LeafGreen). Com eles, Azurill (e Wynaut onde não vinha de presente)
  nascem na creche com o incenso.
- Nos jogos novos, o incenso é vendido em lojas que o app ainda não liga a um lugar — esses bebês continuam fora.

### Corrigido
- O gerador das citações do detonado deixava de rodar nos jogos que ganharam a lista de itens da Bulbapedia (0.39.0) e
  apagaria as linhas da Bulbapedia ao regravar — agora mantém as duas.

## [0.39.0] — 2026-10-26

> Agora o app diz onde achar as pedras de evolução e as Mega Stones também no Sword/Shield, no Z-A e nos outros jogos mais novos (pela Bulbapedia), e só sugere um Pokémon que evolui por pedra depois do ponto em que dá para achar a pedra.

### Adicionado
- **Onde achar itens de evolução e Mega Stones** nos jogos sem decomp, pela Bulbapedia: Sword/Shield 28 de 28 itens (o
  detonado não citava nenhum), Z-A 114 de 115 (pedras e Mega Stones), Sun/Moon, Let's Go, BDSP, Legends: Arceus,
  Scarlet/Violet, X/Y e ORAS. Aparece na árvore de evoluções ("Achado: …", "Loja, presente ou prêmio: …") e no cartão Mega,
  com o crédito.
- Quando o lugar da pedra é um local que o app conhece, ele ganha o ponto da história — e a evolução por pedra passa a
  respeitar esse ponto nas sugestões.

### Alterado
- Banco de lutas: vencem 37.694 → 37.687 (7 lutas do Let's Go em que a pedra só aparece depois); folgadas 35.915 → 35.864.

## [0.38.0] — 2026-10-25

> Os chefes dos jogos mais novos (Black/White até Z-A) agora lutam com os golpes de verdade, tirados da Bulbapedia, e não mais com golpes estimados pelo nível. No Sun/Moon, os kahunas e capitães usam o golpe Z deles.

### Adicionado
- **Fonte nova: Bulbapedia** (liberada pelo usuário). Baixada devagar (5 s por página), guardada só no computador e usada
  para completar o que o código do jogo e o PKHeX não têm; a tela dá o crédito.
- **Golpes reais dos chefes** (líderes, Elite, campeões, rivais, vilões) nos jogos sem decomp: 635 das 1.098 lutas — ex.:
  Black/White 69 de 76, Sun/Moon 76 de 81, Scarlet/Violet 110 de 145. Nas outras, os golpes continuam estimados pelo nível.
- **Golpe Z dos chefes** (Sun/Moon): 29 Pokémon, como o Crabrawler do Hala com All-Out Pummeling no 1º turno.
- A tela diz de onde vêm os golpes do oponente ("do time na Bulbapedia").

### Alterado
- Banco de lutas: vencem 37.694 (igual); folgadas 36.380 → 35.915 — com os golpes de verdade, os chefes ficaram mais duros.

## [0.37.0] — 2026-10-25

> Pequenos ajustes: no Let's Go o app agora sabe onde se ganha a Charizardite Y, e as creches aparecem no mapa da região.

### Corrigido
- **Let's Go**: o detonado diz "você receberá … Charizardite X e Y" — antes só a X contava; agora as duas mostram onde achar.
- **Mapa da região**: a creche (onde nascem os ovos) aparece no mapa — ex.: Four Island no FireRed/LeafGreen.
- O relatório de itens citados conta os itens de evolução e as Mega Stones juntos (mostrava números como "41/25").
- Fica registrado: o detonado do Sword/Shield e o do Z-A não dizem onde achar nenhuma pedra de evolução ou Mega Stone.

## [0.36.0] — 2026-10-25

> Locais que o detonado não cita (como várias rotas do Black/White e a Wild Area do Sword/Shield) agora ganham um ponto da história estimado pelo nível dos Pokémon selvagens, sempre marcado como estimativa.

### Adicionado
- **Ponto da história estimado** para os locais que o detonado não cita (Black/White, Sword/Shield, Sun/Moon,
  Scarlet/Violet, Z-A): o nível dos Pokémon selvagens em terra do local comparado ao nível dos treinadores de cada parte da
  história. Aparece como "(estimativa pelo nível)" na aba Onde capturar. Locais só de água (Surf/vara) ficam sem
  estimativa.
- Banco de lutas: folgadas 36.370 → 36.380 (Black/White).

### Corrigido
- Regerar o detonado dos jogos novos apagava o ponto da história dos ovos da creche; agora não mexe neles.

## [0.35.0] — 2026-10-25

> Os ovos da creche chegaram aos jogos mais novos: no Black/White, X/Y, Omega Ruby/Alpha Sapphire, Sun/Moon, Sword/Shield e Brilliant Diamond/Shining Pearl, os Pokémon que só se conseguem por ovo aparecem em Onde capturar.

### Adicionado
- **Ovos da creche nos jogos sem decomp** (tabelas do jogo pelo PKHeX): gênero e grupos de ovo de cada espécie, a regra
  dos bebês de incenso (até a Gen 8; no Scarlet/Violet não existe) e o nível 1 ao chocar. Onde fica a creche e em que ponto
  da história ela libera os ovos vêm do detonado (no Black/White, só depois que o detonado diz que se pode cruzar).
  Black/White +54, X/Y +48, ORAS +38, Sun/Moon +30 (e as evoluções deles, como Togetic), BDSP +15, Sword/Shield +6.
- Scarlet/Violet: os ovos saem do piquenique; tudo o que nasce de ovo já se obtinha de outro jeito.

## [0.34.0] — 2026-10-25

> A creche do Black 2/White 2 entrou no app: 36 Pokémon por versão que só se conseguem chocando um ovo (como Abra, Larvitar e Deino) agora aparecem em Onde capturar, com quem deixar na creche e em que ponto do jogo.

### Adicionado
- **Ovos da creche no Black 2/White 2** (Route 3): qual bebê nasce de cada Pokémon pela tabela do próprio jogo, a regra
  dos incensos e o nível 1 ao chocar, tudo do código do jogo (decomp pokebw2). +36 espécies por versão.
- A evolução de um bebê que passou a ser obtível também conta como obtível: Kadabra no Black 2/White 2 (pelo Abra do ovo)
  e Hitmontop no FireRed/LeafGreen (pelo Tyrogue do ovo do Hitmonlee com Ditto).
- Bonsly e Budew continuam fora no B2W2: precisam de incenso, e onde achar o incenso não está nos dados do jogo.

## [0.33.0] — 2026-10-25

> As sugestões deixaram de indicar Pokémon que você ainda não teria no nível do seu time — como um Pupitar de nível 42 para um time de nível 16 no Scarlet/Violet ou um Rhydon de nível 55 no Sword/Shield.

### Corrigido
- **Jogos do Black/White ao Z-A**: faltava o "menor nível em que a espécie existe por evolução" (ex.: Pupitar a partir do
  nv 30) — o filtro que tira Pokémon ainda não evoluídos no nível do seu time não agia nesses jogos.
- **Mundo aberto com progresso informado** (Scarlet/Violet, Wild Area do Sword/Shield…): além do ponto da história, a
  sugestão exige uma forma de obter com nível até 10 acima do seu time (margem estimada: Pokémon muito acima é difícil de
  capturar e pode não obedecer). "Como conseguir" mostra essa forma.
- Banco de lutas: vencem 37.697 → 37.694 (3 lutas do Let's Go em que só ganhava um Pokémon que você não teria naquele
  nível); folgadas 36.445 → 36.370.

## [0.32.0] — 2026-10-25

> O app ficou bem mais rápido para calcular as sugestões (de 5 a 9 vezes), sem mudar nenhum resultado.

### Alterado
- **Sugestões mais rápidas**: a busca de "onde obter" de cada Pokémon era refeita muitas vezes na mesma conta; agora fica
  guardada. Cada sugestão sai de 5 a 9 vezes mais rápido (Scarlet/Violet: 155 → 18 ms) e o banco de lutas completo cai de
  ≈ 11 para ≈ 6 minutos, com os mesmos números (37.697 vencem; 36.445 folgadas).

## [0.31.0] — 2026-10-25

> Ajuste fino no X/Y e no Omega Ruby/Alpha Sapphire: o chefe que mega evolui também age na ordem certa no turno em que evolui, como já acontecia com o seu Pokémon.

### Corrigido
- **Mega na Gen 6 (X/Y, ORAS)**: no turno em que o chefe mega evolui, a ordem de ação usa a Velocidade de antes da Mega
  (regra do jogo) — antes isso valia só para o seu Pokémon. Banco de lutas sem mudança (caso raro).
- Plano: a etapa "chefes com golpe Z" ficou pulada — o detonado do Sun/Moon não diz em nenhuma luta que o chefe usa
  golpe Z, e o app não inventa.

## [0.30.0] — 2026-10-25

> No Sword/Shield o app agora simula o Dynamax: os líderes que dinamaxizam no jogo lutam gigantes, com mais vida e golpes Max, e nas lutas de ginásio o seu Pokémon também pode dinamaxizar.

### Adicionado
- **Simulador com Dynamax** (Sword/Shield), com a regra do jogo como o Pokémon Showdown a implementa: 3 turnos com a vida
  multiplicada e golpes Max (poder pela tabela, um golpe só, não erram); depois, a vida volta na mesma proporção.
  - Chefes: os 45 Pokémon que o detonado escreve como "Dynamax"/"Gigantamax" (o Centiskorch do Kabu, o Charizard do Leon…)
    lutam dinamaxizados; a tela mostra o selo.
  - Você: com a Dynamax Band e só nas lutas em que o jogo deixa (as de ginásio e campeonato, em que o chefe dinamaxiza),
    quando isso vence melhor; o cartão mostra o golpe Max. Opção nova em Filtros: "Usar Dynamax".
  - A vida usa 1,5× (nível de Dynamax 0, o de quem você captura; no jogo pode chegar a 2×). Os efeitos extras dos golpes
    Max (clima, atributos) ainda não entram na conta — a tela avisa.
- Banco de lutas: no Sword/Shield a média de turnos para nocautear cai de 1,66 para 1,39; folgadas 36.441 → 36.445.

## [0.29.0] — 2026-10-25

> No Scarlet/Violet o app agora simula o Terastal: os chefes que terastalizam no jogo mudam de tipo na luta, e o seu Pokémon pode usar o Tera no próprio tipo para bater mais forte. Também há um plano novo com tudo o que falta fazer.

### Adicionado
- **Simulador com Terastal** (Scarlet/Violet), com a regra do jogo como o Pokémon Showdown a implementa: terastalizado,
  o Pokémon defende só com o tipo Tera; o STAB vale nos tipos de antes e no Tera, e vira 2× quando o Tera é um dos tipos
  dele; golpe do tipo Tera com menos de 60 de poder sobe para 60.
  - Chefes: os 103 Pokémon de treinador que o detonado marca com Tera ("Teddiursa (Tera Bug)") lutam terastalizados —
    tipos, fraquezas e golpes; a tela mostra "Normal → Tera Bug".
  - Você: depois da Tera Orb (Nemona, Mesagoza), o seu Pokémon pode terastalizar num dos próprios tipos quando isso vence
    melhor; o cartão diz o tipo. Opção nova em Filtros: "Usar Terastal".
- **Plano de execução 2** (`PLANO-EXECUCAO-2.md`): tudo o que ainda falta, em ordem, com critério de pronto e regras para
  seguir sozinho quando uma etapa travar.
- Banco de lutas: vencem 37.697 (igual); folgadas 36.452 → 36.441 (os chefes que terastalizam ficaram mais difíceis).

## [0.28.0] — 2026-10-25

> No Sun/Moon e no Ultra Sun/Ultra Moon as sugestões agora usam o golpe Z: o app diz quando um golpe Z no 1º turno vence mais rápido, de qual golpe ele sai, o poder e em que ponto da história você ganha o Z-Ring e o cristal do tipo.

### Adicionado
- **Simulador com golpes Z** (2ª fase do `PLANO-SIMULADOR.md`): um golpe Z por luta, no 1º turno — um golpe só, que não
  erra, com o poder do golpe Z — e depois o melhor golpe normal; a sugestão usa o Z só quando ele nocauteia em menos turnos.
  O cartão mostra "Golpe Z no 1º turno: a partir de Submission (poder 160)", o Z-Ring e o Z-Crystal com o ponto da história.
  - Poder do golpe Z pela regra do jogo como o Pokémon Showdown a implementa (ex.: Thunderbolt 175, Bullet Seed 140 —
    golpe de 2–5 acertos conta ×3 —, Low Kick 160 pela exceção). O poder dos golpes Max do Sword/Shield já fica gravado
    para a fase do Dynamax.
  - Z-Ring (Hala) e os 18 Z-Crystals de tipo pelo detonado do Sun/Moon, cada um no ponto em que você o recebe ou pega
    (Waterium Z com a Lana, Icium Z no pedestal…): com o progresso informado, só os tipos que você já tem.
  - Ultra Sun/Ultra Moon (sem detonado): todos os tipos, e o cartão avisa que o lugar do cristal não está nos dados.
  - Opção nova em Filtros: "Usar golpe Z".
- Banco de lutas: no Sun/Moon a média de turnos para nocautear cai de 1,22 para 1,07; folgadas 36.446 → 36.452.

## [0.27.0] — 2026-10-25

> Os chefes que usam Mega Evolução no jogo agora lutam como Mega no app (Mega Camerupt do Maxie, Mega Charizard Y do Blue…), com os atributos, tipos e habilidade da Mega.

### Adicionado
- **Chefes com Mega Evolução**: quando o detonado escreve o Pokémon como Mega no time ("Mega Camerupt lv.43",
  "Mega Charizard X lv.54") ou diz perto da luta que ele pode mega evoluir ("o Alakazam dele pode mega evoluir"), o
  oponente luta como a Mega — tipos, atributos e habilidade da Mega no cálculo, nas fraquezas e na tela (selo "luta Mega
  (detonado)"). X/Y 6, Omega Ruby/Alpha Sapphire 17, Sun/Moon 1, Let's Go 9, Z-A 49 Pokémon de chefe.
- Os tipos Tera que o detonado dá aos treinadores do Scarlet/Violet (103) já ficam guardados para a próxima fase.

### Alterado
- Banco de lutas com os chefes Mega: vencem 37.697 (igual), folgadas 36.475 → 36.446 das 37.872 sugestões.

## [0.26.0] — 2026-10-25

> As sugestões agora usam a Mega Evolução nos jogos que têm (X/Y, Omega Ruby/Alpha Sapphire, Sun/Moon, Let's Go e Z-A): o app diz quando a Mega vence melhor, qual pedra segurar, quando se ganha o Mega Ring e, quando o detonado conta, onde achar a pedra.

### Adicionado
- **Simulador com Mega Evolução** (1ª fase do plano em `PLANO-SIMULADOR.md`): cada Pokémon com Mega no jogo também luta
  como Mega (atributos, tipos e habilidade da Mega; os golpes são os mesmos) e a sugestão fica com a Mega só quando ela
  vence melhor — ex.: "Mega Charizard X, segurando Charizardite X". Na Gen 6 (X/Y, ORAS), no turno em que evolui, a ordem
  usa a Velocidade de antes da Mega.
  - Quais Megas cada jogo tem e a pedra de cada uma: tabelas do próprio jogo (PKHeX) — o X/Y não tem a Mega Altaria, o
    Sword/Shield não tem Mega. X/Y 30, ORAS 49, Sun/Moon e USUM 49, Let's Go 15, Z-A 97.
  - Mega Ring: com o progresso informado, só depois do ponto em que o detonado diz que você o ganha (X/Y: Korrina na
    Tower of Mastery; ORAS: Steven na Southern Island; Sun/Moon: Dexio; Let's Go: Blue; Z-A: missão 9).
  - Onde achar a pedra: a frase do detonado, quando ele diz (ORAS 36 pedras, X/Y 6, Let's Go 3); quando não diz, o cartão
    avisa que a sugestão vale se você tiver a pedra. Opção nova em Filtros: "Usar Mega Evolução".
- O aviso "fora do cálculo" deixa de citar a Mega Evolução nesses jogos.

### Corrigido
- Let's Go: a Route 5 e as rotas em volta voltam ao ponto certo (usam o estágio do Yellow, corrigido na 0.24.0).
- Banco de lutas: folgadas 36.381 → 36.475 das 37.872 sugestões.

## [0.25.0] — 2026-10-25

> Nova aba "Pokémon por tipo": escolha o jogo e veja todos os Pokémon dele separados por tipo, filtrando por tipo, nome, só os que dá para obter e só formas finais.

### Adicionado
- **Aba "Pokémon por tipo"** na tela de cada jogo: todos os Pokémon do jogo agrupados por tipo (só os tipos que o jogo
  tem — sem Fada antes da Gen 6), com a contagem de cada tipo. Filtros: botões de tipo (escolhendo dois, só quem tem os
  dois — ex.: Fogo + Voador), nome, "só os que dá para obter nesta versão" (ligado de início: no FireRed não aparecem os
  Pokémon de Hoenn) e "só formas finais". Quem tem dois tipos aparece nos dois grupos. Clicar num Pokémon abre a aba Onde
  capturar com ele. Link direto: `#/jogo/firered-leafgreen?aba=tipos&tipo=fire`.
- Próxima etapa anotada no STATUS.md: simulador com Mega Evolução, golpes Z, Dynamax, Terastal e as batalhas do Legends:
  Arceus e do Z-A; depois, a creche no Black 2/White 2 ou os itens de evolução do Sword/Shield.

## [0.24.0] — 2026-10-25

> Onde capturar mostra os dois caminhos (capturar direto ou capturar a forma anterior e evoluir), a Route 6 do Yellow está no ponto certo, Blackthorn ganhou foto e cada versão destas Novidades tem um resumo simples.

### Adicionado
- **Os dois caminhos em Onde capturar**: quando o Pokémon se captura direto, a tela mostra também "Ou pela evolução" —
  capturar a forma anterior e evoluir —, com o ponto da história de cada um e o selo "mais cedo" quando esse caminho
  sai antes (ex.: Raticate no Red: direto só depois de 3 insígnias; Rattata na Route 1 e evoluir no nv 20 já no começo).
  As sugestões de luta também passam a considerar o caminho que sai mais cedo (troca entre cartuchos não conta).
- **Resumo em linguagem simples** em cada versão do painel Novidades; a lista técnica fica em "Detalhes".
- **Foto de Blackthorn City** (Gold/Silver e Crystal): o detonado não tem foto da cidade nesses jogos; vem o mapa da
  cidade da Bulbapedia, por referência e com o crédito na tela.

### Corrigido
- **Red/Blue e Yellow**: a Route 6 (e a Route 5, os subterrâneos e os portões) estavam depois da 3ª/4ª insígnia; abrem
  depois da 2ª (Route 5 já depois da 1ª). O portão com o guarda que pede bebida ligava a rota ao Saffron, e no Yellow o
  presente da Officer Jenny (Squirtle, depois da Thunder Badge) fechava o Vermilion inteiro.
- Banco de lutas: vencem 37.615 → 37.697 e folgadas 36.186 → 36.381 das 37.872 sugestões.

## [0.23.0] — 2026-10-25

> Agora o app mostra os Pokémon que só se conseguem chocando um ovo na creche (como o Pichu no FireRed): quem deixar lá, com quem e em que ponto do jogo.

### Adicionado
- **Ovos da creche** (Gold/Silver, Crystal, Ruby/Sapphire, Emerald, FireRed/LeafGreen, Diamond/Pearl, Platinum e
  HeartGold/SoulSilver): a espécie que só se consegue chocando um ovo agora aparece em **Onde capturar** — ex.: Pichu no
  FireRed, "Ovo na creche — Four Island Pokémon Day Care: deixe Pikachu com outro Pikachu do sexo oposto (choca no nv 5)",
  pós-jogo. Diz o pai, o parceiro (outro do sexo oposto, um macho do mesmo grupo de ovo ou Ditto), o incenso quando o
  bebê precisa (Wynaut, Azurill, Mime Jr., Happiny, Munchlax…) e o ponto da história (o da creche ou o de quando dá para
  ter o pai, o que vier depois). Na árvore de evoluções, o bebê ganha o selo "por ovo na creche".
  Tudo do código de cada jogo: grupos de ovo e sexo, a regra de qual espécie nasce, a tabela dos incensos, o nível ao
  chocar (5 nas Gens 2–3, 1 na Gen 4) e o mapa da creche (no FireRed/LeafGreen, a da Four Island — a da Route 5 não faz
  ovo).
- Bebê de incenso sem o incenso nos dados do jogo continua fora (ex.: Azurill no Emerald, Wynaut no FireRed).

## [0.22.1] — 2026-10-24

> Na árvore de evoluções, o Pokémon que não existe no jogo escolhido aparece marcado, com a lista dos jogos em que ele aparece.

### Corrigido
- **Evoluções na aba Onde capturar**: uma espécie da família que não dá para obter no jogo escolhido (ex.: Pichu ao
  pesquisar Pikachu no FireRed) aparecia como se fosse do jogo. Agora vem marcada "não é deste jogo", com os jogos do
  app em que ela aparece (links para a aba Onde capturar de cada um); se for só da outra versão do mesmo jogo, diz qual.

## [0.22.0] — 2026-10-20

> Ao pesquisar um Pokémon, você vê em quem ele evolui, como (nível, pedra, troca…) e onde achar a pedra ou o item. No HeartGold/SoulSilver, as pedras da loja do Pokéathlon passaram a contar.

### Adicionado
- **Evoluções na aba Onde capturar**: a família inteira do Pokémon (da forma base às finais, com os ramos do Eevee), o
  método de cada evolução (nível, pedra, troca, amizade, lugar…) e, quando pede item, **onde achar o item**: nos jogos
  com decomp, os locais do código do jogo (chão, escondido, loja, presente, prêmio) com o ponto da história; nos outros,
  as frases do detonado que dizem onde achar (Black/White, X/Y, ORAS, Sun/Moon, BDSP, Legends: Arceus, Scarlet/Violet,
  Z-A), marcadas como citação. Clicar num Pokémon da família abre a busca dele.

### Corrigido
- **HeartGold/SoulSilver**: Leafeon, Glaceon, Magnezone e Probopass apareciam como obtíveis por evolução — no HGSS a
  evolução por lugar não existe (o jogo nunca dá o método do mapa). Saíram das sugestões.
- **HeartGold/SoulSilver**: faltavam Thunderstone, Fire Stone e Sun Stone — elas são vendidas na loja do Pokéathlon, uma
  lista por dia da semana (ex.: Thunderstone na quinta, Fire Stone na terça; mais opções depois da Pokédex Nacional).
  Jolteon, Flareon, Arcanine e Ninetales voltaram às sugestões.

## [0.21.0] — 2026-10-20

> Mais lugares ganharam foto, e fotos que mostravam o lugar errado foram tiradas.

### Adicionado
- **Fotos dos lugares**: lugar citado só no texto do detonado ganha a foto cujo nome de arquivo é o lugar (Ice Path,
  Mt. Mortar, Tin Tower, Whirl Islands, Dark Cave, Mt. Moon, Victory Road, Safari Zone…). Red/Blue 19 → 23, Gold/Silver
  9 → 35, Crystal 33 → 36, HeartGold/SoulSilver 76 → 86, FireRed/LeafGreen 73 → 80 lugares com foto.

### Corrigido
- Foto cujo nome é de OUTRO lugar saiu do trecho: Blackthorn (GS/Crystal) mostrava o Ice Path; Mossdeep (ORAS) o mapa da
  Shoal Cave; Silver Cave o Mt. Mortar; o Dojo de Saffron (FRLG) a Silph Co.

## [0.20.0] — 2026-10-20

> O mapa da região chegou ao Black/White e ao Black 2/White 2, e as cavernas do FireRed/LeafGreen passaram a aparecer no mapa.

### Adicionado
- **Mapa da região no Black 2/White 2 e no Black/White**: posições pela grade de zonas do mundo do decomp (pokebw2), com
  cavernas e prédios na posição da entrada — 86/91 locais do B2W2 e 47/54 do BW no mapa. Mapa da região em 15 dos 22 jogos.
- **FireRed/LeafGreen**: cavernas e florestas (Mt. Moon, Rock Tunnel, Viridian Forest, Power Plant…) passam a aparecer no
  mapa, na posição da entrada — 140/142 locais (eram 99).

### Corrigido
- A versão 0.14.0 dizia "mapa da região em 14 dos 22 jogos"; eram 13.

## [0.19.0] — 2026-10-20

> As grutas escondidas do Black 2/White 2 foram conferidas: toda espécie mostrada existe mesmo lá.

### Corrigido
- **Black 2/White 2 — Hidden Grottoes conferidas com a tabela do jogo (PKHeX)**: toda espécie de gruta que o app mostra
  existe no jogo na mesma versão (Beedrill só no Black 2, Butterfree só no White 2). Glameow, Stunky e Togetic — que só
  saem de gruta — passam a aparecer como obtíveis, em "Hidden Grotto (rota não registrada)", marcadas como aleatórias.

## [0.18.0] — 2026-10-20

> Nos remakes (Brilliant Diamond/Shining Pearl, Let's Go e Omega Ruby/Alpha Sapphire), as rotas aparecem no ponto certo da história.

### Corrigido
- **Remakes com as rotas no ponto certo da história**: no Brilliant Diamond/Shining Pearl (o detonado não numera as
  rotas), no Let's Go e no Omega Ruby/Alpha Sapphire, os lugares sem posição no detonado passam a usar a posição do mesmo
  lugar no jogo original (Diamond/Pearl, Yellow, Ruby/Sapphire), convertida pelo nome do líder. Locais sem posição: BDSP
  25 → 1, Let's Go 15 → 0, ORAS 4 → 1; no ORAS a Route 102 deixou de aparecer como "depois da 8ª insígnia".

## [0.17.0] — 2026-10-20

> Os times dos rivais nos jogos mais novos aparecem completos, com o inicial certo para a sua escolha.

### Corrigido
- **Times de rival completos nas Gens 5–9**: o Pokémon que o detonado escreve como "inicial" (ou "Chikorita/Tepig/Totodile")
  não some mais do time. Quando o texto diz a regra ("o inicial com vantagem ao seu", "de fraqueza ao seu"), o app monta o
  time certo para cada inicial que você escolher (ex.: no X/Y, com Chespin o Calem/Serena vem de Braixen). Quando o texto
  não diz (Hau no Sun/Moon, Urbain/Taunie no Z-A, o rival do Let's Go), aparece uma variante para cada inicial possível,
  marcada "se o inicial dele for X".

## [0.16.0] — 2026-10-20

> Lugares que abrem no meio da história, como a Safari Zone de Hoenn, não aparecem mais como se fossem só do fim do jogo.

### Corrigido
- **Lugares que abrem no meio da história não aparecem mais como pós-jogo**: a Safari Zone de Hoenn (Ruby/Sapphire e
  Emerald) passa a "depois de Winona", a Power Plant e as Seafoam Islands do FireRed/LeafGreen a "depois de Sabrina", e
  também Abandoned Ship e New Mauville (Emerald), Mirage Tower, Trick House, Old Chateau, Wayward Cave, Solaceon Ruins
  (Diamond/Pearl e Platinum) e Black City/White Forest (Black 2/White 2). O detonado descreve essas áreas numa seção do
  pós-jogo, mas cita antes; agora vale a citação anterior quando um lugar vizinho já está liberado nesse ponto.

## [0.15.0] — 2026-10-20

> Chegou este botão de Novidades, que mostra o que mudou em cada versão.

### Adicionado
- **Novidades no app**: botão 🔔 no canto inferior direito com o número de versões que você ainda não viu e um painel com
  as mudanças de cada versão (vem deste CHANGELOG). Link direto para mostrar a alguém: `#/?novidades`.

## [0.14.0] — 2026-10-20

> A aba Detonado ganhou fotos dos lugares e o mapa de cada parte da história, e mais jogos ganharam o mapa da região.

### Adicionado
- **Imagens na aba Detonado**: cada local com foto do lugar (📷, carregada ao abrir) e cada etapa da história com
  "🗺 Ver no mapa da região" (os locais da etapa destacados).
- **Mapa da região na Gen 4**: Diamond/Pearl e Platinum pela matriz do mundo do decomp + warps de entrada (Mt. Coronet,
  lagos, Great Marsh, cavernas na posição da entrada) — 170/173 e 173/176 locais no mapa; HeartGold/SoulSilver com as
  posições do mapa do Crystal (mesma região).
- **Remakes com o mapa da mesma região**: BDSP (Sinnoh do Platinum), ORAS (Hoenn do Emerald), Let's Go (Kanto do Red/Blue).
  Mapa da região em 14 dos 22 jogos.
- **Tags** ao lado do selo de verificação, nos cards e no cabeçalho do jogo: "📖 detonado no app" e "📍 capturas
  disponíveis" (o tooltip diz se tem fotos e mapa). `games.json` ganhou `capture: { places, regionMap }`.

### Corrigido
- Legenda do mapa cortava o nome da fonte (escape perdido no regex).

## [0.13.0] — 2026-10-20

> Onde capturar passou a mostrar fotos do lugar e o mapa da região dos jogos clássicos.

### Adicionado
- **Onde capturar com imagens**:
  - **Como é o lugar**: as capturas de tela do trecho do detonado do PokeMythology cujo título é o próprio lugar (no
    FireRed/LeafGreen e no Emerald são mapas inteiros das áreas). Guardadas como referência (endereço + crédito + link),
    sem copiar as imagens deles para o repositório. `public/data/<jogo>-places.json` (`build-place-images.mjs`).
  - **No mapa da região** (Gens 1–3): desenho nosso (SVG) com as posições do mapa da região tiradas do decomp
    (pokered/pokeyellow `town_map_entries`, pokegold/pokecrystal `landmarks`, pokeemerald/pokeruby/pokefirered
    `region_map_sections.json`) e os lugares de captura destacados. `public/data/<jogo>-regionmap.json`
    (`build-region-maps.mjs`).
- `npm run rede`: diagnóstico de acesso de outro aparelho (endereço na rede e regra do Firewall que bloqueia o Node).

### Corrigido
- Servidor local com `cache-control: no-cache` (o navegador juntava a página nova com o script antigo).
- Teste novo contra caractere de controle nos arquivos (um `\b` virou backspace numa edição e o mapa perdeu os nomes).

## [0.12.0] — 2026-10-20

> Na tela inicial, você pesquisa um Pokémon e vê em quais jogos dá para pegá-lo.

### Adicionado
- **Busca de Pokémon na tela inicial** (padrão), com um seletor ao lado para trocar para "Líder ou jogo" (a busca antiga
  continua igual). Escolhido o Pokémon, aparecem os jogos em que dá para obtê-lo, por geração (e "só FireRed" quando é
  exclusivo de versão); cada jogo abre a aba Onde capturar. Índice em `public/data/pokemon-games.json` (gerado pelo
  `build-pokedex.mjs`), baixado só na 1ª busca. Link direto: `#/?capturar=pikachu`.

## [0.11.0] — 2026-10-20

> Nova aba Onde capturar: digite um Pokémon e veja todos os lugares, o nível e em que ponto da história ele aparece.

### Adicionado
- **Aba "Onde capturar"** em todos os jogos: digite um Pokémon e veja todos os locais da versão (método, nível, taxa quando o
  jogo tem, ponto da história), de qual Pokémon evoluir quando ele não aparece direto, se é só por evento e o que existe nas
  outras versões. Link direto: `#/jogo/<jogo>?capturar=pikachu`.
- **Legends: Z-A com treinadores, progresso e Detonado** pelo detonado do PokeMythology (baixado agora): o progresso é o rank
  do Z-A Royale (Z → A, 10 partidas de promoção, categoria "Partidas de promoção").
- **Legends: Arceus com progresso** pelos 5 Pokémon nobres acalmados.
- **Sun/Moon com as provações**: além das 4 grandes provações, as provações dos capitães (Z-Crystal recebido depois do totem).
- Progresso com rótulos próprios por jogo (rank, nobres, provações) e pós-jogo depois do último marco.

### Corrigido
- Sun/Moon: Route 1/Route 2 apareciam depois da 2ª provação (o detonado só numera a rota mais tarde) — vale a evidência mais
  cedo entre o nome e o trecho que lista as espécies do local; subárea não fica depois do local-pai.

## [0.10.0] — 2026-10-20

> Os jogos mais novos (Black/White até Scarlet/Violet) ganharam líderes, rivais, progresso por insígnia e detonado.

### Adicionado
- **Treinadores nas Gens 5–9 sem decomp** (BW, XY, ORAS, SM, Let's Go, SwSh, BDSP, Legends: Arceus, SV): líderes, Elite, campeões,
  rivais e chefes transcritos dos detonados do PokeMythology (espécie e nível; golpes estimados pelo moveset do jogo no nível).
- **Progresso por insígnia** nesses jogos (exceto Legends: Arceus, sem ginásios): ordem dos líderes do detonado e o ponto da
  história de cada local do "onde obter".
- **Aba Detonado** nesses 9 jogos, montada só com os dados do jogo (PKHeX) e a ordem do detonado.
- **Formas regionais** (Alola, Galar, Hisui, Paldea) como Pokémon próprios nas Gens 7–9: Rattata de Alola, Meowth de Galar,
  Wooper de Paldea… com tipos, atributos e golpes da forma; busca por "Rattata de Alola" ou pelo nº.
- **Evoluções do jogo** nas Gens 5–9 (pedra, troca, horário, forma, métodos novos): o filtro de evolução por troca passa a valer
  e evoluções impossíveis no jogo deixam de contar (Raichu de Kanto no Sun/Moon).
- **Onde obter do Black/White** pelos encontros do PKHeX.
- **Aviso de mecânicas fora do cálculo** na tela do jogo (Mega Evolução, golpes Z, Dynamax, Terastal, batalha em tempo real).

### Corrigido
- TMs pelas tabelas do jogo: TM95 Snarl saiu do Black/White (não obtível); Scarlet/Violet com as TMs dos patches/DLC.

### Limitações
- Times do detonado podem ter erros de transcrição (grafia corrigida pelo nº da imagem; no SV, pelo nome); os golpes são
  estimados. Rival com "inicial" genérico fica sem esse Pokémon.

## [0.9.0] — 2026-10-20

> Legends: Arceus ganhou as espécies de Hisui e a loja de golpes, e a escolha do inicial ficou mais fácil.

### Adicionado
- **Legends: Arceus com as espécies de Hisui**: 18 espécies que o jogo tem e o dataset não tinha (Typhlosion, Samurott,
  Decidueye, Arcanine, Goodra, Avalugg, Braviary, Lilligant, Zoroark… nas formas de Hisui, mais Giratina e Porygon2), com
  atributos, tipos, habilidades, golpes por nível e loja de golpes das tabelas do jogo (PKHeX) e o sprite da forma.
- Loja de golpes do Legends: Arceus (PKHeX) no lugar da lista de tutor incompleta da PokéAPI.
- Tela do jogo: o inicial saiu da barra do topo e virou uma escolha com os sprites dos 3 iniciais (e "não informar"), logo
  acima do campo do oponente.

## [0.8.0] — 2026-10-20

> Os jogos das Gens 6 a 9 passaram a dizer onde capturar cada Pokémon, e o Legends: Z-A entrou no app.

### Adicionado
- **Onde obter nas Gens 6–9** (XY, ORAS, SM, USUM, Let's Go, SwSh, BDSP, Legends: Arceus, SV, Z-A) pelas tabelas de encontro
  do PKHeX: selvagens (local, método, faixa de nível), presentes, encontros únicos, trocas, ovos e iniciais, por versão. Antes
  BDSP, Legends: Arceus e Scarlet/Violet não tinham nenhum encontro (a PokéAPI não tem) e o filtro "só o que dá para obter"
  ficava desligado. Eventos, distribuições, GO/HOME, crossover do SV e Friend Safari ficam de fora.
- **Legends: Z-A disponível**: dataset montado das tabelas do jogo extraídas pelo PKHeX (370 espécies com a expansão Mega
  Dimension; atributos, tipos, habilidades, golpes por nível, TMs, evoluções); golpes com os valores da Gen 9.
- Iniciais pelos encontros fixos do PKHeX quando o detonado não confirma (Legends: Arceus, Ultra Sun/Ultra Moon, Z-A).

### Corrigido
- Leitor de learnset do PKHeX: entrada com byte de preenchimento (Z-A) perdia todos os níveis (divisão inteira, como no C#).
- Tela: fonte sem taxa de aparição não mostra mais "(undefined%)" nem é tratada como rara.

### Limitações
- O PKHeX não tem taxas nem a ordem da história (sem progresso por insígnia nesses jogos); junta grama/surf/varas nas Gens 6/7
  e Radar/surto na grama do BDSP; no Scarlet/Violet não separa as versões nos selvagens (aviso na tela).
- Legends: Arceus: 18 espécies que só existem em forma de Hisui não estão no dataset (PokéAPI) — resolvido na 0.9.0.

## [0.7.0] — 2026-10-20

> Os dados dos jogos mais novos foram conferidos com as tabelas do próprio jogo e vários erros foram corrigidos.

### Adicionado
- **Black/White e Gens 6–9 com o núcleo conferido** (selo "Parcialmente verificado") pelas tabelas do próprio jogo extraídas
  pelo PKHeX (kwsch/PKHeX, GPL-3.0; fica em `data-sources/`): atributos, tipos, habilidades e golpes aprendidos por nível na
  ORDEM do jogo (o moveset padrão do oponente sai dela). O leitor foi validado contra os decomps (0 diferenças no B2W2 e no
  learnset de Emerald, DP, Platinum e HGSS). Auditoria com 0 diferenças nos 10 jogos depois do overlay.
- Correções em relação à PokéAPI: Cryogonal (Ataque/Defesa trocados no BW, XY e ORAS), Koffing/Weezing sem Stench até a Gen 7,
  learnset do Scarlet/Violet (8 espécies).

## [0.6.0] — 2026-10-20

> Black 2/White 2 passou a ser conferido no código do jogo.

### Adicionado
- **Black 2 / White 2 conferidos no código do jogo** (selo "Verificado") pelo decomp fuddlesworth/pokebw2 (GPL-3.0; usado
  como os do pret: fica em `data-sources/`, só os dados gerados vão para o app): núcleo com 0 divergências (a PokéAPI trocava
  Ataque/Defesa do Cryogonal), 577 treinadores com o lugar da luta e o rival pelo seu inicial, onde obter por estação e versão
  (zonas de uma versão só, enxames do pós-jogo, Pokémon do N, fósseis, trocas), progresso por insígnia, detonado no app e
  banco de lutas (102 lutas, 99% com sugestão que vence). Scripts em texto executados por versão (`simulateText`).
- Medição das fontes das Gens 5–9 em `docs/FONTES-GEN5-9.md`.

### Corrigido
- `build-catalog.mjs` estava com erro de sintaxe desde a 0.5.1 (um `//` no meio da linha): teste novo confere a sintaxe de
  todos os scripts.

### Limitações
- B2W2: itens das lojas comuns (15 TMs sem origem) e Hidden Grottoes não estão no decomp em texto; os grottoes vêm da PokéAPI.

## [0.5.1] — 2026-10-19

> O número de vitórias da tela inicial passou a contar todos os jogos.

### Corrigido
- O número da tela inicial ("das sugestões vencem a troca") passa a contar todos os jogos do banco de lutas (10 jogos,
  12.348 sugestões); antes deixava de fora quem não tinha linha de base, como o Diamond/Pearl. A comparação antes/depois
  continua só com os jogos que têm linha de base (`_total.json`: `atual` × `antes`/`depois`).
- A legenda dos selos mostra só os selos em uso (nenhum jogo é mais "Parcialmente verificado").

## [0.5.0] — 2026-10-19

> Diamond/Pearl e HeartGold/SoulSilver foram conferidos no código do jogo, e a tela inicial passou a ser organizada por geração.

### Adicionado
- **Diamond/Pearl e HeartGold/SoulSilver conferidos no código do jogo** (selo "Verificado"), lendo as partes que no decomp
  estão em binário com as regras tiradas do próprio código (C/asm do decomp). Detalhes em `docs/ADICIONAR-JOGO.md`.
  - HeartGold/SoulSilver: golpes aprendidos por nível e tabela de golpes dos NARCs do próprio jogo (`scripts/lib/narc.mjs`) —
    antes vinham da PokéAPI e do Platinum; o learnset do HGSS difere do Platinum em 13 espécies.
  - Diamond/Pearl: leitor do bytecode dos scripts (`scripts/lib/gen4-dp-script.mjs`: tamanho dos 721 comandos pelo código, os
    605 scripts de mapa fecham), eventos, encontros, matrizes e trocas (`scripts/lib/gen4-dp-field.mjs`) e a tabela de tipos do
    overlay de batalha. Agora com 490 treinadores com o lugar da luta (antes 37 chefes), rival pelo seu inicial, onde obter,
    progresso por insígnia, detonado no app e banco de lutas (120 lutas, 100% com sugestão que vence).
  - `simulate()` resolve valores que dependem da versão (Spear Pillar: Dialga no Diamond, Palkia no Pearl).
  - Correções em relação à PokéAPI: Giratina passa a ser obtível no DP; Regigigas, Darkrai, Shaymin, Arceus e Manaphy não.
- Autocompletar no campo do Pokémon oponente só com os Pokémon do jogo (sprite, número e tipos; ↑ ↓ Enter Esc; aceita "Mr. Mime")
  e aviso quando o nome é de outra geração ou não está no jogo (`public/data/pokedex.json`, `npm run build:pokedex`).
- Tela inicial por geração, com as fotos dos consoles (Evan-Amos, Wikimedia Commons, domínio público); os jogos aparecem ao
  escolher a geração.
- `scripts/validate-dp-scripts.mjs` no pipeline do DP e testes de regressão sem decomp (`test/decomp-binaries.test.mjs`) para a
  lógica de leitura dos binários.

### Alterado
- Sprites maiores (cartões de jogo, título, atalhos, "Continuar", busca e tela do jogo).
- Tela do jogo: sem o cartão de escolher inicial e sem lista de oponentes aberta — uma dica orienta a escolher a categoria.
- O jogo sempre abre com o inicial em "não informar" (o inicial não é mais lembrado no navegador).
- Gold/Silver usa os sprites das pastas `gold`/`silver` (não existe `gold-silver`; caía no sprite moderno).

## [0.4.0] — 2026-10-18

> Ficou mais fácil escolher o adversário (líderes, Elite, rival…), e o app mostra contra o que ele é fraco ou forte.

### Adicionado
- Oponente por **categoria** (abas com contagem): Líderes, Líderes de Kanto, Elite dos Quatro, Campeão, Rival, grupos
  próprios do jogo (Equipe Aqua / Magma, Frontier Brains) e Outros treinadores — no lugar de um dropdown único.
  - Categorias pequenas: botões com o ás do time, nome, nível e nº de Pokémon; líderes na ordem da história; selo
    "próximo" no líder seguinte ao seu progresso; revanches recolhidas (também as que o dado não marca, como as 5 Roxanne
    do Emerald).
  - Rival filtrado pelo seu inicial e com o lugar da luta (na Gen 3 tirado do rótulo: "Route 103", "Victory Road").
  - Outros treinadores: seletor agrupado por classe, com lugar e nível.
- Quadro do oponente com **Fraco contra / Resiste / Imune** (tabela de tipos do jogo; imunidade de habilidade só quando a
  habilidade é certa, como Levitate).

### Alterado
- A linha de ameaça agora diz que é o que ELE usa contra você ("Ele ataca com…" / "Ele deve atacar com…").
- Nomes em maiúsculas da Gen 3 ("BRENDAN") aparecem como "Brendan"; ¼× nos multiplicadores.

## [0.3.0] — 2026-10-18

> Tela inicial nova: uma busca que acha jogos e líderes, atalhos para lutas famosas e um botão para continuar de onde você parou.

Tela inicial nova, a partir das páginas de Linear, Vercel, Mobbin, SaaS UI e Atlassian Design (capturadas e analisadas; a
do Stripe não carregou no tempo limite).

### Adicionado
- Herói com título e sprites dentro da frase (inicial × ás de um líder, girando a cada 3 s).
- Busca central que acha jogos e chefes, com siglas (hg, frlg, oras, bdsp…): "whitney hg" + Enter abre a luta contra a
  Whitney no HeartGold/SoulSilver. Teclado: ↑ ↓ Enter Esc e atalho `/`; o campo "digita" exemplos enquanto está parado.
- Atalhos "Experimente" para lutas famosas que existem nos dados.
- Cartão "Continuar de onde parou" com o último jogo e o contexto salvo (inicial, insígnias, nível).
- Faixa de números calculados dos dados: jogos, jogos conferidos, treinadores com time real e % de vitórias do banco de lutas.
- "Como funciona" em 3 passos.
- Cartões de jogo com os iniciais (sobem ao passar o mouse) ou uma Poké Ball quando os iniciais não estão confirmados.
- Catálogo (`games.json`): iniciais, chefes (com o ás de cada um), nº de treinadores e números do banco de lutas.
- `scripts/screenshot.mjs`: `ACAO` (JS antes da captura, com `await`) para testar estados interativos.

### Alterado
- Celular: jogos em 2 colunas, filtros numa linha com rolagem lateral, selos quebram a linha.
- Sem movimento para quem pede `prefers-reduced-motion`.

## [0.2.0] — 2026-10-18

> O app lembra o seu jogo e o seu progresso, mostra o quanto os dados são confiáveis e explica cada sugestão de forma mais clara.

Interface redesenhada (referências: Linear, Vercel, Stripe, Mobbin, SaaSUI, Atlassian Design System). Motor e dados iguais.

### Adicionado
- Barra de contexto fixa no topo (jogo · versão · inicial · progresso), guardada por jogo no navegador; a URL tem prioridade.
- Selo de qualidade dos dados (Verificado no código do jogo / Parcialmente verificado / Dados da PokéAPI) no jogo e no
  catálogo, com legenda; os textos técnicos foram para "Sobre os dados deste jogo".
- Cartões de resultado com o veredito primeiro (vence/perde, golpes para nocautear, quem age primeiro, origem aleatória),
  golpe e "como conseguir" em uma linha cada (a fonte que libera mais cedo) e o resto em "Detalhes"; 3 colunas no
  computador, empilhados no celular.
- Escolha do inicial por cartões clicáveis (somem depois de escolhido); atalho `/` para buscar o oponente.
- Estados de carregamento (esqueletos), estado vazio com o próximo passo e mensagens de "nenhuma sugestão" acionáveis.
- Tokens de design (cores, espaço, raio, tipografia) em claro e escuro, foco visível, abas com `role="tab"`.
- `scripts/screenshot.mjs`: largura configurável (celular), altura da página inteira, aviso de rolagem horizontal e
  `TEMA=light|dark`.

### Alterado
- Filtros (só obtíveis, evolução final, lendários, TM/HM, troca) recolhidos em "Filtros".
- Barra de abas some quando o jogo não tem detonado.
- Troca com NPC no HGSS: texto para o usuário ("o Pokémon que o NPC pede não está nos dados").

## [0.1.0] — 2026-10-17

> Primeira versão: escolha o jogo e o adversário e receba 3 Pokémon sugeridos para vencer a luta.

Primeira versão no repositório.

### Adicionado
- Catálogo com os 22 jogos da série principal (21 disponíveis) e recomendação de 3 Pokémon por oponente/treinador.
- Gen 1–3 (Red/Blue, Yellow, Gold/Silver, Crystal, Ruby/Sapphire, Emerald, FireRed/LeafGreen): núcleo conferido com o
  decomp, treinadores, onde obter, progresso por insígnia e detonado no app.
- Gen 4: Platinum completo; HeartGold/SoulSilver (decomp parcial; learnset por nível da PokéAPI); Diamond/Pearl com núcleo
  e chefes.
- Gens 5–9: dados da PokéAPI com regras da geração; golpes das Gens 5–8 conferidos com o Pokémon Showdown; iniciais
  confirmados pelo detonado.
- Cálculo de dano por geração, modo "contra o time inteiro" e penalidade/aviso para Pokémon de origem aleatória.
- Banco de lutas (`scripts/build-benchmark.mjs`): 919 lutas em 9 jogos — 98% das sugestões vencem, 91% com folga.
- Testes de regressão para cada achado de dados (`npm test`).
