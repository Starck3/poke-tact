// Liga uma linha de script (ex.: "giveitem_msg …, ITEM_TM39") ao EVENTO do mapa que a executa (NPC/objeto/sinal/gatilho),
// com posição x,y — seguindo goto/call/trainerbattle e a "queda" para o rótulo seguinte quando o bloco não termina.
// Assim a posição de cada TM/HM vem do próprio decomp, sem adivinhar o mapa pelo nome do rótulo.

/** Blocos "Rótulo::" de um arquivo .inc: { label -> { lines, next } } */
export function parseBlocks(text) {
  const blocks = new Map();
  let cur = null;
  let prev = null;
  for (const raw of text.split('\n')) {
    const m = raw.match(/^(\w+)::?\s*(?:@.*)?$/); // pokeruby: "Rotulo:: @ 8153065"
    if (m) {
      cur = { label: m[1], lines: [], next: null };
      if (prev) prev.next = cur.label;
      blocks.set(cur.label, cur);
      prev = cur;
      continue;
    }
    if (cur) cur.lines.push(raw.trim());
  }
  return blocks;
}

const TERMINAL = /^(end|return|goto \w+|releaseall\s*$|release\s*$)\b/;

/** Rótulos alcançáveis a partir de `start` (dentro do mesmo arquivo). */
export function reachable(blocks, start, { fallthrough = true } = {}) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const l = stack.pop();
    if (seen.has(l) || !blocks.has(l)) continue;
    seen.add(l);
    const b = blocks.get(l);
    for (const line of b.lines) for (const tok of line.split(/[\s,]+/)) if (blocks.has(tok)) stack.push(tok);
    const last = b.lines.filter((x) => x && !x.startsWith('@')).at(-1) ?? '';
    if (fallthrough && b.next && !TERMINAL.test(last)) stack.push(b.next); // sem "end": cai no próximo rótulo
  }
  return seen;
}

/** Rótulo que contém a linha `index` (posição no texto). */
export function labelAt(text, index) {
  const before = text.slice(0, index);
  const m = [...before.matchAll(/^(\w+)::?\s*(?:@.*)?$/gm)].at(-1);
  return m?.[1] ?? null;
}

const TITLE = (s) => s.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
export function describeGfx(gfx) {
  const g = String(gfx ?? '').replace(/^OBJ_EVENT_GFX_/, '');
  if (g === 'ITEM_BALL') return 'item no chão';
  return TITLE(g);
}

/** Eventos do map.json cujo script alcança `targetLabel`. Retorna [{kind, x, y, by, script}]. */
export function eventsReaching(mapJson, blocks, targetLabel) {
  const out = [];
  const evs = [
    ...(mapJson.object_events ?? []).map((e) => ({ kind: 'object', ...e })),
    ...(mapJson.coord_events ?? []).map((e) => ({ kind: 'coord', ...e })),
    ...(mapJson.bg_events ?? []).map((e) => ({ kind: 'bg', ...e })),
  ];
  for (const e of evs) {
    if (!e.script || !blocks.has(e.script)) continue;
    if (reachable(blocks, e.script).has(targetLabel)) out.push({ kind: e.kind, x: e.x, y: e.y, by: e.kind === 'object' ? describeGfx(e.graphics_id) : e.kind === 'coord' ? 'gatilho no chão' : 'placa/objeto', script: e.script });
  }
  return out;
}
