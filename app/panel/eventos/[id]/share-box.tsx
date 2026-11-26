"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { buttonClass } from "@/components/ui";

const smallButton =
  "rounded border border-gray-300 px-3 py-1 text-sm hover:border-pink-500 dark:border-gray-700";

// Caja para compartir: link permanente + código vigente, con botones de copiar.
export function ShareBox({
  link,
  code,
  eventTitle,
  regenerate,
}: {
  link: string;
  code: string; // ya formateado: "K7P-2XZ"
  eventTitle: string;
  regenerate: () => Promise<void>;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const message =
    `¡Te invito a ${eventTitle}! 🎁\n` +
    `Aquí puedes confirmar tu asistencia y ver la mesa de regalos:\n${link}\n` +
    `Código de acceso: ${code}`;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("error");
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-pink-200 bg-pink-50/50 p-4 dark:border-pink-900 dark:bg-pink-950/20">
      <h2 className="text-lg font-semibold">Compartir con tus invitados</h2>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Link del evento (nunca cambia)</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-sm dark:bg-gray-900">
            {link}
          </code>
          <button type="button" className={smallButton} onClick={() => copy(link, "link")}>
            {copied === "link" ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Código de acceso vigente</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-white px-3 py-1 font-mono text-2xl tracking-widest dark:bg-gray-900">
            {code}
          </code>
          <button type="button" className={smallButton} onClick={() => copy(code, "code")}>
            {copied === "code" ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}
        >
          Enviar por WhatsApp
        </a>
        <button type="button" className={smallButton} onClick={() => copy(message, "message")}>
          {copied === "message" ? "¡Copiado!" : "Copiar mensaje completo"}
        </button>
      </div>
      {copied === "error" && (
        <p className="text-sm text-red-600">No se pudo copiar. Selecciona el texto y cópialo a mano.</p>
      )}

      <form action={regenerate} className="border-t border-pink-200 pt-3 dark:border-pink-900">
        <ConfirmButton
          question={
            "¿Generar un código nuevo?\n\n" +
            "El código actual dejará de funcionar al instante. " +
            "Los invitados que ya apartaron un regalo o confirmaron asistencia seguirán entrando sin escribirlo; " +
            "los demás necesitarán el código nuevo. El link no cambia."
          }
          className={smallButton}
        >
          Generar código nuevo
        </ConfirmButton>
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          Úsalo si el código llegó a alguien que no debía tenerlo.
        </p>
      </form>
    </section>
  );
}
