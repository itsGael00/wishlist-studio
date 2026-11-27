import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatearFecha } from "@/lib/fechas";
import { formatearPrecio } from "@/lib/precios";
import { isInviteToken, loadGuestPage, readGuestToken, type GuestGift } from "@/lib/invitado";
import { submitAccessCode } from "./actions";
import { CodeForm } from "./code-form";

// El título NO lleva el nombre del evento: sin código no se revela nada
// (RN-06b), ni siquiera en la pestaña o en la vista previa de WhatsApp.
// "noindex": que Google no guarde estas páginas.
export const metadata: Metadata = {
  title: "Invitación · WishListStudio",
  robots: { index: false, follow: false },
};

export default function GuestPage({ params }: PageProps<"/e/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4 sm:p-6">
      <Suspense fallback={<p className="py-12 text-center text-gray-500">Cargando invitación…</p>}>
        <Guest params={params} />
      </Suspense>
    </main>
  );
}

async function Guest({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isInviteToken(token)) notFound();

  // La base de datos decide si este navegador tiene acceso (migración 0004).
  const page = await loadGuestPage(token, await readGuestToken());

  if (page.status === "not_found") notFound();

  if (page.status === "need_code") {
    return (
      <section className="flex flex-1 flex-col justify-center gap-6 py-8 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">🎁 Te invitaron a un evento</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Escribe el código de acceso que te mandaron junto con el link.
          </p>
        </div>
        <CodeForm action={submitAccessCode.bind(null, token)} />
      </section>
    );
  }

  const { event, settings, gifts } = page;

  return (
    <>
      <header className="flex flex-col gap-2 rounded-lg bg-pink-50 p-4 dark:bg-pink-950/30">
        <h1 className="text-2xl font-bold break-words">{event.title}</h1>
        {event.starts_at && <p className="font-medium">📅 {formatearFecha(event.starts_at)}</p>}
        {event.location_text && <p className="break-words">📍 {event.location_text}</p>}
        {event.description && (
          <p className="text-sm break-words whitespace-pre-line text-gray-700 dark:text-gray-300">
            {event.description}
          </p>
        )}
      </header>

      {settings.welcome_message && (
        <p className="rounded-lg border border-pink-200 p-4 break-words whitespace-pre-line dark:border-pink-900">
          {settings.welcome_message}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Mesa de regalos</h2>
        {gifts.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">Todavía no hay regalos en la lista.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {gifts.map((gift) => (
              <GiftItem key={gift.id} gift={gift} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function GiftItem({ gift }: { gift: GuestGift }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold break-words">{gift.name}</p>
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
    </li>
  );
}
