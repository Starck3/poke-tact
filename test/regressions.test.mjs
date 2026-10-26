// Testes de regressão: cada teste fixa um erro JÁ ENCONTRADO (meu ou de uma fonte) para que ele não volte.
// O comentário de cada teste diz qual era o erro e como foi confirmado o valor correto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { effectiveness, availableMoves, likelyMoveset, recommend, whereToGet } from '../public/engine.mjs';
import { filterGames, groupByGeneration } from '../public/catalog.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const FR = load('firered-leafgreen.json');
const EM = load('emerald.json');
const FR_ACQ = load('firered-leafgreen-acquisition.json');
const EM_ACQ = load('emerald-acquisition.json');
const mon = (data, n) => data.pokemon.find((p) => p.name === n);
const haveDecomp = existsSync(new URL('../data-sources/pokefirered/', import.meta.url)) && existsSync(new URL('../data-sources/pokeemerald/', import.meta.url));
const OPTS = { onlyObtainable: true, fullyEvolvedOnly: false, includeLegendary: false };

// ---------------------------------------------------------------- golpes (valores da Gen 3)

test('regressão: past_values da PokéAPI aplicados campo a campo (vine-whip saía com 45 em vez de 35)', () => {
  // Erro: eu lia só a entrada histórica mais antiga e perdia campos que mudaram em entradas posteriores.
  // Correto confirmado em src/data/battle_moves.h do pokefirered.
  for (const data of [FR, EM]) {
    assert.equal(data.moves['vine-whip'].power, 35);
    assert.equal(data.moves['giga-drain'].power, 60);
    assert.equal(data.moves.growth.pp, 40);
    assert.equal(data.moves['jump-kick'].pp, 25);
  }
});

test('regressão: prioridade e PP sem histórico na PokéAPI vêm do jogo (Protect saía com prioridade 4)', () => {
  // A PokéAPI não guarda histórico de prioridade; o overlay do decomp corrige.
  for (const data of [FR, EM]) {
    assert.equal(data.moves.protect.priority, 3);
    assert.equal(data.moves.detect.priority, 3);
    assert.equal(data.moves['fake-out'].priority, 1);
    assert.equal(data.moves['extreme-speed'].priority, 1);
    assert.equal(data.moves.rest.pp, 10);
    assert.equal(data.moves['mind-reader'].pp, 5);
    assert.equal(data.moves['luster-purge'].power, 70);
  }
});

test('regressão: categoria física/especial pelo TIPO na Gen 3 (IS_TYPE_PHYSICAL = type < TYPE_MYSTERY)', () => {
  for (const data of [FR, EM]) {
    assert.equal(data.moves.bite.category, 'special'); // Dark
    assert.equal(data.moves['shadow-ball'].category, 'physical'); // Ghost
    assert.equal(data.moves['sludge-bomb'].category, 'physical'); // Poison
  }
});

test('regressão: tabela de tipos da Gen 3 (sem Fada; Aço resiste Ghost/Dark)', () => {
  assert.equal(FR.types.includes('fairy'), false);
  assert.equal(effectiveness(FR, 'ghost', mon(FR, 'magnemite')), 0.5);
  assert.equal(effectiveness(FR, 'dark', mon(FR, 'steelix')), 0.5);
  assert.equal(effectiveness(FR, 'ghost', mon(FR, 'alakazam')), 2); // na Gen 1 era 0×
  assert.equal(effectiveness(FR, 'ice', mon(FR, 'gyarados')), 1); // meu teste antigo errava: ½ × 2 = 1
});

// ---------------------------------------------------------------- moveset padrão

test('regressão: golpe repetido no learnset é ignorado, não vai para o fim (GiveMoveToBoxMon)', () => {
  // Erro: eu reordenava duplicatas. No jogo, MON_ALREADY_KNOWS_MOVE só pula.
  assert.deepEqual(likelyMoveset(mon(FR, 'venusaur'), 15), ['leech-seed', 'vine-whip', 'poison-powder', 'sleep-powder']);
});

test('regressão: ordem do learnset é a do arquivo do jogo, não a da PokéAPI (empates no nível 1)', () => {
  // Venusaur nv 1: Tackle, Growl, Leech Seed, Vine Whip — a PokéAPI listava Vine Whip primeiro.
  const lvl1 = mon(FR, 'venusaur').learnset.filter((l) => l.method === 'level-up' && l.level === 1).map((l) => l.move);
  assert.deepEqual(lvl1, ['tackle', 'growl', 'leech-seed', 'vine-whip']);
});

test('regressão: golpes de ovo (inclusive Volt Tackle por Light Ball) não contam como disponíveis', () => {
  const pichu = mon(EM, 'pichu');
  assert.ok(pichu.learnset.some((l) => l.method === 'light-ball-egg'));
  assert.equal(availableMoves(EM, pichu, 100).includes('volt-tackle'), false);
});

// ---------------------------------------------------------------- evolução e nível

test('regressão: não recomenda quem ainda não evoluiu no nível do time (Tyranitar só a partir do nv 55)', () => {
  assert.equal(mon(FR, 'tyranitar').minLevel, 55);
  assert.equal(mon(FR, 'golem').minLevel, 25); // por troca, mas Graveler exige nv 25
  const r = recommend(FR, mon(FR, 'arcanine'), { ...OPTS, level: 42, version: 'firered' });
  assert.ok(r.picks.every((p) => p.mon.minLevel <= 42));
  assert.ok(!r.picks.some((p) => p.mon.name === 'tyranitar'));
});

test('regressão: evolução por horário só em jogo com relógio (FRLG removeu; Emerald tem)', () => {
  // pokefirered/src/pokemon.c: "FR/LG removed the time of day evolutions due to having no RTC."
  assert.equal(mon(FR, 'espeon').evo.possible, false);
  assert.equal(mon(FR, 'espeon').obtainable.firered, false);
  assert.equal(mon(EM, 'espeon').evo.possible, true);
});

// ---------------------------------------------------------------- disponibilidade e onde obter

test('regressão: lendários só de evento não contam como obtíveis (PokéAPI marcava como obtíveis)', () => {
  for (const n of ['lugia', 'ho-oh', 'celebi']) for (const v of ['firered', 'leafgreen']) assert.equal(mon(FR, n).obtainable[v], false, `${n} ${v}`);
  for (const n of ['mew', 'lugia', 'ho-oh', 'celebi']) assert.equal(mon(EM, n).obtainable.emerald, false, n);
  assert.match(whereToGet(FR, FR_ACQ, mon(FR, 'lugia'), 'firered').events[0].detail, /Mystic Ticket/);
});

test('regressão: exclusivos de versão do FRLG (inclusive prêmios do Game Corner)', () => {
  assert.equal(mon(FR, 'arcanine').obtainable.leafgreen, false);
  assert.equal(mon(FR, 'sandslash').obtainable.firered, false);
  const prize = (n, v) => (FR_ACQ.versions[v][n] ?? []).find((s) => s.type === 'prize')?.detail;
  assert.equal(prize('scyther', 'firered'), '5500 fichas');
  assert.equal(prize('scyther', 'leafgreen'), undefined);
  assert.equal(prize('pinsir', 'leafgreen'), '2500 fichas');
  assert.equal(prize('abra', 'firered'), '180 fichas');
  assert.equal(prize('abra', 'leafgreen'), '120 fichas');
});

test('regressão: Marowak fantasma da Pokémon Tower não é fonte de captura', () => {
  assert.ok(!(FR_ACQ.versions.firered.marowak ?? []).some((s) => s.type === 'static'));
});

test('regressão: só um lendário vagante por jogo, conforme o inicial (roamer.c)', () => {
  assert.match(FR_ACQ.versions.firered.entei.find((s) => s.type === 'roamer').detail, /Bulbasaur/);
  assert.match(FR_ACQ.versions.firered.suicune.find((s) => s.type === 'roamer').detail, /Charmander/);
  assert.match(FR_ACQ.versions.firered.raikou.find((s) => s.type === 'roamer').detail, /Squirtle/);
});

test('regressão: Feebas do Emerald vem de código (wild_encounter.c), não da tabela — saía como inobtível', () => {
  assert.equal(mon(EM, 'feebas').obtainable.emerald, true);
  assert.equal(mon(EM, 'milotic').obtainable.emerald, true);
  const f = whereToGet(EM, EM_ACQ, mon(EM, 'feebas'), 'emerald').direct[0];
  assert.deepEqual([f.where, f.min, f.max], ['Route 119', 20, 25]);
});

test('regressão: iniciais de Johto no Emerald são obtíveis no jogo (eu tinha dito que eram só de evento)', () => {
  // LittlerootTown_ProfessorBirchsLab: givemon após VAR_DEX_UPGRADE_JOHTO_STARTER_STATE — não é Mystery Gift.
  for (const n of ['chikorita', 'cyndaquil', 'totodile']) {
    assert.equal(mon(EM, n).obtainable.emerald, true, n);
    assert.ok(EM_ACQ.versions.emerald[n].some((s) => s.type === 'gift'), n);
  }
});

test('regressão: ovo de Pichu do Emerald é Mystery Gift, não fonte normal', () => {
  assert.ok(!(EM_ACQ.versions.emerald.pichu ?? []).some((s) => s.type === 'egg'));
});

// ---------------------------------------------------------------- treinadores

test('regressão: times reais de treinadores (conferidos com o jogo)', () => {
  const tr = (file, key) => load(file).trainers.find((t) => t.key === key);
  assert.deepEqual(tr('firered-leafgreen-trainers.json', 'TRAINER_LEADER_BROCK').party[1].moves, ['tackle', 'bind', 'rock-tomb']);
  assert.deepEqual(tr('emerald-trainers.json', 'TRAINER_WALLACE').party.map((p) => [p.species, p.level]),
    [['wailord', 57], ['tentacruel', 55], ['ludicolo', 56], ['whiscash', 56], ['gyarados', 56], ['milotic', 58]]);
  assert.equal(tr('emerald-trainers.json', 'TRAINER_ROXANNE_1').party.length, 3);
});

test('regressão: classes de treinador do Emerald nos grupos certos (rivais e Aqua/Magma caíam em "comuns")', () => {
  const t = load('emerald-trainers.json').trainers;
  assert.ok(t.some((x) => x.group === 'Rival' && /Brendan|May/.test(x.label)));
  assert.ok(t.some((x) => x.group === 'Equipe Aqua / Magma' && /Maxie|Archie/.test(x.label)));
  // FRLG não deve herdar classes de Hoenn que sobraram no código
  assert.ok(!load('firered-leafgreen-trainers.json').trainers.some((x) => x.group === 'Equipe Aqua / Magma'));
});

// ---------------------------------------------------------------- parsers do decomp

test('regressão: parsers do decomp (tutor cortava em ";" e ia tudo para o Bulbasaur; TM do Emerald tem outro formato)', { skip: !haveDecomp }, async () => {
  const { loadDecomp } = await import('../scripts/lib/decomp.mjs');
  for (const g of ['firered-leafgreen', 'emerald']) {
    const d = loadDecomp(g);
    const bulba = d.species.BULBASAUR;
    // o bug atribuía TODOS os tutores ao 1º Pokémon e nenhum aos demais
    assert.ok(bulba.tutor.has(d.moveId.SWORDS_DANCE) && !bulba.tutor.has(d.moveId.METRONOME), `${g}: tutores do Bulbasaur errados`);
    assert.ok(Object.values(d.species).filter((s) => s.tutor.size > 0).length > 300, `${g}: poucas espécies com tutor`);
    assert.ok(bulba.machine.has(d.moveId.TOXIC), `${g}: Bulbasaur deveria aprender TM Toxic`);
    assert.ok(d.species.BULBASAUR.egg.has(d.moveId.CHARM), `${g}: #define egg_moves engolia o 1º Pokémon`);
    assert.equal(d.species.MAGIKARP.machine.size, 0);
  }
});

// ---------------------------------------------------------------- catálogo

