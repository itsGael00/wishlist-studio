import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// En Next.js 16 este archivo se llama proxy.ts (antes era middleware.ts).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Corre en todas las rutas menos archivos estáticos e imágenes.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
