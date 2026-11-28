"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  cancelReservation,
  clientIp,
  ensureGuestToken,
  enterWithCode,
  isInviteToken,
  readGuestToken,
  reserveGift,
  saveRsvp,
  suggestGift,
  type ActionResult,
} from "@/lib/invitado";

export type GuestFormState = { error?: string; message?: string };

// Mensajes en español para cada "status" que regresan las funciones guest_*.
const MESSAGES: Record<Exclude<ActionResult["status"], "ok">, string> = {
  no_access: "Tu acceso ya no es válido. Recarga la página y escribe el código de nuevo.",
  invalid: "Revisa los datos del formulario.",
  invalid_companions: "Ese número de acompañantes no está permitido.",
  not_found: "Ese regalo ya no está en la lista. Recarga la página.",
  taken: "¡Uy! Alguien lo apartó hace un momento. Elige otro 🙂",
  limit: "Ya apartaste 5 regalos, el máximo por persona.",
  too_fast: "Vas muy rápido 😅 Espera unos minutos y vuelve a intentar.",
  disabled: "Las sugerencias de regalo están desactivadas para este evento.",
  out_of_range: "El precio debe estar dentro del rango que puso el anfitrión.",
  suggest_limit: "Ya sugeriste 3 regalos, el máximo por persona.",
};

const guestName = z
  .string()
  .trim()
  .min(1, "Escribe tu nombre.")
  .max(80, "Nombre: máximo 80 caracteres.");

// ---------------------------------------------------------------------
// 1. Escribir el código de acceso
// El inviteToken llega "amarrado" con .bind() desde la página.
// ---------------------------------------------------------------------
export async function submitAccessCode(
  inviteToken: string,
  _prev: GuestFormState,
  formData: FormData,
): Promise<GuestFormState> {
  if (!isInviteToken(inviteToken)) return { error: "Este link no es válido." };

  const code = String(formData.get("code") ?? "").slice(0, 20);
  // Quitamos guiones y espacios solo para revisar el largo. La comparación
  // real (y el límite de intentos) la hace la base de datos.
  if (code.replace(/[^A-Za-z0-9]/g, "").length !== 6) {
    return { error: "El código tiene 6 caracteres, por ejemplo K7P-2XZ." };
  }

  try {
    const guestToken = await ensureGuestToken();
    const result = await enterWithCode(inviteToken, code, await clientIp(), guestToken);

    switch (result.status) {
      case "ok":
        refresh(); // vuelve a pintar la página, ahora ya con acceso
        return {};
      case "wrong":
        return {
          error:
            result.remaining > 0
              ? `Código incorrecto. Te quedan ${result.remaining} intento${result.remaining === 1 ? "" : "s"}.`
              : "Código incorrecto. Por seguridad, espera 15 minutos antes de volver a intentar.",
        };
      case "blocked":
        return { error: "Demasiados intentos. Espera 15 minutos y vuelve a intentar." };
      case "too_fast":
        return { error: "Se abrieron demasiadas sesiones desde tu red. Espera un rato e intenta de nuevo." };
      case "not_found":
        return { error: "Este link no es válido. Pídele el link a quien te invitó." };
      default:
        return { error: "Algo salió mal. Intenta de nuevo." };
    }
  } catch {
    return { error: "Algo salió mal. Intenta de nuevo en un momento." };
  }
}

// ---------------------------------------------------------------------
// 2. Apartar un regalo (RF-23)
// ---------------------------------------------------------------------
export async function reserve(
  inviteToken: string,
  giftId: string,
  _prev: GuestFormState,
  formData: FormData,
): Promise<GuestFormState> {
  if (!isInviteToken(inviteToken) || !z.uuid().safeParse(giftId).success) {
    return { error: "Regalo no válido." };
  }
  const name = guestName.safeParse(formData.get("name") ?? "");
  if (!name.success) return { error: name.error.issues[0].message };

  try {
    const result = await reserveGift(
      inviteToken,
      await readGuestToken(),
      giftId,
      name.data,
      await clientIp(),
    );
    if (result.status !== "ok") {
      // Si alguien le ganó, refrescamos para que vea el regalo como apartado.
      if (result.status === "taken" || result.status === "not_found") refresh();
      return { error: MESSAGES[result.status] };
    }
    refresh();
    return { message: "¡Listo! Es tuyo 🎉" };
  } catch {
    return { error: "Algo salió mal. Intenta de nuevo en un momento." };
  }
}

