// Cada "jogo" = um version-group da PokeAPI + a geração cujas regras valem + (opcional) o decomp pret que serve de
// fonte-da-verdade. Para adicionar outro jogo: inclua uma entrada aqui e rode `npm run build:data -- <id>`.
const GEN3 = {
  generation: 3,
  maxDex: 386, // Pokédex nacional existente até a Gen 3
  // Gen 3: categoria física/especial é definida pelo TIPO do golpe (divisão só mudou na Gen 4).
  // Confirmado no código: IS_TYPE_PHYSICAL(type) = type < TYPE_MYSTERY (include/battle.h).
  physicalTypes: ['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel'],
  specialTypes: ['fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark'],
};

// Regras por geração para jogos SEM decomp utilizável ainda (camada "PokéAPI + regras da geração").
// Esses jogos aparecem como "não validados por decomp" — ver docs/PLANO.md (S4–S7).
const SPLIT_BY_TYPE = { physicalTypes: GEN3.physicalTypes, specialTypes: GEN3.specialTypes };
const pokeapiOnly = (generation, maxDex, extra = {}) => ({ generation, maxDex, ...SPLIT_BY_TYPE, validation: 'pokeapi', ...extra });

// Detonados da Gen 1 (PokeMythology, PT-BR): nome do lugar no texto → nome do mapa no decomp (regex, sem diferenciar maiúsculas).
// Levantados com grep nos detonados de Red/Blue e Yellow; sem isso "Cerulean Cave" caía em "Cerulean" (estágio 1).
const GEN1_PLACE_NAMES = {
  'monte lua': 'Mt Moon', 'floresta (?:de )?viridian': 'Viridian Forest', 'caverna dos digletts?': 'Digletts Cave',
  'esconderijo dos rockets': 'Rocket Hideout', '(?:the )?unknown dungeon': 'Cerulean Cave', 'torre (?:dos fantasmas|fantasma)': 'Pokemon Tower',
  'cinnabar mansion': 'Pokemon Mansion', 'casa do bill': 'Bills House', 'loja de bicicletas': 'Bike Shop', '\\bmuseu\\b': 'Museum',
  's\\. ?s\\. ?anne': 'SS Anne',
  // grafias erradas nos dois detonados (sem isso o Yellow punha Fuchsia no estágio 2, herdado das rotas)
  'fuschia': 'Fuchsia', 'vermillion': 'Vermilion', 'lavander': 'Lavender',
};
// Detonados da Gen 2 (PT-BR): nomes em português → nome do mapa no decomp
const GEN2_PLACE_NAMES = {
  'floresta ilex': 'Ilex Forest', 'ilex florest': 'Ilex Forest', 'torre queimada': 'Burned Tower', 'caverninha dos slowpokes?': 'Slowpoke Well',
  'torre do r[áa]dio': 'Radio Tower',
};
// HGSS: o detonado escreve as rotas em português no texto da história ("siga pela rota 32") e usa "poço dos Slowpokes",
// "Burnt Tower", "Fuschia" — grafias corrigidas só para casar nomes
const HGSS_PLACE_NAMES = { ...GEN2_PLACE_NAMES, 'po[çc]o dos slowpokes?': 'Slowpoke Well', 'burnt tower': 'Burned Tower', Fuschia: 'Fuchsia',
  ...Object.fromEntries(Array.from({ length: 48 }, (_, i) => [`\\brota ${i + 1}\\b`, `Route ${i + 1}`])) };
