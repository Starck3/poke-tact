// Compatibilidade de MT/MO/DT e de tutores pelas tabelas do próprio jogo, lidas como o PKHeX.Core as lê (kwsch/PKHeX,
// GPL-3.0). Sem rede. Os bits ficam no registro personal (Resources/byte/personal/personal_<jogo>, mesmo arquivo do
// pkhex.mjs) e as listas ORDENADAS de golpes (índice do bit → id do golpe = id nacional = id da PokéAPI) são lidas do
// próprio C# (não copiadas à mão):
//
//   black-white      PersonalInfo/Info/PersonalInfo5BW.cs   0x3C  MT+MO bits @0x28 (101) → PersonalInfo5BW.MachineMoves
//                                                                 (95 MTs + 6 MOs); TM95 (índice 94, Snarl) excluída
//                                                                 como no LearnSource5BW.GetIsTM ("not available");
//                                                                 tutor de tipo @0x38 (8) → PersonalInfo5BW.TypeTutorMoves
//   x-y              PersonalInfo6XY.cs                     0x40  MT+MO @0x28 (100+5) → LearnSource6XY.MachineMoves;
//                                                                 tutor de tipo @0x38 (7) → PersonalInfo5BW.TypeTutorMoves
//   omega-ruby-…     PersonalInfo6AO.cs                     0x50  MT+MO @0x28 (100+7) → LearnSource6AO.MachineMoves;
//                                                                 tutor de tipo @0x38 (8); tutores especiais u32 @0x40/
//                                                                 0x44/0x48/0x4C → PersonalInfo6AO.TutorMoves1..4
//   sun-moon         PersonalInfo7.cs                       0x54  MT @0x28 (100, sem MO) → PersonalInfo7.MachineMoves;
//                                                                 tutor de tipo @0x38 (8) (LearnSource7SM não lê 0x3C)
//   ultra-sun-…      PersonalInfo7.cs                       0x54  idem + tutores de BP @0x3C → BattlePointTutorMoves
//                                                                 (LearnSource7USUM: SpecialTutor)
//   lets-go-…        PersonalInfo7GG.cs                     0x54  MT @0x28 (60) → LearnSource7GG.MachineMoves; sem
//                                                                 bits de tutor: só Pikachu/Eevee parceiros (formas 8/1)
//                                                                 → TutorStarterPikachu/TutorStarterEevee
//   sword-shield     PersonalInfo8SWSH.cs                   0xB0  MT @0x28 (100) → MachineMovesTechnical; DT @0x3C (100)
//                                                                 → MachineMovesRecord (ambos viram "machine"); tutor de
//                                                                 tipo @0x38 (8) → TypeTutorMoves; tutor da Isle of
//                                                                 Armor @0xA8 (18) → SpecialTutorMoves
//   brilliant-…      PersonalInfo8BDSP.cs                   0x44  MT+MO @0x28 (92 MTs + 8 MOs) → MachineMoves; tutor de
//                                                                 tipo @0x38 (4) → TypeTutorMoves
//   scarlet-violet   PersonalInfo9SV.cs                     0x50  MT @0x2C (230 bits = TM000–TM229, base + DLC) →
//                                                                 MachineMoves; o bit 0 (TM000 Mega Punch) é excluído:
//                                                                 Items/ItemStorage9SV.cs "TM00 - Mega Punch (... not
//                                                                 obtainable)", embora 5 espécies tenham o bit; não há
//                                                                 tutor (o "SpecialTutor" do LearnSource9SV é o
//                                                                 Lembrador de golpes, reminder_sv.pkl — não é tutor)
//
// lists.machine/tutor: golpes na ordem dos bits do jogo, sem os índices excluídos (skip).
// Formas: entrada = FormStatsIndex + forma − 1 (PersonalInfo.FormIndex/HasForm), FormStatsIndex u16 @0x1C e FormCount
// @0x20 até a Gen 7, @0x1E/@0x20 na Gen 8, @0x18/@0x1A no SV. Presença (SwSh/BDSP: bit 6 de 0x21; SV: 0x1C ≠ 0).
// Tutores "exclusivos" (EnhancedTutor de cada LearnSource*.cs: Keldeo, Meloetta, Rotom, Volt Tackle na Gen 7, Zygarde,
// Necrozma) não estão em bit nenhum — vêm de ENHANCED abaixo, transcrito desses arquivos.
import { readFileSync } from 'node:fs';

