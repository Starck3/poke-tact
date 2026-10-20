// Espécies que o jogo tem e o dataset da PokéAPI não (Legends: Arceus: as que só existem em forma de Hisui — Typhlosion,
// Samurott, Decidueye, Goodra… — e Giratina/Porygon2, sem learnset do version-group na PokéAPI). Vêm inteiras das tabelas
// do PKHeX (scripts/lib/pkhex.mjs, forma presente no jogo): atributos, tipos, habilidades, golpes por nível na ordem do jogo e
// a loja de golpes ("tutor"). Nome/lendário/"evolui de" pela espécie da PokéAPI; sprite pela variedade da forma
// (typhlosion-hisui = 10233). Também troca o "tutor" da PokéAPI pela loja de golpes do jogo em todas as espécies.
// Uso: node scripts/fill-pkhex-species.mjs <jogo>   (depois do apply-pkhex-overlay; o validate-pkhex confere tudo)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadPkhex } from './lib/pkhex.mjs';

const API = 'https://pokeapi.co/api/v2';
const gameId = process.argv[2];
const game = GAMES[gameId];
const P = loadPkhex(new URL(`../data-sources/${game.pkhex.dir}/`, import.meta.url), gameId);
if (!P.cfg.forms && !P.cfg.moveShop) { console.log(`[${gameId}] sem formas regionais/loja de golpes no leitor — nada a fazer`); process.exit(0); }
const file = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
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
// golpe (id do jogo) → nome da PokéAPI; golpe que o dataset não tem entra com os valores atuais da PokéAPI
const moveById = new Map(Object.keys(data.moves).map((n) => [JSON.parse(readFileSync(cacheFile(`move/${n}`), 'utf8')).id, n]));
const newMoves = [];
async function moveName(id) {
  if (moveById.has(id)) return moveById.get(id);
  const m = await get(`move/${id}`);
  writeFileSync(cacheFile(`move/${m.name}`), JSON.stringify(m));
  data.moves[m.name] = { type: m.type.name, power: m.power, accuracy: m.accuracy, pp: m.pp, priority: m.priority, category: m.damage_class.name, effect: (m.effect_entries.find((e) => e.language.name === 'en')?.short_effect ?? '').replace(/\$effect_chance/g, m.effect_chance ?? '') };
  moveById.set(id, m.name);
  newMoves.push(m.name);
  return m.name;
}
const learnsetOf = async (d) => {
  const seen = new Set(), out = [];
  for (const [lv, m] of d.levelOrdered) { const n = await moveName(m); if (!seen.has(`${n}@${lv}`)) { seen.add(`${n}@${lv}`); out.push({ move: n, method: 'level-up', level: lv }); } }
  return out;
};

const have = new Set(data.pokemon.map((p) => p.id));
const added = [];
for (const [id, d] of Object.entries(P.species).map(([k, v]) => [Number(k), v])) {
  if (!d.present || have.has(id) || id > (P.cfg.maxSpecies ?? 1025)) continue;
  const sp = await get(`pokemon-species/${id}`);
  const variety = d.form ? sp.varieties[d.form] : sp.varieties.find((v) => v.is_default);
  data.pokemon.push({
    id, name: sp.varieties.find((v) => v.is_default).pokemon.name, types: d.types, stats: d.stats, abilities: d.abilities,
    evolvesFrom: sp.evolves_from_species ? Number(sp.evolves_from_species.url.split('/').at(-2)) : null,
    legendary: sp.is_legendary || sp.is_mythical, learnset: await learnsetOf(d), levelUpInGameOrder: true,
    ...(d.form && { form: variety.pokemon.name, spriteId: Number(variety.pokemon.url.split('/').at(-2)) }),
    obtainable: Object.fromEntries(game.versions.map((v) => [v, false])), fromPkhex: true,
  });
  added.push(`${id} ${d.form ? variety.pokemon.name : sp.name} (${d.types.join('/')})`);
}
// loja de golpes do jogo no lugar do "tutor" da PokéAPI (incompleto: 62 golpes no jogo inteiro)
let tutorBefore = 0, tutorAfter = 0;
for (const mon of data.pokemon) {
  const d = P.species[mon.id];
  if (!d?.moveShop) continue;
  tutorBefore += mon.learnset.filter((l) => l.method === 'tutor').length;
  const shop = [];
  for (const m of d.moveShop) shop.push({ move: await moveName(m), method: 'tutor', level: 0 });
  mon.learnset = [...mon.learnset.filter((l) => l.method !== 'tutor'), ...shop];
  tutorAfter += shop.length;
}
data.pokemon.sort((a, b) => a.id - b.id);
const evolvedInto = new Set(data.pokemon.map((x) => x.evolvesFrom).filter(Boolean));
for (const x of data.pokemon) x.fullyEvolved = !evolvedInto.has(x.id);
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/pkhex-species-added.json`, import.meta.url), JSON.stringify({ added, newMoves, tutorBefore, tutorAfter }, null, 1));
console.log(`[${gameId}] PKHeX: +${added.length} espécies (${added.join(', ')}); golpes novos ${newMoves.length} (${newMoves.join(', ')}); loja de golpes: tutor ${tutorBefore} → ${tutorAfter}`);
