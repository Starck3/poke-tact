// Exclusivos de versão do Scarlet/Violet (R2, PLANO-EXECUCAO-5): o PKHeX não separa Scarlet × Violet nos selvagens nem nos
// símbolos fixos (EncounterArea9/EncounterFixed9 com Version = SV), então um Larvitar aparecia também no Violet. A página
// "Version-exclusive Pokémon" da Bulbapedia lista, por versão, os exclusivos do jogo base ({{VexHeader|Paldea}}) e de cada
// DLC ({{VexHeader|Kitakami}}, {{VexHeader|Blueberry}}) — a lista da DLC vale só nas fontes da DLC ("DLC Kitakami" ou o
// bloco "Sudachi 1" do PKHeX = The Teal Mask; "Sudachi 2" = The Indigo Disk, onde ficam os lendários do Snacksworth). Gligar
// é do Scarlet só em Kitakami. Tira da versão errada as fontes 'wild'/'static' (raid Tera "N★" já vem separada por versão no PKHeX; presente,
// troca e ovo ficam). Espécie sem fonte e sem pré-evolução obtível deixa de ser obtível naquela versão.
// Uso: node scripts/apply-bulbapedia-exclusives.mjs <jogo>   (roda depois do build-acquisition-pkhex; ≥ 5 s por página nova)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { page } from './lib/bulbapedia.mjs';
import { nameKey } from './lib/names.mjs';

const gameId = process.argv[2];
// cabeçalho da lista → fontes a que ela se aplica (pelo detail "DLC …" do build-acquisition-pkhex)
const CFG = {
  'scarlet-violet': { template: 'Vexscvi', lists: { Paldea: (s) => !/DLC|Sudachi/.test(s.detail ?? ''), Kitakami: (s) => /DLC Kitakami|Sudachi 1/.test(s.detail ?? ''), Blueberry: (s) => /DLC Blueberry|Sudachi 2/.test(s.detail ?? '') } },
};
const cfg = CFG[gameId];
if (!cfg) { console.log(`[${gameId}] exclusivos de versão pela Bulbapedia não configurados — nada a fazer`); process.exit(0); }
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
const versions = Object.keys(acq.versions);
const key = nameKey;

let text;
try { text = await page('Version-exclusive Pokémon'); } catch (e) { console.log(e.message); process.exit(2); }
// { lista: [{ species, form, only: 'scarlet' }] } — {{Vexscvi|0246|Larvitar|yes|no}}; form "-Paldea Blaze", "-Alola"
const lists = {};
for (const m of text.matchAll(/\{\{VexHeader\|(\w+)\|[^}]*\}\}([\s\S]*?)\{\{VexFooter/g)) {
  if (!(m[1] in cfg.lists)) continue;
  lists[m[1]] = [...m[2].matchAll(new RegExp(`\\{\\{${cfg.template}\\|[^|]*\\|([^|}]+)\\|(yes|no)\\|(yes|no)(?:\\|form=([^|}]+))?`, 'g'))]
    .map((x) => ({ species: x[1].trim(), form: x[4] ? x[4].replace(/^-/, '').trim() : null, has: [x[2] === 'yes', x[3] === 'yes'] }));
}
for (const l of Object.keys(cfg.lists)) if (!lists[l]?.length) { console.log(`[${gameId}] lista "${l}" não encontrada na página — parado`); process.exit(2); }

// espécie da lista → nomes do app: "Tauros" + "Paldea Blaze" → tauros-paldea-blaze-breed; "Sandshrew" + "Alola" → sandshrew-alola;
// "Kyurem" + "White" → kyurem-white; sem forma → a espécie sem sufixo regional
const names = data.pokemon.map((p) => p.name);
const appNames = (e) => {
  const base = key(e.species);
  const cands = names.filter((n) => key(n.split('-')[0]) === base || key(n) === base);
  if (!e.form) return cands.filter((n) => !/-(alola|galar|hisui|paldea)/.test(n) && (key(n) === base || !cands.some((c) => key(c) === base)));
  const f = key(e.form);
  return cands.filter((n) => key(n).replace(/breed$/, '').endsWith(f) || key(n) === base + f);
};
const report = { removed: [], noMatch: [], unobtainable: [] };
const touched = new Set();
for (const [list, applies] of Object.entries(cfg.lists)) for (const e of lists[list]) {
  const ns = appNames(e);
  if (!ns.length) { report.noMatch.push(`${list}: ${e.species}${e.form ? ' ' + e.form : ''}`); continue; }
  versions.forEach((v, i) => {
    if (e.has[i]) return; // a espécie existe nessa versão
    for (const n of ns) {
      const src = acq.versions[v][n];
      if (!src) continue;
      const keep = src.filter((s) => !(['wild', 'static'].includes(s.type) && !/★/.test(s.detail ?? '') && applies(s)));
      if (keep.length === src.length) continue;
      report.removed.push(`${v} ${n} (${list}): −${src.length - keep.length}`);
      if (keep.length) acq.versions[v][n] = keep; else delete acq.versions[v][n];
      touched.add(`${v}|${n}`);
    }
  });
}
// obtível: espécie mexida sem fonte nenhuma só continua obtível se evolui de algo obtível (em ordem da Pokédex: pré-evolução antes)
// as evoluções delas também (Tyranitar no Violet só existia por evoluir do Pupitar; a creche chocaria Larvitar dele)
const byId = new Map(data.pokemon.map((p) => [p.id, p]));
const fromTouched = (mon, v, seen = new Set()) => {
  if (touched.has(`${v}|${mon.name}`)) return true;
  const parent = byId.get(mon.evolvesFrom);
  return !!parent && parent.id !== mon.id && !seen.has(parent.id) && (seen.add(parent.id), fromTouched(parent, v, seen));
};
const depth = (mon, n = 0) => { const p = byId.get(mon.evolvesFrom); return p && p.id !== mon.id && n < 5 ? depth(p, n + 1) : n; };
for (const v of versions) for (const mon of [...data.pokemon].sort((a, b) => depth(a) - depth(b))) {
  if (!fromTouched(mon, v) || acq.versions[v][mon.name]?.length) continue;
  const parent = data.pokemon.find((p) => p.id === mon.evolvesFrom && p.id !== mon.id);
  const ok = !!parent?.obtainable?.[v] && mon.evo?.possible !== false;
  if (mon.obtainable[v] && !ok) { mon.obtainable[v] = false; report.unobtainable.push(`${v} ${mon.name}`); }
}
acq.notes = (acq.notes ?? []).filter((n) => !/não separa as versões|^Exclusivos de versão pela lista/.test(n)); // idempotente: não repete a nota ao rodar de novo
acq.notes.push('Exclusivos de versão pela lista da Bulbapedia ("Version-exclusive Pokémon"): o PKHeX não separa Scarlet × Violet nos selvagens.');
acq.exclusivesSource = 'Bulbapedia (Version-exclusive Pokémon) — CC BY-NC-SA, fatos extraídos';
writeFileSync(acqFile, JSON.stringify(acq));
writeFileSync(dataFile, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-exclusives.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}] exclusivos de versão pela Bulbapedia: ${report.removed.length} espécies/versão com fontes tiradas; ${report.unobtainable.length} deixam de ser obtíveis; sem par no app ${report.noMatch.length}`);
