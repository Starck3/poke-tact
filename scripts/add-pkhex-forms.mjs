// Formas regionais (Alola, Galar, Hisui, Paldea) como entradas próprias do dataset nos jogos sem decomp. Antes o app tinha uma
// forma por espécie — a original: no Sun/Moon o Rattata selvagem (de Alola, Sombrio/Normal) aparecia como Normal; Meowth de
// Galar e Wooper de Paldea não existiam.
//   • quais formas: as do personal do jogo (PKHeX, índice da forma = FormStatsIndex + f − 1) com a flag "presente" (Gen 8+;
//     nas Gens 6/7 não há flag) cuja variedade da PokéAPI (varieties[f]) é regional (-alola, -galar, -hisui, -paldea; totens
//     fora). 🧪 Tipos da forma no PKHeX têm que bater com a variedade da PokéAPI — senão a forma é descartada e registrada.
//   • id = id da variedade na PokéAPI (rattata-alola = 10091): o sprite sai certo e o id não colide com as espécies.
//   • atributos, tipos, habilidades e golpes por nível: tabela do jogo (forma); TM/tutor/ovo: PokéAPI da variedade.
//   • "evolui de": a forma da mesma região da pré-evolução, se existir no dataset (Raticate de Alola ← Rattata de Alola);
//     senão a espécie (Raichu de Alola ← Pikachu). Evoluções que dependem da forma vêm do evos do PKHeX (build-evolutions).
// Uso: node scripts/add-pkhex-forms.mjs <jogo>   (depois do fill-pkhex-species; o validate-pkhex confere as formas)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadPkhex } from './lib/pkhex.mjs';
import { get, moveResolver } from './lib/pokeapi-cache.mjs';

export const REGIONAL = /-(alola|galar|hisui|paldea)(-[a-z]+-breed)?$/;
const gameId = process.argv[2];
const game = GAMES[gameId];
const P = loadPkhex(new URL(`../data-sources/${game.pkhex.dir}/`, import.meta.url), gameId);
const file = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const moves = moveResolver(data);
// refaz do zero (o passo pode rodar de novo sobre o mesmo arquivo)
data.pokemon = data.pokemon.filter((p) => !p.regionalForm);
const bySpecies = new Map(data.pokemon.filter((p) => p.id <= 1025).map((p) => [p.id, p]));
const added = [], rejected = [];
for (const [sid, base] of bySpecies) {
  const forms = P.forms[sid];
  if (!forms) continue;
  for (const [fs, d] of Object.entries(forms)) {
    const f = Number(fs);
    if (P.cfg.present && !d.present) continue;
    const sp = await get(`pokemon-species/${sid}`);
    const v = sp.varieties[f]?.pokemon;
    if (!v || !REGIONAL.test(v.name) || /totem/.test(v.name)) continue;
    const vid = Number(v.url.split('/').at(-2));
    if (vid === base.spriteId) continue; // LA: a própria espécie já é a forma de Hisui (fill-pkhex-species)
    const api = await get(`pokemon/${vid}`);
    const apiTypes = api.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
    if (apiTypes.join() !== d.types.join()) { rejected.push(`${v.name}: PKHeX ${d.types.join('/')} × PokéAPI ${apiTypes.join('/')}`); continue; }
    const learnset = [], seen = new Set();
    for (const [lv, m] of d.levelOrdered) { const n = await moves.resolve(m); if (!seen.has(`${n}@${lv}`)) { seen.add(`${n}@${lv}`); learnset.push({ move: n, method: 'level-up', level: lv }); } }
    for (const m of api.moves) for (const x of m.version_group_details) {
      if (x.version_group.name !== game.versionGroup || x.move_learn_method.name === 'level-up') continue;
      learnset.push({ move: await moves.ensureByName(m.move.name), method: x.move_learn_method.name, level: x.level_learned_at });
    }
    for (const m of d.moveShop ?? []) learnset.push({ move: await moves.resolve(m), method: 'tutor', level: 0 });
    for (const m of d.tm ?? []) learnset.push({ move: await moves.resolve(m), method: 'machine', level: 0 }); // Z-A: TMs da tabela
    added.push({ id: vid, name: v.name, types: d.types, stats: d.stats, abilities: game.noAbilities ? [] : d.abilities, speciesId: sid, form: f, regionalForm: true,
      evolvesFrom: base.evolvesFrom, legendary: base.legendary, learnset, levelUpInGameOrder: true,
      obtainable: Object.fromEntries(game.versions.map((x) => [x, false])) });
  }
}
// "evolui de": forma da mesma região da pré-evolução, se houver
const region = (n) => n.match(REGIONAL)?.[1];
for (const a of added) {
  const parentForm = added.find((b) => b.speciesId === a.evolvesFrom && region(b.name) === region(a.name));
  if (parentForm) a.evolvesFrom = parentForm.id;
}
data.pokemon.push(...added);
data.pokemon.sort((a, b) => (a.speciesId ?? a.id) - (b.speciesId ?? b.id) || a.id - b.id);
const evolvedInto = new Set(data.pokemon.map((x) => x.evolvesFrom).filter(Boolean));
for (const x of data.pokemon) x.fullyEvolved = !evolvedInto.has(x.id);
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/pkhex-forms.json`, import.meta.url), JSON.stringify({ added: added.map((a) => `${a.name} (${a.types.join('/')})`), rejected, newMoves: moves.added }, null, 1));
console.log(`[${gameId}] formas regionais: +${added.length} (${added.map((a) => a.name).join(', ')})${rejected.length ? `; descartadas ${rejected.length}: ${rejected.join('; ')}` : ''}; golpes novos ${moves.added.length}`);
