// Teste da tela num Chrome headless (S2, PLANO-EXECUCAO-6): sobe o app numa porta livre, abre o Chrome pelo protocolo
// DevTools (WebSocket do próprio Node — sem dependências) e confere os caminhos que já deram problema: o Brock pelo seletor
// e pelo link (nível e progresso da luta), o aviso de treino, a 1ª luta da Nemona, o ovo na creche, as abas e o celular,
// sem erro de JavaScript. Sem Chrome/Edge instalado: pula (código 0). Uso: npm run test:ui [-- --shots] (capturas em
// reports/ui/). Sai com código 1 se alguma verificação falhar.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from './serve.mjs';

const CANDIDATES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const browser = CANDIDATES.find((p) => existsSync(p));
if (!browser) { console.log('ui-test: Chrome/Edge não encontrado — pulado (defina CHROME=<caminho>)'); process.exit(0); }
const SHOTS = process.argv.includes('--shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createAppServer().listen(0);
await new Promise((r) => server.once('listening', r));
const BASE = `http://localhost:${server.address().port}/`;
const profile = join(tmpdir(), `poketact-ui-${process.pid}`);
const DPORT = 9300 + (process.pid % 500);
const chrome = spawn(browser, ['--headless=new', `--remote-debugging-port=${DPORT}`, '--no-first-run', '--disable-gpu', `--user-data-dir=${profile}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
let tab;
for (let i = 0; i < 60 && !tab; i++) { try { tab = await (await fetch(`http://127.0.0.1:${DPORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');

const jsErrors = [];
const drain = () => {
  for (const e of events.splice(0)) {
    if (e.method === 'Runtime.exceptionThrown') jsErrors.push(e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);
    if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') jsErrors.push('console.error ' + e.params.args.map((a) => a.value ?? a.description).join(' '));
    // 404 de recurso do próprio app (favicon e mapa da região de jogo sem mapa não pedem mais arquivo — 0.60.0)
    if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && (e.params.entry.url ?? '').startsWith(BASE)) jsErrors.push(e.params.entry.text + ' ' + e.params.entry.url);
  }
};
/** Roda `fn` (função) na página com os argumentos; devolve o valor (await incluído). */
const run = async (fn, ...args) => {
  const r = await send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result.result.value;
};
const go = async (hash, wait = 2500) => { await send('Page.navigate', { url: BASE + hash }); await sleep(wait); };
const viewport = (mobile) => send('Emulation.setDeviceMetricsOverride', mobile ? { width: 390, height: 844, deviceScaleFactor: 1, mobile: true } : { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
const shot = async (name) => { if (!SHOTS) return; mkdirSync(new URL('../reports/ui/', import.meta.url), { recursive: true }); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`../reports/ui/${name}.png`, import.meta.url), Buffer.from(r.result.data, 'base64')); };

const checks = [];
const check = (name, ok, got) => { checks.push({ name, ok: !!ok, got }); console.log(`${ok ? '✔' : '✖'} ${name}${ok ? '' : ' — ' + JSON.stringify(got)}`); };
const state = () => run(() => ({
  level: document.querySelector('#level').value,
  stage: document.querySelector('#stage').selectedOptions[0]?.textContent ?? '',
  picks: [...document.querySelectorAll('#results .pick')].map((c) => ({ mon: c.querySelector('h3')?.textContent ?? '', train: c.querySelector('.train')?.textContent ?? '' })),
}));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // 1. link da luta num navegador limpo (atalho da tela inicial): nível e progresso da luta
  await go('#/');
  const brockHref = await run(() => [...document.querySelectorAll('#quickPicks a')].find((a) => /Brock/.test(a.textContent))?.getAttribute('href') ?? '');
  check('tela inicial: atalho "Brock" existe', brockHref.includes('treinador='), brockHref);
  await go(brockHref.replace(/^#?/, '#'), 3500);
  let s = await state();
  check('link do Brock: nível 14 e nenhuma insígnia', s.level === '14' && /antes da 1/.test(s.stage), s);
  check('link do Brock: 3 sugestões', s.picks.length === 3, s.picks);

  // 2. FireRed pelo seletor: Brock → nível 14; Onix → Mankey com o aviso de treino até o nv 11
  await go('#/jogo/firered-leafgreen', 3500);
  await run(async (w) => { document.querySelector('#trainerCats button[data-cat="Líderes de ginásio"]').click(); await new Promise((r) => setTimeout(r, w)); [...document.querySelectorAll('.tchip')].find((b) => /Brock/i.test(b.textContent)).click(); await new Promise((r) => setTimeout(r, w * 3)); }, 300);
  s = await state();
  check('FireRed, seletor do Brock: nível 14 e nenhuma insígnia', s.level === '14' && /antes da 1/.test(s.stage), s);
  const ctx = await run(() => document.querySelector('#results .ctx')?.textContent ?? '');
  check('linha "Calculado com o seu time no nv 14"', /nv 14 · antes da 1/.test(ctx), ctx);
  check('FireRed, Brock: nada de Beedrill nem golpe de TM tardio', !s.picks.some((p) => /Beedrill/.test(p.mon)), s.picks);
  await run(async () => { [...document.querySelectorAll('#team button')].find((b) => /Onix/.test(b.textContent)).click(); await new Promise((r) => setTimeout(r, 1200)); });
  s = await state();
  const mankey = s.picks.find((p) => /Mankey/.test(p.mon));
  check('FireRed, Onix: Mankey com "treine até o nv 11"', mankey && /treine até o nv 11/.test(mankey.train), s.picks);
  await shot('frlg-brock');

  // 3. abas do FireRed
  await go('#/jogo/firered-leafgreen?capturar=pichu', 3500);
  const dex = await run(() => document.querySelector('#dexOut').textContent);
  check('Onde capturar Pichu (FireRed): ovo na creche', /Ovo na creche/.test(dex), dex.slice(0, 200));
  await run(async () => { document.querySelector('#tabWalk').click(); await new Promise((r) => setTimeout(r, 1500)); });
  const walk = await run(() => ({ stages: document.querySelectorAll('#walk details.stage').length, breed: / breed /.test(document.querySelector('#walk').textContent), creche: /ovo na creche/.test(document.querySelector('#walk').textContent) }));
  check('Detonado (FireRed): etapas, "ovo na creche" e nada de "breed"', walk.stages >= 9 && walk.creche && !walk.breed, walk);
  await go('#/jogo/firered-leafgreen?aba=tipos&tipo=fire', 3500);
  const tipos = await run(() => document.querySelectorAll('#typesOut .mon-card').length);
  check('Pokémon por tipo (fogo): cartões', tipos > 5, tipos);

  // 4. Scarlet: 1ª luta da Nemona (nv 5) — sem Armarouge (item citado no detonado limita a evolução)
  await go('#/jogo/scarlet-violet', 4000);
  await run(async () => { [...document.querySelectorAll('#trainerCats button')].find((b) => /Rival/.test(b.textContent)).click(); await new Promise((r) => setTimeout(r, 300)); document.querySelector('.tchip').click(); await new Promise((r) => setTimeout(r, 1500)); });
  s = await state();
  check('Scarlet, 1ª Nemona: nível 5 e sem Armarouge', s.level === '5' && !s.picks.some((p) => /Armarouge/.test(p.mon)), s);

  // 5. Sword: taxa por clima no Onde capturar
  await go('#/jogo/sword-shield?capturar=oddish', 4000);
  const odd = await run(() => [...document.querySelectorAll('#dexOut .walk-list li')].map((l) => l.textContent).join(' | '));
  check('Sword, Oddish: "só com nublado 40%" sem o clima repetido em inglês', /só com nublado 40%/.test(odd) && !/clima: Overcast/.test(odd), odd.slice(0, 200));

  // 6. celular: sem rolagem lateral na tela do jogo
  await viewport(true);
  await go('#/jogo/red-blue', 3000);
  const w = await run(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
  check('celular (390 px): sem rolagem lateral', w.scroll <= w.inner + 1, w);
  await shot('red-celular');
  await viewport(false);

  // 7. novidades
  await go('#/?novidades', 2500);
  const news = await run(() => document.querySelector('#newsList summary')?.textContent ?? '');
  check('Novidades abre com a versão mais nova', /Versão \d+\.\d+\.\d+/.test(news), news);
} catch (e) { check('execução sem exceção', false, String(e)); }

drain();
check('sem erro de JavaScript', !jsErrors.length, jsErrors);
ws.close(); chrome.kill(); server.close();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
const failed = checks.filter((c) => !c.ok);
console.log(`ui-test: ${checks.length - failed.length}/${checks.length} ok`);
process.exit(failed.length ? 1 : 0);
