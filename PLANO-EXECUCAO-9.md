# Plano de execução 9 — tela inicial: esquecer depois de 3 h e busca por tipo (2026-11-10)

Pedido do usuário: "na tela inicial quero que ao abrir se o tempo for maior que 3 horas não precisa trazer onde estava a
busca da última vez. Na tela inicial quero um campo onde eu possa colocar o tipo do Pokémon que vou enfrentar ou usar […]
filtros onde eu possa selecionar a geração e o jogo [e] me indicar qual o melhor tipo para combater ou usar contra o que foi
selecionado". Mesmas regras dos planos anteriores (branch, versão, `> resumo`, teste de regressão, nada inventado).

Decisões do usuário (2026-11-10):
1. Se o app ficou parado ou fechado nas últimas 3 horas, a tela inicial volta ao começo (sem "Continuar de onde parou",
   sem a busca anterior).
2. O campo aceita tipo **e** nome de Pokémon (o nome vira os tipos dele naquele jogo/geração).
3. "Vou enfrentar" / "Vou usar" por um botão de alternar.
4. Com um jogo escolhido, mostra também os Pokémon desse jogo com os melhores tipos.

Legenda: ⬜ a fazer · ✅ feita · ⚠ parcial · ⏸ pulada (motivo) · 🚩 problema para revisar com o usuário

| # | Item | Estado |
|---|---|---|
| T0 | Legends: Z-A — o leitor do PKHeX lia a tabela até o nº 1025; depois do 1000 (Gholdengo) são formas (Megas) e viravam "Dipplin"… "Fezandipiti" com tipos errados | ✅ 0.71.0 |
| T1 | Hora do último uso no navegador; parado/fechado > 3 h → tela inicial do começo | ✅ 0.71.0 |
| T2 | `public/data/typecharts.json` gerado das tabelas de tipo dos próprios jogos (3 tabelas: Gen 1, Gen 2–5, Gen 6+) + tipos de cada Pokémon por tabela | ✅ 0.71.0 |
| T3 | Cálculo puro (`public/typechart.mjs`): ×4/×2/×1/×½/×¼/×0 nos dois sentidos; Pokémon do jogo com os melhores tipos | ✅ 0.71.0 |
| T4 | Tela: modo "Tipo" na busca, botões de tipo, nome de Pokémon, Enfrentar/Usar, filtros Geração e Jogo, link `#/?tipo=` | ✅ 0.71.0 |
| T5 | Testes de regressão + `npm run test:ui` + CHANGELOG | ✅ 0.71.0 |

## Registro

- T0 ✅ — `maxSpecies: 1000` no Z-A (`Legal.MaxSpeciesID_9a` = Gholdengo). Remontado: saíram só as 6 entradas erradas (386 → 380
  com formas; 364 espécies = 232 de Lumiose + 132 da Hyperspace); o resto do arquivo idêntico. Não obtíveis → banco de lutas igual.
- T2 ✅ — ao regerar, o `pokemon-games.json` mudou: estava parado desde a 0.48 (exclusivos do SV, encontros do USUM…). Teste novo
  compara o arquivo com os datasets. Tipos por época: no Legends: Arceus o "Growlithe" é o de Hisui → vale o 1º jogo onde dá para
  obter; com um jogo escolhido, a tela usa os tipos do próprio jogo.
- T1 ✅ — "parado" = sem toque/tecla; ao voltar (foco, aba visível, toque) depois de 3 h a busca recomeça. Ao abrir: some o
  "Continuar de onde parou"; a busca antiga no link (aba recarregada/restaurada) também sai, mas um link aberto agora continua valendo.
- T3/T4 ✅ — "Vou usar" com um jogo mostra os alvos (Pokémon do jogo que o seu tipo acerta ×2 sem levar ×2); "Vou enfrentar" mostra
  quem usar. Padrão: só evolução final, sem lendários (caixas para mudar).
- T5 ✅ — 3 testes de regressão (0.71.0) + o teste antigo do Z-A (370 → 364); `npm run test:ui` 26/26.

## Resumo final (2026-11-10)
T0–T5 ✅ em 0.71.0. 🚩 Para o usuário: (a) "Vou usar" + jogo mostra alvos — se preferir "quem te ameaça", é trocar a lista;
(b) ao abrir depois de 3 h, um link compartilhado (`#/?tipo=…`) continua abrindo a busca; só aba recarregada/restaurada é limpa.
