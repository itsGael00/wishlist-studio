import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { updateGift } from "../actions";
import { GiftForm } from "../gift-form";

export const metadata: Metadata = { title: "Editar regalo · WishListStudio" };

export default function EditGiftPage({
  params,
}: PageProps<"/panel/eventos/[id]/regalos/[giftId]">) {
  return (
    <main className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-gray-500">Cargando regalo…</p>}>
        <EditGift params={params} />
      </Suspense>
    </main>
  );
}

async function EditGift({ params }: { params: Promise<{ id: string; giftId: string }> }) {
  const { id, giftId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(giftId).success) notFound();

  const { supabase } = await requireUser();
  const { data: gift } = await supabase
    .from("gifts")
    .select("id, name, description, price_estimate, store_url")
    .eq("id", giftId)
    .eq("event_id", id)
    .maybeSingle();
  if (!gift) notFound();

  return (
    <>
      <Link href={`/panel/eventos/${id}/regalos`} className="text-sm underline">
        ← Volver a la lista
      </Link>
      <h1 className="text-2xl font-bold">Editar regalo</h1>
      <GiftForm
        action={updateGift.bind(null, id, gift.id)}
        submitLabel="Guardar cambios"
        defaults={gift}
      />
    </>
  );
}
