import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatearFecha } from "@/lib/fechas";

export const metadata: Metadata = { title: "Mi panel · WishListStudio" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  closed: "Cerrado",
};

export default function PanelPage() {
  return (
    <main className="flex flex-col gap-6">
      {/* Lo que lee la sesión va dentro de <Suspense>: así lo pide
          Next.js 16 con cacheComponents, y el resto de la página carga al instante. */}
      <Suspense fallback={<p className="text-gray-500">Cargando…</p>}>
        <Greeting />
      </Suspense>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Mis eventos</h2>
        <Link href="/panel/eventos/nuevo" className={buttonClass}>
          + Nuevo evento
        </Link>
      </div>

      <Suspense fallback={<p className="text-gray-500">Cargando eventos…</p>}>
        <EventList />
      </Suspense>
    </main>
  );
}

async function Greeting() {
  const { supabase, userId } = await requireUser();

  // RLS garantiza que solo puedes leer TU perfil.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  return (
    <h1 className="text-2xl font-bold">
      Hola{profile?.display_name ? `, ${profile.display_name}` : ""} 👋
    </h1>
  );
}

async function EventList() {
  const { supabase } = await requireUser();

  // No filtramos por owner_id aquí: RLS ya regresa solo tus eventos.
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, starts_at, status")
    .order("created_at", { ascending: false });

  if (error) return <p className="text-red-600">No se pudieron cargar tus eventos.</p>;
  if (!events || events.length === 0) {
    return <p className="text-gray-600 dark:text-gray-400">Aún no tienes eventos. ¡Crea el primero!</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            href={`/panel/eventos/${event.id}`}
            className="block rounded-lg border border-gray-200 p-4 hover:border-pink-500 dark:border-gray-800"
          >
            <p className="font-semibold">{event.title}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {event.starts_at ? formatearFecha(event.starts_at) : "Sin fecha"} ·{" "}
              {STATUS_LABEL[event.status] ?? event.status}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
