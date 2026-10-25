// Novidades do app: CHANGELOG.md → public/data/changelog.json (o sino no canto da tela lê daqui).
// Formato: [{ version, date, summary?, sections: [{ title, items: [html] }] }], da versão mais nova para a mais velha.
// Markdown mínimo do CHANGELOG: **negrito**, `código`, [texto](url); itens "- " com continuação indentada.
// Uso: node scripts/build-changelog.mjs   (roda também no fim do build-catalog)
import { readFileSync, writeFileSync } from 'node:fs';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Markdown de uma linha → HTML seguro (escapa antes de formatar). */
export function inline(md) {
  return esc(md)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/** CHANGELOG (Keep a Changelog) → versões com seções e itens. */
export function parseChangelog(md) {
  const out = [];
  let ver = null, sec = null, item = null;
  for (const line of md.split(/\r?\n/)) {
    const v = line.match(/^## \[([^\]]+)\](?:\s*[—-]\s*(\S+))?/);
    if (v) { ver = { version: v[1], date: v[2] ?? null, sections: [] }; out.push(ver); sec = item = null; continue; }
    if (!ver) continue;
    // "> resumo" logo abaixo do título: a versão em linguagem simples (o painel mostra primeiro; o resto em "Detalhes")
    const sm = !ver.sections.length && line.match(/^> (.+)/);
    if (sm) { ver.summary = inline(sm[1].trim()); continue; }
    const s = line.match(/^### (.+)/);
    if (s) { sec = { title: s[1].trim(), items: [] }; ver.sections.push(sec); item = null; continue; }
    const it = line.match(/^- (.*)/);
    if (it) { if (!sec) { sec = { title: 'Mudanças', items: [] }; ver.sections.push(sec); } item = { md: it[1] }; sec.items.push(item); continue; }
    if (item && /^\s+\S/.test(line)) { item.md += ' ' + line.trim(); continue; }
    if (!line.trim()) item = null;
  }
  for (const v of out) for (const s of v.sections) s.items = s.items.map((i) => inline(i.md.replace(/\s+/g, ' ').trim()));
  return out;
}

if (process.argv[1]?.endsWith('build-changelog.mjs')) {
  const versions = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
  writeFileSync(new URL('../public/data/changelog.json', import.meta.url), JSON.stringify(versions));
  console.log(`changelog.json: ${versions.length} versões (mais nova: ${versions[0]?.version})`);
}
