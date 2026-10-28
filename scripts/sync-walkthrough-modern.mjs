// Remonta a aba Detonado dos jogos sem decomp DEPOIS das etapas que mudam o onde obter (apply-bulbapedia-*): o Detonado
// passa a usar o lugar e o estágio gravados em cada fonte e os treinadores com os golpes reais. Ver build-detonado-modern.
// Uso: node scripts/sync-walkthrough-modern.mjs <jogo>
process.argv.push('--walkthrough-only');
await import('./build-detonado-modern.mjs');
