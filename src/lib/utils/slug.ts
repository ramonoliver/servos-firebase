/**
 * Gera um slug amigável a partir de um nome completo.
 * Ex: "João da Silva" → "joao-da-silva"
 */
export function nameToSlug(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove chars especiais
    .trim()
    .replace(/\s+/g, "-"); // espaços → hifens
}

/**
 * Gera slug de "primeiro + último nome".
 * Ex: "Ramon Alves de Oliveira" → "ramon-oliveira"
 */
export function firstLastSlug(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "pessoa";
  if (parts.length === 1) return nameToSlug(parts[0]);
  const first = parts[0];
  const last = parts[parts.length - 1];
  return nameToSlug(`${first} ${last}`);
}

/**
 * Resolve um slug único verificando colisões no banco.
 * Passa uma função `exists(slug)` que retorna true se o slug já está em uso.
 */
export async function resolveUniqueSlug(
  baseSlug: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  if (!(await exists(baseSlug))) return baseSlug;

  let counter = 2;
  while (true) {
    const candidate = `${baseSlug}-${counter}`;
    if (!(await exists(candidate))) return candidate;
    counter++;
    if (counter > 999) return `${baseSlug}-${Date.now()}`; // failsafe
  }
}