// Gen 2: fatos do código para o que o detonado não situa (valem como título)
const GEN2_STAGE_FACTS = {
  ROUTE_36: { stage: 3, why: 'Route36.asm: o Sudowoodo bloqueia (checkitem SQUIRTBOTTLE); GoldenrodFlowerShop.asm só dá o Squirtbottle com a PLAINBADGE (3ª, Whitney)' },
  SLOWPOKE_WELL_B1F: { stage: 1, why: 'AzaleaTown.asm: checkevent EVENT_CLEARED_SLOWPOKE_WELL — o Rocket bloqueia o ginásio do Bugsy (2º) até limpar o poço' },
  ROUTE_27: { stage: 8, why: 'só se chega pelo mar a partir de New Bark (Surf) / Tohjo Falls; o detonado a percorre na ida à Liga; o portão da Victory Road checa as 8 insígnias' },
};
// HGSS (mesma geografia da Gen 2): a Route 27 só se alcança pelo mar a partir de New Bark (Surf) ou pela Tohjo Falls; o
// detonado a percorre na ida à Liga. Sem o fato, a conexão com New Bark (estágio 0) a puxava para 0.
const HGSS_STAGE_FACTS = { MAP_ROUTE_27: { stage: 8, why: 'só pelo mar a partir de New Bark (Surf) / Tohjo Falls; o detonado a percorre na ida à Liga (mesmo fato da Gen 2)' } };
// Platinum: a Great Marsh é descrita numa seção de extras no fim do detonado, mas a entrada é o portão do observatório de
// Pastoria (events_pastoria_city_observatory_gate_1f.json → MAP_HEADER_GREAT_MARSH_6); Pastoria = estágio 4 (ginásio do Wake)
const PLATINUM_STAGE_FACTS = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`MAP_HEADER_GREAT_MARSH_${n}`, { stage: 4, why: 'entrada pelo portão do observatório de Pastoria (warp para GREAT_MARSH_6); Pastoria = estágio 4' }]));
// tabelas do jogo extraídas pelo PKHeX (kwsch/PKHeX, GPL-3.0; fica em data-sources/ como os decomps): núcleo dos jogos sem decomp
const PKHEX = { repo: 'kwsch/PKHeX', commit: '6042efa241a9925ce57e645329ea7f976deabdd3', dir: 'pkhex-src', sparse: ['/PKHeX.Core/'] };
// Diamond/Pearl: o jogo começa no quarto do jogador (o detonado não cita o mapa interno da casa)
const DP_STAGE_FACTS = { MAP_TWINLEAF_PLAYER_HOUSE_2F: { stage: 0, why: 'início do jogo: quarto do jogador em Twinleaf Town' } };
// Estágios que o detonado não nomeia, tirados do código (valem como título). Cada um com a evidência.
const GEN1_STAGE_FACTS = {
  ROUTE_22: { stage: 0, why: 'scripts/Route22.asm: 1ª luta com o rival (RIVAL1, mesma fase do laboratório; times nv 8–9). Quem exige insígnias é o portão para a Route 23 (Route22Gate.asm)' },
};

