# Plano de execução 4 — o que sobrou depois do plano 3

Criado em 2026-10-26, na versão 0.46.0, a pedido do usuário: "Pode montar o plano 4 e executar sem minhas decisões".
Mesmas regras dos planos 2 e 3 (branch, versão, `> resumo`, teste, banco de lutas, até 3 abordagens, ⏸ com motivo, nada
inventado; Bulbapedia com ≥ 5 s por página, para no 1º erro, cache fora do git).

Legenda: ⬜ a fazer · 🔄 em andamento · ✅ feita · ⚠ parcial · ⏸ pulada (motivo)

## Etapas
- **Q1 ✅ Golpes reais nas lutas que não casaram** (0.47.0) (SwSh 48/96, LGPE 34/57, BDSP 45/74…). Causas achadas na investigação:
  rival com página de desambiguação ("Barry" → "Barry (game)"), times numa subpágina ("For all of Hop's teams … see
  [[Hop/Sword and Shield]]"), rival do Let's Go com outro nome na wiki ("Seu rival" = Trace). Pronto quando: as três causas
  tratadas; cobertura sobe; banco rodado.
- **Q2 ✅ Incensos nos jogos novos**: a tabela da Bulbapedia escreve "Market" mas o link é o lugar inteiro
  ("[[Driftveil Market|Market]]") — casar pelo DESTINO do link, não pelo texto. Com o incenso no ponto da história, os bebês
  (Munchlax, Bonsly, Budew…) entram pelo apply-breeding. Pronto quando: algum jogo novo ganha bebê de incenso; teste. (0.48.0)
- **Q3 ✅ Ultra Sun/Ultra Moon no banco de lutas**: o banco monta as lutas pela aba Detonado (que o USUM não tem); usar os
  treinadores com estágio direto quando não há detonado. Pronto quando: o USUM aparece no banco. (0.49.0)
- **Q4 ⚠ Taxa de aparição nas Gens 6–9** (opcional, grande): começar por UM jogo (X/Y) para medir o custo real; se o leitor
  das tabelas de encontro ficar confiável, estender; senão ⏸ com o que foi medido.
- **D1 ⬜** STATUS.md, memória, resumo final.

## Ordem
Q1 → Q2 → Q3 → Q4 → D1.

## Registro
- **2026-10-26 — Q1 (0.47.0)**: desambiguação → "<nome> (game)" (Barry, Dawn, Trace); subpágina de times ("For all of
  Hop's teams … see [[Hop/Sword and Shield]]"); "Seu rival" = Trace e códigos LGP/LGE no Let's Go; "Melody" = Melony.
  Cobertura: SwSh 48 → 73/96, BDSP 45 → 72/74, LGPE 34 → 50/57. Sobram lutas de DLC com nível diferente (SwSh) e Jessie e
  James (sem time do Let's Go na página). Banco: vencem 37.687 (igual); folgadas 35.852 → 35.842.
- **2026-10-26 — Q2 (0.48.0)**: lugar do incenso também pelo DESTINO do link ("[[Driftveil City#Market|Market]]",
  {{ci|…}}, {{rt|…}}), casando só nome igual ou que começa o do app; "(post-National Pokédex)" → pós-jogo; cidades das lutas
  com estágio entram como lugar conhecido (Coumarine City). Incensos com estágio: BW (pós-jogo), B2W2, X/Y, ORAS, S/M, SwSh.
  Nenhum jogo fica mais com "bebê sem incenso"; B2W2 +76 Pokémon obtíveis no total da creche. Banco: vencem 37.687 (igual);
  folgadas 35.842 → 35.860 (ORAS +18).
- **2026-10-26 — Q3 (0.49.0)**: o banco monta as lutas pelos treinadores com estágio quando não há detonado (USUM: 174
  lutas, 2.106 sugestões, 100% vencem, 2.103 folgadas). Para isso: time do rival por inicial ({{PlayerChoice}} da
  Bulbapedia → forStarter), lutas em que o treinador é parceiro fora (partner), lutas da provação da Mina no marco dela, e
  conferência pelo nível do ás (lugar revisitado: Hala nv 63 em Iki Town → pós-jogo; Faba/Guzma/Dulse nv 43–47 que tinham
  ido para o pós-jogo → antes da Poni), marcado stageEstimated. Sobra: 273 de 2.369 fontes do onde obter do USUM sem estágio
  (ex.: Poni Grove) ficam liberadas desde o início, como no app. Banco: 22 jogos, vencem 37.687 → 39.793 (só o USUM novo).
- **2026-10-26 — Q4, X/Y (0.50.0)**: custo medido: 37 páginas de lugar (≈ 3 min a 5 s/página); leitor das linhas
  {{Catch/entry6}} confiável. Casa por lugar + espécie (+ forma, "form=Red-Striped"/"Average&nbsp;Size") + faixa de nível:
  666/708 selvagens com taxa (94%); 29 ambíguos (o PKHeX junta Vara boa nv 25 e Super vara nv 35 numa faixa só, ou
  Caverna 20% × Rock Smash 95%) e 13 sem linha (Rivière Walk) ficam sem taxa. O método genérico do PKHeX ("Selvagem",
  "Grama" até no teto da caverna) vira o da Bulbapedia (Grama, Teto da caverna, Vara boa…). Banco: vencem igual; folgadas
  X/Y 2.451 → 2.445 (Abomasnow da Route 17 tem 1% → raro, sai das sugestões). Próximo: estender aos outros jogos.
- **2026-10-26 — Q4, mais jogos (0.51.0)**: o mesmo leitor com a predefinição de cada jogo (entryoras, entry7,
  entryusum, entrype), as colunas de versão na ordem do jogo e a taxa por período (Alola: dia|noite, "-" = não aparece;
  "all="). Selvagens com taxa: ORAS 552/1.208 (DexNav "??%" e Surf+pesca na mesma faixa do PKHeX ficam sem), Sun/Moon
  607/878, USUM 730/948, Let's Go 604/1.016 (os raros que aparecem em qualquer rota não têm taxa). Chamado SOS e horda ficam
  sem taxa. Achado: "Berry Fields" → #REDIRECT "Berry fields" caía no mesmo arquivo do cache (Windows não diferencia
  maiúsculas) e o redirecionamento não terminava — o destino ganha nome próprio. ⏸ BDSP (manhã|dia|noite, método do PKHeX
  casado com a linha): HTTP 503 em Lake Verity e, na 2ª tentativa, falha de rede em Old Chateau — parado pela regra; o
  código está pronto (CFG), basta rodar de novo. SwSh, LA, SV, Z-A: não configurados (símbolos no mapa, clima da Wild
  Area, surtos — tabela diferente). Banco: vencem igual; folgadas Let's Go 1.018 → 1.021.
