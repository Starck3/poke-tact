import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recommend } from '../public/engine.mjs';

const data = JSON.parse(readFileSync(new URL('../public/data/firered-leafgreen.json', import.meta.url)));
const { trainers } = JSON.parse(readFileSync(new URL('../public/data/firered-leafgreen-trainers.json', import.meta.url)));
const mon = (n) => data.pokemon.find((p) => p.name === n);
const trainer = (key) => trainers.find((t) => t.key === key);

test('times de treinadores só referenciam espécies e golpes do dataset, com no máx. 4 golpes e 6 Pokémon', () => {
  assert.ok(trainers.length > 600);
  for (const t of trainers) {
    assert.ok(t.party.length >= 1 && t.party.length <= 6, t.key);
    for (const p of t.party) {
      assert.ok(mon(p.species), `${t.key}: ${p.species}`);
      assert.ok(p.moves.length >= 1 && p.moves.length <= 4, `${t.key}/${p.species}: ${p.moves.length} golpes`);
      for (const m of p.moves) assert.ok(data.moves[m], `${t.key}/${p.species}: ${m}`);
      assert.ok(p.level >= 1 && p.level <= 100);
    }
  }
});

test('líderes e Elite 4 conhecidos do FRLG', () => {
  const brock = trainer('TRAINER_LEADER_BROCK');
  assert.deepEqual(brock.party.map((p) => [p.species, p.level]), [['geodude', 12], ['onix', 14]]);
  assert.deepEqual(brock.party[1].moves, ['tackle', 'bind', 'rock-tomb']);
  assert.deepEqual(trainer('TRAINER_ELITE_FOUR_LORELEI').party.map((p) => p.species), ['dewgong', 'cloyster', 'slowbro', 'jynx', 'lapras']);
});

test('com golpes reais do oponente, a ameaça vem desses golpes', () => {
  const onix = trainer('TRAINER_LEADER_BROCK').party[1];
  const r = recommend(data, mon('onix'), { level: 14, oppMoves: onix.moves, version: 'firered', onlyObtainable: true, fullyEvolvedOnly: false, includeLegendary: false });
  assert.equal(r.threatSource.kind, 'known');
  assert.deepEqual([...r.threats].sort(), ['normal', 'rock']); // Tackle/Bind = Normal, Rock Tomb = Rock
  assert.equal(r.picks.length, 3);
});
