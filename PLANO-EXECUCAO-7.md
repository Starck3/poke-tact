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
| I2 | Um `key()` único para comparar nomes (scripts/lib) | ✅ 0.65.0 |
| I3 | Testes dos leitores de wikitext com trechos de exemplo (sem rede, sem data-sources) | ✅ 0.66.0 |
| I4 | `builtAt` estável: só muda quando o dado muda | ✅ 0.64.0 |

## Registro

- I0 ✅ STATUS.md (plano 5 e backlog do grupo 2) e PLANO-EXECUCAO-5.md: Darkest Day e item pela 1ª citação decididos.
- I1 ✅ 0.63.0 — `scripts/check-idempotent.mjs` (cada etapa 2× + ciclo sobre a montagem, ordem das chaves ignorada). Achado:
  nota dos exclusivos do SV duplicada a cada execução. Os 22 jogos passam (11 com PKHeX pelo ciclo completo; os outros pelas
  etapas da própria montagem: breeding, TMs/itens da Bulbapedia, imagens, mapa, itens de evolução).
- I4 ✅ 0.64.0 — `scripts/lib/built-at.mjs`: build-game volta a data do git quando o dado é igual; build-catalog idem com
  games.json. Remontar Red/Blue e X/Y: zero arquivos alterados.
- I2 ✅ 0.65.0 — `scripts/lib/names.mjs` em 19 scripts. Remontagem dos 22 jogos comparada com uma base montada pelos scripts
  antigos: só o Sword/Shield mudou pela regra nova (Nidoran♀/♂ do Giant's Bed com taxa — conferido na página da Bulbapedia).
  Achados de passagem: (1) Detonado salvo velho em GS (0.1.0), DP, Pt e HGSS — sem ovos da creche; remontado. (2) Ovo da
  creche repetido uma vez por pai em 14 jogos — deduplicado nos 3 montadores e no apply-breeding. (3) Encontros iguais reais
  (Voltorb ×6 no Power Plant) agora com "×N" na tela.
- I3 ✅ 0.66.0 — `test/bulbapedia-readers.test.mjs` (8 testes; trechos escritos à mão, nada copiado da Bulbapedia — a regra de
  licença manda o cache ficar só em data-sources/). Leitor das tabelas de captura movido para `scripts/lib/bulbapedia-catch.mjs`;
  remontagem dos 8 jogos com taxa sem diferença. Os leitores que ficam dentro dos scripts (limite de captura, trocas,
  exclusivos) leem uma página só cada e já falham alto quando o formato muda ("diferente do esperado — parado").

## Resumo final (2026-10-28)
Grupo 1 concluído em 4 versões (0.63–0.66), nenhum 🚩. Achados de passagem, já corrigidos: nota repetida nos exclusivos do
SV (0.63); Detonado salvo velho em GS/DP/Pt/HGSS, ovo repetido por pai em 14 jogos e Nidoran♀/♂ do Giant's Bed sem taxa
(0.65). Ferramentas novas: `node scripts/check-idempotent.mjs <jogo>`; montagem sem mudança real não altera arquivo.
Grupo 2 (fonte nova) segue no backlog do STATUS.md.
