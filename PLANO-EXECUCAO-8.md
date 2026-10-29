# Plano de execução 8 — fontes novas da pesquisa (2026-10-28)

Pedido do usuário: "Pode seguir com os 3, sem minhas intervenções" — as três sugestões da pesquisa de fontes. Mesmas regras
dos planos anteriores (branch, versão, `> resumo` ≤ 260 caracteres, teste de regressão, banco de lutas quando o cálculo muda,
⏸ com motivo, 🚩 para o usuário, nada inventado; estimativa marcada na tela). Fonte nova (Smogon, CPokemon): cache só em
`data-sources/`, nunca no git; ≥ 5 s entre pedidos; para no 1º erro HTTP; só fatos extraídos, com crédito.

Legenda: ⬜ a fazer · ✅ feita · ⚠ parcial · ⏸ pulada (motivo) · 🚩 problema para revisar com o usuário

| # | Item | Estado |
|---|---|---|
| F1 | Scarlet/Violet: chance de aparição pelo peso por bioma das páginas da Bulbapedia (fonte já liberada) | ✅ 0.69.0 |
| F2 | Battle Subway (Black/White e Black 2/White 2): times possíveis pela Smogon (fonte nova, aprovada) | ⚠ 0.68.0 |
| F3 | Ultra Sun/Ultra Moon: abrir o arquivo de encontros do CPokemon/usum-data e ver se traz taxas (fonte nova, aprovada) | ✅ 0.67.0 |

## Registro

- F3 ✅ 0.67.0 — o arquivo é das tabelas do ULTRA SUN (exclusivos dele presentes), Dia/Noite por mapa, sem o método.
  Mapas traduzidos pelo PKHeX (es × en). Bulbapedia conferida: 346/360 batem (96%); as 14 diferentes (Lush Jungle, Route
  13/14, Mount Lanakila) ficam com a Bulbapedia e no relatório. 25 taxas novas; 5 tabelas de 100% (árvore/especial) puladas;
  48 ambíguas (o lugar tem duas tabelas com a espécie e taxas diferentes). Ultra Moon fica sem essa fonte.
- F1 em andamento: leitor `biomeRows`/`biomeShares` e `scripts/apply-bulbapedia-spawn-weights.mjs` prontos; a Bulbapedia
  respondeu HTTP 503 na 2ª página — parado pela regra; nova tentativa depois de 30 min.
- F2 ⚠ 0.68.0 — chefes do Subway no Black/White: os 6 times do detonado batem com os conjuntos "Special" da Smogon → golpes
  e item reais; Emmet e multi em dupla. Banco de lutas igual. ⏸ Treinadores comuns do Subway (time sorteado de até 66
  conjuntos — o cálculo precisa de time fixo; uma tela de "times possíveis" seria função nova). ⏸ Black 2/White 2: os chefes
  do Subway de lá não estão nos dados (o decomp pokebw2 que usamos traz só a luta da história).
- F1 ✅ 0.69.0 — 2ª tentativa (30 min depois do 503) sem erro. 3.760/7.636 encontros "Selvagem" com fatia por bioma; 10 lugares
  sem tabela na página (cidades/praças/Kitakami Hall) e espécies que o PKHeX põe no lugar e a Bulbapedia não. Fatia no terreno
  principal (o maior entre terrenos dava "lago 100%" ao Magikarp). Estimativa marcada (≈). Conferido: Lechonk 80/326 = 25%.

## Resumo final (2026-10-28)
F3 ✅ 0.67.0 (Ultra Sun pelas tabelas do jogo; Bulbapedia conferida 96%), F2 ⚠ 0.68.0 (6 chefes do Subway com golpes reais;
treinadores comuns e B2W2 fora), F1 ✅ 0.69.0 (SV por bioma, estimativa). 🚩 Para o usuário: (a) quer uma tela de "times
possíveis" para os treinadores comuns do Battle Subway (sorteio de até 66 conjuntos)? (b) regra de ROM — ver a conversa de
2026-10-28: a regra foi minha (docs/PLANO.md, 0.1.0); dados do próprio jogo do usuário seriam possíveis, decisão dele.
