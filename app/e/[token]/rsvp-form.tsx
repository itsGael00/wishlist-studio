"use client";

import { useActionState, useState } from "react";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";
import type { GuestRsvp } from "@/lib/invitado";
import type { GuestFormState } from "./actions";

const OPTIONS: { value: GuestRsvp["status"]; label: string }[] = [
  { value: "yes", label: "Sí voy 🎉" },
  { value: "maybe", label: "Tal vez 🤔" },
  { value: "no", label: "No podré 😢" },
];

export const RSVP_LABEL: Record<GuestRsvp["status"], string> = {
  yes: "Sí vas",
  maybe: "Tal vez vas",
  no: "No podrás ir",
};

// Confirmar asistencia. Si ya confirmó, aparece lleno para que lo cambie.
export function RsvpForm({
  action,
  current,
  defaultName,
  allowCompanions,
  maxCompanions,
}: {
  action: (prev: GuestFormState, formData: FormData) => Promise<GuestFormState>;
  current: GuestRsvp | null;
  defaultName: string;
  allowCompanions: boolean;
  maxCompanions: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [status, setStatus] = useState<GuestRsvp["status"] | null>(current?.status ?? null);
  // Si ya respondió, primero ve su respuesta y un botón "Cambiar".
  const [editing, setEditing] = useState(current === null);

  // Cuando se guarda bien, cerramos el formulario y mostramos la respuesta.
  // (Patrón de React: ajustar estado cuando cambia otro valor, sin useEffect.)
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.message) setEditing(false);
  }

  if (current && !editing) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage message={state.message} />
        <p>
          <strong>{current.guest_name}</strong>: {RSVP_LABEL[current.status]}
          {current.status !== "no" && current.companions > 0 && (
            <> con {current.companions} acompañante{current.companions === 1 ? "" : "s"}</>
          )}
          .
        </p>
        {current.note && (
          <p className="text-sm break-words whitespace-pre-line text-gray-600 dark:text-gray-400">
            “{current.note}”
          </p>
        )}
        <button
          type="button"
          className="self-start rounded-lg border border-gray-300 px-3 py-2 text-sm hover:border-pink-500 dark:border-gray-700"
          onClick={() => setEditing(true)}
        >
          Cambiar mi respuesta
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Tu nombre *</span>
        <input
          name="name"
          required
          maxLength={80}
          autoComplete="name"
          defaultValue={current?.guest_name ?? defaultName}
          className={inputClass}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">¿Vas a ir? *</legend>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-lg border px-2 py-3 text-center text-sm font-medium ${
                status === option.value
                  ? "border-pink-600 bg-pink-50 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300"
                  : "border-gray-300 dark:border-gray-700"
              }`}
            >
              <input
                type="radio"
                name="status"
                value={option.value}
                required
                checked={status === option.value}
                onChange={() => setStatus(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* RF-21: el campo solo existe si el anfitrión permite acompañantes. */}
      {allowCompanions && status !== "no" && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">¿Cuántos acompañantes llevas?</span>
          <select
            name="companions"
            defaultValue={Math.min(current?.companions ?? 0, maxCompanions)}
            className={inputClass}
          >
            {Array.from({ length: maxCompanions + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? "Solo yo" : `${n} acompañante${n === 1 ? "" : "s"}`}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Mensaje (opcional)</span>
        <textarea
          name="note"
          maxLength={500}
          rows={2}
          defaultValue={current?.note ?? ""}
          placeholder="¡Felicidades!"
          className={inputClass}
        />
      </label>

      <FormMessage error={state.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={`${buttonClass} flex-1 py-3`}>
          {pending ? "Guardando…" : current ? "Guardar cambios" : "Confirmar"}
        </button>
        {current && (
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700"
            onClick={() => setEditing(false)}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
