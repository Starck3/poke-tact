// Sincronizar aparelhos (0.85.0): junção por chave e o caminho completo com um GitHub de mentira (fetch + localStorage falsos).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, isSyncedKey, connect, noteWrite, syncNow, disconnect, SYNC_FILE } from '../public/sync.mjs';

test('só o time e os golpes guardados sincronizam', () => {
  assert.ok(isSyncedKey('poketact:time:emerald'));
  assert.ok(isSyncedKey('poketact:golpes:heartgold-soulsilver'));
  for (const k of ['poketact:emerald', 'poketact:last', 'poketact:sync', 'poketact:sync:at', 'poketact:dlc:sword-shield']) assert.ok(!isSyncedKey(k), k);
});

test('mergeStates: mais recente vence; empate e chave sem data ficam com o Gist', () => {
  const local = { a: { value: 'L', at: 5 }, b: { value: 'L', at: 1 }, c: { value: 'L', at: 0 }, d: { value: 'L', at: 0 } };
  const remote = { a: { value: 'R', at: 3 }, b: { value: 'R', at: 2 }, c: { value: 'R', at: 0 }, e: { value: 'R', at: 9 } };
  const { merged, toLocal, push } = mergeStates(local, remote);
  assert.equal(merged.a.value, 'L'); // aparelho mais novo
  assert.equal(merged.b.value, 'R'); // Gist mais novo
  assert.equal(merged.c.value, 'R'); // empate (time montado antes de conectar): o 1º aparelho conectado manda
  assert.equal(merged.d.value, 'L'); // só no aparelho
  assert.equal(merged.e.value, 'R'); // só no Gist
  assert.deepEqual(toLocal.sort(), ['b', 'c', 'e']);
  assert.equal(push, true);
  assert.equal(mergeStates({ x: { value: '1', at: 1 } }, { x: { value: '1', at: 1 } }).push, false);
});

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
function fakeGitHub() {
  const gists = new Map(); let n = 0;
  const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  return async (url, init = {}) => {
    if (init.headers?.Authorization !== 'Bearer tok') return json({}, 401);
    const path = url.replace('https://api.github.com', '').split('?')[0];
    const body = init.body && JSON.parse(init.body);
    if (path === '/user') return json({ login: 'treinador' });
    if (path === '/gists' && init.method === 'POST') { const id = `g${++n}`; gists.set(id, { id, files: body.files }); return json(gists.get(id)); }
    if (path === '/gists') return json([...gists.values()]);
    const g = gists.get(path.split('/')[2]);
    if (init.method === 'PATCH') Object.assign(g.files, body.files);
    return json(g);
  };
}

test('dois aparelhos: o time do computador aparece no celular e a mudança no celular volta', async () => {
  globalThis.fetch = fakeGitHub();
  const pc = fakeStorage(), phone = fakeStorage();
  const team = JSON.stringify([{ species: 'treecko', level: 12 }]);

  globalThis.localStorage = pc;
  pc.setItem('poketact:time:emerald', team);
  pc.setItem('poketact:emerald', '{"level":12}'); // contexto da tela: não sincroniza
  await connect('tok');

  globalThis.localStorage = phone;
  phone.setItem('poketact:time:emerald', '[]'); // time vazio no celular antes de conectar perde para o do Gist
  await assert.rejects(connect('errado'), /token inválido/);
  await connect('tok');
  assert.equal(phone.getItem('poketact:time:emerald'), team);
  assert.equal(phone.getItem('poketact:emerald'), null);

  const team2 = JSON.stringify([{ species: 'grovyle', level: 16 }]);
  phone.setItem('poketact:time:emerald', team2); noteWrite('poketact:time:emerald');
  await syncNow();

  globalThis.localStorage = pc;
  await syncNow();
  assert.equal(pc.getItem('poketact:time:emerald'), team2);
  disconnect();
  assert.equal(pc.getItem('poketact:sync'), null);
  assert.ok(SYNC_FILE.endsWith('.json'));
});
