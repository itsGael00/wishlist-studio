// "K7P2XZ" → "K7P-2XZ" (más fácil de leer y dictar por teléfono).
// En la base de datos se guarda sin guion.
export function formatearCodigo(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
