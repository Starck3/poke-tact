# Como adicionar um jogo ao Poke Tact (e os erros que já cometemos)

Este documento existe para que cada novo jogo/geração não repita problemas já encontrados.
Cada item marcado com 🧪 tem um teste de regressão em `test/regressions.test.mjs`.

## Passo a passo

1. **Configurar** o jogo em `scripts/games.mjs` (version-group da PokéAPI, versões, geração, regras de físico/especial e, se houver, o decomp pret com commit fixado).
2. **Baixar fontes** (uma vez; fica em `data-sources/`, fora do git):
   `node scripts/fetch-decomp.mjs <jogo>` — arquivos de dados + clone parcial dos scripts dos mapas.
3. **Gerar**: `node scripts/build-game.mjs <jogo>` (dados → correções do decomp → treinadores → onde obter → auditorias).
4. **Ler as auditorias** em `reports/<jogo>/` — toda divergência precisa de explicação antes de seguir.
5. **Catálogo**: marcar o jogo como suportado (`node scripts/build-catalog.mjs`).
6. **Testes**: `npm test` — os invariantes de `test/datasets.test.mjs` rodam para todo jogo configurado.
7. **Olhar a tela renderizada** (vários erros só apareceram assim — ver abaixo).

## Hierarquia de fontes (validada na Gen 3)

| Fonte | Papel | O que já deu errado |
|---|---|---|
| Decomp pret (`pokefirered`, `pokeemerald`, …) | **Fonte-da-verdade** (é o código do jogo) | Formatos diferem entre repositórios (ver "Parsers") |
| PokéAPI | Fonte primária de dados | Sem histórico de **prioridade**; histórico de PP/poder incompleto; **não guarda a ordem do learnset**; marca lendários de **evento** como obtíveis |
| Pokémon Showdown (`data/mods/gen3frlg`) | Alerta automático | Mistura valores de RSE/Emerald no FRLG (230 de 230 divergências arbitradas a favor da PokéAPI/decomp) |
| Showdown `learnsets.json` público | Não usar para jogo específico | Só distingue **geração** (`3L1`), não o jogo |
| Veekun | Não é independente | Idêntico à PokéAPI (16.243 linhas iguais no FRLG) |
| Bulbapedia | Conferência pontual | Bloqueia automação: **respeitar `Crawl-delay: 5`** do robots.txt (tomamos 403 por ignorar) |
| Pokémon Database | Conferência pontual | — |
| PokeMythology (detonados) | Ordem da história, times de líderes, pós-jogo | Lista áreas opcionais fora da ordem de acesso (ex.: Power Plant depois da Liga) |
| Wikipedia (lista de jogos) | Plataforma e ano do catálogo | — |

**Regras de acesso a sites:** ler o `robots.txt` antes; ≥ 5 s entre requisições; parar no primeiro erro HTTP (sem retry agressivo); cache em disco com manifesto (URL, data, sha256); identificar o User-Agent.

## Armadilhas de dados (por área)

### Golpes
- 🧪 `past_values` da PokéAPI: cada entrada traz **só os campos que mudaram**. Resolver **campo a campo** (vine-whip saía com 45 em vez de 35).
- 🧪 Prioridade e alguns PP/poder **não têm histórico** na PokéAPI → aplicar o overlay do decomp (`apply-decomp-overlay.mjs`) e registrar cada correção.
- 🧪 Gen 1–3: físico/especial é pelo **tipo** (`IS_TYPE_PHYSICAL(type) = type < TYPE_MYSTERY`). A divisão por golpe começa na Gen 4.
- Golpes com poder "1" no decomp são placeholder de dano variável/OHKO; precisão 100 em golpes de status = "sem teste".

### Learnset e moveset padrão
- 🧪 A **ordem do learnset** importa (empates de nível): usar a ordem do arquivo do jogo, não a da PokéAPI.
- 🧪 Algoritmo do moveset padrão (`GiveBoxMonInitialMoveset`): golpe já conhecido é **ignorado** (não vai para o fim); com 4 golpes, sai o mais antigo.
- 🧪 Métodos de aprendizado novos podem aparecer por jogo (Emerald: `light-ball-egg`). O motor usa **lista explícita** de métodos aceitos.

### Evolução e disponibilidade
- 🧪 Evolução por **horário** só existe em jogo com relógio (FRLG removeu: `pokemon.c`). Configurar `hasRtc`.
- 🧪 Nível mínimo de evolução da cadeia (Tyranitar só a partir do nv 55).
- 🧪 Evolução por **troca** exige outro cartucho: fica fora por padrão.
- 🧪 Encontros podem estar **fora da tabela** (`wild_encounters.json`): Feebas do Emerald está em `wild_encounter.c`.
- 🧪 Tabelas de encontro ativadas por **evento** (Altering Cave 2–9 do Emerald, Mystery Gift).
- 🧪 Itens de evento (Mystic/Aurora/Eon Ticket, Old Sea Map): nenhum script normal os entrega → Pokémon da ilha é "evento".
- 🧪 Encontros únicos que não são capturáveis (Marowak fantasma da Pokémon Tower).
- 🧪 Vagantes dependem de escolha do jogador (inicial no FRLG; escolha no Emerald).
- 🧪 Não confiar em suposição sobre "evento": os iniciais de Johto do Emerald são obtíveis no jogo (eu errei isso).

### Progresso (o que o jogador já consegue ter)
- 🧪 Presente/fóssil/troca têm nível baixo mas podem estar no fim do jogo → estimar pela **área vizinha** (`map.json`: conexões + portas).
- 🧪 Surf/Rock Smash/varas exigem **item + insígnia**: cadeia HM → `FLAG_BADGE01_GET + golpe de campo` (`party_menu.c`) → ginásio que dá a insígnia → nível do líder.
- 🧪 Troca dentro do jogo herda o alcance do Pokémon pedido.
- 🧪 Evolução por **item** (pedras, Metal Coat…) exige o item → mesmo método de origem dos TMs (abaixo).
- Progresso por insígnia (seletor "Seu progresso") e pós-jogo: ver a seção própria abaixo.

### NPCs e scripts: como ligar "o que o jogo entrega" a "onde e quando" (`scripts/lib/script-graph.mjs`)
Vale para TMs, itens, tutores e Pokémon presenteados. Erros que já cometemos e a regra que os evita:

| Situação | Regra | Exemplo que quebrou |
|---|---|---|
| Linha que entrega (`giveitem`, `givemon`, `setvar VAR, MOVETUTOR_X`…) | Achar o **rótulo** que contém a linha (`labelAt`) e o **evento do `map.json`** cujo script o alcança (`eventsReaching`): segue `goto`/`call`/`trainerbattle` e a **queda** para o rótulo seguinte quando o bloco não termina em `end`/`return`/`goto` | — |
| Item entregue sem NPC | Procurar a partir de `<Mapa>_MapScripts` (cena automática ao entrar) | 🧪 Surf na casa do Wally (Emerald) |
| Script fora do mapa | Ler também `data/scripts/*.inc` e montar o **grafo mapa + compartilhado** (o script do NPC no mapa pode fazer `goto` para o compartilhado) | 🧪 TM43 da Route 111; 🧪 9 tutores do FRLG sem local |
| Script compartilhado que nenhum mapa chama | **Não conta** (é Mystery Gift/evento) | 🧪 ovo de Pichu do Emerald |
| Item no chão | Mapa e x,y vêm do objeto `ITEM_BALL` que referencia o script em `item_ball_scripts.inc` (não do prefixo do rótulo) | 🧪 |
| Item escondido | `bg_events` com `"item"` no `map.json` (x,y diretos) | — |
| Loja | `.2byte ITEM_...` no script do mapa; o vendedor é o NPC que alcança a lista | — |
| Valor guardado em variável | `setvar VAR_0x8009, ITEM_TM16` e entrega depois | 🧪 telhado da loja de Celadon (FRLG) |
| Golpe/lista definidos em **código C** | Config `codeTutors` com arquivo + símbolo (função ou arrays) de onde ler os golpes; nunca digitar a lista | 🧪 Cape Brink (`CapeBrinkGetMoveToTeachLeadPokemon`), Battle Frontier (`sBattleFrontier_TutorMoves1/2`) |
| Encontro fora da tabela | Config `codeEncounters` citando o arquivo C | 🧪 Feebas (`wild_encounter.c`) |
| Prêmio de ginásio | Mapa com `setflag FLAG_BADGEnn_GET`; líder = treinador do mesmo script; nível = maior nível do time | 🧪 |
| Nome do NPC | `graphics_id` (`OBJ_EVENT_GFX_BROCK` → "Brock"); em salas com vários tutores, o NPC pode ser aproximado (Battle Frontier Lounge 7) | — |

**Checklist por jogo novo:** o build imprime "posição exata dos TM/HM: X/Y", "tutores com local: X golpes" e "itens de evolução com origem: X/Y". Toda lacuna precisa de explicação (FRLG: TM10/HM08 inexistentes; Deep Sea Tooth/Scale sem Clamperl; Emerald: Metal Coat/Dragon Scale/Up-Grade só segurados por selvagens).

### Inicial do jogador, rival e vagante (`scripts/lib/starters.mjs`)
- 🧪 **Nunca deduzir pelo nome da variante do rival.** As convenções são opostas: no Emerald `TRAINER_MAY_ROUTE_103_TREECKO` é a luta de quem *escolheu* Treecko; no FRLG `TRAINER_RIVAL_OAKS_LAB_SQUIRTLE` é a de quem escolheu *Charmander* (sufixo = inicial do rival).
- Índice do inicial: FRLG = pares `setvar PLAYER_STARTER_NUM, N` / `setvar PLAYER_STARTER_SPECIES, SPECIES_X` (0 Bulbasaur, 1 Squirtle, 2 Charmander — não é a ordem da Pokédex); Emerald = ordem de `sStarterMon` (`VAR_STARTER_MON = gSpecialVar_Result`).
- Ramos: `goto_if_eq` **e** `call_if_eq VAR_STARTER_MON, N, …` 🧪 (o FRLG usa `call_if` nas lutas depois do laboratório) e `switch VAR_STARTER_MON` + `case N, …`.
- 🧪 Ao seguir um ramo de escolha, **desligar a queda para o rótulo seguinte** (`reachable(..., { fallthrough: false })`): ela levava à luta do inicial vizinho.
- Vagante: ler o `switch (GetStarterSpecies())` de `roamer.c` (FRLG: Entei/Bulbasaur, Suicune/Charmander, Raikou nos demais). No Emerald não depende do inicial (`CreateInitialRoamerMon(createLatios)`).
- Resultado: FRLG 27 e Emerald 30 lutas de rival, cada uma ligada a exatamente um inicial.

### Detonado gerado (`scripts/build-walkthrough.mjs`, aba "Detonado")
- **Só fatos dos dados do jogo**; o PokeMythology entra como fonte da ordem (crédito). Não copiar texto/imagem de terceiros.
- Local = `region_map_section` do `map.json` (agrupa andares/salas: `MAPSEC_MT_MOON`) **+ estágio** 🧪 (sem separar por estágio, a "Pokemon League" ia para o estágio 0 por causa do portão da Route 22).
- Treinadores por mapa: evento do `map.json` → grafo mapa + compartilhado → `trainerbattle` 🧪 (só o script do mapa ligava 253 de ~470 no FRLG).
- 🧪 Revanche = `X_2…X_9` quando existe `X`/`X_1` **e** nenhum script a chama. `TRAINER_TEAM_ROCKET_GRUNT_2` é outro treinador, não revanche.
- Contabilidade fechada (🧪): lutas no detonado + revanches + "sem mapa" (lista explícita) = total de treinadores.
- Encontros por Surf/vara/Rock Smash mostram a exigência (porta) 🧪.
- 🧪 Grafias do detonado (`walkthroughTypos`: "Fuschia", "Lavander", "Moosdeep") e apóstrofo ("Diglett’s") quebravam o casamento de nomes.
- 🧪 Ao procurar o nome do mapa nos títulos, testar **trechos contínuos** ("Route 119 Weather Institute 2F" → "Weather Institute"), não só cortar o fim.
- 🧪 Citação no texto vale **limitada ao intervalo dos vizinhos** (conexões; interiores: portas): resolve Route 22 (FRLG) e Route 111 (Emerald) ao mesmo tempo.
- 🧪 O trecho que começa no bloco do líder já é **depois** da luta (`<=`, não `<`).

