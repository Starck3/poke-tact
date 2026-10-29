// Leitores de wikitext da Bulbapedia (I3, PLANO-EXECUCAO-7) com trechos de exemplo — sem rede e sem data-sources/, rodam
// também num clone limpo. Os trechos são ESCRITOS À MÃO no formato das predefinições da Bulbapedia (nada copiado das
// páginas: o cache fica só em data-sources/bulbapedia/). Cada caso é um formato que já quebrou a leitura (versão entre
// parênteses). Se a Bulbapedia mudar o formato, a leitura nova tem que continuar passando aqui.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plain, parties, linkPlaces, acquisition } from '../scripts/lib/bulbapedia.mjs';
import { catchRows, formKey, pctOf } from '../scripts/lib/bulbapedia-catch.mjs';

test('plain: links, rotas, predefinições, negrito e &nbsp;', () => {
  assert.equal(plain("[[Lumiose City|Lumiose]] e {{rt|4|Kalos}}"), 'Lumiose e Route 4');
  assert.equal(plain("{{p|Pikachu}} com {{m|Thunder Shock}} e {{i|Oran Berry}}"), 'Pikachu com Thunder Shock e Oran Berry');
  assert.equal(plain("'''Lv.&nbsp;12'''<br>{{sup/7|US}}fim"), 'Lv. 12; fim');
  assert.equal(plain('{{tt|*|nota}}Exemplo<sup>1</sup>'), 'Exemplo1');
});

test('linkPlaces: destino do link (0.48.0), não o texto mostrado', () => {
  assert.deepEqual(linkPlaces('[[Exemplo City#Market|Market]], {{rt|9|Kalos}}, {{ci|Vila}} e {{tn|Pinha}}'), ['Exemplo City', 'Route 9', 'Vila City', 'Pinha Town']);
});

test('parties: time com golpes, golpe Z, Dynamax, Tera, luta em dupla e campos na mesma linha', () => {
  const txt = [
    '==Batalha==', '===Primeira luta===',
    '{{Party', '|game=SM', '|location=[[Exemplo Gym]]', '|name=Ana', '|class=Leader', '}}',
    '{{Pokémon/4', '|pokemon=Lycanroc', '|form=Midday Form', '|level=24', '|held={{i|Rockium Z}}', '|ability=Keen Eye',
    '|move1={{m|Rock Throw}} |move1type=Rock', '|move2=Bite', '|z-move2=Continental Crush', '}}',
    '{{Pokémon/4', '|pokemon=Exemplomon', '|level=25', '|max=Gigantamax', '|tera=Fire', '}}',
    '{{Party/end}}',
    '===Dupla===',
    '{{Party/2', '|name={{color2|000|Jessie}}', '|name2={{color2|000|James}}', '|location=Exemplo Road', '|caption={{PlayerChoice|0722|Rowlet}}', '}}',
    '{{Pokémon', '|pokemon=Ekans', '|level=10', '}}', '{{Pokémon', '|pokemon=Koffing', '|level=10', '}}',
    '{{Party/end}}',
  ].join('\n');
  const [a, b] = parties(txt);
  assert.deepEqual(a.section, ['Batalha', 'Primeira luta']);
  assert.equal(a.name, 'Ana'); assert.equal(a.location, 'Exemplo Gym'); assert.equal(a.game, 'SM');
  assert.equal(a.mons[0].species, 'Lycanroc'); assert.equal(a.mons[0].form, 'Midday Form'); assert.equal(a.mons[0].held, 'Rockium Z');
  // "|move1=… |move1type=Rock" na mesma linha (Lacey, 0.53.0): o golpe não leva o tipo junto
  assert.deepEqual(a.mons[0].moves, [{ name: 'Rock Throw', z: null }, { name: 'Bite', z: 'Continental Crush' }]);
  assert.equal(a.mons[0].zPower, true);
  assert.equal(a.mons[1].dynamax, 'gigantamax'); assert.equal(a.mons[1].tera, 'Fire');
  // {{Party/2}} (Let's Go, 0.53.0): os dois treinadores num time só
  assert.equal(b.name, 'Jessie & James'); assert.equal(b.playerChoice, 'Rowlet');
  assert.deepEqual(b.mons.map((m) => m.species), ['Ekans', 'Koffing']);
});

test('acquisition: jogos da linha e lugares pelo destino; célula vazia não engole a próxima', () => {
  const txt = [
    '===Acquisition===', '{| class="x"', '|-',
    '| {{gameabbrev8|SwSh}}', '| [[Exemplo Lake#Shore|beira do lago]]', '| Vendido em [[Exemplo City]]',
    '|-', '| {{gameabbrev9|SV}}', '|', '| Prêmio em {{rt|2|Paldea}}',
    '|}',
  ].join('\n');
  const rows = acquisition(txt);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].games, ['SwSh']); assert.deepEqual(rows[0].foundPlaces, ['Exemplo Lake']); assert.deepEqual(rows[0].otherPlaces, ['Exemplo City']);
  assert.equal(rows[1].found, ''); assert.deepEqual(rows[1].otherPlaces, ['Route 2']);
});

test('catchRows: taxa simples, forma regional e "~"', () => {
  const txt = [
    '{{Catch/entry6|016|Pidgey|yes|yes|Grass|2-3|20%|type1=Normal}}',
    '{{Catch/entry6|019|Rattata|yes|no|Grass|3|~5%|form=Alolan Form|type1=Dark}}',
  ].join('\n');
  const rows = catchRows(txt, { entry: 'entry6' }, 2);
  assert.deepEqual(rows.map((r) => [r.species, r.versions, r.method, r.min, r.max, r.rate, r.approx, r.form ?? null]),
    [['pidgey', [true, true], 'Grass', 2, 3, 20, false, null], ['rattata', [true, false], 'Grass', 3, 3, 5, true, 'alola']]);
  assert.equal(formKey('Average&nbsp;Size'), 'average');
  assert.equal(pctOf('-'), null);
});

