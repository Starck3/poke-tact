import { nameKey } from './names.mjs';
// Parsers do PokeMythology (sem rede). Usados pelo coletor, pelo catálogo e pelos testes.

const ORIGIN = 'https://www.pokemythology.net';
const norm = nameKey;
// páginas antigas (.htm) cujo nome não segue o padrão "detonado-<jogo>"
const LEGACY = { usum: 'ultra-sun-ultra-moon' };

/** Links de detonados da página de índice. Aceita links absolutos E relativos (o índice usa os dois). */
export function parseDetonadoIndex(html) {
  const out = new Map(); // url normalizada -> { slug, url, legacy }
  for (const m of html.matchAll(/href="((?:https?:\/\/(?:www\.)?pokemythology\.net)?\/(?:conteudo\/)?detonados\/(detonado[-_][a-z0-9_-]+?)(\.htm)?\/?)"/gi)) {
    const slug = m[2].toLowerCase();
    if (/demo/.test(slug)) continue; // demos (ORAS/SM) não são o detonado completo
    const url = m[1].startsWith('http') ? m[1].replace('//pokemythology', '//www.pokemythology') : ORIGIN + m[1];
    const key = slug.replace(/_/g, '-');
    if (!out.has(key)) out.set(key, { slug, url: url.replace(/\/?$/, m[3] ? '' : '/'), legacy: !!m[3] });
  }
  return [...out.values()];
}

/** Associa cada detonado a um id de jogo do catálogo (por nome normalizado). */
export function matchDetonados(detonados, gameIds) {
  const byNorm = Object.fromEntries(gameIds.map((id) => [norm(id), id]));
  const result = {};
  for (const d of detonados) {
    const name = d.slug.replace(/^detonado[-_]/, '');
    const id = byNorm[norm(name)] ?? LEGACY[norm(name)];
    if (id && !result[id]) result[id] = d.url;
  }
  return result;
}

/** Seções do detonado na ordem da história (cabeçalhos sublinhados) com o HTML de cada uma. */
// re: a Gen 1 passa SECTIONS_WITH_SUBTITLES (subtítulos "<em><u>A CIDADE DE VIRIDIAN</u></em>" / "<u><em>MONTE LUA</em>")
export const SECTIONS_WITH_SUBTITLES = /(?:text-decoration: underline;"><em>|<em><u>|<u><em>)([^<]+)<\/(?:em|u)>/g;
export function parseDetonadoSections(html, re = /text-decoration: underline;"><em>([^<]+)<\/em>/g) {
  const marks = [...html.matchAll(re)].map((m) => ({ title: decode(m[1].trim()), at: m.index }));
  return marks.map((s, i) => ({ title: s.title, html: html.slice(s.at, marks[i + 1]?.at ?? html.length) }));
}

/** Blocos de treinador ("Líder Brock – Tipo Pedra / Geodude lv.12 / Onix lv.14"). */
// Todo bloco começa com o sprite do treinador (/sprites/treinadores/...), seguido do título
// ("Líder Brock – Tipo Pedra" no FRLG, "Roxanne usa:" no Emerald) e das linhas "Espécie lv.N".
export function parseTrainerBlocks(html) {
  const out = [];
  // o Emerald põe um parágrafo antes do nome ("…Não use golpes psíquicos. O Sidney usa:") → título = última frase
  // título seguido de <br /> (FRLG) ou de </p><p> ("Norman usa:</p><p>…" no Emerald)
  const re = /sprites\/treinadores\/[^>]*>\s*([^<]{2,600})(?:<br \/>|<\/p>\s*<p>)([\s\S]{0,2500}?)<\/p>/g;
  for (const m of html.matchAll(re)) {
    const party = [...m[2].matchAll(/>\s*([A-Z][A-Za-z.' -]+?)\s+lv\.?\s*(\d+)/g)].map((x) => ({ species: x[1].trim(), level: Number(x[2]) }));
    const context = decode(m[1].replace(/<[^>]+>/g, '').trim());
    const title = context.split(/(?<=[a-zà-ú]{3}[.!?])\s+/).pop(); // "Lt. Surge" não é fim de frase
    if (party.length) out.push({ title, context, party, at: m.index });
  }
  return out;
}

/**
 * Times em texto corrido (detonados da Gen 1): cada sequência de "Espécie lv.N" com no máx. `gap` caracteres de texto
 * entre um Pokémon e o próximo é um time ("Os pokémons de Brock são um <img>Geodude lv.12 e um <img>Onix lv.14";
 * "LORELEI: Dewgong lv.54 Cloyster lv.53 …"). Contexto = texto antes do time (para reconhecer o nome).
 * `at` = posição no HTML (mesma escala das seções).
 */
export function parseTrainerRuns(html, gap = 60) {
  const re = /([A-Z][a-z]+(?:\.? [A-Z][a-z]+)?)\s*lv\.?\s*(\d+)/g;
  const hits = [];
  // posições no HTML original; o texto entre dois acertos é medido sem as tags
  for (const m of html.matchAll(re)) hits.push({ species: m[1], level: Number(m[2]), at: m.index, end: m.index + m[0].length });
  const runs = [];
  for (const h of hits) {
    const last = runs.at(-1)?.at(-1);
    const between = last ? html.slice(last.end, h.at).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') : null;
    // quebra também no fim de parágrafo COM texto no meio ("…Abra lv.15</p><p>LORELEI: Dewgong lv.54" são dois times);
    // sem texto, é o mesmo time quebrado em parágrafos (Bruno no Red/Blue: "Onix lv.53</p><p><img>Hitmonchan lv.55")
    const newPara = /<\/p>/i.test(html.slice(last?.end ?? 0, h.at)) && between?.trim().replace(/[,;:e ]/g, '').length > 0;
    if (last && between.length <= gap && !/[.!?]\s+[A-Z]/.test(between) && !newPara) runs.at(-1).push(h);
    else runs.push([h]);
  }
  return runs.map((r) => ({
    title: '', context: decode(html.slice(Math.max(0, r[0].at - 600), r[0].at).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
    party: r.map(({ species, level }) => ({ species, level })), at: r[0].at,
  }));
}

export function decode(s) {
  return s.replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&#038;|&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
