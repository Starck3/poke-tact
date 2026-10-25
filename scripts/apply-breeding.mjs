// Ovos da creche (Day Care) nos jogos com decomp das Gens 2–4: a espécie que só se consegue chocando um ovo (Pichu no
// FireRed, Koffing no Diamond…) ganha a fonte `breed` em <jogo>-acquisition.json e passa a contar como obtível.
// Tudo do código do jogo:
//   • grupos de ovo e sexo de cada espécie: base_stats/*.asm (Gen 2), species_info.h / base_stats.h (Gen 3),
//     personal.json / res/pokemon/*/data.json (Gen 4)
//   • qual espécie nasce: a forma mais baixa da família da mãe (ou do parceiro do Ditto) — GetPreEvolution 2× na Gen 2
//     (engine/events/daycare.asm), GetEggSpecies na Gen 3 (src/daycare.c), tabela pms.json no Diamond/Pearl e a mesma
//     regra pela cadeia de evolução no Platinum/HGSS
//   • bebês de incenso (Wynaut, Azurill; na Gen 4 também Mime Jr., Bonsly, Munchlax, Mantyke, Budew, Happiny, Chingling):
//     só nascem com um dos pais segurando o incenso (src/daycare.c na Gen 3; sIncenseBabyTable/sIncenseMons no
//     Platinum/HGSS — o Diamond/Pearl não tem essa parte decompilada e usa a tabela do Platinum, que é a mesma geração)
//   • compatibilidade (src/daycare.c / get_egg.c / breeding.asm): grupo "Undiscovered" não cruza; com Ditto cruza
//     qualquer outro; sem Ditto, macho e fêmea com um grupo em comum
//   • nível ao chocar: EGG_LEVEL / EGG_HATCH_LEVEL (5) nas Gens 2–3; 1 na Gen 4 (CreateMon(…, species, 1, …))
//   • onde: o mapa da creche nos mapas do decomp, com o estágio da história calculado para ele
// Uso: node scripts/apply-breeding.mjs <jogo>   (roda depois do build-acquisition; jogos sem creche configurada saem sem erro)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { decompPaths } from './lib/decomp.mjs';