const P = 'PKHeX.Core/PersonalInfo/Info/', L = 'PKHeX.Core/Legality/LearnSource/Sources/';
const GEN7_FORMS = { index: 0x1c, count: 0x20 }, GEN8_FORMS = { index: 0x1e, count: 0x20 };
const present8 = (d) => ((d[0x21] >> 6) & 1) === 1;

// tutores fora dos bits (GetIsEnhancedTutor / GetAllMoves de cada LearnSource): [espécie, forma|null (qualquer), golpes]
const ROTOM = [[479, 1, ['Overheat']], [479, 2, ['Hydro Pump']], [479, 3, ['Blizzard']], [479, 4, ['Air Slash']], [479, 5, ['Leaf Storm']]];
const GEN5_6 = [...ROTOM, [647, null, ['Secret Sword']], [648, null, ['Relic Song']]];
const NECROZMA = [[800, 1, ['Sunsteel Strike']], [800, 2, ['Moongeist Beam']]];
const GEN7 = [...GEN5_6, ...NECROZMA, [25, null, ['Volt Tackle']], [26, null, ['Volt Tackle']],
  [718, null, ['Core Enforcer', 'Extreme Speed', 'Dragon Dance', 'Thousand Arrows', 'Thousand Waves']]];

export const MACHINE_GAMES = {
  'black-white': { personal: 'bw', size: 0x3c, forms: GEN7_FORMS, cs: `${P}PersonalInfo5BW.cs`,
    machine: [{ offset: 0x28, list: [`${P}PersonalInfo5BW.cs`, 'MachineMoves'], skip: [94] }],
    tutor: [{ offset: 0x38, list: [`${P}PersonalInfo5BW.cs`, 'TypeTutorMoves'] }], enhanced: GEN5_6 },
  'x-y': { personal: 'xy', size: 0x40, forms: GEN7_FORMS, cs: `${P}PersonalInfo6XY.cs`,
    machine: [{ offset: 0x28, list: [`${L}LearnSource6XY.cs`, 'MachineMoves'] }],
    tutor: [{ offset: 0x38, list: [`${P}PersonalInfo5BW.cs`, 'TypeTutorMoves'], count: 7 }], enhanced: GEN5_6 },
  'omega-ruby-alpha-sapphire': { personal: 'ao', size: 0x50, forms: GEN7_FORMS, cs: `${P}PersonalInfo6AO.cs`,
    machine: [{ offset: 0x28, list: [`${L}LearnSource6AO.cs`, 'MachineMoves'] }],
    tutor: [{ offset: 0x38, list: [`${P}PersonalInfo5BW.cs`, 'TypeTutorMoves'] },
      ...[0x40, 0x44, 0x48, 0x4c].map((offset, i) => ({ offset, list: [`${P}PersonalInfo6AO.cs`, `TutorMoves${i + 1}`] }))],
    enhanced: GEN5_6 },
  'sun-moon': { personal: 'sm', size: 0x54, forms: GEN7_FORMS, cs: `${P}PersonalInfo7.cs`,
    machine: [{ offset: 0x28, list: [`${P}PersonalInfo7.cs`, 'MachineMoves'] }],
    tutor: [{ offset: 0x38, list: [`${P}PersonalInfo5BW.cs`, 'TypeTutorMoves'] }], enhanced: GEN7 },
  'ultra-sun-ultra-moon': { personal: 'uu', size: 0x54, forms: GEN7_FORMS, cs: `${P}PersonalInfo7.cs`,
    machine: [{ offset: 0x28, list: [`${P}PersonalInfo7.cs`, 'MachineMoves'] }],
    tutor: [{ offset: 0x38, list: [`${P}PersonalInfo5BW.cs`, 'TypeTutorMoves'] },
      { offset: 0x3c, list: [`${P}PersonalInfo7.cs`, 'BattlePointTutorMoves'] }], enhanced: GEN7 },
  'lets-go-pikachu-lets-go-eevee': { personal: 'gg', size: 0x54, forms: GEN7_FORMS, cs: `${P}PersonalInfo7GG.cs`,
    machine: [{ offset: 0x28, list: [`${L}LearnSource7GG.cs`, 'MachineMoves'] }], tutor: [],
    enhancedLists: [[25, 8, [`${L}LearnSource7GG.cs`, 'TutorStarterPikachu']], [133, 1, [`${L}LearnSource7GG.cs`, 'TutorStarterEevee']]] },
  'sword-shield': { personal: 'swsh', size: 0xb0, forms: GEN8_FORMS, present: present8, cs: `${P}PersonalInfo8SWSH.cs`,
    machine: [{ offset: 0x28, list: [`${P}PersonalInfo8SWSH.cs`, 'MachineMovesTechnical'] },
      { offset: 0x3c, list: [`${P}PersonalInfo8SWSH.cs`, 'MachineMovesRecord'] }],
    tutor: [{ offset: 0x38, list: [`${P}PersonalInfo8SWSH.cs`, 'TypeTutorMoves'] },
      { offset: 0xa8, list: [`${P}PersonalInfo8SWSH.cs`, 'SpecialTutorMoves'] }],
    // LearnSource8SWSH.GetAllMoves: Agility do Calyrex (forma 0) sem o bug do DT12
    enhanced: [...ROTOM, ...NECROZMA], extraMachine: [[898, 0, ['Agility']]] },
  'brilliant-diamond-shining-pearl': { personal: 'bdsp', size: 0x44, forms: GEN8_FORMS, present: present8, cs: `${P}PersonalInfo8BDSP.cs`,
    machine: [{ offset: 0x28, list: [`${P}PersonalInfo8BDSP.cs`, 'MachineMoves'] }],
    tutor: [{ offset: 0x38, list: [`${P}PersonalInfo8BDSP.cs`, 'TypeTutorMoves'] }], enhanced: ROTOM },
  'scarlet-violet': { personal: 'sv', size: 0x50, forms: { index: 0x18, count: 0x1a }, present: (d) => d[0x1c] !== 0, cs: `${P}PersonalInfo9SV.cs`,
    machine: [{ offset: 0x2c, list: [`${P}PersonalInfo9SV.cs`, 'MachineMoves'], skip: [0] }], tutor: [], enhanced: [...ROTOM, ...NECROZMA] },
};

