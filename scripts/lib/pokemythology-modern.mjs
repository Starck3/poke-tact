// Parsers dos detonados "modernos" do PokeMythology (BW em diante: BW, B2W2, XY, ORAS, SM, LGPE, SwSh, BDSP, LA, SV).
// Funções puras: recebem o HTML (string) e não tocam disco nem rede.
//
// Formato dessas páginas (diferente das Gen 1–4, que parseTrainerBlocks entende):
//   • lutas:  "<sprite do treinador>Viola usa:<br><img …/xy/pokemon/283.png>Surskit lv.10<br><img …/666.png>Vivillon lv.12</p>"
//     – a imagem do Pokémon (serebii /pokemon/[small/]NNN[-forma].png; no B2W2 /b2w2/sprites/bw[b]/NNN.png) dá o nº da
//       Pokédex nacional; o texto até " lv." é a espécie (com erros de grafia ocasionais: "Hounchkrow", "awsbuck").
//     – variações: "usam:" (dupla), "pode usar:", parte do time no parágrafo seguinte ("usa:</p><p>…"), notas depois do
//       nível ("(lv.23 no Challenge Mode)", "(Tera Bug)", "(em Sword)", "[Habilidade] @Item – golpes").
//     – Pokémon que depende do inicial: várias imagens + texto genérico ("[495][498][501]inicial lv.5") ou nomes com "/"
//       ("Sprigatito/Fuecoco/Quaxly lv.5", "Pikachu/Eevee lv.6").
//     – tabelas: (a) uma célula por inicial, cada uma com seu "X usa:" e um rótulo antes ("Se você começou com Chespin");
//       (b) BW: "Bianca usa:" numa célula e os times (um por inicial) nas células seguintes da linha, com os iniciais
//       na linha de cabeçalho; (c) BW Elite 4: linha com 4 "X usa:" vazios e os times na linha de baixo, mesma coluna;
//       (d) B2W2: time normal numa célula e "Challenge Mode:" (sem "usa:") na célula ao lado.
//   • seções: <span style="text-decoration: underline;"><em>T</em></span> (XY/ORAS), <em><u>T</u></em> (maioria),
//     <u><em>T</em></u> (LA/BDSP) ou, raramente, "<p>LUMIOSE CITY<br />". "LUGAR – A BATALHA COM X" vira
//     { title: 'LUGAR', subtitle: 'A BATALHA COM X' }.
//   • insígnias: frases do texto ("Derrote-a e receba a Bug Badge", "receberá a Grass Badge", "ganhará a Gym Badge do
//     tipo inseto", "consiga mais uma insígnia"); SM usa carimbo de ilha (grand trial) e Z-Crystal (trial).

// ───────────────────────── utilidades ─────────────────────────

const ENT = { nbsp: ' ', amp: '&', quot: '"', lt: '<', gt: '>', apos: "'", hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/ /g, ' ');
}
const clean = (s) => decodeEntities(s).replace(/\s+/g, ' ').trim();
const stripTags = (s) => clean(s.replace(/<script[\s\S]*?<\/script>|<ins[\s\S]*?<\/ins>/gi, ' ').replace(/<[^>]+>/g, ' '));
/** Nome normalizado para agrupar lutas da mesma pessoa ("Calem/Serena", "Crasher Wake"). */
export const nameKey = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9/&]+/g, ' ').trim();

/** Trecho do artigo (entre "entry-content" e o fim dele); o resto da página é menu/barra lateral. */
export function contentRange(html) {
  const a = html.search(/class="entry-content/);
  const b = html.indexOf('.entry-content -->');
  return [a >= 0 ? a : 0, b > a ? b : html.length];
}

// Imagem de Pokémon: serebii …/pokemon/[small/]NNN[-forma].png ou B2W2 …/b2w2/sprites/bw[b]/NNN.png.
// Sprites de treinador (pokearth/trainers, /b2w2/t/NNN.gif, imgur, "vs01.png", "trainer08.png") NÃO casam.
// BW também usa sprites do pokemonelite2000 (via web.archive) e /conteudo/detonados/bw/NNN.gif; B2W2 /b2w2/s/NNN.gif;
// SV um shiny em serebii /Shiny/SV/new/NNN.png.
const MON_NUM = /(?:\/pokemon\/(?:small\/)?|\/sprites\/bwb?\/|\/detonados\/bw\/|\/b2w2\/s\/|\/Shiny\/[A-Za-z]+\/new\/|pokemonelite2000\.com\/(?:wp-content\/uploads\/\d{4}\/\d{2}|sprites\/bwf)\/)(\d{1,4})(?:-([a-z0-9]+))?\.(?:png|gif|jpe?g)/i;
// serebii /scarletviolet/: as imagens 906–1010 (Gen 9) seguem a numeração PRÓPRIA do serebii, não a nacional
// (954.png = Pawmi #921, 943.png = Revavroom/Starmobile #966, 1007.png = Toedscruel #949…). Nesses casos o nº
// fica de fora (dex: null, serebii: N) e a espécie tem que ser resolvida pelo nome.
const SEREBII_OWN_NUMBERING = (path, n) => /\/scarletviolet\//i.test(path) && n >= 906 && n <= 1010;
const MON_NAMED = /\/pokemon\/(?:small\/)?([a-z][a-z-]+)\.(?:png|gif)/i; // XY: chespin.png/fennekin.png/froakie.png
function monFromImg(tag) {
  const src = /\bsrc="([^"]+)"/i.exec(tag)?.[1];
  if (!src) return null;
  const path = src.split('?')[0];
  const m = MON_NUM.exec(path);
  if (m && SEREBII_OWN_NUMBERING(path, Number(m[1]))) return { dex: null, serebii: Number(m[1]), ...(m[2] && { form: m[2].toLowerCase() }) };
  if (m) return { dex: Number(m[1]), ...(m[2] && { form: m[2].toLowerCase() }) };
  const n = MON_NAMED.exec(path);
  if (n) return { dex: null, image: n[1].toLowerCase() };
  return null;
}

