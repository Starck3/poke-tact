// Leitor dos scripts de mapa do Diamond/Pearl (pret/pokediamond): no decomp eles são BYTECODE
// (files/fielddata/script/scr_seq_release/narc_NNNN.bin), sem fonte em texto. Sem rede.
//
// Tamanho dos argumentos de cada comando: tirado do PRÓPRIO código do DP —
//   arm9/asm/unk_02038C78.s  gScriptCmdTable: a função de cada comando (índice = número do comando, 721 ao todo)
//   arm9/src/*.c             corpo da função: cada ScriptReadHalfword/ScriptGetVar/ScriptGetVarPointer lê 2 bytes,
//                            ScriptReadWord 4, ScriptReadByte 1
//   arm9/asm/*.s             funções ainda em assembly: "bl ScriptReadHalfword"/"bl ScriptReadWord" e o ScriptReadByte
//                            inline (soma 1 ao ponteiro em [ctx, #0x8])
// Comandos com leitura condicional ou por função auxiliar ficam em VARIABLE (regra conferida no código, abaixo).
// Validação: todo script tem de terminar em End/Return/GoTo e todo salto tem de cair no início de um comando
// (ver checkScripts) — um tamanho errado desalinha a leitura e aparece como erro.
//
// Formato do arquivo: lista de u32 (offset relativo ao fim do próprio campo) com o início de cada script, até o 1º script
// começar (alguns arquivos terminam a lista com 0xFD13); depois o bytecode: comando u16 + argumentos.
// Saltos (GoTo 0x16, Call 0x1A, GoToIf 0x1C, CallIf 0x1D): s32 relativo ao fim do próprio argumento.
import { readFileSync, readdirSync } from 'node:fs';

const READ = { ScriptReadHalfword: 2, ScriptGetVar: 2, ScriptGetVarPointer: 2, ScriptReadWord: 4, ScriptReadByte: 1 };

// Comandos cujo tamanho a contagem automática não resolve — cada regra conferida no código do DP:
//   0x1CF–0x1D1 ScrCmd_GetSetStrength/Flash/Defog (scrcmd.c): u8 opção; só a opção 2 (consultar) lê um ponteiro de variável
//   0x21D ScrCmd_UnionGroup (scrcmd.c): u16 opção 0–6; 0–3 leem 2 halfwords, 4–5 leem 1, 6 nenhum
//   0x235 ScrCmd_Unk0235 (asm): u16 subcomando 0–6 → tabela de saltos; casos leem 1,3,0,3,2,3,1 halfwords
//   0x237 ScrCmd_Unk0237 (asm): u16 subcomando; 0 e 1 leem mais 3 halfwords
//   0x23E ScrCmd_Unk023E (asm): u16 subcomando 0–8 → tabela; casos 1–3 leem 1 halfword, 5–6 leem 2
//   0x27C ScrCmd_Unk027C (asm): u16 subcomando; 0–2 leem mais 1 halfword
//   0x289 ScrCmd_Unk0289 (scrcmd.c): ponteiro de variável + 5 bytes num laço + 1 byte = 8 (a contagem vê o laço uma vez só)
const sub = (b, at) => b.readUInt16LE(at);
export const VARIABLE = {
  0x1cf: (b, at) => (b[at] === 2 ? 3 : 1), 0x1d0: (b, at) => (b[at] === 2 ? 3 : 1), 0x1d1: (b, at) => (b[at] === 2 ? 3 : 1),
  0x21d: (b, at) => 2 + 2 * ([2, 2, 2, 2, 1, 1, 0][sub(b, at)] ?? 0),
  0x235: (b, at) => 2 + 2 * ([1, 3, 0, 3, 2, 3, 1][sub(b, at)] ?? 0),
  0x237: (b, at) => 2 + (sub(b, at) <= 1 ? 6 : 0),
  0x23e: (b, at) => 2 + 2 * ([0, 1, 1, 1, 0, 2, 2, 0, 0][sub(b, at)] ?? 0),
  0x27c: (b, at) => 2 + (sub(b, at) <= 2 ? 2 : 0),
};
const FIXED = { 0x289: 8 };
export const CMD = { END: 0x02, GOTO: 0x16, CALL: 0x1a, RETURN: 0x1b, GOTOIF: 0x1c, CALLIF: 0x1d };

