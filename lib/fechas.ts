// Monterrey no tiene horario de verano desde 2022: siempre UTC-06:00.
export const ZONA_HORARIA = "America/Monterrey";
const OFFSET = "-06:00";

// "2027-01-30T19:00" (lo que da <input type="datetime-local">) → ISO con zona.
export function localInputToIso(value: string): string {
  return new Date(`${value}:00${OFFSET}`).toISOString();
}

// ISO guardado en la base → "2027-01-30T19:00" para rellenar el input al editar.
export function isoToLocalInput(iso: string): string {
  // El formato sueco (sv-SE) da "2027-01-30 19:00", casi lo que necesitamos.
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(" ", "T");
}

// ISO → "sábado, 30 de enero de 2027, 19:00" para mostrar.
export function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(iso));
}