// ───────────────────────── tokenização ─────────────────────────

/**
 * Tokens do artigo: { t:'tag', name, close, at, end, raw } | { t:'mon', dex, form?, at, end } | { t:'text', text, at, end }.
 * Scripts/anúncios e comentários são pulados. Cada token sabe a célula de tabela (mais interna) em que está: `cell`.
 */
function tokenize(html) {
  const [start, stop] = contentRange(html);
  const re = /<script[\s\S]*?<\/script>|<ins\b[\s\S]*?<\/ins>|<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|[^<]+|</g;
  re.lastIndex = start;
  const toks = [];
  const tables = []; // { rows: [[cell]] }
  const stack = []; // tabelas abertas
  let m;
  while ((m = re.exec(html)) && m.index < stop) {
    const at = m.index, end = at + m[0].length;
    if (m[2]) {
      const name = m[2].toLowerCase(), close = m[1] === '/';
      const cur = stack.at(-1);
      if (name === 'table' && !close) { const t = { id: tables.length, rows: [] }; tables.push(t); stack.push(t); }
      else if (name === 'table' && close) stack.pop();
      else if (name === 'tr' && !close && cur) cur.rows.push([]);
      else if ((name === 'td' || name === 'th') && !close && cur) {
        if (!cur.rows.length) cur.rows.push([]);
        const row = cur.rows.at(-1);
        row.push({ table: cur.id, row: cur.rows.length - 1, col: row.length, from: toks.length + 1, to: null });
      } else if ((name === 'td' || name === 'th') && close && cur) {
        const c = cur.rows.at(-1)?.at(-1); if (c && c.to == null) c.to = toks.length;
      }
      const cell = currentCell(stack);
      if (name === 'img') {
        const mon = monFromImg(m[0]);
        toks.push(mon ? { t: 'mon', ...mon, at, end, cell } : { t: 'tag', name, close, at, end, raw: m[0], cell });
      } else toks.push({ t: 'tag', name, close, at, end, raw: m[0], cell });
    } else if (m[0][0] !== '<' || m[0] === '<') {
      const text = decodeEntities(m[0]);
      if (text.trim()) toks.push({ t: 'text', text, at, end, cell: currentCell(stack) });
    }
  }
  for (const t of tables) for (const r of t.rows) for (const c of r) if (c.to == null) c.to = toks.length;
  return { toks, tables };
}
function currentCell(stack) {
  const cur = stack.at(-1);
  const c = cur?.rows.at(-1)?.at(-1);
  return c && c.to == null ? c : null;
}

// ───────────────────────── seções ─────────────────────────