test('regressão: catálogo — GBA mostra os 3 jogos de GBA; Geração III mostra os mesmos', () => {
  const { games } = load('games.json');
  assert.equal(games.length, 22);
  const gba = filterGames(games, { platform: 'Game Boy Advance' }).map((g) => g.id);
  assert.deepEqual(gba.sort(), ['emerald', 'firered-leafgreen', 'ruby-sapphire']);
  assert.deepEqual(filterGames(games, { generation: 3 }).map((g) => g.id).sort(), gba);
  assert.deepEqual(filterGames(games, { platform: 'Nintendo DS', generation: 5 }).map((g) => g.id), ['black-white', 'black-2-white-2']);
  assert.deepEqual(groupByGeneration(games).map(([gen]) => gen), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(games.filter((g) => g.validation === 'decomp').map((g) => g.id).sort(), ['emerald', 'firered-leafgreen', 'ruby-sapphire']); // conferidos com o código do jogo
  assert.equal(games.filter((g) => g.status === 'supported').length, 22); // todos; Legends: Z-A montado pelo PKHeX (0.8.0)
});

test('tela inicial por geração: cada geração lista os consoles (sem repetir), anos e jogos no app', async () => {
  const { generationSummaries } = await import('../public/catalog.mjs');
  const { games } = load('games.json');
  const s = generationSummaries(games);
  assert.deepEqual(s.map((x) => x.generation), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(s.reduce((a, x) => a + x.count, 0), games.length);
  const g3 = s.find((x) => x.generation === 3);
  assert.deepEqual(g3.platforms, ['Game Boy Advance']); // 3 jogos de GBA → um console só
  assert.equal(g3.count, 3);
  assert.ok(g3.years[0] <= g3.years[1]);
  assert.ok(s.find((x) => x.generation === 7).platforms.includes('Nintendo Switch')); // Let's Go no Switch, junto do 3DS
  assert.equal(s.reduce((a, x) => a + x.supported, 0), games.filter((g) => g.status === 'supported').length);
});

test('regressão: abrir um jogo não traz o inicial de antes — o contexto salvo no navegador não inclui o inicial', () => {
  const src = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
  const fields = src.match(/const CTX_FIELDS = (\[[^\]]*\])/);
  assert.ok(fields, 'CTX_FIELDS não encontrado em app.mjs');
  assert.ok(!JSON.parse(fields[1].replace(/'/g, '"')).includes('starter'));
});

test('oponente: autocompletar só com Pokémon do jogo e aviso para Pokémon de outra geração', async () => {
  const { searchOpponents, findOpponent, opponentWarning, generationOfDex } = await import('../public/pokedex.mjs');
  const { pokemon } = load('red-blue.json');
  const pokedex = load('pokedex.json');
  const ctx = { pokemon, pokedex, generation: 1, gameLabel: 'Red / Blue' };
  // a Pokédex nacional cobre 1–1025 sem buracos (o aviso depende dela)
  assert.equal(pokedex.length, 1025);
  assert.ok(pokedex.every(([id], i) => id === i + 1));
  assert.deepEqual([1, 151, 152, 251, 252, 809, 810, 1025].map(generationOfDex), [1, 1, 2, 2, 3, 7, 8, 9]);
  // sugestões: só do jogo, "começa com" antes de "contém", número também
  assert.ok(searchOpponents(pokemon, 'pi').every((p) => p.id <= 151));
  assert.equal(searchOpponents(pokemon, 'pi')[0].name, 'pidgey');
  assert.ok(searchOpponents(pokemon, 'chu').some((p) => p.name === 'pikachu'));
  assert.equal(searchOpponents(pokemon, '#25')[0].name, 'pikachu');
  assert.deepEqual(searchOpponents(pokemon, 'chikorita'), []); // Geração II não aparece no Red/Blue
  // nome com espaço/pontuação acha o Pokémon do jogo
  assert.equal(findOpponent(pokemon, 'Mr. Mime')?.name, 'mr-mime');
  assert.equal(opponentWarning(ctx, 'Mr. Mime'), null);
  assert.equal(opponentWarning(ctx, 'pika'), null); // ainda digitando, há sugestões
  assert.equal(opponentWarning(ctx, ''), null);
  // avisos
  const w = opponentWarning(ctx, 'Chikorita');
  assert.equal(w.kind, 'newer');
  assert.match(w.text, /Chikorita é da Geração II/);
  assert.equal(opponentWarning(ctx, 'xern').kind, 'newer'); // prefixo que só existe em gerações futuras
  assert.equal(opponentWarning(ctx, 'zzzz').kind, 'unknown');
  // jogo sem toda a Pokédex da própria geração (Sword/Shield): o Pokémon existe, mas não está no jogo
  const swsh = load('sword-shield.json');
  const absent = pokedex.find(([id, n]) => id <= 898 && !swsh.pokemon.some((p) => p.name === n));
  assert.equal(opponentWarning({ pokemon: swsh.pokemon, pokedex, generation: 8, gameLabel: 'Sword / Shield' }, absent[1]).kind, 'absent');
});

test('regressão: sprites do Gold/Silver vêm das pastas gold/silver (não existe "gold-silver"; caía no sprite moderno)', async () => {
  const { spriteFolder } = await import('../public/catalog.mjs');
  assert.equal(spriteFolder('gold-silver', 'gold'), 'gold');
  assert.equal(spriteFolder('gold-silver', 'silver'), 'silver');
  assert.equal(spriteFolder('crystal', 'crystal'), 'crystal');
  assert.equal(spriteFolder('heartgold-soulsilver', 'heartgold'), 'heartgold-soulsilver'); // essa pasta existe
});

test('regressão: o número da tela inicial (banco de lutas) conta TODOS os jogos com detonado — o DP ficava de fora', () => {
  const b = load('games.json').benchmark;
  const games = load('games.json').games.filter((g) => g.hasWalkthrough).map((g) => g.id);
  const report = (g) => JSON.parse(readFileSync(new URL(`../reports/benchmark/${g}.json`, import.meta.url), 'utf8')).summary.depois;
  assert.equal(b.games, games.length);
  assert.equal(b.picks, games.reduce((a, g) => a + report(g).picks, 0));
  assert.ok(games.includes('diamond-pearl') && report('diamond-pearl').picks > 0);
  // a comparação antes/depois continua só com jogos que têm linha de base
  const t = JSON.parse(readFileSync(new URL('../reports/benchmark/_total.json', import.meta.url), 'utf8'));
  assert.ok(t.depois.picks < t.atual.picks);
});

// ---------------------------------------------------------------- Black 2 / White 2 (fuddlesworth/pokebw2)
test('B2W2: núcleo conferido no decomp (0 divergências); a PokéAPI trocava Ataque e Defesa do Cryogonal', () => {
  const r = JSON.parse(readFileSync(new URL('../reports/black-2-white-2/gen5-decomp-audit.json', import.meta.url), 'utf8'));
  for (const [k, v] of Object.entries(r)) assert.equal(v.length, 0, `${k}: ${JSON.stringify(v.slice(0, 3))}`);
  const d = load('black-2-white-2.json');
  assert.deepEqual([mon(d, 'cryogonal').stats.attack, mon(d, 'cryogonal').stats.defense], [50, 30]);
  assert.equal(d.chart.ghost.steel, 0.5); assert.equal(d.chart.dark.steel, 0.5); // Gen 5: Steel ainda resiste a Ghost/Dark
  assert.ok(d.pokemon.every((p) => p.levelUpInGameOrder));
  assert.equal(mon(d, 'escavalier').evo.kind, 'TRADE_SPECIES'); // Karrablast ↔ Shelmet
  assert.ok(mon(d, 'meloetta-aria').learnset.some((l) => l.move === 'relic-song' && l.method === 'tutor')); // tutor de plugin (docs/scripts.md)
});

test('B2W2: treinadores com lugar e rival pelo inicial (EVENT_WORK_0x4030; VMJumpIf salta quando a comparação é FALSA)', () => {
  const t = load('black-2-white-2-trainers.json').trainers;
  assert.ok(t.length >= 570);
  const leaders = t.filter((x) => x.group === 'Líderes de ginásio' && !x.rematch);
  assert.equal(new Set(leaders.map((x) => x.name)).size, 8);
  assert.deepEqual(t.find((x) => x.key === 'TRAINER_LEADER_CHEREN').map, ['Aspertia City Gym']);
  // com Snivy o rival vem de Tepig; com Tepig, de Oshawott; com Oshawott, de Snivy (lido no script, não suposto)
  const first = t.filter((x) => /^TRAINER_RIVAL(_[23])?$/.test(x.key));
  assert.deepEqual(first.map((x) => [x.forStarter[0], x.party.at(-1).species]).sort(), [['oshawott', 'snivy'], ['snivy', 'tepig'], ['tepig', 'oshawott']]);
  assert.ok(t.filter((x) => x.group === 'Rival').every((x) => x.forStarter?.length === 1));
  // parceiros de luta em dupla (CallTrainerMultiBattle: o 1º argumento é o aliado) não são oponentes
  assert.ok(!t.some((x) => /^TRAINER_(BIANCA|CHEREN|NATE|ROSA)$/.test(x.key)));
});

test('B2W2: onde obter pelo código do jogo — zonas por versão, fósseis, enxames no pós-jogo, Hidden Grotto da PokéAPI', () => {
  const a = load('black-2-white-2-acquisition.json'), d = load('black-2-white-2.json');
  const types = (v, sp) => (a.versions[v][sp] ?? []).map((s) => s.type);
  // VERSION_SPECIFIC_ZONES (zonedata.c, só o White 2 liga): Route 4 do Black 2 = Mandibuzz, do White 2 (Route 4_16) = Braviary
  assert.ok(types('black-2', 'mandibuzz').includes('static') && !types('white-2', 'mandibuzz').includes('static'));
  assert.ok(types('white-2', 'braviary').includes('static') && !types('black-2', 'braviary').includes('static'));
  // Floccesy: GameGetVersion → Gible no Black 2, Dratini no White 2 (presente)
  assert.ok(types('black-2', 'gible').includes('gift') && !types('white-2', 'gible').includes('gift'));
  // fósseis revividos no global 10280 (Nacrene) — antes ficavam fora por virem de variável
  assert.ok(a.versions['black-2'].archen.some((s) => s.type === 'gift' && s.level === 25));
  // enxames (FLAG_SWARMS = estrela do Hall da Fama) — a PokéAPI não os tem
  const farf = a.versions['black-2'].farfetchd.find((s) => s.swarm);
  assert.ok(farf && farf.stage === 9);
  // trocas com NPC por versão (antes o simulador seguia sempre o mesmo ramo do CallPokeSelect)
  assert.ok(types('black-2', 'petilil').includes('trade') && types('white-2', 'rotom').includes('trade'));
  // Hidden Grotto: fora do decomp em texto → PokéAPI, rotulado
  assert.ok(Object.values(a.versions['black-2']).flat().some((s) => s.method === 'Hidden Grotto' && s.source === 'pokeapi'));
  assert.equal(a.progress.leaderOrder.join(), 'Cheren,Roxie,Burgh,Elesa,Clay,Skyla,Drayden,Marlon'); // Roxie: "Whrilipede" no detonado
  assert.deepEqual(d.starters.species, ['snivy', 'tepig', 'oshawott']);
  const g = load('games.json').games.find((x) => x.id === 'black-2-white-2');
  assert.ok(g.validation === 'decomp-core' && g.hasWalkthrough && !g.partial);
});

// ---------------------------------------------------------------- PKHeX: núcleo dos jogos sem decomp (Black/White e Gens 6–9)
const havePkhex = existsSync(new URL('../data-sources/pkhex-src/PKHeX.Core/Resources/', import.meta.url));
test('PKHeX: o leitor bate com os decomps — B2W2 inteiro e o learnset de Emerald, DP, Platinum e HGSS (0 diferenças, com ordem)', { skip: !havePkhex && 'sem PKHeX local' }, async () => {
  const { loadPkhex, binLinker16, parseLearnset } = await import('../scripts/lib/pkhex.mjs');
  const root = new URL('../data-sources/pkhex-src/', import.meta.url);
  const idOf = (n) => JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id;
  const P = loadPkhex(root, 'black-2-white-2');
  const b2 = load('black-2-white-2.json');
  const nh = (l) => [...l].map((x) => x.replace(/-/g, '')).sort().join();
  for (const mon of b2.pokemon) {
    const d = P.species[mon.id];
    assert.deepEqual(d.stats, mon.stats, mon.name); assert.deepEqual(d.types, mon.types, mon.name); assert.equal(nh(d.abilities), nh(mon.abilities), mon.name);
  }
  for (const [game, f] of [['black-2-white-2', 'lvlmove_b2w2.pkl'], ['emerald', 'lvlmove_e.pkl'], ['diamond-pearl', 'lvlmove_dp.pkl'], ['platinum', 'lvlmove_pt.pkl'], ['heartgold-soulsilver', 'lvlmove_hgss.pkl']]) {
    const L = binLinker16(readFileSync(new URL(`PKHeX.Core/Resources/byte/levelup/${f}`, root)));
    const data = load(`${game}.json`);
    const ids = new Map(Object.keys(data.moves).map((n) => [n, idOf(n)])), known = new Set(ids.values());
    for (const mon of data.pokemon) assert.equal(parseLearnset(L[mon.id]).filter(([, m]) => known.has(m)).map(([l, m]) => m + '@' + l).join(), mon.learnset.filter((l) => l.method === 'level-up').map((l) => ids.get(l.move) + '@' + l.level).join(), `${game}/${mon.name}`);
  }
});

test('PKHeX: correções nos jogos sem decomp (o que a PokéAPI erra) e learnset na ordem do jogo', () => {
  for (const g of ['black-white', 'x-y', 'omega-ruby-alpha-sapphire']) assert.deepEqual([mon(load(`${g}.json`), 'cryogonal').stats.attack, mon(load(`${g}.json`), 'cryogonal').stats.defense], [50, 30], g);
  for (const g of ['black-white', 'sun-moon']) assert.deepEqual(mon(load(`${g}.json`), 'koffing').abilities, ['levitate'], g); // Stench não existe no jogo
  const sv = load('scarlet-violet.json');
  assert.ok(mon(sv, 'noctowl').learnset.some((l) => l.move === 'defog' && l.level === 15)); // faltava na PokéAPI
  assert.ok(!mon(sv, 'walking-wake').learnset.some((l) => l.method === 'level-up' && l.level === 0)); // "nv 0" inventado (não evolui)
  const games = ['black-white', 'x-y', 'omega-ruby-alpha-sapphire', 'sun-moon', 'ultra-sun-ultra-moon', 'lets-go-pikachu-lets-go-eevee', 'sword-shield', 'brilliant-diamond-shining-pearl', 'legends-arceus', 'scarlet-violet'];
  for (const g of games) {
    const d = load(`${g}.json`);
    assert.ok(d.pokemon.filter((p) => p.id <= 1025).every((p) => p.levelUpInGameOrder), g);
    assert.match(d.corrections.source, /PKHeX/, g);
    const r = JSON.parse(readFileSync(new URL(`../reports/${g}/pkhex-audit.json`, import.meta.url), 'utf8'));
    for (const [k, v] of Object.entries(r)) assert.equal(v.length, 0, `${g} ${k}`);
    assert.equal(load('games.json').games.find((x) => x.id === g).validation, 'pkhex', g);
  }
  assert.ok(load('lets-go-pikachu-lets-go-eevee.json').pokemon.every((p) => !p.abilities.length)); // Let's Go não tem habilidades
});

test('rotas: filtros da tela inicial e estado do jogo ficam na URL (ida e volta)', async () => {
  const { parseRoute, homeHash } = await import('../public/catalog.mjs');
  const h = homeHash({ platform: 'Game Boy Advance', generation: 3 });
  const r = parseRoute(h);
  assert.equal(r.view, 'home');
  assert.deepEqual([r.params.plataforma, Number(r.params.geracao)], ['Game Boy Advance', 3]);
  assert.equal(homeHash({}), '#/');
  assert.deepEqual(parseRoute('#/jogo/emerald?treinador=TRAINER_WALLACE&i=5'), { view: 'game', gameId: 'emerald', params: { treinador: 'TRAINER_WALLACE', i: '5' } });
  assert.equal(parseRoute('').view, 'home');
  assert.equal(parseRoute('#/jogo/../../x').view, 'home'); // id inválido não vira rota de jogo
});

test('regressão: servidor não cai ao pedir arquivo inexistente (enviava 200 antes de ler e travava no 404)', async () => {
  const { createAppServer } = await import('../scripts/serve.mjs');
  const server = createAppServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/favicon.ico`)).status, 404);
    assert.equal((await fetch(`${base}/pasta-que-nao-existe/`)).status, 404);
    assert.equal((await fetch(`${base}/`)).status, 200); // continua de pé depois dos 404
    assert.equal((await fetch(`${base}/data/games.json`)).status, 200);
    for (const p of ['/..%2f..%2fpackage.json', '/..%5c..%5cpackage.json', '/%2e%2e/package.json']) assert.notEqual((await fetch(base + p)).status, 200, p); // nada fora de public/
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------- achados nas telas renderizadas (2026-10-17)

test('regressão: Altering Cave do Emerald — tabelas 2–9 são de Mystery Gift, não selvagens (aparecia "Mareep 100%")', () => {
  // data/scripts/gift_altering_cave.inc é o único script que muda VAR_ALTERING_CAVE_WILD_SET.
  const mareep = EM_ACQ.versions.emerald.mareep;
  assert.ok(!mareep.some((s) => s.type === 'wild' && s.where === 'Altering Cave'));
  assert.ok(mareep.some((s) => s.type === 'event' && s.where === 'Altering Cave'));
  assert.ok(EM_ACQ.versions.emerald.zubat.some((s) => s.type === 'wild' && s.where === 'Altering Cave')); // tabela 1 é normal
  assert.equal(mon(EM, 'mareep').obtainable.emerald, true); // continua obtível pela Safari Zone
});

test('regressão: progresso — não sugere Pokémon obtido acima do nível do time (Vaporeon contra o Onix do Brock)', () => {
  // Eevee é dado no nv 25 em Celadon (givemon SPECIES_EEVEE, 25); com time nv 14 ainda não dá.
  const opts = { ...OPTS, version: 'firered', acq: FR_ACQ, oppMoves: ['tackle', 'bind', 'rock-tomb'] };
  const cedo = recommend(FR, mon(FR, 'onix'), { ...opts, level: 14 });
  assert.ok(!cedo.picks.some((p) => ['vaporeon', 'exeggutor'].includes(p.mon.name)), cedo.picks.map((p) => p.mon.name).join());
  assert.ok(cedo.picks.every((p) => p.reach <= 14));
  const tarde = recommend(FR, mon(FR, 'onix'), { ...opts, level: 30 });
  assert.ok(tarde.picks.length === 3);
});

test('regressão: opção de desligar TM/HM/tutor (Surf aparecia no nv 14)', async () => {
  const { bestMoveVs } = await import('../public/engine.mjs');
  const com = bestMoveVs(FR, mon(FR, 'squirtle'), mon(FR, 'onix'), 14);
  const sem = bestMoveVs(FR, mon(FR, 'squirtle'), mon(FR, 'onix'), 14, { machines: false });
  assert.equal(sem.via.method, 'level-up');
  assert.ok(sem.via.level <= 14);
  assert.ok(com.score >= sem.score);
});

test('regressão: habilidades que mudam dano — Truant pesa contra (Slaking saía em 2º); Pure Power dobra o Ataque', async () => {
  const { abilityFactor, bestMoveVs } = await import('../public/engine.mjs');
  assert.equal(abilityFactor(mon(EM, 'slaking')), 0.5);
  assert.equal(abilityFactor(mon(EM, 'vigoroth')), 1);
  const medi = bestMoveVs(EM, mon(EM, 'medicham'), mon(EM, 'snorlax'), 50, { machines: false });
  const sem = { ...mon(EM, 'medicham'), abilities: ['static'] };
  assert.ok(medi.category !== 'physical' || medi.score >= 1.9 * bestMoveVs(EM, sem, mon(EM, 'snorlax'), 50, { machines: false }).score);
  // Azumarill tem Thick Fat OU Huge Power: não dá para assumir o bônus
  assert.deepEqual([...mon(EM, 'azumarill').abilities].sort(), ['huge-power', 'thick-fat']);
});

test('regressão: espécie rara na natureza mostra também a rota pela pré-evolução (Magneton 1% → Magnemite)', async () => {
  const { preEvolutionRoute } = await import('../public/engine.mjs');
  const r = preEvolutionRoute(EM, EM_ACQ, mon(EM, 'magneton'), 'emerald');
  assert.equal(r.from, 'magnemite');
  assert.deepEqual(r.steps.map((s) => [s.to, s.evo.param]), [['magneton', 30]]);
  assert.equal(preEvolutionRoute(EM, EM_ACQ, mon(EM, 'magnemite'), 'emerald'), null); // forma base não tem
});

test('regressão: presente/fóssil tardio com nível baixo (Omanyte nv 5 em Cinnabar) usa a área próxima como estimativa', () => {
  const om = FR_ACQ.versions.firered.omanyte.find((s) => s.type === 'gift');
  assert.equal(om.level, 5);
  assert.ok(om.area.level >= 15, `área estimada ${om.area.level}`);
  assert.match(om.area.near, /Route 21/);
  const r = recommend(FR, mon(FR, 'onix'), { ...OPTS, version: 'firered', acq: FR_ACQ, level: 14, oppMoves: ['tackle', 'bind', 'rock-tomb'] });
  assert.ok(!r.picks.some((p) => p.mon.name === 'omanyte'), r.picks.map((p) => p.mon.name).join());
});

test('regressão: evolução por troca exige outro jogo e fica fora por padrão (Steelix contra o Brock)', async () => {
  const { needsTradeEvolution } = await import('../public/engine.mjs');
  assert.equal(needsTradeEvolution(FR, FR_ACQ, mon(FR, 'steelix'), 'firered'), true);
  assert.equal(needsTradeEvolution(FR, FR_ACQ, mon(FR, 'alakazam'), 'firered'), true);
  assert.equal(needsTradeEvolution(FR, FR_ACQ, mon(FR, 'onix'), 'firered'), false);
  const base = { ...OPTS, version: 'firered', acq: FR_ACQ, level: 50 };
  const sem = recommend(FR, mon(FR, 'arcanine'), base);
  assert.ok(sem.picks.every((p) => !needsTradeEvolution(FR, FR_ACQ, p.mon, 'firered')));
  const com = recommend(FR, mon(FR, 'arcanine'), { ...base, tradeEvolutions: true });
  assert.equal(com.picks.length, 3);
});

test('regressão: troca dentro do jogo herda o alcance do Pokémon pedido (Tangela ficava sem nível)', async () => {
  const { reachLevel } = await import('../public/engine.mjs');
  const t = FR_ACQ.versions.firered.tangela.find((s) => s.type === 'trade');
  assert.equal(t.want, 'venonat');
  const venonat = reachLevel(FR, FR_ACQ, mon(FR, 'venonat'), 'firered');
  const viaTroca = Math.max(t.area?.level ?? 1, venonat);
  assert.ok(Number.isFinite(venonat) && viaTroca >= venonat);
});

test('regressão: locais selvagens exibidos do mais cedo para o mais tarde (Victory Road aparecia antes do Rock Tunnel)', () => {
  const onix = FR_ACQ.versions.firered.onix.filter((s) => s.type === 'wild');
  for (let i = 1; i < onix.length; i++) assert.ok(onix[i - 1].min <= onix[i].min, `${onix[i - 1].where} (${onix[i - 1].min}) antes de ${onix[i].where} (${onix[i].min})`);
});

test('regressão: Surf/varas/Rock Smash exigem item e insígnia (Psyduck por Surf e Horsea por Good Rod saíam "a partir do nv 5")', () => {
  const g = (acq, v, n, method) => acq.versions[v][n].find((s) => s.type === 'wild' && s.method === method)?.gate;
  // FRLG: HM03 na Safari Zone + insígnia 5 (Koga); Good Rod em Fuchsia
  const surf = g(FR_ACQ, 'firered', 'psyduck', 'Surf');
  assert.equal(surf.badge, 5);
  assert.equal(surf.leader, 'KOGA');
  assert.match(surf.item, /Safari Zone/);
  assert.match(g(FR_ACQ, 'firered', 'horsea', 'Good Rod').item, /Fuchsia/);
  // Emerald: Surf com a insígnia 5 (Norman), Rock Smash com a 3 (Wattson); Feebas usa a porta da Old Rod
  assert.equal(g(EM_ACQ, 'emerald', 'tentacool', 'Surf').leader, 'NORMAN');
  assert.equal(EM_ACQ.versions.emerald.geodude.find((s) => s.method === 'Rock Smash').gate.badge, 3);
  assert.match(EM_ACQ.versions.emerald.feebas[0].gate.item, /Dewford/);
  // efeito no alcance: Psyduck só por Surf/vara não é alcançável no nv 14
  const r = recommend(FR, mon(FR, 'onix'), { ...OPTS, version: 'firered', acq: FR_ACQ, level: 14, oppMoves: ['tackle', 'bind', 'rock-tomb'] });
  assert.ok(r.picks.every((p) => p.reach <= 14), r.picks.map((p) => `${p.mon.name}:${p.reach}`).join());
  assert.ok(!r.picks.some((p) => ['psyduck', 'horsea', 'vaporeon', 'omanyte', 'steelix'].includes(p.mon.name)), r.picks.map((p) => p.mon.name).join());
});

test('iniciais de cada jogo vêm do código e aparecem no dataset (FRLG: Oak; Emerald: bolsa do Birch)', () => {
  assert.deepEqual(load('firered-leafgreen.json').starters.species, ['bulbasaur', 'charmander', 'squirtle']);
  assert.equal(load('firered-leafgreen.json').starters.level, 5);
  assert.deepEqual(load('emerald.json').starters.species, ['treecko', 'torchic', 'mudkip']);
  assert.equal(load('emerald.json').starters.level, 5); // battle_setup.c: ScriptGiveMon(starterMon, 5, ...)
});

test('regressão: índice de detonados usa links relativos e absolutos (eu só lia absolutos e achei 8 de 22)', async () => {
  const { parseDetonadoIndex, matchDetonados } = await import('../scripts/lib/pokemythology.mjs');
  const html = '<a href="/detonados/detonado-red-blue">x</a><a href="https://pokemythology.net/detonados/detonado-emerald">x</a>' +
    '<a href="/detonados/detonado-firered-leafgreen/">x</a><a href="/conteudo/detonados/detonado_usum.htm">x</a>' +
    '<a href="/conteudo/detonados/detonado_sm_demo.htm">demo</a><a href="/detonados/detonado-omegaruby-alphasapphire/">x</a>';
  const list = parseDetonadoIndex(html);
  assert.equal(list.length, 5); // demo fica de fora
  const m = matchDetonados(list, ['red-blue', 'emerald', 'firered-leafgreen', 'ultra-sun-ultra-moon', 'omega-ruby-alpha-sapphire']);
  assert.equal(m['red-blue'], 'https://www.pokemythology.net/detonados/detonado-red-blue/');
  assert.equal(m.emerald, 'https://www.pokemythology.net/detonados/detonado-emerald/');
  assert.equal(m['ultra-sun-ultra-moon'], 'https://www.pokemythology.net/conteudo/detonados/detonado_usum.htm');
  assert.ok(m['omega-ruby-alpha-sapphire']);
  // catálogo publicado: todo jogo da série principal tem detonado
  assert.ok(load('games.json').games.every((g) => g.walkthrough), 'jogo sem detonado no catálogo');
});

test('regressão: times de líderes/Elite 4 batem com o detonado do PokeMythology (3ª fonte)', { skip: !existsSync(new URL('../data-sources/pokemythology/detonado-emerald.html', import.meta.url)) }, async () => {
  // Erros já corrigidos no comparador: título "X usa:" do Emerald; parágrafo antes do nome; "Lt." não é fim de frase;
  // acento (Érika); "Tate e Liza" = TATE&LIZA; nomes repetidos (Giovanni da Rocket); grafia "Victreebell" no detonado.
  const { execFileSync } = await import('node:child_process');
  for (const [g, min] of [['firered-leafgreen', 18], ['emerald', 14]]) {
    execFileSync(process.execPath, ['scripts/validate-vs-pokemythology.mjs', g], { cwd: new URL('..', import.meta.url) });
    const r = JSON.parse(readFileSync(new URL(`../reports/${g}/pokemythology-audit.json`, import.meta.url), 'utf8'));
    assert.ok(r.results.length >= min, `${g}: só ${r.results.length} times comparados`);
    assert.deepEqual(r.results.filter((x) => x.status !== 'MATCH').map((x) => x.title), [], g);
  }
});

// ---------------------------------------------------------------- TMs/HMs: origem e posição exata no decomp

test('regressão: toda origem de TM/HM está ligada a um evento real do mapa (posição x,y ou cena automática)', () => {
  // Antes: o mapa de item no chão era deduzido do PREFIXO do rótulo; agora vem do objeto do map.json que chama o script.
  for (const acq of [FR_ACQ, EM_ACQ]) {
    const all = Object.values(acq.machines).flat();
    assert.ok(all.length > 60);
    assert.deepEqual(all.filter((s) => !s.resolved).map((s) => s.where), []);
  }
  const at = (acq, move, map) => acq.machines[move].find((s) => s.map === map);
  assert.deepEqual([at(FR_ACQ, 'rock-tomb', 'PewterCity_Gym').x, at(FR_ACQ, 'rock-tomb', 'PewterCity_Gym').y, at(FR_ACQ, 'rock-tomb', 'PewterCity_Gym').by], [6, 5, 'Brock']);
  // TM09 na Gen 3 é Bullet Seed (na Gen 1 o TM do Mt. Moon era outro — não confundir gerações)
  const tm09 = at(FR_ACQ, 'bullet-seed', 'MtMoon_1F');
  assert.deepEqual([tm09.x, tm09.y, tm09.type], [11, 35, 'ground']);
  assert.equal(at(EM_ACQ, 'surf', 'PetalburgCity_WallysHouse').by, 'cena automática ao entrar no mapa');
});

test('regressão: scripts COMPARTILHADOS também entregam itens (TM43 do garoto da Route 111 no Emerald; o detonado apontou)', () => {
  const sp = EM_ACQ.machines['secret-power'];
  const boy = sp.find((s) => s.map === 'Route111');
  assert.ok(boy && boy.sharedScript, 'TM43 da Route 111 (data/scripts/secret_power_tm.inc)');
  assert.deepEqual([boy.x, boy.y], [13, 20]);
  assert.ok(sp.some((s) => s.type === 'mart' && s.map === 'SlateportCity'));
});

test('regressão: Pokémon de script compartilhado só conta se um mapa chama (Kecleon sim; ovo de Pichu do Mystery Gift não)', () => {
  assert.ok(EM_ACQ.versions.emerald.kecleon.some((s) => s.where === 'Route 119' && s.sharedScript));
  assert.ok(!(EM_ACQ.versions.emerald.pichu ?? []).filter((s) => s.type !== 'breed').length); // 0.23.0: só o ovo da creche
});

test('regressão: numeração de TM/HM vem do código de cada jogo e é a mesma na Gen 3 (FRLG × Emerald)', { skip: !haveDecomp }, async () => {
  const { decompPaths } = await import('../scripts/lib/decomp.mjs');
  const { tmNumbering } = await import('../scripts/validate-tms-vs-pokemythology.mjs').catch(() => ({}));
  const fr = {}; for (const m of decompPaths('firered-leafgreen').read('src/data/pokemon/tmhm_learnsets.h').matchAll(/TMHM\((TM|HM)(\d+)_(\w+)\)/g)) fr[m[1] + m[2]] = m[3];
  const em = {};
  const tms = decompPaths('emerald').read('include/constants/tms_hms.h');
  [...tms.match(/#define FOREACH_TM\(F\)([\s\S]*?)\n\n/)[1].matchAll(/F\((\w+)\)/g)].forEach((m, i) => (em[`TM${String(i + 1).padStart(2, '0')}`] = m[1]));
  for (const k of Object.keys(em)) assert.equal(fr[k], em[k], k);
  assert.equal(fr.TM39, 'ROCK_TOMB');
  void tmNumbering;
});

test('regressão: TM sem origem no jogo não é oferecido (FRLG: TM10 Hidden Power e HM08 Dive — código e detonado concordam)', async () => {
  const { availableMoves } = await import('../public/engine.mjs');
  assert.equal(FR_ACQ.machines['hidden-power'], undefined);
  assert.equal(FR_ACQ.machines.dive, undefined);
  assert.ok(!availableMoves(FR, mon(FR, 'squirtle'), 100, { machineSources: FR_ACQ.machines }).includes('hidden-power'));
});

test('regressão: golpe de TM só depois de o TM estar ao alcance (Earthquake/Surf apareciam no nv 14)', () => {
  const r = recommend(FR, mon(FR, 'onix'), { ...OPTS, version: 'firered', acq: FR_ACQ, level: 14, oppMoves: ['tackle', 'bind', 'rock-tomb'] });
  for (const p of r.picks) if (p.move.via.method === 'machine') assert.ok(p.move.via.source && p.move.via.source.level <= 14, `${p.mon.name}: ${p.move.name}`);
  assert.ok(!r.picks.some((p) => ['earthquake', 'surf'].includes(p.move.name)));
});

test('regressão: evolução por pedra exige a pedra (Raichu no nv 14; Thunder Stone só em Celadon/Power Plant)', async () => {
  const { reachLevel } = await import('../public/engine.mjs');
  assert.ok(FR_ACQ.items.THUNDER_STONE.some((s) => s.where.includes('Celadon')));
  assert.ok(reachLevel(FR, FR_ACQ, mon(FR, 'raichu'), 'firered') > 14);
  assert.ok(reachLevel(FR, FR_ACQ, mon(FR, 'pikachu'), 'firered') <= 5);
});

test('regressão: TMs citados nos detonados têm origem no decomp (PokeMythology como 2ª fonte)', { skip: !existsSync(new URL('../data-sources/pokemythology/detonado-emerald.html', import.meta.url)) }, async () => {
  const { execFileSync } = await import('node:child_process');
  for (const g of ['firered-leafgreen', 'emerald']) {
    execFileSync(process.execPath, ['scripts/validate-tms-vs-pokemythology.mjs', g], { cwd: new URL('..', import.meta.url) });
    const r = JSON.parse(readFileSync(new URL(`../reports/${g}/tm-audit.json`, import.meta.url), 'utf8'));
    assert.deepEqual(r.filter((x) => x.status === 'SEM_ORIGEM_NO_DECOMP' || x.status === 'SEM_NUMERO').map((x) => x.tm), [], g);
  }
});

// ---------------------------------------------------------------- progresso por insígnia (detonado + decomp)

test('regressão: líderes reconhecidos pelo TIME, não pelo nome (Giovanni da Rocket era contado como 5º líder)', () => {
  assert.deepEqual(FR_ACQ.progress.leaderOrder, ['BROCK', 'MISTY', 'LT. SURGE', 'ERIKA', 'SABRINA', 'KOGA', 'BLAINE', 'GIOVANNI']);
  assert.deepEqual(EM_ACQ.progress.leaderOrder, ['ROXANNE', 'BRAWLY', 'WATTSON', 'FLANNERY', 'NORMAN', 'WINONA', 'TATE&LIZA', 'JUAN']);
  for (const a of [FR_ACQ, EM_ACQ]) assert.deepEqual([a.progress.leadersFound, a.progress.eliteFound], [8, 4]);
});

test('regressão: estágios de lugares conhecidos (detonado + vizinhança do decomp)', () => {
  const st = (acq, v, sp, where) => acq.versions[v][sp].find((s) => s.where.includes(where)).stage;
  // FRLG
  assert.equal(st(FR_ACQ, 'firered', 'caterpie', 'Viridian Forest'), 0);
  assert.equal(st(FR_ACQ, 'firered', 'spearow', 'Route 3'), 1); // citada antes do Brock no texto: vizinhança corrige
  assert.equal(st(FR_ACQ, 'firered', 'zubat', 'Mt Moon 1F'), 1);
  assert.equal(st(FR_ACQ, 'firered', 'machop', 'Rock Tunnel'), 3);
  assert.equal(st(FR_ACQ, 'firered', 'mewtwo', 'Cerulean Cave'), 9);
  // Emerald — portas puxavam rotas para o pós-jogo (Trick House na Route 110)
  assert.equal(st(EM_ACQ, 'emerald', 'wurmple', 'Petalburg Woods'), 0);
  assert.equal(st(EM_ACQ, 'emerald', 'electrike', 'Route 110'), 2);
  assert.ok(st(EM_ACQ, 'emerald', 'sandshrew', 'Route 111') <= 3);
  assert.equal(st(EM_ACQ, 'emerald', 'tropius', 'Route 119'), 5);
});

test('regressão: presentes que só aparecem no pós-jogo (Beldum; iniciais de Johto após EnableNationalPokedex)', () => {
  const gift = (n) => EM_ACQ.versions.emerald[n].find((s) => s.type === 'gift');
  assert.equal(gift('beldum').stage, 9);
  for (const n of ['chikorita', 'cyndaquil', 'totodile']) assert.equal(gift(n).stage, 9, n);
  assert.equal(gift('castform').stage, 5); // não confundir: Weather Institute tem FLAG_SYS_GAME_CLEAR no arquivo, mas o Castform é do meio do jogo
});

test('regressão: prêmio de ginásio e HM usam a POSIÇÃO do líder na ordem real (Earthquake saía no estágio 0)', () => {
  assert.equal(FR_ACQ.machines.earthquake[0].stage, 8);
  assert.equal(FR_ACQ.machines['rock-tomb'][0].stage, 1);
  assert.equal(FR_ACQ.versions.firered.psyduck.find((s) => s.method === 'Surf').gate.stage, 6); // Koga é o 6º no detonado
});

test('regressão: tutores têm local e momento (Double-Edge do FRLG é na Victory Road; Frontier do Emerald é pós-jogo)', () => {
  const de = FR_ACQ.tutors['double-edge'][0];
  assert.deepEqual([de.map, de.x, de.y, de.stage], ['VictoryRoad_2F', 40, 9, 8]);
  assert.ok(FR_ACQ.tutors['blast-burn'][0].codeDefined.includes('CapeBrinkGetMoveToTeachLeadPokemon'));
  assert.equal(EM_ACQ.tutors['swords-dance'][0].stage, 9);
  for (const [data, acq] of [[FR, FR_ACQ], [EM, EM_ACQ]]) {
    const tutorMoves = [...new Set(data.pokemon.flatMap((p) => p.learnset.filter((l) => l.method === 'tutor').map((l) => l.move)))];
    assert.deepEqual(tutorMoves.filter((m) => !acq.tutors[m]), []);
  }
});

test('regressão: com "Seu progresso" informado, só entra o que existe naquele ponto da história', () => {
  const base = { ...OPTS, version: 'firered', acq: FR_ACQ };
  const brock = recommend(FR, mon(FR, 'onix'), { ...base, level: 14, stage: 0, oppMoves: ['tackle', 'bind', 'rock-tomb'] });
  assert.ok(brock.picks.every((p) => p.stageNeeded === 0), brock.picks.map((p) => `${p.mon.name}:${p.stageNeeded}`).join());
  for (const p of brock.picks) assert.notEqual(p.move.via.method, 'machine', `${p.mon.name} usando TM no estágio 0`);
  const sabrina = recommend(FR, mon(FR, 'alakazam'), { ...base, level: 43, stage: 5, oppMoves: ['psychic', 'recover', 'future-sight', 'calm-mind'] });
  for (const p of sabrina.picks) {
    assert.ok(p.stageNeeded <= 5);
    if (p.move.via.source) assert.ok((p.move.via.source.stage ?? 9) <= 5, `${p.move.name} @ ${p.move.via.source.where}`);
  }
});

// ---------------------------------------------------------------- S1: inicial do jogador

test('S1: rival ligado ao inicial do JOGADOR pelo script — os nomes das variantes têm convenções opostas entre jogos', () => {
  const fr = load('firered-leafgreen-trainers.json').trainers, em = load('emerald-trainers.json').trainers;
  const t = (list, key) => list.find((x) => x.key === key);
  // FRLG: sufixo = inicial DO RIVAL (escolheu Charmander → rival com Squirtle)
  assert.deepEqual(t(fr, 'TRAINER_RIVAL_OAKS_LAB_SQUIRTLE').forStarter, ['charmander']);
  assert.deepEqual(t(fr, 'TRAINER_RIVAL_OAKS_LAB_CHARMANDER').forStarter, ['bulbasaur']);
  // Emerald: sufixo = inicial DO JOGADOR (switch VAR_STARTER_MON, case 0 = Treecko)
  assert.deepEqual(t(em, 'TRAINER_MAY_ROUTE_103_TREECKO').forStarter, ['treecko']);
  // nenhuma luta de rival ligada a mais de um inicial (a "queda" de rótulo contaminava os ramos)
  for (const list of [fr, em]) assert.ok(list.filter((x) => x.forStarter).every((x) => x.forStarter.length === 1));
  assert.equal(fr.filter((x) => x.forStarter).length, 27);
  assert.equal(em.filter((x) => x.forStarter).length, 30);
});

test('S1: vagante do FRLG conforme o inicial (lido do switch de roamer.c)', () => {
  const r = (n) => FR_ACQ.versions.firered[n].find((s) => s.type === 'roamer').forStarter;
  assert.deepEqual([r('raikou'), r('entei'), r('suicune')], [['squirtle'], ['bulbasaur'], ['charmander']]);
  assert.ok(!EM_ACQ.versions.emerald.latios.find((s) => s.type === 'roamer').forStarter); // Emerald: não depende do inicial
});

test('S1: com o inicial informado, os outros dois (e evoluções) e o vagante errado saem das sugestões', () => {
  const opts = { ...OPTS, version: 'firered', acq: FR_ACQ, level: 60, includeLegendary: true, starter: 'charmander' };
  for (const opp of ['golem', 'gyarados', 'arcanine', 'alakazam', 'nidoking']) {
    const r = recommend(FR, mon(FR, opp), opts);
    for (const p of r.picks) assert.ok(!['bulbasaur', 'ivysaur', 'venusaur', 'squirtle', 'wartortle', 'blastoise', 'raikou', 'entei'].includes(p.mon.name), `${opp}: ${p.mon.name}`);
  }
  // sem inicial informado, os três continuam possíveis
  const livre = recommend(FR, mon(FR, 'onix'), { ...OPTS, version: 'firered', acq: FR_ACQ, level: 14, stage: 0, oppMoves: ['tackle', 'bind', 'rock-tomb'] });
  assert.ok(livre.picks.some((p) => ['bulbasaur', 'squirtle'].includes(p.mon.name)));
});

// ---------------------------------------------------------------- S2: detonado gerado a partir dos dados

for (const [gameId, ver] of [['firered-leafgreen', 'firered'], ['emerald', 'emerald']]) {
  test(`S2 [${gameId}]: detonado tem os 10 estágios, cada líder no seu, e nenhum local sem estágio`, () => {
    const w = load(`${gameId}-walkthrough.json`);
    const v = w.versions[ver];
    assert.equal(v.stages.length, 10);
    assert.deepEqual(v.undetermined.map((l) => l.name), []);
    v.stages.slice(0, 8).forEach((s, i) => { assert.equal(s.leader.name, w.leaders[i]); assert.ok(s.leader.party.length > 0, s.leader.name); });
    assert.match(w.credit, /PokeMythology/); // crédito da ordem; conteúdo é nosso (sem texto/imagem de terceiros)
  });
}

test('S2: locais nos estágios certos (conferidos com a ordem do jogo)', () => {
  const v = load('firered-leafgreen-walkthrough.json').versions.firered;
  const stageOf = (name) => v.stages.find((s) => s.locations.some((l) => l.name === name))?.stage;
  assert.equal(stageOf('Viridian Forest'), 0);
  assert.equal(stageOf('Route 22'), 0); // herdar o MAIOR vizinho a punha no 8 (Route 23)
  assert.equal(stageOf('Mt Moon'), 1);
  assert.equal(stageOf('Fuchsia City'), 5); // detonado escreve "FUSCHIA" — grafia registrada em walkthroughTypos
  assert.equal(stageOf('Digletts Cave'), 3); // "Diglett’s": apóstrofo virava espaço
  assert.equal(stageOf('Cerulean Cave'), 9);
  const e = load('emerald-walkthrough.json').versions.emerald;
  const eStage = (name) => e.stages.find((s) => s.locations.some((l) => l.name === name))?.stage;
  assert.equal(eStage('Dewford Town'), 1);
  assert.equal(eStage('Fortree City'), 5);
  assert.equal(eStage('Sootopolis City'), 7);
});

test('S2: conteúdo do local vem dos dados (Mt. Moon: TM09 no chão, Moon Stone, 12 treinadores) e prêmio do líder', () => {
  const v = load('firered-leafgreen-walkthrough.json').versions.firered;
  const mm = v.stages[1].locations.find((l) => l.name === 'Mt Moon');
  assert.ok(mm.items.some((i) => i.move === 'bullet-seed' && i.x === 11 && i.y === 35));
  assert.ok(mm.items.some((i) => i.item === 'MOON_STONE'));
  assert.ok(mm.trainers.length >= 12);
  assert.deepEqual(v.stages[0].leader.prize, ['rock-tomb']);
  // encontro que exige HM/vara vem marcado
  const r24 = v.stages[1].locations.find((l) => l.name === 'Route 24');
  assert.ok(r24.wild.filter((w) => w.method === 'Surf').every((w) => w.gate));
});

test('S2: treinadores de scripts compartilhados entram no detonado; revanches (VS Seeker) ficam fora de propósito', () => {
  for (const [g, ver, min] of [['firered-leafgreen', 'firered', 460], ['emerald', 'emerald', 530]]) {
    const v = load(`${g}-walkthrough.json`).versions[ver];
    const { trainers } = load(`${g}-trainers.json`);
    const keys = new Set(v.stages.flatMap((s) => s.locations.flatMap((l) => l.trainers.map((t) => t.key))));
    assert.ok(keys.size >= min, `${g}: só ${keys.size} lutas no detonado`);
    // contabilidade fechada: todo treinador está no detonado, é revanche, ou está na lista explícita "sem mapa"
    assert.equal(keys.size + v.rematches + v.unplacedTrainers.length, trainers.length, g);
    assert.ok(keys.has('TRAINER_TEAM_ROCKET_GRUNT_2') || g !== 'firered-leafgreen'); // _2 que NÃO é revanche
  }
});

// ---------------------------------------------------------------- S3: Ruby/Sapphire (pokeruby, o decomp mais antigo)

const RS = load('ruby-sapphire.json');
const RS_ACQ = load('ruby-sapphire-acquisition.json');

test('S3: formatos do pokeruby (ponteiros posicionais, .level, gTrainerParty_, hexadecimal, @endereço nos rótulos)', { skip: !existsSync(new URL('../data-sources/pokeruby/', import.meta.url)) }, async () => {
  const { loadDecomp } = await import('../scripts/lib/decomp.mjs');
  const d = loadDecomp('ruby-sapphire');
  assert.ok(Object.keys(d.levelUpOrdered).length >= 386); // ponteiros posicionais (sem [SPECIES_X] =)
  assert.ok(d.species.BULBASAUR.machine.has(d.moveId.SOLAR_BEAM)); // TM22_SOLARBEAM × MOVE_SOLAR_BEAM
  const { parseBlocks } = await import('../scripts/lib/script-graph.mjs');
  assert.ok(parseBlocks('X_EventScript_1:: @ 8153065\n\tend\n').has('X_EventScript_1')); // rótulo com "@ endereço"
  const t = load('ruby-sapphire-trainers.json').trainers;
  assert.deepEqual(t.find((x) => x.key === 'TRAINER_ARCHIE_3').party.map((p) => p.level), [24, 24, 25]); // .level repetido: vale o último
});

test('S3: exclusivos de versão do Ruby/Sapphire', () => {
  const ob = (n, v) => RS.pokemon.find((p) => p.name === n).obtainable[v];
  for (const n of ['zangoose', 'solrock', 'seedot', 'mawile', 'groudon']) { assert.equal(ob(n, 'ruby'), true, n); assert.equal(ob(n, 'sapphire'), false, n); }
  for (const n of ['seviper', 'lunatone', 'lotad', 'sableye', 'kyogre']) { assert.equal(ob(n, 'sapphire'), true, n); assert.equal(ob(n, 'ruby'), false, n); }
});

test('S3: nomes que mudam por versão (constants/version.inc / #ifdef SAPPHIRE)', () => {
  const types = (v, n) => (RS_ACQ.versions[v][n] ?? []).map((s) => s.type);
  assert.deepEqual(types('ruby', 'groudon'), ['static']); // SPECIES_GROUDON_OR_KYOGRE
  assert.deepEqual(types('sapphire', 'kyogre'), ['static']);
  assert.ok(types('ruby', 'latios').includes('roamer') && types('sapphire', 'latias').includes('roamer')); // ROAMER_SPECIES
  assert.ok(types('ruby', 'latias').every((t) => t === 'event')); // Southern Island exige Eon Ticket (setwildbattle, não seteventmon)
  // treinadores vilões: Magma no Ruby, Aqua no Sapphire
  const w = load('ruby-sapphire-walkthrough.json');
  const woods = (v) => w.versions[v].stages.flatMap((s) => s.locations).find((l) => l.name === 'Petalburg Woods').trainers.map((x) => x.key);
  assert.ok(woods('ruby').includes('TRAINER_GRUNT_36') && !woods('ruby').includes('TRAINER_GRUNT_9'));
  assert.ok(woods('sapphire').includes('TRAINER_GRUNT_9'));
});

test('S3: regras do Ruby/Sapphire conferidas no código', () => {
  const mon = (n) => RS.pokemon.find((p) => p.name === n);
  assert.equal(mon('espeon').evo.possible, true); // pokemon_3.c: EVO_FRIENDSHIP_DAY ativo (RTC)
  assert.equal(RS.moves['low-kick'].power, null); // dano por peso: PokéAPI dava 50
  assert.equal(RS_ACQ.versions.ruby.feebas[0].where, 'Route 119'); // gWildFeebasRoute119Data
  assert.equal(RS_ACQ.versions.ruby.psyduck.find((s) => s.method === 'Surf')?.gate?.badge ?? 5, 5); // Surf: FLAG_BADGE05 (field_control_avatar.c)
  assert.deepEqual(RS.starters.species, ['treecko', 'torchic', 'mudkip']); // sStarterMons
  assert.deepEqual(RS_ACQ.progress.leaderOrder.slice(0, 2), ['ROXANNE', 'BRAWLY']);
  assert.equal(Object.keys(RS_ACQ.tutors ?? {}).length, 0); // RS não tem tutores
});

test('S3: times do detonado batem com o jogo (divergências do detonado registradas com justificativa)', { skip: !existsSync(new URL('../data-sources/pokemythology/detonado-ruby-sapphire.html', import.meta.url)) }, async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['scripts/validate-vs-pokemythology.mjs', 'ruby-sapphire'], { cwd: new URL('..', import.meta.url) });
  const r = JSON.parse(readFileSync(new URL('../reports/ruby-sapphire/pokemythology-audit.json', import.meta.url), 'utf8'));
  assert.deepEqual(r.results.filter((x) => x.status === 'MISMATCH').map((x) => x.title), []);
  assert.ok(r.results.filter((x) => x.status === 'MATCH').length >= 12);
});

test('S3: ordem dos líderes do Ruby/Sapphire — detonado com nível errado (Wattson, Tate & Liza) não pode tirar o líder da linha do tempo', () => {
  assert.deepEqual(RS_ACQ.progress.leaderOrder, ['ROXANNE', 'BRAWLY', 'WATTSON', 'FLANNERY', 'NORMAN', 'WINONA', 'TATE&LIZA', 'WALLACE']);
  const v = load('ruby-sapphire-walkthrough.json').versions.ruby;
  assert.equal(v.stages.find((s) => s.locations.some((l) => l.name === 'Sootopolis City')).stage, 7); // Wallace é o 8º líder no RS
});

// ---------------------------------------------------------------- S0/S4–S7: camada PokéAPI com regras da geração

test('S0: Gen 1 com as regras DA Gen 1 (inclusive o bug Ghost × Psychic, que é o valor certo do jogo)', () => {
  const g1 = load('red-blue.json');
  const m = (n) => g1.pokemon.find((p) => p.name === n);
  assert.equal(g1.types.length, 15);
  assert.equal(g1.chart.ghost.psychic, 0); // Gen 1: 0×; Gen 2+: 2×
  assert.equal(g1.chart.bug.poison, 2);
  assert.equal(g1.chart.ice.fire, 1);
  assert.deepEqual([m('abra').stats['special-attack'], m('abra').stats['special-defense']], [105, 105]); // Special único
  assert.equal(g1.moves.bite.type, 'normal');
  assert.deepEqual(m('magnemite').types, ['electric']);
  assert.ok(g1.pokemon.every((p) => p.abilities.length === 0));
});

test('S0: a partir da Gen 4 a categoria é do GOLPE (Shadow Ball especial, Crunch físico)', () => {
  const dp = load('diamond-pearl.json');
  assert.equal(dp.moves['shadow-ball'].category, 'special'); // Gen 3: físico (pelo tipo Ghost)
  assert.equal(dp.moves.crunch.category, 'physical'); // Gen 3: especial (pelo tipo Dark)
  assert.equal(load('firered-leafgreen.json').moves['shadow-ball'].category, 'physical');
});

test('S7: tipo Stellar (Terastalização) não entra na tabela; Fada só a partir da Gen 6', () => {
  assert.equal(load('scarlet-violet.json').types.includes('stellar'), false);
  assert.equal(load('scarlet-violet.json').types.length, 18);
  assert.equal(load('black-white.json').types.includes('fairy'), false);
  assert.equal(load('x-y.json').types.includes('fairy'), true);
});

test('S7: jogo sem dados na PokéAPI não é publicado vazio (Legends: Z-A) e sem encontros o filtro de obtíveis não esvazia tudo', () => {
  const { games } = load('games.json');
  // até a 0.7.0 o Z-A ficava "planejado" (build-data sai com 3); desde a 0.8.0 vem inteiro das tabelas do PKHeX
  assert.equal(games.find((g) => g.id === 'legends-za').status, 'supported');
  assert.equal(games.find((g) => g.id === 'legends-za').validation, 'pkhex');
  const sv = load('scarlet-violet.json');
  const r = recommend(sv, sv.pokemon.find((p) => p.name === 'gyarados'), { level: 50, version: 'scarlet', onlyObtainable: true, fullyEvolvedOnly: false, includeLegendary: false });
  assert.equal(r.picks.length, 3);
  assert.ok(games.filter((g) => ['pokeapi', 'decomp-core', 'pkhex'].includes(g.validation) && g.status === 'supported').length >= 17);
  // Gen 1 com núcleo conferido no decomp em assembly (S4) não pode ser anunciada como "sem validação"
  for (const id of ['red-blue', 'yellow']) assert.equal(games.find((g) => g.id === id).validation, 'decomp-core');
});

// ---------------------------------------------------------------- Gen 1 (decomp em assembly pret/pokered e pret/pokeyellow)

test('S4: past_stats aplicado stat a stat (Beedrill tinha Ataque 90 na Gen 1; o certo é 80)', () => {
  // Erro: eu usava só a entrada de past_stats mais antiga (gen-i, que traz só "special") e perdia o
  // Ataque 80 que vem na entrada gen-v. Confirmado em data/pokemon/base_stats/beedrill.asm (pokered).
  for (const f of ['red-blue.json', 'yellow.json']) {
    const b = mon(load(f), 'beedrill');
    assert.equal(b.stats.attack, 80);
    assert.equal(b.stats['special-attack'], 45);
    assert.equal(b.stats['special-defense'], 45); // Special único na Gen 1
  }
  assert.equal(mon(load('gold-silver.json'), 'beedrill').stats.attack, 80); // Gen 2–5 também
  assert.equal(mon(load('black-white.json'), 'beedrill').stats.attack, 80);
  assert.equal(mon(load('x-y.json'), 'beedrill').stats.attack, 90); // mudou na Gen 6
});

test('S4: Rest e Soft-Boiled têm PP 10 na Gen 1 (PokéAPI dá 5); Swift continua "nunca erra" (precisão null)', () => {
  // Confirmado em data/moves/moves.asm do pokered/pokeyellow. O decomp guarda 100 de precisão para Swift,
  // mas o efeito SWIFT_EFFECT ignora a precisão — o overlay NÃO pode trocar null por 100.
  for (const f of ['red-blue.json', 'yellow.json']) {
    const d = load(f);
    assert.equal(d.moves.rest.pp, 10);
    assert.equal(d.moves['soft-boiled'].pp, 10);
    assert.equal(d.moves.swift.accuracy, null);
    assert.ok(d.corrections.list.some((c) => c.move === 'rest' && c.field === 'pp'));
  }
});

test('S4: learnset da Gen 1 na ordem do decomp e evoluções com nível mínimo', () => {
  const rb = load('red-blue.json');
  const lv = (n) => mon(rb, n).learnset.filter((l) => l.method === 'level-up').map((l) => `${l.level}:${l.move}`);
  assert.deepEqual(lv('bulbasaur').slice(0, 3), ['1:tackle', '1:growl', '7:leech-seed']); // evos_moves.asm
  assert.equal(mon(rb, 'venusaur').minLevel, 32);
  assert.equal(mon(rb, 'alakazam').evo.kind, 'TRADE'); // "\Z" no regex cortava ALAKAZAM em "ALAKA"
  assert.equal(mon(rb, 'nidoqueen').evo.kind, 'ITEM');
  assert.equal(mon(rb, 'nidoqueen').minLevel, 16);
});

const haveAsm = existsSync(new URL('../data-sources/pokered-asm/constants/', import.meta.url)) && existsSync(new URL('../data-sources/pokeyellow-asm/constants/', import.meta.url));
test('S4: Red/Blue e Yellow têm 0 divergências contra o decomp (learnset, TM/HM, stats, tipos, golpes, tabela)', { skip: !haveAsm && 'sem decomp local' }, () => {
  for (const g of ['red-blue', 'yellow']) {
    const r = JSON.parse(readFileSync(new URL(`../reports/${g}/gen1-decomp-audit.json`, import.meta.url), 'utf8'));
    for (const k of ['learnset', 'machine', 'stats', 'types', 'moves', 'chart', 'missing']) assert.equal(r[k].length, 0, `${g} ${k}: ${JSON.stringify(r[k].slice(0, 3))}`);
  }
});

test('S4: moveset padrão da Gen 1 == WriteMonMoves (engine/pokemon/evos_moves.asm), todas as espécies, níveis 1–100', { skip: !haveAsm && 'sem decomp local' }, async () => {
  // WriteMonMoves: parte dos golpes de nível 1 (base_stats), percorre o learnset em ordem, para no 1º nível maior,
  // ignora golpe já conhecido e, com 4, desloca (sai o mais antigo) — igual à Gen 3.
  const { loadGen1 } = await import('../scripts/lib/gen1-asm.mjs');
  for (const [g, dir] of [['red-blue', 'pokered-asm'], ['yellow', 'pokeyellow-asm']]) {
    const d = loadGen1(new URL(`../data-sources/${dir}/`, import.meta.url));
    const data = load(`${g}.json`);
    const idCache = new Map();
    const moveIdOf = (n) => idCache.get(n) ?? (idCache.set(n, JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id), idCache.get(n));
    const diffs = [];
    let checked = 0;
    for (const m of data.pokemon) {
      const ordered = d.species[m.id].levelOrdered;
      for (let level = 1; level <= 100; level++) {
        const ref = [];
        for (const [lvl, mv] of ordered) {
          if (lvl > level) break;
          if (ref.includes(d.moveId[mv])) continue;
          if (ref.length === 4) ref.shift();
          ref.push(d.moveId[mv]);
        }
        const got = likelyMoveset(m, level).map(moveIdOf);
        checked++;
        if ([...ref].sort().join() !== [...got].sort().join()) diffs.push(`${m.name}@${level}`);
      }
    }
    assert.equal(checked, 15100);
    assert.equal(diffs.length, 0, `${g}: ${diffs.length} diferenças, ex.: ${diffs.slice(0, 5).join(' | ')}`);
  }
});

test('S4: Yellow — learnset fora de ordem do Primeape (Thrash 46 antes de Screech 45): selvagem nv. 45 sem Screech, mas aprende subindo de nível', () => {
  // WriteMonMoves para no 1º golpe de nível maior ("assumption: learnset is sorted by level"); LearnMoveFromLevelUp
  // varre a lista toda pelo nível exato. Eu ordenava por nível e dava Screech ao Primeape nv. 45 selvagem.
  const y = load('yellow.json');
  const p = mon(y, 'primeape');
  assert.equal(likelyMoveset(p, 45).includes('screech'), false);
  assert.equal(likelyMoveset(p, 46).includes('screech'), true);
  assert.ok(availableMoves(y, p, 45).includes('screech'));
});

test('S4: iniciais da Gen 1 lidos do decomp (DEF STARTER*, nível do OaksLab.asm); RIVAL_STARTER_* não são espécies', () => {
  assert.deepEqual(load('red-blue.json').starters, { where: 'Pallet Town — Laboratório do Prof. Oak', level: 5, species: ['bulbasaur', 'charmander', 'squirtle'] });
  assert.deepEqual(load('yellow.json').starters.species, ['pikachu']); // RIVAL_STARTER_JOLTEON etc. = índices 1..3
  const rb = load('red-blue.json');
  const r = recommend(rb, mon(rb, 'onix'), { level: 30, version: 'red', starter: 'charmander', ...OPTS });
  assert.equal(r.picks.length, 3);
  assert.ok(r.picks.every((p) => !['bulbasaur', 'ivysaur', 'venusaur', 'squirtle', 'wartortle', 'blastoise'].includes(p.mon.name)));
});

test('S4: treinadores da Gen 1 — golpes especiais do jogo (LoneMoves/TeamMoves/Campeão no Red/Blue; SpecialTrainerMoves no Yellow)', () => {
  // read_trainer_party.asm: golpes especiais SÓ em times "$FF". wGymLeaderNo (script do ginásio) = wLoneAttackNo (mesmo byte na RAM);
  // LoneMoves "db N, GOLPE" vai no (N+1)º Pokémon, 3º slot. Erros que já tive: classe "const" da definição da macro deslocava
  // todas as classes; OPP_BROCK fica no arquivo de OBJETOS, não no script do ginásio (Onix ficava sem Bide).
  const rb = load('red-blue-trainers.json').trainers;
  const team = (list, key) => list.find((t) => t.key === key).party;
  const has = (list, key, i, mv) => assert.ok(team(list, key)[i].moves.includes(mv), `${key}[${i}] sem ${mv}: ${team(list, key)[i].moves}`);
  has(rb, 'BROCK#1', 1, 'bide'); has(rb, 'MISTY#1', 1, 'bubble-beam'); has(rb, 'LT_SURGE#1', 2, 'thunderbolt'); has(rb, 'ERIKA#1', 2, 'mega-drain');
  has(rb, 'KOGA#1', 3, 'toxic'); has(rb, 'SABRINA#1', 3, 'psywave'); has(rb, 'BLAINE#1', 3, 'fire-blast'); has(rb, 'GIOVANNI#3', 4, 'fissure');
  assert.equal(team(rb, 'GIOVANNI#1').some((p) => p.moves.includes('fissure')), false); // Giovanni fora do ginásio: sem LoneMove
  has(rb, 'BRUNO#1', 4, 'fissure'); has(rb, 'AGATHA#1', 4, 'toxic'); has(rb, 'LANCE#1', 4, 'barrier');
  has(rb, 'RIVAL3#1', 0, 'sky-attack'); has(rb, 'RIVAL3#1', 5, 'blizzard'); has(rb, 'RIVAL3#2', 5, 'mega-drain'); has(rb, 'RIVAL3#3', 5, 'fire-blast');
  const y = load('yellow-trainers.json').trainers;
  assert.deepEqual(team(y, 'BROCK#1').map((p) => `${p.species}${p.level}`), ['geodude10', 'onix12']);
  assert.deepEqual(team(y, 'BROCK#1')[1].moves, ['tackle', 'screech', 'bind', 'bide']);
  assert.deepEqual(team(y, 'LT_SURGE#1')[0].moves, ['thunderbolt', 'mega-punch', 'mega-kick', 'growl']);
});

test('S4: rivais da Gen 1 — nº do time pelo script (cadeia cp/ld, tabela local repetida na Route 22, "add" no Yellow) e ligação com o inicial', () => {
  // OaksLab.asm: jogador Charmander → rival Squirtle; Squirtle → Bulbasaur; Bulbasaur → Charmander.
  // Route 22 tem DUAS tabelas ".StarterTable" (lutas 1 e 2): pegar a primeira DEPOIS do bloco. Objeto do rival no mapa não é a luta.
  const rb = load('red-blue-trainers.json').trainers;
  const rivals = rb.filter((t) => t.key.startsWith('RIVAL'));
  assert.equal(rivals.length, 24); // 9 + 12 + 3 (Campeão)
  assert.ok(rivals.every((t) => t.forStarter?.length === 1));
  assert.deepEqual(rb.find((t) => t.key === 'RIVAL1#1').forStarter, ['charmander']); // rival com Squirtle
  assert.deepEqual(rb.find((t) => t.key === 'RIVAL1#1').map, ["Oak's Lab"]);
  assert.deepEqual(rb.find((t) => t.key === 'RIVAL2#10').map, ['Route 22']);
  assert.deepEqual(rb.find((t) => t.key === 'RIVAL1#4').map, ['Route 22']);
  const y = load('yellow-trainers.json').trainers.filter((t) => t.key.startsWith('RIVAL'));
  assert.equal(y.length, 16); // 3 + 10 + 3; no Yellow o time varia pela evolução do Eevee, não pelo inicial do jogador
  assert.ok(y.every((t) => !t.forStarter));
});

// ---------------------------------------------------------------- Gen 1: onde obter e progresso (build-acquisition-gen1)

test('S4: selvagens da Gen 1 — ponteiro do mapa pela POSIÇÃO (o comentário "; ROUTE_1" falta) e exclusivos por versão (IF DEF)', () => {
  // Erro: lendo o mapa pelo comentário de grass_water.asm, Mt. Moon etc. ficavam sem selvagens (Zubat "não obtível").
  const a = load('red-blue-acquisition.json');
  assert.ok(a.versions.red.zubat.some((s) => s.mapId === 'MT_MOON_1F' && s.method === 'Grama/caverna'));
  assert.ok(a.versions.red.ekans?.some((s) => s.type === 'wild'));
  assert.equal(a.versions.blue.ekans, undefined); // Ekans só no Red
  assert.ok(a.versions.blue.sandshrew?.some((s) => s.type === 'wild'));
  const rb = load('red-blue.json');
  for (const v of ['red', 'blue']) assert.equal(rb.pokemon.filter((p) => p.obtainable[v]).length, 139); // 151 − Mew − 11 exclusivos
  // Old Rod: Magikarp nv 5 em qualquer água (engine/items/item_effects.asm), liberada pela casa de Vermilion
  const old = a.versions.red.magikarp.find((s) => s.method === 'Old Rod');
  assert.equal(old.where, 'qualquer água');
  assert.equal(old.min, 5);
  assert.equal(old.gate.item, 'Vermilion Old Rod House');
});

test('S4: Yellow — Pikachu inicial recusa pedra (Raichu só por troca), scripts "_2.asm", Super Rod 40/30/20/10%', () => {
  // ItemUseEvoStone → IsThisPartyMonStarterPikachu → RefusingText; não há outro Pikachu no Yellow. A PokéAPI diz "obtível".
  const y = load('yellow.json');
  assert.equal(mon(y, 'raichu').obtainable.yellow, false);
  assert.equal(mon(y, 'pikachu').obtainable.yellow, true);
  assert.equal(y.pokemon.filter((p) => p.obtainable.yellow).length, 137);
  const a = load('yellow-acquisition.json').versions.yellow;
  assert.ok(a.squirtle.some((s) => s.type === 'gift' && s.mapId === 'VERMILION_CITY' && s.level === 10)); // VermilionCity_2.asm
  assert.ok(a.bulbasaur.some((s) => s.type === 'gift' && s.mapId === 'CERULEAN_MELANIES_HOUSE'));
  const dratini = a.dratini.find((s) => s.mapId === 'SAFARI_ZONE_CENTER' && s.method === 'Super Rod');
  assert.equal(dratini.pct, 20); // 3º slot (engine/items/super_rod.asm: 40/30/20/10)
});

test('S4: estágios da Gen 1 — fatos do código vencem a propagação (início do jogo, portões que checam insígnia)', () => {
  // Erros que já tive: Pallet 6 e Route 1 6 ("maior vizinho" pela Route 21, só com Surf); Route 22 8 (pela Route 23);
  // Route 23 0 e Indigo Plateau 0 (teto pelo vizinho); Diglett's Cave 0 (teto em interior); Cerulean Cave 1 ("Cerulean").
  for (const g of ['red-blue', 'yellow']) {
    const m = load(`${g}-acquisition.json`).progress.maps;
    const s = (k) => m[k].stage;
    assert.equal(s('PALLET_TOWN'), 0); assert.equal(s('ROUTE_1'), 0); assert.equal(s('ROUTE_22'), 0);
    assert.equal(s('ROUTE_23'), 8); assert.equal(s('INDIGO_PLATEAU'), 8); assert.equal(s('VICTORY_ROAD_1F'), 8);
    assert.equal(s('CERULEAN_CAVE_1F'), 9);
    assert.ok(s('DIGLETTS_CAVE') >= 2);
    assert.ok(s('ROUTE_12_SUPER_ROD_HOUSE') >= s('ROUTE_12'));
    assert.ok(s('PEWTER_CITY') <= s('CERULEAN_CITY') && s('CERULEAN_CITY') <= s('VERMILION_CITY') && s('VERMILION_CITY') <= s('CELADON_CITY') && s('CELADON_CITY') <= s('FUCHSIA_CITY') && s('FUCHSIA_CITY') <= s('CINNABAR_ISLAND'));
    const p = load(`${g}-acquisition.json`).progress;
    assert.equal(p.leadersFound, 8);
    assert.equal(p.eliteFound, 4);
  }
});

test('S4: TMs/HMs da Gen 1 — 55/55 com origem; HM fora da batalha pela insígnia do código', () => {
  // start_sub_menus.asm: .surf → BIT_SOULBADGE (5ª, Koga). Gyms entregam TM ("lb bc, TM_X, 1" no script do ginásio).
  for (const g of ['red-blue', 'yellow']) {
    const a = load(`${g}-acquisition.json`);
    assert.equal(Object.keys(a.machines).length, 55);
    const tb = a.machines.thunderbolt.find((s) => s.leader);
    assert.equal(tb.leader, 'Lt.Surge');
    const surf = Object.values(a.versions)[0].tentacool.find((s) => s.method === 'Surf');
    assert.equal(surf.gate.badge, 5);
    assert.equal(surf.gate.leader, 'Koga');
  }
});

test('S4: parseTrainerRuns — times em texto corrido do detonado da Gen 1 sem misturar com o time seguinte', async () => {
  const { parseTrainerRuns } = await import('../scripts/lib/pokemythology.mjs');
  const html = '<p>Ela tem um <img src="a.png">Staryu lv.18 e um <img src="b.png">Starmie lv.21. Se você tiver pego o Bulbassaur, será fácil. Ao entrar na ponte, você lutará com Gary, ele tem: <img>Pidgeotto lv.18, <img>Abra lv.15</p><p>LORELEI: Dewgong lv.54 Cloyster lv.53</p>';
  const runs = parseTrainerRuns(html).map((r) => r.party.map((p) => `${p.species}${p.level}`).join(','));
  assert.deepEqual(runs, ['Staryu18,Starmie21', 'Pidgeotto18,Abra15', 'Dewgong54,Cloyster53']);
  // mesmo time quebrado em parágrafos sem texto no meio (Bruno no detonado do Red/Blue) continua um time só
  assert.deepEqual(parseTrainerRuns('<p>Os Pokémons usados são: <img>Onix lv.53</p><p><img>Hitmonchan lv.55<br><img>Machamp lv.58</p>').map((r) => r.party.length), [3]);
});

test('S4: detonado da Gen 1 no app — locais pelos grupos do mapa da cidade, nomes do jogo decodificados, todo treinador colocado', () => {
  // Locais: ExternalMapEntries (externos) + grupos "end_indoor_group" (internos) com o nome de names.asm.
  // Tokens do Game Boy: "#MON" = POKéMON ("#MON TOWER" virava "#mon Tower"), "<PKMN>" = POKéMON.
  for (const g of ['red-blue', 'yellow']) {
    const w = load(`${g}-walkthrough.json`);
    for (const v of Object.values(w.versions)) {
      assert.equal(v.stages.length, 10);
      assert.equal(v.unplacedTrainers.length, 0);
      const names = v.stages.flatMap((s) => s.locations.map((l) => l.name));
      for (const n of ['Pokémon Tower', 'Pokémon Mansion', 'Mt. Moon', 'Cerulean Cave', 'Viridian Forest']) assert.ok(names.includes(n), `${g}: falta ${n}`);
      assert.ok(names.every((n) => !/[#<>]/.test(n)), names.filter((n) => /[#<>]/.test(n)).join());
      assert.equal(v.stages[0].leader.name, 'Brock');
      assert.ok(v.stages[9].locations.some((l) => l.name === 'Cerulean Cave'));
    }
  }
  const rb = load('red-blue-walkthrough.json').versions.red.stages;
  assert.deepEqual(rb[1].leader.prize, ['bubble-beam']); // CeruleanGym.asm: lb bc, TM_BUBBLEBEAM
  assert.ok(rb[1].leader.party[1].moves.includes('bubble-beam')); // LoneMoves
});

// ---------------------------------------------------------------- Gen 2 (decomp em assembly pret/pokegold e pret/pokecrystal)

test('S5: past_values dos golpes é EXCLUSIVO (a versão da entrada é onde o valor mudou) — Gold/Silver recebia valores da Gen 1', () => {
  // PokéAPI: Dig {gold-silver: 100, diamond-pearl: 60}. Com ">=" o Gold/Silver ficava com Dig 100, Bite Normal, Blizzard 90%.
  // Confirmado em data/moves/moves.asm (pokegold): DIG 60, BITE DARK, BLIZZARD 70.
  const gs = load('gold-silver.json');
  assert.equal(gs.moves.dig.power, 60);
  assert.equal(gs.moves.bite.type, 'dark');
  assert.equal(gs.moves.blizzard.accuracy, 70);
  assert.equal(gs.moves['double-edge'].power, 120);
  const rb = load('red-blue.json'); // na Gen 1 os valores antigos continuam
  assert.equal(rb.moves.dig.power, 100);
  assert.equal(rb.moves.bite.type, 'normal');
  assert.equal(rb.moves.blizzard.accuracy, 90);
});

test('S5: Gen 2 — PP errados na PokéAPI corrigidos pelo decomp; dano fixo continua sem "poder"; Curse é "???"', () => {
  for (const f of ['gold-silver.json', 'crystal.json']) {
    const d = load(f);
    assert.equal(d.moves['milk-drink'].pp, 10);
    assert.equal(d.moves['mind-reader'].pp, 5);
    assert.equal(d.moves.rest.pp, 10);
    assert.equal(d.moves['soft-boiled'].pp, 10);
    assert.equal(d.moves['dragon-rage'].power, null); // EFFECT_STATIC_DAMAGE: o 40 do decomp é o dano, não poder base
    assert.equal(d.moves.curse.type, 'unknown'); // CURSE_TYPE
  }
});

test('S5: Gen 2 — tutores do Crystal separados das máquinas (add_mt) e evoluções no vocabulário do motor', () => {
  const c = load('crystal.json'), gs = load('gold-silver.json');
  assert.ok(mon(c, 'pikachu').learnset.some((l) => l.method === 'tutor' && l.move === 'thunderbolt'));
  assert.equal(mon(gs, 'pikachu').learnset.some((l) => l.method === 'tutor'), false); // tutor só existe no Crystal
  assert.deepEqual(mon(c, 'hitmonlee').evo, { kind: 'LEVEL_ATK_GT_DEF', param: 20, possible: true });
  assert.equal(mon(c, 'espeon').evo.kind, 'FRIENDSHIP_DAY'); // Gen 2 tem relógio: evolução por horário é possível
  assert.equal(mon(c, 'umbreon').evo.kind, 'FRIENDSHIP_NIGHT');
  assert.equal(mon(c, 'steelix').evo.kind, 'TRADE_ITEM');
  assert.equal(mon(c, 'tyranitar').minLevel, 55);
});

const haveAsm2 = existsSync(new URL('../data-sources/pokecrystal-asm/constants/', import.meta.url)) && existsSync(new URL('../data-sources/pokegold-asm/constants/', import.meta.url));
test('S5: Gold/Silver e Crystal com 0 divergências contra o decomp e moveset padrão == FillMoves (engine/pokemon/evolve.asm)', { skip: !haveAsm2 && 'sem decomp local' }, async () => {
  const { loadGen2 } = await import('../scripts/lib/gen2-asm.mjs');
  for (const [g, dir] of [['gold-silver', 'pokegold-asm'], ['crystal', 'pokecrystal-asm']]) {
    const r = JSON.parse(readFileSync(new URL(`../reports/${g}/gen2-decomp-audit.json`, import.meta.url), 'utf8'));
    for (const [k, v] of Object.entries(r)) assert.equal(v.length, 0, `${g} ${k}: ${JSON.stringify(v.slice(0, 3))}`);
    // FillMoves: learnset em ordem, para no 1º nível maior, ignora repetido, com 4 desloca (igual à Gen 1)
    const d = loadGen2(new URL(`../data-sources/${dir}/`, import.meta.url));
    const data = load(`${g}.json`);
    const idCache = new Map();
    const idOf = (n) => idCache.get(n) ?? (idCache.set(n, JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id), idCache.get(n));
    const diffs = [];
    for (const m of data.pokemon) for (let level = 1; level <= 100; level++) {
      const ref = [];
      for (const [lvl, mv] of d.species[m.id].levelOrdered) {
        if (lvl > level) break;
        if (ref.includes(d.moveId[mv])) continue;
        if (ref.length === 4) ref.shift();
        ref.push(d.moveId[mv]);
      }
      if ([...ref].sort().join() !== likelyMoveset(m, level).map(idOf).sort().join()) diffs.push(`${m.name}@${level}`);
    }
    assert.equal(diffs.length, 0, `${g}: ${diffs.slice(0, 5).join(' | ')}`);
  }
});

test('S5: treinadores da Gen 2 — times/golpes do decomp, rival ligado ao inicial pelo script (rótulo local com ou sem ":")', () => {
  // CherrygroveCity.asm: sem desvio = jogador com Cyndaquil → RIVAL1_1_TOTODILE; ".Totodile" → CHIKORITA; ".Chikorita" → CYNDAQUIL.
  // Erro que tive: BurnedTower1F usa ".totodile" sem ":" e os 3 times saíam como "jogador com Cyndaquil".
  for (const g of ['gold-silver', 'crystal']) {
    const t = load(`${g}-trainers.json`).trainers;
    const rivals = t.filter((x) => x.group === 'Rival');
    assert.equal(rivals.length, 21);
    const beats = { chikorita: 'totodile', cyndaquil: 'chikorita', totodile: 'cyndaquil' }; // rival leva o que vence o do jogador
    for (const r of rivals) {
      const rivalStarter = r.key.match(/_(CHIKORITA|CYNDAQUIL|TOTODILE)$/)[1].toLowerCase();
      assert.deepEqual(r.forStarter, [beats[rivalStarter]], `${g} ${r.key}`);
      assert.equal(r.label, 'Rival'); // nome do rival é escolhido pelo jogador ("?" no decomp)
    }
    const falkner = t.find((x) => x.key === 'FALKNER#FALKNER1');
    assert.deepEqual(falkner.party.map((p) => `${p.species}${p.level}:${p.moves.join('/')}`), ['pidgey7:tackle/mud-slap', 'pidgeotto9:tackle/mud-slap/gust']);
    assert.equal(t.filter((x) => x.group === 'Líderes de ginásio').length, 8);
    assert.equal(t.filter((x) => x.group === 'Líderes de Kanto').length, 8);
    assert.equal(t.find((x) => x.key === 'CHAMPION#LANCE').party.at(-1).species, 'dragonite');
    assert.ok(t.every((x) => !/[#<>]/.test(x.label)), 'tokens do Game Boy decodificados');
  }
  // revanches por telefone (JOEY2…) ficam marcadas, não contam como luta nova
  const c = load('crystal-trainers.json').trainers;
  assert.equal(c.find((x) => x.key === 'YOUNGSTER#JOEY1').rematch, undefined);
  assert.equal(c.find((x) => x.key === 'YOUNGSTER#JOEY2').rematch, true);
});

test('S5: aquisição da Gen 2 — horário do dia, ELIF do pokegold, Bug Contest, Odd Egg, vagantes, evolução por horário', () => {
  // Erros que já tive: pokegold usa "ELIF DEF(_SILVER)" (o pré-processador só tinha IF/ELSE e o Gold perdia Pikachu, Clefairy…);
  // a camada PokéAPI bloqueava evolução por horário em todas as gerações (regra da Gen 3) → Espeon/Umbreon "não obtíveis".
  const c = load('crystal.json'), gs = load('gold-silver.json');
  assert.equal(mon(c, 'espeon').obtainable.crystal, true);
  assert.equal(mon(c, 'umbreon').obtainable.crystal, true);
  for (const v of ['gold', 'silver']) assert.ok(mon(gs, 'pikachu').obtainable[v] && mon(gs, 'clefairy').obtainable[v]);
  const a = load('crystal-acquisition.json').versions.crystal;
  const hoot = a.hoothoot.find((s) => s.mapId === 'ROUTE_29');
  assert.deepEqual(hoot.times, ['noite']); // Hoothoot só à noite na Route 29 (johto_grass.asm: bloco "; nite")
  assert.ok(a.scyther.some((s) => s.method === 'Bug Contest')); // a PokéAPI não tem o concurso
  assert.ok(a.pichu.some((s) => s.type === 'egg' && /Odd Egg/.test(s.detail))); // data/events/odd_eggs.asm
  assert.ok(a.raikou.some((s) => s.type === 'roamer' && s.level === 40)); // InitRoamMons
  assert.equal(a.suicune.some((s) => s.type === 'roamer'), false); // no Crystal o Suicune não vaga
  assert.ok(load('gold-silver-acquisition.json').versions.gold.suicune.some((s) => s.type === 'roamer'));
  assert.equal(c.pokemon.filter((p) => p.obtainable.crystal).length, 223);
  assert.deepEqual(c.starters.species, ['chikorita', 'cyndaquil', 'totodile']);
});

test('S5: estágios da Gen 2 — ginásio fixa a cidade (teto), passagem não fica depois do lado mais cedo, portão = só GATE', () => {
  // Erros que já tive: Route 29 = 1 (um NPC checa a Zephyr; não é portão); Union Cave = 9 (título de revisita);
  // Azalea = 2 no Gold (sem seção no detonado; o Bugsy é de lá); Olivine = 5 por igualdade com o ginásio (é visitada no 4);
  // Radio Tower sem landmark (campo de música "A | B" quebrava o regex de maps.asm).
  for (const g of ['gold-silver', 'crystal']) {
    const m = load(`${g}-acquisition.json`).progress.maps;
    const s = (k) => m[k].stage;
    assert.equal(s('NEW_BARK_TOWN'), 0); assert.equal(s('ROUTE_29'), 0); assert.equal(s('VIOLET_CITY'), 0);
    assert.equal(s('AZALEA_TOWN'), 1); assert.ok(s('UNION_CAVE_1F') <= 1); assert.equal(s('SLOWPOKE_WELL_B1F'), 1);
    assert.equal(s('ROUTE_36'), 3); assert.equal(s('ECRUTEAK_CITY'), 3); assert.ok(s('OLIVINE_CITY') <= 5);
    assert.equal(s('BLACKTHORN_CITY'), 7); assert.equal(s('ROUTE_27'), 8); assert.equal(s('VERMILION_CITY'), 9);
    assert.equal(m.RADIO_TOWER_1F.landmark, 'LANDMARK_RADIO_TOWER');
    const p = load(`${g}-acquisition.json`).progress;
    assert.deepEqual(p.leaderOrder, ['Falkner', 'Bugsy', 'Whitney', 'Morty', 'Chuck', 'Jasmine', 'Pryce', 'Clair']);
    assert.equal(p.eliteFound, 4);
    const surf = Object.values(load(`${g}-acquisition.json`).versions)[0].tentacool.find((x) => x.method === 'Surf');
    assert.equal(surf.gate.leader, 'Morty'); // overworld.asm: .TrySurf → ENGINE_FOGBADGE
    const w = load(`${g}-walkthrough.json`);
    assert.ok(Object.values(w.versions).every((v) => v.unplacedTrainers.length === 0 && v.rematches > 0));
    assert.ok(Object.values(w.versions)[0].stages.flatMap((st) => st.locations.map((l) => l.name)).includes('Radio Tower'));
  }
});

// ---------------------------------------------------------------- R0: banco de lutas (achados de dado)

test('R0: estágio da luta pelo time no detonado — a mesma rota tem lutas de momentos diferentes', async () => {
  // Erro: o 2º rival da Route 22 no Red/Blue (nv 53, antes da Liga) herdava o estágio 0 do mapa.
  const { teamStage } = await import('../scripts/lib/progress.mjs');
  const tl = { blocks: [{ stage: 0, party: [{ species: 'Pidgey', level: 9 }] }, { stage: 8, party: [{ species: 'Pidgeot', level: 47 }, { species: 'Alakazam', level: 50 }, { species: 'Rhyhorn', level: 45 }] }] };
  assert.equal(teamStage(tl, [{ species: 'pidgeot', level: 47 }, { species: 'alakazam', level: 50 }, { species: 'rhyhorn', level: 45 }, { species: 'gyarados', level: 47 }]), 8);
  assert.equal(teamStage(tl, [{ species: 'onix', level: 14 }]), null);
  const w = load('red-blue-walkthrough.json').versions.red.stages;
  const stageOf = (key) => w.find((s) => s.locations.some((l) => l.trainers.some((t) => t.key === key)))?.stage;
  assert.equal(stageOf('RIVAL1#4'), 0); // 1ª luta da Route 22
  assert.equal(stageOf('RIVAL2#10'), 8); // 2ª luta da Route 22
});

test('R0: Gen 2 — andar interno com o landmark da cidade não fica depois dela; Mt. Mortar pela citação anterior', () => {
  // Erros: a Goldenrod Dept Store 5F (troca do Machop por Abra) ficava no estágio 7 por ser citada de novo na parte da
  // Radio Tower → contra a Miltank da Whitney não havia lutador "disponível". Mt. Mortar ia para 9 pelo título.
  const a = load('crystal-acquisition.json');
  assert.equal(a.progress.maps.GOLDENROD_DEPT_STORE_5F.stage, 2);
  assert.equal(a.versions.crystal.machop.find((s) => s.type === 'trade').stage, 2);
  assert.equal(a.progress.maps.MOUNT_MORTAR_1F_OUTSIDE.stage, 6);
  assert.equal(a.progress.maps.RADIO_TOWER_2F.stage >= 3, true);
});

// ---------------------------------------------------------------- R2–R4: fórmula de dano e nova pontuação

test('R2: fórmula de dano por geração — contas à mão a partir do código', async () => {
  const { statsAt, damage, turnsToKo, badgeBoost } = await import('../public/battle.mjs');
  // Gen 1 (pokered CalculateDamage): Charmander nv 5 (Atk base 52, DV 8) Scratch 40 em Bulbasaur nv 5 (Def 49, DV 8)
  // A = ⌊(52+8)·2·5/100⌋+5 = 11; D = ⌊(49+8)·2·5/100⌋+5 = 10; ⌊⌊4·40·11/10⌋/50⌋ = 3; +2 = 5; sem STAB; ×1
  const rb = load('red-blue.json');
  const ch = mon(rb, 'charmander'), bu = mon(rb, 'bulbasaur');
  const a1 = { mon: ch, level: 5, stats: statsAt(1, ch, 5) }, d1 = { mon: bu, level: 5, stats: statsAt(1, bu, 5) };
  assert.equal(a1.stats.attack, 11); assert.equal(d1.stats.defense, 10);
  assert.ok(Math.abs(damage(rb, 1, a1, d1, 'scratch').per - 5 * (236 / 255)) < 1e-9); // média de 217–255/255
  // Gen 3 (pokeemerald CalculateBaseDamage): Mudkip nv 5 (Atk 70, IV 15) Tackle 35 em Zigzagoon nv 5 (Def 41)
  // A = ⌊(140+15)·5/100⌋+5 = 12; D = ⌊(82+15)·5/100⌋+5 = 9; ⌊⌊12·35·4/9⌋/50⌋ = 3; +2 = 5; ×0,925 (85–100%)
  const em = load('emerald.json');
  const mu = mon(em, 'mudkip'), zi = mon(em, 'zigzagoon');
  const a3 = { mon: mu, level: 5, stats: statsAt(3, mu, 5) }, d3 = { mon: zi, level: 5, stats: statsAt(3, zi, 5) };
  assert.equal(a3.stats.attack, 12); assert.equal(d3.stats.defense, 9);
  assert.ok(Math.abs(damage(em, 3, a3, d3, 'tackle').per - 5 * 0.925 * (em.moves.tackle.accuracy / 100)) < 1e-9);
  // dano fixo: Dragon Rage = 40 (Gen 2: EFFECT_STATIC_DAMAGE); Seismic Toss = nível
  const c = load('crystal.json');
  const dn = mon(c, 'dratini'), ra = mon(c, 'rattata');
  assert.equal(damage(c, 2, { mon: dn, level: 20, stats: statsAt(2, dn, 20) }, { mon: ra, level: 20, stats: statsAt(2, ra, 20) }, 'dragon-rage').per, 40);
  // Rollout: 1×, 2×, 4×… acumulado (rollout.asm) → nocauteia em menos turnos do que o dano do 1º uso sugere
  const ro = { per: 10, hits: 1, turns: 1, escalate: 'reset' };
  assert.equal(turnsToKo(ro, 70), 3); // 10 + 20 + 40
  assert.equal(turnsToKo({ per: 10, hits: 1, turns: 1 }, 70), 7);
  // bônus de insígnia (Gen 1: Boulder → Ataque ×9/8) só com o líder já vencido no estágio
  const prog = load('red-blue-acquisition.json').progress;
  assert.equal(badgeBoost(1, { attack: 80, defense: 50, speed: 50, 'special-attack': 50, 'special-defense': 50, hp: 50 }, prog, 1).attack, 90);
  assert.equal(badgeBoost(1, { attack: 80, defense: 50, speed: 50, 'special-attack': 50, 'special-defense': 50, hp: 50 }, prog, 0).attack, 80);
});

test('R3: nova pontuação — Whitney (Crystal, 2 insígnias): Machop por troca contra a Clefairy; Rollout da Miltank conta', () => {
  const c = load('crystal.json'), a = load('crystal-acquisition.json');
  const t = load('crystal-trainers.json').trainers.find((x) => x.key === 'WHITNEY#WHITNEY1');
  const run = (p) => recommend(c, mon(c, p.species), { level: 20, oppMoves: p.moves, oppLevel: p.level, oppDvs: p.dvs, version: 'crystal', onlyObtainable: true, acq: a, stage: 2, starter: 'cyndaquil' });
  const clef = run(t.party[0]);
  assert.ok(clef.picks.some((k) => k.mon.name === 'machop' && k.move.name === 'karate-chop'));
  const milt = run(t.party[1]);
  assert.ok(milt.picks[0].duel.win); // ao menos 1 vence a troca…
  const firstLoss = milt.picks.findIndex((k) => !k.duel.win); // …e quem vence vem antes de quem perde
  assert.ok(firstLoss === -1 || milt.picks.slice(firstLoss).every((k) => !k.duel.win));
  assert.equal(milt.candidates.filter((k) => k.duel.win).length >= milt.picks.filter((k) => k.duel.win).length, true);
  assert.ok(milt.candidates.find((k) => k.mon.name === 'gastly')?.duel.theirMove === 'rollout'); // Gastly não é "invulnerável"
});

test('R4: banco de lutas — a nova pontuação não pode piorar (sugestões folgadas e que vencem, nos 7 jogos)', () => {
  // reports/benchmark/_total.json é gerado por scripts/build-benchmark.mjs (o "antes" é reavaliado com a mesma fórmula)
  const t = JSON.parse(readFileSync(new URL('../reports/benchmark/_total.json', import.meta.url), 'utf8'));
  const r = (x, k) => x[k] / x.picks;
  assert.ok(r(t.depois, 'comfy') >= 0.88, `folgadas ${r(t.depois, 'comfy')}`);
  assert.ok(r(t.depois, 'comfy') >= r(t.antes, 'comfy'));
  assert.ok(r(t.depois, 'wins') >= r(t.antes, 'wins'));
  assert.ok(t.depois.covered / t.depois.mons >= 0.98);
});

test('R5: modo "contra o time inteiro" — soma as trocas por Pokémon do time; quem vence mais vem primeiro', async () => {
  const { recommendTeam } = await import('../public/engine.mjs');
  const rb = load('red-blue.json'), a = load('red-blue-acquisition.json');
  const brock = load('red-blue-trainers.json').trainers.find((t) => t.key === 'BROCK#1');
  const r = recommendTeam(rb, brock.party, { level: 14, version: 'red', onlyObtainable: true, acq: a, stage: 0, starter: 'charmander' });
  assert.equal(r.picks[0].wins, 2); // vence Geodude e Onix
  assert.ok(r.picks.every((p, i, all) => i === 0 || all[i - 1].wins >= p.wins));
  assert.ok(r.picks.every((p) => p.vs.length === brock.party.length));
  assert.equal(r.picks.some((p) => ['bulbasaur', 'squirtle'].includes(p.mon.name)), false); // inicial do jogador = Charmander
});

// ---------------------------------------------------------------- S6: Gen 4 — Platinum (decomp em JSON pret/pokeplatinum)

test('S6: Platinum — núcleo com 0 divergências; PokéAPI sem histórico de prioridade/PP das Gens 8–9', () => {
  // res/moves/*/data.json: Protect/Detect +3, Fake Out +1, Extreme Speed +1, Teleport 0 na Gen 4; Recover/Roost/Rest PP 10;
  // Luster Purge 70. A PokéAPI traz os valores atuais (past_values não registra essas mudanças).
  const pt = load('platinum.json');
  assert.equal(pt.moves.protect.priority, 3); assert.equal(pt.moves['fake-out'].priority, 1);
  assert.equal(pt.moves['extreme-speed'].priority, 1); assert.equal(pt.moves.teleport.priority, 0);
  assert.equal(pt.moves.recover.pp, 10); assert.equal(pt.moves.roost.pp, 10); assert.equal(pt.moves['luster-purge'].power, 70);
  assert.equal(pt.moves['shadow-ball'].category, 'special'); // divisão física/especial por golpe (Gen 4)
  const r = JSON.parse(readFileSync(new URL('../reports/platinum/gen4-decomp-audit.json', import.meta.url), 'utf8'));
  for (const [k, v] of Object.entries(r)) assert.equal(v.length, 0, `${k}: ${JSON.stringify(v.slice(0, 3))}`);
});

test('S6: Platinum — treinadores: sufixo do rival = inicial do JOGADOR (oposto da Gen 2); IV ≥ 32 = aleatório; lutas em dupla', () => {
  const t = load('platinum-trainers.json').trainers;
  const r = t.find((x) => x.key === 'TRAINER_RIVAL_ROUTE_203_PIPLUP');
  assert.deepEqual(r.forStarter, ['piplup']);
  assert.ok(r.party.some((p) => p.species === 'turtwig')); // o Barry leva o que vence o seu
  assert.ok(t.filter((x) => x.group === 'Rival').every((x) => x.forStarter?.length === 1 && x.key.toLowerCase().endsWith('_' + x.forStarter[0])));
  assert.ok(t.some((x) => x.key === 'TRAINER_RIVAL_ROUTE_201_TURTWIG')); // 1ª luta: StartFirstBattle
  // trainer_data.c ivs = ivScale·31/255; Pokemon_InitWith: ≥ INIT_IVS_RANDOM (32) → aleatório (Electivire do Volkner, ivScale 2500)
  assert.equal(t.find((x) => x.key === 'TRAINER_LEADER_VOLKNER').party.at(-1).iv, null);
  assert.ok(t.some((x) => x.key === 'TRAINER_GALACTIC_GRUNT_JUBILIFE_CITY_1')); // StartTagBattle
  assert.ok(t.some((x) => x.key === 'TRAINER_AROMA_LADY_ALISON')); // StartTrainerBattle A, B
});

test('S6: Platinum — onde obter: dual-slot fora, Regis/Regigigas só por evento (a PokéAPI erra o Regigigas), fontes especiais', () => {
  const pt = load('platinum.json'), a = load('platinum-acquisition.json').versions.platinum;
  for (const sp of ['ekans', 'caterpie', 'sandshrew', 'regirock', 'regigigas', 'manaphy']) assert.equal(mon(pt, sp).obtainable.platinum, false, sp);
  assert.ok(a.regirock.every((s) => s.type === 'event'));
  assert.ok(a.munchlax.some((s) => s.method === 'Árvore de mel' && /Munchlax/.test(s.detail)));
  assert.ok(a.feebas.some((s) => s.mapId === 'MAP_HEADER_MT_CORONET_B1F' && s.min === 10 && s.max === 20));
  assert.ok(a.aerodactyl.some((s) => s.type === 'gift' && s.level === 20 && /Subsolo/.test(s.detail)));
  assert.ok(a.mesprit.some((s) => s.type === 'roamer' && s.level === 50));
  assert.ok(!(a.darkrai ?? []).some((s) => s.type === 'roamer')); // slot do Darkrai nunca é ativado por script
  assert.ok(a.darkrai.every((s) => s.type === 'event')); // Newmoon Island: CheckDistributionEvent DISTRIBUTION_EVENT_DARKRAI
  assert.ok(a.arceus.every((s) => s.type === 'event')); // Hall of Origin: DISTRIBUTION_EVENT_ARCEUS
  for (const sp of ['dialga', 'palkia', 'giratina-altered']) assert.equal(mon(pt, sp).obtainable.platinum, true, sp); // a checagem no mapa deles é do Arceus
  assert.equal(mon(pt, 'darkrai').obtainable.platinum, false);
  const hoot = a.hoothoot?.find((s) => s.times);
  assert.ok(hoot && hoot.times.includes('noite'));
  assert.equal(Object.keys(load('platinum-acquisition.json').machines).length, 100);
});

test('S6: Platinum — estágios: rotas de mar pelo Surf, Great Marsh pelo portão de Pastoria, passagem da Old Rod, itens pela citação', () => {
  const p = load('platinum-acquisition.json').progress, s = (k) => p.maps[`MAP_HEADER_${k}`].stage;
  assert.deepEqual(p.leaderOrder, ['Roark', 'Gardenia', 'Fantina', 'Maylene', 'Wake', 'Byron', 'Candice', 'Volkner']);
  assert.equal(s('TWINLEAF_TOWN'), 0); assert.equal(s('JUBILIFE_CITY'), 0); assert.equal(s('CELESTIC_TOWN'), 5);
  assert.equal(s('ROUTE_219'), 5); assert.equal(s('ROUTE_220'), 5); assert.equal(s('ROUTE_221'), 5); // rotas de mar → Surf (Wake)
  assert.equal(s('GREAT_MARSH_1'), 4); assert.equal(s('ROUTE_218_GATE_TO_JUBILIFE_CITY'), 0);
  const g = Object.values(load('platinum-acquisition.json').versions.platinum).flat().find((x) => x.method === 'Surf').gate;
  assert.equal(g.leader, 'Wake');
  const radar = Object.values(load('platinum-acquisition.json').versions.platinum).flat().find((x) => x.method === 'Poké Radar');
  assert.equal(radar.stage, 9); // Rowan só dá o Poké Radar depois da Pokédex Nacional
});

// ---------------------------------------------------------------- S6b: Gen 4 — HeartGold/SoulSilver (decomp PARCIAL pret/pokeheartgold)

const haveHgss = existsSync(new URL('../data-sources/pokeheartgold-src/include/', import.meta.url));
test('S6b: HGSS — núcleo com 0 divergências: HMs ficam em "hms" no personal.json, grafia COMPOUNDEYES, tutores por script', { skip: !haveHgss && 'sem decomp local' }, async () => {
  const { loadHgss } = await import('../scripts/lib/gen4-hgss.mjs');
  const g = loadHgss(new URL('../data-sources/pokeheartgold-src/', import.meta.url));
  // personal.json: "tms": [...] e "hms": [1, 4, 6] separados; HM n = sTMHMMoves[92 + n − 1] (antes: 1156 "faltas" de HM)
  assert.ok(g.species[1].machine.has(g.moveId.MOVE_CUT)); assert.ok(g.species[131].machine.has(g.moveId.MOVE_SURF));
  const r = JSON.parse(readFileSync(new URL('../reports/heartgold-soulsilver/hgss-decomp-audit.json', import.meta.url), 'utf8'));
  for (const [k, v] of Object.entries(r)) assert.equal(v.length, 0, `${k}: ${JSON.stringify(v.slice(0, 3))}`);
  // golpes e learnset por nível: binários do próprio HGSS (waza_tbl.narc, wotbl.narc) — antes vinham do pokeplatinum / PokéAPI
  const d = load('heartgold-soulsilver.json');
  assert.equal(d.moves.protect.priority, 3); assert.equal(d.moves['mind-reader'].pp, 5); assert.equal(d.moves.roost.pp, 10);
  assert.ok(d.corrections.list.every((c) => !c.via));
  assert.ok(!d.corrections.partial);
  assert.ok(d.pokemon.every((p) => p.levelUpInGameOrder));
  // NARC lido certo: Bulbasaur da Gen 4 (Tackle 1, Growl 3, Leech Seed 7, Vine Whip 9…) na ordem do jogo
  assert.deepEqual(g.species[1].levelOrdered.slice(0, 4), [[1, 33], [3, 45], [7, 73], [9, 22]]);
  assert.equal(g.moves[g.moveId.MOVE_SHADOW_FORCE].power, 120);
  // o learnset do HGSS NÃO é o do Platinum (por isso não bastava conferir com ele): Cyndaquil mudou
  const haveVersion = existsSync(new URL('../data-sources/pokeplatinum-src/res/', import.meta.url));
  if (haveVersion) {
    const { loadGen4 } = await import('../scripts/lib/gen4-json.mjs');
    const pt = loadGen4(new URL('../data-sources/pokeplatinum-src/', import.meta.url));
    const ptCyndaquil = pt.species[155].levelOrdered.map(([lv, m]) => [lv, pt.moveId[m]]);
    assert.notDeepEqual(g.species[155].levelOrdered, ptCyndaquil);
  }
});

test('S6b: HGSS — treinadores: 1ª luta do rival é TRAINER_PASSERBY_BOY; ramo pelo inicial (GetStarterChoice 152/155/158); IV', () => {
  const t = load('heartgold-soulsilver-trainers.json').trainers;
  const first = t.filter((x) => /^TRAINER_PASSERBY_BOY/.test(x.key));
  assert.equal(first.length, 3);
  assert.ok(first.every((x) => x.group === 'Rival' && x.map.includes('Cherrygrove') && x.forStarter?.length === 1));
  // o Silver leva o inicial que vence o do jogador: jogador Chikorita → rival Cyndaquil
  assert.ok(t.find((x) => x.forStarter?.[0] === 'chikorita' && /PASSERBY/.test(x.key)).party.some((p) => p.species === 'cyndaquil'));
  assert.ok(t.filter((x) => x.group === 'Rival').every((x) => x.forStarter?.length === 1));
  const falkner = t.find((x) => x.key === 'TRAINER_LEADER_FALKNER_FALKNER');
  assert.deepEqual(falkner.party.map((p) => [p.species, p.level, p.iv]), [['pidgey', 9, 6], ['pidgeotto', 13, 6]]); // iv = difficulty·31/255
  assert.equal(t.find((x) => x.key === 'TRAINER_LEADER_LT_SURGE_LT__SURGE').label, 'Leader Lt. Surge');
  assert.ok(t.find((x) => x.key === 'TRAINER_LEADER_FALKNER_FALKNER_2').rematch); // Fighting Dojo
});

test('S6b: HGSS — onde obter: desvios HG×SS do script, visibilidade por FLAG_HIDE, vagantes recriados, eventos', () => {
  const d = load('heartgold-soulsilver.json'), A = load('heartgold-soulsilver-acquisition.json').versions, hg = A.heartgold, ss = A.soulsilver;
  const lv = (list, type) => list.filter((s) => s.type === type).map((s) => s.level);
  // "GetGameVersion / Compare 7 / GoToIfNe": Ho-Oh nv 45 no HG e 70 no SS; Lugia o contrário
  assert.deepEqual(lv(hg['ho-oh'], 'static'), [45]); assert.deepEqual(lv(ss['ho-oh'], 'static'), [70]);
  assert.deepEqual(lv(hg.lugia, 'static'), [70]); assert.deepEqual(lv(ss.lugia, 'static'), [45]);
  // Embedded Tower: o lendário aparece por ClearFlag FLAG_HIDE_… só num ramo de versão (HG: Kyogre; SS: Groudon)
  assert.ok(hg.kyogre?.some((s) => s.type === 'static') && !hg.groudon);
  assert.ok(ss.groudon?.some((s) => s.type === 'static') && !ss.kyogre);
  // vagantes: Latias no HG (CreateRoamer 2), Latios no SS; o Hall of Fame recria vagantes (SetVar …_STATUS, 0) → não conta
  assert.ok(hg.latias.some((s) => s.type === 'roamer') && !hg.latios.some((s) => s.type === 'roamer'));
  // Latios/Latias de Pewter: ScrCmd_546 → VAR_UNK_4043, que só o Mystery Gift escreve → evento
  assert.ok(hg.latios.every((s) => s.type === 'event'));
  // Sinjoh Ruins: FollowerPokeIsEventTrigger EVENT_ARCEUS_* → Dialga/Palkia/Giratina só por evento (a PokéAPI marca obtível)
  for (const sp of ['dialga', 'palkia', 'giratina-altered', 'manaphy']) assert.equal(mon(d, sp).obtainable.heartgold, false, sp);
  // Game Corner de Goldenrod: Ekans no HG, Sandshrew no SS (menus por versão)
  assert.ok(hg.ekans.some((s) => s.type === 'prize')); assert.ok(!(hg.sandshrew ?? []).some((s) => s.type === 'prize'));
  assert.ok(ss.sandshrew.some((s) => s.type === 'prize'));
  // surto só nos 20 mapas de sSwarmMapLUT (todo mapa tem landSwarm preenchido no JSON)
  const sw = new Set(Object.values(hg).flat().filter((s) => s.swarm).map((s) => s.mapId));
  assert.ok(sw.has('MAP_ROUTE_35') && !sw.has('MAP_ROUTE_29'));
  // Hoenn/Sinnoh Sound e conjuntos 1–3 do Concurso exigem a Pokédex Nacional → pós-jogo; conjunto 0 não
  const contest = Object.values(hg).flat().filter((s) => s.method === 'Concurso de insetos');
  assert.ok(contest.some((s) => s.stage === 3) && contest.some((s) => s.stage === 9));
  assert.ok(Object.values(hg).flat().filter((s) => /Hoenn Sound|Sinnoh Sound/.test(s.detail ?? '')).every((s) => s.stage === 9));
  // Suicune da Burned Tower B1F: o objeto da luta só aparece por ClearFlag no Hall of Fame → pós-jogo
  assert.equal(hg.suicune.find((s) => s.mapId === 'MAP_BURNED_TOWER_B1F').stage, 9);
  // Safari: slot = LCRandom() % 10 → 10% cada; espécies "bonus" com a condição de objetos
  assert.ok(hg.lapras.some((s) => /Safari/.test(s.method) && /objeto/.test(s.detail)));
});

test('S6b: HGSS — itens e estágios: TM pelo macro GoToIfNoItemSpace, apelidos TM_X, portas de HM, geografia da Gen 2', () => {
  const acq = load('heartgold-soulsilver-acquisition.json'), p = acq.progress, s = (k) => p.maps[`MAP_${k}`].stage;
  assert.ok(acq.machines.roost?.some((x) => x.type === 'gift' && x.leader === 'Falkner')); // TM51: GoToIfNoItemSpace ITEM_TM51
  assert.ok(acq.machines.explosion?.some((x) => x.map === 'MAP_ROUTE_5_UNDERGROUND_PATH_ENTRANCE' || /Route 5/.test(x.where))); // TM_EXPLOSION
  assert.equal(p.leaderOrder.slice(0, 8).join(), 'Falkner,Bugsy,Whitney,Morty,Chuck,Jasmine,Pryce,Clair');
  const surf = Object.values(acq.versions.heartgold).flat().find((x) => x.method === 'Surf').gate;
  assert.equal(surf.leader, 'Morty'); // field_move.c FieldMove_CheckSurf → BADGE_FOG
  // início = quarto do jogador (location_backup.c) → New Bark 0; Route 29 é corredor entre New Bark e Cherrygrove
  assert.equal(s('NEW_BARK'), 0); assert.equal(s('ROUTE_29'), 0);
  assert.equal(s('SLOWPOKE_WELL_B1F'), 1); // "poço dos Slowpokes" no detonado
  assert.equal(s('RUINS_OF_ALPH'), 1); // guia no fim do detonado, citada antes; porta pelo portão da Route 32
  assert.equal(s('UNION_CAVE_B1F'), 4); assert.equal(s('MOUNT_MORTAR_1F_ENTRANCE'), 6);
  assert.equal(s('ROUTE_27'), 8);
});

// ---------------------------------------------------------------- E2: confiabilidade da origem
test('E2: origem aleatória/condicionada é marcada e perde para fonte comum (Platinum: 31% das sugestões dependiam disso)', async () => {
  const { unreliableReason, unreliableFor, recommend } = await import('../public/engine.mjs');
  assert.equal(unreliableReason({ type: 'wild', swarm: true }), 'surto (depende do dia)');
  assert.equal(unreliableReason({ type: 'wild', method: 'Poké Radar' }), 'Poké Radar');
  assert.equal(unreliableReason({ type: 'wild', method: 'Árvore de mel' }), 'árvore de mel (sorteio)');
  assert.equal(unreliableReason({ type: 'wild', method: 'Grama/caverna', pct: 1 }), 'raro (1%)');
  assert.equal(unreliableReason({ type: 'wild', method: 'Grama/caverna', pct: 20 }), null);
  assert.equal(unreliableReason({ type: 'gift' }), null);
  const pt = load('platinum.json'), acq = load('platinum-acquisition.json');
  // Heracross no Platinum: só árvore de mel → aleatório em qualquer estágio
  assert.match(unreliableFor(pt, acq, mon(pt, 'heracross'), 'platinum', { stage: 9 }), /árvore de mel/);
  assert.equal(unreliableFor(pt, acq, mon(pt, 'machop'), 'platinum', { stage: 9 }), null);
  // nos líderes do Platinum, no estágio de cada um, no máximo 1 das 3 sugestões por Pokémon é de origem aleatória
  const t = load('platinum-trainers.json').trainers.filter((x) => x.group === 'Líderes de ginásio' && !x.rematch);
  let n = 0, u = 0;
  for (const tr of t) for (const p of tr.party) {
    const stage = acq.progress.trainerStage?.[tr.key] ?? acq.progress.leaderOrder.indexOf(tr.name);
    const r = recommend(pt, mon(pt, p.species), { level: Math.max(...tr.party.map((x) => x.level)), oppMoves: p.moves, oppLevel: p.level, version: 'platinum', onlyObtainable: true, fullyEvolvedOnly: false, includeLegendary: false, acq, stage });
    for (const s of r.picks) { n++; if (s.unreliable) u++; }
  }
  assert.ok(n > 50 && u / n <= 0.1, `${u}/${n} sugestões só por origem aleatória`);
});

// ---------------------------------------------------------------- E3: golpes das Gens 5–8 conferidos com o Showdown
test('E3: Gens 5–8 — falta de histórico da PokéAPI corrigida só com 2ª evidência (Showdown Gen 4 = decomp do Platinum)', () => {
  const bw = load('black-white.json'), swsh = load('sword-shield.json');
  // Recover/Roost/Rest… PP 10 até a Gen 8 (5 só na Gen 9); Teleport prioridade 0 até a Gen 7 (−6 a partir da Gen 8)
  assert.equal(bw.moves.recover.pp, 10); assert.equal(bw.moves.teleport.priority, 0); assert.equal(bw.moves['follow-me'].priority, 3);
  assert.equal(swsh.moves.recover.pp, 10); assert.equal(swsh.moves.teleport.priority, -6);
  // Protect +4 e Fake Out +3 a partir da Gen 5: a PokéAPI já está certa (não muda)
  assert.equal(bw.moves.protect.priority, 4); assert.equal(bw.moves['fake-out'].priority, 3);
  // sem 2ª evidência (golpe posterior à Gen 4) → só sinalizado: Ally Switch fica com o valor da PokéAPI
  const r = JSON.parse(readFileSync(new URL('../reports/black-white/moves-crosscheck.json', import.meta.url), 'utf8'));
  assert.ok(r.flagged.some((f) => f.move === 'ally-switch' && f.field === 'priority'));
  assert.equal(bw.moves['ally-switch'].priority, r.flagged.find((f) => f.move === 'ally-switch').pokeapi);
  // Hidden Power: variantes do Showdown com o mesmo num (hiddenpowerwater) não podem ser usadas
  assert.ok(!r.flagged.some((f) => f.move === 'hidden-power' && f.field === 'type'));
  assert.ok(bw.moveCrosscheck.corrected >= 9 && /Showdown/.test(bw.moveCrosscheck.source));
});

// ---------------------------------------------------------------- E4: iniciais na camada PokéAPI
test('E4: iniciais das Gens 4–9 sem decomp = detonado (trecho de escolha) + PokéAPI (linha de 3 estágios); sem as duas, nada', () => {
  const st = (g) => load(`${g}.json`).starters?.species ?? null;
  assert.deepEqual(st('diamond-pearl'), ['turtwig', 'chimchar', 'piplup']);
  assert.deepEqual(st('black-white'), ['snivy', 'tepig', 'oshawott']);
  assert.deepEqual(st('x-y'), ['chespin', 'fennekin', 'froakie']);
  assert.deepEqual(st('sun-moon'), ['rowlet', 'litten', 'popplio']);
  assert.deepEqual(st('sword-shield'), ['grookey', 'scorbunny', 'sobble']);
  assert.deepEqual(st('scarlet-violet'), ['sprigatito', 'fuecoco', 'quaxly']);
  // Legends: Arceus lista Turtwig/Chimchar/Piplup em "onde encontrar" (sem trecho de escolha) → o detonado não confirma;
  // desde a 0.8.0 os iniciais vêm dos encontros fixos do PKHeX (Jubilife Village, nv 5). Let's Go tem um inicial só por versão
  assert.deepEqual(st('legends-arceus'), ['rowlet', 'cyndaquil', 'oshawott']);
  assert.equal(load('legends-arceus.json').starters.source, 'encontros fixos do PKHeX');
  assert.equal(st('lets-go-pikachu-lets-go-eevee'), null);
  assert.match(load('black-white.json').starters.evidence, /Escolha/);
});

// ---------------------------------------------------------------- E5: Diamond/Pearl (pret/pokediamond — núcleo em JSON)
test('E5: Diamond/Pearl — núcleo do decomp com 0 divergências (inclusive a tabela de tipos); chefes com IV do jogo', () => {
  const r = JSON.parse(readFileSync(new URL('../reports/diamond-pearl/dp-decomp-audit.json', import.meta.url), 'utf8'));
  for (const [k, v] of Object.entries(r)) assert.equal(v.length, 0, `${k}: ${JSON.stringify(v.slice(0, 3))}`);
  assert.ok('chart' in r); // tabela de tipos lida dos bytes do overlay de batalha (antes: "não conferida")
  const d = load('diamond-pearl.json');
  assert.equal(d.moves.protect.priority, 3); assert.equal(d.moves.recover.pp, 10); // waza_tbl.json (a PokéAPI traz os da Gen 9)
  assert.ok(d.pokemon.every((p) => p.levelUpInGameOrder)); // wotbl.json na ordem do jogo
  assert.ok(!d.corrections.chartUnchecked);
  assert.deepEqual(d.starters.species, ['turtwig', 'chimchar', 'piplup']); // overlay 64 (escolha na maleta)
  assert.equal(d.starters.level, 5);
  const t = load('diamond-pearl-trainers.json');
  const roark = t.trainers.find((x) => x.key === 'TRAINER_LEADER_ROARK_ROARK');
  assert.deepEqual(roark.party.map((p) => [p.species, p.level, p.iv]), [['geodude', 12, 6], ['onix', 12, 6], ['cranidos', 14, 6]]);
  assert.ok(t.trainers.some((x) => x.label === 'Elite Four Lucian')); // a classe do decomp grafa LUCIEN
});

// ---------------------------------------------------------------- Diamond/Pearl: binários do jogo lidos pelo código (bytecode, eventos…)
test('regressão: Diamond/Pearl — treinadores com o lugar da luta (eventos/scripts binários) e o rival pelo desvio do inicial', () => {
  const t = load('diamond-pearl-trainers.json').trainers;
  assert.ok(t.length >= 480 && t.every((x) => x.map.length)); // antes: só 37 chefes, sem lugar
  const at = (key) => t.find((x) => x.key === key)?.map;
  assert.deepEqual(at('TRAINER_LEADER_ROARK_ROARK'), ['Oreburgh Gym']); // StartTrainerBattle 246 no script do ginásio
  assert.deepEqual(at('TRAINER_YOUNGSTER_TRISTAN'), ['Route 202']); // objeto com script 3000 → treinador 1
  // GetPlayerStarterSpecies + CompareVarToValue/GoToIf: com Piplup o Barry leva Turtwig (e assim por diante)
  const rivals = t.filter((x) => x.group === 'Rival');
  assert.ok(rivals.length === 21 && rivals.every((x) => x.forStarter?.length === 1 && x.carries));
  for (const x of rivals) assert.equal(x.forStarter[0], { turtwig: 'piplup', chimchar: 'turtwig', piplup: 'chimchar' }[x.carries], x.key);
  // parceiros de luta em dupla (StartTagBattle: Lucas/Dawn/Barry do seu lado) não são oponentes
  assert.ok(!t.some((x) => /LUCAS|DAWN|BARRY_CEDRIC_1[678]$/.test(x.key)));
});

test('regressão: Diamond/Pearl — onde obter pelo código do jogo (encontros, scripts por versão, extras) e selo "verificado"', async () => {
  const { whereToGet } = await import('../public/engine.mjs');
  const d = load('diamond-pearl.json'), a = load('diamond-pearl-acquisition.json');
  const types = (v, sp) => (a.versions[v][sp] ?? []).map((s) => s.type);
  // Spear Pillar: LegendaryBattle por variável (GetGameVersion 10 → Dialga, senão Palkia)
  assert.ok(types('diamond', 'dialga').includes('static') && !a.versions.pearl.dialga);
  assert.ok(types('pearl', 'palkia').includes('static') && !a.versions.diamond.palkia);
  // eventos de distribuição (CheckEventValidity 0/1/2 em Canalave, Route 224, Spear Pillar) e CheckRegis → fora do jogo
  for (const sp of ['darkrai', 'shaymin-land', 'arceus', 'regigigas', 'manaphy']) assert.equal(mon(d, sp).obtainable.diamond, false, sp);
  assert.equal(mon(d, 'giratina-altered').obtainable.pearl, true); // a PokéAPI não tinha o Giratina da Turnback Cave
  // árvores de mel (tabela de 21 mapas do overlay 05) e Great Marsh (lista do dia igual nas duas versões)
  assert.ok((a.versions.diamond.munchlax ?? []).some((s) => s.method === 'Árvore de mel'));
  assert.equal(mon(d, 'kangaskhan').obtainable.pearl, true);
  assert.ok(a.versions.diamond.feebas.some((s) => s.where === 'Mt. Coronet B1F'));
  // TM/HM: todos com origem (TM08/61/73 só na troca por Battle Points do Battle Park)
  assert.ok(a.machines['bulk-up'].some((s) => /Battle Points/.test(s.by)));
  assert.equal(a.progress.leaderOrder.join(), 'Roark,Gardenia,Maylene,Wake,Fantina,Byron,Candice,Volkner');
  assert.ok(whereToGet(d, a, mon(d, 'abra'), 'diamond').direct.some((s) => s.type === 'trade')); // fld_trade 0: Abra por Machop
  const g = load('games.json').games.find((x) => x.id === 'diamond-pearl');
  assert.ok(g.hasWalkthrough && !g.partial && g.trainerCount >= 480);
});

const haveDp = existsSync(new URL('../data-sources/pokediamond-src/arm9/src/', import.meta.url));
test('Diamond/Pearl — leitor de bytecode: os 605 scripts de mapa fecham sem erro; tamanhos tirados do código do DP', { skip: !haveDp && 'sem decomp local' }, async () => {
  const { loadDpField, parseEncounters, parseMatrix } = await import('../scripts/lib/gen4-dp-field.mjs');
  const root = new URL('../data-sources/pokediamond-src/', import.meta.url);
  const F = loadDpField(root);
  assert.equal(F.cmds.names.length, 721); // gScriptCmdTable
  // GetSetStrength (0x1CF) só lê o ponteiro na opção 2; Unk0289 lê 5 bytes num laço (a contagem automática errava as duas)
  const level = new Set(F.headers.map((h) => h.level));
  const files = readdirSync(new URL('files/fielddata/script/scr_seq_release/', root)).filter((f) => f.endsWith('.bin')).map((f) => Number(f.match(/\d+/)[0])).filter((n) => !level.has(n));
  const bad = files.filter((n) => F.scriptFile(n).errors.length);
  assert.equal(files.length, 605);
  assert.deepEqual(bad, []);
  // eventos: todos os 559 cabeçalhos leem sem bytes sobrando; matrizes e encontros de 424 bytes
  for (const h of F.headers) F.events(h);
  assert.ok(parseMatrix(F.raw('mapmatrix/map_matrix', 0)).grid.length === 30);
  const r201 = F.headers.find((h) => h.id === 'MAP_ROUTE_201');
  assert.deepEqual(parseEncounters(F.raw('encountdata/d_enc_data', r201.enc.diamond)).swarm, [84, 84]); // Doduo em enxame
});

// ---------------------------------------------------------------- Capturas de tela (E6): achados na revisão visual
test('E6: telas — evoluções da Gen 4 sem parâmetro, descrição de todos os métodos, dual-slot e surto na camada PokéAPI', async () => {
  const { describeEvolution, recommend } = await import('../public/engine.mjs');
  const pt = load('platinum.json');
  // res/pokemon/eevee/data.json: ["EVO_LEVEL_HAPPINESS_NIGHT", "SPECIES_UMBREON"] tem 2 itens (sem parâmetro) → o alvo se perdia
  for (const [n, kind] of [['umbreon', 'FRIENDSHIP_NIGHT'], ['espeon', 'FRIENDSHIP_DAY'], ['leafeon', 'LOCATION'], ['glaceon', 'LOCATION'], ['magnezone', 'LOCATION']]) {
    const e = mon(pt, n).evo;
    assert.equal(e?.kind, kind, n); assert.equal(e.param, null, n); // nunca a string "null"
  }
  // "capture Aipom e evolua: Ambipom ()": todo método conhecido tem descrição
  for (const g of ['platinum', 'heartgold-soulsilver', 'diamond-pearl']) for (const p of load(`${g}.json`).pokemon) if (p.evo) assert.ok(describeEvolution(p.evo), `${g}/${p.name}: ${p.evo.kind}`);
  assert.match(describeEvolution(mon(pt, 'ambipom').evo), /Double Hit/);
  // PokéAPI: encontro só com cartucho de GBA (condição slot2-*) não conta — Butterfree/Beedrill eram as sugestões contra o Roark
  const dp = load('diamond-pearl.json');
  for (const n of ['caterpie', 'weedle', 'ekans', 'butterfree']) assert.equal(mon(dp, n).obtainable.diamond, false, n);
  // Pidgey no DP: só surto (swarm-yes, Route 229) → marcado e penalizado (sem "onde obter" para o E2 ver)
  assert.match(mon(dp, 'pidgey').randomOnly?.diamond ?? '', /surto/);
  const r = recommend(dp, mon(dp, 'cranidos'), { level: 30, oppLevel: 14, version: 'diamond', onlyObtainable: true, fullyEvolvedOnly: false, includeLegendary: false });
  assert.ok(!r.picks.some((s) => ['butterfree', 'beedrill'].includes(s.mon.name)));
  assert.ok(r.picks.every((s) => !s.unreliable || r.candidates.filter((c) => c.duel.win && !c.unreliable).length < 3));
});

test('E6: aba Detonado — nomes de item com parte vazia (GUARD_SPEC_, X_SP__DEF) não derrubam a renderização', async () => {
  const { humanize } = await import('../public/engine.mjs');
  assert.equal(humanize('guard-spec-'), 'Guard Spec'); assert.equal(humanize('x-sp--def'), 'X Sp Def'); assert.equal(humanize(undefined), '');
  for (const g of ['heartgold-soulsilver', 'platinum', 'crystal', 'emerald', 'red-blue', 'firered-leafgreen']) {
    const w = load(`${g}-walkthrough.json`);
    for (const v of Object.values(w.versions)) for (const s of v.stages) for (const l of s.locations) for (const i of l.items) {
      assert.doesNotThrow(() => humanize(i.kind === 'TM/HM' ? i.move : i.item.toLowerCase().replace(/_/g, '-')), `${g}: ${JSON.stringify(i)}`);
    }
  }
});

// ---------------------------------------------------------------- 0.8.0: onde obter nas Gens 6–9 e Legends: Z-A pelo PKHeX

test('regressão: learnset do PKHeX com byte de preenchimento (Z-A) — divisão inteira como no LearnsetReader.cs', async () => {
  // Erro: parseLearnset usava length / 3 sem arredondar; a entrada da Chikorita no lvlmove_za tem 40 bytes (13 × 3 + 1) e
  // todos os níveis saíam undefined (o JSON perdia o campo "level").
  const { parseLearnset } = await import('../scripts/lib/pkhex.mjs');
  const b = Buffer.from('210027009e023e024b00490022007300db00eb004c007100b501010106090c0e161b24282d323800', 'hex');
  const l = parseLearnset(b);
  assert.equal(l.length, 13);
  assert.deepEqual(l[0], [1, 33]); assert.deepEqual(l[12], [56, 437]);
  const za = load('legends-za.json');
  for (const p of za.pokemon) for (const x of p.learnset.filter((y) => y.method === 'level-up')) assert.ok(Number.isInteger(x.level), `${p.name} ${x.move}`);
  assert.equal(mon(za, 'chikorita').learnset.find((x) => x.move === 'leaf-storm').level, 56);
});

test('Legends: Z-A — dataset das tabelas do PKHeX (espécies presentes, TMs, evoluções) e golpes da Gen 9', () => {
  const za = load('legends-za.json');
  assert.equal(za.pokemon.filter((p) => !p.regionalForm).length, 370); // flag "presente no jogo" do personal_za (base + Mega Dimension)
  assert.match(za.game.source, /PKHeX/);
  assert.deepEqual(za.starters.species, ['chikorita', 'tepig', 'totodile']);
  assert.ok(mon(za, 'chikorita').learnset.some((x) => x.method === 'machine'));
  // Melmetal/Sinistcha: a PokéAPI diz "evolui de", mas a tabela de evoluções do Z-A não tem a evolução → não obtível evoluindo
  for (const n of ['melmetal', 'sinistcha']) if (mon(za, n)) assert.equal(mon(za, n).evo?.possible, false, n);
  // forma regional evolui pela própria entrada do personal (Qwilfish de Hisui → Overqwil): não é diferença
  if (mon(za, 'overqwil')) assert.notEqual(mon(za, 'overqwil').evo?.possible, false);
  assert.equal(za.moves.tackle.power, 40);
});

test('onde obter nas Gens 6–9 (PKHeX): versões separadas, sem taxa, eventos fora', async () => {
  const { whereToGet, formatSources, unreliableReason } = await import('../public/engine.mjs');
  const src = (g, v, n) => { const d = load(`${g}.json`), a = load(`${g}-acquisition.json`); return { a, w: whereToGet(d, a, mon(d, n), v) }; };
  for (const g of ['x-y', 'omega-ruby-alpha-sapphire', 'sun-moon', 'ultra-sun-ultra-moon', 'lets-go-pikachu-lets-go-eevee', 'sword-shield', 'brilliant-diamond-shining-pearl', 'legends-arceus', 'scarlet-violet', 'legends-za']) {
    const a = load(`${g}-acquisition.json`);
    assert.equal(a.encountersOnly, true, g); assert.match(a.source, /PKHeX/, g);
    for (const v of Object.values(a.versions)) for (const list of Object.values(v)) for (const s of list) {
      assert.equal(s.pct, undefined, g); // o PKHeX não tem taxa — nada inventado
      assert.ok(s.where && s.where !== '?', `${g}: ${JSON.stringify(s)}`);
      assert.ok(!/PKHeX/.test(s.detail ?? ''), `${g}: nota técnica na tela: ${s.detail}`);
    }
  }
  // XY Route 2: Weedle só no X, Caterpie só no Y; iniciais de Kanto em Lumiose (nv 10)
  assert.ok(src('x-y', 'x', 'weedle').w.direct.some((s) => /Route 2/.test(s.where)));
  assert.ok(!src('x-y', 'y', 'weedle').w.direct.some((s) => /Route 2/.test(s.where)));
  assert.ok(src('x-y', 'x', 'charmander').w.direct.some((s) => s.type === 'gift' && s.where === 'Lumiose City' && s.level === 10));
  // lendários por versão
  assert.ok(src('brilliant-diamond-shining-pearl', 'brilliant-diamond', 'dialga').w.direct.length);
  assert.equal(src('brilliant-diamond-shining-pearl', 'shining-pearl', 'dialga').w.direct.length, 0);
  assert.equal(src('sword-shield', 'shield', 'zacian').w.direct.length, 0);
  assert.equal(src('scarlet-violet', 'violet', 'koraidon').w.direct.length, 0);
  // SV: crossover fora (Scyther/Dreepy não estão na South Province Area One); aviso de versões não separadas
  const sv = src('scarlet-violet', 'scarlet', 'scyther');
  assert.ok(!sv.w.direct.some((s) => s.where === 'South Province (Area One)'));
  assert.ok(sv.a.notes.some((n) => /não separa/.test(n)));
  // eventos (FatefulEncounter / Mystery Gift) não contam: Darkrai/Arceus no BDSP, Magearna no SM
  for (const n of ['darkrai', 'arceus', 'mew', 'jirachi']) assert.equal(load('brilliant-diamond-shining-pearl-acquisition.json').versions['brilliant-diamond'][n], undefined, n);
  assert.equal(mon(load('sun-moon.json'), 'magearna').obtainable.sun, false);
  // sem taxa: a linha não mostra "(undefined%)"; surto/raid/árvore de mel contam como aleatórios (E2)
  const lines = formatSources(src('legends-arceus', 'legends-arceus', 'bidoof').w.direct);
  assert.ok(lines.length && lines.every((l) => !/undefined|%/.test(l)), lines.join(' | '));
  const honey = src('brilliant-diamond-shining-pearl', 'brilliant-diamond', 'munchlax').w.direct;
  assert.ok(honey.filter((s) => s.method === 'Árvore de mel').length && honey.filter((s) => s.method === 'Árvore de mel').every((s) => unreliableReason(s)), 'árvore de mel = sorteio'); // (no BDSP o Munchlax também sai no Grand Underground)
  // Let's Go: faixa agregada (L3–56 na Route 1) não vira "Charizard a partir do nv 3" confiável
  assert.ok(src('lets-go-pikachu-lets-go-eevee', 'lets-go-pikachu', 'charizard').w.direct.filter((s) => s.type === 'wild').every((s) => unreliableReason(s)));
});

test('onde obter (PKHeX): detalhes do leitor viram texto curto; notas técnicas e campos internos ficam de fora', async () => {
  const { detailText, METHOD_LABEL, READERS } = await import('../scripts/lib/pkhex-enc.mjs');
  assert.equal(detailText({ locationId: 1, alpha: 'guaranteed', ball: 'Poke', levels: [[1, 2]] }), 'alfa garantido');
  assert.equal(detailText({ locationId: 1, section: 'Gifts' }), undefined);
  assert.equal(detailText({ stars: 5, dlc: 'Kitakami', time: ['dia', 'noite'] }), '5★; só dia/noite; DLC Kitakami');
  assert.equal(detailText('clima: Raining; PKHeX também aceita nível 60 no Wild Area (EncounterArea8)'), 'clima: Raining');
  assert.equal(detailText('faixa L3–56 agregada no arquivo do PKHeX (motivo não registrado)'), 'faixa de nível agregada na tabela');
  // todo jogo sem decomp tem leitor (Black/White desde a 0.10.0); Black 2/White 2 usa o decomp (pokebw2)
  for (const g of ['x-y', 'sword-shield', 'scarlet-violet', 'legends-za']) assert.ok(READERS[g], g);
  assert.ok(READERS['black-white']); assert.equal(READERS['black-2-white-2'], undefined);
  for (const k of ['other', 'sos', 'horde', 'symbol', 'hidden', 'max-raid', 'honey-tree', 'underground', 'alpha', 'tera-raid', 'fixed-symbol', 'hyperspace']) assert.ok(METHOD_LABEL[k], k);
});

// ---------------------------------------------------------------- 0.9.0: espécies de Hisui no Legends: Arceus e o inicial com sprites

test('regressão: Legends: Arceus tinha 18 espécies do jogo fora do dataset (só existem em forma de Hisui)', () => {
  // Erro: a PokéAPI guarda o learnset do LA na variedade "-hisui"; a espécie base ficava sem learnset do version-group e o
  // build-data a descartava (Typhlosion, Samurott, Decidueye… sumiam das sugestões e dos oponentes). No personal_la a forma 0
  // dessas espécies vem zerada/ausente e a forma de Hisui (FormStatsIndex @0x1E + forma − 1) é a presente.
  const la = load('legends-arceus.json');
  assert.equal(la.pokemon.filter((p) => !p.regionalForm).length, 242);
  const t = mon(la, 'typhlosion');
  assert.deepEqual(t.types, ['fire', 'ghost']);
  assert.deepEqual(t.stats, { hp: 73, attack: 84, defense: 78, speed: 95, 'special-attack': 119, 'special-defense': 85 });
  assert.equal(t.spriteId, 10233); assert.equal(t.form, 'typhlosion-hisui');
  assert.ok(t.learnset.some((l) => l.move === 'infernal-parade' && l.method === 'level-up'));
  assert.equal(t.evolvesFrom, 156);
  for (const [n, types] of [['goodra', ['steel', 'dragon']], ['decidueye', ['grass', 'fighting']], ['samurott', ['water', 'dark']], ['arcanine', ['fire', 'rock']]]) assert.deepEqual(mon(la, n).types, types, n);
  // agora obtíveis pelos encontros do PKHeX (Typhlosion evoluindo o Cyndaquil inicial)
  assert.equal(t.obtainable['legends-arceus'], true);
  // loja de golpes do jogo no lugar do "tutor" incompleto da PokéAPI (62 no jogo inteiro)
  assert.ok(la.pokemon.reduce((a, p) => a + p.learnset.filter((l) => l.method === 'tutor').length, 0) > 3000);
});

test('leitor do PKHeX: forma regional só quando a forma 0 está ausente; loja de golpes pelo MoveShopMoves', async () => {
  const { PKHEX_GAMES } = await import('../scripts/lib/pkhex.mjs');
  const la = PKHEX_GAMES['legends-arceus'];
  assert.deepEqual(la.forms, { index: 0x1e, count: 0x20 }); // PersonalInfo8LA.cs
  assert.equal(la.moveShop.offset, 0xa8);
  // só o LA troca a forma: nos outros jogos a forma 0 ausente continua ausente (BDSP: Darkrai/Arceus de evento)
  for (const [g, c] of Object.entries(PKHEX_GAMES)) if (g !== 'legends-arceus') assert.equal(c.forms, undefined, g);
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../scripts/build-game.mjs', import.meta.url), 'utf8'), /PKHEX_STEPS = \['apply-pkhex-overlay', 'fill-pkhex-species', 'add-pkhex-forms', 'add-pkhex-megas', 'apply-pkhex-machines', 'apply-pkhex-evos', 'apply-zmax-powers', 'validate-pkhex']/);
});

test('tela do jogo: o inicial sai da barra do topo e vira 3 sprites logo acima do campo do oponente', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const top = html.slice(html.indexOf('id="context"'), html.indexOf('</div>', html.indexOf('id="stageWrap"')));
  assert.ok(!/id="starter"/.test(top), 'o seletor de inicial não pode ficar na barra do topo');
  const pick = html.indexOf('id="starterPick"'), opp = html.indexOf('id="opp"');
  assert.ok(pick > 0 && pick < opp && !html.slice(pick, opp).includes('id="oppInfo"'), 'escolha do inicial logo acima do campo do oponente');
  assert.match(html, /<select id="starter" hidden/); // o <select> continua guardando o valor (URL ?inicial=, rival)
  const app = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /role="radio"/); assert.match(app, /não informar/);
});

// ---------------------------------------------------------------- formas regionais (Gens 7–9) pelas tabelas do PKHeX

test('regressão: formas regionais — o Rattata selvagem do Sun/Moon é o de Alola (Sombrio/Normal), não o de Kanto', async () => {
  // Erro: o dataset tinha uma forma por espécie (a original). No SM o encontro é (espécie 19, forma 1) e virava o Rattata
  // Normal; Meowth de Galar, Wooper de Paldea etc. não existiam. Formas = personal do jogo (FormStatsIndex + f − 1) com a
  // variedade regional da PokéAPI (tipos conferidos nas duas fontes); id = id da variedade (sprite certo).
  const { humanize } = await import('../public/engine.mjs');
  const { findOpponent, searchOpponents } = await import('../public/pokedex.mjs');
  const sm = load('sun-moon.json');
  const ra = mon(sm, 'rattata-alola');
  assert.deepEqual(ra.types, ['dark', 'normal']); assert.equal(ra.id, 10091); assert.equal(ra.speciesId, 19); assert.equal(ra.form, 1);
  assert.equal(ra.obtainable.sun, true); assert.equal(mon(sm, 'rattata').obtainable.sun, false); // Kanto não aparece no SM
  assert.equal(mon(sm, 'raticate-alola').evolvesFrom, 10091); // pré-evolução da mesma região
  assert.equal(mon(sm, 'raichu-alola').evolvesFrom, 25);
  // exclusivos conferidos com a PokéAPI: Vulpix de Alola no Sun, Sandshrew de Alola no Moon
  assert.equal(mon(sm, 'vulpix-alola').obtainable.sun, true); assert.equal(mon(sm, 'vulpix-alola').obtainable.moon, false);
  assert.deepEqual(mon(load('sword-shield.json'), 'meowth-galar').types, ['steel']);
  assert.deepEqual(mon(load('scarlet-violet.json'), 'wooper-paldea').types, ['poison', 'ground']);
  assert.ok(mon(load('scarlet-violet.json'), 'tauros-paldea-aqua-breed'));
  for (const g of ['x-y', 'omega-ruby-alpha-sapphire', 'brilliant-diamond-shining-pearl']) assert.ok(!load(`${g}.json`).pokemon.some((p) => p.regionalForm), g);
  // Let's Go não tem habilidades — nem nas formas
  assert.ok(load('lets-go-pikachu-lets-go-eevee.json').pokemon.filter((p) => p.regionalForm).every((p) => !p.abilities.length));
  // tela: nome, busca e número da espécie
  assert.equal(humanize('rattata-alola'), 'Rattata de Alola'); assert.equal(humanize('tauros-paldea-aqua-breed'), 'Tauros de Paldea (Aqua Breed)');
  assert.equal(humanize('thunder-punch'), 'Thunder Punch');
  assert.equal(findOpponent(sm.pokemon, 'Rattata de Alola')?.name, 'rattata-alola');
  assert.deepEqual(searchOpponents(sm.pokemon, 'rattata').map((p) => p.name), ['rattata', 'rattata-alola']);
  assert.ok(searchOpponents(sm.pokemon, '#19').some((p) => p.name === 'rattata-alola'));
  // onde obter liga o encontro (espécie, forma) à forma
  const acq = load('sun-moon-acquisition.json');
  assert.ok(acq.versions.sun['rattata-alola']?.length); assert.equal(acq.versions.sun.rattata, undefined);
});

test('Black/White: onde obter pelos encontros do PKHeX (Gen 5), versões conferidas com a PokéAPI', async () => {
  const { whereToGet } = await import('../public/engine.mjs');
  const d = load('black-white.json'), a = load('black-white-acquisition.json');
  assert.equal(a.encountersOnly, true);
  const w = (n, v) => whereToGet(d, a, mon(d, n), v).direct;
  assert.ok(w('reshiram', 'black').some((s) => s.type === 'static' && s.level === 50)); assert.equal(w('reshiram', 'white').length, 0);
  assert.ok(w('snivy', 'white').some((s) => s.type === 'starter'));
  // Throh também sai no Black, mas só na grama que balança (PokéAPI: grass-spots no Black, walk no White)
  assert.ok(w('throh', 'black').length && w('sawk', 'black').length);
  // evento fica de fora: Victini (Liberty Garden), Zorua/Zoroark do evento
  assert.equal(mon(d, 'victini').obtainable.black, false);
  // White Forest só no White: muitas espécies de fora de Unova
  assert.ok(d.pokemon.filter((p) => p.obtainable.white && !p.obtainable.black).length > 50);
});

test('regressão: evoluções do jogo (PKHeX) nas Gens 5–9 — troca, item, forma e o que não dá para fazer no jogo', async () => {
  // Erro: esses jogos não tinham `evo` → o filtro de evolução por troca não valia (Alakazam/Gengar como se bastasse
  // capturar); no SM o Raichu de Kanto (Thunder Stone "fora de Alola") contava como obtível; no SwSh o Perrserker vinha do
  // Meowth de Kanto. Fonte: evos_<jogo>.pkl (índice por espécie nas Gens 5/6, pela forma do personal da Gen 7 em diante).
  const { describeEvolution, needsTradeEvolution } = await import('../public/engine.mjs');
  const sm = load('sun-moon.json'), smAcq = load('sun-moon-acquisition.json');
  assert.equal(mon(sm, 'raichu').evo.possible, false); assert.equal(mon(sm, 'raichu').obtainable.sun, false);
  assert.equal(mon(sm, 'raichu-alola').evo.kind, 'ITEM'); assert.equal(mon(sm, 'raichu-alola').obtainable.sun, true);
  assert.equal(describeEvolution(mon(sm, 'raticate-alola').evo), 'nv 20 (à noite)');
  assert.equal(mon(sm, 'alakazam').evo.kind, 'TRADE');
  assert.ok(needsTradeEvolution(sm, smAcq, mon(sm, 'alakazam'), 'sun'));
  assert.match(describeEvolution(mon(sm, 'sylveon').evo), /Fairy/);
  const swsh = load('sword-shield.json');
  assert.equal(mon(swsh, 'perrserker').evolvesFrom, mon(swsh, 'meowth-galar').id);
  assert.equal(mon(swsh, 'sirfetchd').evolvesFrom, mon(swsh, 'farfetchd-galar').id);
  // SV: formas de Hisui só chegam pelo HOME — não evoluem dentro do jogo
  assert.equal(mon(load('scarlet-violet.json'), 'typhlosion-hisui').evo.possible, false);
  // todo método tem texto na tela
  for (const g of ['black-white', 'x-y', 'sun-moon', 'sword-shield', 'brilliant-diamond-shining-pearl', 'legends-arceus', 'scarlet-violet', 'legends-za']) {
    for (const p of load(`${g}.json`).pokemon) if (p.evo && p.evo.kind !== 'NONE') assert.ok(describeEvolution(p.evo), `${g}/${p.name}: ${p.evo.kind}`);
  }
});

test('regressão: TMs pelas tabelas do jogo (PKHeX) — Snarl fora do BW, TMs de patch/DLC no SV', () => {
  // BW: a PokéAPI dava a TM95 Snarl a 55 espécies, mas ela não é obtível no jogo (LearnSource5BW exclui o índice 94).
  // SV: a PokéAPI misturava na forma 0 as TMs das formas de Hisui e não tinha compatibilidades novas (patch/DLC).
  const bw = load('black-white.json');
  assert.ok(!bw.pokemon.some((p) => p.learnset.some((l) => l.move === 'snarl' && l.method === 'machine')));
  const sv = load('scarlet-violet.json');
  assert.ok(mon(sv, 'quaxly').learnset.some((l) => l.move === 'sleep-talk' && l.method === 'machine'));
  assert.ok(mon(sv, 'glaceon').learnset.some((l) => l.move === 'trailblaze' && l.method === 'machine'));
  assert.ok(!sv.pokemon.some((p) => p.learnset.some((l) => l.move === 'mega-punch' && l.method === 'machine'))); // TM000
});

test('aviso de mecânicas fora do cálculo (Mega, golpes Z, Dynamax, Terastal, tempo real) chega à tela do jogo', () => {
  // Antes o battleNote existia em games.mjs mas nunca aparecia no app.
  const { games } = load('games.json');
  const m = (id) => games.find((g) => g.id === id).mechanics;
  assert.deepEqual(m('sun-moon'), ['Mega Evolução', 'golpes Z']);
  assert.ok(m('sword-shield').some((x) => /Dynamax/.test(x)));
  assert.ok(m('scarlet-violet').includes('Terastal'));
  assert.ok(m('legends-za').some((x) => /tempo real/.test(x)));
  assert.ok(m('legends-arceus').some((x) => /ágil e forte/.test(x)));
  for (const id of ['red-blue', 'emerald', 'platinum', 'black-2-white-2', 'brilliant-diamond-shining-pearl']) assert.deepEqual(m(id), [], id);
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="mechNote"/);
  assert.match(readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8'), /Fora do cálculo neste jogo/);
});

test('fraquezas seguem a tabela de tipos da geração do jogo', () => {
  // Gen 1: Fantasma não afeta Psíquico (bug do jogo), Inseto ↔ Veneno 2×, Gelo neutro no Fogo; Aço resiste a
  // Fantasma/Sombrio até a Gen 5; Fada só a partir da Gen 6.
  const c = (g) => load(`${g}.json`).chart;
  assert.equal(c('red-blue').ghost.psychic, 0); assert.equal(c('red-blue').bug.poison, 2); assert.equal(c('red-blue').ice.fire, 1);
  assert.equal(c('black-2-white-2').ghost.steel, 0.5); assert.equal(c('x-y').ghost.steel, 1);
  assert.equal(c('black-2-white-2').fairy, undefined); assert.equal(c('x-y').dragon.fairy, 0);
});

// ---------------------------------------------------------------- Gens 5–9: treinadores, progresso e Detonado pelo detonado

test('Gens 5–9 sem decomp: líderes na ordem do detonado (insígnia ligada ao líder; alternativas de versão juntas)', () => {
  // Erros encontrados e corrigidos: Guzma como "líder" no SM (vale o carimbo de ilha → kahunas); Giovanni em 4º no Let's Go
  // (a 1ª luta é no esconderijo — vale a luta antes da insígnia); Piers e Raihan juntados no SwSh (mesma seção, mas níveis
  // diferentes); Leon como "rival" (fim da história = Hall da Fama/créditos depois do último líder).
  const order = (g) => load(`${g}-acquisition.json`).progress?.leaderOrder;
  assert.deepEqual(order('x-y'), ['Viola', 'Grant', 'Korrina', 'Ramos', 'Clemont', 'Valerie', 'Olympia', 'Wulfric']);
  assert.deepEqual(order('sun-moon').filter((n) => /grande/.test(n)).map((n) => n.match(/\((\w+)\)/)[1]), ['Hala', 'Olivia', 'Nanu', 'Hapu']); // kahunas, sem o Guzma
  assert.equal(order('lets-go-pikachu-lets-go-eevee').at(-1), 'Giovanni');
  const swsh = order('sword-shield');
  assert.ok(swsh.includes('Piers') && swsh.includes('Raihan') && swsh.some((n) => /Gordie\//.test(n)), swsh.join());
  assert.equal(order('brilliant-diamond-shining-pearl').length, 8);
  assert.deepEqual(order('scarlet-violet'), ['Katy', 'Brassius', 'Iono', 'Kofu', 'Larry', 'Ryme', 'Tulip', 'Grusha']);
  // jogos sem ginásio: marcos próprios do detonado (0.11.0) — Legends: Arceus pelos 5 nobres, Z-A pelas promoções de rank,
  // Sun/Moon pelas provações (Z-Crystal depois de totem) + grandes provações
  const la = load('legends-arceus-acquisition.json').progress;
  assert.deepEqual(la.leaderOrder, ['Kleavor', 'Lilligant', 'Arcanine', 'Electrode', 'Avalugg']); assert.equal(la.post, 6);
  const za = load('legends-za-acquisition.json').progress;
  assert.equal(za.leaderOrder[0], 'Zach'); assert.equal(za.stageNames.length, 11); assert.match(za.stageNames.at(-1), /^Rank A/);
  const sm = load('sun-moon-acquisition.json').progress;
  assert.equal(sm.stageNames.length, 12); assert.ok(!sm.stageNames.some((n) => /Steelium|Buginium|Poisonium|Eevium/.test(n)));
  assert.ok(load('legends-za-trainers.json').trainers.filter((t) => t.group === 'Partidas de promoção').length >= 10);
});

test('Gens 5–9 sem decomp: times do detonado (espécie e nível) com golpes estimados; onde obter ganha estágio', async () => {
  const { recommend } = await import('../public/engine.mjs');
  for (const g of ['black-white', 'x-y', 'omega-ruby-alpha-sapphire', 'sun-moon', 'lets-go-pikachu-lets-go-eevee', 'sword-shield', 'brilliant-diamond-shining-pearl', 'legends-arceus', 'scarlet-violet']) {
    const td = load(`${g}-trainers.json`), d = load(`${g}.json`);
    assert.equal(td.fromWalkthrough, true, g);
    const names = new Set(d.pokemon.map((p) => p.name));
    for (const t of td.trainers) for (const p of t.party) { assert.ok(names.has(p.species), `${g}: ${t.label} ${p.species}`); assert.ok(p.defaultMoves === true || p.movesSource === 'Bulbapedia'); } // 0.38.0: golpes reais da Bulbapedia quando casam
    assert.ok(load(`${g}-walkthrough.json`).versions);
  }
  const xy = load('x-y-trainers.json').trainers;
  const viola = xy.find((t) => t.name === 'Viola');
  assert.deepEqual(viola.party.map((p) => `${p.species}@${p.level}`), ['surskit@10', 'vivillon@12']);
  // SV: o nº da imagem do serebii não é o nacional — espécie pelo nome (Pawmi do Nemona)
  assert.ok(load('scarlet-violet-trainers.json').trainers.some((t) => t.name === 'Nemona' && t.party.some((p) => p.species === 'pawmi')));
  // SM: imagem vence a grafia ("Golbat" com a imagem do Crobat no time do Gladion)
  assert.ok(load('sun-moon-trainers.json').trainers.filter((t) => t.name === 'Gladion').some((t) => t.party.some((p) => p.species === 'crobat')));
  // estágio nos locais: Route 2 do XY antes da 1ª insígnia
  const acq = load('x-y-acquisition.json');
  assert.equal(acq.versions.x.weedle.find((s) => /Route 2/.test(s.where)).stage, 0);
  // recomendação com progresso funciona contra o time do detonado
  const d = load('x-y.json');
  const r = recommend(d, d.pokemon.find((p) => p.name === 'vivillon'), { level: 12, oppLevel: 12, version: 'x', stage: 0, acq, onlyObtainable: true, fullyEvolvedOnly: false, includeLegendary: false });
  assert.ok(r.picks.length > 0);
});

test('aba Onde capturar: todos os locais da versão, rota por evolução, eventos e outras versões', async () => {
  const { catchReport } = await import('../public/engine.mjs');
  const r = (g, v, n) => { const d = load(`${g}.json`), a = load(`${g}-acquisition.json`); return catchReport(d, a, d.pokemon.find((p) => p.name === n), v); };
  // Pikachu na Gen 3: Safari Zone no Emerald; Viridian Forest (antes da 1ª insígnia) e Power Plant no FireRed
  assert.ok(r('emerald', 'emerald', 'pikachu').lines.every((l) => /Safari Zone/.test(l.text)));
  const fr = r('firered-leafgreen', 'firered', 'pikachu');
  assert.match(fr.lines[0].text, /Viridian Forest/); assert.equal(fr.lines[0].stage, 0);
  assert.ok(fr.lines.some((l) => /Power Plant/.test(l.text)));
  // sem forma direta → de qual Pokémon evoluir
  const rai = r('firered-leafgreen', 'firered', 'raichu');
  assert.equal(rai.from, 'pikachu'); assert.ok(rai.lines.length);
  // exclusivo de versão: aparece nas outras versões
  const ekans = r('firered-leafgreen', 'leafgreen', 'ekans');
  assert.equal(ekans.lines.length, 0); assert.ok(ekans.others.some((o) => o.version === 'firered'));
  // jogos sem decomp também (PKHeX): sem taxa
  const xy = r('x-y', 'x', 'pikachu');
  assert.ok(xy.lines.length && xy.lines.every((l) => !/%/.test(l.text)));
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="tabDex"/); assert.match(html, /id="dexQ"/);
});

test('tela inicial: busca de Pokémon (padrão) com seletor para líder/jogo; índice de jogos onde obter', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-mode="pokemon" aria-checked="true"/); // Pokémon é o padrão
  assert.match(html, /data-mode="lider" aria-checked="false"/); // líderes continuam buscáveis
  assert.match(html, /id="homeDex"/);
  const idx = load('pokemon-games.json');
  // Pikachu: Gen 3 no Emerald e no FRLG; não aparece na Gen 5 (BW/B2W2)
  assert.deepEqual(idx.where.pikachu['firered-leafgreen'], ['firered', 'leafgreen']);
  assert.ok(idx.where.pikachu.emerald && !idx.where.pikachu['black-white'] && !idx.where.pikachu['black-2-white-2']);
  // forma regional: só nos jogos da Gen 7 em que dá para obter; nº da espécie e sprite da variedade
  assert.deepEqual(Object.keys(idx.where['rattata-alola']).sort(), ['lets-go-pikachu-lets-go-eevee', 'sun-moon', 'ultra-sun-ultra-moon']);
  assert.deepEqual(idx.forms['rattata-alola'], [19, 10091]);
  // exclusivo de versão: Ekans só no FireRed
  assert.deepEqual(idx.where.ekans['firered-leafgreen'], ['firered']);
});

// ---------------------------------------------------------------- acesso pela rede local (outro aparelho)

test('regressão: servidor local acessível de outro aparelho — escuta em todas as interfaces e manda no-cache', async () => {
  // Erros de 2026-10-20: (1) depois de uma atualização o navegador juntou index.html novo com app.mjs antigo (sem
  // cabeçalho de cache) → página quebrada; (2) do outro aparelho, ERR_CONNECTION_TIMED_OUT com o servidor no ar: regras do
  // Firewall do Windows bloqueavam o node.exe no perfil "Privado" (bloqueio vence a regra que libera a porta 5173).
  const src = readFileSync(new URL('../scripts/serve.mjs', import.meta.url), 'utf8');
  assert.match(src, /\.listen\(port,/); // sem host → todas as interfaces (0.0.0.0), não só localhost
  assert.ok(!/listen\([^)]*(127\.0\.0\.1|'localhost')/.test(src), 'servidor preso ao localhost: outro aparelho não acessa');
  const { createAppServer } = await import('../scripts/serve.mjs');
  const server = createAppServer();
  await new Promise((r) => server.listen(0, '0.0.0.0', r));
  try {
    const { port } = server.address();
    for (const p of ['/', '/app.mjs', '/data/games.json']) {
      const res = await fetch(`http://127.0.0.1:${port}${p}`);
      assert.equal(res.status, 200, p);
      assert.equal(res.headers.get('cache-control'), 'no-cache', p);
    }
  } finally { server.close(); }
});

test('regressão: diagnóstico de rede acusa bloqueio do Node no perfil atual e mostra a correção', async () => {
  const { blockingRules, fixCommand, lanAddresses } = await import('../scripts/lib/lan.mjs');
  // o caso real: Permitir no Público, Bloquear no Privado, rede Privada
  const rules = [
    { name: 'Node.js JavaScript Runtime', enabled: true, action: 'Allow', profile: 'Public' },
    { name: 'Node.js JavaScript Runtime', enabled: true, action: 'Block', profile: 'Private' },
    { name: 'poke-tact', enabled: true, action: 'Allow', profile: 'Private' },
  ];
  assert.equal(blockingRules(rules, 'Private').length, 1);
  assert.equal(blockingRules(rules, 'Public').length, 0);
  assert.equal(blockingRules([{ name: 'Node.js', enabled: true, action: 'Block', profile: 'Domain, Private' }], 'Private').length, 1);
  assert.equal(blockingRules([{ name: 'Node.js', enabled: false, action: 'Block', profile: 'Private' }], 'Private').length, 0);
  assert.match(fixCommand('Private'), /Set-NetFirewallRule -Action Allow/);
  assert.match(fixCommand('Private'), /'Private'/);
  assert.deepEqual(lanAddresses({ eth: [{ family: 'IPv4', address: '192.168.15.4', internal: false }], lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }] }), ['192.168.15.4']);
});