### Ruby/Sapphire (pokeruby — o decomp mais antigo): diferenças de formato
Tudo resolvido sem duplicar o pipeline, com **apelidos de arquivo por jogo** (`decomp.aliases`: o código pede `src/data/battle_moves.h` e recebe `battle_moves.c`).
- 🧪 Ponteiros de learnset **posicionais** (`gLevelUpLearnsets[] = { gBulbasaurLevelUpLearnset, … }`, índice = espécie) e rótulos sem `static`.
- 🧪 Nomes de golpe inconsistentes **dentro do mesmo repositório**: `TM22_SOLARBEAM` × `MOVE_SOLAR_BEAM` → casar ignorando `_`.
- 🧪 Constantes em **hexadecimal** (`#define TYPE_FIRE 0x0a`): ler só o "0" punha todos os tipos iguais.
- 🧪 Rótulos com comentário de endereço (`Rotulo:: @ 8153065`).
- 🧪 Times: `gTrainerParty_X` (sem `static`), `.level` (não `.lvl`), campo **repetido** (vale o último, como em C); `.party = {.Kind = gTrainerParty_X }`.
- Tabela de tipos em **assembly** (`data/type_effectiveness.inc`, ponto fixo 20/5/0); `base_stats.h` com `.type1/.type2` e `.ability1/.ability2`; itens no chão em `data/item_ball_scripts.inc`.
- Sem tabela de tutores (RS não tem); `sStarterMons` (plural); insígnia dos HMs em `field_move_scripts.inc` (`goto_if_unset FLAG_BADGE03_GET, CannotUseRockSmash`) e, para o Surf, em C (`FlagGet(FLAG_BADGE05_GET) && PartyHasMonWithSurf()`).
- 🧪 **Nomes que mudam por versão** (`constants/version.inc` `.ifdef SAPPHIRE … .set`, e `#ifdef SAPPHIRE` em `species.h`): `SPECIES_GROUDON_OR_KYOGRE`, `ROAMER_SPECIES` (Latias/Latios), e os **treinadores** vilões (Magma no Ruby × Aqua no Sapphire). Config `versionDefine`; resolvidos por versão em espécies, vagante e detonado.
- 🧪 Southern Island usa `setwildbattle` (não `seteventmon`) mas exige o Eon Ticket → é evento.
- 🧪 Low Kick: dano por peso (poder 0 no jogo) — a PokéAPI dava 50; o overlay agora converte para "dano variável".
- 🧪 Detonado com nível errado (Wattson, Tate & Liza) → `walkthroughKnownDiffs` com a justificativa; e o **líder é reconhecido por nome + espécies** quando o nível não bate (senão a linha do tempo perdia o líder e deslocava os estágios). Detonado que lista só parte do time (Archie/Maxie, "comuns às duas versões") = `MATCH_PARCIAL`.
- Resultado: 386/386 espécies idênticas ao jogo, tabela de tipos sem divergência, 66/66 TMs com posição, 16 times do detonado explicados (12 iguais, 2 parciais, 2 divergências conhecidas).

