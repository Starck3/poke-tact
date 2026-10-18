// Gera public/data/<jogo>.json a partir da PokeAPI, aplicando as regras históricas da geração do jogo.
// Uso: node scripts/build-data.mjs firered-leafgreen
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { GAMES } from './games.mjs';

const API = 'https://pokeapi.co/api/v2';
const CACHE = new URL('../.cache/', import.meta.url);
const OUT = new URL('../public/data/', import.meta.url);
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };
const genNum = (name) => ROMAN[name.replace('generation-', '')];

async function get(path) {
  const file = new URL(path.replace(/\//g, '_') + '.json', CACHE);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API}/${path}`);
      if (!res.ok) throw new Error(`${res.status} ${path}`);
      const data = await res.json();
      await writeFile(file, JSON.stringify(data));
      return data;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// Entradas "past_*" guardam o valor que valia ATÉ a geração indicada.
// Para a geração alvo, vale a entrada mais antiga cuja geração seja >= alvo; sem ela, vale o valor atual.
function pastEntry(list, orderOf, targetOrder) {
  return (list ?? [])
    .filter((e) => orderOf(e) >= targetOrder)
    .sort((a, b) => orderOf(a) - orderOf(b))[0];
}

const gameId = process.argv[2];
const game = GAMES[gameId];
if (!game) throw new Error(`Jogo desconhecido: ${gameId}. Opções: ${Object.keys(GAMES).join(', ')}`);
await mkdir(CACHE, { recursive: true });
await mkdir(OUT, { recursive: true });

const gen = game.generation;

// --- Version groups (ordem cronológica, usada em past_values dos golpes)
const vgList = await get('version-group?limit=100');
const vgOrder = {};
(await pool(vgList.results, 8, (v) => get(`version-group/${v.name}`))).forEach((vg) => (vgOrder[vg.name] = vg.order));
const targetVg = vgOrder[game.versionGroup];

// --- Tipos: só os que existem na geração
const typeList = await get('type?limit=100');
const typeData = (await pool(typeList.results, 8, (t) => get(`type/${t.name}`))).filter(
  (t) => genNum(t.generation.name) <= gen && !['unknown', 'shadow', 'stellar'].includes(t.name) // Stellar: só da Terastalização, não é tipo de ataque/defesa comum,
);
const typeNames = typeData.map((t) => t.name);
// chart[atacante][defensor] = multiplicador
const chart = {};
for (const t of typeData) {
  const past = pastEntry(t.past_damage_relations, (e) => genNum(e.generation.name), gen);
  const rel = past ? past.damage_relations : t.damage_relations;
  chart[t.name] = Object.fromEntries(typeNames.map((n) => [n, 1]));
  for (const x of rel.double_damage_to) if (chart[t.name][x.name] !== undefined) chart[t.name][x.name] = 2;
  for (const x of rel.half_damage_to) if (chart[t.name][x.name] !== undefined) chart[t.name][x.name] = 0.5;
  for (const x of rel.no_damage_to) if (chart[t.name][x.name] !== undefined) chart[t.name][x.name] = 0;
}

// --- Pokémon + espécies
const ids = Array.from({ length: game.maxDex }, (_, i) => i + 1);
const raw = await pool(ids, 4, async (id) => {
  const [p, s] = await Promise.all([get(`pokemon/${id}`), get(`pokemon-species/${id}`)]);
  return { p, s };
});

// --- Disponibilidade: encontros por versão + cadeia evolutiva
// Evolução por horário do dia (Espeon/Umbreon) não existe na Gen 3 (jogos sem relógio de dia/noite).
const evoOk = new Map(); // id da espécie -> true se a evolução PARA ela é possível na geração
const chainUrls = [...new Set(raw.map(({ s }) => s.evolution_chain.url.split('/').at(-2)))];
for (const c of await pool(chainUrls, 4, (id) => get(`evolution-chain/${id}`))) {
  const walk = (node) => {
    for (const child of node.evolves_to) {
      const sid = Number(child.species.url.split('/').at(-2));
      // evolução por horário (Espeon/Umbreon) só é impossível na Gen 3 (FRLG sem relógio; RS/E sem eventos de dia/noite).
      // Gen 2 e Gen 4+ têm relógio — antes isto valia para todas as gerações e Espeon/Umbreon saíam "não obtíveis" no Crystal.
      evoOk.set(sid, gen !== 3 || child.evolution_details.some((d) => !d.time_of_day));
      walk(child);
    }
  };
  walk(c.chain);
}
const encounters = {}, encountersRandom = {};
await pool(ids, 4, async (id) => {
  const r = await get(`pokemon/${id}/encounters`);
  // 🧪 encontro que só existe com cartucho de GBA no slot 2 (condição "slot2-*": Caterpie/Weedle no DP/Platinum) não conta —
  // é outro jogo; o decomp do Platinum confirmou (slots 8–9 de wild_encounters.c)
  const real = (d) => d.encounter_details.some((e) => !e.condition_values.some((c) => /^slot2-/.test(c.name)));
  encounters[id] = Object.fromEntries(game.versions.map((v) => [v, r.some((a) => a.version_details.some((d) => d.version.name === v && real(d)))]));
  // todos os encontros reais da versão exigem surto ou Poké Radar?
  const common = (d) => d.encounter_details.some((e) => !e.condition_values.some((c) => /^slot2-/.test(c.name)) && !e.condition_values.some((c) => /^(swarm-yes|radar-on)$/.test(c.name)));
  encountersRandom[id] = Object.fromEntries(game.versions.map((v) => [v, encounters[id][v] && !r.some((a) => a.version_details.some((d) => d.version.name === v && common(d)))]));
});

const pokemon = [];
const usedMoves = new Set();
for (const { p, s } of raw) {
  // Aprendizado neste jogo
  const learnset = [];
  for (const m of p.moves) {
    for (const d of m.version_group_details) {
      if (d.version_group.name !== game.versionGroup) continue;
      learnset.push({ move: m.move.name, method: d.move_learn_method.name, level: d.level_learned_at });
      usedMoves.add(m.move.name);
    }
  }
  if (learnset.length === 0) continue; // não existe neste jogo

  const pastTypes = pastEntry(p.past_types, (e) => genNum(e.generation.name), gen);
  const types = (pastTypes ? pastTypes.types : p.types).sort((a, b) => a.slot - b.slot).map((t) => t.type.name);

  // past_stats: cada entrada traz só os stats que mudaram (Beedrill: gen-i só "special"; gen-v "attack" 80).
  // Para cada stat vale a entrada MAIS ANTIGA (>= geração do jogo) que o define — usar só a 1ª entrada dava Beedrill 90 na Gen 1.
  const stats = Object.fromEntries(p.stats.map((x) => [x.stat.name, x.base_stat]));
  const pastList = (p.past_stats ?? []).filter((e) => genNum(e.generation.name) >= gen).sort((a, b) => genNum(a.generation.name) - genNum(b.generation.name));
  const setBy = new Set();
  for (const e of pastList) for (const x of e.stats) if (!setBy.has(x.stat.name)) { stats[x.stat.name] = x.base_stat; setBy.add(x.stat.name); }
  // Gen 1: um único stat "Special" (ataque e defesa especiais iguais) — vem de past_stats (ex.: Abra 105)
  if (gen === 1 && stats.special != null) { stats['special-attack'] = stats.special; stats['special-defense'] = stats.special; }
  delete stats.special;

  // Habilidades: gen 3 tem habilidades, mas sem "oculta". past_abilities pode remover/alterar slots.
  const abil = new Map(p.abilities.map((a) => [a.slot, a]));
  for (const pa of (p.past_abilities ?? []).filter((e) => genNum(e.generation.name) >= gen).sort((a, b) => genNum(b.generation.name) - genNum(a.generation.name))) {
    for (const a of pa.abilities) a.ability ? abil.set(a.slot, a) : abil.delete(a.slot);
  }
  // Habilidades só existem a partir da Gen 3 (e Let's Go não as usa); ocultas a partir da Gen 5
  const abilities = gen < 3 || game.noAbilities ? [] : [...abil.values()].filter((a) => gen >= 5 || !a.is_hidden).map((a) => a.ability.name);

  const evolvesFrom = s.evolves_from_species ? Number(s.evolves_from_species.url.split('/').at(-2)) : null;
  pokemon.push({
    id: p.id,
    name: p.name,
    types,
    stats,
    abilities,
    evolvesFrom,
    legendary: s.is_legendary || s.is_mythical,
    learnset,
  });
}
const evolvedInto = new Set(pokemon.map((x) => x.evolvesFrom).filter(Boolean));
for (const x of pokemon) x.fullyEvolved = !evolvedInto.has(x.id);
// obtainable[versão]: aparece selvagem/presente na versão, ou evolui (sem exigir horário) de algo obtenível.
const byId = new Map(pokemon.map((x) => [x.id, x]));
const canGet = (x, v, seen = new Set()) => {
  if (encounters[x.id][v]) return true;
  const parent = byId.get(x.evolvesFrom);
  return !!parent && evoOk.get(x.id) !== false && !seen.has(parent.id) && canGet(parent, v, seen.add(x.id));
};
for (const x of pokemon) x.obtainable = Object.fromEntries(game.versions.map((v) => [v, canGet(x, v)]));
// E2 nos jogos sem "onde obter": só por surto/Poké Radar (condições "swarm-yes"/"radar-on" da PokéAPI) — ex.: Pidgey no DP
// (surto da Route 229). Vale para a espécie e para quem só vem dela por evolução.
const randomOnlyEnc = (x, v) => encountersRandom[x.id]?.[v] === true;
const randomOnly = (x, v) => { if (encounters[x.id][v]) return randomOnlyEnc(x, v); const p = byId.get(x.evolvesFrom); return !!p && randomOnly(p, v); };
for (const x of pokemon) { const r = Object.fromEntries(game.versions.filter((v) => x.obtainable[v] && randomOnly(x, v)).map((v) => [v, 'surto/Poké Radar (PokéAPI)'])); if (Object.keys(r).length) x.randomOnly = r; }

// --- Golpes: valores da geração do jogo
const moveNames = [...usedMoves].sort();
const moveRaw = await pool(moveNames, 4, (n) => get(`move/${n}`));
const moves = {};
for (const m of moveRaw) {
  const v = {
    type: m.type.name,
    power: m.power,
    accuracy: m.accuracy,
    pp: m.pp,
    priority: m.priority,
  };
  // past_values: cada entrada traz só os campos que mudaram naquele ponto (os demais vêm null).
  // A versão da entrada é aquela em que o valor MUDOU — o valor listado vale ANTES dela (exclusivo):
  // Dig tem {gold-silver: 100, diamond-pearl: 60} → Gen 1 = 100, Gold/Silver = 60 (confirmado no pokegold).
  // Com ">=" o Gold/Silver recebia os valores da Gen 1 (Bite Normal, Dig 100, Blizzard 90%).
  // (past_types/past_stats/past_damage_relations são "última geração em que valia" → inclusivos, ver acima.)
  // Para cada campo, vale o valor da entrada mais antiga POSTERIOR à versão do jogo que o defina.
  const pasts = (m.past_values ?? []).filter((e) => vgOrder[e.version_group.name] > targetVg).sort((a, b) => vgOrder[a.version_group.name] - vgOrder[b.version_group.name]);
  for (const k of Object.keys(v)) {
    const e = pasts.find((p) => (k === 'type' ? p.type : p[k]) != null);
    if (e) v[k] = k === 'type' ? e.type.name : e[k];
  }
  const damageClass = m.damage_class.name;
  moves[m.name] = {
    ...v,
    // Gen 3: categoria vem do tipo; golpes de status continuam sendo status.
    category:
      // até a Gen 3: categoria pelo TIPO; a partir da Gen 4: categoria de cada golpe (PokéAPI damage_class)
      damageClass === 'status' ? 'status' : gen >= 4 ? damageClass : game.physicalTypes.includes(v.type) ? 'physical' : 'special',
    effect: (m.effect_entries.find((e) => e.language.name === 'en')?.short_effect ?? '').replace(/\$effect_chance/g, m.effect_chance ?? ''),
  };
  if (genNum(m.generation.name) > gen) delete moves[m.name]; // segurança: golpe de geração futura
}
// Remove da lista de aprendizado qualquer golpe que não exista na geração
for (const x of pokemon) x.learnset = x.learnset.filter((l) => moves[l.move]);

const out = {
  game: { id: gameId, label: game.label, generation: gen, versions: game.versions, source: 'PokeAPI (version-group ' + game.versionGroup + ')', builtAt: new Date().toISOString() },
  types: typeNames,
  chart,
  pokemon,
  moves,
};
if (!pokemon.length) {
  // ex.: Legends: Z-A — a PokéAPI ainda não tem learnsets desse version-group; não publica arquivo vazio
  console.error(`SEM DADOS: ${gameId} não tem Pokémon com learnset na PokéAPI (version-group ${game.versionGroup}). Nada gravado.`);
  process.exit(3);
}
await writeFile(new URL(`${gameId}.json`, OUT), JSON.stringify(out));
console.log(`OK ${gameId}: ${pokemon.length} pokémon, ${Object.keys(moves).length} golpes, ${typeNames.length} tipos`);
