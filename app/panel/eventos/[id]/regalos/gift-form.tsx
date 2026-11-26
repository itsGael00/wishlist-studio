"use client";

import { useActionState, useEffect, useRef } from "react";
import type { GiftFormState } from "./actions";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";

type Defaults = {
  name?: string;
  description?: string | null;
  price_estimate?: number | null;
  store_url?: string | null;
};

// El mismo formulario sirve para agregar y para editar un regalo.
export function GiftForm({
  action,
  defaults = {},
  submitLabel,
  resetOnSuccess = false,
}: {
  action: (prev: GiftFormState, formData: FormData) => Promise<GiftFormState>;
  defaults?: Defaults;
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Al agregar un regalo con éxito, limpiamos el formulario para el siguiente.
  useEffect(() => {
    if (resetOnSuccess && state.message) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Nombre *</span>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={defaults.name}
          placeholder="Audífonos inalámbricos"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Precio aproximado (MXN)</span>
        <input
          name="price_estimate"
          inputMode="decimal"
          defaultValue={defaults.price_estimate ?? ""}
          placeholder="1299.50"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Link de la tienda</span>
        <input
          name="store_url"
          type="url"
          maxLength={500}
          defaultValue={defaults.store_url ?? ""}
          placeholder="https://…"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Descripción (color, talla, modelo…)</span>
        <textarea
          name="description"
          rows={3}
          maxLength={1000}
          defaultValue={defaults.description ?? ""}
          className={inputClass}
        />
      </label>
      <FormMessage error={state.error} message={state.message} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
