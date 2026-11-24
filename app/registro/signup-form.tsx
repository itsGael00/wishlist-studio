"use client";

import { useActionState } from "react";
import { signUp, type AuthState } from "@/app/auth/actions";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signUp, {});

  // Si ya se envió el correo, solo mostramos el aviso.
  if (state.message) return <FormMessage message={state.message} />;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Tu nombre</span>
        <input name="displayName" required maxLength={80} autoComplete="name" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Correo</span>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Contraseña (mínimo 8 caracteres)</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </label>
      <FormMessage error={state.error} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </button>
    </form>
  );
}
