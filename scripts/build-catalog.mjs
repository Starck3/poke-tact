// Gera public/data/games.json: catálogo dos jogos da série principal, com geração, plataforma e versões.
// Fontes cruzadas (o script FALHA se alguma não confirmar):
//   • PokeAPI  → geração de cada version-group e nomes das versões
//   • Wikipedia "List of Pokémon video games" → plataforma e ano do lançamento original
//   • GitHub org pret → quais jogos têm decomp (fonte de dados verificável)
// Uso: node scripts/build-catalog.mjs [--refresh]   (baixa 3 recursos e guarda em .cache/catalog/)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { parseDetonadoIndex, matchDetonados } from './lib/pokemythology.mjs';

const CACHE = new URL('../.cache/catalog/', import.meta.url);
await mkdir(CACHE, { recursive: true });
const refresh = process.argv.includes('--refresh');
async function cached(name, url, headers = {}) {
  const file = new URL(name, CACHE);
  if (!refresh && existsSync(file)) return readFile(file, 'utf8');
  const res = await fetch(url, { headers: { 'user-agent': 'poke-tact-validation/0.1 (personal project)', ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  await writeFile(file, text);
  return text;
}

// Jogos da série principal (RPGs). `group` = version-group da PokeAPI; DLCs entram dentro do jogo base.
const CATALOG = [
  { group: 'red-blue', article: 'Pokémon Red and Blue', versions: { red: 'Red', blue: 'Blue' }, note: 'No Japão: Red/Green e Blue (versões próprias)' },
  { group: 'yellow', article: 'Pokémon Yellow', versions: { yellow: 'Yellow' } },
  { group: 'gold-silver', article: 'Pokémon Gold and Silver', versions: { gold: 'Gold', silver: 'Silver' } },
  { group: 'crystal', article: 'Pokémon Crystal', versions: { crystal: 'Crystal' } },
  { group: 'ruby-sapphire', article: 'Pokémon Ruby and Sapphire', versions: { ruby: 'Ruby', sapphire: 'Sapphire' } },
  { group: 'emerald', article: 'Pokémon Emerald', versions: { emerald: 'Emerald' } },
  { group: 'firered-leafgreen', article: 'Pokémon FireRed and LeafGreen', versions: { firered: 'FireRed', 'leafgreen': 'LeafGreen' } },
  { group: 'diamond-pearl', article: 'Pokémon Diamond and Pearl', versions: { diamond: 'Diamond', pearl: 'Pearl' } },
  { group: 'platinum', article: 'Pokémon Platinum', versions: { platinum: 'Platinum' } },
  { group: 'heartgold-soulsilver', article: 'Pokémon HeartGold and SoulSilver', versions: { heartgold: 'HeartGold', soulsilver: 'SoulSilver' } },
  { group: 'black-white', article: 'Pokémon Black and White', versions: { black: 'Black', white: 'White' } },
  { group: 'black-2-white-2', article: 'Pokémon Black 2 and White 2', versions: { 'black-2': 'Black 2', 'white-2': 'White 2' } },
  { group: 'x-y', article: 'Pokémon X and Y', versions: { x: 'X', y: 'Y' } },
  { group: 'omega-ruby-alpha-sapphire', article: 'Pokémon Omega Ruby and Alpha Sapphire', versions: { 'omega-ruby': 'Omega Ruby', 'alpha-sapphire': 'Alpha Sapphire' } },
  { group: 'sun-moon', article: 'Pokémon Sun and Moon', versions: { sun: 'Sun', moon: 'Moon' } },
  { group: 'ultra-sun-ultra-moon', article: 'Pokémon Ultra Sun and Ultra Moon', versions: { 'ultra-sun': 'Ultra Sun', 'ultra-moon': 'Ultra Moon' } },
  { group: 'lets-go-pikachu-lets-go-eevee', article: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", versions: { 'lets-go-pikachu': "Let's Go, Pikachu!", 'lets-go-eevee': "Let's Go, Eevee!" } },
  { group: 'sword-shield', article: 'Pokémon Sword and Shield', versions: { sword: 'Sword', shield: 'Shield' }, note: 'Inclui as expansões Isle of Armor e Crown Tundra' },
  { group: 'brilliant-diamond-shining-pearl', article: 'Pokémon Brilliant Diamond and Shining Pearl', versions: { 'brilliant-diamond': 'Brilliant Diamond', 'shining-pearl': 'Shining Pearl' } },
  { group: 'legends-arceus', article: 'Pokémon Legends: Arceus', versions: { 'legends-arceus': 'Legends: Arceus' } },
  { group: 'scarlet-violet', article: 'Pokémon Scarlet and Violet', versions: { scarlet: 'Scarlet', violet: 'Violet' }, note: 'Inclui as expansões Teal Mask e Indigo Disk' },
  { group: 'legends-za', article: 'Pokémon Legends: Z-A', versions: { 'legends-za': 'Legends: Z-A' }, note: 'Inclui a expansão Mega Dimension' },
];
// jogo (version-group) -> repositório pret
const PRET = { 'red-blue': 'pokered', yellow: 'pokeyellow', 'gold-silver': 'pokegold', crystal: 'pokecrystal', 'ruby-sapphire': 'pokeruby', emerald: 'pokeemerald', 'firered-leafgreen': 'pokefirered', 'diamond-pearl': 'pokediamond', platinum: 'pokeplatinum', 'heartgold-soulsilver': 'pokeheartgold' };

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };
const problems = [];

// --- PokeAPI: geração e versões por version-group
const api = async (p) => JSON.parse(await cached(`pokeapi_${p.replace(/\W/g, '_')}.json`, `https://pokeapi.co/api/v2/${p}`));
const gens = {};
const apiVersions = {};
for (const c of CATALOG) {
  const vg = await api(`version-group/${c.group}`);
  gens[c.group] = ROMAN[vg.generation.name.replace('generation-', '')];
  apiVersions[c.group] = vg.versions.map((v) => v.name);
}

// --- Wikipédia: plataforma e ano do lançamento original
const wiki = await cached('wikipedia_list.txt', 'https://en.wikipedia.org/w/index.php?title=List_of_Pok%C3%A9mon_video_games&action=raw');
const main = wiki.slice(wiki.indexOf('==Main series games/remakes=='), wiki.indexOf('== Spin-off games =='));
const wikiItems = {};
for (const it of main.split('{{Video game titles/item').slice(1)) {
  const article = it.match(/\|\s*article\s*=\s*(.*)/)?.[1]?.trim();
  const release = it.match(/\|\s*release\s*=\s*([\s\S]*?)\n\s*\|/)?.[1] ?? '';
  if (!article) continue;
  const entries = [...release.replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').matchAll(/(\d{4})\s*[–-]\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => ({ year: Number(m[1]), platform: m[2] }));
  (wikiItems[article] ??= []).push(...entries);
}

// --- pret: repositórios existentes
const pretRepos = new Set(JSON.parse(await cached('pret_repos.json', 'https://api.github.com/orgs/pret/repos?per_page=100', { accept: 'application/vnd.github+json' })).map((r) => r.name));

const pmIndex = new URL('../data-sources/pokemythology/_indice.html', import.meta.url);
const walkthroughs = existsSync(pmIndex) ? matchDetonados(parseDetonadoIndex(await readFile(pmIndex, 'utf8')), CATALOG.map((c) => c.group)) : {};

const games = [];
for (const c of CATALOG) {
  // versões declaradas precisam existir na PokeAPI dentro do mesmo grupo
  for (const v of Object.keys(c.versions)) if (!apiVersions[c.group].includes(v)) problems.push(`${c.group}: versão ${v} não existe na PokeAPI (${apiVersions[c.group]})`);
  const entries = wikiItems[c.article];
  if (!entries?.length) { problems.push(`${c.group}: artigo "${c.article}" sem plataforma na Wikipédia`); continue; }
  const first = Math.min(...entries.map((e) => e.year));
  const platforms = [...new Set(entries.filter((e) => e.year === first).map((e) => e.platform))];
  const repo = PRET[c.group];
  if (repo && !pretRepos.has(repo)) problems.push(`${c.group}: repositório pret/${repo} não existe`);
  // tela inicial: sprites dos iniciais do jogo e os chefes (busca "Whitney" → luta direta), lidos dos dados já gerados
  const readJson = (f) => { try { return JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8')); } catch { return null; } };
  const gd = readJson(`${c.group}.json`), td = readJson(`${c.group}-trainers.json`);
  const starters = (gd?.starters?.species ?? []).map((n) => gd.pokemon.find((p) => p.name === n)?.id).filter(Boolean);
  const seen = new Set();
  const bosses = (td?.trainers ?? []).filter((t) => ['Líderes de ginásio', 'Elite dos Quatro', 'Campeão', 'Líderes de Kanto'].includes(t.group) && !t.rematch && !seen.has(t.label) && seen.add(t.label))
    .map((t) => ({ key: t.key, label: t.label, ace: gd?.pokemon.find((p) => p.name === t.party.at(-1)?.species)?.id ?? null }));
  games.push({
    starters, bosses, trainerCount: td?.trainers?.length ?? 0,
    id: c.group,
    label: Object.values(c.versions).join(' / '),
    versions: Object.entries(c.versions).map(([id, label]) => ({ id, label })),
    generation: gens[c.group],
    platforms,
    year: first,
    note: c.note ?? null,
    decomp: repo ? `pret/${repo}` : null,
    walkthrough: walkthroughs[c.group] ?? null, // detonado em português (PokeMythology)
    status: GAMES[c.group] && existsSync(new URL(`../public/data/${c.group}.json`, import.meta.url)) ? 'supported' : 'planned',
    // decomp = conferido com o código do jogo; decomp-core = só o núcleo (espécies, golpes, tabela) conferido (Gen 1/2 em assembly)
    validation: GAMES[c.group] ? (GAMES[c.group].decomp ? 'decomp' : GAMES[c.group].asmDecomp ? 'decomp-core' : 'pokeapi') : null,
    hasWalkthrough: existsSync(new URL(`../public/data/${c.group}-walkthrough.json`, import.meta.url)),
    // decomp parcial (HGSS: learnset/golpes em binário; DP: só núcleo + chefes) → selo "Parcialmente verificado" no catálogo
    partial: !!(GAMES[c.group]?.asmDecomp?.partial || GAMES[c.group]?.asmDecomp?.steps === 'dp'),
  });
}
if (problems.length) { console.error('PROBLEMAS:\n' + problems.join('\n')); process.exitCode = 1; }
else {
  await writeFile(new URL('../public/data/games.json', import.meta.url), JSON.stringify({
    sources: ['PokeAPI (geração/versões)', 'Wikipedia List of Pokémon video games (plataforma/ano)', 'github.com/pret (decomps)', 'PokeMythology (detonados)'],
    builtAt: new Date().toISOString(), games,
    // números reais do banco de lutas (reports/benchmark/_total.json) para a faixa da tela inicial — nada fixo no código
    benchmark: (() => { try { const t = JSON.parse(readFileSync(new URL('../reports/benchmark/_total.json', import.meta.url), 'utf8')).depois; return { picks: t.picks, winPct: Math.round((100 * t.wins) / t.picks), comfyPct: Math.round((100 * t.comfy) / t.picks) }; } catch { return null; } })(),
  }));
  console.log(`${games.length} jogos`);
  for (const g of games) console.log(`  G${g.generation} ${String(g.year)} ${g.platforms.join('+').padEnd(26)} ${g.label.padEnd(36)} ${g.decomp ?? ''} ${g.status === 'supported' ? '[suportado]' : ''}`);
}
