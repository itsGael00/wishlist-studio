"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export type GiftFormState = { error?: string; message?: string };

// Campos vacíos del formulario llegan como "", los guardamos como null.
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

const giftSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe el nombre del regalo.")
    .max(120, "Nombre: máximo 120 caracteres."),
  description: optionalText(1000, "Descripción"),
  // "1,299.50" o "1299.5" → 1299.5. Vacío → null (precio opcional).
  price_estimate: z
    .string()
    .trim()
    .transform((v) => v.replace(/[$,\s]/g, ""))
    .refine((v) => v === "" || /^\d{1,9}(\.\d{1,2})?$/.test(v), "Precio no válido (ejemplo: 1299.50).")
    .transform((v) => (v === "" ? null : Number(v))),
  // Solo links https:// (la base de datos también lo exige con un CHECK).
  store_url: z
    .string()
    .trim()
    .max(500, "Link: máximo 500 caracteres.")
    .refine((v) => {
      if (v === "") return true;
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    }, "El link debe empezar con https://")
    .transform((v) => (v === "" ? null : v)),
});

function readForm(formData: FormData) {
  return giftSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    price_estimate: formData.get("price_estimate") ?? "",
    store_url: formData.get("store_url") ?? "",
  });
}

const uuid = z.uuid();

export async function createGift(
  eventId: string,
  _prev: GiftFormState,
  formData: FormData,
): Promise<GiftFormState> {
  if (!uuid.safeParse(eventId).success) return { error: "Evento no válido." };
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase } = await requireUser();

  // El regalo nuevo va al final de la lista: posición = la más alta + 1.
  const { data: last } = await supabase
    .from("gifts")
    .select("position")
    .eq("event_id", eventId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  // RLS solo deja insertar regalos en eventos tuyos.
  const { error } = await supabase
    .from("gifts")
    .insert({ ...parsed.data, event_id: eventId, position: (last?.position ?? -1) + 1 });

  if (error) return { error: "No se pudo agregar el regalo. Intenta de nuevo." };

  refresh(); // vuelve a pintar la lista con el regalo nuevo
  return { message: `Agregaste "${parsed.data.name}" ✅` };
}

export async function updateGift(
  eventId: string,
  giftId: string,
  _prev: GiftFormState,
  formData: FormData,
): Promise<GiftFormState> {
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(giftId).success) {
    return { error: "Regalo no válido." };
  }
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("gifts")
    .update(parsed.data)
    .eq("id", giftId)
    .eq("event_id", eventId)
    .select("id");

  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };
  if (!data || data.length === 0) return { error: "No encontramos ese regalo." };

  redirect(`/panel/eventos/${eventId}/regalos`);
}

export async function deleteGift(eventId: string, giftId: string) {
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(giftId).success) return;

  const { supabase } = await requireUser();
  // Si el regalo estaba apartado, su apartado se borra también
  // (on delete cascade en la tabla reservations).
  await supabase.from("gifts").delete().eq("id", giftId).eq("event_id", eventId);
  refresh();
}

// Sube o baja un regalo un lugar en la lista.
export async function moveGift(eventId: string, giftId: string, direction: "up" | "down") {
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(giftId).success) return;

  const { supabase } = await requireUser();
  const { data: gifts } = await supabase
    .from("gifts")
    .select("id, position")
    .eq("event_id", eventId)
    .order("position")
    .order("created_at");
  if (!gifts) return;

  const from = gifts.findIndex((g) => g.id === giftId);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= gifts.length) return;

  // Intercambiamos los dos regalos en el arreglo y renumeramos 0, 1, 2…
  // Solo se guardan los que cambiaron de número.
  [gifts[from], gifts[to]] = [gifts[to], gifts[from]];
  await Promise.all(
    gifts.map((g, index) =>
      g.position === index
        ? null
        : supabase.from("gifts").update({ position: index }).eq("id", g.id),
    ),
  );
  refresh();
}

// RF-11: liberar un regalo apartado (por si alguien se arrepiente y no avisa,
// o para sacar a alguien que no debía entrar).
export async function releaseGift(eventId: string, giftId: string) {
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(giftId).success) return;

  const { supabase } = await requireUser();
  // RLS: solo puedes liberar apartados de tus eventos.
  await supabase.from("reservations").delete().eq("gift_id", giftId).eq("event_id", eventId);
  refresh();
}

// RF-10: ocultar o volver a mostrar un regalo (sirve sobre todo para las
// sugerencias de invitados que no te gusten). Oculto = los invitados no lo
// ven, pero no se borra: si estaba apartado, el apartado se conserva.
export async function setGiftHidden(eventId: string, giftId: string, hidden: boolean) {
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(giftId).success) return;

  const { supabase } = await requireUser();
  // RLS: solo puedes cambiar regalos de tus eventos.
  await supabase.from("gifts").update({ is_hidden: hidden }).eq("id", giftId).eq("event_id", eventId);
  refresh();
}
