"use client";

import { useActionState, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";
import { formatearPrecio } from "@/lib/precios";
import type { GuestGift } from "@/lib/invitado";
import type { GuestFormState } from "./actions";

const smallButton =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm hover:border-pink-500 dark:border-gray-700";

// Un regalo en la vista del invitado. Es "client" porque el botón
// "Lo aparto" abre un mini formulario para escribir el nombre.
export function GiftCard({
  gift,
  defaultName,
  reserve,
  cancel,
}: {
  gift: GuestGift;
  defaultName: string;
  reserve: (prev: GuestFormState, formData: FormData) => Promise<GuestFormState>;
  cancel: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(reserve, {});

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border p-4 ${
        gift.mine
          ? "border-pink-300 bg-pink-50/60 dark:border-pink-800 dark:bg-pink-950/20"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold break-words ${gift.reserved && !gift.mine ? "text-gray-500" : ""}`}>
            {gift.name}
          </p>
          {gift.price_estimate !== null && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Aprox. {formatearPrecio(gift.price_estimate)}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
            gift.mine
              ? "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300"
              : gift.reserved
                ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
          }`}
        >
          {gift.mine ? "Lo apartaste tú" : gift.reserved ? "Ya apartado" : "Disponible"}
        </span>
      </div>

      {gift.description && (
        <p className="text-sm break-words whitespace-pre-line">{gift.description}</p>
      )}
      {gift.store_url && (
        <a href={gift.store_url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
          Ver en tienda
        </a>
      )}

      {/* Mensaje de la última acción (por ejemplo "alguien te ganó"). */}
      <FormMessage error={state.error} message={gift.mine ? state.message : undefined} />

      {gift.mine && (
        <form action={cancel}>
          <ConfirmButton
            question={`¿Cancelar tu apartado de "${gift.name}"? Otra persona podrá apartarlo.`}
            className={`${smallButton} text-red-700 dark:text-red-400`}
          >
            Cancelar mi apartado
          </ConfirmButton>
        </form>
      )}

      {!gift.reserved && !open && (
        <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
          Lo aparto 🎁
        </button>
      )}

      {!gift.reserved && open && (
        <form action={formAction} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Tu nombre</span>
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={defaultName}
              autoComplete="name"
              placeholder="Como te conoce el festejado"
              className={inputClass}
            />
          </label>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Los demás invitados no verán tu nombre, solo que ya está apartado.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={`${buttonClass} flex-1`}>
              {pending ? "Apartando…" : "Confirmar"}
            </button>
            <button type="button" className={smallButton} onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
