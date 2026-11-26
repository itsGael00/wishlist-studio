import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ConfirmButton } from "@/components/confirm-button";
import { requireUser } from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";
import { formatearPrecio } from "@/lib/precios";
import { createGift, deleteGift, moveGift } from "./actions";
import { GiftForm } from "./gift-form";

export const metadata: Metadata = { title: "Regalos · WishListStudio" };

export default function GiftsPage({ params }: PageProps<"/panel/eventos/[id]/regalos">) {
  return (
    <main className="flex flex-col gap-8">
      <Suspense fallback={<p className="text-gray-500">Cargando regalos…</p>}>
        <Gifts params={params} />
      </Suspense>
    </main>
  );
}

const smallButton =
  "rounded border border-gray-300 px-2 py-1 text-sm hover:border-pink-500 disabled:opacity-40 dark:border-gray-700";

async function Gifts({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireUser();

  // Primero el evento y su configuración. Si no es tuyo, RLS no regresa nada → 404.
  const [{ data: event }, { data: settings }] = await Promise.all([
    supabase.from("events").select("id, title").eq("id", id).maybeSingle(),
    supabase
      .from("event_settings")
      .select("show_reserver_names")
      .eq("event_id", id)
      .maybeSingle(),
  ]);
  if (!event) notFound();

  const showNames = settings?.show_reserver_names ?? false;

  const [{ data: gifts, error }, reservedBy] = await Promise.all([
    supabase
      .from("gifts")
      .select("id, name, description, price_estimate, store_url, source, is_hidden")
      .eq("event_id", id)
      .order("position")
      .order("created_at"),
    loadReservations(supabase, id, showNames),
  ]);

  if (error) return <p className="text-red-600">No se pudieron cargar los regalos.</p>;

  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">Regalos de {event.title}</h1>
        {!gifts || gifts.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">
            Aún no hay regalos. Agrega el primero abajo.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {gifts.map((gift, index) => {
              const reserved = reservedBy.has(gift.id);
              const reserverName = reservedBy.get(gift.id);
              return (
                <li
                  key={gift.id}
                  className="flex flex-col gap-2 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold break-words">{gift.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {gift.price_estimate !== null
                          ? formatearPrecio(gift.price_estimate)
                          : "Sin precio"}
                        {gift.store_url && (
                          <>
                            {" · "}
                            <a
                              href={gift.store_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              Ver en tienda
                            </a>
                          </>
                        )}
                      </p>
                      {gift.description && (
                        <p className="mt-1 text-sm break-words whitespace-pre-line">
                          {gift.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                        reserved
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                      }`}
                    >
                      {reserved
                        ? reserverName
                          ? `Apartado por ${reserverName}`
                          : "Apartado"
                        : "Disponible"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={moveGift.bind(null, id, gift.id, "up")}>
                      <button type="submit" disabled={index === 0} className={smallButton} aria-label="Subir">
                        ↑
                      </button>
                    </form>
                    <form action={moveGift.bind(null, id, gift.id, "down")}>
                      <button
                        type="submit"
                        disabled={index === gifts.length - 1}
                        className={smallButton}
                        aria-label="Bajar"
                      >
                        ↓
                      </button>
                    </form>
                    <Link href={`/panel/eventos/${id}/regalos/${gift.id}`} className={smallButton}>
                      Editar
                    </Link>
                    <form action={deleteGift.bind(null, id, gift.id)}>
                      <ConfirmButton
                        question={
                          reserved
                            ? `"${gift.name}" ya está apartado. ¿Borrarlo de todos modos?`
                            : `¿Borrar "${gift.name}"?`
                        }
                        className={`${smallButton} text-red-700 dark:text-red-400`}
                      >
                        Borrar
                      </ConfirmButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Agregar regalo</h2>
        <GiftForm action={createGift.bind(null, id)} submitLabel="Agregar regalo" resetOnSuccess />
      </section>
    </>
  );
}

// Regresa un mapa: id del regalo apartado → nombre de quien lo apartó (o null).
// RN-03: el nombre SOLO se pide a la base de datos si "Mostrar quién apartó"
// está activado. Si no, ni siquiera sale del servidor hacia tu navegador.
async function loadReservations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  showNames: boolean,
): Promise<Map<string, string | null>> {
  if (showNames) {
    const { data } = await supabase
      .from("reservations")
      .select("gift_id, guest_name")
      .eq("event_id", eventId);
    return new Map((data ?? []).map((r) => [r.gift_id, r.guest_name]));
  }
  const { data } = await supabase.from("reservations").select("gift_id").eq("event_id", eventId);
  return new Map((data ?? []).map((r) => [r.gift_id, null]));
}
