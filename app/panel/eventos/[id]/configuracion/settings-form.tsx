"use client";

import { useActionState, useState } from "react";
import type { SettingsFormState } from "./actions";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";

export type Settings = {
  show_reserver_names: boolean;
  show_prices: boolean;
  allow_companions: boolean;
  max_companions: number | null;
  allow_suggestions: boolean;
  suggestion_min_price: number | null;
  suggestion_max_price: number | null;
  welcome_message: string | null;
};

function Toggle({
  name,
  label,
  help,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 accent-pink-600"
      />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-gray-600 dark:text-gray-400">{help}</span>
      </span>
    </label>
  );
}

export function SettingsForm({
  action,
  defaults,
}: {
  action: (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
  defaults: Settings;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Estos interruptores muestran u ocultan campos, por eso viven en el estado.
  const [showNames, setShowNames] = useState(defaults.show_reserver_names);
  const [showPrices, setShowPrices] = useState(defaults.show_prices);
  const [companions, setCompanions] = useState(defaults.allow_companions);
  const [suggestions, setSuggestions] = useState(defaults.allow_suggestions);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Toggle
        name="show_reserver_names"
        label="Mostrar quién apartó"
        help="Apagado: solo ves “Apartado”, para que los regalos sean sorpresa. Encendido: ves el nombre de quien lo lleva. Puedes cambiarlo cuando quieras."
        checked={showNames}
        onChange={setShowNames}
      />

      <Toggle
        name="show_prices"
        label="Mostrar precios a los invitados"
        help="Si lo apagas, los invitados ven los regalos sin precio."
        checked={showPrices}
        onChange={setShowPrices}
      />

      <div className="flex flex-col gap-3">
        <Toggle
          name="allow_companions"
          label="Permitir acompañantes"
          help="Los invitados pueden decir cuántas personas llevan."
          checked={companions}
          onChange={setCompanions}
        />
        {companions && (
          <label className="ml-8 flex flex-col gap-1">
            <span className="text-sm font-medium">Máximo de acompañantes por invitado (1 a 20)</span>
            <input
              name="max_companions"
              type="number"
              min={1}
              max={20}
              required
              defaultValue={defaults.max_companions ?? 1}
              className={inputClass}
            />
          </label>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Toggle
          name="allow_suggestions"
          label="Sugerencia de regalo"
          help="Los invitados pueden agregar un regalo que no esté en tu lista, dentro de un rango de precio."
          checked={suggestions}
          onChange={setSuggestions}
        />
        {suggestions && (
          <div className="ml-8 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Precio mínimo (MXN)</span>
              <input
                name="suggestion_min_price"
                inputMode="decimal"
                required
                defaultValue={defaults.suggestion_min_price ?? ""}
                placeholder="300"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Precio máximo (MXN)</span>
              <input
                name="suggestion_max_price"
                inputMode="decimal"
                required
                defaultValue={defaults.suggestion_max_price ?? ""}
                placeholder="1500"
                className={inputClass}
              />
            </label>
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Mensaje de bienvenida</span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Lo verán tus invitados al entrar. Opcional.
        </span>
        <textarea
          name="welcome_message"
          rows={3}
          maxLength={1000}
          defaultValue={defaults.welcome_message ?? ""}
          placeholder="¡Gracias por acompañarme! 💕"
          className={inputClass}
        />
      </label>

      <FormMessage error={state.error} message={state.message} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Guardando…" : "Guardar configuración"}
      </button>
    </form>
  );
}
