"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

// Borrar la confirmación de un invitado. Sirve para dos cosas:
// 1. Limpiar respuestas de prueba o repetidas.
// 2. "Sacar" a alguien: si el código ya cambió y esa persona no tiene
//    regalos apartados, pierde el acceso (RN-06).
export async function deleteRsvp(eventId: string, rsvpId: string) {
  if (!z.uuid().safeParse(eventId).success || !z.uuid().safeParse(rsvpId).success) return;

  const { supabase } = await requireUser();
  // RLS: solo puedes borrar confirmaciones de tus eventos.
  await supabase.from("rsvps").delete().eq("id", rsvpId).eq("event_id", eventId);
  refresh();
}
