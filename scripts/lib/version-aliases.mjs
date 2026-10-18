// Nomes que mudam por VERSÃO dentro do mesmo decomp (Ruby/Sapphire):
//   constants/version.inc:  .ifdef SAPPHIRE / .set SPECIES_GROUDON_OR_KYOGRE, SPECIES_KYOGRE / .else / .set ..., SPECIES_GROUDON / .endif
//   include/constants/species.h:  #ifdef SAPPHIRE / #define ROAMER_SPECIES SPECIES_LATIAS / #else / ... SPECIES_LATIOS / #endif
// Também troca treinadores (Equipe Magma no Ruby × Aqua no Sapphire). Sem isso, Groudon/Kyogre e Latias/Latios saíam inobtíveis.

/** cfg = { flag: 'SAPPHIRE', whenSet: 'sapphire', otherwise: 'ruby' } → { NOME: { sapphire: X, ruby: Y } } */
export function parseVersionAliases(texts, cfg) {
  const out = {};
  for (const text of texts) {
    let branch = null; // 'set' | 'else' | null
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (new RegExp(`^[.#]ifdef ${cfg.flag}\\b`).test(line)) { branch = 'set'; continue; }
      if (/^[.#]else\b/.test(line) && branch) { branch = 'else'; continue; }
      if (/^[.#]endif\b/.test(line)) { branch = null; continue; }
      if (!branch) continue;
      const m = line.match(/^\.set\s+(\w+),\s*(\w+)/) ?? line.match(/^#define\s+(\w+)\s+(\w+)/);
      if (!m) continue;
      (out[m[1]] ??= {})[branch === 'set' ? cfg.whenSet : cfg.otherwise] = m[2];
    }
  }
  return out;
}

/** Resolve um nome para a versão (se não for apelido, devolve o próprio nome). */
export const resolveFor = (aliases, name, version) => aliases?.[name]?.[version] ?? name;
