"use server";

import { refresh } from "next/cache";
import { clientIp, ensureGuestToken, enterWithCode, isInviteToken } from "@/lib/invitado";

export type GuestFormState = { error?: string; message?: string };

// El invitado escribe el código de acceso.
// El inviteToken llega "amarrado" con .bind() desde la página.
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
      case "not_found":
        return { error: "Este link no es válido. Pídele el link a quien te invitó." };
      default:
        return { error: "Algo salió mal. Intenta de nuevo." };
    }
  } catch {
    return { error: "Algo salió mal. Intenta de nuevo en un momento." };
  }
}
