// Ordem da história pelo índice do detonado da Bulbapedia ("Appendix:<jogo> walkthrough": partes em ordem, cada uma com os
// lugares; ilhas/regiões como cabeçalho; "Post-Game") — P3/N6, PLANO-EXECUCAO-3.
//   • jogo SEM progresso (Ultra Sun/Ultra Moon, sem detonado): marcos = provações ("Trial N: …") e grandes provações ("…
//     Grand Trial"), na ordem; estágio de um lugar = marcos antes da 1ª vez que ele aparece; "Post-Game" = pós-jogo. Dá
//     progress (stageNames), o estágio do onde obter e dos treinadores (pelo lugar da luta; revanche/defesa de título →
//     pós-jogo).
//   • jogo COM progresso: só os lugares com estágio ESTIMADO pelo nível (B3) — vale o estágio de outro lugar da MESMA parte
//     do detonado da Bulbapedia que já tem estágio do detonado em português (by: 'parte do detonado da Bulbapedia').
// Uso: node scripts/apply-bulbapedia-walkthrough.mjs <jogo>   (≥ 5 s por página nova)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { page, plain } from './lib/bulbapedia.mjs';

const gameId = process.argv[2];
const TITLE = { 'ultra-sun-ultra-moon': 'Appendix:Ultra Sun and Ultra Moon walkthrough', 'sun-moon': 'Appendix:Sun and Moon walkthrough', 'black-white': 'Appendix:Black and White walkthrough',
  'sword-shield': 'Appendix:Sword and Shield walkthrough', 'scarlet-violet': 'Appendix:Scarlet and Violet walkthrough', 'legends-za': 'Appendix:Legends: Z-A walkthrough' };
if (!TITLE[gameId]) { console.log(`[${gameId}] sem índice de detonado da Bulbapedia configurado — nada a fazer`); process.exit(0); }
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const trFile = new URL(`../public/data/${gameId}-trainers.json`, import.meta.url);
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
let text;
try { text = await page(TITLE[gameId]); } catch (e) { console.log(e.message); process.exit(2); }
if (!text) { console.log(`[${gameId}] ${TITLE[gameId]}: página não existe`); process.exit(0); }

