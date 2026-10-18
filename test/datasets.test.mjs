// Invariantes que todo jogo suportado precisa cumprir (rodam para cada dataset gerado).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { GAMES } from '../scripts/games.mjs';
import { likelyMoveset, whereToGet, recommend } from '../public/engine.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const haveDecomp = existsSync(new URL('../data-sources/', import.meta.url));

const has = (f) => existsSync(new URL(`../public/data/${f}`, import.meta.url));
// golpe → geração em que surgiu (só para checar que não aparecem antes)
const BORN = { 'metal-claw': 2, crunch: 2, 'shadow-ball': 2, 'u-turn': 4, 'draco-meteor': 4, moonblast: 6, 'play-rough': 6, 'dazzling-gleam': 6 };

for (const [gameId, game] of Object.entries(GAMES)) {
  if (!has(`${gameId}.json`)) continue; // jogo configurado mas ainda não gerado
  const data = load(`${gameId}.json`);
  const withDecomp = !!game.decomp;
  // Gen 1/2: treinadores e aquisição só depois de portados (Gen 2 começa só com o núcleo) → pela existência do arquivo
  const hasTrainers = withDecomp || (!!game.asmDecomp && has(`${gameId}-trainers.json`));
  const acq = hasTrainers && has(`${gameId}-acquisition.json`) ? load(`${gameId}-acquisition.json`) : null;
  const trainers = hasTrainers ? load(`${gameId}-trainers.json`).trainers : [];
  const mon = (n) => data.pokemon.find((p) => p.name === n);
  const gen = game.generation;

  test(`[${gameId}] só tipos, golpes e mecânicas que existem na geração ${gen}`, () => {
    assert.equal(data.types.includes('fairy'), gen >= 6);
    assert.equal(data.types.includes('dark') && data.types.includes('steel'), gen >= 2);
    for (const [m, born] of Object.entries(BORN)) if (gen < born) assert.equal(data.moves[m], undefined, `${m} não existe na Gen ${gen}`);
    for (const p of data.pokemon) for (const l of p.learnset) assert.ok(data.moves[l.move], `${p.name}:${l.move}`);
    if (gen < 3) assert.ok(data.pokemon.every((p) => p.abilities.length === 0), 'sem habilidades antes da Gen 3');
    if (gen === 1) assert.ok(data.pokemon.every((p) => p.stats['special-attack'] === p.stats['special-defense']), 'Gen 1: Special único');
    if (gen <= 3) assert.ok(Object.values(data.moves).every((m) => m.category === 'status' || (game.physicalTypes.includes(m.type) ? m.category === 'physical' : m.category === 'special')), 'até a Gen 3: categoria pelo tipo');
    assert.ok(data.pokemon.length >= 100);
  });

  test(`[${gameId}] toda espécie obtível tem origem em todas as versões`, { skip: !acq }, () => {
    for (const v of game.versions) for (const p of data.pokemon.filter((x) => x.obtainable[v])) {
      assert.ok(whereToGet(data, acq, p, v).direct.length > 0, `${p.name} (${v}) sem origem`);
    }
  });

  test(`[${gameId}] times de treinadores válidos`, { skip: !hasTrainers }, () => {
    // Gen 1: ~350; Gen 2: ~440–470; Gen 3: >500; Platinum: 500. Diamond/Pearl: só chefes (lugar das lutas em binário) = 37
    const bossesOnly = /só chefes/.test(load(`${gameId}-trainers.json`).note ?? '');
    assert.ok(trainers.length > (bossesOnly ? 30 : gen <= 2 ? 300 : gen === 4 ? 450 : 500));
    if (bossesOnly) assert.ok(trainers.every((t) => ['Líderes de ginásio', 'Elite dos Quatro', 'Campeão', 'Rival'].includes(t.group)));
    for (const t of trainers) for (const p of t.party) {
      assert.ok(mon(p.species), `${t.key}: ${p.species}`);
      assert.ok(p.moves.length >= 1 && p.moves.length <= 4, `${t.key}/${p.species}`);
      for (const m of p.moves) assert.ok(data.moves[m], `${t.key}/${p.species}: ${m}`);
    }
  });

  test(`[${gameId}] recomendações respeitam versão e nível`, () => {
    const opp = mon('gyarados') ?? mon('magikarp') ?? data.pokemon[0];
    for (const v of game.versions) {
      const r = recommend(data, opp, { level: 40, version: v, onlyObtainable: withDecomp, fullyEvolvedOnly: false, includeLegendary: false });
      assert.equal(r.picks.length, 3, `${gameId}/${v}`);
      if (withDecomp) assert.ok(r.picks.every((p) => p.mon.obtainable[v] && p.mon.minLevel <= 40));
    }
  });

  test(`[${gameId}] moveset padrão == algoritmo do jogo (todas as espécies, níveis 1–100)`, { skip: !haveDecomp || !withDecomp }, async () => {
    const { loadDecomp } = await import('../scripts/lib/decomp.mjs');
    const d = loadDecomp(gameId);
    const ids = new Map();
    const id = (n) => ids.get(n) ?? (ids.set(n, JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id), ids.get(n));
    const byName = Object.fromEntries(data.pokemon.map((p) => [norm(p.name), p]));
    let checked = 0;
    const diffs = [];
    for (const [name, ordered] of Object.entries(d.levelUpOrdered)) {
      const m = byName[norm(name)] ?? byName[norm(name) + 'normal'];
      if (!m) continue;
      for (let level = 1; level <= 100; level++) {
        const ref = []; // GiveBoxMonInitialMoveset: na ordem do arquivo; repetido é ignorado; com 4, sai o mais antigo
        for (const [lvl, mv] of ordered) {
          if (lvl > level) break;
          if (ref.includes(d.moveId[mv])) continue;
          if (ref.length === 4) ref.shift();
          ref.push(d.moveId[mv]);
        }
        const got = likelyMoveset(m, level).map(id);
        checked++;
        if ([...ref].sort().join() !== [...got].sort().join()) diffs.push(`${m.name}@${level}`);
      }
    }
    assert.ok(checked > 30000);
    assert.equal(diffs.length, 0, `${diffs.length} diferenças, ex.: ${diffs.slice(0, 5).join(' | ')}`);
  });
}

test('[emerald] regras específicas do jogo', () => {
  const data = load('emerald.json');
  const acq = load('emerald-acquisition.json');
  const mon = (n) => data.pokemon.find((p) => p.name === n);
  assert.equal(mon('espeon').evo.possible, true); // Emerald tem relógio: evolução por horário existe
  assert.equal(whereToGet(data, acq, mon('feebas'), 'emerald').direct[0].where, 'Route 119'); // encontro definido em código
  assert.equal(mon('mew').obtainable.emerald, false); // Faraway Island exige o Old Sea Map (evento)
  assert.ok(whereToGet(data, acq, mon('treecko'), 'emerald').direct.some((s) => s.type === 'starter'));
  assert.equal(data.pokemon.find((p) => p.name === 'pichu').learnset.some((l) => l.method === 'light-ball-egg'), true);
});
