# Plano de execução 8 — fontes novas da pesquisa (2026-10-28)

Pedido do usuário: "Pode seguir com os 3, sem minhas intervenções" — as três sugestões da pesquisa de fontes. Mesmas regras
dos planos anteriores (branch, versão, `> resumo` ≤ 260 caracteres, teste de regressão, banco de lutas quando o cálculo muda,
⏸ com motivo, 🚩 para o usuário, nada inventado; estimativa marcada na tela). Fonte nova (Smogon, CPokemon): cache só em
`data-sources/`, nunca no git; ≥ 5 s entre pedidos; para no 1º erro HTTP; só fatos extraídos, com crédito.

Legenda: ⬜ a fazer · ✅ feita · ⚠ parcial · ⏸ pulada (motivo) · 🚩 problema para revisar com o usuário

| # | Item | Estado |
|---|---|---|
| F1 | Scarlet/Violet: chance de aparição pelo peso por bioma das páginas da Bulbapedia (fonte já liberada) | ⬜ |
| F2 | Battle Subway (Black/White e Black 2/White 2): times possíveis pela Smogon (fonte nova, aprovada) | ⬜ |
| F3 | Ultra Sun/Ultra Moon: abrir o arquivo de encontros do CPokemon/usum-data e ver se traz taxas (fonte nova, aprovada) | ✅ 0.67.0 |

## Registro

- F3 ✅ 0.67.0 — o arquivo é das tabelas do ULTRA SUN (exclusivos dele presentes), Dia/Noite por mapa, sem o método.
  Mapas traduzidos pelo PKHeX (es × en). Bulbapedia conferida: 346/360 batem (96%); as 14 diferentes (Lush Jungle, Route
  13/14, Mount Lanakila) ficam com a Bulbapedia e no relatório. 25 taxas novas; 5 tabelas de 100% (árvore/especial) puladas;
  48 ambíguas (o lugar tem duas tabelas com a espécie e taxas diferentes). Ultra Moon fica sem essa fonte.
- F1 em andamento: leitor `biomeRows`/`biomeShares` e `scripts/apply-bulbapedia-spawn-weights.mjs` prontos; a Bulbapedia
  respondeu HTTP 503 na 2ª página — parado pela regra; nova tentativa depois de 30 min.
