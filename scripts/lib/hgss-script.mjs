// Leitor dos scripts de mapa do HGSS (files/fielddata/script/scr_seq/*.s) com os desvios por VERSÃO resolvidos.
// O jogo decide HG × SS com "GetGameVersion VAR / Compare VAR, 7|8 / GoToIfEq|GoToIfNe|CallIfEq|CallIfNe _L"
// (include/config.h: VERSION_HEARTGOLD 7, VERSION_SOULSILVER 8). Os demais desvios ficam abertos (os dois lados contam).
// reachable(versão) → índices das linhas alcançáveis a partir dos rótulos de entrada (ScrDef).
export const VERSION_ID = { heartgold: 7, soulsilver: 8 };

export function parseScript(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const labels = {};
  lines.forEach((l, i) => { const m = l.match(/^(\w+):$/); if (m) labels[m[1]] = i; });
  const entries = [...text.matchAll(/^\s*ScrDef (\w+)/gm)].map((m) => m[1]).filter((l) => labels[l] != null);
  const memo = {};
  const reachable = (version) => {
    if (memo[version]) return memo[version];
    const ver = VERSION_ID[version];
    const seen = new Set();
    const stack = entries.map((l) => labels[l]);
    while (stack.length) {
      let i = stack.pop();
      let verVar = null, cmp = null;
      while (i < lines.length && !seen.has(i)) {
        seen.add(i);
        const l = lines[i];
        let m;
        if ((m = l.match(/^GetGameVersion (\w+)/))) { verVar = m[1]; i++; continue; }
        if ((m = l.match(/^Compare (\w+), (\d+)$/))) { cmp = m[1] === verVar ? Number(m[2]) : null; i++; continue; }
        if ((m = l.match(/^(GoTo|Call)If(Eq|Ne) (\w+)$/)) && cmp != null) {
          const take = m[2] === 'Eq' ? ver === cmp : ver !== cmp;
          cmp = null;
          if (take) { if (labels[m[3]] != null) stack.push(labels[m[3]]); if (m[1] === 'GoTo') break; }
          i++; continue;
        }
        cmp = null;
        if (verVar && l.includes(verVar)) verVar = null; // a variável foi reaproveitada (outro comando escreveu nela)
        if ((m = l.match(/^GoTo (\w+)$/))) { if (labels[m[1]] != null) stack.push(labels[m[1]]); break; }
        if ((m = l.match(/^(?:Call|GoToIf\w*|CallIf\w*|Case \S+,) .*?(\w+)$/)) && labels[m[1]] != null) stack.push(labels[m[1]]);
        if (/^(End|Return|ScrDefEnd)$/.test(l)) break;
        i++;
      }
    }
    return (memo[version] = seen);
  };
  // valores atribuídos a uma variável nas linhas alcançáveis: "SetVar|SetOrCopyVar VAR, X"
  const valuesOf = (version, v) => { const r = reachable(version); return lines.flatMap((l, i) => { if (!r.has(i)) return []; const m = l.match(new RegExp(`^(?:SetVar|SetOrCopyVar) ${v}, (\\w+)$`)); return m ? [m[1]] : []; }); };
  const matchAll = (version, re) => { const r = reachable(version); return lines.flatMap((l, i) => { if (!r.has(i)) return []; const m = l.match(re); return m ? [m] : []; }); };
  return { lines, labels, entries, reachable, valuesOf, matchAll };
}
