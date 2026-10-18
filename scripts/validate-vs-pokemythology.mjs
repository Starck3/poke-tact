// Confronta o dataset com o detonado do PokeMythology (só leitura do cache local; sem rede):
//   • times de líderes, Elite dos Quatro e campeão (espécie + nível) × times do decomp
// Uso: node scripts/validate-vs-pokemythology.mjs <jogo>  → reports/<jogo>/pokemythology-audit.json
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseTrainerBlocks } from './lib/pokemythology.mjs';

const gameId = process.argv[2] ?? 'firered-leafgreen';
import { GAMES } from './games.mjs';
const SLUG = Object.fromEntries(Object.entries(GAMES).map(([id, g]) => [id, g.walkthrough])); // nome do detonado vem do config
const game = GAMES[gameId];
const file = new URL(`../data-sources/pokemythology/${SLUG[gameId]}.html`, import.meta.url);
if (!existsSync(file)) { console.log(`[${gameId}] sem detonado em cache — rode scripts/fetch-pokemythology.mjs`); process.exit(0); }
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); // Érika = ERIKA
const { trainers } = JSON.parse(readFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), 'utf8'));
const named = trainers.filter((t) => t.name && norm(t.name).length >= 3);
const blocks = parseTrainerBlocks(readFileSync(file, 'utf8'));

// Grafia: o detonado tem erros de digitação (ex.: "Victreebell"). Aceita 1 letra de diferença e registra no relatório.
const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const typos = [];
const allSpecies = [...new Set(trainers.flatMap((t) => t.party.map((p) => norm(p.species))))];
const fixName = (s) => {
  const n = norm(s);
  if (allSpecies.includes(n)) return n;
  const near = allSpecies.find((x) => lev(x, n) === 1);
  if (near) { typos.push(`${s} → ${near}`); return near; }
  return n;
};
const sig = (party) => party.map((p) => `${fixName(p.species)}@${p.level}`).sort().join(',');
const results = [];
const unmatched = [];
for (const b of blocks) {
  // nome do treinador no título do detonado ("Líder Brock – Tipo Pedra")
  // nome: primeiro no título (última frase); se não houver, no parágrafo todo, priorizando líderes/Elite/campeão/rival
  // ("…Wallace… E te desejo boa sorte contra Milotic!"). "Tate e Liza" = TATE&LIZA no jogo.
  const VIP = new Set(['Líderes de ginásio', 'Elite dos Quatro', 'Campeão', 'Rival']);
  // palavras inteiras ("e te desejo" NÃO contém o treinador TED); "e"/"&" entre nomes são ignorados
  const words = (s) => ' ' + s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && w !== 'e').join(' ') + ' ';
  const pick = (text, pool) => {
    const t = words(text);
    const hits = pool.filter((x) => t.includes(words(x.name)));
    const longest = Math.max(0, ...hits.map((x) => words(x.name).length));
    return hits.filter((x) => words(x.name).length === longest);
  };
  // nomes podem repetir (Giovanni da Rocket × do ginásio; revanches): basta um time igual entre os homônimos
  let candidates = pick(b.title, named);
  if (!candidates.length) candidates = pick(b.context, named.filter((t) => VIP.has(t.group) && norm(t.name).length >= 4));
  const want = sig(b.party);
  // último recurso: o bloco não traz o nome (campeão do Emerald) → identifica pelo time entre líderes/Elite/campeão
  let matchedBy = 'nome';
  if (!candidates.length) {
    candidates = named.filter((t) => VIP.has(t.group) && sig(t.party) === want);
    matchedBy = 'time';
  }
  if (!candidates.length) { unmatched.push(b.title); continue; }
  const exact = candidates.find((t) => sig(t.party) === want);
  // parcial: o detonado lista só parte do time (RS: "Archie/Maxie usará" traz os 2 Pokémon comuns e omite o da versão)
  const wantList = want.split(',');
  const partial = !exact && candidates.find((t) => { const have = sig(t.party).split(','); return wantList.every((x) => have.includes(x)) && have.length - wantList.length <= 1; });
  // divergência conhecida: registrada no config com a justificativa (o decomp é o código do jogo)
  const known = !exact && !partial && candidates.find((t) => game.walkthroughKnownDiffs?.[t.key]);
  results.push({
    title: b.title,
    detonado: b.party.map((p) => `${p.species} ${p.level}`),
    status: exact ? 'MATCH' : partial ? 'MATCH_PARCIAL' : known ? 'DIVERGENCIA_CONHECIDA' : 'MISMATCH',
    matchedBy,
    ...(known && { why: game.walkthroughKnownDiffs[known.key] }),
    decomp: exact ? exact.key : partial ? partial.key : candidates.map((t) => ({ key: t.key, party: t.party.map((p) => `${p.species} ${p.level}`) })),
  });
}
writeFileSync(new URL(`../reports/${gameId}/pokemythology-audit.json`, import.meta.url), JSON.stringify({ typos: [...new Set(typos)], unmatched, results }, null, 1));
const n = (s) => results.filter((r) => r.status === s).length;
console.log(`[${gameId}] times comparados com o detonado: ${results.length} | iguais: ${n('MATCH')} | parciais: ${n('MATCH_PARCIAL')} | divergências conhecidas: ${n('DIVERGENCIA_CONHECIDA')} | diferentes: ${n('MISMATCH')}`);
if (typos.length) console.log(`  grafias corrigidas do detonado: ${[...new Set(typos)].join(', ')}`);
if (unmatched.length) console.log(`  sem treinador correspondente no jogo: ${unmatched.join(' | ')}`);
for (const r of results.filter((x) => x.status === 'MISMATCH')) console.log(`  ≠ ${r.title}: detonado [${r.detonado.join(', ')}] | decomp ${JSON.stringify(r.decomp[0]?.party ?? r.decomp)}`);
