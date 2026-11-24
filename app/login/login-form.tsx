"use client";

import { useActionState } from "react";
import { signIn, type AuthState } from "@/app/auth/actions";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Correo</span>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className={inputClass}
        />
      </label>
      <FormMessage error={state.error} message={state.message} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
