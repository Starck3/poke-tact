// Mega Evolução (e Reversão Primal) nos jogos que têm a mecânica (X/Y, ORAS, Sun/Moon, USUM, Let's Go, Legends: Z-A):
// cada espécie do jogo ganha `megas: [{ form, name, spriteId, stone, types, stats, abilities, primal }]`.
//   • quais Megas e qual pedra: a tabela do PKHeX `ItemStorage9ZA.GetExpectedMegaStoneOrPrimalOrb` (espécie + forma →
//     item); nome da pedra pelo text_Items_en. A Mega Rayquaza não usa pedra (Dragon Ascent) — fica de fora.
//   • a Mega só entra se a forma existe na tabela pessoal DESTE jogo (PKHeX; com a flag "presente" quando o jogo tem):
//     o X/Y não tem a Mega Altaria (veio no ORAS).
//   • atributos, tipos e habilidade: a forma na tabela pessoal do jogo. Nome e sprite: a variedade da PokéAPI
//     (charizard-mega-x); 🧪 tipos da PokéAPI têm que bater com os do jogo — senão fica o nome sem sprite próprio e o aviso
//     vai para o relatório. Megas novas do Z-A que a PokéAPI não tem: "<espécie>-mega" com o sprite da espécie.
// Uso: node scripts/add-pkhex-megas.mjs <jogo>   (depois do add-pkhex-forms; sai sem erro nos jogos sem Mega)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadPkhex } from './lib/pkhex.mjs';
import { get } from './lib/pokeapi-cache.mjs';

const gameId = process.argv[2];
const game = GAMES[gameId];
if (!game?.pkhex || !(game.mechanics ?? []).includes('Mega Evolução')) { console.log(`[${gameId}] jogo sem Mega Evolução — nada a fazer`); process.exit(0); }
const root = new URL(`../data-sources/${game.pkhex.dir}/`, import.meta.url);
const P = loadPkhex(root, gameId);
const core = (p) => readFileSync(new URL(`PKHeX.Core/${p}`, root), 'utf8');
const speciesNames = readFileSync(new URL('PKHeX.Core/Resources/text/other/en/text_Species_en.txt', root), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
const itemNames = readFileSync(new URL('PKHeX.Core/Resources/text/items/text_Items_en.txt', root), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
const speciesId = new Map(speciesNames.map((n, i) => [n.replace(/[^A-Za-z0-9]/g, '').toLowerCase(), i]));

// tabela espécie/forma → pedra ("Charizard when form == 2 => 0678, // Y"; "Magearna when form >= 2 => 2646")
const table = core('Items/ItemStorage9ZA.cs').match(/GetExpectedMegaStoneOrPrimalOrb[\s\S]*?switch\s*\{([\s\S]*?)\n\s*\};/)[1];
const stones = [];
let section = '';
for (const line of table.split('\n')) {
  const c = line.match(/^\s*\/\/\s*(.+)/);
  if (c) { section = c[1]; continue; }
  const m = line.match(/^\s*(\w+) when form (==|>=) (\d+) => (\d+),/);
  if (!m) continue;
  const sid = speciesId.get(m[1].toLowerCase());
  if (!sid) throw new Error(`espécie desconhecida na tabela de pedras: ${m[1]}`);
  stones.push({ sid, op: m[2], form: Number(m[3]), item: itemNames[Number(m[4])], primal: /Primal/.test(section) });
}
if (stones.length < 90) throw new Error(`tabela de Mega Stones: esperava 90+, achou ${stones.length}`);

const file = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const added = [], warn = [];
for (const mon of data.pokemon) delete mon.megas; // refaz do zero
for (const s of stones) {
  const mon = data.pokemon.find((p) => p.id === s.sid && !p.regionalForm);
  const forms = P.forms[s.sid] ?? {};
  const list = s.op === '==' ? [s.form] : Object.keys(forms).map(Number).filter((f) => f >= s.form);
  for (const f of list) {
    const d = forms[f];
    if (!mon || !d || (P.cfg.present && !d.present) || !d.stats.hp) continue;
    // nome e sprite: variedades da PokéAPI com "-mega"/"-primal", na ordem das formas Mega do jogo
    const sp = await get(`pokemon-species/${s.sid}`).catch(() => null);
    const megaVars = (sp?.varieties ?? []).map((v) => v.pokemon).filter((v) => /-(mega|primal)(-|$)/.test(v.name));
    const megaForms = stones.filter((x) => x.sid === s.sid).flatMap((x) => (x.op === '==' ? [x.form] : Object.keys(forms).map(Number).filter((k) => k >= x.form))).sort((a, b) => a - b);
    const v = megaVars[megaForms.indexOf(f)];
    let name = `${mon.name}-mega${megaForms.length > 1 ? '-' + (megaForms.indexOf(f) + 1) : ''}`, spriteId = mon.spriteId ?? mon.id;
    if (v) {
      const api = await get(`pokemon/${v.url.split('/').at(-2)}`);
      const apiTypes = api.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
      if (apiTypes.join() === d.types.join()) { name = v.name; spriteId = api.id; } else warn.push(`${v.name}: PKHeX ${d.types.join('/')} × PokéAPI ${apiTypes.join('/')} (sem sprite próprio)`);
    } else warn.push(`${mon.name} forma ${f}: sem variedade Mega na PokéAPI (nome ${name}, sprite da espécie)`);
    (mon.megas ??= []).push({ form: f, name, spriteId, stone: s.item, types: d.types, stats: d.stats, abilities: game.noAbilities ? [] : d.abilities, ...(s.primal && { primal: true }) });
    added.push(`${name} (${s.item})`);
  }
}
data.megaSource = `PKHeX ItemStorage9ZA.GetExpectedMegaStoneOrPrimalOrb + personal_${P.cfg.personal}`;
writeFileSync(file, JSON.stringify(data));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/pkhex-megas.json`, import.meta.url), JSON.stringify({ added, warn }, null, 1));
console.log(`[${gameId}] Megas: ${added.length}${warn.length ? ` (${warn.length} avisos no relatório)` : ''}`);