### Jogos sem decomp (camada "PokéAPI + regras da geração")
- Configurar com `pokeapiOnly(geração, maxDex)` em `games.mjs`; o pipeline roda só o `build-data`. O catálogo marca `validation: 'pokeapi'` e a tela avisa.
- Regras por geração no `build-data` 🧪: Gen 1 Special único (`past_stats` → `special-attack` = `special-defense`), sem habilidades antes da Gen 3 (e em Let's Go, `noAbilities`), ocultas só a partir da Gen 5, categoria **por golpe** a partir da Gen 4, tipo `stellar` fora da tabela.
- 🧪 A PokéAPI pode não ter o version-group (Legends: Z-A: 0 learnsets) → o build **recusa** publicar vazio.
- 🧪 A PokéAPI pode não ter encontros (BDSP, Legends: Arceus, Scarlet/Violet) → o filtro de obtíveis é ignorado nesses jogos.
- Sprites: pasta da versão quando existe; senão, sprite padrão (`onerror`).
- Limites: só formas padrão (sem formas regionais); Mega/Dinamax/Tera não modelados.
- 🧪 `past_stats` é **parcial por entrada**, igual ao `past_values` dos golpes: cada entrada traz só os stats que mudaram. Para cada stat vale a entrada mais antiga (≥ geração do jogo) que o define. Usar só a 1ª entrada deu Beedrill Ataque 90 na Gen 1 (certo: 80, que vem na entrada `generation-v`). Afetava Gen 1–5 de todos os jogos.

- 🧪 **`past_values` dos golpes é EXCLUSIVO**: a versão da entrada é aquela em que o valor **mudou**; o valor listado vale **antes** dela. Dig `{gold-silver: 100, diamond-pearl: 60}` → Gen 1 = 100, Gold/Silver–Gen 3 = 60. Com `>=` o próprio version-group da mudança recebia o valor antigo (Gold/Silver saía com Bite Normal, Dig 100, Blizzard 90% — o pokegold confirma 60/Dark/70). Já `past_types`, `past_stats` e `past_damage_relations` são "última geração em que valia" → **inclusivos**. Não confunda os dois.
- 🧪 (revisão visual do E6) encontros da PokéAPI com condição `slot2-*` (cartucho de GBA no slot 2) **não contam** como
  obtível: no DP o Butterfree/Beedrill eram as sugestões contra o Roark. E espécies cujos encontros reais exigem todos
  `swarm-yes`/`radar-on` (ou que só vêm delas por evolução) ganham `randomOnly` → o E2 penaliza e avisa mesmo sem
  "onde obter" (Pidgey do DP: só surto na Route 229).
- 🧪 E4 — **iniciais** (`scripts/build-starters-pokeapi.mjs`): 1ª janela de 300 caracteres do detonado com três espécies não
  evoluídas (Planta/Fogo/Água), não lendárias e com linha de 3 estágios no dataset, e com palavra de **escolha** ("escolh",
  "inicia") entre 150 caracteres antes da 1ª e 120 depois da última. Sem isso o Legends: Arceus pegava Turtwig/Chimchar/Piplup
  de uma lista de "onde encontrar" (e o dataset dele não tem a Decidueye → fica sem campo). O trecho fica em
  `starters.evidence`. Ultra Sun/Moon não tem detonado → sem campo.

### Banco de lutas (`scripts/build-benchmark.mjs`) — rode ao portar um jogo 🧪
- Lutas importantes (líderes, Elite, Campeão, rivais) tiradas do detonado gerado, para cada inicial, no estágio da luta.
  Mostra problemas de DADO que os testes de dado não pegam (o que estava "disponível" na hora da luta).
- 🧪 Estágio da luta ≠ estágio do mapa: a mesma rota tem lutas de momentos diferentes (2º rival da Route 22 no Red/Blue).
  `teamStage(timeline, party)` acha o time no detonado (≥ max(2, 60%) dos Pokémon por espécie+nível) e só SOBE o
  estágio; os geradores da Gen 1/2 gravam em `progress.trainerStage` e o detonado usa.
- 🧪 Gen 2: andar interno citado só no texto com o mesmo `LANDMARK_*` de uma cidade não fica depois dela (Goldenrod
  Dept Store no estágio 7 escondia a troca do Machop contra a Whitney); interior com título tardio mas citado antes e com
  porta para exterior já alcançável usa a citação anterior (Mt. Mortar 9 → 6).

### Gen 4 — medição dos decomps de DS (2026-10-17)
- **pret/pokeplatinum** (1dc13dc): dados em **JSON/texto** — espécies, golpes, treinadores, encontros, eventos, scripts, matrizes,
  lojas, trocas. **Portado por completo** (núcleo, treinadores, onde obter, progresso, detonado).
- **pret/pokeheartgold** (708163e): JSON de atributos/evoluções (`files/poketool/personal/*.json`), treinadores, encontros e
  tutores; learnset por nível e golpes em `.narc` binário → lidos com `scripts/lib/narc.mjs` (2026-10-19, ver HGSS abaixo).
- **pret/pokediamond** (b623abe): 🧪 **medição corrigida (E5)** — eu tinha olhado só `files/fielddata/` (encontros, scripts,
  eventos, matriz: `narc_*.bin`), mas o NÚCLEO está em JSON: `files/poketool/personal/{personal,wotbl,evo}.json`,
  `waza/waza_tbl.json`, `trainer/trdata.json` (times com golpes), `include/constants/*.h`; TM/HM em `arm9/src/itemtool.c`
  (lido com `git show HEAD:`). Portado como **núcleo + chefes** (`scripts/lib/gen4-dp.mjs`, `*-dp.mjs`): 0 divergências em
  learnset/TM/atributos/tipos/habilidades; 15 golpes corrigidos (os mesmos do Platinum); learnset na ordem do jogo.
  `personal_pearl/personal.json` só muda itens segurados. O resto (antes "só chefes") está na seção seguinte.
  Lição: medir pela árvore inteira (`git ls-tree -r --name-only HEAD | grep -E "\.(json|csv|txt)$"`), não por uma pasta.

### Gen 4 — Diamond/Pearl com os BINÁRIOS lidos pelo código do jogo (2026-10-19) 🧪
O resto do DP (scripts, eventos, encontros, matrizes, trocas) está em `.bin` (um por entrada de NARC), mas o **código** que os lê
está em C/asm no decomp — daí saem as regras. `scripts/lib/gen4-dp-script.mjs`, `gen4-dp-field.mjs`, `build-trainers-dp.mjs`,
`build-acquisition-dp.mjs`; o checkout esparso inclui `arm9/src`, `arm9/asm`, `arm9/overlays` (~40 MB).
- **Scripts (bytecode)**: comando u16 + argumentos. Tamanho de cada um dos 721 comandos = leituras da função em
  `gScriptCmdTable` (`arm9/asm/unk_02038C78.s`): `ScriptReadHalfword`/`ScriptGetVar` 2, `ScriptReadWord` 4, `ScriptReadByte` 1
  (no asm o byte é inline: soma 1 em `[ctx, #0x8]`). 🧪 A contagem automática erra laço (0x289: 5 bytes num `for`) e leitura
  condicional (0x1CF–0x1D1 só leem o ponteiro na opção 2; 0x21D, 0x235, 0x237, 0x23E, 0x27C por subcomando) → `VARIABLE`/`FIXED`
  com a regra conferida no código. **Validação**: todo script termina em End/Return/GoTo e todo salto cai num comando — os 605
  scripts de mapa fecham (os 446 "level scripts" do cabeçalho têm outro formato; arquivos de 4–8 bytes = mapa sem script).
  🧪 Também saltam 0x17–0x19 (ObjectGoTo, BgGoTo, DirectionGoTo). 🧪 653 dos 668 comandos de tamanho certo batem com o Platinum
  (mesmos ids) — os NOMES do Platinum explicam os do DP (`Unk00E5` = StartTrainerBattle).
- **Faixas de script** (carregador em `unk_02038C78.s`): 2000+ comuns (arquivo 205), 3000+/5000+ treinadores (script − 2999 /
  − 4999 = treinador), 7000+ itens no chão (arquivo 370: `SetVar 0x8008, ITEM`), 8000+ escondidos (tabela `UNK_020F2DB4`, mesmo
  formato do `gHiddenItems` do Platinum).
- 🧪 **Valores por variável**: a Spear Pillar faz `LegendaryBattle 0x8004` com `0x8004` = Dialga ou Palkia por `GetGameVersion` →
  `simulate()` executa o script por versão (SetVar/CopyVar/comparações; desvio desconhecido = os dois lados).
- 🧪 Presente de item = `SetVar 0x8004, ITEM` que chega aos comuns 2016/2044 (os únicos com `GiveItem 0x8004`); o `0x8004` também é
  o PARCEIRO da luta em dupla (`StartTagBattle`: Lucas/Dawn/Barry do seu lado — não são oponentes).
- 🧪 Rival: `GetPlayerStarterSpecies` + `CompareVarToValue`/`GoToIf` → o `StartTrainerBattle` de cada ramo. A Fight Area não tem o
  desvio: usa-se a relação lida nos outros (com Piplup o Barry leva Turtwig…), só se for a mesma em todos.
- Encontros (424 bytes), matrizes, eventos (bg 20 / objeto 32 / warp 12 / gatilho 16 bytes, cada lista com u32 de contagem — os
  559 leem sem sobra), trocas (`fld_trade`: oferecido em 0, pedido em 76), extras em `arc/encdata_ex` (0 Feebas; 2–7 árvores de mel
  D/P; 8 Trophy Garden; 9/10 Great Marsh COM/SEM Pokédex Nacional — 🧪 não é Diamond/Pearl: `ov06_02245658`). Árvores de mel:
  tabela de 21 mapas `ov05_021FC650` (o motor dispara o comum 2008). Vagantes: `Save_CreateRoamerByID`. Iniciais: overlay 64.
  Tabela de tipos: bytes do overlay 11 (`ov11_02242B78.s`; trincas atacante/defensor/×10). Eventos de distribuição:
  `CheckEventValidity` 0/1/2 (Darkrai/Shaymin/Arceus, ordem do enum do Platinum) nos mapas de ACESSO; `CheckRegis` (Regigigas)
  exige os 3 Regis, que não existem no DP.
- Resultado: 490 treinadores com lugar, 21/21 rivais pelo inicial, TM/HM 100/100, 550/557 mapas com estágio, 112 locais no
  detonado; vs PokéAPI só 12 mudanças de "obtível" (Giratina passa a sim; Regigigas, Darkrai, Shaymin, Arceus e Manaphy a não).

### Jogos sem decomp — núcleo pelas tabelas do jogo do PKHeX (kwsch/PKHeX, GPL-3.0) — 2026-10-20 🧪
Black/White e Gens 6–9 não têm decomp com dados em texto; o PKHeX.Core traz as tabelas que extrai dos próprios jogos (pkNX/pk3DS)
e o código que as lê. `scripts/lib/pkhex.mjs`, `apply-pkhex-overlay.mjs`, `validate-pkhex.mjs` (passos `PKHEX_STEPS` do
`build-game` para os jogos com `pkhex` em `games.mjs`; checkout em `data-sources/pkhex-src`, commit fixo).
- Formatos: `Resources/byte/personal/personal_<jogo>` (registro fixo por espécie — `PersonalInfo/Info/PersonalInfo*.cs`:
  stats 0x00–0x05, tipos 0x06/0x07, habilidades u8 em 0x18–0x1A até a Gen 7, u16 em 0x18–0x1D na Gen 8, u16 em 0x12–0x17 no SV);
  `Resources/byte/levelup/lvlmove_<jogo>.pkl` = BinLinkerAccessor16 ("2 letras", u16 contagem, offsets u16), entrada = golpes u16
  e depois níveis u8, na ORDEM do jogo (`LearnsetReader.cs`).
- 🧪 **Validado contra os decomps antes de usar**: 0 diferenças no B2W2 inteiro (atributos, tipos, habilidades, learnset com
  ordem) e no learnset de Emerald, DP, Platinum e HGSS — teste em `test/regressions.test.mjs`.
- O que corrige na PokéAPI: a ORDEM do learnset em quase todas as espécies (moveset padrão do oponente); Cryogonal com Ataque e
  Defesa trocados (BW, XY, ORAS); Koffing/Weezing sem Stench (até a Gen 7); learnset do SV (Defog do Noctowl no 15, Vice Grip;
  "nv 0" inventado no Walking Wake). 🧪 Let's Go não tem habilidades (o personal_gg tem — não usar).
- Fora: valores dos golpes (o PKHeX só tem PP e tipo → PokéAPI + Showdown), treinadores e itens no mapa (nenhuma fonte em texto),
  encontros (o PKHeX tem, mas para legalidade: sem taxas, com "crossover" e eventos — ver `docs/FONTES-GEN5-9.md`). Selo:
  `validation: 'pkhex'` = "Parcialmente verificado".

### Gens 6–9 — onde obter pelos encontros do PKHeX; Legends: Z-A inteiro pelo PKHeX — 2026-10-20 🧪
`scripts/lib/pkhex-enc-{gen67,gg-swsh,bdsp-la,sv-za}.mjs` (um leitor por família; o cabeçalho de cada um cita os `.cs` seguidos),
`scripts/lib/pkhex-enc.mjs` (rótulos/textos, testável) e `build-acquisition-pkhex.mjs` (passo `PKHEX_ACQ_STEPS`, Gen ≥ 6).
- 🧪 Os `encounter_*.pkl` usam o BinLinkerAccessor de offsets **u32** (não o BinLinkerAccessor16 do learnset).
- 🧪 Sem taxa de aparição e sem ordem da história: o `acquisition.json` tem `encountersOnly: true` e fontes sem `pct`/`stage`
  (o app mostra "a partir do nv X" pelo menor nível). Nada de taxa inventada.
- 🧪 Fora: `FatefulEncounter`/Mystery Gift (Darkrai/Arceus/Mew/Jirachi no BDSP, Magearna no SM), raids de distribuição
  (`*_dist`, `might_paldea`, `outbreak_paldea`), GO/HOME, **blocos de crossover do SV** (CrossFrom ≠ 0: Scyther/Dreepy na
  Area One) e o Friend Safari do XY (exige o código de amigo de outro jogador).
- 🧪 O PKHeX junta métodos que o jogo separa: "Standard" das Gens 6/7 = grama + surf + varas (rótulo "Selvagem"); a grama do
  BDSP inclui Poké Radar e surto (Nidoran/Doduo na Route 201); **o SV não separa Scarlet de Violet nos selvagens** (aviso em
  `acq.notes`; os exclusivos só saem certos nas Tera Raids, que têm taxa por versão). Let's Go: faixas "L3–56" agregadas → `random`.
- Surto, Radar, árvore de mel, Max/Tera Raid, Dynamax Adventure e distorção → `random: true` (o motor penaliza, E2).
- Iniciais sem confirmação no detonado (E4) → lista "starter" dos fixos do PKHeX (Legends: Arceus, USUM, Z-A).
- **Legends: Z-A** (`pkhexOnly` em `games.mjs`; `build-data-pkhex.mjs`): espécies com a flag "presente" do `personal_za`,
  learnset, TMs (bits em 0x2C + `MachineMoves` do `PersonalInfo9ZA.cs`) e evoluções (`evos_za`, 8 bytes por método; a forma
  regional evolui pela entrada da forma: FormStatsIndex u16 @0x18). Golpes e tabela de tipos = Gen 9 do Scarlet/Violet (o
  Showdown usa os mesmos no formato do Z-A: o mod `gen9legends` herda os golpes da gen9). 🧪 O `lvlmove_za` tem byte de
  preenchimento → `parseLearnset` usa divisão inteira (como o C#); sem isso todos os níveis saíam vazios.
- **Espécies que a PokéAPI não traz no Legends: Arceus** (`fill-pkhex-species.mjs`, passo entre o overlay e a auditoria): 🧪 a
  PokéAPI guarda o learnset do LA na variedade "-hisui", e a espécie base ficava sem learnset e era descartada (18 espécies:
  Typhlosion, Samurott, Decidueye, Goodra…, mais Giratina e Porygon2). No `personal_la` a forma 0 dessas espécies vem zerada e
  ausente; o leitor usa a 1ª forma presente (`PersonalInfo.FormIndex`: FormStatsIndex u16 @0x1E + forma − 1, FormCount @0x20;
  o learnset usa o mesmo índice). Nome = espécie da PokéAPI; `form`/`spriteId` = variedade (typhlosion-hisui = 10233, o app usa
  o sprite da forma). A loja de golpes do jogo (bits u64 @0xA8, lista `MoveShopMoves`) substitui o "tutor" incompleto da
  PokéAPI (62 → 3161). Só o LA tem `forms` no leitor: nos outros jogos a forma 0 ausente é evento (BDSP: Darkrai, Arceus…).

### Gens 5–9 sem decomp — tudo o que o PKHeX e os detonados dão (0.10.0) 🧪
Passos novos (`build-game`): `add-pkhex-forms`, `apply-pkhex-machines`, `apply-pkhex-evos` (núcleo) e `build-detonado-modern`
(depois do `build-acquisition-pkhex`).
- **Formas regionais** (`add-pkhex-forms.mjs`): entradas próprias com o id da variedade da PokéAPI (rattata-alola = 10091),
  `speciesId`/`form`/`regionalForm`; tabela da forma no personal (FormStatsIndex + f − 1: @0x1C/0x20 Gens 5–7 e GG, @0x1E/0x20
  Gen 8, @0x18/0x1A SV/Z-A). 🧪 Só variedades regionais (-alola/-galar/-hisui/-paldea, sem totens) e tipos conferidos nas duas
  fontes. Encontro (espécie, forma) → forma; o app mostra "Rattata de Alola" e busca pelo nº da espécie. Exclusivos conferidos
  com a PokéAPI (Vulpix de Alola no Sun, Sandshrew de Alola no Moon — a memória dizia o contrário).
- **Evoluções** (`scripts/lib/pkhex-evos.mjs`, `apply-pkhex-evos.mjs`): evos_<jogo>.pkl (índice por espécie nas Gens 5/6; pela
  forma da Gen 7 em diante — o SM usa evos_uu). Métodos sem equivalente ganham `evo.text` em português. 🧪 Corrige: Raichu/
  Exeggutor/Marowak de Kanto impossíveis no SM ("fora de Alola"), Perrserker/Sirfetch'd/Obstagoon… a partir da forma de Galar,
  formas de Hisui no SV sem evolução no jogo (só HOME), filtro de evolução por troca nas Gens 5–9.
- **TMs** (`scripts/lib/pkhex-machines.mjs`, `apply-pkhex-machines.mjs`): bits do personal + listas do C#. 100% iguais à PokéAPI em
  7 jogos; 🧪 BW sem TM95 Snarl (não obtível); SV com as TMs de patch/DLC e sem as das formas de Hisui misturadas; TM000 fora.
  Tutores continuam da PokéAPI.
- **Onde obter do Black/White** (`scripts/lib/pkhex-enc-gen5.mjs`): mesmo formato das Gens 6–9; White Forest/Black City por versão;
  eventos (Victini, Zorua/Zoroark de evento), Dream World e Dream Radar fora.
- **Detonados modernos** (`scripts/lib/pokemythology-modern.mjs` + `build-detonado-modern.mjs`): lutas "<nome> usa:" com a imagem
  do serebii (nº nacional — 🧪 menos no SV, onde a numeração é própria → espécie pelo nome; imagem vence a grafia: "Golbat"
  com imagem de Crobat), formas por "Hisuian X"/sufixo -h. Gera `<jogo>-trainers.json` (`fromWalkthrough`; golpes = moveset padrão
  no nível, `defaultMoves`), `acq.progress` e `<jogo>-walkthrough.json`. Líderes: nome ligado a insígnia/carimbo (≥ 4) ou luta
  "líder"; vale a luta logo antes da insígnia (🧪 Giovanni do Let's Go: o esconderijo vem antes); alternativas de versão = mesma
  seção + mesmo nível + lutas coladas (Gordie/Melony sim; Piers → Raihan não). Fim da história = Hall da Fama/créditos depois do
  último líder (🧪 Leon sai "rival", Ghetsis "campeão"). Estágio dos locais: nome do PKHeX no detonado (placeStage); sem nome
  ("nesta rota encontramos…"), o 1º trecho que cita ≥ 3 espécies comuns do local (sem aparições raras — 🧪 o pós-jogo do Let's Go
  lista todas). Locais sem posição ficam em "Fora do detonado". USUM e Z-A não têm detonado local.
- **Marcos sem ginásio** (0.11.0): `acq.progress.stageNames`/`post` (o app usa nos rótulos e no pós-jogo). Z-A: seções
  "PARTIDA DE PROMOÇÃO – RANK Z → RANK Y" (a 1ª luta da seção); Legends: Arceus: "… – ACALMANDO O NOBLE X" (fim da seção);
  Sun/Moon: carimbos de ilha + Z-Crystal até 2500 caracteres depois de "totem" (🧪 presentes como Steelium/Buginium/Poisonium/
  Eevium não contam; o Fairium da Mina não tem totem e fica de fora). 🧪 Local sem título no detonado: vale a evidência mais
  cedo entre o nome no texto e as espécies (o SM só numera a Route 1 depois da 2ª provação); subárea ≤ local-pai.
- **Imagens do "Onde capturar"** (0.13.0): `build-place-images.mjs` (todos os jogos com detonado) e `build-region-maps.mjs`
  (Gens 1–3), no fim do pipeline (`IMAGE_STEPS`). 🧪 Foto só de trecho cujo TÍTULO nomeia o lugar (citação no texto trazia
  foto de outro lugar). 🧪 Crystal/GS: Johto × Kanto pelo nº de `const` antes de `KANTO_LANDMARK EQU`. 🧪 FRLG: cavernas em
  (0, 0) = sem posição; Ilhas Sevii a partir de `MAPSEC_ONE_ISLAND` têm grade própria. Nomes: "Mount" = "Mt.", plural
  ("Whirl Islands"), prédio → cidade pela 1ª palavra. As imagens do PokeMythology ficam no site deles (só referência).
- **Mapa da região — Gen 4 e remakes** (0.14.0): cada cabeçalho tem a seção do mapa (`acq.progress.maps[].landmark`);
  posição = centro das células da matriz do mundo (Platinum `map_matrix_000.json`; DP `map_matrix/narc_0000.bin`).
  🧪 Seções fora da matriz (Mt. Coronet, lagos, cavernas) ficavam sem ponto (73/173 no DP): vale o warp de entrada vindo de
  um mapa do mundo (x, z em tiles ÷ 32) e, de dentro para dentro, a posição de quem leva até ela. HGSS: posições do
  `crystal-regionmap.json` pelo nome da seção. BDSP/ORAS/Let's Go: `TWIN` em `build-region-maps.mjs` (região do jogo
  original, casando pelo nome do lugar). B2W2: a matriz do mundo em JSON só tem modelos, sem zonas — ainda sem mapa.
- **Novidades no app** (0.15.0): `build-changelog.mjs` converte o CHANGELOG.md em `public/data/changelog.json` (roda no fim do
  `build-catalog`); 🧪 um teste exige que ele acompanhe o CHANGELOG e o `package.json` — rode o build-catalog a cada versão.
- **Citação anterior no detonado** (0.16.0): `applyEarlierMentions` em `scripts/lib/progress.mjs`, chamado logo depois do
  `propagateStages` em `build-acquisition` (Gen 3), `-gen1`, `-gen4`, `-dp` e `-gen5` (Gen 2 e HGSS já tinham a regra das
  portas). 🧪 Só para lugares que o título pôs no pós-jogo (Magma Hideout, estágio 6, tem a entrada citada cedo mas
  trancada); só com vizinho (conexão ou porta) liberado no estágio da citação (Silver Cave e Viridian City do GS continuam
  no pós-jogo); rota só de água conta a partir do Surf (a Route 108 liberava o Abandoned Ship do RS no estágio 3). O
  relatório fica em `acq.progress.earlierUsed`. Aceito: o Pal Park (DP/Pt) foi para o estágio 5 — não tem fonte de captura.
- **Inicial genérico no time do rival** (0.17.0, `expandTeam` em `build-detonado-modern.mjs`): placeholders do leitor e
  nomes com barra ("Chikorita/Tepig/Totodile") viram opções. 🧪 Regra só na forma "(des)vantagem/fraqueza AO SEU", no
  TRECHO da frase com o nome do treinador (o X/Y fala de Shauna e Calem na mesma frase; "golpe de vantagem ao inicial de
  Hop" é a vantagem do jogador). Com regra: triângulo Planta→Fogo→Água, um time por inicial do jogador (`forStarter`). Sem
  regra: uma variante por opção, rotulada. Relatório em `reports/<jogo>/detonado-modern.json` → `placeholderReport`.
- **Remakes: estágio pelo jogo original** (0.18.0, `twinStage` em `build-detonado-modern.mjs`, `TWIN_STAGE`): BDSP → DP,
  Let's Go → Yellow, ORAS → RS. Sem título próprio no detonado, vale a evidência mais cedo entre o texto e o mesmo rótulo
  no original (ou as partes dele: "Route 204 South/North"), com o estágio convertido pelo NOME do líder. Ficam sem posição
  os jogos sem original nem citação (BW, Sword/Shield, Sun/Moon, Scarlet/Violet, Z-A).
- **B2W2 — grutas × PKHeX** (0.19.0, `build-acquisition-gen5.mjs`, relatório `reports/black-2-white-2/grotto-check.json`):
  0 espécies só na PokéAPI. Das 15 a mais do PKHeX (sem rota, nível agregado 15–60), 🧪 só entram as que não têm OUTRA
  forma de obter (Glameow, Stunky, Togetic): o motor usa a fonte direta e não compara com o caminho por evolução — a gruta
  sem rota (= pós-jogo) virou a fonte da Glaceon e escondeu o Eevee de Castelia (banco de lutas perdeu 6 lutas).
  Pendência de motor: comparar fonte direta × evolução em `reachStage`/`reachLevel`.
- **Mapa da região — FRLG e Unova** (0.20.0, `build-region-maps.mjs`): FRLG — seção em (0, 0) ganha a posição do warp de
  entrada (`data-sources/pokefirered-scripts/data/maps/*/map.json`); 🧪 seções de MESMO nome são um ponto só (a "Route 4"
  e o Pokémon Center dela; sem isso o warp do Mt. Moon não achava a rota). B2W2 — `res/field/matrices/overworld.json`
  tem `zones[y][x]`; lugar (`PLACE_*` da zona) = centro das células; fora da grade, herda a zona de onde sai o warp
  (`res/field/events/<zona>.json` → `warps[].zone`); nome fora dos rótulos ("Route 2 Hidden Grotto") → maior prefixo.
  BW pelo `TWIN` (mesma Unova). As coordenadas dos warps do B2W2 (`grid.x/z`) não foram usadas (escala não confirmada).
- **Fotos dos lugares pelo nome do arquivo** (0.21.0, `build-place-images.mjs`): sem trecho com o título do lugar, entram só
  as imagens cujo nome de arquivo cita o lugar — chaves = nome e prefixos de 2+ palavras, "mount" = "mt" ("Ice Path B1F" →
  icepath; "Mount Mortar 1FInside" → mtmortar); 🧪 nunca uma palavra só ("celadon" é a cidade, não o Game Corner) e número
  no fim não continua em outro dígito ("route4black" é Route 4, não Route 40). No trecho pelo título, sai a foto cujo nome
  cita OUTRO lugar (o trecho de Blackthorn só tinha fotos do Ice Path).
- **Itens de evolução** (0.22.0, `evolutionReport` + `build-evo-items.mjs`): com decomp, `acq.items[evo.param]` (o
  parâmetro da evolução e a chave do item são do mesmo jogo: THUNDERSTONE no Gen 4/5, THUNDER_STONE no Gen 3); sem
  decomp, frases do detonado com o nome em inglês do item E um verbo de obter → `<jogo>-evoitems.json`. 🧪 nome com
  maiúscula ("um upgrade no Mega Ring" não é o Up-Grade), "Fire/Water/Thunder Stone" expandido (ORAS), "sem precisar da
  Leaf Stone" fora (LA). Sword/Shield: o detonado não cita pedra nenhuma (0/28).
- **HGSS — evolução por lugar e loja do Pokéathlon** (0.22.0): `MapHeader_GetMapEvolutionMethod` devolve sempre EVO_NONE
  ("Leftover from D/P/Pl.") → EVO_ETERNA/ROUTE217/CORONET com `possible: false` (lido do `src/map_header.c`, não fixo).
  Loja do Pokéathlon = `ScrCmd_771` (Pokeathlon Dome Interior 1F): `_0210FA04[RTCDate.week]` antes da Pokédex Nacional e
  `[week + 7]` depois (estágio 9); week 0 = domingo (convenção do RTC do NitroSDK, que não está no repositório).
  🧪 rodar o banco de lutas de UM jogo regrava `_total.json` só com ele — rodar todos antes do teste.
- **Família de evolução ≠ espécies do jogo (0.22.1)**: os dados do jogo trazem todas as espécies da geração (o FireRed
  tem Pichu), mas `obtainable[versão]` falso quer dizer que não se obtém ali (cruzamento na Day Care não é modelado).
  O bloco Evoluções usa `inGame` do `evolutionReport` e `pokemon-games.json` para dizer em que jogos a espécie aparece.
- **Ovos da creche (0.23.0, `apply-breeding`)**: roda depois do onde obter nas Gens 2–4 com decomp. Grupos de ovo/sexo
  de `base_stats/*.asm` (Gen 2), `species_info.h`/`base_stats.h` (Gen 3), `personal.json`/`res/pokemon/*/data.json`
  (Gen 4); espécie do ovo = forma mais baixa da família (Diamond/Pearl: `pms.json`); incensos de `src/daycare.c` (Gen 3)
  e `sIncenseMons`/`sIncenseBabyTable` (HGSS/Platinum; DP usa a do Platinum). A creche precisa ser a que faz ovo: no
  FRLG a da Route 5 só cria (o script do mapa não cita `DAYCARE_EGG`). Gen 2 precisa de `engine/` no sparse checkout.
  A fonte `breed` tem `want` (pai) e `partner` (Ditto/macho de outra espécie); o motor usa os dois no nível/estágio.
- **Gen 1 — portões e presentes (0.24.0)**: conexão rota↔cidade atravessada por portão com guarda (`bit
  BIT_GAVE_SAFFRON_GUARDS_DRINK`) não conta para o estágio (vale o MAIOR dos dois lados); conferência de insígnia dentro de
  rotina de presente (`EVENT_GOT_…`) não fecha o mapa. **Motor**: `reachStage`/`reachLevel` comparam a fonte direta com a
  pré-evolução (sem troca); `catchReport().alt` mostra os dois. **Fotos de outra fonte**: só quando o detonado não tem
  nenhuma, por referência e com `credit`/`page` (tabela EXTRA em build-place-images). **CHANGELOG**: toda versão tem
  `> resumo` em linguagem simples logo abaixo do título (teste exige).
- **Mega Evolução (0.26.0, `add-pkhex-megas`)**: a lista de Megas e pedras vem de `ItemStorage9ZA.GetExpectedMegaStoneOrPrimalOrb`
  (PKHeX); a forma só entra se existe na tabela pessoal do jogo. Mega Ring/Z-Ring/Dynamax Band/Tera Orb: `progress.keyItems`
  no build-detonado-modern (1ª frase com verbo de RECEBER; "não" fora; regex sem `\b` depois de vogal acentuada — "dará"
  não casava). Mega Stones entram no `build-evo-items` com o nome da pedra como chave.
- **Chefe Mega/Tera (0.27.0)**: `parseModernBattles` já devolve `tags` (mega…) e `notes.tera`; o build-detonado-modern
  precisa levar isso ao time (`mega`, `tera`). Mega X/Y pelo sufixo do nome no detonado. Edição pelo shell trocou `\b` por
  backspace de novo — o teste de caractere de controle pegou; use Edit para regex.
- **Golpes Z/Max (0.28.0, `apply-zmax-powers`)**: regra do `sim/dex-moves.ts` do Showdown (o script para se a tabela mudar)
  aplicada ao poder do golpe NO JOGO; exceções de `data/moves.ts`. Z-Crystals por frase do detonado com verbo de pegar
  ("pedestal com", "ficar com" também contam). O banco de lutas ficou mais lento (≈ 11 min) com o Z.
- **Terastal (0.29.0)**: `teraForm` troca `types` pelo tipo Tera e guarda `baseTypes`; o STAB em `battle.mjs` olha os dois.
  Regra conferida no `sim/battle-actions.ts` do Showdown (baixado pelo fetch-showdown-moves).
- **Dynamax (0.30.0)**: tags `dynamax`/`gigantamax` do leitor do detonado → `party[].dynamax`; `duel` simula turno a turno
  (`dynamaxTurns`) a fração de vida com o pool 1,5× nos 3 primeiros turnos. Você só com `opts.dynamaxBattle` (a luta do
  treinador tem Pokémon dinamaxizado).
- **minLevel nos jogos do PKHeX (0.33.0)**: o apply-pkhex-evos calcula `minLevel` (maior nível de evolução na cadeia); sem
  ele, `mon.minLevel > opts.level` é sempre falso. Com progresso, `reachStage(..., maxLevel)` ignora fontes acima de
  nível do time + `LEVEL_MARGIN`.
- **Creche B2W2 (0.34.0)**: `baby_species` em res/pokemon/*/data.json = a tabela ARCID_BABYMONS; o `incenseHandler` usa ids
  numéricos — o nome do item vem de generated/items.txt (linha "ITEM_NONE = 0" e um item por linha). Depois dos bebês, o
  apply-breeding propaga "obtível" para as evoluções (e desfaz numa nova rodada pelo `breeding.evolved`).
- **Ovos nos jogos do PKHeX (0.35.0)**: `loadPkhex` lê `gender`/`eggGroups` nas posições do PersonalInfo*.cs; a creche vem do
  `progress.keyItems.daycare` (o apply-breeding roda DEPOIS do build-detonado-modern). O trecho do detonado que cita a creche
  nem sempre é o lugar dela (SwSh: Hulbury) — a tela diz "citada no trecho … do detonado".
- **Mecânicas fora do cálculo** (`mechanics` em `games.mjs` → `games.json` → aviso na tela): Mega, golpes Z, Dynamax, Terastal,
  estilos do LA, tempo real do Z-A.

### Gen 5 — Black 2 / White 2 (fuddlesworth/pokebw2, GPL-3.0) — 2026-10-20 🧪
`scripts/lib/gen5-bw2.mjs`, `apply-gen5-overlay.mjs`, `validate-gen5-vs-decomp.mjs`, `build-trainers-gen5.mjs`,
`build-acquisition-gen5.mjs`. O pokebw2 reconstrói as ROMs byte a byte e segue o esquema do pokeplatinum: dados em JSON
(`res/pokemon/<x>/data.json`, `res/moves`, `res/trainers/data`, `res/field/{zones,events,encounters,trades,matrices}`) e scripts
de campo em TEXTO (`res/field/scripts/*.s`, comandos com os nomes do swan); a documentação dele (`docs/data.md`,
`docs/scripts.md`) e o C em `src/` dizem como o jogo lê cada coisa. Fixar o commit (repo novo e muito ativo).
- Núcleo: tipos/stats/habilidades (com a oculta), learnset na ordem do jogo, TM (`TM_MOVE_LIST` em `src/system/pml_item.c`:
  TM01–92, HM01–06, TM93–95), tutores, evoluções (🧪 Gen 5 tem `EVO_METHOD_TRADE_WITH_SPECIES` → `TRADE_SPECIES` no motor) e a
  tabela de tipos (`btl_calc.c`, 17×17 em metades). 🧪 Relic Song/Secret Sword são tutores de PLUGIN (bytes no decomp; tabela de
  plugins em `docs/scripts.md`) → ficam da PokéAPI. 🧪 A PokéAPI troca Ataque/Defesa do Cryogonal. Grafia sem hífen
  (`COMPOUNDEYES`), como no HGSS.
- 🧪 **`VMJumpIf CMP_STACK` salta quando a comparação é FALSA** (`s001F_VMJumpIf`: `if (VM_StackPop(vm) != 1) VM_Jump`) — o
  comentário de `include/constants/field_script.h` diz o contrário; vale o código. O bloco logo depois do teste é o caso "igual"
  (confirmado pela escolha do inicial: `0x4030 = 0` junto com Snivy).
- `simulateText()` executa o script por versão (`GameGetVersion` 23 Black 2 / 22 White 2): Floccesy dá Gible no B2 e Dratini no
  W2. 🧪 Comando não modelado que recebe variável pode ESCREVÊ-LA (`YesNoWin`, `CallPokeSelect`): sem esquecê-la, o simulador
  seguia sempre o mesmo ramo e perdia as trocas (Petilil, Cottonee, Rotom). 🧪 Orçamento de passos POR entrada (a HM03 da Route 6
  só aparecia com 10× mais passos quando o orçamento era do arquivo).
- 🧪 **Zonas de uma versão só**: `VERSION_SPECIFIC_ZONES` em `src/system/zonedata.c` + `#ifdef WHITE2` → 1º do par = Black 2,
  2º = White 2 (Black City × White Forest, os portões, Route 4 × Route 4_16: Mandibuzz no B2, Braviary no W2).
- Treinadores: NPC com script 3000+n / 5000+n (`trainer_script.c`), `CallTrainerBattle A, B`, `CallTrainerMultiBattle PARCEIRO,
  A, B` (o 1º é aliado). Rival: `EVENT_WORK_0x4030` (0/1/2 = Snivy/Tepig/Oshawott, gravado junto com a espécie na escolha).
  🧪 A cadeia de testes do rival só se lê do começo (um rótulo-alvo de outro teste daria o "senão" errado).
- Onde obter: encontros por estação e versão; slots e taxas em `src/ov036/enc_pokeset.c` (12 slots grama/escura/balançando;
  60,30,5,4,1 surf; 40,40,15,4,1 pesca — 1ª linha; as outras só com poderes do Entralink); enxames (`data_ov036_021d01fc`) e
  🧪 só depois do Hall da Fama (`FLAG_SWARMS` 0x960 = estrela do cartão); Pokémon do N (`N_POKEMON_INFO`); presentes, ovos,
  estáticos, trocas (`FieldTradeCheck … TRADE_X` → `wanted_species`); item = `WorkSet 0x8000, ITEM` + `RTCallGlobal` de um global
  que chega a `ItemAdd` (calculado); item no chão 7000+i → `global_7000.s`; escondido 8000+i → `global_8000.s`; 🧪 NPC que chama um
  script GLOBAL direto (fósseis: global 10280, cada ramo grava a espécie) — o global roda como se fosse do mapa.
- **Fora do decomp em texto** (ficam no arquivo do jogo): itens das lojas comuns ("shop dat"; 15 TMs sem origem) e os Hidden
  Grottoes (`SLOT_ARC`) → os grottoes vêm da PokéAPI (cache), com `source: 'pokeapi'`.
- 🧪 Detonado: lista o time normal e o do Challenge Mode no mesmo bloco → `buildTimeline` aceita bloco com o NOME e o time inteiro
  contido; grafia "Whrilipede" (Roxie) em `walkthroughTypos`. Surf: o global 10002 testa uma flag, não insígnia → porta = HM03.
- Resultado: 0 divergências no núcleo; 577 treinadores (18/18 rivais pelo inicial); 8 líderes + Elite 4/4; 584/615 zonas com
  estágio; 119 locais no detonado; 102 lutas no banco (99% vencem); vs PokéAPI só acréscimos (enxames, Pokémon do N).

### Gen 4 com decomp em JSON (`scripts/lib/gen4-json.mjs`, `*-gen4.mjs`) — S6 🧪
- Núcleo: `generated/moves.txt`/`species.txt` (ordem = id); `res/pokemon/<x>/data.json` (learnset `by_level` na ordem do jogo,
  `by_tm` "TM06" → golpe pelo `teachesMove` de `res/items/data/tmNN.json`, `by_tutor`, evoluções); `res/moves/<x>/data.json`
  (class = categoria por golpe, priority, pp); tabela em `src/battle/battle_lib.c` (`sTypeMatchupMultipliers`).
- 🧪 A PokéAPI não guarda várias mudanças das Gens 8–9: prioridades (Protect/Detect +3, Fake Out +1, Extreme Speed +1, Teleport
  0 na Gen 4) e PP de golpes de cura (Recover, Roost, Slack Off, Milk Drink, Soft-Boiled = 10). Corrigido pelo overlay no
  Platinum; nos jogos das Gens 5–8 da camada PokéAPI → **E3** (`scripts/crosscheck-moves-showdown.mjs`): Showdown fixado num
  commit (`fetch-showdown-moves.mjs`, 6 arquivos, ≥5 s), lido como texto; valor na Gen G = `data/moves.ts` ← mods gen8…genG;
  ligação pelo `num` 🧪 mas pelo nome primeiro (variantes `hiddenpowerwater` têm o mesmo num). Corrige só com 2ª evidência
  (Showdown Gen 4 = decomp do Platinum e sem mudança até G): Recover/Roost/Rest/Slack Off/Milk Drink/Soft-Boiled PP 10,
  Teleport 0 (até a Gen 7), Luster Purge 70, Follow Me +3 (Gen 5). Golpes posteriores à Gen 4 (Ally Switch +1 na Gen 5,
  Magic/Wonder Room −7) ficam **só sinalizados** em `reports/<jogo>/moves-crosscheck.json`. Let's Go e Legends: Arceus fora
  (mecânica própria).
- 🧪 Evolução **sem parâmetro** tem 2 itens no JSON (`["EVO_LEVEL_HAPPINESS_NIGHT", "SPECIES_UMBREON"]`): ler como
  `[método, null, alvo]` — antes Umbreon, Espeon, Leafeon, Glaceon e Magnezone ficavam sem evolução (achado nas capturas de
  tela: "evolua: Umbreon ()"). Parâmetro ausente fica `null`, nunca a string "null".
- 🧪 Habilidade repetida nos dois slots no JSON (Vaporeon: Water Absorb/Water Absorb) → deduplicar. Tutores de golpes supremos
  e Draco Meteor são por **script** (fora do `by_tutor`) — `scriptTutors`.
- Treinadores: `res/trainers/data/<constante minúscula>.json`; lugar por objeto (`"script": "TRAINER_X"`) ou script
  (`StartTrainerBattle A[, B]`, `StartTagBattle VAR, A, B`, `StartFirstBattle`). 🧪 Sufixo do rival (`RIVAL_ROUTE_203_PIPLUP`)
  = inicial do **JOGADOR** — oposto da Gen 2; desvio `GetPlayerStarterSpecies` + `GoToIfEq VAR_RESULT, SPECIES_X` (School Kids
  também desviam, mas é o mesmo treinador → só rivais). 🧪 `iv_scale` é u16: `ivs = ivScale·31/255` e `≥ 32` = IVs
  **aleatórios** (`Pokemon_InitWith`; Electivire do Volkner, 2500). Parceiros (Cheryl, Riley…, Barry na Fight Area/Spear
  Pillar) não são oponentes.
- Mapas: `include/data/map_headers.h` (scripts/events/encounters/`mapLabelTextID`); 🧪 **sem conexões**: o mundo é uma matriz
  (`res/field/matrices/*.json`) — células vizinhas com cabeçalhos diferentes = mapas ligados; warps em `events.warp_events`.
- Encontros (`src/overlay006/wild_encounters.c`): terra 20,20,10,10,10,10,5,5,4,4,1,1; slots 2–3 = `day`/`night` (manhã fica o
  padrão); 0–1 enxame; 4,5,10,11 Poké Radar; 6–7 Trophy Garden (`daily_encounters`) / Great Marsh (espécie do dia no Safari);
  🧪 8–9 = **dual-slot** (cartucho de GBA) → fora: Ekans, Caterpie, Sandshrew, Vulpix… a PokéAPI conta como obtíveis. Água
  60,30,5,4,1; Old 60,30,5,4,1; Good/Super 40,40,15,4,1. Árvores de mel (`honey_tree.c`): common 70% / uncommon 20% / nada 10%,
  slots 40,20,20,10,5,5, nv 5–15, "rare" (Munchlax) só em 4 árvores do ID do treinador. Feebas: qualquer vara nos pontos de Feebas,
  nv 10–20. Vagantes: `ActivateRoamingPokemon ROAMING_SLOT_X` + `roaming_pokemon.c` (Darkrai nunca é ativado). Fósseis: Mining
  Museum, nv 20 (`scrcmd_fossil.c`), precisam do Explorer Kit.
- 🧪 Evento: encontro cujo mapa checa `CheckDistributionEvent DISTRIBUTION_EVENT_<ESPÉCIE>` (Darkrai, Arceus); Regis exigem
  Regigigas de evento (`CheckPartyHasFatefulEncounterRegigigas`) e o Regigigas os três Regis → nenhum sai sem evento. A
  PokéAPI marca Regigigas, Darkrai, Arceus, Shaymin e Manaphy como obtíveis. (Regra por "CheckItem de item sem origem" marcava
  Dialga/Palkia por engano — o mapa deles checa a flauta só para o Arceus.)
- Itens: visíveis = script 7000+i → i-º `ScriptEntry` de `scripts_visible_items.s` (🧪 usam `VAR_0x8008`); escondidos = bg_event
  8000+i → `gHiddenItems[i]`; presente de NPC = `SetVar VAR_0x8004, ITEM_X` num mapa que entrega item (🧪 o comando pode estar
  em outro rótulo); lojas `PokeMartSpecialtiesWithGreeting` + comuns por nº de insígnias (`scrcmd_shop.c`); Game Corner
  (`scrcmd_game_corner_prize.c`); Battle Points (`ScrCmd_PokeMartFrontier` — 🧪 a 1ª ocorrência no arquivo é o protótipo).
  Resultado: **TM/HM 100/100**.
- Estágio (cada item foi um erro real): 🧪 detonado em PT escreve "Cidade de Celestic"/"Jubilife" cedo e o nome completo
  só depois → para exteriores, `placeStage(…, { earliestText: true })`; ginásio fixa a cidade (teto); passagem (portão
  Route 218 ↔ Jubilife = Old Rod no estágio 0); interior citado só pelo nome da cidade = estágio da porta (caverna de Celestic,
  Surf); 🧪 **rota de mar** (sem terra, com Surf) não citada → piso = insígnia do Surf (Routes 219/220 herdavam 0 de Sandgem);
  presente de item também pela 1ª citação do item (Poké Radar só depois da Pokédex Nacional); Great Marsh pelo portão do
  observatório de Pastoria (`stageFacts`). 🧪 A checagem de insígnia do Surf fica a ~500 caracteres do nome da função.
- Resultado: 0 divergências no núcleo; 500 lutas (24 do rival, todas pelo inicial); 387 obtíveis; 112 locais no detonado.

### Gen 4 — HeartGold/SoulSilver (`scripts/lib/gen4-hgss.mjs`, `*-hgss.mjs`) — E1 🧪
- **O que está em texto** (`game.asmDecomp.sparse` lista os caminhos; no Git Bash use `MSYS_NO_PATHCONV=1` para mexer no sparse
  à mão — sem isso `/files/...` vira `C:/Program Files/Git/files/...`): `files/poketool/personal/personal.json` (atributos, tipos,
  habilidades, TM/HM), `evo.json`, `wazaoshie/waza_oshie.json` (tutores), `trainer/trainers.json`, `encountdata/gs_enc_data.json`,
  `eventdata/zone_event/*.json`, `script/scr_seq/*.s`, `files/arc/headbutt.json`, `files/arc/safari_enc.json`,
  `files/data/mushi/mushi_encount.csv`, e o C em `src/`. **Binário**: learnset por nível (`wotbl.narc`), golpes (`waza_tbl.narc`),
  trocas com NPC (`a/1/1/2`), matriz do mundo.
- Núcleo: 🧪 HMs ficam num campo à parte (`"hms": [1, 4, 6]`) → HM n = `sTMHMMoves[92 + n − 1]` (`src/item.c`; antes 1156 "faltas");
  🧪 grafia do decomp sem hífen (`COMPOUNDEYES`, `LIGHTNINGROD`) → comparar sem hífen; tutores supremos/Draco Meteor por script
  (`scr_seq_0948_T30R0601.s`). Golpes e learnset por nível: 🧪 dos binários do próprio HGSS (`waza_tbl.narc`, `wotbl.narc`) com
  `scripts/lib/narc.mjs` (NARC = BTAF/BTNF/GMIF; learnset u16 = golpe 9 bits + nível 7 bits, 0xFFFF encerra; golpe 16 bytes). Os
  golpes batem 100% com o Platinum, mas o learnset difere em 13 espécies (Cyndaquil, Lugia, Ho-Oh…) — por isso não bastava usar o
  Platinum, nem o Gold/Silver (Gen 2: outra lista de golpes). Resultado: 0 divergências, inclusive learnset e golpes.
- Treinadores: `trainers.h` (`#define TRAINER_X n`) → `trainers.json.trainers[n]`; iv = `difficulty·31/255` (`trainer_data.c`).
  Lugar: `std_trainer(TRAINER_X)` no zone_event ou `TrainerBattle A[, B]` no script; código do mapa ↔ `MAP_X` pelo
  `map_headers.h` (`.scriptsBank = scr_seq_N_<código>_bin`, `.eventsBank`). 🧪 A **1ª luta do rival é `TRAINER_PASSERBY_BOY`**
  (Cherrygrove: o nome ainda não é conhecido). Rival pelo inicial: `GetStarterChoice VAR / Compare VAR, 152 / GoToIfNe _L /
  TrainerBattle A` — o último sem Compare é o que sobrou (o Silver leva o que vence o do jogador). Chefes `_2/_3` = revanches.
  🧪 Rótulo "Leader Lt Surge Lt. Surge" → comparar classe/nome sem pontuação.
- 🧪 **Desvios por versão no script** (`scripts/lib/hgss-script.mjs`): `GetGameVersion V / Compare V, 7|8 / GoToIfNe|GoToIfEq` (HG 7,
  SS 8) — o leitor segue só o ramo da versão e resolve variáveis (`SetVar|SetOrCopyVar VAR, X` nas linhas alcançáveis): Ho-Oh nv 45
  no HG/70 no SS, Lugia o contrário; Ekans (HG) × Sandshrew (SS) no Game Corner; Latias vaga no HG, Latios no SS.
  🧪 **Visibilidade por flag**: a luta do Kyogre não depende da versão, o *objeto* sim (`ClearFlag FLAG_HIDE_…_KYOGRE` só no ramo
  HG) → se existe ClearFlag do objeto e nenhum é alcançável na versão, a espécie não aparece nela. 🧪 O Hall of Fame recria
  vagantes (`SetVar VAR_ROAMER_X_STATUS, 0 / CreateRoamer n`) → não é fonte. 🧪 Objeto liberado por `ClearFlag` em outro mapa:
  estágio mínimo = o do mapa que libera (Suicune da Burned Tower B1F: Hall of Fame → pós-jogo; o mapa tem 2 Suicunes, o da
  cena e o da luta → dono = objeto cujo `scriptId` aponta para a entrada com o WildBattle).
- 🧪 Evento: `FollowerPokeIsEventTrigger EVENT_ARCEUS_*` (Sinjoh Ruins → Dialga/Palkia/Giratina) e `ScrCmd_546` (lê
  `VAR_UNK_4043`, que só `scrcmd_mystery_gift.c` escreve → Latios/Latias de Pewter). A PokéAPI marca Dialga/Palkia/Giratina e
  Manaphy como obtíveis.
- Encontros (`src/field/encounter_check.c`): terra 12 slots por horário (`morn` manhã, `day` dia/entardecer, `nite`); Surf
  60,30,5,4,1; 🧪 **varas 40,30,15,10,5** (≠ Platinum); noite: Good Rod slot 3 e Super Rod slot 1 = `nightFish`; Rock Smash 80,20;
  🧪 **todo mapa tem `landSwarm` preenchido** — surto só nos 20 mapas de `sSwarmMapLUT` (`src/unk_02097F6C.c`, tipo terra/surf/
  pesca); Hoenn/Sinnoh Sound (slots 2–5) só com a Pokédex Nacional (`pokemon_music.c`: quarta/quinta) → pós-jogo; Headbutt 50,15,
  15,10,5,5 (árvore comum × rara pelo ID); Concurso de insetos: conjunto 0 sem Pokédex Nacional, com ela `dia/2`
  (`overlay_bug_contest.c`; chance = rate[i−1] − rate[i]); Safari: `LCRandom() % 10` (10% cada) e espécies "bonus" com objetos.
- Itens: item no chão = std 7000+i → `scr_seq_0141_<i>` (`SetVar VAR_SPECIAL_x8008, nº`, id em `items.h`); escondido = std 8000+i →
  `sHiddenItemParam[i]`; presente = `SetVar VAR_SPECIAL_x8004, ITEM_X` ou 🧪 o macro `GoToIfNoItemSpace ITEM_X, n, _L` antes do
  `std_give_item` (TM51 do Falkner) e 🧪 apelidos `TM_EXPLOSION` = `ITEM_TM64` (`items.h`); Game Corner: `GoToIfNoItemSpace` +
  `TakeCoins N` + `GiveItem`; lojas `std_pokemart` (faixas por insígnias, igual ao Platinum) e `std_special_mart N` →
  `_0210FA3C[N]`. TM/HM 90/100 (os 10 restantes só aparecem em `item.c`: Battle Frontier/Pokéathlon em binário).
- Mapas: 🧪 a matriz é binária → **conexões do pokecrystal** (`data/maps/attributes.asm`) casadas por nome (`NEW_BARK_TOWN` →
  `MAP_NEW_BARK`, `ROUTE_10_NORTH` → `MAP_ROUTE_10`, `SILVER_CAVE_OUTSIDE` → `MAP_MOUNT_SILVER`); 68 mapas, 0 sem par; mapas
  novos (Route 47/48, Safari) só por warps/texto.
- Estágio = regras da Gen 2 (landmark = `.mapsec`): 🧪 o início é um interior (`location_backup.c`: quarto do jogador) → seguir
  as portas até o 1º exterior (New Bark = 0; a regra de "rota de mar" marcava New Bark como Surf); rota de mar só para
  `MAP_TYPE_ROUTE`; 🧪 o detonado escreve as rotas em português ("rota 32") e "poço dos Slowpokes" → `HGSS_PLACE_NAMES`;
  🧪 corredor: rota citada tarde mas com 2+ vizinhos no mesmo estágio mais baixo = esse estágio (Route 29 entre New Bark e
  Cherrygrove); 🧪 guias de cavernas no fim do detonado: estágio = max(citação anterior, porta mais cedo) (Ruins of Alph 1,
  Union Cave B1F 4, Mt. Mortar 6); Route 27 = 8 (`HGSS_STAGE_FACTS`, mesmo fato da Gen 2).
- Resultado: núcleo 0 divergências; 489 treinadores (21 do rival, todos pelo inicial); 408/407 obtíveis (8 mudanças vs PokéAPI,
  todas eventos); 121 locais no detonado; banco: 138 lutas, 99% das sugestões vencem, 96% folgadas.

### Fórmula de dano e pontuação (`public/battle.mjs`, `recommend`/`recommendTeam`) — R2–R5 🧪
- Conferida no código: Gen 1 `pokered engine/battle/core.asm` (`CalculateDamage`, `AdjustDamageForMoveType`, `RandomizeDamage`),
  Gen 2 `pokecrystal effect_commands.asm` (`BattleCommand_DamageCalc`, `_Stab`, `_DamageVariation`), Gen 3 `pokemon.c`
  (`CalculateBaseDamage`). base = ⌊⌊⌊2L/5+2⌋·Poder·A/D⌋/50⌋ (+2; Gen 1–2 teto 997 antes do +2); atributos > 255 divididos
  por 4 na Gen 1–2; STAB ×1,5; tipo; aleatório 217–255/255 (Gen 1–2) ou 85–100% (Gen 3). Ranking com o dano médio, sem crítico.
- Atributos no nível: Gen 1–2 `⌊((B+DV)·2)·L/100⌋+5` (PS +L+10; DV do PS = bits baixos); Gen 3 `⌊(2B+IV+EV/4)·L/100⌋+5`.
  Seu Pokémon: DV 8 / IV 15, sem EV/stat exp, natureza neutra (documentado como estimativa).
- 🧪 Atributos REAIS do oponente: Gen 1 todo treinador DV 9/8/8/8 (`ATKDEFDV_TRAINER $98`, `SPDSPCDV_TRAINER $88`); Gen 2
  por classe (`data/trainers/dvs.asm`); Gen 3 `.iv` do time (0–255 → iv·31/255, `battle_main.c` fixedIV). Gravados nos
  arquivos de treinadores (`dvs`, `iv`).
- 🧪 Bônus de insígnia do jogador: Gen 1 (`ApplyBadgeStatBoosts`, ×9/8) Boulder Atk, Thunder Def, Soul Vel, Volcano Esp;
  Gen 2 (`BadgeStatBoosts`, +1/8) Zephyr Atk, Plain Vel, Mineral Def, Glacier AtqE (a DefE da Glacier tem bug no código —
  não aplicado); Gen 3 (`ShouldGetStatBadgeBoost`, ×1,1) insígnia 1 Atk, 3 Vel (`battle_main.c`), 5 Def, 7 AtqE/DefE.
  `progress.badges` (nº → líder) vem do script de cada ginásio (Gen 1 `set BIT_XBADGE`, Gen 2 `setflag ENGINE_XBADGE`,
  Gen 3 `setflag FLAG_BADGE0N_GET`); vale a insígnia cujo líder está entre os N primeiros da linha do tempo.
- Casos especiais: dano fixo (Dragon Rage 40, Sonic Boom 20, Seismic Toss/Night Shade = nível); vários acertos (2–5 → 3;
  "twice" → 2; Triple Kick 6×); dois turnos/recarga = metade por turno (Hyper Beam: recarga só entre golpes);
  Explosion/Self-Destruct dividem a defesa e só valem se nocauteiam de uma vez. 🧪 Rollout/Ice Ball (até 5 usos, recomeça —
  `rollout.asm`) e Fury Cutter (teto 16× — `fury_cutter.asm`) contam como dano acumulado: excluí-los fazia o Gastly parecer
  invulnerável à Miltank da Whitney. Golpes de valor indeterminável (Psywave, Super Fang, Return/Frustration, Low Kick,
  Hidden Power, Counter…) ficam fora em vez de receber número inventado.
- Pontuação: 1º quem vence a troca (nocauteia antes de ser nocauteado; Velocidade decide), depois a folga (turnos dele ÷ meus,
  até 6), menos turnos meus, quem age primeiro. Modo "contra o time inteiro" (`recommendTeam`): mais vitórias, depois folga.
- Banco de lutas (antes → depois, mesma fórmula): sugestões **folgadas** 78% → 91% (time no nível do ás) e 68% → 83% (3 níveis
  abaixo, `BENCH_DELTA=3`); que vencem 95% → 97%. O teste R4 impede piorar.
- 🧪 E2 — **origem aleatória/condicionada** (`unreliableReason`/`unreliableFor` em `engine.mjs`): surto, Poké Radar, árvore de
  mel, sorteio diário (Trophy Garden/Great Marsh), pontos de Feebas, árvore rara/secreta do Headbutt, som no rádio, Concurso de
  insetos, espécie "bonus" do Safari e slots de 1–2%. Se TODAS as fontes disponíveis até o estágio/nível forem assim, −20 pontos
  (menos que uma vitória, mais que duas faixas de folga) e aviso na tela. Antes, 31% das sugestões do Platinum (247/801) e 25%
  das do HGSS (429/1692) dependiam só disso; depois 3%. Custo medido: vitórias iguais; folgadas no Platinum 94% → 91%,
  Emerald 90% → 89%. Teste E2 fixa a regra.

### Gen 2 com decomp em assembly (`scripts/lib/gen2-asm.mjs`) — S5
- `fetch-decomp.mjs` (clone esparso). pokecrystal guarda os scripts dos mapas em `maps/` (não em `scripts/`): baixar quando for portar treinadores/aquisição.
- Pipeline (`build-game.mjs`, `ASM_STEPS[2]`): `build-data` → `apply-gen2-overlay` → `validate-gen2-vs-decomp` (`--antes` audita sem o overlay).
- Formatos: `base_stats/*.asm` com 6 stats (`hp atk def spd sat sdf`) e `tmhm` que **mistura TM, HM e tutores** — separar por `add_tm`/`add_hm` (máquinas) e `add_mt` (tutores do Crystal: Flamethrower, Thunderbolt, Ice Beam) em `constants/item_constants.asm`. Learnset (já com os de nível 1) em `evos_attacks.asm`, na ordem de `evos_attacks_pointers.asm`. `pokemon_constants.asm`: `const_def 1` até `NUM_POKEMON` (há outro `const_def 1` depois).
- Evoluções → vocabulário do motor: `EVOLVE_LEVEL`→`LEVEL`; `EVOLVE_ITEM`→`ITEM`; `EVOLVE_TRADE` `-1`→`TRADE`, item→`TRADE_ITEM`; `EVOLVE_HAPPINESS` `TR_ANYTIME|TR_MORNDAY|TR_NITE`→`FRIENDSHIP|_DAY|_NIGHT` (Gen 2 tem relógio: possível); `EVOLVE_STAT 20, ATK_GT_DEF`→`LEVEL_ATK_GT_DEF` (Tyrogue).
- 🧪 Golpes: `CURSE_TYPE` = `unknown` da PokéAPI ("???"). `EFFECT_STATIC_DAMAGE` (Dragon Rage 40, Sonic Boom 20): o número do decomp é o **dano**, não poder base → manter `null`. PokéAPI erra PP de Milk Drink (5→10), Mind Reader (40→5), Rest e Soft-Boiled (5→10).
- Moveset padrão: `FillMoves` (`engine/pokemon/evolve.asm`) = mesmo algoritmo da Gen 1 (para no 1º nível maior).
- Resultado: Gold/Silver (pokegold@ef0201d) e Crystal (pokecrystal@3bc8daa) com **0 divergências** (learnset, TM/HM, tutor, stats, tipos, golpes, tabela).

#### Treinadores da Gen 2 (`scripts/build-trainers-gen2.mjs`) 🧪
- `trainerclass X` (ordem = id; `TRAINER_NONE` = 0 fica fora; CHRIS/KRIS são `DEF`, não classe) + `const X1…` (ids 1-based por classe); times na ordem de `TrainerGroups` (`party_pointers.asm`); `db "NOME@", TRAINERTYPE_NORMAL|MOVES|ITEM|ITEM_MOVES`; golpes do time só nos tipos `*MOVES` (senão `FillMoves`).
- Lugar: `maps/*.asm` — `trainer CLASSE, ID, …` (treinador do mapa) e `loadtrainer CLASSE, ID` (script). Revanche por telefone (JOEY2…): mesmo treinador no mesmo mapa → `rematch: true`. Os ~60 times sem lugar não são referenciados em lugar nenhum (não usados).
- Rival ↔ inicial: `checkevent EVENT_GOT_<INICIAL>_FROM_ELM / iftrue .Rótulo` antes do `loadtrainer`; sem desvio = o inicial que sobrou. 🧪 Rótulo local pode vir **sem ":"** (`BurnedTower1F`: `.totodile`) — sem isso os 3 times saíam ligados ao mesmo inicial. Teste confere com o sufixo do id (`RIVAL1_3_TOTODILE`): o rival leva o que vence o do jogador.
- Nome do rival no decomp é `"?"` (o jogador escolhe) → rótulo "Rival". Tokens do Game Boy: `#` = POKé ("#FAN" → Pokéfan), `<PKMN>` = POKéMON.
- 16 líderes: Johto (`Líderes de ginásio`, usados no progresso) e Kanto (`Líderes de Kanto`, pós-Liga). Resultado: Gold/Silver 439 lutas, Crystal 473; 21 lutas de rival em cada.

#### Onde obter, progresso e detonado da Gen 2 (`build-acquisition-gen2.mjs`, `build-walkthrough-gen1.mjs`) 🧪
- Mapas: `data/maps/attributes.asm` (`map_attributes Arquivo, CONST` + `connection`), `data/maps/maps.asm` (ambiente, `LANDMARK_*`, `FISHGROUP_*`), `maps/<Arquivo>.asm` (warps e scripts). 🧪 Em `maps.asm` a música pode ser `RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY` — ler os campos por vírgula (a Radio Tower ficava sem landmark).
- Selvagens: grama com 3 blocos `; morn / ; day / ; nite` × 7 slots (30,30,20,10,5,4,1%), água 3 slots (60,30,10%). Fonte por espécie com `pct` = média dos 3 horários e `times` quando não aparece em todos (Hoothoot só à noite). Enxames (`swarm_*`, aviso por telefone) e Bug Contest (`bug_contest_mons.asm`, a PokéAPI não tem → Scyther/Pinsir).
- 🧪 pokegold usa `ELIF DEF(_SILVER)` — `resolveIfdef` trata `ELIF` (sem isso o Gold perdia Pikachu, Clefairy…). Resolver por versão **todos** os arquivos (inclusive `treemons.asm`).
- Pesca: grupo do mapa → `fish.asm` (chance acumulada; `time_group N` = espécie de dia/noite em `TimeFishGroups`); só em mapas com tabela de água (conservador: o asm não diz quais mapas têm água). Headbutt/Rock Smash: `treemon_maps.asm` + `treemons.asm` (`TREEMON_SET_ROCK` = Rock Smash), porta = quem dá o TM. Vagantes: `InitRoamMons` (Crystal: Raikou/Entei nv 40; Gold/Silver + Suicune).
- Scripts: `givepoke` (presente; com `takecoins X_COINS` logo depois = prêmio, custo em `DEF X_COINS EQU`), `giveegg`, `loadwildmon`, `trade NPC_TRADE_<OT>` (o nome do OT em `npc_trades.asm` liga a constante), `itemball`/`hiddenitem`/`verbosegiveitem`/`giveitem`, `pokemart MARTTYPE, MART_X`. Iniciais: `givepoke` do `ElmsLab`. 🧪 Crystal: **Odd Egg** (`special GiveOddEgg` → `data/events/odd_eggs.asm`) — sem ele os bebês saíam "não obtíveis".
- 🧪 TM09 (Psych Up) não é referenciado por nenhum mapa/loja nos dois jogos (só um texto "unreferenced" no ginásio de Olivine) → sem origem, registrado assim.
- HMs fora da batalha: `engine/events/overworld.asm` (`.TrySurf` → `ENGINE_FOGBADGE`…): Flash Zephyr, Cut Hive, Strength Plain, Surf Fog, Fly Storm, Whirlpool Glacier, Waterfall Rising.
- 🧪 A camada PokéAPI bloqueava evolução por horário em todas as gerações; só vale na Gen 3 (`build-data`). Gen 2/4+ têm relógio.
- Estágio (cada item foi um erro real):
  - checagem de insígnia só em mapas `GATE` (um NPC da Route 29 checa a Zephyr para dar item → Route 29 ia a 1);
  - ginásio do N-º líder = estágio N−1 e a cidade dele tem **teto** N−1 (Gold: Azalea herdava 2 porque o detonado não tem seção dela; Olivine é visitada no 4 antes do ginásio da Jasmine, o 6º — igualdade estava errada);
  - **passagem**: interior com portas para 2+ mapas externos não fica depois do lado mais cedo (Union Cave era 9 pelo título de uma revisita; Dark Cave idem);
  - palavras genéricas extras (`placeStage(…, { generic })`: tower, cave…) — "Sprout Tower" casava com a "tower" de Ecruteak;
  - `stageFacts` com evidência: Route 36 = 3 (Sudowoodo: `checkitem SQUIRTBOTTLE`; a floricultura só dá com a PLAINBADGE), Slowpoke Well = 1 (`AzaleaTown.asm`: `EVENT_CLEARED_SLOWPOKE_WELL` libera o ginásio), Route 27 = 8.
- Detonado: locais pelo `LANDMARK_*` (`data/maps/landmarks.asm`; `<BSP>` = quebra de linha no nome). Revanches por telefone só contadas (`rematches`). Crystal 98 locais, Gold/Silver 99; 0 treinadores sem lugar.
- Conferência cruzada com a PokéAPI: só difere no Bug Contest (Crystal 3 espécies, Gold/Silver 12) — todas explicadas pelo código. Obtíveis: Crystal 223, Gold 216, Silver 216.

### Gen 1/2 com decomp em assembly (`game.asmDecomp`, `scripts/lib/gen1-asm.mjs`) — S4
- Baixar: `node scripts/fetch-decomp.mjs <jogo>` → clone raso e esparso (`/data/ /constants/ /scripts/ /macros/`) em `data-sources/<dir>/` (uma operação git). Arquivos de `engine/` não vêm: baixar só o necessário, um por vez.
- Pipeline (`build-game.mjs`, `ASM_STEPS`): `build-data` → `apply-gen1-overlay` (corrige) → `validate-gen1-vs-decomp` (audita **depois** da correção; tem que dar 0). Catálogo: `validation: 'decomp-core'` (núcleo conferido; treinadores/onde obter ainda não).
- Arquivos: `constants/move_constants.asm` (`const` em ordem = id nacional da PokéAPI), `constants/pokedex_constants.asm` (`DEX_*`), `data/pokemon/base_stats/*.asm` (hp atk def spd **SPC**, tipos — tipo repetido = tipo único —, golpes de nível 1, `tmhm`), `data/pokemon/evos_moves.asm` (rótulo `<Nome>EvosMoves:` → evoluções até `db 0`, depois learnset até `db 0`), `data/moves/moves.asm`, `data/types/type_matchups.asm` (só as exceções; o resto é 1×).
- 🧪 JavaScript **não tem `\Z`** em regex (vira a letra "Z"): cortava `ALAKAZAM` em "ALAKA" no fim do arquivo. Fim do texto = `$(?![\s\S])`.
- 🧪 PokéAPI erra PP de Rest e Soft-Boiled na Gen 1 (5; certo 10, `moves.asm`). O overlay corrige e registra em `data.corrections`.
- 🧪 Swift: o decomp guarda precisão 100, mas `SWIFT_EFFECT` ignora a precisão → manter `null` ("nunca erra"); o overlay não troca precisão `null`.
- 🧪 **Learnset fora de ordem** (Yellow: Primeape tem Thrash 46 antes de Screech 45). `WriteMonMoves` (moveset de selvagens/treinadores) **para no 1º golpe de nível maior** sem ordenar; `LearnMoveFromLevelUp` (subir de nível) varre a lista toda pelo nível exato. Por isso o overlay marca `mon.levelUpInGameOrder` e `likelyMoveset` segue a ordem do arquivo: Primeape nv. 45 selvagem **não** tem Screech, mas aprende subindo para o 45. Teste de moveset compara com o algoritmo do jogo para 151 espécies × níveis 1–100.
- Resultado: Red/Blue (pokered@af51989) e Yellow (pokeyellow@bfe2fd6): learnset, TM/HM, stats, tipos, golpes e tabela com **0 divergências**.
- Iniciais (🧪): `constants/pokemon_constants.asm` `DEF STARTER1..3 EQU` (Yellow: `STARTER_PIKACHU`; `RIVAL_STARTER_*` são índices 1..3, não espécies) + nível do `ld a, N / ld [wCurEnemyLevel], a` antes do `AddPartyMon` em `scripts/OaksLab.asm`. Campo "Seu inicial" só aparece com 2+ opções.

#### Treinadores da Gen 1 (`scripts/build-trainers-gen1.mjs`) 🧪
- `data/trainers/parties.asm`: rótulos `<Classe>Data:` na ordem de `TrainerDataPointers` (= ordem de `trainer_const`); nº do treinador = posição na classe (1-based). `db NÍVEL, ESPÉCIE…, 0` (todos no mesmo nível) ou `db $FF, NÍVEL, ESPÉCIE, …, 0`. Comentários (`; Route 3`, `; Unused`) ajudam a conferir, mas o lugar vem dos mapas/scripts.
- 🧪 Ao ler `trainer_const`, ancorar no início da linha: a definição `MACRO trainer_const` + `const \1` virava uma classe "const" e **deslocava todas** as classes.
- Golpes: moveset padrão (`WriteMonMoves`) + especiais, que o jogo **só aplica em times `$FF`** (`engine/battle/read_trainer_party.asm`):
  - Red/Blue: `LoneMoves[wGymLeaderNo]` — o script do ginásio escreve 1..8 em `wGymLeaderNo`, que é o **mesmo byte** de `wLoneAttackNo` (`ram/wram.asm`). `db N, GOLPE` vai no **(N+1)º** Pokémon, 3º slot (`AddNTimes` a partir do 1º). 🧪 O `OPP_BROCK, 1` fica no arquivo de **objetos** do mapa (`data/maps/objects/PewterGym.asm`), não no script — casar pelo nome do arquivo.
  - `TeamMoves` (Elite 4): 5º Pokémon, 3º slot. Campeão (`RIVAL3`): 1º (Pidgeot) Sky Attack; 6º Mega Drain | Fire Blast | Blizzard pelo inicial do rival.
  - Yellow: tabela `SpecialTrainerMoves` (`db CLASSE, nº` / `db pokémon, slot, GOLPE` / `db 0`), 1-based.
  - ⚠️ Não achei onde `wGymLeaderNo` é zerado (não está no intervalo zerado por `end_of_battle.asm` nem em `home/trainers.asm`/`home/overworld.asm`). Por isso o LoneMove é aplicado **só na luta do próprio líder** — certo pelo código; um possível "vazamento" para lutas seguintes não está modelado.
- Onde: `data/maps/objects/<Mapa>.asm` (`OPP_CLASSE, nº`). 🧪 Ignorar `OPP_RIVAL*` nos objetos (o objeto não é a luta). Rivais vêm de blocos `ld a, OPP_X / ld [wCurOpponent], a … ld [wTrainerNo], a` (ou `call …TrainerNo…`), com o nº escolhido por: cadeia `cp STARTERx / ld a, $N`; tabela `ld hl, Tabela` → `db STARTERx, N`; Yellow `ld a, [wRivalStarter] / add $K` → K+1..K+3. 🧪 A Route 22 tem **duas** tabelas locais `.StarterTable`: usar a primeira **depois** do bloco.
- Rival ↔ inicial do jogador (`OaksLab.asm`, `<Inicial>PokeBallText`): Charmander → rival Squirtle; Squirtle → Bulbasaur; Bulbasaur → Charmander. No Yellow o time do rival varia pela evolução do Eevee (resultado das lutas iniciais), não pelo inicial → sem `forStarter`, rótulo com "(time N)".
- Resultado: Red/Blue 352 lutas (21 de rival + 3 do Campeão), Yellow 343; todos os times sem mapa são `; Unused`.

#### Onde obter e progresso da Gen 1 (`scripts/build-acquisition-gen1.mjs`) 🧪
- Mapas: `data/maps/headers/*.asm` (`map_header Arquivo, CONST` + `connection dir, Arquivo, CONST`), warps em `data/maps/objects/*.asm` (`warp_event x, y, DESTINO, n`; `LAST_MAP` = volta para fora → a ligação vem do lado de fora). Nome exibido: `mapLabel` (`lib/gen1-asm.mjs`).
- 🧪 Selvagens: em `data/wild/grass_water.asm` a **posição** na tabela é o id do mapa (ordem de `map_const`) — o comentário `; ROUTE_1` falta em várias linhas (Mt. Moon ficava sem selvagens). Chances dos 10 slots em `probabilities.asm` (51,51,39,25,25,25,13,13,11,3 /256). `IF DEF(_RED)` / `_BLUE` resolvido por versão (`resolveIfdef`).
- Pesca: Old Rod = Magikarp nv 5 e Good Rod = Goldeen/Poliwag nv 10 em **qualquer água** (`engine/items/item_effects.asm`, `good_rod.asm`) → fonte "qualquer água" com o estágio da vara; Super Rod por mapa: Red/Blue `dbw MAPA, .GrupoN` (sorteio uniforme no grupo); 🧪 Yellow `db MAPA, ESP, NV ×4` com slots 40/30/20/10% (`engine/items/super_rod.asm`).
- Presentes: `lb bc, ESPÉCIE, NÍVEL / call GivePokemon`; Dojo (`ld a, HITMON… / call DisplayPokedex` + `ld c, 30`); fósseis via `wFossilMon` (`engine/events/cinnabar_lab.asm`: Dome→Kabuto, Helix→Omanyte, Old Amber→Aerodactyl). Estáticos: objetos `…, ESPÉCIE, NÍVEL` e scripts `ld a, ESPÉCIE / ld [wCurOpponent] / ld a, NV / ld [wCurEnemyLevel]` (Snorlax), sem o tutorial do velho (`BATTLE_TYPE_OLD_MAN`). Trocas: ordem de `npctrade` = `TRADE_FOR_*`, usada no script do mapa (`ld a, TRADE_FOR_X`; Route 11: `xor a ; TRADE_FOR_TERRY`). Prêmios: `prizes.asm` + `prize_mon_levels.asm`.
- 🧪 Yellow divide scripts em `<Mapa>_2.asm` (o Squirtle da Officer Jenny está em `VermilionCity_2.asm`; o Bulbasaur na casa da Melanie, não na rua) → juntar as partes; `mapLabel` ignora o sufixo `_2`.
- 🧪 Yellow: o Pikachu inicial **recusa pedra** (`ItemUseEvoStone` → `IsThisPartyMonStarterPikachu` → `RefusingText`) e não há outro Pikachu → Raichu não é obtível (a PokéAPI diz que é). Fonte com `evolveBlocked: 'ITEM'`.
- TMs/itens (55/55 nos dois): bolas no chão (objetos `SPRITE_POKE_BALL, …, ITEM`), lojas (`marts.asm`: o rótulo `XxxClerkText` é referenciado no script do mapa), presentes (`lb bc, TM_X, 1 … call GiveItem`; HM_FLASH via `ld a, HM_FLASH`), escondidos (`hidden_events.asm`, `hidden_events_for MAPA` + `HiddenItems`), TMs do Game Corner. TM do líder: ginásio → líder (campo `leader`, estágio = depois dele).
- HM fora da batalha: `engine/menus/start_sub_menus.asm` (`.surf / bit BIT_SOULBADGE`); insígnia → líder pelo script do ginásio que faz `set BIT_XBADGE`.
- Estágio (🧪 cada item foi um erro real):
  - Detonado da Gen 1 tem poucas seções grandes → incluir **subtítulos** (`SECTIONS_WITH_SUBTITLES`: `<em><u>…` / `<u><em>…`) e reconhecer times em **texto corrido** (`parseTrainerRuns`: sequência "Espécie lv.N" com ≤60 caracteres entre um e outro; quebra em fim de frase e em fim de parágrafo **com texto** no meio — sem texto é o mesmo time, como o Bruno do Red/Blue).
  - Nomes em português e grafias erradas → `GEN1_PLACE_NAMES` (`games.mjs`): "Monte Lua", "Floresta de Viridian", "The Unknown Dungeon" (= Cerulean Cave; sem isso caía em "Cerulean", estágio 1), "Torre dos Fantasmas", "Fuschia", "Vermillion", "Lavander"…
  - Fatos do código valem como título: início do jogo (`NewGameWarp` em `special_warps.asm` → casa → Pallet = 0; sem isso Pallet ia a 6 pelo "maior vizinho" Route 21); mapa cujo script **checa** insígnia (`bit BIT_XBADGE` sem `set`, ou `EVENT_PASSED_XBADGE_CHECK`) → estágio = insígnia mais alta (Route 23 = 8); `game.stageFacts` para o que o detonado não nomeia, com a evidência (Route 22 = 0: 1ª luta do rival; o portão que exige insígnia é o da Route 23).
  - Interior (só portas): **só piso** pela porta, nunca teto (o teto punha o Diglett's Cave, citado no estágio 3, em 0) e nunca antes do lado de fora (Route 12 Super Rod House citada cedo por "Super Rod").
  - Diagnóstico: `node scripts/why-stage.mjs <jogo> "Route 22"` e `WHY=ROUTE_22,… node scripts/build-acquisition-gen1.mjs <jogo>`.
- Conferência cruzada: "obtível" calculado pelo decomp bate 100% com os encontros da PokéAPI no Red/Blue (139/139, 0 mudanças) e no Yellow difere só no Raichu (acima).

#### Detonado da Gen 1 no app (`scripts/build-walkthrough-gen1.mjs`)
- Locais = agrupamento do próprio jogo para o mapa da cidade: `ExternalMapEntries` (um por mapa externo) e grupos internos sequenciais (`end_indoor_group X` em `map_constants.asm` + `indoor_map X, …, NomeName` em `town_map_entries.asm` → `names.asm`). Local = grupo + estágio.
- 🧪 Tokens de texto do Game Boy nos nomes: `#MON` / `<PKMN>` = POKéMON, `#` = POKé.
- Mesmo formato da Gen 3 (`stages[].leader` com time/golpes/prêmio, `locations[]` com selvagens/presentes/itens/treinadores). Red/Blue 60 locais, Yellow 58, 0 treinadores sem lugar.

### Progresso por insígnia e pós-jogo (`scripts/lib/progress.mjs`, seção 4e de `build-acquisition.mjs`)
**Estágio** = 0–8 insígnias; 9 = pós-jogo. Usado pelo seletor "Seu progresso" (substitui a estimativa por nível).
1. **Linha do tempo** a partir do detonado do PokeMythology: seções na ordem da narrativa; o estágio de cada trecho = quantos líderes foram vencidos antes dele. As seções são **cortadas também nos blocos de líder** (citação feita depois da luta já conta a insígnia). Pós-jogo = depois do último membro da Elite dos Quatro.
2. 🧪 **Líder reconhecido pelo TIME** do ginásio (espécie + nível, tolerante a grafia), não pelo nome — o 1º "Giovanni" do FRLG é o chefe da Rocket em Celadon.
3. 🧪 O estágio da insígnia é a **posição do líder na ordem do detonado**, não o número da flag (o Koga dá a `FLAG_BADGE05`, mas é o 6º no detonado).
4. **Estágio de cada mapa**, nesta precedência: (a) título de seção que o nomeia; (b) herança dos vizinhos conhecidos — **conexões** (rota ↔ cidade) usam o **maior** estágio, **portas** (interior ← exterior) usam o **menor** 🧪 (com "maior" pelas portas, a Trick House puxava a Route 110 para o pós-jogo); (c) citação no texto; (d) herança de novo.
5. Palavras: sem acento; `rota` = `route`; separar letra/dígito antes ("rota119") 🧪; "route" sozinho não é nome 🧪.
6. Áreas opcionais descritas depois da Liga (Power Plant/Seafoam no FRLG, Safari Zone/Mirage Tower no Emerald) ficam no estágio do título (conservador) e entram em `progress.reviewEarlierMention` para revisão.
7. **Presente/encontro único**: o estágio é o maior entre o do mapa e o da 1ª citação da espécie no detonado 🧪 (Beldum na casa do Steven só após zerar). Quando há evidência no código, ela vira regra explícita (`postgameGifts`) 🧪: iniciais de Johto do Emerald vêm depois de `special EnableNationalPokedex`.
8. Não usar `FLAG_SYS_GAME_CLEAR` no arquivo inteiro como sinal de pós-jogo: ele aparece em diálogos (🧪 o Castform do Weather Institute é do meio do jogo).
9. HMs: estágio = maior entre o local do HM e a posição do líder da insígnia exigida. Trocas herdam o estágio do Pokémon pedido. Itens de evolução: estágio da origem do item. Vagantes: seção que cita a espécie.
10. Estágio **desconhecido conta como pós-jogo** (conservador).

### TMs/HMs: onde cada um é obtido (pendência resolvida em 2026-10-17)
**Problema:** o app oferecia golpe de TM que o jogador ainda não tem (Earthquake/Surf no nível 14).

**Como foi resolvido** (`build-acquisition.mjs`, seção 4d; `scripts/lib/script-graph.mjs`):
1. **Numeração TM→golpe vem do código de cada jogo**, nunca de memória: FRLG = nomes `TMnn_GOLPE` em `tmhm_learnsets.h`; Emerald = ordem de `FOREACH_TM`/`FOREACH_HM` em `include/constants/tms_hms.h` (🧪 as duas coincidem na Gen 3; TM09 = Bullet Seed, não confundir com a Gen 1).
2. **Formas de entrega procuradas nos scripts** (todas existem): `giveitem`/`giveitem_msg`/`additem`; `setvar VAR_x, ITEM_TM..` entregue depois; listas de loja `.2byte ITEM_TM..`; `finditem` (item no chão, em `item_ball_scripts.inc`); item escondido (`bg_events` do `map.json`).
3. **Posição exata**: cada linha é ligada ao **evento do `map.json`** (NPC/objeto/gatilho, com x,y) cujo script a alcança, seguindo `goto`/`call`/`trainerbattle` e a queda para o rótulo seguinte. Se nada no mapa alcança, procura nos `MapScripts` (cena automática ao entrar — ex.: Surf na casa do Wally). Resultado: 🧪 **100% das origens ligadas a um evento** (FRLG 62/62, Emerald 77/77).
4. **Itens no chão**: o mapa vem do objeto que referencia o script, não do prefixo do rótulo (🧪; a diferença, se houver, fica em `labelPrefixWas`).
5. **Scripts compartilhados** (`data/scripts/*.inc`): NPCs de mapas chamam scripts fora do `scripts.inc` do mapa (🧪 TM43 do garoto da Route 111, Kecleon do Emerald). Só contam se algum mapa os chama — o ovo de Pichu (Mystery Gift) fica fora sozinho.
6. **Prêmio de ginásio**: nível = maior nível do time do líder (o mapa que dá a insígnia é o que tem `setflag FLAG_BADGEnn_GET`).
7. **TM sem origem** é tratado como inexistente no jogo (🧪 FRLG: TM10 Hidden Power e HM08 Dive — código e detonado concordam).
8. **Confronto com o detonado** (`validate-tms-vs-pokemythology.mjs`): só citações com verbo de obter contam; citação de uso ("use Flash no Rock Tunnel") não é divergência. Os "locais diferentes" restantes foram lidos um a um e concordam (ex.: "sala do capitão" = `SSAnne_CaptainsOffice`); o único real era o TM43, que revelou a falha do item 5.

### Treinadores
- 🧪 Classes de treinador mudam por jogo (`RIVAL_EARLY/LATE` no FRLG; `RIVAL`, `AQUA_LEADER`, Frontier Brains no Emerald) e o código de um jogo pode carregar classes de outro (classes de Hoenn no FRLG).
- Líderes do Emerald têm revanches (`TRAINER_ROXANNE_1..5`).

### Parsers do decomp
- 🧪 Tutor: entradas terminam em vírgula (não `;`).
- 🧪 `#define egg_moves(species, ...)` precisa ser pulado (engolia o 1º Pokémon).
- 🧪 TM/HM: `TMHM(TM06_TOXIC)` no pokefirered × `.TOXIC = TRUE` no pokeemerald.
- 🧪 Espaços dentro de chaves: `{ TYPE_GRASS, TYPE_POISON }` no Emerald.
- Nomes de arquivo mudam: trocas em `src/data/ingame_trades.h` (FRLG) × `src/data/trade.h` (Emerald).

### Ferramentas
- 🧪 Servidor: ler o arquivo **antes** de enviar cabeçalhos (caía com `favicon.ico`).
- O shell (Bash) desta máquina come barras invertidas em regex dentro de `node -e`/heredoc: escrever scripts de patch com a ferramenta de arquivo.
- Verificar a tela com captura headless, não só com testes. 🧪 `--screenshot` com `--virtual-time-budget`/`--timeout` captura
  **antes** do fetch dos JSONs grandes terminar (a aba Detonado do HGSS parecia "Carregando…" e escondia um erro real) →
  `node scripts/screenshot.mjs <url> <saida.png> <seletor>` (DevTools Protocol: espera o seletor e lista erros do console).

### Detonados (PokeMythology)
- 🧪 O índice usa links **relativos e absolutos** (e páginas antigas `.htm`, ex.: Ultra Sun/Moon); demos ficam de fora. Todos os 22 jogos da série principal têm detonado.
- 🧪 Formato dos times muda por detonado: "Líder Brock – Tipo Pedra" (FRLG) × "Roxanne usa:" (Emerald), às vezes com parágrafo antes do nome. O que é comum: o bloco começa com o sprite em `/sprites/treinadores/`.
- 🧪 Comparar nomes sem acento (Érika), "X e Y" = `X&Y` no jogo, e contra **todos** os homônimos (Giovanni da Rocket × do ginásio; revanches).
- 🧪 O detonado tem erros de grafia ("Victreebell"): tolerar 1 letra e **registrar** no relatório.
- Resultado na Gen 3: FRLG 18/18 e Emerald 12/12 times idênticos ao decomp.
- A ordem das seções é a da narrativa; áreas opcionais podem aparecer fora da ordem de acesso.