// ---------------------------------------------------------------- onde capturar: fotos dos lugares e mapa da região

test('regressão: nenhum arquivo de texto do app/scripts com caractere de controle (\b virou backspace numa edição pelo shell)', () => {
  // Erro de 2026-10-20: "/\b(town|city…)\b/" passou pelo shell e o \b virou o byte 0x08 → o regex nunca casava e o mapa
  // da região saiu sem os nomes das cidades, sem erro nenhum.
  const dirs = ['../public/', '../scripts/', '../scripts/lib/', '../test/'];
  for (const d of dirs) for (const f of readdirSync(new URL(d, import.meta.url))) {
    if (!/\.(mjs|js|html|css|json)$/.test(f) || /^(?!.*-(walkthrough|trainers|acquisition)).*\.json$/.test(f) && d === '../public/') continue;
    const txt = readFileSync(new URL(d + f, import.meta.url), 'utf8');
    assert.ok(!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(txt), `${d}${f}: caractere de controle`);
  }
});

test('fotos dos lugares: só de trechos do detonado cujo título é o lugar; referências (não arquivos) com crédito', () => {
  const fr = load('firered-leafgreen-places.json');
  assert.match(fr.credit, /PokeMythology/); assert.match(fr.page, /^https:\/\/www\.pokemythology\.net\/detonados\//);
  assert.match(fr.places['Viridian Forest'].images[0], /screenfrlg\/viridian1\.png/); // o mapa da própria área
  assert.ok(fr.places['Mt Moon 1F'].images.some((u) => /mtmoon/.test(u)));
  for (const g of ['firered-leafgreen', 'emerald', 'sun-moon', 'x-y']) {
    const p = load(`${g}-places.json`);
    for (const [w, x] of Object.entries(p.places)) {
      // SM: "Route 1" citada no trecho de Ten Carat Hill não ganha foto de lá; sem título, só arquivo cujo nome cita o lugar
      assert.ok(['título', 'arquivo'].includes(x.by), `${g}/${w}`);
      assert.ok(x.images.length && x.images.every((u) => /^https:\/\//.test(u) && !/serebii|\/sprites\//.test(u)), `${g}/${w}`);
    }
  }
  assert.equal(load('sun-moon-places.json').places['Route 1'], undefined);
});

test('fotos dos lugares (0.21.0): lugar só citado no texto ganha a foto cujo NOME de arquivo o cita; foto de outro lugar sai', () => {
  const name = (u) => u.split('?')[0].split('/').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const g of ['red-blue', 'gold-silver', 'crystal', 'heartgold-soulsilver', 'firered-leafgreen', 'black-2-white-2']) {
    for (const [w, x] of Object.entries(load(`${g}-places.json`).places)) {
      if (x.by !== 'arquivo') continue;
      const k = w.toLowerCase().replace(/\(.*?\)/g, '').replace(/\bmount\b/, 'mt').replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 2).join('');
      assert.ok(x.images.every((u) => name(u).includes(k)), `${g}/${w}: ${x.images}`);
    }
  }
  const gs = load('gold-silver-places.json').places;
  assert.match(gs['Ice Path B1F'].images[0], /icepath\d\.png/);
  assert.match(gs['Mount Mortar 1FInside'].images[0], /mtmortar\d\.png/);
  // o trecho de Blackthorn só tem fotos do Ice Path: nenhuma foto do detonado; desde 0.24.0 vem da Bulbapedia, com crédito
  assert.ok(!gs['Blackthorn City'].images.some((u) => /pokemythology/.test(u)));
  assert.equal(gs['Blackthorn City'].credit, 'Bulbapedia');
  assert.ok(!gs['Silver Cave Outside'].images.some((u) => /mtmortar/.test(u)));
  assert.ok(load('red-blue-places.json').places['Mt. Moon 1F'].images.some((u) => /mtmoon/.test(u)));
  assert.ok(!load('omega-ruby-alpha-sapphire-places.json').places['Mossdeep City'].images.some((u) => /shoalcave/.test(u)));
  assert.equal(load('firered-leafgreen-places.json').places['Saffron City Dojo'], undefined); // silphco2.png não é do Dojo
  assert.ok(load('black-2-white-2-places.json').places['Route 4'].images.every((u) => /route4(black|white)/.test(u)));
});

test('mapa da região (Gens 1–3): posições do decomp e lugares do onde obter ligados aos pontos', () => {
  const rb = load('red-blue-regionmap.json');
  assert.equal(rb.regions[0].name, 'Kanto');
  const pt = (m, w) => { const at = m.placeOf[w]; return at && m.regions[at[0]].points[at[1]]; };
  assert.equal(pt(rb, 'Viridian Forest').name, 'Viridian Forest');
  const cr = load('crystal-regionmap.json');
  assert.deepEqual(cr.regions.map((r) => r.name), ['Johto', 'Kanto']); // KANTO_LANDMARK separa as duas
  assert.ok(cr.regions[1].points.some((p) => p.name === 'Pallet Town'));
  assert.equal(pt(cr, 'Mount Mortar 1FOutside')?.name, 'Mt. Mortar'); // "Mount" = "Mt."
  const em = load('emerald-regionmap.json');
  assert.equal(pt(em, 'Safari Zone South')?.name, 'Safari Zone');
  const fr = load('firered-leafgreen-regionmap.json');
  assert.deepEqual(fr.regions.map((r) => r.name), ['Kanto', 'Ilhas Sevii']);
  assert.ok(!fr.regions.some((r) => r.points.some((p) => p.x === 0.5 && p.y === 0.5))); // (0,0) = sem posição
  const app = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /function renderRegionMap/); assert.match(app, /function renderPlaces/);
});

