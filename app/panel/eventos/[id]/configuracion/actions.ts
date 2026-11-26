"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export type SettingsFormState = { error?: string; message?: string };

// Un checkbox marcado llega como "on"; sin marcar, no llega (null).
const checkbox = z.preprocess((v) => v === "on", z.boolean());

// Número opcional: "" → null.
const optionalNumber = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[$,\s]/g, ""))
    .refine((v) => v === "" || /^\d{1,9}(\.\d{1,2})?$/.test(v), `${label}: número no válido.`)
    .transform((v) => (v === "" ? null : Number(v)));

const settingsSchema = z
  .object({
    show_reserver_names: checkbox,
    show_prices: checkbox,
    allow_companions: checkbox,
    max_companions: optionalNumber("Máximo de acompañantes"),
    allow_suggestions: checkbox,
    suggestion_min_price: optionalNumber("Precio mínimo"),
    suggestion_max_price: optionalNumber("Precio máximo"),
    welcome_message: z
      .string()
      .trim()
      .max(1000, "Mensaje de bienvenida: máximo 1000 caracteres.")
      .transform((v) => (v === "" ? null : v)),
  })
  // Las mismas reglas que los CHECK de la base de datos (migración 0001),
  // pero con mensajes en español para el formulario.
  .superRefine((s, ctx) => {
    if (s.allow_companions) {
      const max = s.max_companions;
      if (max === null || !Number.isInteger(max) || max < 1 || max > 20) {
        ctx.addIssue({ code: "custom", message: "Máximo de acompañantes: un número entero de 1 a 20." });
      }
    }
    if (s.allow_suggestions) {
      const { suggestion_min_price: min, suggestion_max_price: max } = s;
      if (min === null || max === null) {
        ctx.addIssue({ code: "custom", message: "Escribe el precio mínimo y el máximo de las sugerencias." });
      } else if (min > max) {
        ctx.addIssue({ code: "custom", message: "El precio mínimo no puede ser mayor que el máximo." });
      }
    }
  })
  // Si una opción está apagada, sus campos se guardan vacíos.
  .transform((s) => ({
    ...s,
    max_companions: s.allow_companions ? s.max_companions : null,
    suggestion_min_price: s.allow_suggestions ? s.suggestion_min_price : null,
    suggestion_max_price: s.allow_suggestions ? s.suggestion_max_price : null,
  }));

export async function updateSettings(
  eventId: string,
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  if (!z.uuid().safeParse(eventId).success) return { error: "Evento no válido." };

  const parsed = settingsSchema.safeParse({
    show_reserver_names: formData.get("show_reserver_names"),
    show_prices: formData.get("show_prices"),
    allow_companions: formData.get("allow_companions"),
    max_companions: formData.get("max_companions") ?? "",
    allow_suggestions: formData.get("allow_suggestions"),
    suggestion_min_price: formData.get("suggestion_min_price") ?? "",
    suggestion_max_price: formData.get("suggestion_max_price") ?? "",
    welcome_message: formData.get("welcome_message") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase } = await requireUser();
  // RLS: solo puedes editar la configuración de tus eventos.
  const { data, error } = await supabase
    .from("event_settings")
    .update(parsed.data)
    .eq("event_id", eventId)
    .select("event_id");

  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };
  if (!data || data.length === 0) return { error: "No encontramos ese evento." };

  refresh();
  return { message: "Configuración guardada ✅" };
}
