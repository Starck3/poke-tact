// TMs sem origem no decomp do Black 2/White 2 (N8, PLANO-EXECUCAO-3): as 15 vendidas nas lojas comuns (Sunny Day, Hyper
// Beam, Blizzard…) — o decomp não tem as lojas em texto. Onde comprar: linha "{{TMtable/row|{{gameabbrev5|B2W2}}|lugar|preço"
// da página "TMnn" da Bulbapedia; o número da TM vem da tabela do próprio jogo (lib/gen5-bw2.mjs: tmMoves/tmIndex).
// O lugar ganha o estágio do mapa do jogo com o mesmo nome (progress.maps).
// Uso: node scripts/apply-bulbapedia-tms.mjs black-2-white-2   (≥ 5 s por página nova)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadBw2 } from './lib/gen5-bw2.mjs';
import { page, plain } from './lib/bulbapedia.mjs';

const gameId = process.argv[2];
if (gameId !== 'black-2-white-2') { console.log(`[${gameId}] só o Black 2/White 2 tem TMs sem origem no decomp — nada a fazer`); process.exit(0); }
const game = GAMES[gameId];
const g = loadBw2(new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url));
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
const moveIdOf = new Map(Object.keys(data.moves).map((n) => [JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n]));
// índice da tabela do jogo → "TM11" / "HM01" (inverso do tmIndex: TM1–92, HM1–6, TM93–95)
const label = (i) => (i < 92 ? `TM${String(i + 1).padStart(2, '0')}` : i < 98 ? `HM${String(i - 91).padStart(2, '0')}` : `TM${93 + i - 98}`);
const mapStage = new Map(Object.values(acq.progress?.maps ?? {}).map((m) => [m.label.toLowerCase(), m.stage]));
const added = [], missing = [];
for (let i = 0; i < g.tmMoves.length; i++) {
  const move = moveIdOf.get(g.tmMoves[i]);
  if (!move || acq.machines[move]?.length) continue;
  let text;
  try { text = await page(label(i)); } catch (e) { console.log(e.message); process.exit(2); }
  const row = (text ?? '').match(/\{\{TMtable\/row\|\{\{gameabbrev5\|B2W2\}\}\|([^|]*)\|([^|]*)\|/);
  if (!row) { missing.push(`${label(i)} ${move}`); continue; }
  const where = plain(row[1]), price = plain(row[2]);
  // mesmo nome do mapa, ou o mapa cujo nome começa o do lugar ("Striaton City Poké Mart" → "Striaton City"); sem casar,
  // fica sem estágio (o motor conta como pós-jogo)
  const stageOf = (x) => { const k = x.replace(/\(.*$/, '').trim().toLowerCase(); if (mapStage.has(k)) return mapStage.get(k); const pre = [...mapStage].filter(([l]) => k.startsWith(l + ' ')).map(([, s]) => s); return pre.length ? Math.min(...pre) : null; };
  const stages = where.split(/[,;]/).map(stageOf).filter((x) => x != null);
  acq.machines[move] = [{ type: /\d/.test(price) ? 'mart' : 'gift', where, by: `Bulbapedia${/\d/.test(price) ? ` (${price})` : ''}`, stage: stages.length ? Math.min(...stages) : null, source: 'Bulbapedia' }];
  added.push(`${label(i)} ${move} → ${where}${stages.length ? ` (estágio ${Math.min(...stages)})` : ''}`);
}
writeFileSync(acqFile, JSON.stringify(acq));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-tms.json`, import.meta.url), JSON.stringify({ added, missing }, null, 1));
console.log(`[${gameId}] TMs pela Bulbapedia: +${added.length}${missing.length ? `; sem linha: ${missing.join(', ')}` : ''}\n  ${added.join('\n  ')}`);
