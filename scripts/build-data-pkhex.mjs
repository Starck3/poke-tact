// Jogos que a PokéAPI não tem (Legends: Z-A): public/data/<jogo>.json montado direto das tabelas do jogo extraídas pelo
// PKHeX (scripts/lib/pkhex.mjs) — sem passar pela PokéAPI no núcleo:
//   espécies presentes, atributos, tipos, habilidades   personal_<jogo> (flag "presente no jogo")
//   golpes por nível (ordem do jogo)                      lvlmove_<jogo>.pkl
//   TMs                                                   bits de TM do personal + lista MachineMoves do PersonalInfo<jogo>.cs
//   evoluções                                             evos_<jogo>.pkl (EvolutionSet.cs: 8 bytes por método — tipo u8,
//                                                         argumento u16 @2, espécie u16 @4, forma u8 @6, nível u8 @7)
// O que o PKHeX NÃO tem vem de fora: tabela de tipos e valores dos golpes (poder, precisão…) da Gen 9 — os mesmos do
// Scarlet/Violet, que é o que o Pokémon Showdown usa no formato do Legends: Z-A (mod gen9legends herda os golpes da gen9);
// nome/lendário/"evolui de" pela espécie da PokéAPI (.cache), conferido com as evoluções do PKHeX.
// Uso: node scripts/build-data-pkhex.mjs <jogo>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadPkhex, binLinker16, pkhexCommit, PKHEX_GAMES } from './lib/pkhex.mjs';

const API = 'https://pokeapi.co/api/v2';
const gameId = process.argv[2];
const game = GAMES[gameId];
const cfg = PKHEX_GAMES[gameId];
const root = new URL(`../data-sources/${game.pkhex.dir}/`, import.meta.url);
const res = new URL('PKHeX.Core/Resources/', root);
const P = loadPkhex(root, gameId);
const base = JSON.parse(readFileSync(new URL(`../public/data/${game.movesFrom}.json`, import.meta.url), 'utf8'));
const cacheFile = (path) => new URL(`../.cache/${path.replace(/\//g, '_')}.json`, import.meta.url);
async function get(path) {
  const f = cacheFile(path);
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const r = await fetch(`${API}/${path}`);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  const j = await r.json();
  writeFileSync(f, JSON.stringify(j));
  return j;
}

// golpe do PKHeX (id) → nome da PokéAPI: pelos golpes já em cache; os que faltarem, pela PokéAPI por id
const moveById = new Map();
for (const n of Object.keys(base.moves)) moveById.set(JSON.parse(readFileSync(cacheFile(`move/${n}`), 'utf8')).id, n);
const moveName = async (id) => { if (!moveById.has(id)) moveById.set(id, (await get(`move/${id}`)).name); return moveById.get(id); };

// TMs: bits a partir de cfg.tm.offset, na ordem de MachineMoves (lista no C#)
const cs = readFileSync(new URL(`PKHeX.Core/PersonalInfo/Info/${cfg.tm.cs}`, root), 'utf8');
const machineMoves = cs.match(/MachineMoves\s*=>\s*\[([\s\S]*?)\];/)[1].replace(/\/\/.*$/gm, '').split(',').map((x) => x.trim()).filter(Boolean).map(Number);
const personal = readFileSync(new URL(`byte/personal/personal_${cfg.personal}`, res));
const evos = binLinker16(readFileSync(new URL(`byte/evolve/evos_${cfg.evos}.pkl`, res)));
// evos por índice do personal: forma 0 = espécie; demais formas em FormStatsIndex (u16 @0x18) + forma − 1, FormCount u8 @0x1A
// (forma regional evolui pela própria entrada: Meowth de Galar → Perrserker, Qwilfish de Hisui → Overqwil)
const formIndexes = (id) => { const r = personal.subarray(id * cfg.size); const fi = r.readUInt16LE(0x18), fc = r[0x1a]; return [id, ...(fi ? Array.from({ length: fc - 1 }, (_, f) => fi + f) : [])]; };
const evoTargets = (id) => formIndexes(id).flatMap((ix) => { const d = evos[ix] ?? Buffer.alloc(0); return Array.from({ length: d.length / 8 }, (_, i) => d.readUInt16LE(i * 8 + 4)); }).filter(Boolean);

