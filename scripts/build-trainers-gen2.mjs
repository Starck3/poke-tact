// Treinadores da Gen 2 a partir do decomp em assembly (pret/pokegold, pret/pokecrystal) → public/data/<jogo>-trainers.json
//   constants/trainer_constants.asm  "trainerclass X" (ordem = id da classe; TRAINER_NONE = 0) + "const X1…" (ids 1-based)
//   data/trainers/party_pointers.asm TrainerGroups: "dw XGroup" na ordem das classes (a partir da classe 1)
//   data/trainers/parties.asm        por treinador: db "NOME@", TRAINERTYPE_NORMAL|MOVES|ITEM|ITEM_MOVES; Pokémon; db -1
//   data/trainers/class_names.asm    nome da classe (li "LEADER"…), na ordem das classes a partir da 1
//   maps/*.asm                       "trainer CLASSE, ID, …" (treinador do mapa) e "loadtrainer CLASSE, ID" (script)
//   golpes: os do time quando TRAINERTYPE_*MOVES; senão o moveset padrão do jogo (FillMoves = likelyMoveset)
//   rival ↔ inicial do jogador: "checkevent EVENT_GOT_<INICIAL>_FROM_ELM / iftrue .Rótulo" antes do loadtrainer
//     (sem desvio = o inicial que sobrou). Ex.: CherrygroveCity.asm — jogador com Cyndaquil → RIVAL1_1_TOTODILE.
// Uso: node scripts/build-trainers-gen2.mjs <jogo>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadGen2 } from './lib/gen2-asm.mjs';
import { mapLabel } from './lib/gen1-asm.mjs';
import { likelyMoveset } from '../public/engine.mjs';

const gameId = process.argv[2] ?? 'crystal';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const g = loadGen2(root);
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const monOf = (c) => data.pokemon.find((p) => p.id === g.speciesId[c]);
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const moveName = (c) => (c === 'NO_MOVE' ? null : moveIdOf.get(g.moveId[c]) ?? null);
// tokens do Game Boy: "#" = POKé ("#FAN" → Pokéfan, "#MANIAC" → Pokémaniac)
const title = (s) => s.replace(/<PKMN>/g, 'POKéMON').replace(/#/g, 'POKé').toLowerCase().replace(/(^|[\s.&-])([a-zé])/g, (m, a, b) => a + b.toUpperCase());

// classes e ids
const tc = read('constants/trainer_constants.asm');
const classes = []; // [{ name, ids: [ID…] }] a partir da classe 1
let cur = null;
for (const line of tc.split('\n')) {
  const c = line.match(/^\s*trainerclass\s+(\w+)/);
  if (c) { cur = { name: c[1], ids: [] }; if (c[1] !== 'TRAINER_NONE') classes.push(cur); continue; }
  const k = line.match(/^\s*const\s+(\w+)/);
  if (k && cur && cur.name !== 'TRAINER_NONE') cur.ids.push(k[1]);
}
const classNames = [...read('data/trainers/class_names.asm').matchAll(/li\s+"([^"]+)"/g)].map((m) => title(m[1]));
const groupLabels = [...read('data/trainers/party_pointers.asm').matchAll(/^\s*dw\s+(\w+)/gm)].map((m) => m[1]);
const parties = read('data/trainers/parties.asm');
const groups = {}; // CLASSE -> [{ name, type, party }]
groupLabels.forEach((label, i) => {
  const cls = classes[i]?.name;
  if (!cls) return;
  const body = parties.split(new RegExp(`^${label}:\\s*$`, 'm'))[1]?.split(/^\w+Group:\s*$/m)[0] ?? '';
  groups[cls] = [...body.matchAll(/db\s+"([^"@]*)@",\s*(TRAINERTYPE_\w+)\s*\n([\s\S]*?)db -1/g)].map((m) => {
    const type = m[2];
    const party = [...m[3].matchAll(/^\s*db\s+(\d+),\s*([^\n;]+)/gm)].map((x) => {
      const a = x[2].split(',').map((s) => s.trim());
      const sp = a[0];
      const item = type.includes('ITEM') ? a[1] : null;
      const moves = type.includes('MOVES') ? a.slice(type.includes('ITEM') ? 2 : 1, (type.includes('ITEM') ? 2 : 1) + 4) : null;
      return { level: Number(x[1]), sp, item: item && item !== 'NO_ITEM' ? item : null, moves };
    });
    return { name: m[1], type, party };
  });
});

