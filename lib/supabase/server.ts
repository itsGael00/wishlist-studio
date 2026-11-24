import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {connection } from "next/server";

// Cliente de Supabase para usar en el SERVIDOR (Server Components,
// Server Actions y Route Handlers). Lee y guarda la sesión en cookies.
// Se crea uno nuevo en cada petición: nunca se comparte entre usuarios.
export async function createClient() {
  await connection();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Un Server Component no puede escribir cookies. No pasa nada:
            // el proxy (proxy.ts) ya refresca la sesión en cada petición.
          }
        },
      },
    },
  );
}
