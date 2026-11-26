"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { localInputToIso } from "@/lib/fechas";

export type EventFormState = { error?: string; message?: string };

// Campos vacíos del formulario llegan como "", los guardamos como null.
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

const eventSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Escribe un título.")
    .max(120, "Título: máximo 120 caracteres."),
  description: optionalText(2000, "Descripción"),
  location_text: optionalText(200, "Lugar"),
  starts_at: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), "Fecha no válida.")
    .transform((v) => (v === "" ? null : localInputToIso(v))),
});

function readForm(formData: FormData) {
  return eventSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    location_text: formData.get("location_text") ?? "",
    starts_at: formData.get("starts_at") ?? "",
  });
}

export async function createEvent(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase } = await requireUser();
  // owner_id lo pone la base de datos (default auth.uid()) y RLS lo verifica.
  const { data, error } = await supabase
    .from("events")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error || !data) return { error: "No se pudo crear el evento. Intenta de nuevo." };

  redirect(`/panel/eventos/${data.id}`);
}

// El id del evento llega "amarrado" con .bind() desde la página de edición.
export async function updateEvent(
  eventId: string,
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  if (!z.uuid().safeParse(eventId).success) return { error: "Evento no válido." };

  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase } = await requireUser();
  // RLS solo deja editar eventos propios. Si el evento es de otra persona,
  // simplemente no se actualiza ninguna fila.
  const { data, error } = await supabase
    .from("events")
    .update(parsed.data)
    .eq("id", eventId)
    .select("id");

  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };
  if (!data || data.length === 0) return { error: "No encontramos ese evento." };

  return { message: "Cambios guardados ✅" };
}

// Genera un código de acceso nuevo. El anterior deja de servir al instante.
// Todo lo hace la función regenerate_access_code() de la base de datos
// (migración 0003): crea el código, sube la versión y revisa que seas el dueño.
export async function regenerateAccessCode(eventId: string) {
  if (!z.uuid().safeParse(eventId).success) return;

  const { supabase } = await requireUser();
  await supabase.rpc("regenerate_access_code", { p_event_id: eventId });
  refresh();
}

// Borra el evento y TODO lo que cuelga de él: configuración, regalos,
// apartados y confirmaciones (on delete cascade en la base de datos).
export async function deleteEvent(eventId: string) {
  if (!z.uuid().safeParse(eventId).success) return;

  const { supabase } = await requireUser();
  await supabase.from("events").delete().eq("id", eventId);
  redirect("/panel");
}