/** Tamanho (bytes de argumento) de cada comando do DP, pelo código do DP. Devolve { names, size, uncertain }. */
export function loadCommandSizes(rootUrl) {
  const read = (p) => readFileSync(new URL(p, rootUrl), 'utf8');
  const all = (dir, ext) => readdirSync(new URL(dir, rootUrl), { recursive: true }).filter((f) => f.endsWith(ext)).map((f) => read(dir + f.replace(/\\/g, '/'))).join('\n');
  const table = read('arm9/asm/unk_02038C78.s').split(/^gScriptCmdTable:.*$/m)[1];
  const names = [...table.split(/\n\s*\n/)[0].matchAll(/\.word (\w+)/g)].map((m) => m[1]);
  const C = all('arm9/src/', '.c'), S = all('arm9/asm/', '.s');
  const size = [], uncertain = new Set();
  names.forEach((n, i) => {
    const cm = C.match(new RegExp(`\\nBOOL ${n}\\((?:struct )?ScriptContext \\*\\w+\\)[^\\n{]*\\n?\\{([\\s\\S]*?)\\n\\}`));
    if (cm) {
      const body = cm[1];
      size[i] = [...body.matchAll(/\b(ScriptReadHalfword|ScriptGetVarPointer|ScriptGetVar|ScriptReadWord|ScriptReadByte)\s*\(/g)].reduce((a, r) => a + READ[r[1]], 0);
      const nested = body.split('\n').some((l) => /\b(ScriptRead|ScriptGetVar)/.test(l) && /^\s{8,}/.test(l));
      const helper = /\b\w+\(\s*ctx\s*[,)]/.test(body.replace(/\b(ScriptReadHalfword|ScriptGetVarPointer|ScriptGetVar|ScriptReadWord|ScriptReadByte|ScriptJump|ScriptCall|ScriptReturn|SetupNativeScript|StopScript|FieldSystem_\w+)\s*\(\s*ctx/g, ''));
      if (nested || helper) uncertain.add(i);
      return;
    }
    const am = S.match(new RegExp(`\\n${n}:[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*(?:thumb|arm)_func_start|$)`));
    if (!am) throw new Error(`comando ${i} (${n}) sem implementação encontrada`);
    const body = am[1];
    size[i] = 2 * (body.match(/bl ScriptReadHalfword\b/g) ?? []).length + 4 * (body.match(/bl ScriptReadWord\b/g) ?? []).length +
      (body.match(/add (r\d), (r\d), #0x1\s*\n\s*str \1, \[r\d, #0x8\]/g) ?? []).length;
    if (/\n\s*b(?:eq|ne|lt|gt|le|ge|hi|lo|hs|ls|cc|cs|mi|pl)\b/.test(body)) uncertain.add(i);
  });
  for (const [op, n] of Object.entries(FIXED)) { size[op] = n; uncertain.delete(Number(op)); }
  for (const op of Object.keys(VARIABLE)) uncertain.delete(Number(op));
  return { names, size, uncertain };
}

// sScriptConditionTable (arm9/asm/unk_02038C78.s): condição × resultado da comparação (0 menor, 1 igual, 2 maior)
const COND = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1]];

/**
 * Executa os scripts de um arquivo com a versão do jogo fixada (GetGameVersion 0x246 → 10 Diamond / 11 Pearl), acompanhando
 * SetVar (0x28), CopyVar (0x29), SetOrCopyVar (0x2A) e as comparações (0x11/0x12). Desvio com condição conhecida segue um lado só;
 * desconhecida (flags, escolhas do jogador), os dois. Devolve os comandos de `watch` alcançados, com os argumentos u16 já
 * resolvidos (variável conhecida → valor; desconhecida → null): [{ op, at, values }].
 */
export function simulate(parsed, version, watch, maxStates = 20000) {
  const out = [], seen = new Set();
  const queue = parsed.entries.map((pc) => ({ pc, vars: new Map(), cmp: null, stack: [] }));
  const val = (vars, v) => (v >= 0x4000 ? (vars.has(v) ? vars.get(v) : null) : v);
  let steps = 0;
  while (queue.length && steps < maxStates) {
    const s = queue.pop();
    for (;;) {
      const c = parsed.code.get(s.pc);
      if (!c || ++steps > maxStates) break;
      const key = `${s.pc}|${[...s.vars].sort().join(',')}|${s.cmp}|${s.stack.join('.')}`;
      if (seen.has(key)) break;
      seen.add(key);
      const a = (k) => c.args.readUInt16LE(k);
      const next = s.pc + 2 + c.args.length;
      if (watch.has(c.op)) out.push({ op: c.op, at: c.at, values: Array.from({ length: c.args.length >> 1 }, (_, k) => val(s.vars, a(2 * k))) });
      if (c.op === 0x28) s.vars.set(a(0), a(2));
      else if (c.op === 0x29 || c.op === 0x2a) { const x = c.op === 0x29 ? val(s.vars, a(2)) ?? null : val(s.vars, a(2)); if (x == null) s.vars.delete(a(0)); else s.vars.set(a(0), x); }
      else if (c.op === 0x246) s.vars.set(a(0), version);
      else if (c.op === 0x11 || c.op === 0x12) { const x = val(s.vars, a(0)), y = c.op === 0x11 ? a(2) : val(s.vars, a(2)); s.cmp = x == null || y == null ? null : x < y ? 0 : x === y ? 1 : 2; }
      if (c.op === CMD.END) break;
      if (c.op === CMD.RETURN) { if (!s.stack.length) break; s.pc = s.stack.pop(); continue; }
      if (c.op === CMD.GOTO) { s.pc = next + c.args.readInt32LE(0); continue; }
      if (c.op === CMD.CALL) { s.stack.push(next); s.pc = next + c.args.readInt32LE(0); continue; }
      if (c.op === CMD.GOTOIF || c.op === CMD.CALLIF) {
        const target = next + c.args.readInt32LE(1), take = s.cmp == null ? null : COND[c.args[0]]?.[s.cmp] === 1;
        const jump = () => (c.op === CMD.CALLIF ? { pc: target, stack: [...s.stack, next] } : { pc: target, stack: [...s.stack] });
        if (take === true) { const j = jump(); s.pc = j.pc; s.stack = j.stack; continue; }
        if (take === null) queue.push({ ...jump(), vars: new Map(s.vars), cmp: s.cmp });
      }
      s.pc = next;
    }
  }
  return out;
}

/** Lê um arquivo de script: { entries, code: Map(pc → { op, at, args: Buffer }), errors }. */
export function parseScriptFile(buf, cmds, variable = VARIABLE) {
  const entries = [];
  if (buf.length < 10) return { entries, code: new Map(), errors: [] }; // mapa sem scripts: arquivo de 4–8 bytes sem código
  let p = 0, first = Infinity;
  while (p + 4 <= buf.length && p < first && buf.readUInt16LE(p) !== 0xfd13) { const t = p + 4 + buf.readInt32LE(p); entries.push(t); first = Math.min(first, t); p += 4; }
  const code = new Map(), errors = [], queue = [...entries];
  while (queue.length) {
    let pc = queue.pop();
    for (;;) {
      if (code.has(pc)) break;
      if (pc < 0 || pc + 2 > buf.length) { errors.push(`salto para fora do arquivo (${pc})`); break; }
      const op = buf.readUInt16LE(pc);
      if (op >= cmds.size.length) { errors.push(`comando inexistente ${op} em ${pc}`); break; }
      const n = variable[op] ? variable[op](buf, pc + 2) : cmds.size[op];
      if (n == null) { errors.push(`tamanho desconhecido do comando ${op} (${cmds.names[op]}) em ${pc}`); break; }
      const args = buf.subarray(pc + 2, pc + 2 + n);
      code.set(pc, { op, at: pc, args });
      const next = pc + 2 + n;
      if (op === CMD.GOTO || op === CMD.CALL) queue.push(next + args.readInt32LE(0));
      if (op === CMD.GOTOIF || op === CMD.CALLIF) queue.push(next + args.readInt32LE(1));
      if (op === CMD.END || op === CMD.RETURN || op === CMD.GOTO) break;
      pc = next;
    }
  }
  return { entries, code, errors };
}
