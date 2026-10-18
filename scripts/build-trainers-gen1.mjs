// Treinadores da Gen 1 a partir do decomp em assembly (pret/pokered, pret/pokeyellow) → public/data/<jogo>-trainers.json
//   data/trainers/parties.asm  times por classe (nº do treinador = posição na classe, 1-based):
//                              "db NÍVEL, ESPÉCIE..., 0" (todos no mesmo nível) | "db $FF, NÍVEL, ESPÉCIE, ..., 0"
//   golpes: moveset padrão do jogo (WriteMonMoves) + golpes especiais, que o jogo SÓ aplica nos times "$FF"
//     Red/Blue (engine/battle/read_trainer_party.asm):
//       • LoneMoves[wGymLeaderNo] (o script do ginásio escreve 1..8; wLoneAttackNo é o MESMO byte, ram/wram.asm):
//         "db N, GOLPE" → (N+1)º Pokémon, 3º slot (Brock: Onix com Bide)
//       • TeamMoves (Elite 4): 5º Pokémon, 3º slot
//       • Campeão (RIVAL3): 1º (Pidgeot) Sky Attack; 6º (inicial) Mega Drain | Fire Blast | Blizzard
//     Yellow (data/trainers/special_moves.asm): SpecialTrainerMoves "db CLASSE, nº / db pokémon, slot, GOLPE ... / db 0"
//   onde: data/maps/objects/<Mapa>.asm "object_event ..., OPP_CLASSE, nº"; rivais por script (scripts/<Mapa>.asm)
// Uso: node scripts/build-trainers-gen1.mjs <jogo>
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { loadGen1, mapLabel } from './lib/gen1-asm.mjs';
import { likelyMoveset } from '../public/engine.mjs';

