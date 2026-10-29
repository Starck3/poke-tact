// Golpes reais dos chefes do Battle Subway no Black/White (F2, PLANO-EXECUCAO-8) pela Smogon (fonte aprovada pelo usuário
// em 2026-10-28): "Battle Subway Trainers" (smogon.com/ingame/bc/bw_subway_trainers, seção Special: os conjuntos de cada luta
// do Ingo e do Emmet — 3 na simples, 4 na dupla, 2 cada na multi) × "Battle Subway Pokemon" (bw_subway_pokemon: espécie,
// natureza, item e 4 golpes de cada conjunto). O time (espécie e nível) já vem do detonado; aqui só os golpes e o item, quando o
// conjunto de espécies da luta é o mesmo. Cópias só em data-sources/smogon/ (fora do git). As lutas do Emmet (4 Pokémon) e
// do Ingo & Emmet (multi) são em dupla: o detonado diz que os chefes aparecem "no modo Double Battle e Multi Battle" e a
// Bulbapedia, que no Subway são 3 Pokémon na simples e 4 na dupla.
// Os treinadores comuns do Subway sorteiam 3 ou 4 de uma lista de até 66 conjuntos — sem time fixo, ficam fora.
// Uso: node scripts/apply-smogon-subway.mjs <jogo>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { nameKey } from './lib/names.mjs';

const gameId = process.argv[2];
if (gameId !== 'black-white') { console.log(`[${gameId}] chefes do Battle Subway pela Smogon só no Black/White — nada a fazer`); process.exit(0); }
const DIR = new URL('../data-sources/smogon/', import.meta.url);
const T = new URL('bw_subway_trainers.html', DIR), P = new URL('bw_subway_pokemon.html', DIR);
if (!existsSync(T) || !existsSync(P)) { console.log(`[${gameId}] data-sources/smogon/ sem as páginas do Battle Subway — mantido o arquivo anterior`); process.exit(process.env.POKETACT_STRICT ? 1 : 0); }

// conjuntos: <tr><td id="pkmn158">158</td><td>Garbodor</td><td>Modest</td><td>Black Sludge</td><td>Venoshock</td>…<td>HP/SpA</td></tr>
const sets = new Map();
for (const m of readFileSync(P, 'utf8').matchAll(/<td id="pkmn(\d+)">\d+<\/td>((?:<td>[^<]*<\/td>){8})/g)) {
  const [species, nature, item, ...moves] = [...m[2].matchAll(/<td>([^<]*)<\/td>/g)].map((x) => x[1].trim());
  sets.set(Number(m[1]), { species, nature, item, moves: moves.slice(0, 4) });
}
// seção Special: <dt>Subway Boss Ingo</dt><dd><a …>158</a>, …</dd>
const html = readFileSync(T, 'utf8');
const special = html.slice(html.indexOf('name="special"'));
const bosses = [...special.matchAll(/<dt>(Subway Boss \w+)<\/dt>\s*<dd>(.*?)<\/dd>/g)].map((m) => ({ name: m[1], sets: [...m[2].matchAll(/pkmn(\d+)/g)].map((x) => sets.get(Number(x[1]))) }));
if (sets.size < 900 || bosses.length !== 8 || bosses.some((b) => b.sets.some((s) => !s))) { console.log(`[${gameId}] páginas da Smogon diferentes do esperado (${sets.size} conjuntos, ${bosses.length} lutas de chefe) — parado`); process.exit(2); }
// multi: os conjuntos do Ingo e do Emmet da mesma rodada juntos (Ingo, Emmet em sequência na página)
const fights = bosses.filter((b) => b.sets.length > 2).map((b) => ({ label: b.name, sets: b.sets }));
for (let i = 0; i < bosses.length; i++) if (bosses[i].sets.length === 2 && bosses[i + 1]?.sets.length === 2) { fights.push({ label: `${bosses[i].name} & ${bosses[i + 1].name}`, sets: [...bosses[i].sets, ...bosses[i + 1].sets] }); i++; }

const trFile = new URL(`../public/data/${gameId}-trainers.json`, import.meta.url);
const tr = JSON.parse(readFileSync(trFile, 'utf8'));
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const moveKey = new Map(Object.keys(data.moves).map((n) => [nameKey(n), n]));
const sig = (list) => list.map((x) => nameKey(x)).sort().join(',');
const report = { fights: fights.length, matched: [], unmatched: [], missingMoves: [] };
for (const t of tr.trainers.filter((x) => /^Subway Boss/.test(x.label))) {
  const f = fights.find((x) => x.label === t.label && sig(x.sets.map((s) => s.species)) === sig(t.party.map((p) => p.species)));
  if (!f) { report.unmatched.push(`${t.key} ${t.label}: ${t.party.map((p) => p.species).join(', ')}`); continue; }
  for (const p of t.party) {
    const s = f.sets.find((x) => nameKey(x.species) === nameKey(p.species));
    const moves = s.moves.map((mv) => moveKey.get(nameKey(mv)));
    if (moves.some((x) => !x)) { report.missingMoves.push(`${t.label} ${p.species}: ${s.moves.join(', ')}`); continue; }
    p.moves = moves; p.defaultMoves = false; p.movesSource = 'Smogon'; p.item = s.item;
  }
  t.movesSource = 'Smogon';
  // dupla: 4 Pokémon (Emmet) ou multi (Ingo & Emmet)
  if (t.party.length === 4) t.double = true;
  report.matched.push(`${t.key} ${t.label}: ${t.party.map((p) => p.species).join(', ')}${t.double ? ' (dupla)' : ''}`);
}
tr.subwaySource = 'Smogon (Battle Subway Trainers / Battle Subway Pokemon: conjuntos dos chefes) — fatos extraídos, com crédito';
writeFileSync(trFile, JSON.stringify(tr));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/smogon-subway.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}] Smogon (Battle Subway): ${report.matched.length}/${fights.length} lutas de chefe com golpes reais; sem casar ${report.unmatched.length}; golpe fora do dataset ${report.missingMoves.length}`);