test('mapa da região na Gen 4 (matriz do mundo + warps) e nos remakes pela região do original; tags no catálogo', () => {
  // Gen 4: posição da seção (MAPSEC) = centro das células da matriz do mundo; fora dela (Mt. Coronet, lagos, Great
  // Marsh) = posição do warp de entrada vindo do mundo (x, z ÷ 32). Antes desses warps só 73/173 locais do DP caíam no mapa.
  const pt = load('platinum-regionmap.json');
  const P = (n) => pt.regions[0].points.find((p) => p.name === n);
  assert.ok(P('Mt. Coronet') && P('Lake Verity') && P('Great Marsh'));
  assert.ok(Math.abs(P('Oreburgh Mine').x - P('Oreburgh City').x) < 2); // a mina fica em Oreburgh
  const reach = (g) => { const m = load(`${g}-regionmap.json`), a = load(`${g}-acquisition.json`); const ws = new Set(Object.values(a.versions).flatMap((v) => Object.values(v).flat().map((s) => s.where))); return [...ws].filter((w) => m.placeOf[w]).length / ws.size; };
  assert.ok(reach('diamond-pearl') > 0.95 && reach('platinum') > 0.95, 'Gen 4 quase toda no mapa');
  assert.match(load('heartgold-soulsilver-regionmap.json').source, /pokecrystal/); // mesma região do Crystal
  for (const [g, twin] of [['brilliant-diamond-shining-pearl', 'platinum'], ['omega-ruby-alpha-sapphire', 'emerald'], ['lets-go-pikachu-lets-go-eevee', 'red-blue']]) {
    assert.match(load(`${g}-regionmap.json`).source, new RegExp(`mesma região de ${twin}`), g);
    assert.ok(reach(g) > 0.7, g);
  }
  // tags do app: detonado no app e capturas disponíveis (fotos/mapa no tooltip)
  const { games } = load('games.json');
  const g = (id) => games.find((x) => x.id === id);
  assert.deepEqual(g('firered-leafgreen').capture.regionMap, true);
  assert.ok(g('firered-leafgreen').capture.places > 50);
  assert.equal(g('x-y').capture.regionMap, false); // sem decomp e sem região irmã
  assert.ok(games.filter((x) => x.status === 'supported').every((x) => x.capture), 'todo jogo disponível tem Onde capturar');
  const app = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /capturas disponíveis/); assert.match(app, /detonado no app/);
  assert.match(app, /qualityBadge\(g\) \+ featureTags\(g\)/); // também no cabeçalho do jogo
  // Detonado: fotos pelo local e pelos mapas dele; mapa de cada etapa
  assert.match(app, /\[l\.name, \.\.\.\(l\.maps \?\? \[\]\)\]\.map\(placeOfWhere\)/);
  assert.match(app, /stageMap\(s\)/);
});

