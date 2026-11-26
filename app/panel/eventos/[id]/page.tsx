import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isoToLocalInput } from "@/lib/fechas";
import { updateEvent } from "../actions";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "Editar evento · WishListStudio" };

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
    .select("id, title, description, location_text, starts_at")
    .eq("id", id)
    .maybeSingle();

  if (!event) notFound();

  return (
    <>
      <h1 className="text-2xl font-bold">Editar evento</h1>
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
