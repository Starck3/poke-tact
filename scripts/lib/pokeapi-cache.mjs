// Acesso à PokéAPI com cache em .cache/ (mesmo formato do build-data: "move/x" → .cache/move_x.json) e o registro de golpe
// do dataset. Usado pelos passos que completam o dataset com as tabelas do PKHeX.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://pokeapi.co/api/v2';
export const cacheFile = (path) => new URL(`../../.cache/${path.replace(/\//g, '_')}.json`, import.meta.url);
export async function get(path) {
  const f = cacheFile(path);
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const r = await fetch(`${API}/${path}`);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  const j = await r.json();
  writeFileSync(f, JSON.stringify(j));
  return j;
}
/** Golpe da PokéAPI no formato do dataset (valores atuais; categoria do próprio golpe — Gen 4+). */
export const moveEntry = (m) => ({ type: m.type.name, power: m.power, accuracy: m.accuracy, pp: m.pp, priority: m.priority, category: m.damage_class.name, effect: (m.effect_entries.find((e) => e.language.name === 'en')?.short_effect ?? '').replace(/\$effect_chance/g, m.effect_chance ?? '') });

/** id do jogo → nome da PokéAPI; golpe que o dataset não tem entra com os valores atuais (lista em `added`). */
export function moveResolver(data) {
  const byId = new Map(Object.keys(data.moves).map((n) => [JSON.parse(readFileSync(cacheFile(`move/${n}`), 'utf8')).id, n]));
  const added = [];
  const resolve = async (id) => {
    if (byId.has(id)) return byId.get(id);
    const m = await get(`move/${id}`);
    writeFileSync(cacheFile(`move/${m.name}`), JSON.stringify(m)); // o validate-pkhex procura pelo nome
    data.moves[m.name] = moveEntry(m);
    byId.set(id, m.name);
    added.push(m.name);
    return m.name;
  };
  // garante o registro de um golpe já conhecido pelo nome (learnset da PokéAPI da variedade)
  const ensureByName = async (name) => { if (!data.moves[name]) { const m = await get(`move/${name}`); data.moves[name] = moveEntry(m); byId.set(m.id, name); added.push(name); } return name; };
  return { resolve, ensureByName, added };
}
