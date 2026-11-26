import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { formatearCodigo } from "@/lib/codigo";
import { isoToLocalInput } from "@/lib/fechas";
import { getOrigin } from "@/lib/sitio";
import { regenerateAccessCode, updateEvent } from "../actions";
import { EventForm } from "../event-form";
import { ShareBox } from "./share-box";

export const metadata: Metadata = { title: "Evento · WishListStudio" };

export default function EditEventPage({ params }: PageProps<"/panel/eventos/[id]">) {
  return (
    <main className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-gray-500">Cargando evento…</p>}>
        <EditEvent params={params} />
      </Suspense>
    </main>
  );
}

async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireUser();
  // Si el evento es de otra persona, RLS hace que no regrese nada → 404.
  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, location_text, starts_at, invite_token, access_code")
    .eq("id", id)
    .maybeSingle();

  if (!event) notFound();

  const origin = await getOrigin();

  return (
    <>
      <h1 className="text-2xl font-bold">{event.title}</h1>
      <ShareBox
        link={`${origin}/e/${event.invite_token}`}
        code={formatearCodigo(event.access_code)}
        eventTitle={event.title}
        regenerate={regenerateAccessCode.bind(null, event.id)}
      />
      <h2 className="text-xl font-semibold">Datos del evento</h2>
      <EventForm
        action={updateEvent.bind(null, event.id)}
        submitLabel="Guardar cambios"
        defaults={{
          title: event.title,
          description: event.description,
          location_text: event.location_text,
          starts_at_local: event.starts_at ? isoToLocalInput(event.starts_at) : undefined,
        }}
      />
    </>
  );
}
