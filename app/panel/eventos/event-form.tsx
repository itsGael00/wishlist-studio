"use client";

import { useActionState } from "react";
import type { EventFormState } from "./actions";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";

type Defaults = {
  title?: string;
  description?: string | null;
  location_text?: string | null;
  starts_at_local?: string;
};

// El mismo formulario sirve para crear y para editar.
export function EventForm({
  action,
  defaults = {},
  submitLabel,
}: {
  action: (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
  defaults?: Defaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Título *</span>
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={defaults.title}
          placeholder="Cumpleaños de…"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Fecha y hora (hora de Monterrey)</span>
        <input
          name="starts_at"
          type="datetime-local"
          defaultValue={defaults.starts_at_local}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Lugar</span>
        <input
          name="location_text"
          maxLength={200}
          defaultValue={defaults.location_text ?? ""}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Descripción</span>
        <textarea
          name="description"
          rows={4}
          maxLength={2000}
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
