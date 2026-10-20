// TM/HM/TR de cada espécie (e forma regional) pelas tabelas do próprio jogo (PKHeX, scripts/lib/pkhex-machines.mjs) no
// lugar das da PokéAPI. Medição (XY, ORAS, SM, USUM, Let's Go, SwSh, BDSP): 100% iguais. Corrige:
//   • Black/White: TM95 Snarl em 55 espécies — a TM não é obtível no BW (Lock Capsule nunca distribuída; LearnSource5BW);
//   • Scarlet/Violet: a PokéAPI mistura na forma 0 as TMs das formas de Hisui (Typhlosion, Samurott, Decidueye) e não tem
//     as compatibilidades novas dos patches/DLC (Sleep Talk no Quaxly, Trailblaze no Glaceon…); TM000 (Mega Punch) fora.
// Tutores continuam da PokéAPI (a diferença ali é a regra de um método por golpe do dataset, não erro de dado).
// Uso: node scripts/apply-pkhex-machines.mjs <jogo>   (depois do add-pkhex-forms)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { readMachines, MACHINE_GAMES } from './lib/pkhex-machines.mjs';
import { moveResolver } from './lib/pokeapi-cache.mjs';

const gameId = process.argv[2];
if (!MACHINE_GAMES[gameId]) { console.log(`[${gameId}] sem tabela de TMs no leitor — nada a fazer`); process.exit(0); }
const game = GAMES[gameId];
const M = readMachines(new URL(`../data-sources/${game.pkhex.dir}/`, import.meta.url), gameId);
const file = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const moves = moveResolver(data);
const diffs = [];
for (const mon of data.pokemon) {
  const t = mon.regionalForm ? M.forms[`${mon.speciesId}-${mon.form}`] : mon.id <= 1025 ? M.species[mon.id] : null;
  if (!t) continue;
  const before = new Set(mon.learnset.filter((l) => l.method === 'machine').map((l) => l.move));
  const now = [];
  for (const id of t.machine) now.push(await moves.resolve(id));
  const after = new Set(now);
  const removed = [...before].filter((m) => !after.has(m)), added = [...after].filter((m) => !before.has(m));
  if (removed.length || added.length) diffs.push({ pokemon: mon.name, removed, added });
  mon.learnset = [...mon.learnset.filter((l) => l.method !== 'machine'), ...now.map((m) => ({ move: m, method: 'machine', level: 0 }))];
}
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/pkhex-machines.json`, import.meta.url), JSON.stringify({ diffs, newMoves: moves.added }, null, 1));
const r = diffs.reduce((a, d) => a + d.removed.length, 0), a = diffs.reduce((s, d) => s + d.added.length, 0);
console.log(`[${gameId}] TMs do PKHeX: ${diffs.length} espécies mudaram (−${r} +${a}); exemplos: ${diffs.slice(0, 5).map((d) => `${d.pokemon} ${d.removed.map((x) => '−' + x).concat(d.added.map((x) => '+' + x)).join(' ')}`).join('; ')}`);
