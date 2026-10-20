// npm run rede — diz se o app abre em outro aparelho da rede e, se não, por quê (ver scripts/lib/lan.mjs).
// Windows: lê o perfil da rede e as regras do Firewall pelo PowerShell (só leitura; não muda nada).
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { blockingRules, fixCommand, lanAddresses } from './lib/lan.mjs';

const port = Number(process.env.PORT) || 5173;
const ips = lanAddresses(networkInterfaces());
console.log(`Neste computador: http://localhost:${port}`);
for (const ip of ips) console.log(`Outros aparelhos na mesma rede: http://${ip}:${port}`);
if (process.platform !== 'win32') process.exit(0);
const ps = (cmd) => execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
try {
  // uma rede só: o ConvertTo-Json devolve um texto, não uma lista ([].concat evita separar letra por letra)
  const cats = [...new Set([].concat(JSON.parse(ps('Get-NetConnectionProfile | Select-Object -ExpandProperty NetworkCategory | ForEach-Object { "$_" } | ConvertTo-Json')) ?? []))];
  const rules = [JSON.parse(ps("Get-NetFirewallRule -Direction Inbound | Where-Object { $_.DisplayName -match 'node' } | ForEach-Object { [pscustomobject]@{ name = $_.DisplayName; enabled = \"$($_.Enabled)\" -eq 'True'; action = \"$($_.Action)\"; profile = \"$($_.Profile)\" } } | ConvertTo-Json") || '[]')].flat();
  for (const c of cats) {
    const bad = blockingRules(rules, c);
    if (!bad.length) { console.log(`Rede ${c}: nenhuma regra do Firewall bloqueia o Node. ✓`); continue; }
    console.log(`Rede ${c}: ${bad.length} regra(s) do Firewall BLOQUEIAM o Node — outros aparelhos vão dar timeout.`);
    console.log(`Corrija no PowerShell como administrador:\n  ${fixCommand(c)}`);
    process.exitCode = 1;
  }
} catch (e) {
  console.log(`(não consegui ler o Firewall: ${e.message.split('\n')[0]})`);
}