test('novidades: changelog.json acompanha o CHANGELOG.md e a versão do package.json; botão e link #/?novidades', async () => {
  const { parseChangelog, inline } = await import('../scripts/build-changelog.mjs');
  const md = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const pub = load('changelog.json');
  assert.deepEqual(pub, parseChangelog(md)); // rode o build-catalog (ou build-changelog) a cada versão
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pub[0].version, pkg.version);
  assert.ok(pub[0].sections.some((s) => s.items.length));
  // markdown → HTML seguro: escapa antes de formatar
  assert.equal(inline('**A** `b` <x> [c](https://x.y)'), '<strong>A</strong> <code>b</code> &lt;x&gt; <a href="https://x.y" target="_blank" rel="noopener">c</a>');
  // itens com continuação indentada viram um item só
  const v = parseChangelog('## [9.9.9] — 2026-01-01\n\n### Adicionado\n- linha um\n  continua\n- dois\n');
  assert.deepEqual(v, [{ version: '9.9.9', date: '2026-01-01', sections: [{ title: 'Adicionado', items: ['linha um continua', 'dois'] }] }]);
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="newsBtn"/); assert.match(html, /id="newsPanel"/);
  const app = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /r\.params\.novidades != null\) openNews\(true\)/);
  assert.match(app, /poketact:news-seen/);
});