const gameId = process.argv[2] ?? 'red-blue';
const game = GAMES[gameId];
const root = new URL(`../data-sources/${game.asmDecomp.dir}/`, import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const g = loadGen1(root);
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const monByDexName = Object.fromEntries(Object.entries(g.species).map(([dex, s]) => [s.name, data.pokemon.find((p) => p.id === Number(dex))]));
const moveIdOf = new Map();
for (const n of Object.keys(data.moves)) moveIdOf.set(JSON.parse(readFileSync(new URL(`../.cache/move_${n}.json`, import.meta.url), 'utf8')).id, n);
const moveName = (c) => moveIdOf.get(g.moveId[c]) ?? null;
const isYellow = existsSync(new URL('data/trainers/special_moves.asm', root)) && /SpecialTrainerMoves/.test(read('data/trainers/special_moves.asm'));

// classes (ordem de trainer_const; "^" evita a definição "MACRO trainer_const" + "const \1", que virava a classe "const") e nomes exibidos (data/trainers/names.asm, mesma ordem a partir de YOUNGSTER)
const classes = [...read('constants/trainer_constants.asm').matchAll(/^\s*trainer_const\s+(\w+)/gm)].map((m) => m[1]).filter((c) => c !== 'NOBODY');
const names = [...read('data/trainers/names.asm').matchAll(/li\s+"([^"]+)"/g)].map((m) => m[1]);
const title = (s) => s.replace(/♂/g, ' ♂').replace(/♀/g, ' ♀').toLowerCase().replace(/(^|[\s.])([a-zé])/g, (m, a, b) => a + b.toUpperCase()).replace('Pokémaniac', 'PokéManiac');
const className = Object.fromEntries(classes.map((c, i) => [c, title(names[i] ?? c).replace(/^Rival\d$/, 'Rival')])); // RIVAL1..3 = mesmo rival em fases

// times: rótulo da classe ("YoungsterData:") → pela ordem em TrainerDataPointers
const parties = read('data/trainers/parties.asm');
const labelOrder = [...parties.matchAll(/dw\s+(\w+Data)\b/g)].map((m) => m[1]);
const teams = {}; // CLASSE -> [{ no, party, special, comment }]
for (const [i, label] of labelOrder.entries()) {
  const cls = classes[i];
  const body = parties.split(new RegExp(`^${label}:\\s*$`, 'm'))[1]?.split(/^\w+Data:\s*$/m)[0] ?? '';
  let comment = null;
  teams[cls] = [];
  for (const line of body.split('\n')) {
    const c = line.match(/^\s*;\s*(.+)/);
    if (c) { comment = c[1].trim(); continue; }
    const m = line.match(/^\s*db\s+(.+?),\s*0\s*$/);
    if (!m) continue;
    const parts = m[1].split(',').map((x) => x.trim());
    const special = parts[0] === '$FF';
    const party = [];
    if (special) for (let k = 1; k < parts.length; k += 2) party.push({ level: Number(parts[k]), dex: parts[k + 1] });
    else for (const sp of parts.slice(1)) party.push({ level: Number(parts[0]), dex: sp });
    teams[cls].push({ no: teams[cls].length + 1, party, special, comment });
  }
}

// onde: objetos dos mapas + scripts de rival
const where = {}; // "CLASSE#nº" -> Set(mapas)
const add = (cls, no, map) => (where[`${cls}#${no}`] ??= new Set()).add(map);
const leaderOfMap = {}; // arquivo do mapa -> "CLASSE#nº" do líder (para casar com o wGymLeaderNo do script de mesmo nome)
const LEADERS = ['BROCK', 'MISTY', 'LT_SURGE', 'ERIKA', 'KOGA', 'SABRINA', 'BLAINE', 'GIOVANNI'];
for (const f of readdirSync(new URL('data/maps/objects/', root))) {
  for (const m of read(`data/maps/objects/${f}`).matchAll(/OPP_(\w+),\s*(\d+)/g)) {
    if (m[1].startsWith('RIVAL')) continue; // o objeto do rival não é a luta: o nº do time vem do script (pelo inicial)
    add(m[1], Number(m[2]), mapLabel(f));
    if (LEADERS.includes(m[1])) leaderOfMap[f] = `${m[1]}#${m[2]}`;
  }
}
// scripts: cada bloco "ld a, OPP_X / ld [wCurOpponent], a ... ld [wTrainerNo], a" escolhe o nº do time de um destes jeitos:
//   • cadeia "cp STARTERx / ld a, $N / jr .done" (Cerulean, Campeão)   • tabela "ld hl, Tabela" → "Tabela: db STARTERx, N" (Route 22)
//   • Yellow: "ld a, [wRivalStarter] / add $K" → K+1..K+3 (wRivalStarter = RIVAL_STARTER_JOLTEON..VAPOREON = 1..3)
const num = (s) => (s.startsWith('$') ? parseInt(s.slice(1), 16) : Number(s));
for (const f of readdirSync(new URL('scripts/', root))) {
  const t = read(`scripts/${f}`);
  // fim do bloco: "ld [wTrainerNo], a" ou a chamada da sub-rotina que o escreve (Route 22: call Route22GetRivalTrainerNoByStarterScript)
  for (const b of t.matchAll(/ld a, OPP_(\w+)\s*\n\s*ld \[wCurOpponent\], a([\s\S]*?)(?:ld \[wTrainerNo\], a|call \w*TrainerNo\w*)/g)) {
    const [, cls, body] = b;
    if (/ld a, OPP_/.test(body)) continue; // bloco atravessou outra batalha
    const nos = [...body.matchAll(/ld a, (\$[0-9A-Fa-f]+|\d+)\s*$/gm)].map((m) => num(m[1]));
    const add1 = body.match(/ld a, \[wRivalStarter\]\s*\n\s*add (\$[0-9A-Fa-f]+|\d+)/);
    if (add1) nos.push(num(add1[1]) + 1, num(add1[1]) + 2, num(add1[1]) + 3);
    for (const tbl of body.matchAll(/ld hl, (\.?\w+)/g)) {
      // rótulo local ".StarterTable:" se repete no arquivo (Route 22 tem dois) → o PRIMEIRO depois do bloco; vai até a linha em branco
      const after = t.slice(b.index);
      const sect = after.split(new RegExp(`^${tbl[1].replace('.', '\\.')}:\\s*$`, 'm'))[1]?.split(/\n\s*\n/)[0] ?? '';
      for (const m of sect.matchAll(/db \w+,\s*(\$?[0-9A-Fa-f]+)\s*$/gm)) nos.push(num(m[1]));
    }
    for (const no of new Set(nos)) if (teams[cls]?.[no - 1]) add(cls, no, mapLabel(f));
  }
}

// golpes especiais
const lone = [...read('data/trainers/special_moves.asm').matchAll(/^\s*db\s+(\d+),\s*(\w+)\s*$/gm)].map((m) => ({ idx: Number(m[1]), move: m[2] }));
const teamMoves = Object.fromEntries([...read('data/trainers/special_moves.asm').matchAll(/^\s*db\s+([A-Z_]+),\s*([A-Z_]+)\s*$/gm)].map((m) => [m[1], m[2]]));
const gymNo = {}; // CLASSE do líder -> wGymLeaderNo escrito pelo script do ginásio
for (const f of readdirSync(new URL('scripts/', root)).filter((x) => x.endsWith('Gym.asm'))) {
  const t = read(`scripts/${f}`);
  const no = t.match(/ld a, (\$[0-9A-Fa-f]+|\d+)\s*\n\s*ld \[wGymLeaderNo\], a/)?.[1];
  if (no && leaderOfMap[f]) gymNo[leaderOfMap[f]] = num(no); // o líder está no arquivo de objetos de mesmo nome
}
const yellowSpecial = {}; // "CLASSE#nº" -> [{ mon, slot, move }]
if (isYellow) {
  for (const b of read('data/trainers/special_moves.asm').split(/^\s*db\s+0\s*$/m)) {
    const head = b.match(/db\s+([A-Z_]+),\s*(\d+)\s*\n/);
    if (!head) continue;
    yellowSpecial[`${head[1]}#${head[2]}`] = [...b.slice(head.index + head[0].length).matchAll(/db\s+(\d+),\s*(\d+),\s*(\w+)/g)].map((m) => ({ mon: Number(m[1]), slot: Number(m[2]), move: m[3] }));
  }
}

// rival ↔ inicial do jogador: OaksLab.asm "<Inicial>PokeBallText: ld a, STARTER_r / ld [wRivalStarterTemp] ... ld a, STARTER_p"
const starterOf = Object.fromEntries([...read('constants/pokemon_constants.asm').matchAll(/^DEF (STARTER\d)\s+EQU\s+(\w+)/gm)].map((m) => [m[1], m[2]]));
const rivalForPlayer = {}; // espécie do rival (DEX) -> inicial do jogador (nome PokéAPI)
for (const m of read('scripts/OaksLab.asm').matchAll(/ld a, (STARTER\d)\s*\n\s*ld \[wRivalStarterTemp\], a[\s\S]{0,120}?ld a, (STARTER\d)/g)) {
  rivalForPlayer[starterOf[m[1]]] = monByDexName[starterOf[m[2]]]?.name;
}
const familyRoot = (mon) => { let cur = mon; while (cur?.evolvesFrom) cur = data.pokemon.find((p) => p.id === cur.evolvesFrom); return cur; };

const GROUP = { BROCK: 'Líderes de ginásio', MISTY: 'Líderes de ginásio', LT_SURGE: 'Líderes de ginásio', ERIKA: 'Líderes de ginásio', KOGA: 'Líderes de ginásio', SABRINA: 'Líderes de ginásio', BLAINE: 'Líderes de ginásio', LORELEI: 'Elite dos Quatro', BRUNO: 'Elite dos Quatro', AGATHA: 'Elite dos Quatro', LANCE: 'Elite dos Quatro', RIVAL3: 'Campeão', RIVAL1: 'Rival', RIVAL2: 'Rival' };
const bc = read('constants/battle_constants.asm');
const hexDv = (name) => parseInt(bc.match(new RegExp(`DEF ${name} EQU \\$([0-9A-Fa-f]{2})`))[1], 16);
const TRAINER_DVS = { attack: hexDv('ATKDEFDV_TRAINER') >> 4, defense: hexDv('ATKDEFDV_TRAINER') & 15, speed: hexDv('SPDSPCDV_TRAINER') >> 4, special: hexDv('SPDSPCDV_TRAINER') & 15 };
const out = [];
const unplaced = [];
for (const cls of classes) {
  for (const t of teams[cls] ?? []) {
    const key = `${cls}#${t.no}`;
    const maps = [...(where[key] ?? [])];
    if (!maps.length) { unplaced.push({ key, comment: t.comment }); continue; } // sem objeto nem script: time não usado no jogo
    // DVs de TODO treinador na Gen 1: constants/battle_constants.asm ATKDEFDV_TRAINER $98 / SPDSPCDV_TRAINER $88 → 9/8/8/8
    const party = t.party.map((x) => {
      const mon = monByDexName[x.dex];
      return { species: mon.name, level: x.level, item: null, dvs: TRAINER_DVS, moves: likelyMoveset(mon, x.level), defaultMoves: true };
    });
    const setMove = (i, slot, mvConst) => {
      const p = party[i];
      const mv = moveName(mvConst);
      if (!p || !mv) return;
      const moves = [...p.moves];
      while (moves.length < slot) moves.push(null);
      moves[slot - 1] = mv;
      p.moves = moves.filter(Boolean);
      p.defaultMoves = false;
    };
    if (t.special && !isYellow) {
      const gl = gymNo[key];
      if (gl && lone[gl - 1]) setMove(lone[gl - 1].idx, 3, lone[gl - 1].move);
      else if (teamMoves[cls]) setMove(4, 3, teamMoves[cls]);
      else if (cls === 'RIVAL3') {
        setMove(0, 3, 'SKY_ATTACK');
        const st = familyRoot(monByDexName[t.party.at(-1).dex])?.name;
        setMove(5, 3, st === 'bulbasaur' ? 'MEGA_DRAIN' : st === 'charmander' ? 'FIRE_BLAST' : 'BLIZZARD');
      }
    }
    if (t.special && isYellow) for (const s of yellowSpecial[key] ?? []) setMove(s.mon - 1, s.slot, s.move);
    const group = cls === 'GIOVANNI' && maps.some((m) => /Gym/.test(m)) ? 'Líderes de ginásio' : GROUP[cls] ?? 'Treinadores comuns';
    const rivalStarter = /^RIVAL/.test(cls) ? party.map((p) => familyRoot(data.pokemon.find((x) => x.name === p.species))?.name).find((n) => ['bulbasaur', 'charmander', 'squirtle', 'eevee'].includes(n)) : null;
    const forStarter = rivalStarter && !isYellow ? [rivalForPlayer[rivalStarter.toUpperCase()]].filter(Boolean) : null;
    // Yellow: o time do rival varia pelo resultado das lutas iniciais (não pelo inicial do jogador) — o nº do time distingue
    const variant = /^RIVAL/.test(cls) ? ` — com ${party.at(-1).species[0].toUpperCase() + party.at(-1).species.slice(1)}${isYellow ? ` (time ${t.no})` : ''}` : '';
    out.push({
      key, name: className[cls], label: `${className[cls]}${variant} (${maps.join(', ')})`, class: className[cls], group, double: false, map: maps,
      party, ...(forStarter?.length ? { forStarter } : {}),
    });
  }
}
writeFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), JSON.stringify({ source: `${game.asmDecomp.repo}@${game.asmDecomp.commit.slice(0, 7)}`, trainers: out, unplaced }));
const byGroup = out.reduce((a, t) => ((a[t.group] = (a[t.group] ?? 0) + 1), a), {});
console.log(`[${gameId}] ${out.length} treinadores ${JSON.stringify(byGroup)}; ${unplaced.length} times sem mapa (não usados): ${unplaced.slice(0, 8).map((u) => `${u.key}${u.comment ? ' ' + u.comment : ''}`).join(' | ')}`);
