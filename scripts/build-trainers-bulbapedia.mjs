// Treinadores de um jogo SEM detonado (Ultra Sun/Ultra Moon — N6, PLANO-EXECUCAO-3) pelas páginas da Bulbapedia: os times
// ({{Party}} do jogo) de kahunas, capitães, Elite, campeão, rivais e vilões, com golpes, item e golpe Z reais.
//   • grupo pela página (kahuna → Líderes; capitão → Outros…); seção "Pokémon League" → Elite dos Quatro
//   • espécie: nome da Bulbapedia + forma ("Alola Form" → -alola; "Midnight Form" → lycanroc-midnight)
//   • golpe que não existe no dataset → o Pokémon fica com o moveset do nível (defaultMoves, relatório)
//   • sem progresso (não há detonado): stage null — a tela não filtra por ponto da história neste jogo
// Uso: node scripts/build-trainers-bulbapedia.mjs <jogo>   (≥ 5 s por página nova)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { page, parties } from './lib/bulbapedia.mjs';
import { likelyMoveset } from '../public/engine.mjs';

const gameId = process.argv[2];
const CFG = {
  'ultra-sun-ultra-moon': {
    codes: /^(USUM|SMUSUM|US|UM|SUS|MUM)$/,
    pages: { 'Líderes de ginásio': ['Hala', 'Olivia', 'Nanu', 'Hapu'], 'Outros treinadores': ['Ilima', 'Lana', 'Kiawe', 'Mallow', 'Sophocles', 'Acerola', 'Mina', 'Molayne', 'Ryuki', 'Dexio', 'Sina', 'Red (game)', 'Blue (game)'],
      'Elite dos Quatro': ['Kahili'], Rival: ['Hau', 'Gladion'], Chefes: ['Guzma', 'Plumeria', 'Lusamine', 'Faba', 'Dulse', 'Zossie', 'Soliera', 'Phyco'], 'Campeão': ['Kukui'] },
  },
};
const cfg = CFG[gameId];
if (!cfg) { console.log(`[${gameId}] sem treinadores da Bulbapedia configurados — nada a fazer`); process.exit(0); }
const data = JSON.parse(readFileSync(new URL(`../public/data/${gameId}.json`, import.meta.url), 'utf8'));
const key = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const moveKey = new Map(Object.keys(data.moves).map((n) => [key(n), n]));
const monOf = (sp, form) => {
  const k = key(sp), f = key(String(form ?? '').replace(/form$/i, ''));
  const all = data.pokemon.filter((p) => key(p.name.split('-')[0]) === k || key(p.name) === k);
  if (/alola/.test(f)) return all.find((p) => /-alola/.test(p.name)) ?? null;
  return (f && all.find((p) => key(p.name).endsWith(f))) || all.find((p) => key(p.name) === k) || all.find((p) => !p.regionalForm) || null;
};
const report = { trainers: 0, mons: 0, unknownSpecies: [], missingMoves: [], pages: {} };
const trainers = [];
for (const [group, titles] of Object.entries(cfg.pages)) for (const title of titles) {
  let text;
  try { text = await page(title); } catch (e) { console.log(e.message); process.exit(2); }
  const ps = (text ?? '').length ? parties(text).filter((p) => cfg.codes.test(p.game ?? '')) : [];
  report.pages[title] = ps.length;
  ps.forEach((p, i) => {
    const party = p.mons.map((m) => {
      const mon = monOf(m.species, m.form);
      if (!mon) { report.unknownSpecies.push(`${title}: ${m.species} ${m.form ?? ''}`); return null; }
      const moves = m.moves.map((mv) => moveKey.get(key(mv.name)));
      const real = moves.length && moves.every(Boolean);
      if (!real) report.missingMoves.push(`${title} ${m.species}: ${m.moves.map((mv) => mv.name).join(', ')}`);
      const z = m.moves.find((mv) => mv.z);
      return { species: mon.name, level: m.level, item: m.held ?? null, iv: null, moves: real ? moves : likelyMoveset(mon, m.level), defaultMoves: !real, ...(real && { movesSource: 'Bulbapedia' }), ...(real && z && { zMove: moveKey.get(key(z.name)) }) };
    }).filter(Boolean);
    const section = p.section.at(-1) ?? '';
    if (!party.length || /tutorial/i.test(section)) return; // lutas-tutorial do Kukui (captura, golpe Z…) não são lutas de verdade
    // classe "Elite Four" no {{Party}} (Acerola/Molayne na Liga) ou seção da Liga → Elite dos Quatro
    const g = (/Elite Four/i.test(p.class ?? '') || /Pokémon League|Elite Four/i.test(p.section.join(' '))) && group !== 'Campeão' ? 'Elite dos Quatro' : group;
    const name = title.replace(/ \(game\)$/, '');
    trainers.push({ key: `BULBA_${key(name)}_${i}`, name, label: `${name}${section && !/^Pokémon (Ultra )?Sun and/.test(section) ? ` (${section})` : ''}`, class: p.class ?? name, group: g, double: false,
      map: p.location ? [p.location] : [], party, stage: null, source: 'Bulbapedia', movesSource: 'Bulbapedia' });
    report.trainers++; report.mons += party.length;
  });
}
writeFileSync(new URL(`../public/data/${gameId}-trainers.json`, import.meta.url), JSON.stringify({
  source: 'Bulbapedia (times dos treinadores; golpes, item e golpe Z) — CC BY-NC-SA, fatos extraídos', fromWalkthrough: false, trainers, unplaced: [], movesSource: 'Bulbapedia',
}));
mkdirSync(new URL(`../reports/${gameId}/`, import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/${gameId}/bulbapedia-trainers.json`, import.meta.url), JSON.stringify(report, null, 1));
console.log(`[${gameId}] treinadores da Bulbapedia: ${report.trainers} lutas, ${report.mons} Pokémon; espécie desconhecida ${report.unknownSpecies.length}; golpe fora do dataset ${report.missingMoves.length}`);
