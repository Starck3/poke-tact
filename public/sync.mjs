// Sincronização entre aparelhos (0.85.0): o time (poketact:time:<jogo>) e os golpes guardados (poketact:golpes:<jogo>)
// vão para um Gist secreto do GitHub do próprio usuário — o site é estático (GitHub Pages), sem servidor nosso.
// Cada aparelho guarda um token do GitHub (só permissão de Gists) no navegador; a cada mudança o app junta o que está no
// Gist com o que está no aparelho: por chave, vale a gravação mais recente (`at`). Chave sem data (time montado antes de
// conectar) tem at = 0 e perde para o que já está no Gist — assim o 1º aparelho conectado manda.
export const SYNC_FILE = 'poketact-sync.json';
export const SYNC_DESC = 'Poke Tact — time e golpes sincronizados entre aparelhos';
const CFG_KEY = 'poketact:sync';
const AT_KEY = 'poketact:sync:at';
const API = 'https://api.github.com';

export const PUBLIC_URL = 'https://starck3.github.io/poke-tact/';
/**
 * Link "conectar outro aparelho" (0.85.1): aberto em localhost/127.x no computador, o link aponta para o site publicado —
 * localhost no celular é o próprio celular. Pela rede local (192.168…) ou pelo site, o mesmo endereço aberto.
 */
export function connectLink(loc, token) {
  const local = /^(localhost|127\.|\[?::1\]?$)/.test(loc.hostname);
  return `${local ? PUBLIC_URL : loc.origin + loc.pathname}#/?conectar=${encodeURIComponent(token ?? '')}`;
}

/** Chaves do localStorage que vão para o Gist. */
export const isSyncedKey = (k) => /^poketact:(time|golpes):[a-z0-9-]+$/.test(k);

/**
 * Junta o estado do aparelho com o do Gist ({ key: { value, at } }). Empate ou chave só no Gist → Gist.
 * Devolve o estado final, as chaves que mudam no aparelho e se o Gist precisa ser regravado.
 */
export function mergeStates(local, remote) {
  const merged = {}; const toLocal = []; let push = false;
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[key], r = remote[key];
    if (r && (!l || r.at >= l.at)) {
      merged[key] = r;
      if (!l || l.value !== r.value) toLocal.push(key);
    } else {
      merged[key] = l;
      if (!r || r.value !== l.value) push = true;
    }
  }
  return { merged, toLocal, push };
}

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
  keys() { try { return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)); } catch { return []; } },
};
const readJson = (k, def) => { try { return JSON.parse(ls.get(k) ?? 'null') ?? def; } catch { return def; } };

export const syncConfig = () => readJson(CFG_KEY, null);
const stamps = () => readJson(AT_KEY, {});

function localState() {
  const at = stamps(); const out = {};
  for (const k of ls.keys()) if (isSyncedKey(k)) out[k] = { value: ls.get(k), at: at[k] ?? 0 };
  return out;
}

let status = { state: 'off' }; // off | syncing | ok | error
let onStatus = () => {}, onRemote = () => {};
const setStatus = (s) => { status = { ...status, ...s }; onStatus(status); };
export const syncStatus = () => status;

async function gh(path, cfg, init = {}) {
  const res = await fetch(API + path, {
    ...init, cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${cfg.token}`, ...(init.body && { 'Content-Type': 'application/json' }) },
  });
  if (!res.ok) {
    const msg = res.status === 401 ? 'token inválido ou expirado' : res.status === 403 || res.status === 404 ? 'o token não tem permissão de Gists' : `GitHub respondeu ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return res.json();
}

/** Acha (ou cria) o Gist do app na conta do token. */
async function findGist(cfg) {
  for (let page = 1; page <= 10; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`, cfg);
    const g = list.find((x) => x.files?.[SYNC_FILE]);
    if (g) return g.id;
    if (list.length < 100) break;
  }
  const g = await gh('/gists', cfg, { method: 'POST', body: JSON.stringify({ description: SYNC_DESC, public: false, files: { [SYNC_FILE]: { content: JSON.stringify({ v: 1, items: {} }) } } }) });
  return g.id;
}

async function readRemote(cfg) {
  const g = await gh(`/gists/${cfg.gistId}`, cfg);
  const f = g.files?.[SYNC_FILE];
  if (!f) return {};
  let text = f.content;
  if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
  try { return JSON.parse(text)?.items ?? {}; } catch { return {}; }
}

let chain = Promise.resolve();
/** Puxa, junta e (se preciso) grava o Gist. Uma de cada vez. */
export function syncNow() {
  const run = async () => {
    const cfg = syncConfig();
    if (!cfg?.token || !cfg.gistId) { setStatus({ state: 'off' }); return; }
    setStatus({ state: 'syncing' });
    try {
      const { merged, toLocal, push } = mergeStates(localState(), await readRemote(cfg));
      const at = stamps();
      for (const k of toLocal) { const v = merged[k].value; if (v == null) ls.del(k); else ls.set(k, v); at[k] = merged[k].at; }
      ls.set(AT_KEY, JSON.stringify(at));
      if (push) await gh(`/gists/${cfg.gistId}`, cfg, { method: 'PATCH', body: JSON.stringify({ files: { [SYNC_FILE]: { content: JSON.stringify({ v: 1, items: merged }) } } }) });
      setStatus({ state: 'ok', at: Date.now(), error: null, login: cfg.login });
      if (toLocal.length) onRemote(toLocal);
    } catch (e) {
      setStatus({ state: 'error', error: e.message });
    }
  };
  chain = chain.then(run, run);
  return chain;
}

let timer = null;
/** O app gravou uma chave sincronizada: marca a hora e manda para o Gist logo depois (junta várias gravações seguidas). */
export function noteWrite(key) {
  if (!isSyncedKey(key)) return;
  const at = stamps(); at[key] = Date.now(); ls.set(AT_KEY, JSON.stringify(at));
  if (!syncConfig()) return;
  clearTimeout(timer); timer = setTimeout(syncNow, 1500);
}

/** Conecta este aparelho com um token do GitHub (permissão Gists). */
export async function connect(token) {
  token = String(token ?? '').trim();
  if (!token) throw new Error('cole o token');
  const cfg = { token };
  const user = await gh('/user', cfg);
  cfg.login = user.login;
  cfg.gistId = await findGist(cfg);
  ls.set(CFG_KEY, JSON.stringify(cfg));
  await syncNow();
  if (status.state === 'error') throw new Error(status.error);
}

export function disconnect() { ls.del(CFG_KEY); setStatus({ state: 'off', error: null, at: null, login: null }); }

/** Liga a sincronização: na abertura, ao voltar para o app e (gravando já) ao sair dele. */
export function initSync(handlers = {}) {
  onStatus = handlers.onStatus ?? onStatus;
  onRemote = handlers.onRemote ?? onRemote;
  const cfg = syncConfig();
  setStatus(cfg ? { state: 'ok', login: cfg.login } : { state: 'off' });
  if (cfg) syncNow();
  let lastPull = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (!syncConfig()) return;
    if (document.visibilityState === 'visible' && Date.now() - lastPull > 5000) { lastPull = Date.now(); syncNow(); }
    if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); timer = null; syncNow(); } // sai do app: grava já
  });
}