const gameId = process.argv[2];
const ds = (p) => new URL(`../data-sources/${p}`, import.meta.url);
// creche de cada jogo: o mapa (chave de progress.maps) e o nome mostrado
const DAYCARE = {
  'gold-silver': { gen: 2, map: 'DAY_CARE', where: 'Day Care (Route 34)', hatch: 'gen2' },
  crystal: { gen: 2, map: 'DAY_CARE', where: 'Day Care (Route 34)', hatch: 'gen2' },
  'ruby-sapphire': { gen: 3, map: 'MAP_ROUTE117_POKEMON_DAY_CARE', scripts: 'Route117' },
  emerald: { gen: 3, map: 'MAP_ROUTE117_POKEMON_DAY_CARE', scripts: 'Route117' },
  // o Day Care da Route 5 só cria um Pokémon (sem ovo): o de ovos é o da Four Island
  'firered-leafgreen': { gen: 3, map: 'MAP_FOUR_ISLAND_POKEMON_DAY_CARE', scripts: 'FourIsland_PokemonDayCare' },
  'diamond-pearl': { gen: 4, map: 'MAP_SOLACEON_DAYCARE', where: 'Solaceon Daycare' },
  platinum: { gen: 4, map: 'MAP_HEADER_POKEMON_DAY_CARE', where: 'Pokémon Day Care (Solaceon Town)' },
  'heartgold-soulsilver': { gen: 4, map: 'MAP_ROUTE_34_DAYCARE', where: 'Route 34 Daycare' },
};
const cfg = DAYCARE[gameId];
if (!cfg) { console.log(`[${gameId}] sem creche configurada (Gen 1 não tem ovo; Gens 5+ ainda não) — nada a fazer`); process.exit(0); }
const game = GAMES[gameId];
const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const acqFile = new URL(`../public/data/${gameId}-acquisition.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
const acq = JSON.parse(readFileSync(acqFile, 'utf8'));
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); // "NIDORAN_F" = "nidoran-f"; "MR__MIME" = "mr-mime"

// ---- grupos de ovo e sexo: key(espécie) → { groups: [..], gender: 'mixed' | 'male' | 'female' | 'none' }
const info = new Map();
let source, hatch, incense = [];
if (cfg.gen === 2) {
  const dir = game.asmDecomp.dir;
  for (const f of readdirSync(ds(`${dir}/data/pokemon/base_stats/`))) {
    const t = readFileSync(ds(`${dir}/data/pokemon/base_stats/${f}`), 'utf8');
    const sp = t.match(/^\s*db (\w+) ;/m)?.[1], g = t.match(/db (GENDER_\w+) ; gender/)?.[1], eg = t.match(/dn (EGG_\w+), (EGG_\w+)/);
    if (!sp || !g || !eg) continue;
    info.set(key(sp), { groups: [eg[1], eg[2]].map((x) => x.replace(/^EGG_/, '')), gender: g === 'GENDER_F0' ? 'male' : g === 'GENDER_F100' ? 'female' : g === 'GENDER_UNKNOWN' ? 'none' : 'mixed' });
  }
  const dc = readFileSync(ds(`${dir}/engine/events/daycare.asm`), 'utf8');
  if (!/callfar GetPreEvolution\s+callfar GetPreEvolution\s+ld a, EGG_LEVEL/.test(dc)) throw new Error('daycare.asm: regra do ovo (GetPreEvolution 2×, EGG_LEVEL) não encontrada');
  hatch = Number(readFileSync(ds(`${dir}/constants/battle_constants.asm`), 'utf8').match(/DEF EGG_LEVEL EQU (\d+)/)[1]);
  source = `pret/${dir.replace(/-asm$/, '')} (data/pokemon/base_stats, engine/events/daycare.asm)`;
} else if (cfg.gen === 3) {
  const { read, mapsDir } = decompPaths(gameId);
  const text = read('src/data/pokemon/species_info.h');
  for (const m of text.matchAll(/\[SPECIES_(\w+)\]\s*=\s*\{([\s\S]*?)\n\s*\},/g)) {
    const b = m[2], g = b.match(/\.genderRatio\s*=\s*([^,\n]+)/)?.[1]?.trim();
    const eg = b.match(/\.eggGroups\s*=\s*\{\s*EGG_GROUP_(\w+),\s*EGG_GROUP_(\w+)\s*\}/) ?? b.match(/\.eggGroup1\s*=\s*EGG_GROUP_(\w+),\s*\.eggGroup2\s*=\s*EGG_GROUP_(\w+)/);
    if (!g || !eg) continue;
    info.set(key(m[1]), { groups: [eg[1], eg[2]], gender: g === 'MON_MALE' || g === 'PERCENT_FEMALE(0)' ? 'male' : g === 'MON_FEMALE' || g === 'PERCENT_FEMALE(100)' ? 'female' : g === 'MON_GENDERLESS' ? 'none' : 'mixed' });
  }
  const dc = read('src/daycare.c');
  // Wynaut/Azurill: sem o incenso com um dos pais, o ovo vira Wobbuffet/Marill
  for (const m of dc.matchAll(/\*species == SPECIES_(\w+) && motherItem != ITEM_(\w+) && fatherItem != ITEM_\2\)\s*\{?\s*\*species = SPECIES_(\w+)/g)) incense.push({ baby: key(m[1]), item: m[2], parent: key(m[3]) });
  if (incense.length !== 2) throw new Error(`daycare.c: esperava 2 bebês de incenso, achou ${incense.length}`);
  hatch = Number(readHatch(read));
  // a creche do mapa precisa entregar ovo (script do mapa cita o ovo da creche)
  const sc = readFileSync(new URL(`${cfg.scripts}/scripts.inc`, mapsDir), 'utf8');
  if (!/DAYCARE_EGG/.test(sc)) throw new Error(`${cfg.scripts}: script do mapa não fala do ovo da creche`);
  source = `${game.decomp.repo} (species_info, src/daycare.c, data/maps/${cfg.scripts})`;
} else {
  const dir = game.asmDecomp.dir;
  const groups = (a) => a.map((x) => x.replace(/^EGG_GROUP_/, ''));
  if (gameId === 'platinum') {
    for (const f of readdirSync(ds(`${dir}/res/pokemon/`))) {
      const file = ds(`${dir}/res/pokemon/${f}/data.json`);
      if (!existsSync(file)) continue;
      const j = JSON.parse(readFileSync(file, 'utf8'));
      if (!j.egg_groups || !j.gender_ratio) continue;
      const g = j.gender_ratio;
      info.set(key(f), { groups: groups(j.egg_groups), gender: g === 'GENDER_RATIO_MALE_ONLY' ? 'male' : g === 'GENDER_RATIO_FEMALE_ONLY' ? 'female' : g === 'GENDER_RATIO_NO_GENDER' ? 'none' : 'mixed' });
    }
  } else {
    // personal.json: genderRatio 0 = só macho, 1 = só fêmea, 2 = sem sexo, fração = misto
    for (const p of JSON.parse(readFileSync(ds(`${dir}/files/poketool/personal/personal.json`), 'utf8')).baseStats) {
      info.set(key(p.species), { groups: groups(p.eggGroups), gender: p.genderRatio === 0 ? 'male' : p.genderRatio === 1 ? 'female' : p.genderRatio === 2 ? 'none' : 'mixed' });
    }
  }
  const table = gameId === 'heartgold-soulsilver' ? readFileSync(ds(`${dir}/src/get_egg.c`), 'utf8') : readFileSync(ds('pokeplatinum-src/src/overlay005/daycare.c'), 'utf8');
  for (const m of table.matchAll(/\{\s*SPECIES_(\w+),\s*ITEM_(\w+_INCENSE),\s*SPECIES_(\w+)\s*\}/g)) incense.push({ baby: key(m[1]), item: m[2], parent: key(m[3]) });
  if (incense.length !== 9) throw new Error(`tabela de incenso: esperava 9, achou ${incense.length}`);
  hatch = 1;
  source = `pret/${dir.replace(/-src$/, '')} (${gameId === 'platinum' ? 'res/pokemon/*/data.json' : 'personal.json'}; incensos: ${gameId === 'heartgold-soulsilver' ? 'src/get_egg.c' : 'pokeplatinum src/overlay005/daycare.c'})`;
}
function readHatch(read) {
  for (const f of ['include/constants/daycare.h', 'include/daycare.h']) {
    try { const m = read(f).match(/#define EGG_HATCH_LEVEL (\d+)/); if (m) return m[1]; } catch {}
  }
  throw new Error('EGG_HATCH_LEVEL não encontrado');
}

// ---- espécie do ovo: a forma mais baixa da família (Diamond/Pearl: tabela pms.json do jogo)
const byId = new Map(data.pokemon.map((p) => [p.id, p]));
const byKey = new Map(data.pokemon.map((p) => [key(p.name), p]));
const infoOf = (p) => info.get(key(p.name)) ?? info.get(key(p.name.split('-')[0]));
const lowest = (p) => { let c = p; while (c.evolvesFrom && byId.has(c.evolvesFrom)) c = byId.get(c.evolvesFrom); return c; };
let eggOf = lowest;
if (gameId === 'diamond-pearl') {
  const pms = JSON.parse(readFileSync(ds('pokediamond-src/files/poketool/personal/pms.json'), 'utf8')).pms;
  eggOf = (p) => byKey.get(key(pms[p.id] ?? '')) ?? lowest(p);
  const diff = data.pokemon.filter((p) => pms[p.id] && key(pms[p.id]) !== key(lowest(p).name)).map((p) => `${p.name}: pms ${pms[p.id]} × cadeia ${lowest(p).name}`);
  console.log(`[${gameId}] pms.json × cadeia de evolução: ${diff.length} diferença(s)${diff.length ? ' — ' + diff.join('; ') : ''}`);
}
const incenseOf = new Map(incense.map((x) => [x.baby, x]));
// menor estágio em que o item aparece (chão, loja, presente…)
const itemStage = (item) => { const s = acq.items?.[item]; return s?.length ? Math.min(...s.map((x) => x.stage ?? acq.progress?.post ?? 9)) : null; };

const place = acq.progress?.maps?.[cfg.map];
if (!place) throw new Error(`${cfg.map} não está nos mapas do jogo`);
const where = cfg.where ?? place.label.replace('Pokemon', 'Pokémon');
const added = [], skipped = [], addedBy = {};
// idempotente: desfaz o que uma rodada anterior acrescentou antes de recalcular
for (const [v, names] of Object.entries(acq.breeding?.added ?? {})) for (const n of names) {
  const list = (acq.versions[v][n] ?? []).filter((s) => s.type !== 'breed');
  if (list.length) acq.versions[v][n] = list; else delete acq.versions[v][n];
  const mon = data.pokemon.find((x) => x.name === n);
  if (mon && !list.length) mon.obtainable[v] = false;
}
for (const v of data.game.versions) {
  const out = acq.versions[v];
  const obt = data.pokemon.filter((p) => p.obtainable[v]);
  const ditto = obt.find((p) => p.name === 'ditto');
  const breeds = (i) => i && !i.groups.includes('UNDISCOVERED') && !i.groups.includes('NO_EGGS_DISCOVERED') && !i.groups.includes('NONE') && !i.groups.includes('DITTO');
  const byBaby = new Map();
  for (const p of obt) {
    const i = infoOf(p);
    if (!breeds(i)) continue;
    // parceiro: com Ditto, qualquer um; sem Ditto, a mãe (fêmea possível) com um macho de um grupo em comum
    let partner = null;
    if (i.gender === 'mixed' || i.gender === 'female') {
      const male = i.gender === 'mixed' ? p : obt.find((q) => q !== p && breeds(infoOf(q)) && ['mixed', 'male'].includes(infoOf(q).gender) && infoOf(q).groups.some((g) => i.groups.includes(g)));
      partner = male ? { name: male.name, kind: male === p ? 'same' : 'male' } : ditto ? { name: 'ditto', kind: 'ditto' } : null;
    } else if (ditto) partner = { name: 'ditto', kind: 'ditto' }; // só macho ou sem sexo: o ovo sai da espécie dele só com Ditto
    if (!partner) continue;
    let egg = eggOf(p);
    const inc = incenseOf.get(key(egg.name));
    if (inc) {
      const st = itemStage(inc.item);
      if (st == null) { if (!p.obtainable[v] || !egg.obtainable[v]) skipped.push(`${v}: ${egg.name} precisa de ${inc.item} (sem onde achar nos dados)`); continue; }
      (byBaby.get(egg.name) ?? byBaby.set(egg.name, []).get(egg.name)).push({ p, partner, item: inc.item, itemStage: st });
      continue;
    }
    (byBaby.get(egg.name) ?? byBaby.set(egg.name, []).get(egg.name)).push({ p, partner });
    // Nidoran♀ (Gen 3+) choca Nidoran♀ ou ♂; Illumise choca Illumise ou Volbeat
    if (cfg.gen >= 3) for (const [a, b] of [['nidoran-f', 'nidoran-m'], ['illumise', 'volbeat']]) if (egg.name === a && byKey.get(key(b))) (byBaby.get(b) ?? byBaby.set(b, []).get(b)).push({ p, partner });
  }
  for (const [baby, opts] of byBaby) {
    const mon = data.pokemon.find((x) => x.name === baby);
    if (!mon || mon.obtainable[v]) continue; // já se obtém de outro jeito: o ovo não acrescenta nada
    // um pai por espécie que choca o bebê (Pikachu e Raichu chocam Pichu): o motor escolhe o mais cedo pelo estágio deles
    const sources = opts.map((o) => ({
      type: 'breed', where, mapId: cfg.map, stage: Math.max(place.stage ?? acq.progress?.post ?? 9, o.itemStage ?? 0), level: hatch,
      want: o.p.name, partner: o.partner.kind === 'same' ? null : o.partner.name, ...(o.item ? { item: o.item } : {}),
    }));
    out[baby] = [...(out[baby] ?? []).filter((s) => s.type !== 'breed'), ...sources];
    mon.obtainable[v] = true;
    (addedBy[v] ??= []).push(baby);
    added.push(`${v}: ${baby} (de ${opts.map((o) => o.p.name).join('/')})`);
  }
}
acq.breeding = { source, daycare: where, hatchLevel: hatch, added: addedBy };
writeFileSync(acqFile, JSON.stringify(acq));
writeFileSync(dataFile, JSON.stringify(data));
console.log(`[${gameId}] ovos da creche (${where}, nv ${hatch}): +${added.length}${added.length ? ' — ' + added.join('; ') : ''}${skipped.length ? `\n  sem incenso: ${[...new Set(skipped)].join('; ')}` : ''}`);
