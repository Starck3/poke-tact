// Regressão da LÓGICA de leitura dos binários dos decomps de DS (HeartGold/SoulSilver e Diamond/Pearl) — sem precisar do decomp
// local: cada teste monta um binário sintético no formato que o código do jogo usa e confere o leitor. Assim o CI (sem
// data-sources/) também protege o que foi descoberto. Detalhes e evidências: docs/ADICIONAR-JOGO.md (seções Gen 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readNarc, parseLevelUp, parseMove, GEN4_TYPES } from '../scripts/lib/narc.mjs';
import { parseScriptFile, simulate, VARIABLE, CMD } from '../scripts/lib/gen4-dp-script.mjs';
import { parseEvents, parseEncounters, parseMatrix, parseTrade, dpLabel, sectionName } from '../scripts/lib/gen4-dp-field.mjs';

const u16 = (...v) => v.flatMap((x) => [x & 0xff, (x >> 8) & 0xff]);
const u32 = (...v) => v.flatMap((x) => [x & 0xff, (x >> 8) & 0xff, (x >> 16) & 0xff, (x >>> 24) & 0xff]);
const s32 = (x) => u32(x >>> 0);

// ---------------------------------------------------------------- NARC (HGSS: wotbl.narc, waza_tbl.narc)
test('NARC: BTAF/BTNF/GMIF — offsets da BTAF contam do início dos dados do GMIF', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const files = [Buffer.from([1, 2, 3]), Buffer.from([9, 9])];
  const btaf = [...Buffer.from('BTAF'), ...u32(12 + 8 * files.length), ...u16(files.length, 0), ...u32(0, 3, 4, 6)]; // 2º arquivo alinhado em 4
  const btnf = [...Buffer.from('BTNF'), ...u32(16), ...u32(4, 0x10000)];
  const data = [1, 2, 3, 0xff, 9, 9];
  const gmif = [...Buffer.from('GMIF'), ...u32(8 + data.length), ...data];
  const body = [...btaf, ...btnf, ...gmif];
  const narc = Buffer.from([...Buffer.from('NARC'), 0xfe, 0xff, 0, 1, ...u32(16 + body.length), ...u16(16, 3), ...body]);
  const f = join(mkdtempSync(join(tmpdir(), 'narc-')), 't.narc');
  writeFileSync(f, narc);
  const out = readNarc(pathToFileURL(f));
  assert.deepEqual(out.map((b) => [...b]), [[1, 2, 3], [9, 9]]);
});

