"use client";

import { useActionState } from "react";
import type { GuestFormState } from "./actions";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";

// Pantalla para escribir el código de acceso.
export function CodeForm({
  action,
}: {
  action: (prev: GuestFormState, formData: FormData) => Promise<GuestFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-left">
        <span className="text-sm font-medium">Código de acceso</span>
        <input
          name="code"
          required
          maxLength={10}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="K7P-2XZ"
          className={`${inputClass} text-center font-mono text-2xl tracking-widest uppercase`}
        />
      </label>
      <FormMessage error={state.error} message={state.message} />
      <button type="submit" disabled={pending} className={`${buttonClass} py-3 text-lg`}>
        {pending ? "Revisando…" : "Entrar"}
      </button>
    </form>
  );
}
