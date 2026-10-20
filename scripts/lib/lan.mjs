// Diagnóstico de acesso pela rede local (outro aparelho no mesmo Wi-Fi). Funções puras para testar.
// Erro real (2026-10-20): com a rede como "Privada", o Windows tinha regras "Node.js JavaScript Runtime" que BLOQUEIAM o
// node.exe no perfil Privado (liberado só no Público). No Firewall do Windows bloqueio vence permissão — uma regra
// liberando a porta 5173 não adianta. Sintoma no outro aparelho: ERR_CONNECTION_TIMED_OUT (o servidor estava no ar).

/** Regras de entrada (lista de { name, enabled, action, profile }) que bloqueiam o Node no perfil de rede atual. */
export function blockingRules(rules, category) {
  return rules.filter((r) => r.enabled && /node/i.test(r.name) && r.action === 'Block' && (r.profile === 'Any' || String(r.profile).split(/,\s*/).includes(category)));
}

/** Comando (PowerShell como administrador) que troca esses bloqueios por permissão — só no perfil indicado. */
export function fixCommand(category) {
  return `Get-NetFirewallRule -DisplayName "Node.js JavaScript Runtime" | Where-Object { $_.Profile -match '${category}' -and $_.Action -eq 'Block' } | Set-NetFirewallRule -Action Allow`;
}

/** IPv4 da rede local (não interno) a partir de os.networkInterfaces(). */
export function lanAddresses(ifaces) {
  return Object.values(ifaces).flat().filter((a) => a && (a.family === 'IPv4' || a.family === 4) && !a.internal).map((a) => a.address);
}