const HEADING_RES = [
  /<span style="text-decoration:\s*underline;?">\s*<em>([\s\S]{1,300}?)<\/em>\s*<\/span>/gi,
  /<em>\s*<u>([\s\S]{1,300}?)<\/u>\s*<\/em>/gi,
  /<u>\s*<em>([\s\S]{1,300}?)<\/em>\s*<\/u>/gi,
  /<p[^>]*>\s*([A-ZÀ-Ý][A-ZÀ-Ý’'&#;0-9]*(?: [A-ZÀ-Ý0-9’'&#;(),.\/–-]+)+)\s*<br/g, // "<p>LUMIOSE CITY<br />"
];
const isUpperHeading = (t) => {
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return letters.length >= 3 && letters.replace(/[^a-zà-ÿ]/g, '').length <= letters.length * 0.15;
};

/**
 * Seções na ordem da página: { title, subtitle, full, at, html }. "PRIVATE BEACH – A BATALHA COM NEMONA" →
 * title "PRIVATE BEACH", subtitle "A BATALHA COM NEMONA" (corte no 1º " – "). Só cabeçalhos em CAIXA ALTA contam
 * (sublinhado/itálico também aparece no meio do texto).
 */
export function parseModernSections(html) {
  const [start, stop] = contentRange(html);
  const seen = new Map();
  for (const re of HEADING_RES) {
    for (const m of html.slice(0, stop).matchAll(re)) {
      if (m.index < start) continue;
      const full = stripTags(m[1]);
      if (!full || !isUpperHeading(full) || /^\d+º /.test(full)) continue;
      if ([...seen.keys()].some((k) => Math.abs(k - m.index) < 40)) continue; // mesmo cabeçalho por dois padrões
      seen.set(m.index, full);
    }
  }
  const marks = [...seen].sort((a, b) => a[0] - b[0]);
  return marks.map(([at, full], i) => {
    const cut = full.indexOf(' – ');
    return {
      title: (cut > 0 ? full.slice(0, cut) : full).trim(),
      subtitle: cut > 0 ? full.slice(cut + 3).trim() : null,
      full, at, html: html.slice(at, marks[i + 1]?.[0] ?? stop),
    };
  });
}

// ───────────────────────── lutas ─────────────────────────

const ANCHOR = /(?:^|[\s>])((?:pode )?usam?)\s*:/gi;
const isAnchor = (text) => /(?:^|[\s>])(?:pode )?usam?\s*:/i.test(' ' + text); // sem /g: não mexe no lastIndex
const FORM_PREFIX = /^(Mega|Gigantamax|Dynamax|Alolan|Galarian|Hisuian|Paldean|Alpha|Primal)\s*(?=[A-Z])/;
const PLACEHOLDER = /\b(inicial|pok[eé]mon macaco|macaco|seu inicial)\b/i;

/** Nome do treinador: a última oração antes de "usa:" ("…estará à sua espera. Viola" → "Viola"; "Chili, que" → "Chili"). */
function trainerName(before) {
  let s = clean(before).replace(/[,;]?\s*que$/i, '').replace(/\s+e$/i, '');
  s = s.split(/(?<=[a-zà-ú)]{2}[.!?:])\s+/).pop().trim();
  if (/^[A-ZÀ-Ý]/.test(s) && s.split(' ').length <= 5) return s;
  // "Na 21ª batalha (…), Palmer aparece e" → última sequência de palavras com maiúscula
  const caps = s.match(/(?:[A-ZÀ-Ý][\w’'.-]*)(?:\s+(?:[A-ZÀ-Ý][\w’'.-]*|&|\/))*(?=[^A-ZÀ-Ý]*$)/);
  return caps ? caps[0].trim() : '';
}

/** "Floragato (Tera Grass)/Crocalor (Tera Fire) lv.22 (inicial com fraqueza ao seu)" → entrada do time. */
function parseEntry(mons, rawText) {
  const text = clean(rawText);
  const m = /^(.*?)\s*\blv\.?\s*(\d{1,3})\b(.*)$/i.exec(text);
  let speciesRaw = (m ? m[1] : text).replace(/[:\-–]\s*$/, '').trim();
  const level = m ? Number(m[2]) : null;
  const rest = m ? m[3].trim() : '';
  const e = { dex: null, species: '', level };
  // notas depois do nível
  const notes = {};
  const alt = /\(lv\.?\s*(\d+)\s+no ([^)]+)\)/i.exec(rest); if (alt) { notes.altLevel = Number(alt[1]); notes.altMode = alt[2].trim(); }
  const tera = /\(Tera ([A-Za-z]+)\)/.exec(rest) ?? /\(Tera ([A-Za-z]+)\)/.exec(speciesRaw); if (tera) notes.tera = tera[1];
  const ver = /\(em ([A-Z][\w ]+?)\)/.exec(rest); if (ver) notes.version = ver[1];
  const set = /^\[([^\]]+)\]\s*@\s*([^–-]+?)\s*[–-]\s*(.+)$/.exec(rest); if (set) Object.assign(notes, { ability: set[1], item: set[2].trim(), moves: set[3].split('/').map((x) => x.trim()) });
  if (rest && !alt && !tera && !ver && !set) notes.note = rest;
  // espécie(s)
  const names = speciesRaw.replace(/\s*\(Tera [A-Za-z]+\)/g, '').split(/\s*\/\s*|\s+ou\s+/).map((s) => s.trim()).filter(Boolean);
  const tags = new Set();
  const base = (n) => { let s = n, p; while ((p = FORM_PREFIX.exec(s))) { tags.add(p[1].toLowerCase()); s = s.slice(p[0].length); } return s.trim(); };
  const generic = PLACEHOLDER.test(speciesRaw) && !/^[A-Z]/.test(speciesRaw.trim());
  const dexes = [...new Set(mons.map((x) => x.dex))];
  if (generic) {
    Object.assign(e, { species: speciesRaw, placeholder: true, options: mons.map(({ dex, form, image }) => ({ dex, ...(form && { form }), ...(image && { image }) })) });
  } else if (names.length > 1 || dexes.length > 1) {
    // "Pikachu/Eevee", "Reshiram/Zekrom", "Sprigatito/Fuecoco/Quaxly": a espécie depende da versão/inicial
    e.species = names.map(base).join('/');
    e.options = (mons.length === names.length ? mons.map((x, i) => ({ dex: x.dex, ...(x.form && { form: x.form }), species: base(names[i]) })) : mons.map(({ dex, form }) => ({ dex, ...(form && { form }) })));
    if (dexes.length === 1 && dexes[0] != null) e.dex = dexes[0]; // mesma espécie, formas diferentes (Meowstic ♂/♀)
  } else {
    e.species = base(names[0] ?? '');
    if (dexes.length === 1) e.dex = dexes[0];
    const forms = [...new Set(mons.map((x) => x.form).filter(Boolean))];
    if (forms.length === 1) e.form = forms[0]; else if (forms.length > 1) e.forms = forms; // Silvally (-fire/-water/-grass)
  }
  if (mons.length === 1 && mons[0].serebii) { e.serebii = mons[0].serebii; e.dexByName = true; } // SV Gen 9
  if (tags.size) e.tags = [...tags];
  if (Object.keys(notes).length) e.notes = notes;
  return e;
}

