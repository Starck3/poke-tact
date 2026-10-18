// Baixa os dados do decomp pret do jogo (fonte-da-verdade) fixados num commit:
//   • ~25 arquivos de dados via raw.githubusercontent.com (com manifesto + sha256)
//   • clone raso e parcial (só data/maps e data/scripts) para os scripts dos mapas (presentes, estáticos, trocas)
// Uso: node scripts/fetch-decomp.mjs <jogo>      → data-sources/<repo>/<commit>/  e  data-sources/<repo>-scripts/
// Obs.: os repositórios pret não declaram licença (código derivado de jogo comercial) → uso local, fora do git.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from './games.mjs';

const gameId = process.argv[2] ?? 'firered-leafgreen';
const game = GAMES[gameId];
// Gen 1/2 (assembly): um clone raso e esparso de data/ constants/ scripts/ macros/ → data-sources/<dir>/
if (game?.asmDecomp) {
  const { repo, commit, dir: d, sparse } = game.asmDecomp;
  const dir = fileURLToPath(new URL(`../data-sources/${d}/`, import.meta.url));
  if (existsSync(`${dir}constants`) || existsSync(`${dir}include`)) { console.log(`${d} já presente`); process.exit(0); }
  await mkdir(dir, { recursive: true });
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('remote', 'add', 'origin', `https://github.com/${repo}.git`);
  git('config', 'core.sparseCheckout', 'true');
  // Gen 4 (C + JSON): lista própria em games.mjs (asmDecomp.sparse) — no Git Bash use MSYS_NO_PATHCONV=1 se for mexer à mão
  await writeFile(`${dir}.git/info/sparse-checkout`, (sparse ?? ['/data/', '/constants/', '/scripts/', '/macros/']).join('\n') + '\n');
  git('fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', commit);
  git('checkout', '-q', 'FETCH_HEAD');
  console.log(`${repo}@${commit.slice(0, 7)} baixado em data-sources/${d}`);
  process.exit(0);
}
if (!game?.decomp) throw new Error(`Jogo sem decomp configurado: ${gameId}`);
const { repo, commit } = game.decomp;
const name = repo.split('/')[1];
const FILES = [
  'include/constants/moves.h', 'include/constants/species.h', 'include/constants/abilities.h',
  'include/constants/pokemon.h', 'include/constants/trainers.h', 'include/pokemon.h', 'include/battle.h',
  'src/data/battle_moves.h',
  'src/data/pokemon/level_up_learnsets.h', 'src/data/pokemon/level_up_learnset_pointers.h',
  'src/data/pokemon/tmhm_learnsets.h', 'src/data/pokemon/tutor_learnsets.h',
  'src/data/pokemon/egg_moves.h', 'src/data/pokemon/evolution.h', 'src/data/pokemon/species_info.h',
  'src/data/trainers.h', 'src/data/trainer_parties.h', 'src/data/wild_encounters.json',
  'src/data/text/move_names.h', 'src/data/text/species_names.h', 'src/data/text/abilities.h',
  'src/pokemon.c', 'src/battle_main.c', 'src/roamer.c', 'src/trade.c', game.decomp.tradesFile,
  'src/wild_encounter.c', 'src/starter_choose.c', 'src/battle_setup.c', 'src/party_menu.c', 'include/constants/party_menu.h', 'src/data/party_menu.h', 'include/constants/tms_hms.h', 'src/field_specials.c', 'src/field_control_avatar.c', 'constants/version.inc', ...(game.decomp.itemBallScripts ? [] : []),
];
const OPTIONAL = new Set(['constants/version.inc', 'src/starter_choose.c', 'include/constants/tms_hms.h', 'src/data/pokemon/tutor_learnsets.h', 'include/constants/party_menu.h', 'src/data/party_menu.h', 'src/data/text/abilities.h']); // não existe em todos os jogos
const alias = (p) => game.decomp.aliases?.[p] ?? p;
const root = new URL(`../data-sources/${name}/${commit}/`, import.meta.url);
const manifestFile = new URL('manifest.json', root);
const prev = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { files: {} };
const manifest = {};
const sha = (t) => createHash('sha256').update(t).digest('hex');
for (const f of FILES) {
  const dest = new URL(alias(f), root);
  await mkdir(dirname(fileURLToPath(dest)), { recursive: true });
  if (existsSync(dest)) { manifest[f] = prev.files[f]?.sha256 ? prev.files[f] : { sha256: sha(readFileSync(dest)) }; continue; }
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${commit}/${alias(f)}`);
  if (res.status === 404 && OPTIONAL.has(f)) { await res.body?.cancel(); continue; }
  if (!res.ok) { console.error(`PARADO: HTTP ${res.status} em ${f}`); await res.body?.cancel(); process.exitCode = 2; break; }
  const text = await res.text();
  await writeFile(dest, text);
  manifest[f] = { bytes: text.length, sha256: sha(text) };
  await new Promise((r) => setTimeout(r, 300));
}
await writeFile(manifestFile, JSON.stringify({ repo, commit, fetchedAt: new Date().toISOString(), files: manifest }, null, 1));
console.log(`${Object.keys(manifest).length} arquivos em data-sources/${name}/${commit.slice(0, 7)}`);

// Scripts dos mapas: clone raso e parcial (uma operação git, em vez de centenas de downloads)
if (!process.exitCode) {
  const dir = fileURLToPath(new URL(`../data-sources/${name}-scripts/`, import.meta.url));
  if (existsSync(`${dir}data/maps`)) console.log('scripts dos mapas já presentes');
  else {
    await mkdir(dir, { recursive: true });
    const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
    git('init', '-q');
    git('remote', 'add', 'origin', `https://github.com/${repo}.git`);
    git('config', 'core.sparseCheckout', 'true');
    // /data/*.inc: no pokeruby, item_ball_scripts.inc fica direto em data/ (não em data/scripts/)
    await writeFile(`${dir}.git/info/sparse-checkout`, '/data/scripts/\n/data/maps/\n/data/event_scripts.s\n/data/*.inc\n');
    git('fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', commit);
    git('checkout', '-q', 'FETCH_HEAD');
    console.log('scripts dos mapas baixados');
  }
}
