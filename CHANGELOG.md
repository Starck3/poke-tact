# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões em [SemVer](https://semver.org/lang/pt-BR/).

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