// partes em ordem: [{ part, header, items: ['Route 1', 'Trial 1: Verdant Cavern', …] }]
const parts = [];
let header = '';
for (const l of text.split('\n')) {
  const h = l.match(/colspan="2"[^|]*\|\s*([^|]+)$/);
  if (h) { header = plain(h[1]); continue; }
  const p = l.match(/\|Part (\d+)\]\]/);
  // a parte é identificada pela POSIÇÃO no índice: o do Scarlet/Violet recomeça "Part 1, 2, 3…" em cada DLC
  if (p) parts.push({ part: parts.length + 1, number: Number(p[1]), header, items: [] });
  const loc = l.match(/^\| style="padding: 0\.5em;" \| ''(.+)''/);
  if (loc && parts.length) parts.at(-1).items = plain(loc[1]).split(/,\s*/).map((x) => x.replace(/^(Optional|Introduction):?\s*/i, '').trim()).filter(Boolean);
}
const norm = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const isPost = (h) => /post-?game/i.test(h);
// marco = provação / grande provação (USUM); stage do lugar = marcos antes da 1ª menção
const milestones = [];
const firstStage = new Map(), partOf = new Map();
for (const p of parts) for (const it of p.items) {
  // "Trial 1: Verdant Cavern", "Mina's Trial" (USUM), "Poni Grand Trial"
  const trial = it.match(/^Trial \d+:\s*(.+)$/i) ?? it.match(/^(\w+'s) Trial$/i), grand = it.match(/^(\w[\w' ]*?) Grand Trial$/i);
  const where = trial ? trial[1] : it;
  const k = norm(where);
  if (!firstStage.has(k)) firstStage.set(k, isPost(p.header) ? 'post' : milestones.length);
  if (!partOf.has(k)) partOf.set(k, p.part);
  if (trial) milestones.push({ label: /^The Captainless Trial$/i.test(trial[1]) ? 'provação sem capitão' : /'s$/.test(trial[1]) ? `provação da ${trial[1].replace(/'s$/, '')}` : `provação de ${trial[1]}` });
  if (grand) milestones.push({ label: `grande provação de ${grand[1]}` });
}
// lugar do app → parte/estágio: o nome da Bulbapedia é igual ou começa o do app ("Route 5 (South)" → "Route 5 (South)";
// "Poni Wilds" → "Poni Wilds"); o mais longo vence
// nome do lugar dos treinadores na Bulbapedia: "Alola Route 1", "Pokémon League (Alola)" → "Route 1", "The Pokémon League"
const clean = (s) => s.replace(/^(Alola|Kanto)\s+(?=Route)/i, '').replace(/\s*\((Alola|Kanto)\)\s*$/i, '').replace(/^Pokémon League$/i, 'The Pokémon League');
const lookup = (where, map) => {
  const w = norm(clean(where));
  let best = null;
  for (const [k, v] of map) if (w === k || w.startsWith(k + ' ')) if (!best || k.length > best.k.length) best = { k, v };
  if (best) return best.v;
  // o do app é mais curto ("Route 5" ⊂ "Route 5 (South)"/"(North)"): a parte/estágio mais cedo entre eles
  const cands = [...map].filter(([k]) => k.startsWith(w + ' ')).map(([, v]) => v).filter((v) => v !== 'post');
  return cands.length ? Math.min(...cands) : undefined;
};
const report = { parts: parts.length, milestones: milestones.map((m) => m.label), changed: [] };
if (!acq.progress) {
  // ---- USUM: progresso pelo índice
  const POST = milestones.length + 1;
  const stageNames = ['antes da 1ª provação', ...milestones.map((m, i) => `${i + 1} provaç${i ? 'ões' : 'ão'} (depois da ${m.label})`)];
  let withStage = 0, total = 0;
  for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) {
    if (s.type === 'breed') continue;
    total++;
    const st = lookup(s.where, firstStage);
    if (st == null) continue;
    s.stage = st === 'post' ? POST : st; s.stageSource = 'Bulbapedia'; withStage++;
  }
  acq.progress = { leaderOrder: milestones.map((m) => m.label), stageNames, post: POST, source: `Bulbapedia (${TITLE[gameId]}: ordem das partes, provações e grandes provações)`, placesWithStage: withStage, placesTotal: total };
  writeFileSync(acqFile, JSON.stringify(acq));
  if (existsSync(trFile)) {
    const tr = JSON.parse(readFileSync(trFile, 'utf8'));
    const trainerStage = {};
    // grande provação: o estágio é o do marco dela (o lugar, ex.: Iki Town, aparece antes na história) — kahunas na ordem
    // das grandes provações do índice
    const grand = milestones.map((m, i) => (/^grande provação/.test(m.label) ? i : null)).filter((x) => x != null);
    const kahunas = [...new Set(tr.trainers.filter((t) => t.group === 'Líderes de ginásio' && /Grand trial/i.test(t.label)).map((t) => t.name))];
    for (const t of tr.trainers) {
      const k = /Grand trial/i.test(t.label) ? kahunas.indexOf(t.name) : -1;
      const st = k >= 0 && grand[k] != null ? grand[k] : /Title Defense|Post-?game|Post–Hall|Rematch|Round 2|Battle Tree/i.test(t.label) ? 'post' : (t.map ?? []).map((m) => lookup(m, firstStage)).find((x) => x != null);
      t.stage = st == null ? null : st === 'post' ? POST : st;
      if (t.stage != null) trainerStage[t.key] = t.stage;
    }
    acq.progress.trainerStage = trainerStage;
    writeFileSync(trFile, JSON.stringify(tr));
    writeFileSync(acqFile, JSON.stringify(acq));
  }
  report.withStage = `${withStage}/${total}`;
  console.log(`[${gameId}] progresso pela Bulbapedia: ${milestones.length} marcos; onde obter com estágio ${withStage}/${total}; treinadores com estágio ${Object.keys(acq.progress.trainerStage ?? {}).length}`);
} else {
  // ---- outros: estimativa (B3) → estágio de outro lugar da mesma parte (com estágio do detonado, não estimado)
  // parte → MAIOR estágio conhecido nela (um lugar que abre cedo e é revisitado na parte — Route 16 do BW, estágio 4, na
  // parte 18 do pós-campeão — não adianta os outros); parte com cabeçalho de pós-jogo ("Post-Champion") → pós-jogo
  // (MEDIANA dos lugares da parte: o menor puxava a Route 15 do BW para o estágio 4 por causa da Route 16, que abre cedo; o
  // maior puxava a Route 16 do SM para o fim por causa de um lugar revisitado no pós-jogo)
  const stagesOf = new Map(); // parte → { lugar → menor estágio do lugar }
  for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) {
    if (s.stage == null || s.stageEstimated || s.type === 'breed') continue;
    const part = lookup(s.where, partOf);
    if (part == null) continue;
    const m = stagesOf.get(part) ?? stagesOf.set(part, new Map()).get(part);
    const place = norm(clean(s.where));
    m.set(place, Math.min(m.get(place) ?? 99, s.stage));
  }
  const known = new Map([...stagesOf].map(([part, m]) => { const a = [...m.values()].sort((x, y) => x - y); return [part, a[Math.floor((a.length - 1) / 2)]]; }));
  const POSTSTAGE = acq.progress.post ?? 9;
  for (const p of parts) if (/post-?(game|champion)|after the (champion|hall)/i.test(p.header)) known.set(p.part, POSTSTAGE);
  for (const v of Object.values(acq.versions)) for (const list of Object.values(v)) for (const s of list) {
    if (!s.stageEstimated) continue;
    const part = lookup(s.where, partOf);
    if (part == null || !known.has(part)) continue;
    if (s.stage !== known.get(part)) report.changed.push(`${s.where}: ${s.stage} → ${known.get(part)} (parte ${part})`);
    s.stage = known.get(part); delete s.stageEstimated; s.stageBy = 'parte do detonado da Bulbapedia';
  }
  writeFileSync(acqFile, JSON.stringify(acq));
  console.log(`[${gameId}] estimativas trocadas pela parte do detonado da Bulbapedia: ${new Set(report.changed.map((c) => c.split(':')[0])).size} lugares`);
}
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-walkthrough.json`, import.meta.url), JSON.stringify(report, null, 1));