test('catchRows: período do dia (Alola, BDSP) — "-" = não aparece; all= vale para todos', () => {
  const alola = catchRows('{{Catch/entry7|734|Yungoos|yes|no|Grass|2-4|30%|-}}\n{{Catch/entry7|731|Pikipek|yes|yes|Grass|2-4|all=20%}}', { entry: 'entry7', times: ['dia', 'noite'] }, 2);
  assert.deepEqual(alola[0].times, { dia: 30, noite: 0 }); assert.equal(alola[0].rate, 30);
  assert.equal(alola[1].times, undefined); assert.equal(alola[1].rate, 20);
  const bdsp = catchRows('{{Catch/entrybdsp|396|Starly|yes|yes|Grass|2-3|40%|40%|20%}}', { entry: 'entrybdsp', times: ['manhã', 'dia', 'noite'] }, 2);
  assert.deepEqual(bdsp[0].times, { manhã: 40, dia: 40, noite: 20 });
});

test('catchRows: Black/White — 3 colunas de versão; fenômeno e "Swarm" ficam fora (0.54.0)', () => {
  const txt = [
    '{{catch/div|land|Grass}}',
    '{{Catch/entry5|506|Lillipup|yes|yes|no|Grass|4|30%}}',
    '{{Catch/entry5|531|Audino|yes|yes|no|Rustling|4|100%}}',
    '{{catch/div|land|Swarm}}',
    '{{Catch/entry5|179|Mareep|yes|yes|no|Grass|4|100%}}',
  ].join('\n');
  const rows = catchRows(txt, { entry: 'entry5', flags: 3, skipRows: /^(Rustling|Dust|Shadow|Rippling)$/i, skipDiv: /Swarm/i }, 2);
  assert.deepEqual(rows.map((r) => [r.species, r.versions, r.rate]), [['lillipup', [true, true], 30]]);
});

test('catchRows: Sword/Shield — taxa por clima e seção da página; curry/raid fora (0.57.0)', () => {
  const txt = [
    '===[[Hidden encounter]]s===',
    '{{Catch/entry8|043|Oddish|yes|yes|Grass|5-7|cloudy=40%|rain=~10%}}',
    '===[[Visible encounter]]s===',
    '{{Catch/entry8|032|Nidoran♂|yes|no|Grass|60-65|clear=21%|sandstorm=100%}}',
    '===Max Raid Battles===',
    '{{Catch/entry8|849|Toxtricity|yes|yes|Max Raid|30|5%}}',
  ].join('\n');
  const rows = catchRows(txt, { entry: 'entry8', weather: true, skipSection: /Curry|Raid|Dynamax|Berry/i }, 2);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].weather, { cloudy: 40, rain: 10 }); assert.equal(rows[0].rate, 40); assert.equal(rows[0].approx, true);
  assert.match(rows[0].section, /Hidden/);
  // ♀/♂ pela regra única de nomes (0.65.0): "Nidoran♂" = nidoranm
  assert.equal(rows[1].species, 'nidoranm'); assert.match(rows[1].section, /Visible/); assert.equal(rows[1].weather.sandstorm, 100);
});

test('biomeRows/biomeShares: Scarlet/Violet — peso por bioma, terreno e horário (0 = não aparece) (F1, 0.68.0)', async () => {
  const { biomeRows, biomeShares } = await import('../scripts/lib/bulbapedia-catch.mjs');
  const txt = [
    '{{Catch/div/9|P}}',
    '{{Catch/entry9|0001|Exemplomon|type1=grass|yes|yes|land=yes|2-8|60|all=60|group=40}}',
    '{{Catch/entry9|0002|Noturnomon|type1=dark|yes|no|land=yes|5-8|20|morning=0|day=0|evening=0|note={{tt|só à noite|nota}}}}',
    '{{Catch/entry9|0003|Aguamon|type1=water|yes|yes|watersurface=yes|4|40|all=40}}',
    '{{Catch/entry9|0194-Paldea|Wooper|form=Paldean Form|type1=poison|yes|yes|land=yes|6-8|20|all=20}}',
    '{{Catch/div/9|Fo}}',
    '{{Catch/entry9|0001|Exemplomon|type1=grass|yes|yes|land=yes|5-8|10|all=10}}',
  ].join('\n');
  const rows = biomeRows(txt);
  assert.equal(rows.length, 5);
  assert.deepEqual([rows[0].biome, rows[0].weight, rows[0].min, rows[0].max, rows[0].terrains], ['planície', 60, 2, 8, ['land']]);
  assert.deepEqual(rows[1].times, { morning: false, day: false, evening: false, night: true });
  assert.equal(rows[3].form, 'paldea');
  const sc = biomeShares(rows, 0);
  // planície, terra: de dia Exemplomon 60 + Wooper 20 → 75%; à noite entra o Noturnomon (20) → 60/100; fica a maior: 75
  assert.equal(sc[0].share, 75);
  assert.equal(sc[1].share, 20); // Noturnomon só à noite: 20/100
  assert.equal(sc[2].share, 100); // Aguamon: único na água
  assert.equal(sc[4].share, 100); // floresta: só ele
  // Violet não tem o Noturnomon: à noite a planície fica 60/80
  assert.equal(biomeShares(rows, 1).find((r) => r.species === 'exemplomon' && r.biome === 'planície').share, 75);
});
