import type { Metadata } from "next";
import Link from "next/link";
import { createEvent } from "../actions";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "Nuevo evento · WishListStudio" };

export default function NewEventPage() {
  return (
    <main className="flex flex-col gap-6">
      <Link href="/panel" className="text-sm underline">
        ← Mis eventos
      </Link>
      <h1 className="text-2xl font-bold">Nuevo evento</h1>
      <EventForm action={createEvent} submitLabel="Crear evento" />
    </main>
  );
}
