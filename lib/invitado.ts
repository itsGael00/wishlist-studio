import "server-only";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

// Todo lo del INVITADO pasa por aquí. El invitado no tiene cuenta, así que
// no puede hablar con la base de datos. El servidor lo hace por él usando
// la llave SECRETA de Supabase y SOLO llama a las funciones guest_* de la
// migración 0004, que revisan el acceso por su cuenta.
//
// ⚠️ La llave secreta se salta RLS. Por eso:
//   - Vive solo en el servidor ("server-only" arriba hace que el build
//     falle si algún componente del navegador importa este archivo).
//   - Su variable NO empieza con NEXT_PUBLIC_ (esas sí llegan al navegador).
//   - El cliente no se exporta: nadie más en la app puede usarlo.

function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Falta la variable SUPABASE_SECRET_KEY (ver .env.example).");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminClient().rpc(fn, args);
  if (error) {
    // El detalle va al log del servidor (Vercel → Logs), nunca al invitado.
    console.error(`[invitado] ${fn}:`, error.message);
    throw new Error("Error al hablar con la base de datos.");
  }
  return data as T;
}

// ---------------------------------------------------------------------
// Validaciones de lo que llega en la URL
// ---------------------------------------------------------------------

// invite_token = 16 bytes en hexadecimal = 32 caracteres 0-9a-f.
export function isInviteToken(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value);
}

// ---------------------------------------------------------------------
// Cookie del invitado
// ---------------------------------------------------------------------

const COOKIE = "wl_invitado";

// El token secreto del navegador ("" si todavía no tiene).
export async function readGuestToken(): Promise<string> {
  return (await cookies()).get(COOKIE)?.value ?? "";
}

// Si ya tiene token lo reutiliza (así conserva sus apartados); si no, crea uno.
// Solo se puede llamar desde una Server Action (las páginas no escriben cookies).
export async function ensureGuestToken(): Promise<string> {
  const existing = await readGuestToken();
  if (existing.length >= 32) return existing;

  const token = randomBytes(32).toString("base64url"); // 256 bits aleatorios
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, // el JavaScript de la página no la puede leer
    secure: process.env.NODE_ENV === "production", // solo por HTTPS en producción
    sameSite: "lax",
    path: "/e", // solo viaja a las páginas de invitado
    maxAge: 60 * 60 * 24 * 400, // ~13 meses (el máximo que aceptan los navegadores)
  });
  return token;
}

// IP de quien hace la petición, para el límite de intentos.
// En Vercel, "x-forwarded-for" lo pone Vercel mismo (no se puede falsificar ahí).
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "desconocida"
  );
}

// ---------------------------------------------------------------------
// Llamadas a la base de datos (una por función guest_* de la migración)
// ---------------------------------------------------------------------

export type GuestGift = {
  id: string;
  name: string;
  description: string | null;
  price_estimate: number | null; // null si no tiene precio o si "Mostrar precios" está apagado
  store_url: string | null;
  reserved: boolean;
  mine: boolean; // true = lo apartó ESTE invitado
};

export type GuestRsvp = {
  guest_name: string;
  status: "yes" | "no" | "maybe";
  companions: number;
  note: string | null;
};

export type GuestPage =
  | { status: "not_found" }
  | { status: "need_code" }
  | {
      status: "ok";
      event: {
        title: string;
        description: string | null;
        starts_at: string | null;
        location_text: string | null;
      };
      settings: {
        show_prices: boolean;
        allow_companions: boolean;
        max_companions: number | null;
        welcome_message: string | null;
      };
      gifts: GuestGift[];
      my_rsvp: GuestRsvp | null;
      my_name: string | null;
    };

export function loadGuestPage(inviteToken: string, guestToken: string) {
  return rpc<GuestPage>("guest_page", {
    p_invite_token: inviteToken,
    p_guest_token: guestToken,
  });
}

export type EnterResult =
  | { status: "ok" | "not_found" | "blocked" | "too_fast" | "error" }
  | { status: "wrong"; remaining: number };

export function enterWithCode(inviteToken: string, code: string, ip: string, guestToken: string) {
  return rpc<EnterResult>("guest_enter", {
    p_invite_token: inviteToken,
    p_code: code,
    p_ip: ip,
    p_guest_token: guestToken,
  });
}

export type ActionResult = {
  status:
    | "ok"
    | "no_access"
    | "invalid"
    | "invalid_companions"
    | "not_found"
    | "taken"
    | "limit"
    | "too_fast"; // límite de velocidad por IP (migración 0005)
};

export function reserveGift(
  inviteToken: string,
  guestToken: string,
  giftId: string,
  name: string,
  ip: string,
) {
  return rpc<ActionResult>("guest_reserve", {
    p_invite_token: inviteToken,
    p_guest_token: guestToken,
    p_gift_id: giftId,
    p_guest_name: name,
    p_ip: ip,
  });
}

export function cancelReservation(inviteToken: string, guestToken: string, giftId: string) {
  return rpc<ActionResult>("guest_cancel", {
    p_invite_token: inviteToken,
    p_guest_token: guestToken,
    p_gift_id: giftId,
  });
}

export function saveRsvp(
  inviteToken: string,
  guestToken: string,
  rsvp: { name: string; status: GuestRsvp["status"]; companions: number; note: string | null },
  ip: string,
) {
  return rpc<ActionResult>("guest_rsvp", {
    p_invite_token: inviteToken,
    p_guest_token: guestToken,
    p_guest_name: rsvp.name,
    p_status: rsvp.status,
    p_companions: rsvp.companions,
    p_note: rsvp.note,
    p_ip: ip,
  });
}
