// Confere a LEITURA dos binários do Diamond/Pearl (pret/pokediamond) — falha se algo deixar de fechar:
//   • scripts de mapa (bytecode): todo script termina em End/Return/GoTo e todo salto cai num comando (os "level scripts" do
//     cabeçalho têm outro formato e ficam de fora); comandos com tamanho incerto que aparecem nos scripts são listados
//   • eventos de todos os cabeçalhos leem sem bytes sobrando; matrizes e encontros com o tamanho do formato
// Relatório: reports/<jogo>/dp-script-audit.json. Uso: node scripts/validate-dp-scripts.mjs <jogo>
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadDpField, parseEncounters, parseMatrix } from './lib/gen4-dp-field.mjs';

const gameId = process.argv[2] ?? 'diamond-pearl';
const root = new URL(`../data-sources/${GAMES[gameId].asmDecomp.dir}/`, import.meta.url);
const F = loadDpField(root);
const level = new Set(F.headers.map((h) => h.level));
const report = { scripts: 0, scriptErrors: [], uncertainUsed: {}, events: 0, eventErrors: [], matrices: 0, matrixErrors: [], encounters: 0, encounterErrors: [] };
for (const f of readdirSync(new URL('files/fielddata/script/scr_seq_release/', root)).filter((x) => x.endsWith('.bin'))) {
  const n = Number(f.match(/\d+/)[0]);
  if (level.has(n)) continue;
  const s = F.scriptFile(n);
  report.scripts++;
  if (s.errors.length) report.scriptErrors.push({ file: f, error: s.errors[0] });
  for (const c of s.code.values()) if (F.cmds.uncertain.has(c.op)) report.uncertainUsed[F.cmds.names[c.op]] = (report.uncertainUsed[F.cmds.names[c.op]] ?? 0) + 1;
}
for (const h of F.headers) { try { F.events(h); report.events++; } catch (e) { report.eventErrors.push({ map: h.id, error: e.message }); } }
for (let n = 0; ; n++) { const b = F.raw('mapmatrix/map_matrix', n); if (!b) break; try { parseMatrix(b); report.matrices++; } catch (e) { report.matrixErrors.push({ file: n, error: e.message }); } }
for (const h of F.headers.filter((x) => x.enc)) for (const [v, dir] of [['diamond', 'd_enc_data'], ['pearl', 'p_enc_data']]) {
  try { parseEncounters(F.raw(`encountdata/${dir}`, h.enc[v])); report.encounters++; } catch (e) { report.encounterErrors.push({ map: h.id, version: v, error: e.message }); }
}
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/dp-script-audit.json`, import.meta.url), JSON.stringify(report, null, 1));
const errors = report.scriptErrors.length + report.eventErrors.length + report.matrixErrors.length + report.encounterErrors.length;
console.log(`[${gameId}] scripts ${report.scripts} (${report.scriptErrors.length} com erro) | eventos ${report.events} | matrizes ${report.matrices} | encontros ${report.encounters}` +
  ` | comandos de tamanho incerto em uso: ${Object.keys(report.uncertainUsed).length} (conferidos no código; ver gen4-dp-script.mjs)`);
for (const e of [...report.scriptErrors, ...report.eventErrors, ...report.matrixErrors, ...report.encounterErrors].slice(0, 10)) console.log('  ', JSON.stringify(e));
if (errors) process.exit(1);