const STOP_TAGS = new Set(['td', 'th', 'tr', 'table', 'tbody', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
/**
 * Lê o time a partir do token `i`: imagens de Pokémon + "Espécie lv.N", atravessando <br>, <p>, <span>…
 * Para em fim de célula/tabela, no próximo "usa:" ou no primeiro texto que não é linha de time.
 * Texto curto ANTES do 1º Pokémon vira rótulo ("Challenge Mode:", "Tower Tycoon Palmer", "(obs.: …)").
 */
function readParty(toks, i, limit = toks.length) {
  const party = [], labels = [];
  let pending = [], last = i;
  for (; i < limit; i++) {
    const k = toks[i];
    if (k.t === 'tag') { if (STOP_TAGS.has(k.name)) break; continue; }
    if (k.t === 'mon') { pending.push(k); continue; }
    const text = clean(k.text);
    if (!text) continue;
    if (isAnchor(text)) break;
    // "lv." no meio de uma frase do texto ("…pokémons beirando o lv.60") não é linha de time: sem imagem antes, o
    // trecho antes do nível tem que ser curto e começar com maiúscula (nome de espécie)
    const pre = /^(.*?)\s*\blv\.?\s*\d/i.exec(text)?.[1];
    const hasLv = pre != null && (pending.length ? pre.length <= 80 : pre.length <= 30 && pre.split(' ').length <= 4 && pre.split(' ').every((w) => /^[A-ZÀ-Ý(]/.test(w)));
    if (hasLv || (pending.length && text.length <= 60 && !/[.!?]$/.test(text))) {
      // um texto pode ter mais de um Pokémon ("Corphish lv.12 e Pikachu lv.14") — raro; separa pelos níveis
      const parts = hasLv ? text.split(/(?<=\blv\.?\s*\d{1,3}(?:\s*\([^)]*\))*)\s*(?:,|\be\b)\s+(?=[A-Z])/) : [text];
      parts.forEach((p, j) => party.push(parseEntry(j === 0 ? pending : [], p)));
      pending = []; last = i;
      continue;
    }
    if (/^(ou|e|\/|,)$/i.test(text)) continue;
    if (!party.length && text.length <= 90) { labels.push(text.replace(/:$/, '')); continue; }
    break;
  }
  return { party, labels, end: last };
}

/** Texto de uma célula antes de `upTo` (rótulo da variante: "Se você começou com Chespin", "Challenge Mode"). */
function cellLabel(toks, cell, upTo) {
  const parts = [];
  for (let i = cell.from; i < Math.min(upTo, cell.to); i++) if (toks[i].t === 'text') parts.push(clean(toks[i].text));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
const cellHasAnchor = (toks, c) => { for (let i = c.from; i < c.to; i++) if (toks[i].t === 'text' && isAnchor(toks[i].text)) return true; return false; };
const cellHasLv = (toks, c) => { for (let i = c.from; i < c.to; i++) if (toks[i].t === 'text' && /\blv\.?\s*\d/i.test(toks[i].text)) return true; return false; };
const cellHasMon = (toks, c) => { for (let i = c.from; i < c.to; i++) if (toks[i].t === 'mon') return true; return false; };

/**
 * Lutas "<nome> usa:" na ordem da página:
 *   { name, at, endAt, section, subtitle,
 *     party:[{dex, form?, forms?, species, level, placeholder?, options?, tags?, notes?, serebii?, dexByName?}],
 *     placeholders, teams:[{label, party}], variant, group, note, context, after,
 *     nameCount, seenBefore, prevKind, rivalName, badgeAfter, kind, kindBy? }
 * • party = teams[0].party; teams > 1 quando a MESMA âncora tem times alternativos (células vizinhas sem "usa:":
 *   um por inicial no BW, "Challenge Mode" no B2W2).
 * • variant = rótulo antes da âncora na célula ("Se você começou com Chespin", "20ª BATALHA SINGLE BATTLE");
 *   group = id compartilhado pelas âncoras do mesmo nome na mesma tabela (o mesmo combate em variantes).
 * • placeholders = Pokémon do time sem espécie única (inicial genérico "inicial evoluído", "Pikachu/Eevee",
 *   "Reshiram/Zekrom"): vêm com `options` [{dex, species?}]. dexByName = nº de imagem não confiável (SV Gen 9).
 * • notes: altLevel/altMode ("(lv.43 no Challenge Mode)"), tera, version ("(em Sword)"), ability/item/moves, note.
 * • tags: prefixos de forma tirados do nome (mega, gigantamax, dynamax, alolan, galarian, hisuian, paldean, alpha).
 * • âncoras sem time nenhum (cabeçalho "Shauna usa:" antes da tabela por inicial) são descartadas.
 * • kind = classifyBattle(...); kindBy diz quando veio de regra de pós-processamento ('nome', 'depois da Elite').
 * • Limites: não distingue aliado de adversário em batalha em dupla ("junte-se a Cheren… Cheren usa:" no B2W2).
 */
export function parseModernBattles(html) {
  const { toks, tables } = tokenize(html);
  const sections = parseModernSections(html);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.t !== 'text') continue;
    ANCHOR.lastIndex = 0;
    const src = ' ' + k.text;
    let m;
    while ((m = ANCHOR.exec(src))) {
      const before = src.slice(0, m.index + (m[0][0] === '>' ? 1 : 0));
      // nome: texto antes de "usa:" no mesmo token; se vazio ("<span>Hau</span> usa:"), o token de texto anterior
      let name = trainerName(before);
      if (!name) for (let j = i - 1; j >= Math.max(0, i - 3); j--) if (toks[j].t === 'text') { name = trainerName(toks[j].text); break; }
      const tail = clean(src.slice(m.index + m[0].length)); // "(obs.: Mai usará os três ao mesmo tempo)"
      const anchorAt = k.at + Math.max(0, src.indexOf(m[0], m.index) - 1);
      const r = readParty(toks, i + 1);
      const cell = k.cell;
      const teams = [];
      let lastTok = r.end;
      if (r.party.length) teams.push({ label: r.labels.join(' ') || null, party: r.party });
      if (cell) {
        const table = tables[cell.table];
        const row = table.rows[cell.row];
        // células à direita sem "usa:" mas com Pokémon → times alternativos desta âncora
        for (let c = cell.col + 1; c < row.length; c++) {
          const sib = row[c];
          if (cellHasAnchor(toks, sib)) break;
          if (!cellHasMon(toks, sib)) continue;
          const rr = readParty(toks, sib.from, sib.to);
          if (rr.party.length) lastTok = Math.max(lastTok, rr.end);
          const head = table.rows[0] !== row ? table.rows[0][c] : null;
          // rótulo da coluna (BW: "Snivy"/"Tepig"/"Oshawott" na 1ª linha)
          const headLabel = head && !cellHasAnchor(toks, head) && !cellHasLv(toks, head) ? cellLabel(toks, head, head.to) : '';
          if (rr.party.length) teams.push({ label: rr.labels.join(' ') || headLabel || null, party: rr.party });
        }
        // linha de cabeçalho só com "X usa:" (BW Elite 4) → time na linha de baixo, mesma coluna
        if (!teams.length && row.every((c) => cellHasAnchor(toks, c))) {
          const below = table.rows[cell.row + 1]?.[cell.col];
          if (below && !cellHasAnchor(toks, below)) { const rr = readParty(toks, below.from, below.to); if (rr.party.length) { teams.push({ label: null, party: rr.party }); lastTok = Math.max(lastTok, rr.end); } }
        }
      }
      if (!teams.length) continue; // cabeçalho sem time
      const sec = [...sections].reverse().find((s) => s.at <= anchorAt);
      out.push({
        name, at: anchorAt, section: sec?.title ?? null, subtitle: sec?.subtitle ?? null,
        party: teams[0].party, teams,
        placeholders: teams[0].party.filter((p) => p.placeholder || p.options).length,
        variant: cell ? cellLabel(toks, cell, i) .replace(new RegExp(`${escapeRe(name)}\\s*$`), '').trim() || null : null,
        note: tail || null,
        tableCell: cell ? `${cell.table}:${cell.row}:${cell.col}` : null,
        endAt: toks[lastTok]?.end ?? k.end,
      });
    }
  }
  // grupos: mesma pessoa na mesma tabela = variantes do mesmo combate
  const groups = new Map();
  out.forEach((b, idx) => {
    const tkey = b.tableCell ? b.tableCell.split(':')[0] : null;
    const key = tkey != null ? `${tkey}|${nameKey(b.name)}` : `solo${idx}`;
    if (!groups.has(key)) groups.set(key, groups.size);
    b.group = groups.get(key);
  });
  // contexto: texto antes (desde o fim da luta anterior, últimos 600 caracteres de TEXTO) e depois (até a próxima
  // luta, máx. 900); dentro de uma mesma tabela o contexto é o da 1ª célula (o texto antes da tabela)
  const tableOf = (b) => b.tableCell?.split(':')[0] ?? null;
  out.forEach((b, i) => {
    let j = i;
    while (j > 0 && tableOf(b) != null && tableOf(out[j - 1]) === tableOf(b)) j--;
    const from = Math.max(j > 0 ? out[j - 1].endAt : 0, b.at - 30000);
    b.context = stripTags(html.slice(from, b.at + 1)).slice(-600);
    const nextAt = out.slice(i + 1).find((x) => x.group !== b.group)?.at ?? html.length;
    b.after = stripTags(html.slice(b.endAt, Math.min(nextAt, b.endAt + 1500))).slice(0, 900);
  });
  // contagem de COMBATES (grupos) por nome, para a regra do rival
  const byName = new Map();
  for (const b of out) { const k = nameKey(b.name); if (!byName.has(k)) byName.set(k, new Set()); byName.get(k).add(b.group); }
  const badges = parseBadgeEvents(html, out);
  const rivalNames = rivalNameSet(out, byName);
  const seen = new Map(); // nome → 1º grupo
  const role = new Map(); // nome → 1º papel ≠ 'other' já atribuído (lutas em ordem da página)
  for (const b of out) {
    const nk = nameKey(b.name);
    if (!seen.has(nk)) seen.set(nk, b.group);
    b.seenBefore = seen.get(nk) !== b.group; // o nome já lutou antes (seção "ELITE 4…" também tem N/Ghetsis)
    b.prevKind = b.seenBefore ? role.get(nk) ?? null : null;
    b.nameCount = byName.get(nk).size;
    b.rivalName = rivalNames.has(nk);
    const nextAt = out.find((x) => x.at > b.at && x.group !== b.group)?.at ?? Infinity;
    b.badgeAfter = badges.find((e) => e.at > b.at && e.at < nextAt && e.at - b.endAt < 2500) ?? null;
    b.kind = classifyBattle(b, b.section, `${b.context} ¦ ${b.after}`);
    if (b.kind !== 'other' && !role.has(nk)) role.set(nk, b.kind);
  }
  // Lutas 'other' herdam o 1º papel não-'other' do mesmo nome (revanche/tabela pós-jogo sem texto: "Grant usa:" no
  // Battle Chateau; 2ª luta de Lysandre). Não sobrescreve papel já dado pelo texto (Hala: kahuna → Elite no SM).
  const firstRole = new Map();
  for (const b of out) { const k = nameKey(b.name); if (b.kind !== 'other' && !firstRole.has(k)) firstRole.set(k, b.kind); }
  for (const b of out) if (b.kind === 'other' && firstRole.has(nameKey(b.name))) { b.kind = firstRole.get(nameKey(b.name)); b.kindBy = 'nome'; }
  // Campeão sem a palavra "campeão" perto (BW: Alder): na mesma seção, a 1ª luta logo depois de 4 nomes 'elite'
  // distintos, se não for rival/líder, é o campeão.
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (b.kind !== 'elite' || b.rivalName) continue;
    const elites = new Set(out.slice(0, i).filter((x) => x.section === b.section && x.kind === 'elite').map((x) => nameKey(x.name)));
    if (elites.size >= 4 && !elites.has(nameKey(b.name)) && !out.slice(0, i).some((x) => x.section === b.section && x.kind === 'champion')) { b.kind = 'champion'; b.kindBy = 'depois da Elite'; }
  }
  for (const b of out) delete b.tableCell;
  return out;
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Nomes de rival: algum combate do nome tem "rival" no texto logo antes (ou no próprio nome: "Seu rival"), ou o nome
 * tem ≥ 3 combates e algum deles depende do inicial (Pokémon "inicial…" genérico ou variante "Se você começou com").
 * (Só repetição não basta: Giovanni, Guzma, Zinzolin, Volo, Ingo… também repetem.)
 */
function rivalNameSet(battles, byName) {
  const set = new Set();
  for (const b of battles) {
    const k = nameKey(b.name);
    const near = b.context.slice(-350);
    const firstName = b.name.split(/[\/ ]/)[0];
    // "seu rival Hugh", "Hugh, seu rival", "rival, Hugh" — não "Passando pelo seu rival, você verá que Cheren…"
    const fn = escapeRe(firstName);
    const mentions = new RegExp(`\\brival,?\\s+(?:\\S+\\s+){0,2}${fn}\\b|\\b${fn},?\\s+(?:\\S+\\s+){0,3}rival\\b`, 'i').test(near);
    // Pokémon genérico "inicial…" (o inicial do rival) ou "(inicial com fraqueza ao seu)" depois do nível
    const generic = b.teams.some((t) => t.party.some((p) => p.placeholder || (p.options && /inicial/i.test(p.notes?.note ?? ''))));
    // variante por inicial (o campeão/diretor também tem): "Se você começou com…" ou ≥ 3 times alternativos (BW)
    const byStarter = /come[çc]ou com/i.test(b.variant ?? '') || b.teams.length >= 3;
    if (/\brival\b/i.test(b.name) || mentions || (generic && byName.get(k).size >= 2) || (byStarter && byName.get(k).size >= 3)) set.add(k);
  }
  return set;
}

// ───────────────────────── insígnias ─────────────────────────

const VERB = String.raw`(?:[Rr]eceb\w*|[Gg]anh\w*|[Cc]onsig\w*|[Cc]onquist\w*|[Oo]bt[eé]\w*|[Ee]ntreg\w*|[Pp]egue|[Pp]egar|[Dd]ar[áa]|[Ff]icar com)`;
const BADGE_RES = [
  // "receba a Bug Badge", "insígnia Boulder Badge", "ganhará a Gym Badge do tipo inseto", "Titan Badge", "Star Badge"
  { kind: 'badge', re: new RegExp(String.raw`${VERB}[^.!?]{0,40}?\b((?:[A-Z][a-z]+ )?[A-Z][a-z]+ Badge)\b(?! d[eo]st[ae])(?: do tipo ([a-zà-ú]+))?`, 'g') },
  // BW/B2W2/BDSP não dão nome: "consiga mais uma insígnia", "consiga sua última insígnia", "Conquiste a insígnia e…"
  { kind: 'insignia', re: new RegExp(String.raw`\b${VERB}\s+(?:a\s+|à\s+)?(?:sua\s+)?(mais uma|última|primeira|\d+ª)?\s*insígnia\b(?!s)(?! d[eo]st[ae]| dess[ae])`, 'gi') },
  // SM: carimbo da ilha (grand trial) e Z-Crystal (trial)
  { kind: 'stamp', re: /\bconseguir[áa] o carimbo d[ao] ([A-Z][\w’']+ Island)/g },
  { kind: 'trial', re: new RegExp(String.raw`${VERB}[^.!?]{0,30}?\b([A-Z][a-z]+ium Z)\b`, 'g') },
];
// ("Quando vencer, receba…" é afirmativo; só "quando conseguir…" — quando + o próprio verbo — é futuro)
const NEG_BEFORE = /(\b(sem|antes de|at[ée] que|precisa\w*|dev\w+|poder[áa]|pr[óo]xima|todas)\b[^.!?]{0,25}|\bquando\s+)$/i;

/** Texto do artigo com mapa de posições (índice no texto → posição no HTML). */
function textWithMap(html) {
  const { toks } = tokenize(html);
  let text = '';
  const map = [];
  for (const k of toks) {
    if (k.t === 'tag' && /^(p|br|td|tr|div|li|h\d)$/.test(k.name)) { text += ' '; map.push(k.at); continue; }
    if (k.t !== 'text') continue;
    const piece = k.text.replace(/\s+/g, ' ');
    for (let j = 0; j < piece.length; j++) map.push(k.at); // posição do token (suficiente para ordenar)
    text += piece;
  }
  return { text, map };
}

/**
 * Eventos de insígnia na ordem do texto: { at, badge, kind, type?, ordinal?, text, leaderHint? }.
 *   kind: 'gym' (Badge com nome ou "Gym Badge"), 'titan', 'star' (SV), 'insignia' (sem nome: BW/B2W2/BDSP),
 *         'stamp' (carimbo de ilha do SM = grand trial), 'trial' (Z-Crystal do SM).
 * Descarta menções no futuro/condicionais ("sem conquistar a insígnia desta cidade", "a próxima insígnia") e
 * repetições do mesmo evento em ≤ 1500 caracteres ("Ela vai notar que você conseguiu a Star Badge desta base").
 * leaderHint = nome da última luta "usa:" antes do evento (até 4000 caracteres antes).
 */
export function parseBadgeEvents(html, battles = null) {
  const { text, map } = textWithMap(html);
  const events = [];
  for (const { kind, re } of BADGE_RES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (NEG_BEFORE.test(text.slice(Math.max(0, m.index - 40), m.index))) continue;
      const ev = { at: map[m.index], text: m[0].trim() };
      if (kind === 'badge') {
        const b = m[1];
        ev.kind = /^Titan Badge/.test(b) ? 'titan' : /^Star Badge/.test(b) ? 'star' : 'gym';
        ev.badge = b + (m[2] ? ` do tipo ${m[2]}` : '');
        if (m[2]) ev.type = m[2];
      } else if (kind === 'insignia') { ev.kind = 'insignia'; ev.badge = null; if (m[1]) ev.ordinal = m[1]; }
      else { ev.kind = kind; ev.badge = m[1]; }
      events.push(ev);
    }
  }
  events.sort((a, b) => a.at - b.at);
  const out = [];
  for (const e of events) {
    const dup = out.find((o) => o.kind === e.kind && e.at - o.at < 1500 && (o.badge === e.badge || (e.badge && !e.type && (o.badge ?? '').startsWith(e.badge + ' '))));
    if (dup && e.kind !== 'insignia') continue;
    if (dup && e.kind === 'insignia' && e.at - dup.at < 600) continue;
    // "Consiga a insígnia Boulder Badge" casa os dois padrões: fica só o com nome
    if (e.kind === 'insignia' && events.some((o) => o.kind !== 'insignia' && o.kind !== 'trial' && Math.abs(o.at - e.at) < 300)) continue;
    out.push(e);
  }
  const bs = battles ?? parseModernBattles(html);
  for (const e of out) {
    const prev = [...bs].reverse().find((b) => b.at < e.at && e.at - b.at < 4000);
    if (prev) e.leaderHint = prev.name;
  }
  return out;
}

// ───────────────────────── classificação ─────────────────────────

const TEAM_WORDS = /\b(Equipe|Team|Rocket|Plasma|Flare|Magma|Aqua|Skull|Aether|Galactic|Yell|Star|Macro Cosmos|Neo)\b/;
/**
 * Papel da luta usando só as palavras da página (regras na ordem; a 1ª que casa vence):
 *  0. 'leader'   — evento de insígnia de ginásio (Badge/insígnia sem nome/carimbo de ilha do SM) logo depois do time,
 *     antes da próxima luta.
 *  1. 'champion' — "campeão/campeã/champion" nos 300 caracteres de texto antes da luta (exceto "tornou-se campeão",
 *     "Hall of Fame", "defenda o título"), ou CAMPEÃO no título da seção na 1ª luta do nome.
 *  2. 'elite'    — "Elite 4 / Elite dos Quatro / membro(s) da elite" no texto antes (≤ 400), menos "após derrotar a
 *     Elite 4…"; não vale para rival nem com Equipe/Team logo antes.
 *  3. 'leader'   — Z-Crystal (trial do SM) depois; ou "líder" (não "líder da Equipe/Team") / "kahuna" / "ginásio" nos
 *     350 caracteres antes, se não for rival.
 *  4. 'rival'    — o nome é de rival (rivalNameSet: "rival" perto do nome; Pokémon "inicial" genérico em ≥ 2 combates;
 *     variantes por inicial em ≥ 3 combates).
 *  5. 'boss'     — evento Star Badge depois (chefes da Team Star); chefe/boss/admin/comandante ou nome de equipe vilã
 *     (Equipe/Team/Rocket/Plasma/Flare/…) no nome ou nos 200 caracteres antes.
 *  6. 'elite'    — seção com ELITE / LIGA POKÉMON no título, só na 1ª luta do nome (a seção "ELITE 4 E O N'S CASTLE"
 *     do BW também tem N e Ghetsis, que já lutaram antes).
 *  7. 'other'.
 * Depois, em parseModernBattles: 'other' herda o 1º papel do mesmo nome, e a 1ª luta não-rival depois de 4 nomes
 * 'elite' na mesma seção vira 'champion'. A ordem dos líderes deve usar só a 1ª aparição de cada nome.
 */
// (\b do JS não entende acento: "campeão\b" falha antes de espaço → fim de palavra = (?![\wÀ-ÿ]))
const END = '(?![\\wÀ-ÿ])';
const CHAMP = new RegExp(`\\bcampe(?:ão|ã|ões)${END}|\\bchampion\\b(?! cup)`, 'i'); // "Champion Cup" é o torneio
const CHAMP_NOT = /hall of fame|voc[êe] (é|era|for|se tornou) (o |a )?(nov[oa] )?campe|tornou(-se)? (o |a )?(primeir[oa] )?campe|tornar(á|-se)? (o |a )?(primeir[oa] )?campe|defend\w* (o )?(seu )?t[íi]tulo/i;
const ELITE = /\belite ?(4|dos quatro|four)\b|\bmembros? da elite\b/gi;
const ELITE_PAST = /\b(derrot\w*|venc\w*|após|depois d\w*|passar pel\w*|n[ãa]o (tem|temos|h[áa]|existe))\s+(\S+\s+){0,3}$/i; // "Após derrotar a Elite 4…"
const BOSS = new RegExp(`\\b(chefe|chefão|boss|admin|comandante|commander)${END}`, 'i');
export function classifyBattle(b, sectionTitle = '', textAround = '') {
  const [beforeRaw] = String(textAround).split(' ¦ ');
  const before = (b.context ?? beforeRaw ?? '').slice(-400);
  const near = before.slice(-350);
  const title = `${sectionTitle ?? ''} ${b.subtitle ?? ''}`;
  const name = b.name ?? '';
  const ev = b.badgeAfter;
  const league = /\bELITE\b|LIGA POKÉMON|POKÉMON LEAGUE/.test(title) && !/L[ÍI]DERES DE GIN[ÁA]SIO/.test(title);
  const champTitle = /\bCAMPE(ÃO|Ã)(?![A-ZÀ-Ý])|\bCHAMPION\b(?! CUP)/.test(title) && !/ELITE|DEFEND|T[ÍI]TULO/.test(title);
  const bossWords = (s) => BOSS.test(s) || TEAM_WORDS.test(s);
  if (ev && (ev.kind === 'gym' || ev.kind === 'insignia' || ev.kind === 'stamp')) return 'leader';
  const cm = b.teams?.some((t) => /challenge mode/i.test(t.label ?? '')); // B2W2: só líder/Elite/campeã têm time CM à parte
  if (cm && !league) return 'leader';
  const b300 = before.slice(-300);
  if (CHAMP.test(b300) && !CHAMP_NOT.test(b300)) return 'champion';
  if (champTitle && !b.rivalName && !b.seenBefore) return 'champion';
  // continuidade: revanche/tabela pós-jogo fora da Liga mantém o papel anterior do nome (o texto de tabelas como o
  // Battle Chateau do XY fala de "líderes" e "elite 4" ao mesmo tempo)
  if (b.prevKind && !league && !champTitle) return b.prevKind;
  const eliteText = [...before.matchAll(ELITE)].some((m) => !ELITE_PAST.test(before.slice(Math.max(0, m.index - 40), m.index)));
  if (eliteText && !b.rivalName && !TEAM_WORDS.test(near.slice(-200))) return 'elite';
  if (league && !b.rivalName && (!b.seenBefore || b.prevKind === 'leader' || b.prevKind === 'elite') && !bossWords(near.slice(-200))) return 'elite';
  // "o líder" / "a líder do ginásio" perto (≤ 150 caracteres); não "líder da Equipe/Team/do metrô/do clã"
  const n150 = near.slice(-150);
  if ((/\bl[íi]der(es)?\b(?! (?:d[aoe]s?|dest[ae]s?|dess[ae]s?) (?!gin[áa]sio|tipo))/i.test(n150) || /\bkahuna\b/i.test(n150)) && !b.rivalName) return 'leader';
  if (b.rivalName) return 'rival';
  if (ev && ev.kind === 'star') return 'boss';
  if (bossWords(`${name} ${near.slice(-200)}`)) return 'boss';
  return 'other';
}
