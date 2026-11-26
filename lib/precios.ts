// 1234.5 → "$1,234.50" (pesos mexicanos).
const formato = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function formatearPrecio(valor: number | string): string {
  return formato.format(Number(valor));
}
