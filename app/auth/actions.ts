"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Lo que regresan las acciones al formulario para mostrar mensajes.
export type AuthState = {
  error?: string;
  message?: string;
  // Después de registrarse: a qué correo se mandó el código.
  pendingEmail?: string;
};

// Zod valida los datos EN EL SERVIDOR. La validación del navegador
// (required, minLength) es solo comodidad: se puede saltar.
const credentials = z.object({
  email: z.email("Escribe un correo válido."),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(72, "La contraseña es demasiado larga."),
});

const signUpSchema = credentials.extend({
  displayName: z
    .string()
    .trim()
    .min(1, "Escribe tu nombre.")
    .max(80, "El nombre es demasiado largo."),
});

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Primero confirma tu correo: revisa tu bandeja de entrada." };
    }
    // Mensaje genérico a propósito: no revelamos si el correo existe.
    return { error: "Correo o contraseña incorrectos." };
  }

  redirect("/panel");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { displayName, email, password } = parsed.data;
  const origin = (await headers()).get("origin") ?? "";

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Lo lee el trigger handle_new_user() para llenar profiles.display_name.
      data: { display_name: displayName },
      // A dónde regresa el enlace del correo. Supabase solo acepta
      // direcciones de su lista "Redirect URLs".
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { error: "Esa contraseña es muy débil. Prueba una más larga." };
    }
    if (error.code === "over_email_send_rate_limit") {
      return { error: "Se enviaron demasiados correos. Espera un rato e intenta otra vez." };
    }
    return { error: "No se pudo crear la cuenta. Intenta de nuevo." };
  }

  return {
    pendingEmail: email,
    message: `Te enviamos un código de 6 dígitos a ${email}. Puedes leer el correo en cualquier dispositivo.`,
  };
}

const codeSchema = z.object({
  email: z.email("Correo no válido."),
  // Quitamos espacios por si lo pegan como "123 456".
  code: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "El código son 6 números.")),
});

// El anfitrión escribe aquí el código que le llegó por correo.
// Funciona aunque haya leído el correo en otro dispositivo: el código
// no depende del navegador, y la sesión se abre en ESTE navegador.
async function verifySignupCode(
  prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = codeSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code") ?? "",
  });
  if (!parsed.success) {
    return { ...prev, error: parsed.error.issues[0].message, message: undefined };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.code,
    type: "email",
  });

  if (error) {
    return {
      pendingEmail: parsed.data.email,
      error: "Código incorrecto o vencido. Revisa el último correo o pide uno nuevo.",
    };
  }

  redirect("/panel");
}

// Vuelve a mandar el correo de confirmación (con un código nuevo).
async function resendSignupCode(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = z.email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Correo no válido." };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    return {
      pendingEmail: parsed.data,
      error:
        error.code === "over_email_send_rate_limit"
          ? "Se enviaron demasiados correos. Espera un rato e intenta otra vez."
          : "No se pudo reenviar. Espera un minuto e intenta otra vez.",
    };
  }

  return { pendingEmail: parsed.data, message: "Te enviamos un código nuevo. Usa el del correo más reciente." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Un solo formulario con dos botones: "Confirmar" (intent=verify)
// y "Reenviar código" (intent=resend).
export async function confirmSignup(
  prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  return formData.get("intent") === "resend"
    ? resendSignupCode(prev, formData)
    : verifySignupCode(prev, formData);
}
