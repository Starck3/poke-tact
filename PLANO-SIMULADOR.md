# Plano — simulador (continua no PLANO-EXECUCAO-2.md, bloco A) com as mecânicas dos jogos novos

Criado em 2026-10-25 (versão 0.25.0), a pedido do usuário ("Vamos para o simulador?"). Hoje o motor (`public/battle.mjs`)
faz uma troca de golpes 1 contra 1 com a fórmula de dano da geração e só **avisa** que o jogo tem Mega, Z, Dynamax, Tera
ou batalha diferente. Cada fase vira uma versão; as regras do projeto continuam: nada inventado, fonte citada, teste de
regressão por achado, banco de lutas antes/depois.

Legenda: ⬜ a fazer · 🔄 em andamento · ✅ feita · ⚠ parcial (ver nota)

## Fontes
- **PKHeX** (já usado): tabelas pessoais de cada jogo com as formas (Mega, Primal, Gigantamax…): atributos, tipos e
  habilidade de cada forma; `FormInfo.IsMegaForm` e a Mega Stone de cada Mega (`ItemStorage9ZA.GetExpectedMegaStone…`).
- **Pokémon Showdown** (já usado para golpes): poder dos golpes Z e Max (regra + exceções em `data/moves.ts` e
  `sim/dex-moves.ts`), Terastal (bônus de STAB).
- **Detonados do PokeMythology**: quando o chefe usa Mega/Z/Dynamax/Tera (o tipo Tera dos líderes do SV), onde se ganha
  o Mega Ring / Z-Ring / Dynamax Band / Tera Orb e onde se acham as Mega Stones e os Z-Crystals.

## Fases
1. ✅ **Mega Evolução** (0.26.0 o seu lado; 0.27.0 os chefes) — XY, ORAS, SM/USUM, Let's Go, Z-A.
   - Dados: formas Mega do jogo (PKHeX) com a Mega Stone; onde ganhar o Mega Ring e onde achar a pedra (detonado).
   - Motor: o seu Pokémon pode lutar Mega (atributos, tipo e habilidade da Mega); na Gen 6 a Velocidade da Mega só vale do
     2º turno. Sugestão aparece como "Charizard (Mega X)" com "segurando Charizardite X".
   - Chefes que usam Mega (Korrina, Diantha, Steven…) lutam Mega quando o detonado diz.
2. ✅ **Golpes Z** (0.28.0: o seu lado; o chefe usar Z ficou ⏸ — o detonado não marca) — Sun/Moon e Ultra Sun/Ultra Moon. Um golpe Z por luta: o primeiro golpe vira Z (poder pela tabela),
   só com o Z-Crystal do tipo e o Z-Ring (provações dão os cristais — o estágio já existe).
3. ✅ **Terastal** (0.29.0) — Scarlet/Violet. Tipo Tera dos líderes (detonado) muda as fraquezas deles; o seu Pokémon pode
   terastalizar no tipo dele (bônus de STAB 2×) a partir da Tera Orb.
4. ✅ **Dynamax** (0.30.0) — Sword/Shield. Só em ginásios e chefes: vida 2× por 3 turnos, golpes Max (poder pela tabela) com o
   efeito de clima/atributo; líderes que dão Gigantamax.
5. ⚠ **Legends: Arceus e Z-A** (sem fonte — ficam no aviso; ver PLANO-EXECUCAO-2 A5) — estilos Ágil/Forte e ordem de ação (LA); batalha em tempo real (Z-A). Provavelmente
   fica como aproximação marcada na tela — o 1 contra 1 por turnos não representa bem.

## Decisões padrão (dá para mudar)
- Pedra ou cristal sem lugar conhecido nos dados: a sugestão Mega/Z aparece **marcada** "se você tiver a pedra", nunca
  como se fosse certa; com o lugar conhecido, entra no ponto da história.
- Sem a marca no detonado, o chefe luta sem Mega/Z/Tera/Dynamax (não se inventa).

## Registro
- **2026-10-25 — fase 1, parte do jogador (0.26.0)**: Megas de cada jogo pelo PKHeX (X/Y 30, ORAS 49, SM/USUM 49,
  Let's Go 15, Z-A 97; tipos conferidos com a PokéAPI, 0 divergências). Mega Ring/Key Stone pelo detonado (X/Y Tower of
  Mastery, ORAS Southern Island, SM Dexio, Let's Go Blue, Z-A missão 9); também acharam Z-Ring (SM), Dynamax Band (SwSh) e
  Tera Orb (SV) para as próximas fases. Onde achar a Mega Stone: frases do detonado (ORAS 36, X/Y 6, Let's Go 3, Z-A 0).
  Banco de lutas: folgadas 36.381 → 36.475. **Falta (1b)**: o chefe lutar Mega — os times do detonado não marcam; precisa
  ler frases como "o Alakazam dele pode mega evoluir".
- **2026-10-25 — fase 1b (0.27.0)**: chefes lutam Mega quando o detonado diz — "Mega Camerupt lv.43" no time (o leitor já
  separava o prefixo; faltava levar ao time salvo) ou frase perto da luta ("o Alakazam dele pode mega evoluir"). X/Y 6,
  ORAS 17, SM 1, Let's Go 9, Z-A 49 Pokémon de chefe com Mega. Os tipos Tera do detonado já ficam guardados (SV: 103) para a
  fase 3. Banco: vencem 37.697 (igual), folgadas 36.475 → 36.446 (chefes mais fortes). Fica de fora: a Velocidade de antes
  da Mega no 1º turno (Gen 6) só vale para o seu lado.
- **2026-10-25 — fase 2, golpes Z (0.28.0)**: poder Z e Max de cada golpe pela regra do Showdown (sim/dex-moves.ts + 48
  exceções; Thunderbolt Z 175, Bullet Seed Z 140, Low Kick Z 160; Max Close Combat 95) gravado em SM/USUM (Z) e SwSh (Max,
  para a fase 4). Z-Ring (Hala) e os 18 Z-Crystals de tipo pelo detonado (frases "receba de Lana o Waterium Z", "pedestal
  com o Icium Z"), cada um no estágio em que é recebido. Motor: um golpe Z por luta no 1º turno (não erra, um golpe só),
  depois o melhor golpe normal; só fica se nocauteia em menos turnos. Sun/Moon: 593 de 888 sugestões usam Z. USUM (sem
  detonado): todos os tipos, marcado na tela. Fica de fora: cristais de espécie (Pikanium Z…) e o chefe usar Z.