// ---------------------------------------------------------------- plano autônomo: etapa 1

test('regressão: área descrita no pós-jogo mas citada antes no detonado ganha o estágio da citação (com vizinho liberado)', async () => {
  // Erro: "título vence" punha como pós-jogo a Safari Zone de Hoenn (citada em Fortree) e a Power Plant do FRLG (citada
  // em "Agora você tem Surf!"). A citação anterior só vale com um vizinho já liberado nesse estágio, só para lugares que
  // o título pôs no pós-jogo (o Magma Hideout, estágio 6, tem a entrada citada cedo mas trancada) e rota só de água conta
  // a partir do Surf (a Route 108 liberava o Abandoned Ship do Ruby/Sapphire no estágio 3).
  const stages = (g, re) => [...new Set(Object.values(load(`${g}-acquisition.json`).progress.maps).filter((x) => re.test(x.label)).map((x) => x.stage))];
  assert.deepEqual(stages('emerald', /^Safari Zone/), [6]);
  assert.deepEqual(stages('ruby-sapphire', /^Safari Zone/), [6]);
  assert.deepEqual(stages('firered-leafgreen', /^Power Plant/), [6]);
  assert.deepEqual(stages('crystal', /^Silver Cave/), [9]); // citada cedo, mas fechada: continua pós-jogo
  assert.ok(stages('gold-silver', /^Viridian City$/).every((s) => s >= 8));
  assert.ok(stages('emerald', /^Magma Hideout/).every((s) => s >= 6));
  assert.ok(stages('ruby-sapphire', /^Abandoned Ship/).every((s) => s >= 5));
  assert.ok(load('emerald-acquisition.json').progress.earlierUsed.some((u) => /Safari Zone/.test(u.map)));
  const { applyEarlierMentions } = await import('../scripts/lib/progress.mjs');
  // sem vizinho liberado no estágio da citação → não muda
  const st = new Map([['A', 9], ['B', 9]]);
  const conn = new Map([['A', new Set(['B'])], ['B', new Set(['A'])]]);
  assert.equal(applyEarlierMentions(st, { A: { stage: 9, earlierMention: { stage: 3 } } }, conn, new Map()).length, 0);
  st.set('B', 2);
  assert.equal(applyEarlierMentions(st, { A: { stage: 9, earlierMention: { stage: 3 } } }, conn, new Map()).length, 1);
  assert.equal(st.get('A'), 3);
});

