import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Revisión SEGURA de sesión, para páginas y acciones del panel.
// El proxy hace una revisión rápida, pero la regla es: verificar
// también justo donde se usan los datos (y RLS es la última defensa).
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  return { supabase, userId: claims.sub, email: claims.email ?? "" };
}
