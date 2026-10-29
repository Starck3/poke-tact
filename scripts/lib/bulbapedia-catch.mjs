// Leitor das tabelas de captura das páginas de lugar da Bulbapedia ({{Catch/entry6|nº|espécie|X|Y|método|níveis|taxa}}),
// separado do apply-bulbapedia-rates (I3, PLANO-EXECUCAO-7) para ser testado com trechos de exemplo, sem rede.
import { plain } from './bulbapedia.mjs';
import { nameKey } from './names.mjs';

// clima da tabela da Bulbapedia → rótulo
export const WEATHER = { clear: 'tempo limpo', cloudy: 'nublado', rain: 'chuva', thunderstorm: 'tempestade', snow: 'neve', blizzard: 'nevasca', sun: 'sol forte', sandstorm: 'tempestade de areia', fog: 'neblina' };

// forma da tabela → sufixo do nome no app ("Alolan Form" → alola, "Average&nbsp;Size" → average)
export const formKey = (f) => nameKey(f.replace(/&nbsp;/g, ' ').replace(/\s+(Size|Form)$/i, '').replace(/^Alolan$/i, 'alola').replace(/^Galarian$/i, 'galar').replace(/^Hisuian$/i, 'hisui').replace(/^Paldean$/i, 'paldea'));
export const pctOf = (t) => { const m = String(t ?? '').trim().match(/^(~?)(\d+(?:\.\d+)?)%$/); return m ? { rate: Number(m[2]), approx: !!m[1] } : null; };

/**
 * Linhas de captura da página: [{ species, versions: [true, false], method, min, max, rate, approx, section, times?, weather?, form? }].
 * cfg: { entry: 'entry6', flags?: nº de colunas de versão (padrão nVersions), times?: ['dia', 'noite'], weather?: true,
 * skipRows?, skipDiv?, skipSection? } (o CFG de cada jogo no apply-bulbapedia-rates).
 */
export function catchRows(text, cfg, nVersions) {
  const out = [];
  // seção atual ({{catch/div|land|Swarm}}): linhas de uma seção pulada (cfg.skipDiv) ficam fora
  // e a seção da página (===[[Hidden encounter]]s===): tipo de encontro no Sword/Shield (cfg.sections)
  let div = '', section = '';
  for (const m of text.matchAll(new RegExp(`^={2,4}([^=\\n]+)={2,4}\\s*$|\\{\\{catch/div\\|[^|}]*\\|([^|}]*)\\}\\}|\\{\\{catch/header|\\{\\{Catch/${cfg.entry}\\|([^\\n]*)\\}\\}`, 'gim'))) {
    if (m[1] != null) { section = plain(m[1]); div = ''; continue; }
    if (m[3] == null) { div = m[2] ?? ''; continue; }
    if (cfg.skipDiv?.test(div) || cfg.skipSection?.test(section)) continue;
    const parts = m[3].split('|');
    const named = Object.fromEntries(parts.filter((x) => /^\w+=/.test(x)).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
    const [, species, ...rest] = parts.filter((x) => !/^\w+=/.test(x));
    const flags = rest.slice(0, nVersions), [method, levels, ...rates] = rest.slice(cfg.flags ?? nVersions);
    if (cfg.skipRows?.test(String(method ?? '').trim())) continue;
    const lv = String(levels ?? '').match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
    // taxa: uma coluna; ou uma por período ("-"/"0%" = não aparece nesse período); ou all=
    let r = named.all ? pctOf(named.all) : pctOf(rates[0]), times = null;
    if (cfg.times && !named.all) {
      const ps = cfg.times.map((_, i) => pctOf(rates[i]));
      const nums = ps.map((p) => p?.rate ?? 0);
      r = ps.some(Boolean) ? { rate: Math.max(...nums), approx: ps.some((p) => p?.approx) } : null;
      if (r && new Set(nums).size > 1) times = Object.fromEntries(cfg.times.map((t, i) => [t, nums[i]])); // { dia: 0, noite: 30 }
    }
    // clima (Sword/Shield): "cloudy=40%|rain=5%" — a taxa de cada clima em que aparece (os outros: não aparece)
    let weather = null;
    if (cfg.weather) {
      const ws = Object.keys(WEATHER).filter((w) => pctOf(named[w]));
      if (ws.length) { weather = Object.fromEntries(ws.map((w) => [w, pctOf(named[w]).rate])); r = { rate: Math.max(...Object.values(weather)), approx: ws.some((w) => pctOf(named[w]).approx) }; }
    }
    if (!lv || !r || !method) continue;
    out.push({ species: nameKey(species), versions: flags.map((x) => x === 'yes'), method: method.trim(), min: Number(lv[1]), max: Number(lv[2] ?? lv[1]), rate: r.rate, approx: r.approx, section, ...(times && { times }), ...(weather && { weather }), ...(named.form && { form: formKey(named.form) }) });
  }
  return out;
}
