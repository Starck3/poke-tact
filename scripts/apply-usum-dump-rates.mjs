// Taxa de aparição do Ultra Sun pelo despejo das tabelas do jogo (F3, PLANO-EXECUCAO-8): CPokemon/usum-data
// (github.com/CPokemon/usum-data, "Datamine de Pokémon USUM", arquivo encounter_es.txt — fonte aprovada pelo usuário em
// 2026-10-28; cópia só em data-sources/cpokemon-usum/, nunca no git). O despejo é do ULTRA SUN (tem Passimian, Turtonator e
// Rufflet, exclusivos dele) — vale só para essa versão. Cada mapa tem tabelas Dia/Noite com "Espécie (20%)" e a faixa de nível,
// sem dizer o método (grama, Surf…). Os nomes dos mapas estão em espanhol: traduzidos pelas listas de lugares do PKHeX
// (text_sm_00000_es.txt × _en.txt, linha a linha).
// 1) confere as taxas que vieram da Bulbapedia (relatório: quantas batem); 2) preenche as que ficaram sem taxa quando todas as
// tabelas do lugar com a espécie e o nível dão a mesma taxa (dia/noite). Uso: node scripts/apply-usum-dump-rates.mjs <jogo>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { nameKey } from './lib/names.mjs';

const gameId = process.argv[2];
if (gameId !== 'ultra-sun-ultra-moon') { console.log(`[${gameId}] despejo do CPokemon/usum-data só vale para o Ultra Sun — nada a fazer`); process.exit(0); }
const DUMP = new URL('../data-sources/cpokemon-usum/encounter_es.txt', import.meta.url);
if (!existsSync(DUMP)) { console.log(`[${gameId}] data-sources/cpokemon-usum/encounter_es.txt ausente — mantido o arquivo anterior`); process.exit(process.env.POKETACT_STRICT ? 1 : 0); }
const LOC = new URL('../data-sources/pkhex-src/PKHeX.Core/Resources/text/locations/gen7/', import.meta.url);
const en = readFileSync(new URL('text_sm_00000_en.txt', LOC), 'utf8').split(/\r?\n/), es = readFileSync(new URL('text_sm_00000_es.txt', LOC), 'utf8').split(/\r?\n/);
const ES = new Map();
for (let i = 0; i < es.length; i++) if (es[i] && en[i] && !ES.has(es[i])) ES.set(es[i], en[i]);
// "Ruta 1 (Afueras de Hauoli)" → "Route 1 (Hau’oli Outskirts)"
const tr = (n) => { const m = n.match(/^(.+?)(?: \((.+)\))?$/); return m && ES.has(m[1]) ? ES.get(m[1]) + (m[2] ? ` (${ES.get(m[2]) ?? m[2]})` : '') : null; };

