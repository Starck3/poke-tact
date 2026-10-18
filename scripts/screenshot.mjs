// Captura de tela confiável (E6): Chrome headless pelo DevTools Protocol, espera o seletor aparecer e lista erros do console.
// Uso (com node scripts/serve.mjs rodando): node scripts/screenshot.mjs "http://localhost:5173/#/jogo/platinum?aba=detonado" saida.png "details.stage"
// (--screenshot/--virtual-time-budget do Chrome capturam antes do fetch dos JSONs grandes terminar)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 4º argumento opcional: largura (ex.: 375 = celular); a altura acompanha a página (até 6000 px)
const [url, out, sel, w = '1280'] = process.argv.slice(2);
const width = Number(w), mobile = width < 600;
const port = 9333;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, '--window-size=1280,2400', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ')); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height: 1200, deviceScaleFactor: 1, mobile });
// TEMA=light|dark força o prefers-color-scheme (conferir os dois temas)
if (process.env.TEMA) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: process.env.TEMA }] });
await send('Page.navigate', { url });
let ok = false;
for (let i = 0; i < 60 && !ok; i++) { await sleep(500); const r = await send('Runtime.evaluate', { expression: `!!document.querySelector(${JSON.stringify(sel)})`, returnByValue: true }); ok = r?.result?.value === true; }
await sleep(800);
// ACAO="js" roda na página antes da captura (ex.: digitar na busca) para conferir estados interativos
// replMode: permite "await" no nível de cima do ACAO; erro do ACAO aparece no relatório
if (process.env.ACAO) { const r = await send('Runtime.evaluate', { expression: process.env.ACAO, awaitPromise: true, replMode: true, returnByValue: true }); if (r?.exceptionDetails) errors.push('ACAO: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)); else if (r?.result?.value !== undefined) console.log('ACAO →', JSON.stringify(r.result.value)); await sleep(600); }
const h =(await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true }))?.result?.value ?? 1200;
await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(Math.max(h, 600), 6000), deviceScaleFactor: 1, mobile });
await sleep(300);
const overflow = (await send('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth > innerWidth + 1', returnByValue: true }))?.result?.value;
if (overflow) errors.push(`rolagem horizontal na largura ${width}px`);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(ok ? 'renderizado' : 'seletor NÃO apareceu', errors.length ? 'ERROS: ' + errors.join(' | ').slice(0, 800) : 'sem erros no console');
ws.close(); chrome.kill();
process.exit(0);
