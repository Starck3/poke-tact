// Lógica do catálogo de jogos (sem DOM): filtros por plataforma/geração e agrupamento. Usada pela tela inicial e pelos testes.

/** Plataformas na ordem em que aparecem no catálogo (ordem cronológica dos jogos). */
export function platformsOf(games) {
  return [...new Set(games.flatMap((g) => g.platforms))];
}

export function generationsOf(games) {
  return [...new Set(games.map((g) => g.generation))].sort((a, b) => a - b);
}

/** filtros: { platform?: string|null, generation?: number|null } — os dois combinam (E lógico). */
export function filterGames(games, { platform = null, generation = null } = {}) {
  return games.filter((g) => (!platform || g.platforms.includes(platform)) && (!generation || g.generation === generation));
}

/** [[geração, jogos[]], ...] em ordem crescente de geração e, dentro dela, por ano. */
export function groupByGeneration(games) {
  const groups = new Map();
  for (const g of [...games].sort((a, b) => a.generation - b.generation || a.year - b.year)) {
    if (!groups.has(g.generation)) groups.set(g.generation, []);
    groups.get(g.generation).push(g);
  }
  return [...groups];
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const roman = (n) => ROMAN[n] ?? String(n);

/**
 * Rotas da página (hash):  #/?plataforma=Game%20Boy%20Advance&geracao=3   → tela inicial filtrada
 *                          #/jogo/emerald?treinador=TRAINER_WALLACE&i=5   → jogo, com treinador e Pokémon do time
 *                          #/jogo/firered-leafgreen?versao=leafgreen&pokemon=gyarados&nivel=40
 */
export function parseRoute(hash) {
  const [path, query = ''] = String(hash || '').replace(/^#/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const m = path.match(/^\/jogo\/([a-z0-9-]+)$/);
  return m ? { view: 'game', gameId: m[1], params } : { view: 'home', params };
}

export function homeHash({ platform = null, generation = null } = {}) {
  const q = new URLSearchParams();
  if (platform) q.set('plataforma', platform);
  if (generation) q.set('geracao', String(generation));
  const s = q.toString();
  return '#/' + (s ? '?' + s : '');
}

/** Um resumo por geração para a tela inicial: plataformas (sem repetir), anos, total de jogos e quantos estão no app. */
export function generationSummaries(games) {
  return groupByGeneration(games).map(([generation, gs]) => ({
    generation,
    platforms: platformsOf(gs),
    years: [gs[0].year, gs[gs.length - 1].year],
    count: gs.length,
    supported: gs.filter((g) => g.status === 'supported').length,
  }));
}

// Pasta de sprites da versão no repositório PokeAPI/sprites. Quase sempre é o id do jogo; Gold/Silver não tem
// pasta "gold-silver", só "gold" e "silver" (sprites diferentes entre as duas). Sem pasta (Gens 5–9 em geral), a página usa o sprite padrão.
const SPRITE_PER_VERSION = new Set(['gold-silver']);
export const spriteFolder = (gameId, version) => (SPRITE_PER_VERSION.has(gameId) && version ? version : gameId);
// Caminho do sprite dentro de sprites/pokemon/versions/. Gen 1 e Gen 2 (Red/Blue, Yellow, Gold/Silver, Crystal) têm PNGs
// com fundo branco opaco (sem transparência); a pedido do usuário (0.81.0) esses jogos usam os sprites do FireRed/LeafGreen,
// que são transparentes e cobrem os #1–386 — todas as espécies da Gen 1 e da Gen 2.
export const spritePath = (generation, gameId, version) => (generation <= 2
  ? 'generation-iii/firered-leafgreen'
  : `generation-${['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'][generation]}/${spriteFolder(gameId, version)}`);