// tabelas: [{ places: Set(nomes em inglês), time: 'dia'|'noite', table, min, max, mons: [{ key, form, pct }] }]
const tables = [];
let places = new Set(), untranslated = new Set();
for (const line of readFileSync(DUMP, 'utf8').split(/\r?\n/)) {
  const mp = line.match(/^Map: (.*)$/);
  if (mp) { places = new Set(mp[1].split(' / ').map((x) => x.replace(/^\d+ - /, '')).map((x) => tr(x) ?? (untranslated.add(x), null)).filter(Boolean)); continue; }
  const tb = line.match(/^Table (\d+) \((Day|Night)\):/);
  if (tb) { tables.push({ places, table: Number(tb[1]), time: tb[2] === 'Day' ? 'dia' : 'noite', mons: [] }); continue; }
  const enc = line.match(/^Encounters \(Levels (\d+)(?:-(\d+))?\): (.*)$/);
  if (enc && tables.length) {
    const t = tables.at(-1);
    t.min = Number(enc[1]); t.max = Number(enc[2] ?? enc[1]);
    for (const m of enc[3].matchAll(/([^,(]+?)(?: \(Forme (\d+)\))? \((\d+)%\)/g)) t.mons.push({ key: nameKey(m[1]), form: Number(m[2] ?? 0), pct: Number(m[3]) });
  }
}

const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
const SRC = 'CPokemon/usum-data (tabelas do Ultra Sun)';
const rated = (s) => s.type === 'wild' && !/^(Chamado SOS|Horda)$/.test(s.method);
const report = { tables: tables.length, untranslated: [...untranslated], checked: 0, agree: 0, disagree: [], filled: [], ambiguous: [], none: 0 };
const v = acq.versions['ultra-sun'];
for (const [sp, list] of Object.entries(v)) for (const s of list) {
  if (!rated(s)) continue;
  if (s.pctSource === SRC) { delete s.pct; delete s.pctSource; delete s.pctTimes; }
  // forma: "Rattata (Forme 1)" = de Alola; espécie sem sufixo = forma 0
  const base = nameKey(sp.replace(/-(alola|totem|.*)$/, '')), alola = /-alola$/.test(sp);
  const hits = tables.filter((t) => t.places.has(s.where) && Math.min(s.max, t.max) - Math.max(s.min, t.min) >= 0)
    .map((t) => ({ t, m: t.mons.filter((m) => m.key === base && (alola ? m.form >= 1 : m.form === 0)) })).filter((h) => h.m.length);
  if (!hits.length) { report.none++; continue; }
  // por tabela: { dia, noite } (soma dos slots da espécie)
  const byTable = new Map();
  for (const h of hits) { const k = [...h.t.places].join('/') + '#' + h.t.table; const o = byTable.get(k) ?? {}; o[h.t.time] = (o[h.t.time] ?? 0) + h.m.reduce((a, m) => a + m.pct, 0); byTable.set(k, o); }
  const opts = [...new Set([...byTable.values()].map((o) => JSON.stringify({ dia: o.dia ?? 0, noite: o.noite ?? 0 })))].map((x) => JSON.parse(x));
  if (s.pct != null) {
    // conferência: a taxa da Bulbapedia aparece em alguma tabela do lugar?
    report.checked++;
    const bul = s.pctTimes ? { dia: s.pctTimes.dia ?? 0, noite: s.pctTimes.noite ?? 0 } : { dia: s.pct, noite: s.pct };
    if (opts.some((o) => o.dia === bul.dia && o.noite === bul.noite)) report.agree++;
    else report.disagree.push(`${sp} ${s.where} nv ${s.min}-${s.max}: Bulbapedia ${JSON.stringify(bul)} × despejo ${JSON.stringify(opts)}`);
    continue;
  }
  if (opts.length !== 1) { report.ambiguous.push(`${sp} ${s.where} nv ${s.min}-${s.max}: ${JSON.stringify(opts)}`); continue; }
  const o = opts[0];
  // 100% de uma espécie só = tabela de encontro especial (árvore de frutas dos Berry Fields, pássaro das árvores…), não a grama
  if (o.dia === 100 || o.noite === 100) { report.special = [...(report.special ?? []), `${sp} ${s.where}`]; continue; }
  s.pct = Math.max(o.dia, o.noite); s.pctSource = SRC;
  if (o.dia !== o.noite) s.pctTimes = { dia: o.dia, noite: o.noite };
  report.filled.push(`${sp} ${s.where}: ${JSON.stringify(o)}`);
}
acq.usumDumpSource = 'CPokemon/usum-data (encounter_es.txt, tabelas do Ultra Sun; lugares traduzidos pelo PKHeX)';
writeFileSync(acqFile, JSON.stringify(acq));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/usum-dump-rates.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}] despejo do Ultra Sun: ${report.tables} tabelas; Bulbapedia conferida ${report.agree}/${report.checked}; preenchidas ${report.filled.length}; ambíguas ${report.ambiguous.length}; sem tabela ${report.none}; lugares sem tradução ${report.untranslated.length}`);
