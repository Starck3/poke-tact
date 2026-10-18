// Supervisor do coletor da Bulbapedia: roda scripts/fetch-bulbapedia.mjs; se ele parar por bloqueio (exit 2),
// espera e tenta de novo UMA vez por ciclo (o coletor em si já usa 5 s entre páginas e para no 1º erro).
// Limites para não insistir contra um bloqueio permanente: MAX_PROBES ciclos, com espera crescente.
// Uso: node scripts/fetch-bulbapedia-loop.mjs   (log em reports/fetch-bulbapedia.log)
import { spawn } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';

const MAX_PROBES = 8;
const WAIT_MIN = [30, 30, 45, 60, 60, 90, 120, 120]; // minutos entre tentativas após um bloqueio
const LOG = new URL('../reports/fetch-bulbapedia.log', import.meta.url);
await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
const log = (m) => appendFile(LOG, `${new Date().toISOString()} ${m}\n`).then(() => console.log(m));

const run = () => new Promise((resolve) => {
  const p = spawn(process.execPath, ['scripts/fetch-bulbapedia.mjs'], { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('close', (code) => resolve({ code, out: out.trim() }));
});

for (let i = 0; i < MAX_PROBES; i++) {
  const { code, out } = await run();
  await log(`tentativa ${i + 1}/${MAX_PROBES}: exit ${code} — ${out.split('\n').at(-1)}`);
  if (code === 0) { await log('CONCLUÍDO'); process.exit(0); }
  if (code !== 2) { await log('erro inesperado; encerrando'); process.exit(1); }
  await log(`bloqueio; próxima tentativa em ${WAIT_MIN[i]} min`);
  await new Promise((r) => setTimeout(r, WAIT_MIN[i] * 60_000));
}
await log(`desisti após ${MAX_PROBES} tentativas; o bloqueio persiste. Retome manualmente mais tarde.`);
process.exit(3);
