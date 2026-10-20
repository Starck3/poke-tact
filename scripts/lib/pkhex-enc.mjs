// Partes puras do "onde obter" das Gens 6–9 (encontros do PKHeX): leitor de cada jogo, rótulos dos métodos e textos.
// Usadas por scripts/build-acquisition-pkhex.mjs e pelos testes.
export const READERS = {
  'black-white': './pkhex-enc-gen5.mjs', // Black 2/White 2 tem decomp (onde obter pelo pokebw2)
  'x-y': './pkhex-enc-gen67.mjs',
  'omega-ruby-alpha-sapphire': './pkhex-enc-gen67.mjs',
  'sun-moon': './pkhex-enc-gen67.mjs',
  'ultra-sun-ultra-moon': './pkhex-enc-gen67.mjs',
  'lets-go-pikachu-lets-go-eevee': './pkhex-enc-gg-swsh.mjs',
  'sword-shield': './pkhex-enc-gg-swsh.mjs',
  'brilliant-diamond-shining-pearl': './pkhex-enc-bdsp-la.mjs',
  'legends-arceus': './pkhex-enc-bdsp-la.mjs',
  'scarlet-violet': './pkhex-enc-sv-za.mjs',
  'legends-za': './pkhex-enc-sv-za.mjs',
};

// método do leitor → texto da tela
export const METHOD_LABEL = {
  grass: 'Grama', 'tall-grass': 'Grama alta', surf: 'Surf', fishing: 'Pesca', 'old-rod': 'Old Rod', 'good-rod': 'Good Rod', 'super-rod': 'Super Rod',
  'rock-smash': 'Rock Smash', horde: 'Horda', sos: 'Chamado SOS', 'island-scan': 'Island Scan', ambush: 'Emboscada', 'dexnav': 'DexNav',
  overworld: 'No mapa', symbol: 'No mapa', hidden: 'Grama (escondido)', 'rare-spawn': 'No mapa (raro)', 'max-raid': 'Max Raid', 'max-lair': 'Dynamax Adventure',
  underground: 'Grand Underground', 'honey-tree': 'Árvore de mel', 'poke-radar': 'Poké Radar', swarm: 'Surto', 'great-marsh': 'Great Marsh', 'trophy-garden': 'Trophy Garden',
  // Gen 6/7 "Standard": o PKHeX junta grama, surf, varas, DexNav… numa lista só (sem inventar a separação)
  wild: 'Selvagem', alpha: 'Alfa', 'mass-outbreak': 'Surto em massa', 'massive-mass-outbreak': 'Surto em massa gigante', landmark: 'Ponto de interesse', outbreak: 'Surto', 'space-time-distortion': 'Distorção espaço-temporal',
  'hidden-grotto': 'Hidden Grotto', 'shaking-tree': 'Árvore (sacudir)', curry: 'Curry/pesca', 'dynamax-adventure': 'Dynamax Adventure', 'tera-raid': 'Tera Raid', 'fixed-symbol': 'No mapa (fixo)', 'wild-zone': 'Wild Zone', hyperspace: 'Hyperspace', other: 'Selvagem',
};
// detalhe do leitor (texto, ou objeto no BDSP/LA) → texto curto da tela; campos técnicos (ids, bola, IVs…) ficam de fora
export function detailText(d) {
  if (d == null) return undefined;
  // texto: tira as notas técnicas sobre o PKHeX (SlotType, "também aceita nível 60", comentário do C#…); a faixa agregada
  // do Let's Go (L3–56: o arquivo junta aparições de momentos diferentes) vira uma nota curta
  if (typeof d === 'string') {
    const parts = d.split(/;\s*/).map((p) => (/agregada/.test(p) ? 'faixa de nível agregada na tabela' : p)).filter((p) => !/PKHeX/.test(p));
    return parts.join('; ') || undefined;
  }
  const parts = [];
  if (d.alpha) parts.push(d.alpha === 'guaranteed' ? 'alfa garantido' : 'pode vir alfa');
  if (d.munchlaxTree) parts.push('árvore do Munchlax (depende do ID do treinador)');
  if (d.roaming) parts.push('vaga pelas rotas');
  if (d.fossil) parts.push('fóssil');
  if (d.nickname) parts.push(`troca: ${d.nickname}${d.ot ? ` (de ${d.ot})` : ''}`);
  // SV / Z-A: estrelas da Tera Raid, horários em que aparece, DLC, forma sorteada
  if (d.stars) parts.push(`${d.stars}★`);
  if (d.time) parts.push(`só ${[].concat(d.time).map((t) => TIME_PT[String(t).toLowerCase()] ?? t).join('/')}`);
  if (d.formRandom) parts.push('forma variável');
  if (d.dlc) parts.push(/^DLC/.test(d.dlc) ? d.dlc : `DLC ${d.dlc}`);
  // d.versionNote ("versão não separada no PKHeX") vai como aviso do arquivo inteiro (acq.notes), não em cada linha
  return parts.join('; ') || undefined;
}
const TIME_PT = { morning: 'manhã', day: 'dia', evening: 'entardecer', dusk: 'entardecer', night: 'noite' };
export const NO_PLACE = { trade: 'Troca no jogo', static: 'Encontro errante', gift: 'Presente' };
// métodos que dependem de sorteio/condição (E2 do motor: "não dá para contar com ela")
export const RANDOM = new Set(['swarm', 'poke-radar', 'honey-tree', 'mass-outbreak', 'massive-mass-outbreak', 'outbreak', 'space-time-distortion', 'rare-spawn', 'max-raid', 'dynamax-adventure', 'tera-raid']);