export const GAMES = {
  // ---- Gen 1 (decomp pret/pokered existe, em assembly — parsers pendentes, S4)
  'red-blue': { ...pokeapiOnly(1, 151), label: 'Pokémon Red / Blue (GB)', versionGroup: 'red-blue', versions: ['red', 'blue'], walkthrough: 'detonado-red-blue',
    // decomp em assembly: corrige (apply-gen1-overlay) e valida (validate-gen1-vs-decomp) o núcleo de dados — S4
    asmDecomp: { repo: 'pret/pokered', commit: 'af519899719f0754965776faac0e836a3b906e6d', dir: 'pokered-asm' },
    walkthroughTypos: GEN1_PLACE_NAMES, stageFacts: GEN1_STAGE_FACTS },
  yellow: { ...pokeapiOnly(1, 151), label: 'Pokémon Yellow (GB)', versionGroup: 'yellow', versions: ['yellow'], walkthrough: 'detonado-yellow',
    asmDecomp: { repo: 'pret/pokeyellow', commit: 'bfe2fd65b1a8ac4821f4235970ccd7204faf77fb', dir: 'pokeyellow-asm' },
    walkthroughTypos: GEN1_PLACE_NAMES, stageFacts: GEN1_STAGE_FACTS },
  // ---- Gen 2 (decomps pret/pokegold e pokecrystal, em assembly — S5)
  'gold-silver': { ...pokeapiOnly(2, 251), label: 'Pokémon Gold / Silver (GBC)', versionGroup: 'gold-silver', versions: ['gold', 'silver'], walkthrough: 'detonado-gold-silver', walkthroughTypos: GEN2_PLACE_NAMES, stageFacts: GEN2_STAGE_FACTS,
    asmDecomp: { repo: 'pret/pokegold', commit: 'ef0201d8daf47e8b3ea1518eacf890f37d4cd5e8', dir: 'pokegold-asm' } },
  crystal: { ...pokeapiOnly(2, 251), label: 'Pokémon Crystal (GBC)', versionGroup: 'crystal', versions: ['crystal'], walkthrough: 'detonado-crystal', walkthroughTypos: GEN2_PLACE_NAMES, stageFacts: GEN2_STAGE_FACTS,
    asmDecomp: { repo: 'pret/pokecrystal', commit: '3bc8daa4173e96a7f4011dad3922eb6fa5dad5c6', dir: 'pokecrystal-asm' } },
  // ---- Gen 4 (decomps de DS incompletos — S6). A partir daqui: físico/especial POR GOLPE.
  'diamond-pearl': { ...pokeapiOnly(4, 493), label: 'Pokémon Diamond / Pearl (DS)', versionGroup: 'diamond-pearl', versions: ['diamond', 'pearl'], walkthrough: 'detonado-diamond-pearl',
    stageFacts: DP_STAGE_FACTS,
    // núcleo e treinadores em JSON; encontros, scripts (bytecode), eventos e matrizes em binário — lidos por
    // scripts/lib/gen4-dp-field.mjs e gen4-dp-script.mjs com as regras tiradas do código (arm9/src, arm9/asm, arm9/overlays)
    asmDecomp: { repo: 'pret/pokediamond', commit: 'b623abef1b4dfe204ca50aab42447ac00c134290', dir: 'pokediamond-src', steps: 'dp',
      sparse: ['/files/poketool/personal/*.json', '/files/poketool/personal_pearl/*.json', '/files/poketool/trainer/', '/files/poketool/waza/*.json', '/include/',
        '/arm9/src/', '/arm9/asm/', '/arm9/overlays/', '/files/fielddata/script/', '/files/fielddata/eventdata/', '/files/fielddata/encountdata/',
        '/files/fielddata/mapmatrix/', '/files/fielddata/pokemon_trade/', '/files/arc/encdata_ex/'] } },
  platinum: { ...pokeapiOnly(4, 493), label: 'Pokémon Platinum (DS)', versionGroup: 'platinum', versions: ['platinum'], walkthrough: 'detonado-platinum',
    // decomp em JSON (res/pokemon/*/data.json…), mesmo esquema "asmDecomp" do pipeline (o carregador é escolhido pela geração)
    stageFacts: PLATINUM_STAGE_FACTS,
    asmDecomp: { repo: 'pret/pokeplatinum', commit: '1dc13dcea40c04ab53f1f607de46023dc409ef20', dir: 'pokeplatinum-src' } },
  'heartgold-soulsilver': { ...pokeapiOnly(4, 493), label: 'Pokémon HeartGold / SoulSilver (DS)', versionGroup: 'heartgold-soulsilver', versions: ['heartgold', 'soulsilver'], walkthrough: 'detonado-heartgold-soulsilver', walkthroughTypos: HGSS_PLACE_NAMES, stageFacts: HGSS_STAGE_FACTS,
    // texto (atributos, TM/HM, tutores, evoluções, tipos) + binários lidos por scripts/lib/narc.mjs (learnset por nível e golpes)
    asmDecomp: { repo: 'pret/pokeheartgold', commit: '708163e10169173d2bbab252538231721d983155', dir: 'pokeheartgold-src', steps: 'hgss',
      sparse: ['/files/poketool/personal/*.json', '/files/poketool/personal/wotbl.narc', '/files/poketool/waza/waza_tbl.narc', '/files/poketool/trainer/', '/files/fielddata/encountdata/', '/files/fielddata/wazaoshie/', '/files/fielddata/script/scr_seq/', '/files/fielddata/eventdata/',
        '/include/', '/src/', '/asm/include/', '/files/arc/headbutt.json', '/files/arc/safari_enc.json', '/files/data/mushi/'] } },
  // ---- Gen 5 a 9 (sem decomp — S7)
  'black-white': { ...pokeapiOnly(5, 649), pkhex: PKHEX, label: 'Pokémon Black / White (DS)', versionGroup: 'black-white', versions: ['black', 'white'], walkthrough: 'detonado-black-white' },
  'black-2-white-2': { ...pokeapiOnly(5, 649), label: 'Pokémon Black 2 / White 2 (DS)', versionGroup: 'black-2-white-2', versions: ['black-2', 'white-2'], walkthrough: 'detonado-black-2-white-2',
    walkthroughTypos: { Whrilipede: 'Whirlipede' }, // grafia do detonado no time da Roxie (só para casar nomes)
    // decomp fuddlesworth/pokebw2 (GPL-3.0, reconstrói as ROMs byte a byte): dados em JSON e scripts em texto, no esquema do pokeplatinum
    asmDecomp: { repo: 'fuddlesworth/pokebw2', commit: '5541f3444a0e53802499b7c22b79bc5ccc70b910', dir: 'pokebw2-src', steps: 5,
      sparse: ['/res/pokemon/*/data.json', '/res/pokemon/*/form_*.json', '/res/pokemon/forms.json', '/res/moves/*/data.json', '/res/items/*/data.json', '/res/trainers/data/',
        '/res/trainers/classes/', '/res/field/zones/', '/res/field/events/', '/res/field/encounters/', '/res/field/scripts/', '/res/field/trades/', '/res/field/places/',
        '/res/field/matrices/', '/res/types/', '/generated/', '/include/', '/src/', '/asm/', '/docs/'] } },
  'x-y': { ...pokeapiOnly(6, 721), pkhex: PKHEX, label: 'Pokémon X / Y (3DS)', versionGroup: 'x-y', versions: ['x', 'y'], walkthrough: 'detonado-x-y' },
  'omega-ruby-alpha-sapphire': { ...pokeapiOnly(6, 721), pkhex: PKHEX, label: 'Pokémon Omega Ruby / Alpha Sapphire (3DS)', versionGroup: 'omega-ruby-alpha-sapphire', versions: ['omega-ruby', 'alpha-sapphire'], walkthrough: 'detonado-omegaruby-alphasapphire' },
  'sun-moon': { ...pokeapiOnly(7, 809), pkhex: PKHEX, label: 'Pokémon Sun / Moon (3DS)', versionGroup: 'sun-moon', versions: ['sun', 'moon'], walkthrough: 'detonado-sun-moon' },
  'ultra-sun-ultra-moon': { ...pokeapiOnly(7, 809), pkhex: PKHEX, label: 'Pokémon Ultra Sun / Ultra Moon (3DS)', versionGroup: 'ultra-sun-ultra-moon', versions: ['ultra-sun', 'ultra-moon'], walkthrough: null },
  'lets-go-pikachu-lets-go-eevee': { ...pokeapiOnly(7, 809, { noAbilities: true }), pkhex: PKHEX, label: "Pokémon Let's Go, Pikachu! / Eevee! (Switch)", versionGroup: 'lets-go-pikachu-lets-go-eevee', versions: ['lets-go-pikachu', 'lets-go-eevee'], walkthrough: 'detonado-lets-go-pikachu-lets-go-eevee' },
  'sword-shield': { ...pokeapiOnly(8, 898), pkhex: PKHEX, label: 'Pokémon Sword / Shield (Switch)', versionGroup: 'sword-shield', versions: ['sword', 'shield'], walkthrough: 'detonado-sword-shield' },
  'brilliant-diamond-shining-pearl': { ...pokeapiOnly(8, 493), pkhex: PKHEX, label: 'Pokémon Brilliant Diamond / Shining Pearl (Switch)', versionGroup: 'brilliant-diamond-shining-pearl', versions: ['brilliant-diamond', 'shining-pearl'], walkthrough: 'detonado-brilliantdiamond-shiningpearl' },
  'legends-arceus': { ...pokeapiOnly(8, 905), pkhex: PKHEX, label: 'Pokémon Legends: Arceus (Switch)', versionGroup: 'legends-arceus', versions: ['legends-arceus'], walkthrough: 'detonado-legends-arceus', battleNote: 'sistema de batalha próprio (estilos ágil/forte) — o motor usa as regras padrão' },
  'scarlet-violet': { ...pokeapiOnly(9, 1025), pkhex: PKHEX, label: 'Pokémon Scarlet / Violet (Switch)', versionGroup: 'scarlet-violet', versions: ['scarlet', 'violet'], walkthrough: 'detonado-scarlet-violet' },
  // sem PokéAPI: dataset montado das tabelas do PKHeX (build-data-pkhex); golpes/tipos da Gen 9 do Scarlet/Violet
  'legends-za': { ...pokeapiOnly(9, 1025), validation: 'pkhex', pkhex: PKHEX, pkhexOnly: true, movesFrom: 'scarlet-violet', label: 'Pokémon Legends: Z-A (Switch)', versionGroup: 'legends-za', versions: ['legends-za'], walkthrough: 'detonado-legends-z-a', battleNote: 'batalha em tempo real — o motor usa as regras padrão' },
  'firered-leafgreen': {
    ...GEN3,
    label: 'Pokémon FireRed / LeafGreen (GBA)',
    versionGroup: 'firered-leafgreen',
    versions: ['firered', 'leafgreen'], // versões individuais: encontros/exclusivos diferem
    walkthrough: 'detonado-firered-leafgreen', // PokeMythology (data-sources/pokemythology/) — linha do tempo por insígnia
    walkthroughTypos: { Fuschia: 'Fuchsia', Lavander: 'Lavender' }, // grafias do detonado (corrigidas só para casar nomes)
    decomp: {
      repo: 'pret/pokefirered',
      commit: '037335f4c725d7c9aecdac87066f2002b4bd7e14',
      tradesFile: 'src/data/ingame_trades.h',
      hasRtc: false, // FR/LG não têm relógio: evoluções por horário (Espeon/Umbreon) foram removidas (pokemon.c)
      wildSuffix: { firered: '_FireRed', leafgreen: '_LeafGreen' }, // sufixo do base_label em wild_encounters.json
      skipTrainerClasses: /^(RS_|TEAM_MAGMA|TEAM_AQUA|AQUA_|MAGMA_|PLAYER)/, // classes de Hoenn (resto do código do RS)/cutscenes
      // Regras de obtenção que não estão em tabelas de dados (conferidas nos scripts/código do decomp):
      starters: { species: ['BULBASAUR', 'CHARMANDER', 'SQUIRTLE'], where: 'Pallet Town — Laboratório do Prof. Oak', level: 5 }, // givemon PLAYER_STARTER_SPECIES, 5
      roamers: { RAIKOU: 'vaga por Kanto se você escolheu Squirtle', ENTEI: 'vaga por Kanto se você escolheu Bulbasaur', SUICUNE: 'vaga por Kanto se você escolheu Charmander' }, // roamer.c
      eventTickets: { NavelRock: 'Mystic Ticket', BirthIsland: 'Aurora Ticket' }, // nenhum script do jogo entrega esses itens
      giftNotes: { CinnabarIsland_PokemonLab_ExperimentRoom: 'revive o fóssil correspondente', SaffronCity_Dojo: 'escolha 1 de 2 (Hitmonlee ou Hitmonchan)' },
      prizeRoom: 'CeladonCity_GameCorner_PrizeRoom', // preços em fichas por versão (.ifdef FIRERED/LEAFGREEN)
      // Tutores cujos golpes vêm de CÓDIGO (não do script): os golpes são lidos do símbolo indicado
      codeTutors: [{ map: 'TwoIsland_CapeBrink_House', label: 'TwoIsland_CapeBrink_House_EventScript_StarterTutor', file: 'src/field_specials.c', fn: 'CapeBrinkGetMoveToTeachLeadPokemon' }],
    },
  },
  'ruby-sapphire': {
    ...GEN3,
    label: 'Pokémon Ruby / Sapphire (GBA)',
    versionGroup: 'ruby-sapphire',
    versions: ['ruby', 'sapphire'],
    walkthrough: 'detonado-ruby-sapphire',
    walkthroughTypos: { Moosdeep: 'Mossdeep' },
    // Times em que o detonado diverge do código do jogo (o decomp vence; registrado para não esconder):
    walkthroughKnownDiffs: {
      TRAINER_WATTSON: 'detonado: Voltorb nv 22; jogo (src/data/trainer_parties.h): Voltorb nv 20',
      TRAINER_TATE_AND_LIZA: 'detonado: Lunatone/Solrock nv 40; jogo: nv 42',
    },
    decomp: {
      repo: 'pret/pokeruby',
      commit: '5784633ce4ef7ade1a7f2d2d0c288e3d5e6cdd7f',
      // pokeruby é o decomp mais antigo: mesmos dados, outros nomes de arquivo → apelidos (o código pede o caminho "padrão")
      aliases: {
        'src/data/battle_moves.h': 'src/data/battle_moves.c',
        'src/data/pokemon/species_info.h': 'src/data/pokemon/base_stats.h',
        'src/data/trainers.h': 'src/data/trainers_en.h',
        'src/pokemon.c': 'src/pokemon_1.c',
        'src/data/text/species_names.h': 'src/data/text/species_names_en.h',
        'src/data/text/move_names.h': 'src/data/text/move_names_en.h',
      },
      itemBallScripts: 'data/item_ball_scripts.inc', // fora de data/scripts/ neste repositório
      tradesFile: 'src/trade.c',
      hasRtc: true, // src/pokemon_3.c: case EVO_FRIENDSHIP_DAY: RtcCalcLocalTime() — ativo
      wildSuffix: { ruby: '_Ruby', sapphire: '_Sapphire' }, // base_label em wild_encounters.json
      // src/wild_encounter.c: gWildFeebasRoute119Data = {20, 25, SPECIES_FEEBAS}; checagem em MAP_ROUTE119
      codeEncounters: [{ species: 'FEEBAS', where: 'Route 119', map: 'MAP_ROUTE119', method: 'Pesca em tiles sorteados', gateAs: 'Old Rod', min: 20, max: 25, pct: 50 }],
      skipTrainerClasses: /^(PLAYER)/,
      starters: { species: ['TREECKO', 'TORCHIC', 'MUDKIP'], where: 'Route 101 — bolsa do Prof. Birch' },
      // nomes que mudam por versão (constants/version.inc e #ifdef em species.h)
      versionDefine: { flag: 'SAPPHIRE', whenSet: 'sapphire', otherwise: 'ruby', files: ['constants/version.inc', 'include/constants/species.h'] },
      // ROAMER_SPECIES: Latias (Sapphire) / Latios (Ruby) — roamer.c: CreateMon(..., ROAMER_SPECIES, 40, ...)
      roamers: { ROAMER_SPECIES: 'vaga por Hoenn (depende da versão)' },
      eventTickets: { SouthernIsland: 'Eon Ticket' },
      giftNotes: { RustboroCity_DevonCorp_2F: 'revive o fóssil: um dos dois (Root ou Claw Fossil)' },
      prizeRoom: null,
    },
  },
  emerald: {
    ...GEN3,
    label: 'Pokémon Emerald (GBA)',
    versionGroup: 'emerald',
    versions: ['emerald'],
    walkthrough: 'detonado-emerald',
    walkthroughTypos: { Moosdeep: 'Mossdeep' },
    decomp: {
      repo: 'pret/pokeemerald',
      commit: '731ad5bfd6e6f265508d0efcca0ba42f9dcf5881',
      tradesFile: 'src/data/trade.h',
      hasRtc: true,
      wildSuffix: null, // jogo único
      skipTrainerClasses: /^(PLAYER)/,
      starters: { species: ['TREECKO', 'TORCHIC', 'MUDKIP'], where: 'Route 101 — bolsa do Prof. Birch', level: 5 }, // sStarterMon (starter_choose.c); ScriptGiveMon(starterMon, 5) em battle_setup.c
      roamers: { LATIOS: 'vaga por Hoenn: Latios OU Latias, conforme uma escolha feita no jogo', LATIAS: 'vaga por Hoenn: Latios OU Latias, conforme uma escolha feita no jogo' }, // roamer.c
      eventTickets: { NavelRock: 'Mystic Ticket', BirthIsland: 'Aurora Ticket', FarawayIsland: 'Old Sea Map', SouthernIsland: 'Eon Ticket' }, // só via Mystery Gift/link
      giftNotes: { LittlerootTown_ProfessorBirchsLab: 'um dos três iniciais de Johto, após o upgrade da Pokédex', RustboroCity_DevonCorp_2F: 'revive o fóssil: um dos dois (Root ou Claw Fossil)' },
      prizeRoom: null,
      codeTutors: [{ map: 'BattleFrontier_Lounge7', file: 'src/field_specials.c', arrays: ['sBattleFrontier_TutorMoves1', 'sBattleFrontier_TutorMoves2'], detail: 'Battle Frontier (paga com Battle Points)' }],
      // Presentes liberados só no pós-jogo, com a evidência no código:
      //   LittlerootTown_ProfessorBirchsLab: special EnableNationalPokedex (Pokédex Nacional) e, em seguida,
      //   setvar VAR_DEX_UPGRADE_JOHTO_STARTER_STATE, 2 → só então o Birch oferece Chikorita/Cyndaquil/Totodile.
      postgameGifts: { LittlerootTown_ProfessorBirchsLab: 'após a Pokédex Nacional (EnableNationalPokedex)' },
      // Encontros definidos em código, fora de wild_encounters.json (src/wild_encounter.c: sWildFeebas = {20, 25}; CheckFeebas)
      // Altering Cave: só a tabela 1 (Zubat) é normal; 2–9 são ativadas por Mystery Gift (data/scripts/gift_altering_cave.inc)
      eventWildLabels: '^gAlteringCave[2-9]$',
      codeEncounters: [{ species: 'FEEBAS', where: 'Route 119', map: 'MAP_ROUTE119', method: 'Pesca em 6 tiles sorteados', gateAs: 'Old Rod', min: 20, max: 25, pct: 50 }],
    },
  },
};
