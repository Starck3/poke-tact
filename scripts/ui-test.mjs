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
  // o Detonado abre filtrado pelo Pokémon selecionado (Pichu, 0.72.0); limpa a busca para ver o detonado inteiro
  const walkQ0 = await run(async () => { document.querySelector('#tabWalk').click(); await new Promise((r) => setTimeout(r, 1500)); const i = document.querySelector('#walkSearch'); const v = i.value; i.value = ''; i.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 1000)); return v; });
  check('Detonado (FireRed): abre com a busca "pichu" do Onde capturar', walkQ0 === 'pichu', walkQ0);
  const walk = await run(() => ({ stages: document.querySelectorAll('#walk details.stage').length, breed: / breed /.test(document.querySelector('#walk').textContent), creche: /ovo na creche/.test(document.querySelector('#walk').textContent) }));
  check('Detonado (FireRed): etapas, "ovo na creche" e nada de "breed"', walk.stages >= 9 && walk.creche && !walk.breed, walk);
  await go('#/jogo/firered-leafgreen?aba=tipos&tipo=fire', 3500);
  const tipos = await run(() => document.querySelectorAll('#typesOut .mon-card').length);
  check('Pokémon por tipo (fogo): cartões', tipos > 5, tipos);

  // 3b. Detonado do Red/Blue: encontros iguais numa linha com "×N" (Power Plant: 6 Voltorb), ovos sem repetição (0.65.0)
  await go('#/jogo/red-blue', 3000);
  await run(async () => { document.querySelector('#tabWalk').click(); await new Promise((r) => setTimeout(r, 1500)); });
  const pp = await run(() => [...document.querySelectorAll('#walk .walk-list li')].map((l) => l.textContent).filter((t) => /Power Plant/.test(t) && /Voltorb/.test(t)));
  check('Detonado (Red/Blue): "Voltorb … ×6" numa linha só', pp.length === 1 && / ×6$/.test(pp[0]), pp);

  // 4. Scarlet: 1ª luta da Nemona (nv 5) — sem Armarouge (item citado no detonado limita a evolução)
  await go('#/jogo/scarlet-violet', 4000);
  await run(async () => { [...document.querySelectorAll('#trainerCats button')].find((b) => /Rival/.test(b.textContent)).click(); await new Promise((r) => setTimeout(r, 300)); document.querySelector('.tchip').click(); await new Promise((r) => setTimeout(r, 1500)); });
  s = await state();
  check('Scarlet, 1ª Nemona: nível 5 e sem Armarouge', s.level === '5' && !s.picks.some((p) => /Armarouge/.test(p.mon)), s);

  // 5. Sword: taxa por clima no Onde capturar
  await go('#/jogo/sword-shield?capturar=oddish', 4000);
  const odd = await run(() => [...document.querySelectorAll('#dexOut .walk-list li')].map((l) => l.textContent).join(' | '));
  check('Sword, Oddish: "só com nublado 40%" sem o clima repetido em inglês', /só com nublado 40%/.test(odd) && !/clima: Overcast/.test(odd), odd.slice(0, 200));

  // 5a. Scarlet: chance estimada pelo peso no bioma (0.69.0)
  await go('#/jogo/scarlet-violet?capturar=lechonk', 4000);
  const lech = await run(() => [...document.querySelectorAll('#dexOut .walk-list li, #dexOut li')].map((l) => l.textContent).join(' | '));
  check('Scarlet, Lechonk: "≈ planície 25% · floresta 21%, pelo peso no bioma"', /≈ planície 25% · floresta 21%, pelo peso no bioma/.test(lech), lech.slice(0, 300));

  // 5b. Sword: "Tenho as DLCs" desmarcado por padrão — a luta contra o Hop (Toxel) não sugere o Sandslash de Alola (só DLC);
  // marcando, ele pode voltar
  await go('#/jogo/sword-shield?treinador=DETONADO_10_0&i=1&inicial=grookey', 4500);
  const noDlc = await run(() => ({ shown: !document.querySelector('#dlcWrap').hidden, on: document.querySelector('#dlc').checked, picks: [...document.querySelectorAll('#results .pick h3')].map((h) => h.textContent) }));
  check('Sword: filtro "Tenho as DLCs" aparece desmarcado e não sugere só-DLC', noDlc.shown && !noDlc.on && !noDlc.picks.some((p) => /Sandslash/.test(p)), noDlc);
  const withDlc = await run(async () => { const c = document.querySelector('#dlc'); c.checked = true; c.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 1200)); const p = [...document.querySelectorAll('#results .pick h3')].map((h) => h.textContent); c.checked = false; c.dispatchEvent(new Event('input')); return p; });
  check('Sword: com as DLCs, a lista muda (Sandslash de Alola volta)', withDlc.some((p) => /Sandslash/.test(p)), withDlc);

  // 5c. Black/White: treinador comum do Battle Subway (0.70.0) — sem time fixo, a conta é contra a lista de conjuntos da Smogon
  await go('#/jogo/black-white?treinador=SUBWAY_NORMAL_0', 4000);
  const sub = await run(async () => { await new Promise((r) => setTimeout(r, 3000)); return { cat: [...document.querySelectorAll('#trainerCats button')].some((b) => /Battle Subway/.test(b.textContent)), note: document.querySelector('#results .note:not(.ctx)')?.textContent ?? '', verdict: [...document.querySelectorAll('#results .pick .verdict')].map((v) => v.textContent), level: document.querySelector('#level').value }; });
  check('Black/White, Subway (Youngster Joshua): aba, nível 50 e "vence N de 66 conjuntos"', sub.cat && sub.level === '50' && /sorteia 3 Pokémon/.test(sub.note) && sub.verdict.length === 3 && sub.verdict.every((v) => /vence \d+ de 66 conjuntos/.test(v)), sub);
  await shot('subway');

  // 5d. busca por tipo na tela inicial (0.71.0): link, Pokémon do jogo, nome de Pokémon, enfrentar/usar, aviso da Gen 1
  await go('#/?tipo=water,flying&jogo=firered-leafgreen', 4500);
  const tw = await run(() => ({ mode: document.querySelector('#searchMode [aria-checked=true]')?.dataset.mode, best: document.querySelector('.tq-best')?.textContent ?? '', mons: [...document.querySelectorAll('#tqMons .mon-card .nm')].map((x) => x.textContent), hash: location.hash }));
  check('tipo Água/Voador no FireRed: modo Tipo, melhor tipo electric ×4 e Jolteon na lista', tw.mode === 'tipo' && /electric.*acerta ×4/.test(tw.best) && tw.mons.includes('Jolteon'), tw);
  await shot('tipo-firered');
  await go('#/', 2500);
  const typed = await run(async () => {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('#searchMode [data-mode=tipo]').click(); await pause(800);
    const input = document.querySelector('#homeSearch'); input.value = 'gyara'; input.dispatchEvent(new Event('input')); await pause(800);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await pause(600);
    const head = document.querySelector('.tq-head')?.textContent ?? '';
    document.querySelector('#tqSide [data-side=usar]').click(); await pause(400);
    return { head, hash: location.hash, best: document.querySelector('.tq-best')?.textContent ?? '' };
  });
  check('busca "gyara" no modo Tipo → Gyarados water/flying; "Vou usar" fica no link', /Gyarados.*water.*flying/.test(typed.head) && /tipo=gyarados/.test(typed.hash) && /lado=usar/.test(typed.hash) && /Bons alvos/.test(typed.best), typed);
  // busca de Pokémon na tela inicial → jogo: abre o Onde capturar E deixa o Pokémon de oponente na Recomendação (0.71.1)
  await go('#/', 2500);
  const homeLink = await run(async () => {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('#searchMode [data-mode=pokemon]').click(); await pause(800); // a página ainda está no modo Tipo
    const input = document.querySelector('#homeSearch'); input.value = 'gyarados'; input.dispatchEvent(new Event('input')); await pause(1200);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await pause(400);
    return [...document.querySelectorAll('#homeDex a')].find((a) => /Emerald/.test(a.textContent))?.getAttribute('href') ?? '';
  });
  await go(homeLink, 4000);
  const both = await run(async () => {
    const dex = document.querySelector('#dexOut').textContent, onDex = !document.querySelector('#dex').hidden;
    document.querySelector('#tabRec').click(); await new Promise((r) => setTimeout(r, 1200));
    return { onDex, dex: dex.slice(0, 80), opp: document.querySelector('#opp').value, picks: document.querySelectorAll('#results .pick').length };
  });
  check('busca "gyarados" → Emerald: Onde capturar aberto e Gyarados já de oponente na Recomendação', /pokemon=gyarados/.test(homeLink) && both.onDex && /gyarados/i.test(both.opp) && both.picks > 0, { homeLink, both });
  // Pokémon selecionado (oponente Gyarados) leva às abas Golpes, Pokémon por tipo e Detonado (0.72.0)
  const tabs = await run(async () => {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    const click = async (id, ms = 1200) => { document.querySelector(id).click(); await pause(ms); };
    await click('#tabMoves');
    const moves = { q: document.querySelector('#movesQ').value, rows: document.querySelectorAll('#movesOut .moves-table tbody tr').length, first: document.querySelector('#movesOut .moves-table td.lv')?.textContent ?? '', txt: document.querySelector('#movesOut').textContent.slice(0, 400) };
    await click('#tabTypes');
    const types = { head: document.querySelector('#typesOut .vs-head')?.textContent ?? '', mons: [...document.querySelectorAll('#typesOut .mon-card .nm')].map((x) => x.textContent) };
    await click('#tabWalk', 2500);
    const walk = { q: document.querySelector('#walkSearch')?.value, hasGyarados: /Gyarados/.test(document.querySelector('#walk').textContent) };
    // limpar a busca do Detonado e voltar: continua limpa (o Pokémon só entra uma vez por seleção)
    const ws = document.querySelector('#walkSearch'); ws.value = ''; ws.dispatchEvent(new Event('input')); await pause(800);
    await click('#tabRec', 300); await click('#tabWalk', 1200);
    walk.after = document.querySelector('#walkSearch')?.value;
    return { moves, types, walk };
  });
  check('Golpes: Gyarados já carregado, tabela por nível a partir do nv 20', tabs.moves.q === 'Gyarados' && tabs.moves.rows >= 2 && /^nv 20\+/.test(tabs.moves.first), tabs.moves);
  check('Pokémon por tipo: "Bons contra Gyarados" com Manectric', /Bons contra Gyarados/.test(tabs.types.head) && tabs.types.mons.includes('Manectric'), tabs.types);
  check('Detonado: busca já com gyarados; limpar não traz de volta', tabs.walk.q === 'gyarados' && tabs.walk.hasGyarados && tabs.walk.after === '', tabs.walk);
  await go('#/jogo/emerald?aba=golpes&pokemon=pikachu&insignias=2', 2500);
  const gl = await run(() => ({ on: !document.querySelector('#moves').hidden, q: document.querySelector('#movesQ').value, txt: document.querySelector('#movesOut').textContent }));
  check('link ?aba=golpes&pokemon=pikachu&insignias=2: Thunderbolt (TM de Mauville) já no nv 1', gl.on && gl.q === 'Pikachu' && /nv 1electricThunderbolt 95 ★ \(TM\/HM · Mauville/.test(gl.txt) && /até: 2 insígnias/.test(gl.txt), { ...gl, txt: gl.txt.slice(0, 300) });
  await shot('emerald-golpes');
  // 0.73.0 "Vale a pena aprender?": Butterfree nv 15 no FireRed querendo o Sleep Powder (pedido do usuário)
  await run(() => { localStorage.removeItem('poketact:golpes:firered-leafgreen'); localStorage.removeItem('poketact:firered-leafgreen'); });
  await go('#/jogo/firered-leafgreen?aba=golpes&pokemon=butterfree&aprender=sleep-powder&insignias=4&meu=15', 3500);
  const learnState = () => run(() => ({ move: document.querySelector('#learnMove')?.value, cur: [...document.querySelectorAll('.learnCur')].map((e) => e.value),
    verdict: document.querySelector('.learn-verdict')?.textContent ?? '', txt: document.querySelector('#learnRes')?.textContent ?? '', label: document.querySelector('#learnCurLabel')?.textContent ?? '' }));
  const ln = await learnState();
  check('Vale a pena aprender: Butterfree nv 15 + Sleep Powder → vale, golpes estimados pela linha evolutiva', ln.move === 'sleep-powder' && ln.cur.join() === 'Harden,Confusion,Poison Powder,Stun Spore' && /Vale a pena: aprenda Sleep Powder e esqueça/.test(ln.verdict) && /estimados pelo nível/.test(ln.label), ln);
  check('Vale a pena aprender: próximas lutas (Sabrina) com a conta de Pokémon', /Próximas lutas/.test(ln.txt) && /funciona em \d+ de \d+/.test(ln.txt) && /Líder Sabrina/.test(ln.txt), ln.txt.slice(0, 400));
  await shot('firered-vale-aprender');
  await run(() => { const sel = document.querySelector('#learnForget'); sel.value = 'harden'; document.querySelector('#learnDone').click(); });
  await sleep(800);
  await go('#/jogo/firered-leafgreen?aba=golpes&pokemon=butterfree&insignias=4', 3500);
  const ln2 = await learnState();
  check('Aprendi: golpes guardados (Sleep Powder no lugar de Harden) e usados na próxima vez', ln2.cur.join() === 'Sleep Powder,Confusion,Poison Powder,Stun Spore' && /guardados por você/.test(ln2.label), ln2);
  await run(() => localStorage.removeItem('poketact:golpes:firered-leafgreen'));
  await go('#/?tipo=gyarados&jogo=emerald', 4000);
  const fight = await run(() => document.querySelector('.tq-head a')?.getAttribute('href') ?? '');
  check('tipo: "vou enfrentar Gyarados" no Emerald tem link para a recomendação contra ele', fight === '#/jogo/emerald?pokemon=gyarados', fight);
  await go('#/?tipo=psychic&ger=1', 3500);
  const g1 = await run(() => document.querySelector('.home-type')?.textContent ?? '');
  check('Psíquico na Geração I: aviso "ghost contra psychic é ×0 aqui"', /ghost contra psychic é ×0 aqui e ×2/.test(g1), g1.slice(0, 300));

  // 5e. 3 horas sem usar (decisão do usuário, 0.71.0): ao abrir, sem "Continuar de onde parou"; com menos de 3 h, aparece;
  // parado com o app aberto, a busca volta ao começo
  const resumeAfter = async (hoursAgo) => {
    await go('#/', 1500);
    await run((h) => { localStorage.setItem('poketact:last', 'emerald'); localStorage.setItem('poketact:lastAt', String(Date.now() - h * 3600e3)); }, hoursAgo);
    await send('Page.reload'); await sleep(2500);
    return run(() => ({ card: !!document.querySelector('#resume .resume'), last: localStorage.getItem('poketact:last') }));
  };
  const fresh = await resumeAfter(1), stale = await resumeAfter(4);
  check('ao abrir: com 1 h mostra "Continuar de onde parou"; com 4 h não mostra', fresh.card && !stale.card && stale.last === null, { fresh, stale });
  await go('#/?tipo=fire', 3000);
  const idle = await run(async () => {
    const real = Date.now; Date.now = () => real() + 4 * 3600e3;
    window.dispatchEvent(new Event('focus')); await new Promise((r) => setTimeout(r, 800)); Date.now = real;
    return { hash: location.hash, mode: document.querySelector('#searchMode [aria-checked=true]')?.dataset.mode, panel: document.querySelector('#homeType').hidden };
  });
  check('parado 4 h com o app aberto: busca por tipo volta ao começo', idle.hash === '#/' && idle.mode === 'pokemon' && idle.panel, idle);

  // 6. celular: sem rolagem lateral na tela do jogo (e na busca por tipo)
  await viewport(true);
  await go('#/jogo/red-blue', 3000);
  const w = await run(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
  check('celular (390 px): sem rolagem lateral', w.scroll <= w.inner + 1, w);
  await shot('red-celular');
  await go('#/?tipo=dragon&jogo=emerald', 4000);
  const wt = await run(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
  check('celular (390 px): busca por tipo sem rolagem lateral', wt.scroll <= wt.inner + 1, wt);
  await shot('tipo-celular');
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
