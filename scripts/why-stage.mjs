// Diagnóstico: por que um lugar recebeu tal estágio (seção/trecho do detonado que o cita). Gen 1 (asmDecomp).
// Uso: node scripts/why-stage.mjs <jogo> "Route 22" "Cerulean Cave"  — no gerador: WHY=ROUTE_22,PALLET_TOWN node scripts/build-acquisition-gen1.mjs <jogo>
import { readFileSync } from 'node:fs';
import { GAMES } from './games.mjs';
import { buildTimeline, placeStage } from './lib/progress.mjs';
import { parseTrainerRuns, SECTIONS_WITH_SUBTITLES } from './lib/pokemythology.mjs';
const [gameId, ...labels] = process.argv.slice(2);
const game = GAMES[gameId];
let h = readFileSync(new URL(`../data-sources/pokemythology/${game.walkthrough}.html`, import.meta.url), 'utf8');
for (const [w, r] of Object.entries(game.walkthroughTypos ?? {})) h = h.replace(new RegExp(w, 'gi'), (m) => (m === m.toUpperCase() ? r.toUpperCase() : r));
const tr = JSON.parse(readFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), 'utf8')).trainers;
const people = (g) => Object.values(Object.groupBy(tr.filter((t) => t.group === g), (t) => t.name)).map((ts) => ({ name: ts[0].name, teams: ts.map((t) => t.party) }));
const tl = buildTimeline(h, people('Líderes de ginásio'), people('Elite dos Quatro'), { blocks: parseTrainerRuns(h), sectionRe: SECTIONS_WITH_SUBTITLES });
for (const l of labels) console.log(l, JSON.stringify(placeStage(tl, l)));
