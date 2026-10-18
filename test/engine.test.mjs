import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { effectiveness, recommend, likelyMoveset, availableMoves } from '../public/engine.mjs';

const data = JSON.parse(readFileSync(new URL('../public/data/firered-leafgreen.json', import.meta.url)));
const mon = (n) => data.pokemon.find((p) => p.name === n);

test('tabela de tipos da Gen 3', () => {
  assert.equal(data.types.includes('fairy'), false);
  assert.equal(effectiveness(data, 'ghost', mon('alakazam')), 2);
  assert.equal(effectiveness(data, 'ground', mon('gengar')), 0); // Levitate
  assert.equal(effectiveness(data, 'electric', mon('gyarados')), 4);
  assert.equal(effectiveness(data, 'rock', mon('charizard')), 4);
  assert.equal(effectiveness(data, 'ghost', mon('magnemite')), 0.5); // Aço resiste Ghost na Gen 3
});

test('golpes de geração futura não existem', () => {
  for (const m of ['moonblast', 'play-rough', 'draco-meteor', 'psyshock', 'u-turn']) assert.equal(data.moves[m], undefined);
});

test('categoria física/especial por tipo (Gen 3)', () => {
  assert.equal(data.moves.bite.category, 'special'); // Dark
  assert.equal(data.moves['shadow-ball'].category, 'physical'); // Ghost
});

test('nenhum learnset referencia golpe inexistente', () => {
  for (const p of data.pokemon) for (const l of p.learnset) assert.ok(data.moves[l.move], `${p.name}:${l.move}`);
});

test('recomenda 3 de famílias distintas, com golpe super efetivo', () => {
  const r = recommend(data, mon('gyarados'), { level: 40, version: 'firered', onlyObtainable: true, fullyEvolvedOnly: true, includeLegendary: false });
  assert.equal(r.picks.length, 3);
  assert.ok(r.picks.every((p) => p.move.eff >= 2));
});

test('moveset provável respeita nível e limite de 4', () => {
  const ms = likelyMoveset(mon('onix'), 14);
  assert.ok(ms.length <= 4);
  for (const m of ms) assert.ok(mon('onix').learnset.some((l) => l.move === m && l.method === 'level-up' && l.level <= 14));
});

test('nível limita golpes por level-up', () => {
  const c = mon('charmander');
  const lvl5 = availableMoves(data, c, 5);
  for (const m of lvl5) assert.ok(c.learnset.some((l) => l.move === m && (l.method !== 'level-up' || l.level <= 5)));
});

test('disponibilidade por versão (exclusivos conhecidos de FRLG)', () => {
  assert.equal(mon('arcanine').obtainable.firered, true);
  assert.equal(mon('arcanine').obtainable.leafgreen, false);
  assert.equal(mon('sandslash').obtainable.firered, false);
  assert.equal(mon('sandslash').obtainable.leafgreen, true);
  assert.equal(mon('mew').obtainable.firered, false); // só evento
  assert.equal(mon('espeon').obtainable.firered, false); // evolução por horário não existe na Gen 3
});

test('recomendações respeitam a versão', () => {
  for (const version of ['firered', 'leafgreen']) {
    const r = recommend(data, mon('gyarados'), { level: 40, version, onlyObtainable: true, fullyEvolvedOnly: false, includeLegendary: false });
    assert.ok(r.picks.every((p) => p.mon.obtainable[version]));
  }
});

test('nível mínimo de evolução (tabela do jogo)', () => {
  assert.equal(mon('charizard').minLevel, 36);
  assert.equal(mon('tyranitar').minLevel, 55);
  assert.equal(mon('raichu').minLevel, 1); // pedra, sem nível
  assert.equal(mon('charmander').minLevel, 1);
});

test('não recomenda quem ainda não evoluiu no nível do time', () => {
  const opts = { version: 'firered', onlyObtainable: true, fullyEvolvedOnly: false, includeLegendary: false };
  const baixo = recommend(data, mon('arcanine'), { ...opts, level: 42 });
  assert.ok(baixo.picks.every((p) => p.mon.minLevel <= 42));
  const alto = recommend(data, mon('arcanine'), { ...opts, level: 60 });
  assert.ok(alto.picks.every((p) => p.mon.minLevel <= 60));
});

import { whereToGet, formatSources } from '../public/engine.mjs';
const acq = JSON.parse(readFileSync(new URL('../public/data/firered-leafgreen-acquisition.json', import.meta.url)));

test('onde obter: direto, presente, troca e cadeia evolutiva', () => {
  assert.equal(whereToGet(data, acq, mon('eevee'), 'firered').direct[0].type, 'gift');
  assert.equal(whereToGet(data, acq, mon('farfetchd'), 'firered').direct[0].type, 'trade');
  const t = whereToGet(data, acq, mon('tyranitar'), 'firered');
  assert.equal(t.from, 'larvitar');
  assert.deepEqual(t.steps.map((s) => [s.to, s.evo.param]), [['pupitar', 30], ['tyranitar', 55]]);
  assert.ok(formatSources(t.direct).join(' ').includes('Sevault Canyon'));
});

test('exclusivos de versão e eventos', () => {
  assert.equal(whereToGet(data, acq, mon('scyther'), 'leafgreen').direct.length, 0); // exclusivo do FireRed
  assert.ok(whereToGet(data, acq, mon('scyther'), 'firered').direct.length > 0);
  assert.equal(whereToGet(data, acq, mon('lugia'), 'firered').direct.length, 0); // só com ingresso de evento
  assert.equal(whereToGet(data, acq, mon('lugia'), 'firered').events.length, 1);
  assert.equal(mon('lugia').obtainable.firered, false);
});

test('toda espécie obtível tem uma forma de obter (direta ou por evolução)', () => {
  for (const version of ['firered', 'leafgreen']) {
    for (const p of data.pokemon.filter((x) => x.obtainable[version])) {
      const w = whereToGet(data, acq, p, version);
      assert.ok(w.direct.length > 0, `${p.name} (${version}) sem origem`);
    }
  }
});
