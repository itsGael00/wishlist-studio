import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ConfirmButton } from "@/components/confirm-button";
import { requireUser } from "@/lib/auth";
import { deleteRsvp } from "./actions";

export const metadata: Metadata = { title: "Asistencia · WishListStudio" };

export default function AttendancePage({ params }: PageProps<"/panel/eventos/[id]/asistencia">) {
  return (
    <main className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-gray-500">Cargando asistencia…</p>}>
        <Attendance params={params} />
      </Suspense>
    </main>
  );
}

const STATUS = {
  yes: { label: "Sí va", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  maybe: { label: "Tal vez", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  no: { label: "No va", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
} as const;

async function Attendance({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireUser();
  const [{ data: event }, { data: settings }, { data: rsvps, error }] = await Promise.all([
    supabase.from("events").select("id, title").eq("id", id).maybeSingle(),
    supabase
      .from("event_settings")
      .select("allow_companions, max_companions")
      .eq("event_id", id)
      .maybeSingle(),
    supabase
      .from("rsvps")
      .select("id, guest_name, status, companions, note, updated_at")
      .eq("event_id", id)
      .order("updated_at", { ascending: false }),
  ]);
  // RLS: si el evento no es tuyo, no regresa nada → 404.
  if (!event) notFound();
  if (error) return <p className="text-red-600">No se pudo cargar la asistencia.</p>;

  const list = rsvps ?? [];
  const going = list.filter((r) => r.status === "yes");
  const people = going.reduce((sum, r) => sum + 1 + r.companions, 0);
  const maybe = list.filter((r) => r.status === "maybe").length;
  const notGoing = list.filter((r) => r.status === "no").length;

  // RN-07: si bajaste el máximo de acompañantes después, las confirmaciones
  // que lo pasan se marcan para revisión (no se borran solas).
  const max = settings?.allow_companions ? (settings.max_companions ?? 0) : 0;
  const needsReview = (companions: number) => companions > max;

  return (
    <>
      <h1 className="text-2xl font-bold">Asistencia de {event.title}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={people} label="personas en total" help="(los que sí van + acompañantes)" />
        <Stat value={going.length} label="sí van" />
        <Stat value={maybe} label="tal vez" />
        <Stat value={notGoing} label="no van" />
      </div>

      {list.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          Nadie ha confirmado todavía. Comparte el link y el código desde la pestaña Evento.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => {
            const status = STATUS[r.status as keyof typeof STATUS];
            return (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{r.guest_name}</p>
                    {r.status !== "no" && r.companions > 0 && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        + {r.companions} acompañante{r.companions === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                {needsReview(r.companions) && (
                  <p className="rounded bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    ⚠️ Lleva más acompañantes de los que permites ahora ({max}). Revísalo con esa persona.
                  </p>
                )}
                {r.note && <p className="text-sm break-words whitespace-pre-line">“{r.note}”</p>}
                <form action={deleteRsvp.bind(null, id, r.id)}>
                  <ConfirmButton
                    question={
                      `¿Borrar la confirmación de ${r.guest_name}?\n\n` +
                      "Si ya generaste un código nuevo y esta persona no tiene regalos apartados, perderá el acceso."
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-sm text-red-700 hover:border-pink-500 dark:border-gray-700 dark:text-red-400"
                  >
                    Borrar
                  </ConfirmButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Stat({ value, label, help }: { value: number; label: string; help?: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-sm">{label}</span>
      {help && <span className="text-xs text-gray-500">{help}</span>}
    </div>
  );
}