test('HGSS: learnset u16 = golpe (9 bits) + nível (7 bits), 0xFFFF encerra; golpe em 16 bytes', () => {
  // Bulbasaur da Gen 4: Tackle (33) nv 1, Growl (45) nv 3, Leech Seed (73) nv 7
  const lv = Buffer.from(u16((1 << 9) | 33, (3 << 9) | 45, (7 << 9) | 73, 0xffff, (9 << 9) | 22));
  assert.deepEqual(parseLevelUp(lv), [[1, 33], [3, 45], [7, 73]]);
  // Shadow Force: efeito 272, físico, 120, Ghost (7), 100%, 5 PP, prioridade 0
  const mv = Buffer.from([...u16(272), 0, 120, 7, 100, 5, 0, ...u16(0), 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(parseMove(mv), { effect: 272, category: 'physical', power: 120, type: 'ghost', accuracy: 100, pp: 5, priority: 0 });
  assert.equal(parseMove(Buffer.from([0, 0, 2, 0, 0, 0, 20, 0, 0, 0, 0xfd, 0, 0, 0, 0, 0])).priority, -3); // s8
  assert.equal(GEN4_TYPES[9], 'unknown'); assert.equal(GEN4_TYPES[17], 'dark'); // ordem do jogo, 9 = ???
});

// ---------------------------------------------------------------- DP: scripts em bytecode
// tamanhos mínimos para os testes (no pipeline vêm do código do DP: loadCommandSizes)
const size = []; const names = [];
const def = (op, n, name) => { size[op] = n; names[op] = name; };
def(0x02, 0, 'End'); def(0x11, 4, 'CompareVarToValue'); def(0x16, 4, 'GoTo'); def(0x1a, 4, 'Call'); def(0x1b, 0, 'Return');
def(0x1c, 5, 'GoToIf'); def(0x1d, 5, 'CallIf'); def(0x28, 4, 'SetVar'); def(0x29, 4, 'CopyVar'); def(0x246, 2, 'GetGameVersion');
def(0x2bd, 4, 'LegendaryBattle'); def(0x1cf, 3, 'GetSetStrength'); def(0x289, 4, 'Unk0289');
const cmds = { size, names };
// arquivo: 1 entrada (offset relativo ao fim do campo = 0 → código logo depois do cabeçalho de 4 bytes)
const file = (...code) => Buffer.from([...s32(0), ...code]);

test('DP bytecode: cabeçalho sem 0xFD13 termina no início do 1º script; saltos relativos ao fim do argumento', () => {
  // pc 4 GoToIf igual → 23 (fim do argumento 11 + 12); 11 SetVar 0x8004=1; 17 GoTo → 29 (23 + 6); 23 SetVar 0x8004=2; 29 End
  const code = [...u16(0x1c), 1, ...s32(12), ...u16(0x28), ...u16(0x8004, 1), ...u16(0x16), ...s32(6), ...u16(0x28), ...u16(0x8004, 2), ...u16(0x02)];
  const r = parseScriptFile(file(...code), cmds);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.entries, [4]);
  assert.deepEqual([...r.code.values()].map((c) => c.op).sort((a, b) => a - b), [0x02, 0x16, 0x1c, 0x28, 0x28]);
  // arquivo de mapa sem script (4–8 bytes) = vazio, não erro
  assert.deepEqual(parseScriptFile(Buffer.from(u32(0)), cmds).errors, []);
  // tamanho errado desalinha e vira erro (é assim que a validação pega regra faltando)
  const wrong = { size: [...size], names }; wrong[0x28] = undefined; wrong.size[0x28] = 3;
  assert.ok(parseScriptFile(file(...code), wrong).errors.length > 0);
});

test('DP bytecode: comandos de tamanho variável conferidos no código (GetSetStrength, UnionGroup, subcomandos)', () => {
  const at = (bytes) => ({ buf: Buffer.from([0, 0, ...bytes]), at: 2 });
  const sz = (op, bytes) => { const { buf, at: p } = at(bytes); return VARIABLE[op](buf, p); };
  assert.equal(sz(0x1cf, [2]), 3); assert.equal(sz(0x1cf, [1]), 1); // só a opção 2 (consultar) lê o ponteiro
  assert.equal(sz(0x21d, u16(0)), 6); assert.equal(sz(0x21d, u16(4)), 4); assert.equal(sz(0x21d, u16(6)), 2); // UnionGroup
  assert.equal(sz(0x235, u16(1)), 8); assert.equal(sz(0x235, u16(2)), 2); assert.equal(sz(0x235, u16(4)), 6);
  assert.equal(sz(0x237, u16(0)), 8); assert.equal(sz(0x237, u16(5)), 2);
  assert.equal(sz(0x23e, u16(5)), 6); assert.equal(sz(0x23e, u16(0)), 2);
  assert.equal(sz(0x27c, u16(2)), 4); assert.equal(sz(0x27c, u16(3)), 2);
  // GetSetStrength opção 1 seguido de End: lê 1 byte só (contar 3 desalinhava o script)
  const r = parseScriptFile(file(...u16(0x1cf), 1, ...u16(0x02)), cmds);
  assert.deepEqual(r.errors, []);
});

test('DP: simulate() resolve variável por versão — Spear Pillar: Dialga no Diamond (10), Palkia no Pearl (11)', () => {
  // SetVar 0x8005=483; SetVar 0x8006=484; GetGameVersion 0x800C; CopyVar 0x8004←0x8005; CompareVarToValue 0x800C, 10;
  // GoToIf igual → batalha; CopyVar 0x8004←0x8006; LegendaryBattle 0x8004, 47; End
  const code = [...u16(0x28, 0x8005, 483), ...u16(0x28, 0x8006, 484), ...u16(0x246, 0x800c), ...u16(0x29, 0x8004, 0x8005),
    ...u16(0x11, 0x800c, 10), ...u16(0x1c), 1, ...s32(6), ...u16(0x29, 0x8004, 0x8006), ...u16(0x2bd, 0x8004, 47), ...u16(0x02)];
  const p = parseScriptFile(file(...code), cmds);
  assert.deepEqual(p.errors, []);
  const battle = (v) => simulate(p, v, new Set([0x2bd])).map((e) => e.values);
  assert.deepEqual(battle(10), [[483, 47]]);
  assert.deepEqual(battle(11), [[484, 47]]);
  // condição desconhecida (flag do jogador): segue os dois lados
  const unknown = [...u16(0x11, 0x4000, 1), ...u16(0x1c), 1, ...s32(12), ...u16(0x28, 0x8004, 1), ...u16(0x16), ...s32(6),
    ...u16(0x28, 0x8004, 2), ...u16(0x2bd, 0x8004, 5), ...u16(0x02)];
  const vals = simulate(parseScriptFile(file(...unknown), cmds), 10, new Set([0x2bd])).map((e) => e.values[0]).sort();
  assert.deepEqual(vals, [1, 2]);
  assert.equal(CMD.GOTOIF, 0x1c);
});

// ---------------------------------------------------------------- DP: dados de campo
test('DP eventos: bg 20 / objeto 32 / warp 12 / gatilho 16 bytes, cada lista com u32 de contagem, sem sobra', () => {
  const obj = [...u16(0, 4, 0, 1, 0, 3000, 0, 0, 0, 0, 0, 0, 8, 7), ...u32(0)]; // treinador 1 (script 3000)
  const warp = [...u16(5, 6, 412, 0), ...u32(0)];
  const b = Buffer.from([...u32(0), ...u32(1), ...obj, ...u32(1), ...warp, ...u32(0)]);
  const e = parseEvents(b);
  assert.deepEqual([e.objects[0].script, e.objects[0].trainerType, e.objects[0].x, e.objects[0].z], [3000, 1, 8, 7]);
  assert.deepEqual([e.warps[0].dest, e.warps[0].x], [412, 5]);
  assert.throws(() => parseEvents(Buffer.concat([b, Buffer.from([0])])), /sobrando/);
});

test('DP encontros (424 bytes): terra, enxame, dia/noite, Poké Radar, dual-slot e os 5 grupos de água', () => {
  const b = Buffer.alloc(424);
  b.writeUInt32LE(30, 0); b.writeUInt32LE(2, 4); b.writeUInt32LE(396, 8); // slot 0: Starly nv 2
  b.writeUInt32LE(84, 100); b.writeUInt32LE(84, 104); // enxame: Doduo
  b.writeUInt32LE(32, 124); // radar: Nidoran♀
  b.writeUInt32LE(273, 164); // dual-slot Ruby
  b.writeUInt32LE(10, 204); b[208] = 30; b[209] = 20; b.writeUInt32LE(54, 212); // Surf: Psyduck 20–30
  b.writeUInt32LE(25, 292); b.writeUInt32LE(129, 300); // Old Rod: Magikarp
  const e = parseEncounters(b);
  assert.deepEqual([e.landRate, e.land[0]], [30, { level: 2, species: 396 }]);
  assert.deepEqual(e.swarm, [84, 84]); assert.equal(e.radar[0], 32); assert.equal(e.dual.ruby[0], 273);
  assert.deepEqual([e.surf.rate, e.surf.slots[0]], [10, { max: 30, min: 20, species: 54 }]);
  assert.equal(e.oldRod.slots[0].species, 129);
  assert.throws(() => parseEncounters(Buffer.alloc(400)), /424/);
});

test('DP matriz, troca com NPC e rótulos dos mapas', () => {
  // 2×1 com cabeçalhos, sem altitudes, nome vazio: mapas 5 e 6 lado a lado
  const m = parseMatrix(Buffer.from([2, 1, 1, 0, 0, ...u16(5, 6), ...u16(0, 0)]));
  assert.deepEqual(m.grid, [[5, 6]]);
  assert.throws(() => parseMatrix(Buffer.from([2, 1, 1, 0, 0, ...u16(5, 6)])), /tamanho/);
  const t = Buffer.alloc(80); t.writeUInt32LE(63, 0); t.writeUInt32LE(66, 76); // Abra por Machop
  assert.deepEqual(parseTrade(t), { species: 63, requested: 66 });
  // MAP_JUBLIFE (grafia do decomp) → nome do MAPSEC; Jublife em qualquer posição; Mount → Mt.
  assert.equal(dpLabel({ id: 'MAP_JUBLIFE', mapsec: 'MAPSEC_JUBILIFE_CITY' }), 'Jubilife City');
  assert.equal(dpLabel({ id: 'MAP_ROUTE_218_JUBLIFE_GATEHOUSE', mapsec: 'MAPSEC_ROUTE_218' }), 'Route 218 Jubilife Gatehouse');
  assert.equal(dpLabel({ id: 'MAP_MOUNT_CORONET_B1F', mapsec: 'MAPSEC_MT_CORONET' }), 'Mt. Coronet B1F');
  assert.equal(dpLabel({ id: 'MAP_OREBURGH_GYM', mapsec: 'MAPSEC_OREBURGH_CITY' }), 'Oreburgh Gym');
  assert.equal(sectionName('MAPSEC_TWINLEAF_TOWN'), 'Twinleaf Town');
});

// ---------------------------------------------------------------- configuração: o pipeline continua usando os leitores
test('pipeline: DP e HGSS buscam e usam os binários (checkout esparso e passos do build-game)', async () => {
  const { GAMES } = await import('../scripts/games.mjs');
  const dp = GAMES['diamond-pearl'].asmDecomp, hg = GAMES['heartgold-soulsilver'].asmDecomp;
  for (const p of ['/arm9/src/', '/arm9/asm/', '/arm9/overlays/', '/files/fielddata/script/', '/files/fielddata/eventdata/', '/files/fielddata/encountdata/', '/files/fielddata/mapmatrix/', '/files/fielddata/pokemon_trade/', '/files/arc/encdata_ex/']) assert.ok(dp.sparse.includes(p), p);
  for (const p of ['/files/poketool/personal/wotbl.narc', '/files/poketool/waza/waza_tbl.narc']) assert.ok(hg.sparse.includes(p), p);
  assert.ok(!hg.partial); // HGSS deixou de ser parcial (learnset e golpes do próprio jogo)
  assert.ok(GAMES['diamond-pearl'].stageFacts?.MAP_TWINLEAF_PLAYER_HOUSE_2F);
  const bg = readFileSync(new URL('../scripts/build-game.mjs', import.meta.url), 'utf8'); // (importar rodaria o build)
  const steps = (k) => bg.match(new RegExp(`\\b${k}: \\[([^\\]]+)\\]`))[1];
  for (const s of ['validate-dp-vs-decomp', 'validate-dp-scripts', 'build-trainers-dp', 'build-acquisition-dp', 'build-walkthrough-gen1']) assert.ok(steps('dp').includes(`'${s}'`), s);
  assert.ok(steps('hgss').includes("'apply-hgss-overlay'"));
});
