# Plano de execução 7 — melhorias internas (grupo 1)

Pedido do usuário (2026-10-28): "Pode seguir com o grupo 1, sem minhas intervenções; o grupo dois pode manter em backlog
porque ainda não tenho nenhuma fonte nova para testar; atualize o Darkest Day no backlog". Mesmas regras dos planos
anteriores (branch, versão, `> resumo` ≤ 260 caracteres, teste de regressão, banco de lutas quando o cálculo muda, ⏸ com
motivo, 🚩 para o usuário, nada inventado). Nenhum item muda o que aparece na tela — se mudar, é erro e fica marcado.

Legenda: ⬜ a fazer · ✅ feita · ⚠ parcial · ⏸ pulada (motivo) · 🚩 problema para revisar com o usuário

| # | Item | Estado |
|---|---|---|
| I0 | Darkest Day no backlog: STATUS.md e plano 5 dizem que já foi decidido (0.62) | ✅ |
| I1 | Idempotência: rodar uma etapa de novo não muda o resultado | ✅ 0.63.0 |
| I2 | Um `key()` único para comparar nomes (scripts/lib) | ⬜ |
| I3 | Testes dos leitores de wikitext com trechos de exemplo (sem rede, sem data-sources) | ⬜ |
| I4 | `builtAt` estável: só muda quando o dado muda | ✅ 0.64.0 |

## Registro

- I0 ✅ STATUS.md (plano 5 e backlog do grupo 2) e PLANO-EXECUCAO-5.md: Darkest Day e item pela 1ª citação decididos.
- I1 ✅ 0.63.0 — `scripts/check-idempotent.mjs` (cada etapa 2× + ciclo sobre a montagem, ordem das chaves ignorada). Achado:
  nota dos exclusivos do SV duplicada a cada execução. Os 22 jogos passam (11 com PKHeX pelo ciclo completo; os outros pelas
  etapas da própria montagem: breeding, TMs/itens da Bulbapedia, imagens, mapa, itens de evolução).
- I4 ✅ 0.64.0 — `scripts/lib/built-at.mjs`: build-game volta a data do git quando o dado é igual; build-catalog idem com
  games.json. Remontar Red/Blue e X/Y: zero arquivos alterados.
