// Arbitragem: compara PokeAPI (dataset) e Showdown contra a Bulbapedia (coluna FRLG da página "Generation III learnset").
// Uso de dados só para VALIDAÇÃO (não redistribuído). Lê páginas já baixadas; não faz requisições.
// Uso: node scripts/audit-bulbapedia.mjs   (requer reports/learnset-audit.json; rode validate-learnsets antes)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DIR = new URL('../data-sources/bulbapedia/gen3/', import.meta.url);
const ALIAS = { feintattack: 'faintattack', smellingsalt: 'smellingsalts', highjumpkick: 'hijumpkick' }; // mesmo golpe, grafia diferente entre fontes
const norm = (s) => { const n = s.toLowerCase().replace(/[^a-z0-9]/g, ''); return ALIAS[n] ?? n; };

const data = JSON.parse(await readFile(new URL('../public/data/firered-leafgreen.json', import.meta.url), 'utf8'));
const audit = JSON.parse(await readFile(new URL('../reports/learnset-audit.json', import.meta.url), 'utf8'));
const missing = new Set(audit.missingInShowdown);
const targets = data.pokemon.filter((p) => !missing.has(p.name));


// Lê só do disco (data-sources/bulbapedia/gen3/, preenchido por scripts/fetch-bulbapedia.mjs). Nunca acessa a rede.
async function page(mon) {
  const file = new URL(`${mon.id}.txt`, DIR);
  if (!existsSync(file)) throw new Error('página não baixada (rode scripts/fetch-bulbapedia.mjs)');
  return readFile(file, 'utf8');
}

// Extrai o que vale para FRLG. Retorna null se a página não tiver os blocos esperados.
// Remove templates {{...}} aninhados, deixando só os campos de nível superior.
function flat(str) { let prev; do { prev = str; str = str.replace(/\{\{[^{}]*\}\}/g, ''); } while (str !== prev); return str; }

function parse(text) {
  const out = { L: new Set(), M: new Set(), T: new Set(), E: new Set(), unparsed: [] };
  for (const line of text.split('\n')) {
    let m;
    if ((m = line.match(/^\{\{learnlist\/level3\|(\d+)\|([^|]+)\|/))) out.L.add(`${norm(m[2])}@${m[1]}`); // RSE e FRLG iguais
    else if ((m = line.match(/^\{\{learnlist\/levelIII\|([^|]*)\|([^|]*)\|([^|]+)\|/))) {
      const frlg = m[2].trim();
      if (/^\d+$/.test(frlg)) out.L.add(`${norm(m[3])}@${frlg}`);
      else if (frlg !== 'N/A') out.unparsed.push(line);
    } else if ((m = line.match(/^\{\{learnlist\/tm3\|[^|]+\|([^|]+)\|/))) out.M.add(norm(m[1]));
    else if ((m = line.match(/^\{\{learnlist\/(tutor3|breed3)\|(.*)\}\}\s*$/))) {
      const f = flat(m[2]).split('|').map((x) => x.trim());
      if (m[1] === 'breed3') { const mv = f.find(Boolean); if (mv) out.E.add(norm(mv)); }
      else { const yn = f.filter((x) => x === 'yes' || x === 'no'); if (yn.length >= 3 && yn.at(-3) === 'yes') out.T.add(norm(f[0])); } // 1ª coluna de jogo = FRLG
    }
    else if (/^\{\{learnlist\/(level3|levelIII|tm3|tutor3|breed3)\|/i.test(line)) out.unparsed.push(line); // "...null}}" = seção vazia, não conta
  }
  return out;
}

const byId = new Map(data.pokemon.map((p) => [p.id, p]));
const familyIds = (mon) => { const root = (m) => (m.evolvesFrom && byId.get(m.evolvesFrom) ? root(byId.get(m.evolvesFrom)) : m); const r = root(mon); const out = []; const walk = (m) => { out.push(m); data.pokemon.filter((p) => p.evolvesFrom === m.id).forEach(walk); }; walk(r); return out; };
const kind = { 'level-up': 'L', machine: 'M', tutor: 'T', egg: 'E' };
const pokeapiSets = (mon) => {
  const s = { L: new Set(), M: new Set(), T: new Set(), E: new Set() };
  for (const l of mon.learnset) {
    if (l.method === 'level-up') s.L.add(`${norm(l.move)}@${l.level}`);
    else if (l.method === 'machine') s.M.add(norm(l.move));
    else if (l.method === 'tutor') s.T.add(norm(l.move));
    else if (l.method === 'egg') s.E.add(norm(l.move));
  }
  return s;
};

const result = { pokeapiVsBulbapedia: [], verdicts: [], errors: [], unparsed: {} };
for (const mon of targets) {
  let text;
  try { text = await page(mon); } catch (e) { result.errors.push(`${mon.name}: ${e.message}`); continue; }
  const b = parse(text);
  if (b.unparsed.length) result.unparsed[mon.name] = b.unparsed;
  const a = pokeapiSets(mon);
  for (const f of familyIds(mon)) for (const l of f.learnset) if (l.method === 'egg') a.E.add(norm(l.move)); // ovo é herdado pela linha toda
  for (const k of ['L', 'M', 'T', 'E']) {
    for (const v of a[k]) if (!b[k].has(v)) result.pokeapiVsBulbapedia.push({ pokemon: mon.name, kind: k, value: v, only: 'pokeapi' });
    for (const v of b[k]) if (!a[k].has(v)) result.pokeapiVsBulbapedia.push({ pokemon: mon.name, kind: k, value: v, only: 'bulbapedia' });
  }
  // Veredito para cada divergência PokeAPI×Showdown deste Pokémon
  for (const d of audit.divergences.filter((x) => x.pokemon === mon.name)) {
    const k = kind[d.method];
    const bulba = b[k].has(d.value);
    result.verdicts.push({ ...d, bulbapedia: bulba, winner: bulba === (d.only === 'pokeapi') ? 'pokeapi' : 'showdown' });
  }
}
await writeFile(new URL('../reports/learnset-arbitration.json', import.meta.url), JSON.stringify(result, null, 1));

const tally = {};
for (const v of result.verdicts) { const key = `${v.method}: ${v.winner} correto (${v.only}-only)`; tally[key] = (tally[key] ?? 0) + 1; }
console.log('Páginas verificadas:', targets.length - result.errors.length, '| erros:', result.errors.length, '| linhas não interpretadas:', Object.keys(result.unparsed).length);
console.log('Arbitragem das divergências PokeAPI×Showdown:', tally);
const byKind = {};
for (const d of result.pokeapiVsBulbapedia) byKind[`${d.kind}/${d.only}`] = (byKind[`${d.kind}/${d.only}`] ?? 0) + 1;
console.log('PokéAPI vs Bulbapedia (restante):', byKind);