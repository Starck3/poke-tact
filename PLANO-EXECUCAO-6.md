# Plano de execução 6 — as críticas da revisão (plano 5, C1)

Criado em 2026-10-28, na versão 0.58.0, a pedido do usuário: "Pode seguir, sem minhas intervenções" (sobre as críticas:
bloco 2 primeiro, depois o 1; o 3 aos poucos). Mesmas regras dos planos anteriores (branch, versão, `> resumo` ≤ 260
caracteres, teste de regressão, banco de lutas quando o cálculo muda, ⏸ com motivo, 🚩 para o usuário, nada inventado).

Legenda: ⬜ a fazer · ✅ feita · ⚠ parcial · ⏸ pulada (motivo) · 🚩 problema para revisar com o usuário

## Etapas
- **S1 ✅ Banco de lutas mede "dado incerto"**: além de vencer, contar as sugestões que dependem de algo que o app não sabe
  quando fica disponível (item de evolução sem fonte, TM sem lugar/estágio, Pokémon só com estágio estimado). Mostrar por
  jogo; se o motor estiver deixando passar algo sem saber, corrigir. Pronto quando: o número aparece no relatório e os
  casos grandes estão explicados ou corrigidos.
- **S2 ✅ Teste da tela no Chrome headless como parte do projeto** (`npm run test:ui`, sem dependências; pula sem Chrome):
  Brock pelo seletor e pelo link, Nemona, abas, celular, erros de JavaScript.
- **S3 ⚠ Tela**: linha "calculado com o seu time no nv X e Y" acima das sugestões; inicial em linha compacta; clima repetido
  do PKHeX escondido quando há taxa por clima; 404 do favicon e do mapa de jogos sem mapa.
- **S4 ⬜ Montagem na ordem certa**: jogos que usam dados de outro (ORAS ← Ruby/Sapphire, BDSP ← Diamond/Pearl, Let's Go ←
  Yellow, USUM ← Sun/Moon, Z-A ← Scarlet/Violet) montados depois dele; arquivo de outro jogo faltando vira erro.
- **S5 ⬜ Etapa sem fonte local avisa em vez de sair calada** (modo `--strict` no build-game: falha).
- **D1 ⬜** STATUS.md, memória, resumo final.

## Decisões pendentes (🚩 do plano 5, mantidas como estão até o usuário decidir)
- Wild Area depois do Darkest Day: níveis altos ficam em "8 insígnias".
- Item de evolução só citado no detonado: vale a partir da 1ª citação.

## Ordem
S1 → S2 → S3 → S4 → S5 → D1.

## Registro
- **2026-10-28 — S1 (0.59.0)**: `uncertainty()` no banco de lutas. 0 sugestões por item/TM/tutor sem lugar (a correção
  do item citado na 0.57 fechou o caso Armarouge); 655 por estágio estimado: SwSh 551 (DLCs: Sandslash de Alola, Magneton,
  Poliwrath…), USUM 83 (Ultra Beasts nas lutas do pós-jogo), SV 21. 🚩 Pokémon de DLC: o app sugere para quem pode não ter
  a DLC, e no SwSh o nível das áreas da DLC acompanha as insígnias (estimativa frágil) — sugestão: um filtro "tenho as DLCs".
- **2026-10-28 — S2/S3 (0.60.0)**: `npm run test:ui` (scripts/ui-test.mjs: servidor numa porta livre + Chrome/Edge headless
  pelo protocolo DevTools, 15 verificações; pula sem navegador). Linha de contexto acima das sugestões; clima do PKHeX
  escondido quando há taxa por clima; favicon; jogo sem mapa não pede o arquivo. ⏸ Iniciais em linha compacta: o usuário
  pediu os sprites grandes nessa escolha (0.9.0) — não mudei sem ele.
