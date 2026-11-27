"use client";

import { useActionState } from "react";
import { confirmSignup, signUp, type AuthState } from "@/app/auth/actions";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signUp, {});

  // Paso 2: ya se mandó el correo → pedimos el código.
  if (state.pendingEmail) {
    return <VerifyCodeForm email={state.pendingEmail} initialMessage={state.message} />;
  }

  // Paso 1: datos de la cuenta.
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

function VerifyCodeForm({ email, initialMessage }: { email: string; initialMessage?: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(confirmSignup, {
    pendingEmail: email,
    message: initialMessage,
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={email} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Código de 6 dígitos</span>
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          placeholder="123456"
          className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em]`}
        />
      </label>
      <FormMessage error={state.error} message={state.error ? undefined : state.message} />
      <button type="submit" name="intent" value="verify" disabled={pending} className={buttonClass}>
        {pending ? "Un momento…" : "Confirmar y entrar"}
      </button>
      {/* formNoValidate: para reenviar no hace falta escribir el código. */}
      <button
        type="submit"
        name="intent"
        value="resend"
        formNoValidate
        disabled={pending}
        className="text-sm underline disabled:opacity-60"
      >
        ¿No te llegó? Reenviar código
      </button>
      <p className="text-xs text-gray-500">
        También puedes tocar el botón del correo desde cualquier dispositivo.
      </p>
    </form>
  );
}
