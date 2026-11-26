import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ConfirmButton } from "@/components/confirm-button";
import { requireUser } from "@/lib/auth";
import { deleteEvent } from "../../actions";
import { updateSettings } from "./actions";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Configuración · WishListStudio" };

export default function SettingsPage({ params }: PageProps<"/panel/eventos/[id]/configuracion">) {
  return (
    <main className="flex flex-col gap-8">
      <Suspense fallback={<p className="text-gray-500">Cargando configuración…</p>}>
        <EventSettings params={params} />
      </Suspense>
    </main>
  );
}

async function EventSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireUser();
  const [{ data: event }, { data: settings }] = await Promise.all([
    supabase.from("events").select("id, title").eq("id", id).maybeSingle(),
    supabase
      .from("event_settings")
      .select(
        "show_reserver_names, show_prices, allow_companions, max_companions, allow_suggestions, suggestion_min_price, suggestion_max_price, welcome_message",
      )
      .eq("event_id", id)
      .maybeSingle(),
  ]);
  if (!event || !settings) notFound();

  return (
    <>
      <h1 className="text-2xl font-bold">Configuración</h1>
      <SettingsForm action={updateSettings.bind(null, id)} defaults={settings} />

      <section className="flex flex-col gap-3 rounded-lg border border-red-300 p-4 dark:border-red-900">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Zona de peligro</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Borrar el evento elimina también sus regalos, apartados y confirmaciones. No se puede deshacer.
        </p>
        <form action={deleteEvent.bind(null, id)}>
          <ConfirmButton
            question={`¿Borrar "${event.title}" para siempre? Se perderán regalos, apartados y confirmaciones.`}
            className="rounded-lg border border-red-400 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Borrar evento
          </ConfirmButton>
        </form>
      </section>
    </>
  );
}
