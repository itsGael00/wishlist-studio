"use client";

import { useActionState, useState } from "react";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";
import { formatearPrecio } from "@/lib/precios";
import type { GuestFormState } from "./actions";

// "Sugerir un regalo" (RF-25). Empieza cerrado para no estorbar:
// la mayoría de invitados solo elige de la lista.
export function SuggestForm({
  action,
  defaultName,
  minPrice,
  maxPrice,
  remaining,
}: {
  action: (prev: GuestFormState, formData: FormData) => Promise<GuestFormState>;
  defaultName: string;
  minPrice: number;
  maxPrice: number;
  remaining: number; // sugerencias que le quedan (de 3)
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});

  // Si se guardó bien, cerramos el formulario (mismo patrón que rsvp-form).
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.message) setOpen(false);
  }

  const range = `${formatearPrecio(minPrice)} y ${formatearPrecio(maxPrice)}`;

  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage message={state.message} />
        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-dashed border-pink-400 px-4 py-3 font-medium text-pink-700 hover:bg-pink-50 dark:text-pink-300 dark:hover:bg-pink-950/30"
          >
            ¿Quieres regalar algo que no está en la lista? Sugiérelo ✨
          </button>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Ya sugeriste 3 regalos, el máximo por persona.
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-pink-200 p-4 dark:border-pink-900">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        El precio debe estar entre <strong>{range}</strong>. El regalo quedará apartado a tu
        nombre; los demás invitados solo verán que ya está apartado.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">¿Qué regalo vas a llevar?</span>
        <input name="gift_name" required maxLength={120} placeholder="Una planta para su cuarto" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Precio aproximado (MXN)</span>
        <input
          name="price"
          required
          inputMode="decimal"
          placeholder={String(minPrice)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Detalles (opcional)</span>
        <textarea name="description" rows={2} maxLength={300} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Tu nombre</span>
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={defaultName}
          autoComplete="name"
          className={inputClass}
        />
      </label>
      <FormMessage error={state.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={`${buttonClass} flex-1`}>
          {pending ? "Guardando…" : "Sugerir y apartar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:border-pink-500 dark:border-gray-700"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
