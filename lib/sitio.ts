import "server-only";
import { headers } from "next/headers";

// "https://wishlist-studio-chi.vercel.app" en producción,
// "http://localhost:3000" en tu compu. Se saca de la petición actual,
// así el link funciona igual en local, en previews de Vercel y en producción.
export async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
