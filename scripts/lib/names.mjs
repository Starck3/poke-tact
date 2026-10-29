// Comparação de nomes (I2, PLANO-EXECUCAO-7): uma regra só para lugar, treinador e Pokémon em todos os scripts — antes cada
// um tinha a sua (uns tiravam acento e outros não; só o detonado tratava ♀/♂), e um nome podia bater num script e não no outro.
// "Érika" = "ERIKA"; "Nidoran♀" = "NIDORAN_F" = "nidoran-f"; "Farfetch’d" = "farfetchd".
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/♀/g, 'f').replace(/♂/g, 'm');

/** chave compacta: só letras e números ("Route 1 (Hau’oli Outskirts)" → "route1hauolioutskirts") */
export const nameKey = (s) => fold(s).replace(/[^a-z0-9]/g, '');

/** chave por palavras: letras e números separados por um espaço ("Hau’oli City" → "hauoli city") — para comparar por
 * palavra inteira (prefixo, "contém") */
export const wordsKey = (s) => fold(s).replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
