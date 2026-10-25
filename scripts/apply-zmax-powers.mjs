// Poder dos golpes Z (Sun/Moon, Ultra Sun/Ultra Moon) e dos golpes Max (Sword/Shield) de cada golpe de dano do jogo:
// data.moves[nome].zPower / .maxPower. Regra do jogo como o Pokémon Showdown a implementa (sim/dex-moves.ts, fixado no
// commit de scripts/fetch-showdown-moves.mjs):
//   • Z: pelo poder do golpe NESTE jogo (multi-golpe de 2–5 conta ×3): ≥140 → 200, ≥130 → 195, ≥120 → 190, ≥110 → 185,
//     ≥100 → 180, ≥90 → 175, ≥80 → 160, ≥70 → 140, ≥60 → 120, senão 100; sem poder (variável) → 100
//   • Max: Lutador/Venenoso ≥150 → 100, ≥110 → 95, ≥75 → 90, ≥65 → 85, ≥55 → 80, ≥45 → 75, senão 70; os outros
//     ≥150 → 150, ≥110 → 140, ≥75 → 130, ≥65 → 120, ≥55 → 110, ≥45 → 100, senão 90; sem poder → 100
//   • exceções escritas no data/moves.ts ("zMove: { basePower: 140 }", "maxMove: { basePower: 130 }") vencem a regra
// Uso: node scripts/apply-zmax-powers.mjs <jogo>   (sai sem erro nos jogos sem golpe Z/Max)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { SHOWDOWN_FILES, SHOWDOWN_COMMIT } from './fetch-showdown-moves.mjs';

const gameId = process.argv[2];
const mech = GAMES[gameId]?.mechanics ?? [];
const wantZ = mech.includes('golpes Z'), wantMax = mech.some((m) => /Dynamax/.test(m));
if (!wantZ && !wantMax) { console.log(`[${gameId}] jogo sem golpe Z/Max — nada a fazer`); process.exit(0); }
const file = (f) => new URL(`../data-sources/showdown/${SHOWDOWN_COMMIT}/${f.replace(/\//g, '__')}`, import.meta.url);
if (!SHOWDOWN_FILES.every((f) => existsSync(file(f)))) throw new Error('sem dados do Showdown — rode scripts/fetch-showdown-moves.mjs');

// a regra tem que estar no dex-moves.ts do commit fixado (se o Showdown mudar a tabela, o script para)
const dex = readFileSync(file('sim/dex-moves.ts'), 'utf8');
if (!/basePower >= 140\) \{\s*this\.zMove\.basePower = 200;/.test(dex) || !/basePower >= 150\) \{\s*this\.maxMove\.basePower = 100;/.test(dex)) throw new Error('sim/dex-moves.ts: tabela Z/Max diferente da esperada');

// exceções e multi-golpe do data/moves.ts
const sd = {};
let cur = null;
for (const line of readFileSync(file('data/moves.ts'), 'utf8').split(/\r?\n/)) {
  const top = line.match(/^\t([a-z0-9]+): \{$/);
  if (top) { cur = sd[top[1]] = {}; continue; }
  if (/^\t\},?$/.test(line)) { cur = null; continue; }
  if (!cur) continue;
  const z = line.match(/^\t\tzMove: \{ basePower: (\d+) \}/), mx = line.match(/^\t\tmaxMove: \{ basePower: (\d+) \}/);
  if (z) cur.z = Number(z[1]);
  if (mx) cur.max = Number(mx[1]);
  if (/^\t\tmultihit: \[/.test(line)) cur.multiRange = true;
}
const zPower = (bp, multi) => {
  const b = multi ? bp * 3 : bp;
  if (!b) return 100;
  for (const [min, p] of [[140, 200], [130, 195], [120, 190], [110, 185], [100, 180], [90, 175], [80, 160], [70, 140], [60, 120]]) if (b >= min) return p;
  return 100;
};
const maxPower = (bp, type) => {
  if (!bp) return 100;
  const t = ['fighting', 'poison'].includes(type) ? [[150, 100], [110, 95], [75, 90], [65, 85], [55, 80], [45, 75]] : [[150, 150], [110, 140], [75, 130], [65, 120], [55, 110], [45, 100]];
  for (const [min, p] of t) if (bp >= min) return p;
  return ['fighting', 'poison'].includes(type) ? 70 : 90;
};

const dataFile = new URL(`../public/data/${gameId}.json`, import.meta.url);
const data = JSON.parse(readFileSync(dataFile, 'utf8'));
let nz = 0, nm = 0, overrides = 0;
for (const [name, mv] of Object.entries(data.moves)) {
  delete mv.zPower; delete mv.maxPower;
  if (mv.category === 'status') continue;
  const s = sd[name.replace(/[^a-z0-9]/g, '')] ?? {};
  const bp = mv.power > 1 ? mv.power : 0;
  if (wantZ) { mv.zPower = s.z ?? zPower(bp, s.multiRange); nz++; if (s.z) overrides++; }
  if (wantMax) { mv.maxPower = s.max ?? maxPower(bp, mv.type); nm++; if (s.max) overrides++; }
}
data.zmaxSource = `Pokémon Showdown ${SHOWDOWN_COMMIT.slice(0, 7)} (sim/dex-moves.ts + exceções de data/moves.ts)`;
writeFileSync(dataFile, JSON.stringify(data));
console.log(`[${gameId}] golpes Z: ${nz}, golpes Max: ${nm} (${overrides} pelas exceções do Showdown)`);
