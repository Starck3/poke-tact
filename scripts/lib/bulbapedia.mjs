// Bulbapedia (fonte liberada pelo usuário em 2026-10-25 — PLANO-EXECUCAO-3): baixar páginas e ler o wikitext.
// Regras (as mesmas do fetch-bulbapedia.mjs): wikitext pela action=raw, ≥ 5 s entre pedidos (Crawl-delay), User-Agent
// identificado, PARA no 1º erro HTTP sem insistir, retoma do disco; manifesto com URL, data e sha256.
// Licença do texto: CC BY-NC-SA — fica em data-sources/bulbapedia/ (fora do git); o app só guarda fatos extraídos (time,
// golpe, lugar) com o crédito "Bulbapedia".
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DELAY_MS = 5000;
const UA = 'poke-tact-validation/0.1 (personal project; slow resumable fetch; respects Crawl-delay 5)';
const DIR = new URL('../../data-sources/bulbapedia/pages/', import.meta.url);
const MANIFEST = new URL('../../data-sources/bulbapedia/pages-manifest.json', import.meta.url);
let last = 0;
const fileOf = (title) => new URL(encodeURIComponent(title.replace(/ /g, '_')).replace(/%/g, '_') + '.txt', DIR);

/** Wikitext da página (cache em disco; segue #REDIRECT). Sem rede e sem cache → null. */
export async function page(title, { offline = false } = {}) {
  mkdirSync(DIR, { recursive: true });
  const f = fileOf(title);
  let text;
  if (existsSync(f)) text = readFileSync(f, 'utf8');
  else {
    if (offline) return null;
    const wait = last + DELAY_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const url = `https://bulbapedia.bulbagarden.net/w/index.php?title=${encodeURIComponent(title.replace(/ /g, '_'))}&action=raw`;
    // curl (mesmo User-Agent e ritmo): o fetch do Node leva 403 da proteção do site, o curl não
    const out = execFileSync('curl', ['-s', '-A', UA, '-w', '\n%{http_code}', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    last = Date.now();
    const status = Number(out.slice(out.lastIndexOf('\n') + 1));
    if (status === 404) { writeFileSync(f, ''); return ''; } // página inexistente: guarda vazio (não pede de novo)
    if (status !== 200) throw new Error(`Bulbapedia: HTTP ${status} em ${title} — parado (não insiste)`);
    text = out.slice(0, out.lastIndexOf('\n'));
    writeFileSync(f, text);
    const man = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
    man[title] = { url, fetchedAt: new Date().toISOString(), sha256: createHash('sha256').update(text).digest('hex'), bytes: text.length };
    writeFileSync(MANIFEST, JSON.stringify(man, null, 1));
  }
  const red = text.match(/^#REDIRECT\s*\[\[([^\]#|]+)/i);
  return red ? page(red[1].trim(), { offline }) : text;
}

/** Wikitext de um trecho → texto simples ([[a|b]] → b, {{rt|9|Kalos}} → Route 9, {{p|X}} → X…). */
export function plain(s) {
  let t = String(s ?? '');
  for (let i = 0; i < 4; i++) {
    t = t
      .replace(/\{\{rt\|([^|}]+)\|[^}]*\}\}/gi, 'Route $1')
      .replace(/\{\{rtn\|([^|}]+)\|[^}]*\}\}/gi, '$1')
      .replace(/\{\{(?:p|pkmn|ka|tc|m|i|type|DL)\|(?:[^|}]*\|)?([^|}]+)\}\}/gi, '$1')
      .replace(/\{\{(?:sup\/\d|tt|dotw|gameabbrev\w*|color2|Pdollar|PDollar|pdollar)[^{}]*\}\}/gi, '')
      .replace(/\{\{OBP\|([^|}]+)\|[^}]*\}\}/gi, '$1')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1');
  }
  return t.replace(/\{\{[^{}]*\}\}/g, '').replace(/<br\s*\/?>/gi, '; ').replace(/'''?/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Campos "| chave = valor" de uma predefinição (várias por linha, separadas por " | "). */
function fields(body) {
  const out = {};
  for (const part of body.split(/\n\s*\||\s\|\s/)) {
    const m = part.match(/^\s*\|?\s*([\w-]+)\s*=\s*([\s\S]*?)\s*$/);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

/**
 * Times de treinador da página: cada {{Party …}} com os {{Pokémon …}} até {{Party/end}}, e o título de seção (==…==) em
 * que está. Retorna [{ section, game, location, name, class, mons: [{ species, level, held, ability, moves: [{ name, z }], zPower }] }].
 */
export function parties(text) {
  const out = [];
  const heads = [...text.matchAll(/^(={2,6})\s*(.+?)\s*\1\s*$/gm)].map((m) => ({ at: m.index, level: m[1].length, title: plain(m[2]) }));
  const sectionAt = (at) => {
    const path = [];
    for (const h of heads) { if (h.at > at) break; while (path.length && path.at(-1).level >= h.level) path.pop(); path.push(h); }
    return path.map((h) => h.title);
  };
  for (const m of text.matchAll(/\{\{Party\s*\n([\s\S]*?)\n\}\}([\s\S]*?)\{\{Party\/end\}\}/g)) {
    const p = fields(m[1]);
    const mons = [...m[2].matchAll(/\{\{Pokémon(?:\/\d+)?\s*\n([\s\S]*?)\n\}\}/g)].map((x) => {
      const f = fields(x[1]);
      const moves = [1, 2, 3, 4].map((i) => (f[`move${i}`] ? { name: plain(f[`move${i}`]), z: f[`z-move${i}`] ? plain(f[`z-move${i}`]) : null } : null)).filter(Boolean);
      return { species: plain(f.pokemon), form: f.form ? plain(f.form) : null, level: Number(f.level) || null, held: f.held ? plain(f.held) : null, ability: f.ability ? plain(f.ability) : null, moves, zPower: /z-power/i.test(f.icon ?? '') || moves.some((mv) => mv.z),
        // "| max = Gigantamax" / "| max = Dynamax" (Sword/Shield): o Pokémon que dinamaxiza na luta
        ...(f.max ? { dynamax: /giga/i.test(f.max) ? 'gigantamax' : 'dynamax' } : f.dynamax || /dynamax|gigantamax/i.test(f.icon ?? '') ? { dynamax: f.dynamax ?? f.icon } : {}), ...(f.tera ? { tera: plain(f.tera) } : {}) };
    });
    // "| caption = {{PlayerChoice|0722|Rowlet}}": o time vale quando o jogador escolheu essa inicial (rival)
    const choice = (p.caption ?? '').match(/\{\{PlayerChoice\|\d*\|([^|}]+)/i);
    out.push({ section: sectionAt(m.index), game: p.game ?? null, location: p.location ? plain(p.location) : null, name: plain(p.name), class: p.class ? plain(p.class) : null, ...(choice ? { playerChoice: choice[1].trim() } : {}), mons });
  }
  return out;
}

/** Lugares pelo DESTINO dos links da célula (Q2, 0.48.0): "[[Driftveil City#Market|Market]]" → "Driftveil City";
 *  {{rt|9|Kalos}} → "Route 9"; {{ci|Driftveil}} → "Driftveil City"; {{tn|X}} → "X Town". */
export function linkPlaces(cell) {
  const out = [];
  for (const m of String(cell).matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) out.push(m[1].trim());
  for (const m of String(cell).matchAll(/\{\{rtn?\|([^|}]+)\|[^}]*\}\}/gi)) out.push(`Route ${m[1].trim()}`);
  for (const m of String(cell).matchAll(/\{\{ci\|([^|}]+)\}\}/gi)) out.push(`${m[1].trim()} City`);
  for (const m of String(cell).matchAll(/\{\{tn\|([^|}]+)\}\}/gi)) out.push(`${m[1].trim()} Town`);
  return [...new Set(out)];
}

/**
 * Tabela "Acquisition" de um item: [{ games: ['SwSh', 'IA'], found: 'Motostoke Riverbank', other: 'Lake of Outrage…' }].
 * Coluna 1 = achado no chão/escondido; coluna 2 = outros (loja, presente, prêmio…), como a predefinição ItemAvailability.
 */
export function acquisition(text) {
  const i = text.search(/^={2,4}\s*Acquisition\s*={2,4}\s*$/m);
  if (i < 0) return [];
  const end = text.indexOf('\n|}', i);
  const rows = text.slice(i, end > 0 ? end : undefined).split(/\n\|-/).slice(1);
  return rows.map((r) => {
    const cells = r.split(/\n\|[ \t]?/).slice(1).map((c) => c.trim()); // [ \t]: célula vazia ("|" sozinho) não engole a quebra de linha
    const games = [...(cells[0] ?? '').matchAll(/\{\{gameabbrev(?:\d|ss)\|([^}|]+)\}\}/g)].map((m) => m[1]);
    return { games, found: plain(cells[1] ?? ''), other: plain(cells[2] ?? ''), foundPlaces: linkPlaces(cells[1] ?? ''), otherPlaces: linkPlaces(cells[2] ?? '') };
  }).filter((r) => r.games.length);
}

// código da Bulbapedia ({{gameabbrevN|…}}) → jogos do app (DLC/expansão fica no jogo base)
export const GAME_CODES = {
  BW: ['black-white'], B2W2: ['black-2-white-2'], XY: ['x-y'], ORAS: ['omega-ruby-alpha-sapphire'], SM: ['sun-moon'], USUM: ['ultra-sun-ultra-moon'],
  SMUSUM: ['sun-moon', 'ultra-sun-ultra-moon'], PE: ['lets-go-pikachu-lets-go-eevee'], SwSh: ['sword-shield'], BDSP: ['brilliant-diamond-shining-pearl'],
  LA: ['legends-arceus'], SV: ['scarlet-violet'], ZA: ['legends-za'], SVZA: ['scarlet-violet', 'legends-za'],
  RSE: ['ruby-sapphire', 'emerald'], FRLG: ['firered-leafgreen'], DPPt: ['diamond-pearl', 'platinum'], HGSS: ['heartgold-soulsilver'], GSC: ['gold-silver', 'crystal'],
};