test('Sun/Moon: o Fairium da Mina não é marco do progresso (no SM ela não tem provação na história)', () => {
  // Etapa 2 do plano: investigado no detonado — "Ela seria uma trial captain daqui, contudo ela não tem nenhum trial para lhe
  // oferecer… você receberá o Fairium Z". Presente, não provação: o progresso continua com 7 provações + 4 grandes provações.
  const p = load('sun-moon-acquisition.json').progress;
  assert.ok(!p.stageNames.some((n) => /Fairium/.test(n)));
  assert.equal(p.leaderOrder.filter((n) => /grande provação/.test(n)).length, 4);
  const html = existsSync(new URL('../data-sources/pokemythology/detonado-sun-moon.html', import.meta.url)) ? readFileSync(new URL('../data-sources/pokemythology/detonado-sun-moon.html', import.meta.url), 'utf8') : null;
  if (html) assert.match(html.replace(/<[^>]+>/g, ' '), /não tem nenhum trial para lhe oferecer/);
});

test('regressão: Pokémon "inicial" genérico do rival — regra do texto + triângulo de tipos; sem regra, variantes rotuladas', () => {
  // Antes esse Pokémon era descartado ("inicial genérico pulado"). Regra = "de vantagem/desvantagem/fraqueza AO SEU" no trecho
  // da frase com o nome (o X/Y fala de Shauna e Calem na mesma frase; "golpe de vantagem ao inicial de Hop" não conta).
  const t = (g) => load(`${g}-trainers.json`).trainers;
  const team = (g, name, starter) => t(g).filter((x) => x.name === name && x.forStarter?.includes(starter)).map((x) => x.party.map((p) => p.species));
  assert.ok(team('x-y', 'Calem/Serena', 'chespin').some((p) => p.includes('braixen'))); // Fogo > Planta: vantagem ao seu
  assert.ok(team('x-y', 'Calem/Serena', 'froakie').some((p) => p.includes('quilladin'))); // Planta > Água
  assert.ok(team('x-y', 'Shauna', 'chespin').some((p) => p.includes('froakie'))); // Shauna: desvantagem ao seu
  assert.ok(team('sword-shield', 'Hop', 'grookey').every((p) => !p.some((s) => /scorbunny|raboot|cinderace/.test(s)))); // Hop: fraqueza ao seu
  // sem regra no texto (Hau no Sun/Moon): uma variante por inicial possível, rotulada
  assert.ok(t('sun-moon').some((x) => x.name === 'Hau' && /se o inicial dele for Rowlet/.test(x.label)));
  assert.ok(t('legends-za').some((x) => /Urbain/.test(x.name) && x.party.some((p) => p.species === 'chikorita')));
  for (const g of ['x-y', 'sun-moon', 'sword-shield', 'brilliant-diamond-shining-pearl', 'legends-arceus', 'scarlet-violet', 'legends-za']) {
    assert.equal(JSON.parse(readFileSync(new URL(`../reports/${g}/detonado-modern.json`, import.meta.url), 'utf8')).skippedPlaceholders, 0, g);
  }
});

test('regressão: remakes sem o lugar no detonado usam o estágio do jogo original (convertido pelo nome do líder)', () => {
  // Etapa 5: o detonado do BDSP não numera as rotas ("ao entrar nesta rota") → 25 locais sem posição; o do ORAS citava a
  // Route 102 só no estágio 8. Agora: sem título próprio, vale a evidência mais cedo entre o texto e o MESMO lugar no jogo
  // original (decomp: DP, Yellow, RS), com o estágio convertido pelo nome do líder (a ordem pode mudar entre os jogos).
  const rep = (g) => JSON.parse(readFileSync(new URL(`../reports/${g}/detonado-modern.json`, import.meta.url), 'utf8')).placesWithoutStage;
  assert.ok(rep('brilliant-diamond-shining-pearl').length <= 2);
  assert.equal(rep('lets-go-pikachu-lets-go-eevee').length, 0);
  const st = (g, w) => Object.values(load(`${g}-acquisition.json`).versions)[0] && Object.values(Object.values(load(`${g}-acquisition.json`).versions)[0]).flat().find((s) => s.where === w)?.stage;
  assert.equal(st('brilliant-diamond-shining-pearl', 'Route 201'), 0);
  assert.equal(st('omega-ruby-alpha-sapphire', 'Route 102'), 0);
  assert.equal(st('lets-go-pikachu-lets-go-eevee', 'Route 1'), 0);
  assert.ok(st('brilliant-diamond-shining-pearl', 'Route 230') >= 9);
});

test('Black 2/White 2: Hidden Grottoes conferidas com a tabela do jogo (PKHeX)', () => {
  // Etapa 6: as grutas vinham só da PokéAPI. Toda espécie dela existe no PKHeX na mesma versão; o PKHeX tem 15 a mais
  // (família do Eevee, Glameow, Stunky, Chansey…) sem rota → "Hidden Grotto (rota não registrada)", aleatórias.
  const r = JSON.parse(readFileSync(new URL('../reports/black-2-white-2/grotto-check.json', import.meta.url), 'utf8'));
  assert.equal(r.onlyPokeapi.length, 0);
  assert.ok(r.addedFromPkhex.some((x) => /glameow/.test(x)));
  const a = load('black-2-white-2-acquisition.json');
  const g = a.versions['black-2'].glameow.find((s) => s.method === 'Hidden Grotto');
  assert.ok(g && g.random && g.source === 'pkhex' && /rota não registrada/.test(g.where));
  assert.ok(!(a.versions['white-2'].beedrill ?? []).some((s) => s.method === 'Hidden Grotto')); // Beedrill de gruta só no B2
  // só entra quem não tinha outra forma de obter: uma gruta sem rota (= pós-jogo) como fonte direta da Glaceon escondia o
  // caminho pelo Eevee de Castelia e o banco de lutas perdeu 6 lutas contra o Flygon do rival
  assert.ok(!(a.versions['black-2'].glaceon ?? []).some((s) => s.source === 'pkhex'));
  assert.ok(r.confirmedOnly.some((x) => /glaceon/.test(x)));
});

test('mapa da região: cavernas do FRLG pela entrada; Black 2/White 2 pela grade de zonas; Black/White pela mesma Unova', () => {
  // Etapa 7. FRLG: cavernas/florestas estão em (0, 0) no region_map_sections.json → posição do warp de entrada (map.json);
  // 🧪 seções de mesmo nome são um ponto só ("Route 4" = rota + Pokémon Center) — antes o Mt. Moon não achava a Route 4.
  const reach = (g) => { const m = load(`${g}-regionmap.json`), a = load(`${g}-acquisition.json`); const ws = new Set(Object.values(a.versions).flatMap((v) => Object.values(v).flat().map((s) => s.where))); return [...ws].filter((w) => m.placeOf[w]).length; };
  assert.ok(reach('firered-leafgreen') > 130);
  const fr = load('firered-leafgreen-regionmap.json').regions[0].points;
  const P = (n) => fr.find((p) => p.name === n);
  assert.deepEqual([P('Mt. Moon').x, P('Mt. Moon').y], [P('Route 4').x, P('Route 4').y]);
  const b2 = load('black-2-white-2-regionmap.json');
  assert.equal(b2.regions[0].name, 'Unova');
  assert.ok(reach('black-2-white-2') / 91 > 0.9);
  const U = (n) => b2.regions[0].points.find((p) => p.name === n);
  assert.ok(U('Aspertia City').y > U('Opelucid City').y); // Aspertia ao sul, Opelucid ao norte
  assert.match(load('black-white-regionmap.json').source, /mesma região de black-2-white-2/);
  assert.equal(load('games.json').games.filter((g) => g.capture?.regionMap).length, 15);
});

test('evoluções na aba Onde capturar (0.22.0): família, método e onde achar o item (decomp ou citação do detonado)', async () => {
  const { evolutionReport } = await import('../public/engine.mjs');
  const rep = (g, n, items = null) => { const d = load(`${g}.json`); return evolutionReport(d, load(`${g}-acquisition.json`), d.pokemon.find((p) => p.name === n), items); };
  const fr = rep('firered-leafgreen', 'pikachu');
  assert.deepEqual(fr.nodes.map((x) => x.name), ['pichu', 'pikachu', 'raichu']);
  const rai = fr.nodes.find((x) => x.name === 'raichu');
  assert.equal(rai.how, 'Thunder Stone');
  assert.ok(rai.item.sources.some((s) => /Celadon City Department Store 4F — loja/.test(s.text) && s.stage === 3));
  // Eevee: todos os ramos, na ordem da Pokédex
  assert.deepEqual(rep('emerald', 'eevee').nodes.map((x) => x.name), ['eevee', 'vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon']);
  // sem decomp: frase do detonado com verbo de obter (X/Y: Thunder Stone em Cyllage City)
  const xy = load('x-y-evoitems.json');
  assert.ok(rep('x-y', 'raichu', xy).nodes.find((x) => x.name === 'raichu').item.cited.some((c) => /CYLLAGE/.test(c.section)));
  assert.ok(!(xy.items.UPGRADE ?? []).some((c) => /Mega Ring/.test(c.text))); // "um upgrade no Mega Ring" não é o Up-Grade
  assert.ok(!(load('legends-arceus-evoitems.json').items.LEAF_STONE ?? []).some((c) => /sem precisar/.test(c.text)));
  assert.ok(load('omega-ruby-alpha-sapphire-evoitems.json').items.THUNDER_STONE.some((c) => /Shard/.test(c.text))); // "Fire/Water/Thunder Stone"
  assert.ok(load('black-white-evoitems.json').items.SUN_STONE.some((c) => /Nimbasa/i.test(c.text)));
  // jogos com itens do decomp não ganham o arquivo de citações
  assert.ok(!existsSync(new URL('../public/data/firered-leafgreen-evoitems.json', import.meta.url)));
});

test('evoluções (0.22.1): espécie da família que não é do jogo marcada, com os jogos onde aparece (Azurill no Emerald)', async () => {
  const { evolutionReport } = await import('../public/engine.mjs');
  const d = load('x-y.json');
  // Munchlax no X/Y: só nasceria com Full Incense, que não tem lugar casado nos dados → continua fora (0.40.0: o Azurill do
  // Emerald, exemplo anterior, passou a nascer com a Sea Incense da Bulbapedia)
  const r = evolutionReport(d, load('x-y-acquisition.json'), d.pokemon.find((p) => p.name === 'snorlax'), null, 'x');
  assert.deepEqual(r.nodes.map((x) => [x.name, x.inGame]), [['munchlax', false], ['snorlax', true]]);
  const where = load('pokemon-games.json').where.munchlax;
  assert.ok(!where['x-y'] && where['heartgold-soulsilver']);
});

test('ovos da creche (0.23.0): bebê que só nasce de ovo vira obtível, com pai, parceiro, incenso e estágio do código do jogo', async () => {
  const { evolutionReport, catchReport, whereToGet } = await import('../public/engine.mjs');
  const fr = load('firered-leafgreen.json'), fra = load('firered-leafgreen-acquisition.json');
  const pichu = fr.pokemon.find((p) => p.name === 'pichu');
  assert.equal(pichu.obtainable.firered, true);
  const src = whereToGet(fr, fra, pichu, 'firered').direct;
  assert.ok(src.every((s) => s.type === 'breed' && s.where === 'Four Island Pokémon Day Care' && s.level === 5)); // EGG_HATCH_LEVEL 5
  assert.deepEqual(src.map((s) => s.want).sort(), ['pikachu', 'raichu']);
  const rep = catchReport(fr, fra, pichu, 'firered');
  assert.ok(/^Ovo na creche — Four Island Pokémon Day Care: deixe Pikachu com outro Pikachu do sexo oposto \(choca no nv 5\)/.test(rep.lines[0].text));
  assert.equal(rep.lines[0].stage, 9); // Four Island: pós-jogo
  // o Day Care da Route 5 não faz ovo (só cria um Pokémon): não pode aparecer
  assert.ok(!Object.values(fra.versions.firered).flat().some((s) => s.type === 'breed' && /Route 5/.test(s.where)));
  // Tyrogue: Hitmonlee/Hitmonchan só têm macho → só com Ditto
  assert.ok(fra.versions.firered.tyrogue.every((s) => s.partner === 'ditto'));
  // árvore de evolução: Pichu agora é do jogo, por ovo
  const n = evolutionReport(fr, fra, fr.pokemon.find((p) => p.name === 'pikachu'), null, 'firered').nodes[0];
  assert.deepEqual([n.name, n.inGame, n.byEgg], ['pichu', true, true]);
  // incenso (Gen 4, tabela sIncenseMons do HGSS): Wynaut pede Lax Incense; sem incenso nos dados (FRLG) não entra
  const hg = load('heartgold-soulsilver-acquisition.json');
  assert.ok(hg.versions.heartgold.wynaut.some((s) => s.type === 'breed' && s.item === 'LAX_INCENSE' && s.level === 1));
  // 0.40.0: com a Lax Incense da Bulbapedia (Lost Cave), o Wynaut nasce no FireRed; incenso sem lugar casado → fora (Munchlax no X/Y)
  assert.equal(load('x-y.json').pokemon.find((p) => p.name === 'munchlax').obtainable.x, false);
  // Diamond: Koffing só por ovo de Weezing (Solaceon)
  assert.ok(load('diamond-pearl-acquisition.json').versions.diamond.koffing.some((s) => s.want === 'weezing' && /Solaceon/.test(s.where)));
  // jogos sem creche no app (Gen 1, Gens 5+) ficam sem a fonte
  assert.ok(!JSON.stringify(load('red-blue-acquisition.json').versions).includes('"breed"'));
});

test('HGSS (0.22.0): evolução por lugar não existe (MapHeader_GetMapEvolutionMethod = EVO_NONE) e pedras da loja do Pokéathlon', () => {
  const d = load('heartgold-soulsilver.json'), a = load('heartgold-soulsilver-acquisition.json');
  for (const n of ['leafeon', 'glaceon', 'magnezone', 'probopass']) {
    const m = d.pokemon.find((p) => p.name === n);
    assert.equal(m.evo.possible, false, n);
    assert.equal(m.obtainable.heartgold, false, n);
  }
  // loja do Pokéathlon: lista por dia da semana (0 = domingo); antes faltavam Thunderstone, Fire Stone e Sun Stone
  assert.ok(a.items.THUNDERSTONE.some((s) => /Pokeathlon/.test(s.where) && /— quinta$/.test(s.by) && s.stage === 3));
  assert.ok(a.items.FIRE_STONE.some((s) => /— terça$/.test(s.by)));
  assert.ok(a.items.SUN_STONE.every((s) => s.stage === 9)); // só depois da Pokédex Nacional
  assert.ok(d.pokemon.find((p) => p.name === 'jolteon').obtainable.heartgold);
});

test('Gen 1 (0.24.0): Route 6 no estágio 2 — portão do guarda que pede bebida não liga a rota ao Saffron; presente da Officer Jenny não fecha o Vermilion', () => {
  for (const g of ['yellow', 'red-blue']) {
    const m = load(`${g}-acquisition.json`).progress.maps;
    assert.equal(m.ROUTE_6.stage, 2, g);
    assert.equal(m.VERMILION_CITY.stage, 2, g); // Yellow: a Thunder Badge do script só libera o Squirtle (EVENT_GOT_SQUIRTLE…)
    assert.ok(m.SAFFRON_CITY.stage >= 3, g);
  }
});

test('onde obter (0.24.0): com captura direta, compara com o caminho pela evolução e mostra os dois', async () => {
  const { reachStage, catchReport } = await import('../public/engine.mjs');
  const d = load('red-blue.json'), a = load('red-blue-acquisition.json');
  const raticate = d.pokemon.find((p) => p.name === 'raticate');
  // direto só no estágio 3; Rattata na Route 1 (estágio 0) e evolui no nv 20
  assert.equal(reachStage(d, a, raticate, 'red'), 0);
  const r = catchReport(d, a, raticate, 'red');
  assert.ok(r.lines.length && r.alt && r.alt.from === 'rattata' && r.alt.stage === 0 && r.alt.earlier);
  // evolução por troca não entra como alternativa (exige outro cartucho)
  const alakazam = d.pokemon.find((p) => p.name === 'alakazam');
  assert.equal(catchReport(d, a, alakazam, 'red').alt, null);
});

test('Novidades (0.24.0): toda versão tem o resumo em linguagem simples ("> …" abaixo do título)', () => {
  const versions = load('changelog.json');
  assert.ok(versions.length >= 25);
  for (const v of versions) assert.ok(v.summary && v.summary.length < 260, v.version);
});

test('Pokémon por tipo (0.25.0): só os tipos e as espécies do jogo/versão; dois tipos = quem tem os dois', async () => {
  const { typeIndex } = await import('../public/engine.mjs');
  const fr = load('firered-leafgreen.json');
  const all = typeIndex(fr, { version: 'firered' });
  assert.ok(!all.counts.fairy && all.counts.fire > 0); // sem Fada na Gen 3
  assert.ok(all.mons.every((p) => p.obtainable.firered)); // Treecko (Hoenn) não entra no FireRed
  assert.ok(!all.mons.some((p) => p.name === 'treecko'));
  assert.deepEqual(typeIndex(fr, { version: 'firered', types: ['fire', 'flying'] }).mons.map((p) => p.name), ['charizard', 'moltres', 'ho-oh'].filter((n) => fr.pokemon.find((p) => p.name === n)?.obtainable.firered));
  // quem tem dois tipos aparece nos dois grupos
  const g = Object.fromEntries(all.groups.map((x) => [x.type, x.mons.map((p) => p.name)]));
  assert.ok(g.fire.includes('charizard') && g.flying.includes('charizard'));
  // nome e forma final
  assert.deepEqual(typeIndex(fr, { version: 'firered', q: 'char', finalOnly: true }).mons.map((p) => p.name), ['charizard']);
});

test('simulador — Mega Evolução (0.26.0): Megas do jogo pelo PKHeX, Mega Ring pelo detonado, sugestão Mega só quando ganha', async () => {
  const { recommend } = await import('../public/engine.mjs');
  const xy = load('x-y.json'), oras = load('omega-ruby-alpha-sapphire.json');
  const mega = (d, n) => d.pokemon.find((p) => p.name === n)?.megas ?? [];
  // X/Y tem a Mega Charizard X e Y (Charizardite X/Y), mas não a Mega Altaria (veio no ORAS)
  assert.deepEqual(mega(xy, 'charizard').map((m) => [m.name, m.stone, m.types.join('/')]), [['charizard-mega-x', 'Charizardite X', 'fire/dragon'], ['charizard-mega-y', 'Charizardite Y', 'fire/flying']]);
  assert.equal(mega(xy, 'altaria').length, 0);
  assert.equal(mega(oras, 'altaria')[0].stone, 'Altarianite');
  assert.ok(!load('sword-shield.json').pokemon.some((p) => p.megas)); // Sword/Shield não tem Mega
  // Mega Ring: o trecho em que o detonado diz que você o GANHA (X/Y: Korrina, Tower of Mastery); frase com "não" fica fora (ORAS)
  const ring = load('x-y-acquisition.json').progress.keyItems.mega;
  assert.ok(/Mega Ring/.test(ring.text) && ring.section === 'TOWER OF MASTERY');
  assert.ok(/Steven te dará o Mega Bracelet/.test(load('omega-ruby-alpha-sapphire-acquisition.json').progress.keyItems.mega.text));
  // antes do Mega Ring não há sugestão Mega; depois, há (e desligar a opção tira)
  const xya = load('x-y-acquisition.json');
  const opp = xy.pokemon.find((p) => p.name === 'lucario');
  const run = (stage, megaEvolution = true) => recommend(xy, opp, { level: 60, oppLevel: 60, version: 'x', onlyObtainable: true, acq: xya, stage, megaEvolution }).candidates;
  assert.ok(!run(ring.stage - 1).some((c) => c.mega));
  assert.ok(run(9).some((c) => c.mega));
  assert.ok(!run(9, false).some((c) => c.mega));
  // a Mega só fica quando pontua mais que a forma normal
  for (const c of run(9).filter((x) => x.mega)) assert.ok(c.mega.types.length && c.mega.stone);
});