// ---------------------------------------------------------------------
// 3. Cancelar MI apartado (RF-24). La base de datos revisa que sea tuyo.
// ---------------------------------------------------------------------
export async function cancel(inviteToken: string, giftId: string) {
  if (!isInviteToken(inviteToken) || !z.uuid().safeParse(giftId).success) return;
  try {
    await cancelReservation(inviteToken, await readGuestToken(), giftId);
  } catch {
    // Si falla, al refrescar el invitado ve que sigue apartado y puede reintentar.
  }
  refresh();
}

// ---------------------------------------------------------------------
// 4. Confirmar asistencia (RF-21). Si ya había confirmado, se actualiza.
// ---------------------------------------------------------------------
const rsvpSchema = z.object({
  name: guestName,
  status: z.enum(["yes", "no", "maybe"], "Elige si vas a ir."),
  companions: z.coerce
    .number("Acompañantes: número no válido.")
    .int("Acompañantes: número no válido.")
    .min(0)
    .max(20),
  note: z
    .string()
    .trim()
    .max(500, "Mensaje: máximo 500 caracteres.")
    .transform((v) => (v === "" ? null : v)),
});

export async function submitRsvp(
  inviteToken: string,
  _prev: GuestFormState,
  formData: FormData,
): Promise<GuestFormState> {
  if (!isInviteToken(inviteToken)) return { error: "Este link no es válido." };

  const parsed = rsvpSchema.safeParse({
    name: formData.get("name") ?? "",
    status: formData.get("status") ?? "",
    // Si el anfitrión no permite acompañantes, el campo no existe → 0.
    companions: formData.get("companions") ?? "0",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    // Las reglas de acompañantes (RN-07) las revisa la base de datos.
    const result = await saveRsvp(inviteToken, await readGuestToken(), parsed.data, await clientIp());
    if (result.status !== "ok") return { error: MESSAGES[result.status] };
    refresh();
    return {
      message:
        parsed.data.status === "no"
          ? "Gracias por avisar 💌"
          : parsed.data.status === "yes"
            ? "¡Confirmado! Te esperamos 🎉"
            : "Gracias. Puedes cambiar tu respuesta cuando quieras.",
    };
  } catch {
    return { error: "Algo salió mal. Intenta de nuevo en un momento." };
  }
}

// ---------------------------------------------------------------------
// 5. Sugerir un regalo (RF-25). Queda apartado por quien lo sugiere.
//    El rango de precio lo revisa la base de datos (RN-02).
// ---------------------------------------------------------------------
const suggestSchema = z.object({
  name: guestName,
  giftName: z
    .string()
    .trim()
    .min(1, "Escribe qué regalo quieres llevar.")
    .max(120, "Regalo: máximo 120 caracteres."),
  // "1,299.50" o "$1299.5" → 1299.5. Aquí el precio es obligatorio.
  price: z
    .string()
    .trim()
    .transform((v) => v.replace(/[$,\s]/g, ""))
    .refine((v) => /^\d{1,9}(\.\d{1,2})?$/.test(v), "Escribe el precio aproximado (ejemplo: 450).")
    .transform(Number),
  description: z
    .string()
    .trim()
    .max(300, "Detalles: máximo 300 caracteres.")
    .transform((v) => (v === "" ? null : v)),
});

export async function submitSuggestion(
  inviteToken: string,
  _prev: GuestFormState,
  formData: FormData,
): Promise<GuestFormState> {
  if (!isInviteToken(inviteToken)) return { error: "Este link no es válido." };

  const parsed = suggestSchema.safeParse({
    name: formData.get("name") ?? "",
    giftName: formData.get("gift_name") ?? "",
    price: formData.get("price") ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const result = await suggestGift(
      inviteToken,
      await readGuestToken(),
      parsed.data,
      await clientIp(),
    );
    if (result.status !== "ok") return { error: MESSAGES[result.status] };
    refresh();
    return { message: `¡Listo! Agregamos "${parsed.data.giftName}" y quedó apartado a tu nombre 🎉` };
  } catch {
    return { error: "Algo salió mal. Intenta de nuevo en un momento." };
  }
}
