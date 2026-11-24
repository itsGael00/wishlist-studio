import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Corre ANTES de cada página (lo llama proxy.ts). Hace dos cosas:
// 1. Refresca la sesión si está por vencer y guarda las cookies nuevas.
// 2. Revisión rápida: sin sesión no se entra a /panel; con sesión no
//    tiene caso ver /login ni /registro.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Evita que un CDN guarde en caché una respuesta con la sesión de alguien.
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // getClaims() valida la firma del token de sesión. No uses getSession()
  // en el servidor: esa no valida nada.
  const { data } = await supabase.auth.getClaims();
  const hasSession = Boolean(data?.claims);

  const path = request.nextUrl.pathname;
  const goTo = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    return NextResponse.redirect(url);
  };

  if (!hasSession && path.startsWith("/panel")) return goTo("/login");
  if (hasSession && (path === "/login" || path === "/registro")) return goTo("/panel");

  return response;
}