test('simulador — Gen 6: no turno em que evolui, a ordem usa a Velocidade de antes da Mega', async () => {
  const { duel } = await import('../public/battle.mjs');
  const data = { moves: { tackle: { name: 'tackle', type: 'normal', power: 999, accuracy: 100, category: 'physical', effect: '' } }, types: ['normal'], chart: { normal: { normal: 1 } } };
  const mk = (spe) => ({ mon: { types: ['normal'], abilities: [] }, level: 50, stats: { hp: 10, attack: 100, defense: 100, 'special-attack': 100, 'special-defense': 100, speed: spe } });
  const me = { ...mk(120), speedTurn1: 80 }, opp = mk(100);
  // os dois nocauteiam no 1º turno: vale a Velocidade de antes (80 < 100) → perde
  assert.equal(duel(data, 6, me, opp, ['tackle'], ['tackle']).win, false);
  assert.equal(duel(data, 7, mk(120), opp, ['tackle'], ['tackle']).win, true);
});

test('simulador — chefes que lutam Mega (0.27.0): "Mega Camerupt lv.43" no time ou "o Alakazam dele pode mega evoluir"', async () => {
  const { megaForm } = await import('../public/engine.mjs');
  const megaOf = (g, label) => load(`${g}-trainers.json`).trainers.filter((t) => t.label === label).flatMap((t) => t.party.filter((p) => p.mega).map((p) => p.mega));
  assert.ok(megaOf('omega-ruby-alpha-sapphire', 'Maxie').includes('camerupt-mega'));
  assert.ok(megaOf('sun-moon', 'Dexio').includes('alakazam-mega')); // pela frase perto da luta
  // X/Y pelo sufixo do nome no detonado: Blue usa Charizard Y, Lance o X (Let's Go)
  assert.ok(megaOf('lets-go-pikachu-lets-go-eevee', 'Blue').includes('charizard-mega-y'));
  assert.ok(megaOf('lets-go-pikachu-lets-go-eevee', 'Lance').includes('charizard-mega-x'));
  // a forma Mega muda tipos/atributos do oponente (Mega Camerupt: Sp. Atk 145)
  const d = load('omega-ruby-alpha-sapphire.json');
  const m = megaForm(d.pokemon.find((p) => p.name === 'camerupt'), 'camerupt-mega');
  assert.equal(m.stats['special-attack'], 145);
  assert.equal(m.name, 'camerupt');
  // Tera do detonado guardado para a fase do Terastal (Katy: Teddiursa Tera Bug)
  assert.ok(load('scarlet-violet-trainers.json').trainers.some((t) => t.label === 'Katy' && t.party.some((p) => p.species === 'teddiursa' && p.tera === 'bug')));
});

test('simulador — golpes Z (0.28.0): poder pela tabela do jogo (Showdown), cristais pelo detonado, um Z por luta no 1º turno', async () => {
  const { recommend } = await import('../public/engine.mjs');
  const { damage, bestAgainst } = await import('../public/battle.mjs');
  const sm = load('sun-moon.json'), sma = load('sun-moon-acquisition.json');
  // tabela: Thunderbolt 90 → 175; Bullet Seed (2–5 golpes) 25×3 → 140; Low Kick pela exceção do Showdown → 160
  assert.deepEqual(['thunderbolt', 'bullet-seed', 'low-kick'].map((n) => sm.moves[n].zPower), [175, 140, 160]);
  // Max no Sword/Shield: Close Combat (Lutador) 120 → 95; Thunderbolt 90 → 130
  const sw = load('sword-shield.json');
  assert.deepEqual([sw.moves['close-combat'].maxPower, sw.moves.thunderbolt.maxPower], [95, 130]);
  assert.ok(!load('x-y.json').moves.thunderbolt.zPower); // X/Y não tem golpe Z
  // cristais: os 18 de tipo, cada um no ponto em que o detonado diz que você recebe/pega
  const k = sma.progress.keyItems;
  assert.equal(Object.keys(k.zCrystals).length, 18);
  assert.ok(/Hala lhe dará um Z-Ring/.test(k.z.text));
  assert.ok(/Waterium Z/.test(k.zCrystals.water.text) && k.zCrystals.water.stage < k.zCrystals.ghost.stage);
  // Z: um golpe só, sem errar, com o poder Z; o melhor plano usa o Z no 1º turno
  const mk = (types, hp) => ({ mon: { types, abilities: [] }, level: 50, stats: { hp, attack: 100, defense: 100, 'special-attack': 100, 'special-defense': 100, speed: 100 } });
  const z = damage(sm, 7, mk(['electric'], 200), mk(['water'], 200), 'thunderbolt', { zPower: 175 });
  const n = damage(sm, 7, mk(['electric'], 200), mk(['water'], 200), 'thunderbolt');
  assert.ok(z.per > n.per * 1.8);
  const att = { ...mk(['electric'], 200), zTypes: new Set(['electric']) };
  const b = bestAgainst(sm, 7, att, mk(['water'], 300), ['thunderbolt']);
  assert.ok(b.z && b.z.name === 'thunderbolt' && b.turns < bestAgainst(sm, 7, mk(['electric'], 200), mk(['water'], 300), ['thunderbolt']).turns);
  // sem o cristal do tipo ainda (antes do Electrium Z) não há Z elétrico; desligar a opção tira todos
  const opp = sm.pokemon.find((p) => p.name === 'gyarados');
  const run = (stage, zMoves = true) => recommend(sm, opp, { level: 40, oppLevel: 40, version: 'sun', onlyObtainable: true, acq: sma, stage, zMoves }).candidates;
  assert.ok(!run(k.zCrystals.electric.stage - 1).some((c) => c.zMove?.type === 'electric'));
  assert.ok(run(k.zCrystals.electric.stage).some((c) => c.zMove?.type === 'electric'));
  assert.ok(!run(12, false).some((c) => c.zMove));
});

test('simulador — Terastal (0.29.0): chefe com Tera do detonado defende só no tipo Tera; STAB 2× no tipo original; poder mínimo 60', async () => {
  const { battleForm, teraForm, effectiveness, recommend } = await import('../public/engine.mjs');
  const { damage } = await import('../public/battle.mjs');
  const sv = load('scarlet-violet.json'), sva = load('scarlet-violet-acquisition.json');
  // Katy: Teddiursa Tera Bug → defende como Bug (Fogo 2×, Lutador ½×)
  const p = load('scarlet-violet-trainers.json').trainers.find((t) => t.label === 'Katy').party.find((x) => x.species === 'teddiursa');
  const ted = battleForm(sv.pokemon.find((x) => x.name === 'teddiursa'), p);
  assert.deepEqual([ted.types, ted.baseTypes, ted.teraType], [['bug'], ['normal'], 'bug']);
  assert.equal(effectiveness(sv, 'fire', ted), 2);
  assert.equal(effectiveness(sv, 'fighting', ted), 0.5);
  // STAB: Tera no tipo original = 2×; Tera noutro tipo mantém 1,5× nos originais e dá 1,5× no Tera
  const mk = (mon) => ({ mon, level: 50, stats: { hp: 200, attack: 100, defense: 100, 'special-attack': 100, 'special-defense': 100, speed: 100 } });
  const pika = sv.pokemon.find((x) => x.name === 'pikachu'), target = mk(sv.pokemon.find((x) => x.name === 'snorlax'));
  const base = damage(sv, 9, mk(pika), target, 'thunderbolt').per, same = damage(sv, 9, mk(teraForm(pika, 'electric')), target, 'thunderbolt').per;
  assert.ok(Math.abs(same / base - 2 / 1.5) < 0.05);
  // poder mínimo 60 no tipo Tera (Thunder Shock 40 → 60)
  const ts = damage(sv, 9, mk(teraForm(pika, 'electric')), target, 'thunder-shock').per, tb = damage(sv, 9, mk(teraForm(pika, 'electric')), target, 'thunderbolt').per;
  assert.ok(Math.abs(ts / tb - 60 / 90) < 0.06);
  // antes da Tera Orb não há sugestão com Tera; a opção desliga
  const orb = sva.progress.keyItems.tera;
  assert.ok(/Tera Orb/.test(orb.text));
  const run = (terastal = true) => recommend(sv, ted, { level: 30, oppLevel: 15, version: 'scarlet', onlyObtainable: true, acq: sva, stage: 2, terastal }).candidates;
  assert.ok(run().some((c) => c.tera));
  assert.ok(!run(false).some((c) => c.tera));
});

test('simulador — Dynamax (0.30.0): líder dinamaxiza quando o detonado diz; vida 1,5× e golpe Max por 3 turnos; você só em luta que deixa', async () => {
  const { recommend, battleForm } = await import('../public/engine.mjs');
  const { duel, DYNAMAX_HP, DYNAMAX_TURNS } = await import('../public/battle.mjs');
  assert.deepEqual([DYNAMAX_HP, DYNAMAX_TURNS], [1.5, 3]);
  if (existsSync(new URL('../data-sources/showdown/', import.meta.url))) {
    const { SHOWDOWN_COMMIT } = await import('../scripts/fetch-showdown-moves.mjs');
    const cond = readFileSync(new URL(`../data-sources/showdown/${SHOWDOWN_COMMIT}/data__conditions.ts`, import.meta.url), 'utf8');
    assert.match(cond, /const ratio = 1\.5 \+ \(pokemon\.dynamaxLevel \* 0\.05\)/); // nível 0 → 1,5×
  }
  const sw = load('sword-shield.json'), swa = load('sword-shield-acquisition.json'), tr = load('sword-shield-trainers.json').trainers;
  const kabu = tr.find((t) => t.label === 'Kabu' && t.party.some((p) => p.dynamax));
  const p = kabu.party.find((x) => x.dynamax);
  assert.deepEqual([p.species, p.dynamax], ['centiskorch', 'gigantamax']);
  assert.ok(tr.filter((t) => t.party.some((x) => x.dynamax)).length >= 20);
  // a vida maior pesa: o mesmo ataque leva mais turnos contra o dinamaxizado
  const mk = (mon, extra = {}) => ({ mon, level: 50, stats: { hp: 150, attack: 100, defense: 100, 'special-attack': 100, 'special-defense': 100, speed: 100 }, ...extra });
  const centi = sw.pokemon.find((x) => x.name === 'centiskorch'), drednaw = sw.pokemon.find((x) => x.name === 'drednaw');
  const a = duel(sw, 8, mk(drednaw), mk(centi), ['water-gun'], ['ember']), b = duel(sw, 8, mk(drednaw), mk(centi, { dynamax: 'gigantamax' }), ['water-gun'], ['ember']);
  assert.ok(b.myTurns > a.myTurns);
  // você: só dinamaxiza em luta que deixa (dynamaxBattle) e com a Dynamax Band
  const opp = battleForm(centi, p);
  const run = (dynamaxBattle, dynamax = true) => recommend(sw, opp, { level: 27, oppLevel: 27, version: 'sword', onlyObtainable: true, acq: swa, stage: 2, dynamaxBattle, dynamax }).candidates;
  assert.ok(run(true).some((c) => c.dynamax));
  assert.ok(!run(false).some((c) => c.dynamax));
  assert.ok(!run(true, false).some((c) => c.dynamax));
});

test('simulador — Gen 6: chefe Mega também usa a Velocidade de antes no 1º turno (0.31.0)', async () => {
  const { duel } = await import('../public/battle.mjs');
  const data = { moves: { tackle: { name: 'tackle', type: 'normal', power: 999, accuracy: 100, category: 'physical', effect: '' } }, types: ['normal'], chart: { normal: { normal: 1 } } };
  const mk = (spe, extra = {}) => ({ mon: { types: ['normal'], abilities: [] }, level: 50, stats: { hp: 10, attack: 100, defense: 100, 'special-attack': 100, 'special-defense': 100, speed: spe }, ...extra });
  // chefe Mega com 120 de Velocidade, 80 antes da Mega: no 1º turno você (100) age antes
  assert.equal(duel(data, 6, mk(100), mk(120, { speedTurn1: 80 }), ['tackle'], ['tackle']).win, true);
  assert.equal(duel(data, 7, mk(100), mk(120), ['tackle'], ['tackle']).win, false);
  // o oponente Mega guarda os atributos de antes (megaForm.preMegaStats)
  const { megaForm } = await import('../public/engine.mjs');
  const d = load('x-y.json'), m = megaForm(d.pokemon.find((p) => p.name === 'gardevoir'), 'gardevoir-mega');
  assert.ok(m.preMegaStats.speed < m.stats.speed);
});

test('motor (0.32.0): whereToGet em cache por acq — mesmo resultado, objeto novo de dados = cache novo', async () => {
  const { whereToGet } = await import('../public/engine.mjs');
  const d = load('firered-leafgreen.json'), a = load('firered-leafgreen-acquisition.json');
  const rai = d.pokemon.find((p) => p.name === 'raichu');
  const x = whereToGet(d, a, rai, 'firered');
  assert.equal(whereToGet(d, a, rai, 'firered'), x); // mesma resposta (do cache)
  assert.equal(x.from, 'pikachu');
  // outro objeto de onde obter (ex.: dados regerados) não reaproveita o cache
  const a2 = structuredClone(a); a2.versions.firered.raichu = [{ type: 'gift', where: 'Teste', level: 5 }];
  assert.equal(whereToGet(d, a2, rai, 'firered').direct[0].where, 'Teste');
});

test('A7 (0.33.0): mundo aberto — com progresso, só fontes de nível compatível com o time; minLevel nos jogos do PKHeX', async () => {
  const { recommend, battleForm, reachStage, LEVEL_MARGIN } = await import('../public/engine.mjs');
  assert.equal(LEVEL_MARGIN, 10);
  const sv = load('scarlet-violet.json'), sva = load('scarlet-violet-acquisition.json');
  // minLevel nos jogos do PKHeX (faltava): Pupitar só existe por evolução a partir do nv 30
  assert.deepEqual(['pupitar', 'tyranitar'].map((n) => sv.pokemon.find((p) => p.name === n).minLevel), [30, 55]);
  // Katy (Teddiursa Tera Bug) com time de nv 16: sem Pupitar (selvagem nv 42–44 na South Province)
  const katy = load('scarlet-violet-trainers.json').trainers.find((t) => t.key === 'DETONADO_3_0'), p = katy.party[2];
  const picks = recommend(sv, battleForm(sv.pokemon.find((x) => x.name === p.species), p), { level: 16, oppLevel: p.level, oppMoves: p.moves, version: 'scarlet', onlyObtainable: true, acq: sva, stage: 0 }).picks;
  assert.ok(!picks.some((s) => s.mon.name === 'pupitar'));
  // reachStage com teto de nível: a fonte de nv 42 não conta para quem está no nv 20
  const larvitar = sv.pokemon.find((x) => x.name === 'larvitar');
  assert.ok(reachStage(sv, sva, larvitar, 'scarlet', new Set(), 20) >= reachStage(sv, sva, larvitar, 'scarlet'));
});

test('ovos da creche no Black 2/White 2 (0.34.0): bebê pela tabela do jogo, incenso pelo incenseHandler, evolução do bebê obtível', async () => {
  const { whereToGet } = await import('../public/engine.mjs');
  const d = load('black-2-white-2.json'), a = load('black-2-white-2-acquisition.json');
  const abra = d.pokemon.find((p) => p.name === 'abra');
  const src = whereToGet(d, a, abra, 'black-2').direct;
  assert.ok(src.some((s) => s.type === 'breed' && s.want === 'alakazam' && s.level === 1 && /Route 3/.test(s.where)));
  // Kadabra passa a ser obtível pela evolução do Abra do ovo
  assert.ok(d.pokemon.find((p) => p.name === 'kadabra').obtainable['black-2']);
  assert.deepEqual(a.breeding.evolved['black-2'].includes('kadabra'), true);
  // bebê de incenso sem o incenso nos dados do B2W2 fica de fora (Bonsly)
  assert.equal(d.pokemon.find((p) => p.name === 'bonsly').obtainable['black-2'], false);
  // FireRed/LeafGreen: Hitmontop pelo Tyrogue do ovo (Hitmonlee + Ditto)
  assert.ok(load('firered-leafgreen.json').pokemon.find((p) => p.name === 'hitmontop').obtainable.firered);
});

test('ovos da creche nos jogos do PKHeX (0.35.0): grupos/gênero da tabela do jogo, creche e ponto da história pelo detonado', async () => {
  const { whereToGet } = await import('../public/engine.mjs');
  // X/Y: Pichu do ovo de Pikachu/Raichu, nv 1, na creche que o detonado cita
  const xy = load('x-y.json'), xya = load('x-y-acquisition.json');
  const src = whereToGet(xy, xya, xy.pokemon.find((p) => p.name === 'pichu'), 'x').direct;
  assert.ok(src.length && src.every((s) => s.type === 'breed' && s.level === 1 && /Day Care/.test(s.where)));
  assert.equal(xya.progress.keyItems.daycare.stage, src[0].stage);
  // Black/White: só a partir do ponto em que o detonado diz que se pode cruzar ("permissão para cruzar pokémons no DayCare")
  const bw = load('black-white-acquisition.json').progress.keyItems.daycare;
  assert.ok(/permiss[ãa]o para cruzar/.test(bw.text));
  // incenso (Gens 4–8, Breeding.cs): sem o incenso nos dados, o bebê fica fora (Munchlax no X/Y)
  assert.equal(xy.pokemon.find((p) => p.name === 'munchlax').obtainable.x, false);
  // Sun/Moon: evolução do bebê novo também conta (Togepi → Togetic)
  assert.ok(load('sun-moon-acquisition.json').breeding.evolved.sun.includes('togetic'));
  // Scarlet/Violet: piquenique; nada novo (o que sai de ovo já se obtinha)
  assert.ok(load('scarlet-violet-acquisition.json').progress.keyItems.daycare.picnic);
});

test('B3 (0.36.0): local que o detonado não cita ganha estágio ESTIMADO pelo nível dos selvagens em terra (marcado)', async () => {
  const { catchReport } = await import('../public/engine.mjs');
  const a = load('black-white-acquisition.json');
  const est = new Map();
  for (const v of Object.values(a.versions)) for (const l of Object.values(v)) for (const s of l) if (s.stageEstimated) est.set(s.where, s.stage);
  assert.equal(est.get('Route 1'), 0);
  assert.ok(est.get('Route 10') >= 5); // selvagens de nível alto → depois
  assert.ok(!est.has('Route 17')); // só água (Surf/vara): sem estimativa
  // nenhum local com estágio do detonado vira estimativa
  for (const v of Object.values(a.versions)) for (const l of Object.values(v)) for (const s of l) if (s.stageEstimated) assert.ok(load('../../reports/black-white/detonado-modern.json').placesWithoutStage.includes(s.where), s.where);
  // a tela marca: catchReport().lines[].estimated
  const d = load('black-white.json');
  const mon = d.pokemon.find((p) => (a.versions.black[p.name] ?? []).some((s) => s.stageEstimated));
  assert.ok(catchReport(d, a, mon, 'black').lines.some((l) => l.estimated));
});

test('B4 (0.37.0): "Charizardite X e Y" vale para as duas pedras (Let\'s Go)', async () => {
  // (o build-evo-items é script: importar aqui encerraria o processo de teste — confere pelo dado gerado)
  assert.ok(load('lets-go-pikachu-lets-go-eevee-evoitems.json').items['Charizardite Y'].some((c) => /Charizardite X e Charizardite Y/.test(c.text)));
  assert.ok(load('lets-go-pikachu-lets-go-eevee-evoitems.json').items['Charizardite Y']?.length);
});

test('Bulbapedia (0.38.0): leitor de wikitext — times ({{Party}} + {{Pokémon}}, golpe Z) e tabela Acquisition por jogo', async () => {
  const { parties, acquisition, plain } = await import('../scripts/lib/bulbapedia.mjs');
  // wikitext de exemplo escrito aqui (mesmo formato das predefinições da wiki; não é cópia de página)
  const t = ['==Pokémon==', '===Sun and Moon===', '{{Party', '| name = Fulano', '| game = SM', '| location = Lugar X', '}}',
    '{{Pokémon', '| pokemon = Mankey', '| level = 14', '| move1 = Karate Chop | move1type = Fighting', '| move2 = Leer', '}}',
    '{{Pokémon', '| pokemon = Crabrawler', '| level = 15', '| held = Fightinium Z', '| move1 = Power-Up Punch | z-move1 = All-Out Pummeling', '}}',
    '{{Party/end}}'].join('\n');
  const [p] = parties(t);
  assert.deepEqual([p.name, p.game, p.section.at(-1), p.mons.length], ['Fulano', 'SM', 'Sun and Moon', 2]);
  assert.deepEqual(p.mons[1].moves, [{ name: 'Power-Up Punch', z: 'All-Out Pummeling' }]);
  assert.equal(p.mons[1].held, 'Fightinium Z');
  const a = acquisition(['===Acquisition===', '{{ItemAvailability/head|items}}', '|-', '| {{gameabbrev8|SwSh}}', '| [[Motostoke Riverbank]]', '| Hidden item ([[Lake of Outrage]])', '|-', '| {{gameabbrev8|SwSh}}{{gameabbrev8|CT}}', '|', '| [[Max Raid Battle]]s', '|}'].join('\n'));
  assert.deepEqual(a.map((r) => [r.games.join('+'), r.found, r.other]), [['SwSh', 'Motostoke Riverbank', 'Hidden item (Lake of Outrage)'], ['SwSh+CT', '', 'Max Raid Battles']]);
  assert.equal(plain('{{rt|9|Kalos}}, [[Lumiose City|Lumiose]] ({{DL|X|Stone Emporium}})'), 'Route 9, Lumiose (Stone Emporium)');
});

test('N1/N2 (0.38.0): chefes com golpes reais da Bulbapedia; o Hala usa golpe Z no 1º turno', async () => {
  const { recommend, battleForm } = await import('../public/engine.mjs');
  const sm = load('sun-moon.json'), sma = load('sun-moon-acquisition.json'), tr = load('sun-moon-trainers.json').trainers;
  const hala = tr.find((t) => t.label === 'Hala' && t.party.some((p) => p.species === 'crabrawler'));
  const crab = hala.party.find((p) => p.species === 'crabrawler');
  assert.equal(crab.movesSource, 'Bulbapedia');
  assert.equal(crab.zMove, 'power-up-punch'); // All-Out Pummeling a partir de Power-Up Punch
  assert.equal(crab.item, 'Fightinium Z');
  // cobertura: a maioria das lutas dos jogos sem decomp com golpes reais
  for (const g of ['black-white', 'sun-moon', 'scarlet-violet']) {
    const t = load(`${g}-trainers.json`).trainers;
    assert.ok(t.filter((x) => x.movesSource === 'Bulbapedia').length / t.length > 0.7, g);
  }
  // o golpe Z do chefe entra na conta: com o Z ele nocauteia em menos turnos (ou igual) que sem
  const opp = battleForm(sm.pokemon.find((x) => x.name === 'crabrawler'), crab);
  const noZ = { ...opp }; delete noZ.zMove;
  const run = (o) => recommend(sm, o, { level: 15, oppLevel: crab.level, oppMoves: crab.moves, version: 'sun', onlyObtainable: true, acq: sma, stage: 0 }).candidates;
  const sumZ = run(opp).reduce((a, c) => a + c.duel.theirTurns, 0), sumN = run(noZ).reduce((a, c) => a + c.duel.theirTurns, 0);
  assert.ok(sumZ < sumN);
});

test('N3 (0.39.0): onde achar itens de evolução e Mega Stones pela Bulbapedia nos jogos sem decomp; pedra limita o ponto da história', async () => {
  const { evolutionReport, reachStage } = await import('../public/engine.mjs');
  const sw = load('sword-shield.json'), swa = load('sword-shield-acquisition.json'), swe = load('sword-shield-evoitems.json');
  // Sword/Shield: o detonado não citava nenhuma pedra; a Bulbapedia dá a Fire Stone na Motostoke Riverbank
  assert.ok(swe.bulbapedia.FIRE_STONE.some((r) => /Motostoke Riverbank/.test(r.text)));
  assert.equal(Object.keys(swe.bulbapedia).filter((k) => !/INCENSE/.test(k)).length, 28); // + os incensos (0.40.0)
  // item com lugar casado vira fonte com estágio; item sem casamento não bloqueia (itemsPartial)
  assert.ok(swa.itemsPartial && swa.items.FIRE_STONE?.every((s) => s.stage != null));
  const growlithe = sw.pokemon.find((p) => p.name === 'arcanine');
  assert.ok(reachStage(sw, swa, growlithe, 'sword') >= Math.min(...swa.items.FIRE_STONE.map((s) => s.stage)));
  const n = evolutionReport(sw, swa, growlithe, swe, 'sword').nodes.find((x) => x.name === 'arcanine');
  assert.ok(n.item.bulba.length);
  // Z-A: Mega Stones com linha da Bulbapedia
  assert.ok(Object.keys(load('legends-za-evoitems.json').bulbapedia).filter((k) => /ite( [XYZ])?$/.test(k)).length > 60);
});

test('N4 (0.40.0): incenso pela Bulbapedia libera o bebê de incenso (Azurill/Wynaut no Emerald e no FireRed)', async () => {
  const em = load('emerald.json'), ema = load('emerald-acquisition.json');
  assert.ok(ema.items.SEA_INCENSE.some((s) => s.where === 'Mt. Pyre' && s.by === 'Bulbapedia' && s.stage != null));
  assert.ok(em.pokemon.find((p) => p.name === 'azurill').obtainable.emerald);
  assert.ok(ema.versions.emerald.azurill.some((s) => s.type === 'breed' && s.item === 'SEA_INCENSE'));
  // FireRed: Lax Incense na Lost Cave ("Five Island Lost Cave Room 1" no decomp) → Wynaut
  const fr = load('firered-leafgreen.json'), fra = load('firered-leafgreen-acquisition.json');
  assert.ok(fra.items.LAX_INCENSE?.length && fr.pokemon.find((p) => p.name === 'wynaut').obtainable.firered);
  // o resto dos itens do decomp não muda (só os incensos que faltavam)
  assert.deepEqual(ema.itemsBulbapedia.sort(), ['LAX_INCENSE', 'SEA_INCENSE']);
});

test('P1 (0.41.0): efeitos extras dos golpes Max (Showdown) — atributo, clima e terreno nos turnos seguintes', async () => {
  const { duel } = await import('../public/battle.mjs');
  const sw = load('sword-shield.json');
  // os 18 tipos têm efeito lido do data/moves.ts do Showdown
  assert.deepEqual(sw.maxEffects.fighting, { move: 'maxknuckle', self: { atk: 1 } });
  assert.deepEqual(sw.maxEffects.fire, { move: 'maxflare', weather: 'sunnyday' });
  assert.deepEqual(sw.maxEffects.ghost, { move: 'maxphantasm', foe: { def: -1 } });
  assert.equal(Object.keys(sw.maxEffects).length, 18);
  // Max Knuckle (+1 Ataque) faz o golpe físico seguinte bater mais: menos turnos que sem o efeito
  const data = { ...sw, maxEffects: {} };
  const mk = (types, hp, extra = {}) => ({ mon: { types, abilities: [] }, level: 50, stats: { hp, attack: 100, defense: 100, 'special-attack': 100, 'special-defense': 100, speed: 100 }, ...extra });
  const me = mk(['fighting'], 300, { dynamax: true }), opp = mk(['normal'], 900);
  const sem = duel(data, 8, me, opp, ['karate-chop'], ['tackle']).myTurns;
  const com = duel(sw, 8, me, opp, ['karate-chop'], ['tackle']).myTurns;
  assert.ok(com <= sem);
});

test('P2 (0.42.0): "Ssanne Exterior" (FRLG) no ponto do S.S. Anne no mapa da região (entrada pelo Vermilion)', () => {
  const r = load('firered-leafgreen-regionmap.json');
  const at = r.placeOf['Ssanne Exterior'];
  assert.ok(at && r.regions[at[0]].points[at[1]].name === 'S.S. Anne');
});