const pokemon = [], used = new Set(), report = { evolvesFromDiff: [], tmCount: machineMoves.length };
const present = Object.entries(P.species).filter(([, d]) => d.present).map(([id]) => Number(id));
const presentSet = new Set(present);
for (const id of present) {
  const d = P.species[id];
  const sp = await get(`pokemon-species/${id}`);
  const raw = personal.subarray(id * cfg.size, (id + 1) * cfg.size);
  const learnset = [];
  const seen = new Set();
  for (const [lv, m] of d.levelOrdered) { const n = await moveName(m); if (!seen.has(`${n}@${lv}`)) { seen.add(`${n}@${lv}`); learnset.push({ move: n, method: 'level-up', level: lv }); } }
  for (let i = 0; i < machineMoves.length; i++) if (raw[cfg.tm.offset + (i >> 3)] & (1 << (i & 7))) learnset.push({ move: await moveName(machineMoves[i]), method: 'machine', level: 0 });
  for (const l of learnset) used.add(l.move);
  // "evolui de": PokéAPI, conferido com o PKHeX (a pré-evolução presente no jogo tem que listar esta espécie)
  const from = sp.evolves_from_species ? Number(sp.evolves_from_species.url.split('/').at(-2)) : null;
  const pk = present.filter((s) => evoTargets(s).includes(id));
  // sem a evolução na tabela do jogo (Melmetal: só pelo GO; Sinistcha) → não dá para obter evoluindo neste jogo
  const noEvo = !!from && presentSet.has(from) && !pk.includes(from);
  if (noEvo) report.evolvesFromDiff.push({ species: sp.name, pokeapi: from, pkhex: pk });
  if (!from && pk.length) report.evolvesFromDiff.push({ species: sp.name, pokeapi: null, pkhex: pk });
  pokemon.push({ id, name: sp.varieties.find((v) => v.is_default).pokemon.name, types: d.types, stats: d.stats, abilities: d.abilities, evolvesFrom: from, ...(noEvo && { evo: { kind: 'NONE', possible: false } }), legendary: sp.is_legendary || sp.is_mythical, learnset, levelUpInGameOrder: true });
}
const evolvedInto = new Set(pokemon.map((x) => x.evolvesFrom).filter(Boolean));
for (const x of pokemon) { x.fullyEvolved = !evolvedInto.has(x.id); x.obtainable = Object.fromEntries(game.versions.map((v) => [v, false])); }

// valores dos golpes: os da Gen 9 já conferidos no dataset do Scarlet/Violet; os que ele não tem, pela PokéAPI (valor atual)
const moves = {}, fromApi = [];
for (const n of [...used].sort()) {
  if (base.moves[n]) { moves[n] = base.moves[n]; continue; }
  const m = await get(`move/${n}`);
  fromApi.push(n);
  moves[n] = { type: m.type.name, power: m.power, accuracy: m.accuracy, pp: m.pp, priority: m.priority, category: m.damage_class.name, effect: (m.effect_entries.find((e) => e.language.name === 'en')?.short_effect ?? '').replace(/\$effect_chance/g, m.effect_chance ?? '') };
}
const commit = pkhexCommit(root);
const out = {
  game: { id: gameId, label: game.label, generation: game.generation, versions: game.versions, source: `tabelas do jogo extraídas pelo PKHeX (kwsch/PKHeX@${commit?.slice(0, 7) ?? '?'}); golpes e tabela de tipos da Gen 9 (${game.movesFrom})`, builtAt: new Date().toISOString() },
  types: base.types,
  chart: base.chart,
  pokemon,
  moves,
};
writeFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), JSON.stringify(out));
console.log(`OK ${gameId} (PKHeX): ${pokemon.length} pokémon, ${Object.keys(moves).length} golpes (${fromApi.length} fora do ${game.movesFrom}: ${fromApi.join(', ')}), ${machineMoves.length} TMs`);
console.log(`  "evolui de" PokéAPI × PKHeX: ${report.evolvesFromDiff.length} diferenças ${JSON.stringify(report.evolvesFromDiff.slice(0, 8))}`);
