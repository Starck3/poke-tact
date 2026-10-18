# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões em [SemVer](https://semver.org/lang/pt-BR/).

## [0.3.0] — 2026-10-18

Tela inicial nova, a partir das páginas de Linear, Vercel, Mobbin, SaaS UI e Atlassian Design (capturadas e analisadas; a
do Stripe não carregou no tempo limite).

### Adicionado
- Herói com título e sprites dentro da frase (inicial × ás de um líder, girando a cada 3 s).
- Busca central que acha jogos e chefes, com siglas (hg, frlg, oras, bdsp…): "whitney hg" + Enter abre a luta contra a
  Whitney no HeartGold/SoulSilver. Teclado: ↑ ↓ Enter Esc e atalho `/`; o campo "digita" exemplos enquanto está parado.
- Atalhos "Experimente" para lutas famosas que existem nos dados.
- Cartão "Continuar de onde parou" com o último jogo e o contexto salvo (inicial, insígnias, nível).
- Faixa de números calculados dos dados: jogos, jogos conferidos, treinadores com time real e % de vitórias do banco de lutas.
- "Como funciona" em 3 passos.
- Cartões de jogo com os iniciais (sobem ao passar o mouse) ou uma Poké Ball quando os iniciais não estão confirmados.
- Catálogo (`games.json`): iniciais, chefes (com o ás de cada um), nº de treinadores e números do banco de lutas.
- `scripts/screenshot.mjs`: `ACAO` (JS antes da captura, com `await`) para testar estados interativos.

### Alterado
- Celular: jogos em 2 colunas, filtros numa linha com rolagem lateral, selos quebram a linha.
- Sem movimento para quem pede `prefers-reduced-motion`.

## [0.2.0] — 2026-10-18

Interface redesenhada (referências: Linear, Vercel, Stripe, Mobbin, SaaSUI, Atlassian Design System). Motor e dados iguais.

### Adicionado
- Barra de contexto fixa no topo (jogo · versão · inicial · progresso), guardada por jogo no navegador; a URL tem prioridade.
- Selo de qualidade dos dados (Verificado no código do jogo / Parcialmente verificado / Dados da PokéAPI) no jogo e no
  catálogo, com legenda; os textos técnicos foram para "Sobre os dados deste jogo".
- Cartões de resultado com o veredito primeiro (vence/perde, golpes para nocautear, quem age primeiro, origem aleatória),
  golpe e "como conseguir" em uma linha cada (a fonte que libera mais cedo) e o resto em "Detalhes"; 3 colunas no
  computador, empilhados no celular.
- Escolha do inicial por cartões clicáveis (somem depois de escolhido); atalho `/` para buscar o oponente.
- Estados de carregamento (esqueletos), estado vazio com o próximo passo e mensagens de "nenhuma sugestão" acionáveis.
- Tokens de design (cores, espaço, raio, tipografia) em claro e escuro, foco visível, abas com `role="tab"`.
- `scripts/screenshot.mjs`: largura configurável (celular), altura da página inteira, aviso de rolagem horizontal e
  `TEMA=light|dark`.

### Alterado
- Filtros (só obtíveis, evolução final, lendários, TM/HM, troca) recolhidos em "Filtros".
- Barra de abas some quando o jogo não tem detonado.
- Troca com NPC no HGSS: texto para o usuário ("o Pokémon que o NPC pede não está nos dados").

## [0.1.0] — 2026-10-17

Primeira versão no repositório.

### Adicionado
- Catálogo com os 22 jogos da série principal (21 disponíveis) e recomendação de 3 Pokémon por oponente/treinador.
- Gen 1–3 (Red/Blue, Yellow, Gold/Silver, Crystal, Ruby/Sapphire, Emerald, FireRed/LeafGreen): núcleo conferido com o
  decomp, treinadores, onde obter, progresso por insígnia e detonado no app.
- Gen 4: Platinum completo; HeartGold/SoulSilver (decomp parcial; learnset por nível da PokéAPI); Diamond/Pearl com núcleo
  e chefes.
- Gens 5–9: dados da PokéAPI com regras da geração; golpes das Gens 5–8 conferidos com o Pokémon Showdown; iniciais
  confirmados pelo detonado.
- Cálculo de dano por geração, modo "contra o time inteiro" e penalidade/aviso para Pokémon de origem aleatória.
- Banco de lutas (`scripts/build-benchmark.mjs`): 919 lutas em 9 jogos — 98% das sugestões vencem, 91% com folga.
- Testes de regressão para cada achado de dados (`npm test`).