// onde: mapas
const where = {}; // "CLASSE#ID" -> { maps:Set, viaTrainerMacro:boolean }
const starterOfBranch = {}; // "CLASSE#ID" -> [inicial do jogador]
const STARTERS = ['CHIKORITA', 'CYNDAQUIL', 'TOTODILE'];
for (const f of readdirSync(new URL('maps/', root)).filter((x) => x.endsWith('.asm'))) {
  const t = read(`maps/${f}`);
  const lines = t.split('\n');
  for (const m of t.matchAll(/^\s*(trainer|loadtrainer)\s+(\w+),\s*(\w+)/gm)) {
    const key = `${m[2]}#${m[3]}`;
    const w = (where[key] ??= { maps: new Set(), macro: false });
    w.maps.add(mapLabel(f));
    if (m[1] === 'trainer') w.macro = true;
  }
  // rival: ramos por inicial
  const branchOf = {}; // ".Rótulo" -> inicial
  for (const m of t.matchAll(/checkevent EVENT_GOT_(\w+)_FROM_ELM\s*\n\s*iftrue (\.\w+)/g)) branchOf[m[2]] = m[1];
  lines.forEach((line, i) => {
    const lt = line.match(/^\s*loadtrainer\s+(RIVAL\d),\s*(\w+)/);
    if (!lt) return;
    for (let j = i - 1; j >= 0; j--) {
      const l = lines[j];
      if (/^\w+:/.test(l)) break; // rótulo global: fim do bloco
      const loc = l.match(/^(\.\w+):?\s*$/); // rótulo local com ou sem ':' (BurnedTower1F usa ".totodile")
      if (loc && branchOf[loc[1]]) { starterOfBranch[`${lt[1]}#${lt[2]}`] = [branchOf[loc[1]]]; return; }
      const it = l.match(/iftrue (\.\w+)/);
      if (it && branchOf[it[1]] && /checkevent EVENT_GOT_\w+_FROM_ELM/.test(lines[j - 1] ?? '')) {
        // fim da cadeia de desvios: este loadtrainer é o caminho "sem desvio" = o inicial que sobrou
        const chain = Object.entries(branchOf).filter(([lbl]) => t.indexOf(`iftrue ${lbl}`) > -1).map(([, s]) => s);
        starterOfBranch[`${lt[1]}#${lt[2]}`] = STARTERS.filter((s) => !chain.includes(s));
        return;
      }
    }
  });
}

const JOHTO = ['FALKNER', 'BUGSY', 'WHITNEY', 'MORTY', 'CHUCK', 'JASMINE', 'PRYCE', 'CLAIR'];
const KANTO = ['BROCK', 'MISTY', 'LT_SURGE', 'ERIKA', 'JANINE', 'SABRINA', 'BLAINE', 'BLUE'];
const ELITE = ['WILL', 'KOGA', 'BRUNO', 'KAREN'];
const groupOf = (cls) => (JOHTO.includes(cls) ? 'Líderes de ginásio' : KANTO.includes(cls) ? 'Líderes de Kanto' : ELITE.includes(cls) ? 'Elite dos Quatro' : cls === 'CHAMPION' ? 'Campeão' : /^RIVAL/.test(cls) ? 'Rival' : 'Treinadores comuns');
// DVs por classe: data/trainers/dvs.asm ("dn atk, def, spd, spc ; CLASSE"), na ordem das classes a partir da 1
const classDvs = [...read('data/trainers/dvs.asm').matchAll(/^\s*dn\s+(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/gm)].map((m) => ({ attack: +m[1], defense: +m[2], speed: +m[3], special: +m[4] }));
const out = [], unplaced = [];
classes.forEach((c, ci) => {
  (groups[c.name] ?? []).forEach((t, i) => {
    const id = c.ids[i];
    const key = `${c.name}#${id}`;
    const w = where[key];
    if (!w) { unplaced.push({ key, name: t.name }); return; }
    const party = t.party.map((p) => {
      const mon = monOf(p.sp);
      const explicit = p.moves?.map(moveName).filter(Boolean);
      return { species: mon.name, level: p.level, item: p.item, dvs: classDvs[ci], moves: explicit ?? likelyMoveset(mon, p.level), defaultMoves: !explicit };
    });
    const cname = classNames[ci] ?? title(c.name);
    const person = t.name === '?' ? cname : title(t.name); // rival: nome escolhido pelo jogador ('?')
    const fs = starterOfBranch[key]?.map((s) => s.toLowerCase());
    // revanche: mesmo treinador (classe + nome) com um time anterior já colocado no mesmo mapa
    const rematch = out.some((o) => o.class === cname && o.name === person && o.map.some((m) => w.maps.has(m)) && o.key !== key);
    out.push({
      key, name: person, label: cname === person ? person : `${cname} ${person}`, class: cname, group: groupOf(c.name), double: false,
      map: [...w.maps], party, ...(fs?.length && { forStarter: fs }), ...(rematch && { rematch: true }),
    });
  });
});
writeFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, trainers: out, unplaced }));
const by = out.reduce((a, t) => ((a[t.group] = (a[t.group] ?? 0) + 1), a), {});
console.log(`[${gameId}] ${out.length} treinadores ${JSON.stringify(by)}; revanches ${out.filter((t) => t.rematch).length}; rivais com inicial ${out.filter((t) => t.forStarter).length}/${out.filter((t) => t.group === 'Rival').length}; ${unplaced.length} times sem mapa: ${unplaced.slice(0, 10).map((u) => u.key).join(' ')}`);