/** Lista `Nome => [ ... ];` de um .cs: números e (int)Move.X / Move.X; comentários // ignorados. */
function csList(rootUrl, file, name, moveId) {
  const cs = readFileSync(new URL(file, rootUrl), 'utf8');
  const m = cs.match(new RegExp(`\\b${name}\\s*=>\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`${file}: lista ${name} não encontrada`);
  const body = m[1].replace(/\/\/.*$/gm, '');
  return [...body.matchAll(/(?:\(int\))?Move\.(\w+)|\b(\d+)\b/g)].map((t) => (t[2] != null ? Number(t[2]) : moveId(t[1])));
}

export function readMachines(rootUrl, gameId) {
  const cfg = MACHINE_GAMES[gameId];
  if (!cfg) throw new Error(`sem tabela de MT/tutor do PKHeX para ${gameId}`);
  const res = new URL('PKHeX.Core/Resources/', rootUrl);
  const moveNames = readFileSync(new URL('text/other/en/text_Moves_en.txt', res), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const byKey = new Map(moveNames.map((n, i) => [n.replace(/[^A-Za-z0-9]/g, '').toLowerCase(), i]));
  const moveId = (n) => { const id = byKey.get(n.replace(/[^A-Za-z0-9]/g, '').toLowerCase()); if (id == null) throw new Error(`golpe ${n} sem id`); return id; };
  const blocks = (arr) => arr.map((b) => { const list = csList(rootUrl, b.list[0], b.list[1], moveId); return { ...b, list, count: b.count ?? list.length }; });
  const machine = blocks(cfg.machine), tutor = blocks(cfg.tutor);
  const enhanced = [...(cfg.enhanced ?? []).map(([s, f, names]) => [s, f, names.map(moveId)]),
    ...(cfg.enhancedLists ?? []).map(([s, f, l]) => [s, f, csList(rootUrl, l[0], l[1], moveId)])];
  const extraMachine = (cfg.extraMachine ?? []).map(([s, f, names]) => [s, f, names.map(moveId)]);

  const personal = readFileSync(new URL(`byte/personal/personal_${cfg.personal}`, res));
  const count = personal.length / cfg.size;
  const rec = (i) => personal.subarray(i * cfg.size, (i + 1) * cfg.size);
  const bitsOf = (d, bs) => {
    const out = [];
    for (const b of bs) for (let i = 0; i < b.count; i++) {
      if (b.skip?.includes(i)) continue;
      if ((d[b.offset + (i >> 3)] >> (i & 7)) & 1) out.push(b.list[i]);
    }
    return out;
  };
  const extra = (table, s, f) => table.filter(([sp, fo]) => sp === s && (fo == null || fo === f)).flatMap(([, , m]) => m);
  const entry = (d, s, f) => ({
    machine: [...new Set([...bitsOf(d, machine), ...extra(extraMachine, s, f)])],
    tutor: [...new Set([...bitsOf(d, tutor), ...extra(enhanced, s, f)])],
  });

  // última espécie = 1ª entrada de forma − 1 (as formas ficam depois das espécies no arquivo)
  let firstForm = count;
  for (let i = 1; i < count; i++) { const fi = rec(i).readUInt16LE(cfg.forms.index); if (fi > 0 && fi < firstForm) firstForm = fi; }
  const maxSpecies = firstForm - 1;
  const species = {}, forms = {};
  let absent = 0;
  for (let s = 1; s <= maxSpecies; s++) {
    const d = rec(s);
    if (cfg.present && !cfg.present(d)) absent++;
    else species[s] = entry(d, s, 0);
    const fi = d.readUInt16LE(cfg.forms.index), fc = d[cfg.forms.count];
    for (let f = 1; fi && f < fc; f++) {
      const fd = rec(fi + f - 1);
      if (cfg.present && !cfg.present(fd)) continue;
      forms[`${s}-${f}`] = entry(fd, s, f);
    }
  }
  const flat = (bs) => bs.flatMap((b) => b.list.slice(0, b.count).filter((_, i) => !b.skip?.includes(i)));
  return {
    species, forms,
    lists: { machine: flat(machine), tutor: [...flat(tutor), ...new Set(enhanced.flatMap(([, , m]) => m))] },
    report: {
      game: gameId, personal: `personal_${cfg.personal}`, recordSize: cfg.size, records: count, maxSpecies,
      speciesPresent: Object.keys(species).length, speciesAbsent: absent, forms: Object.keys(forms).length,
      machineBlocks: machine.map((b) => ({ offset: b.offset, count: b.count, list: cfg.machine.find((c) => c.offset === b.offset).list.join(':'), skip: b.skip ?? [] })),
      tutorBlocks: tutor.map((b) => ({ offset: b.offset, count: b.count, list: cfg.tutor.find((c) => c.offset === b.offset).list.join(':') })),
    },
  };
}
