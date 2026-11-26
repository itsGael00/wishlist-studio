import type { Metadata } from "next";

export const metadata: Metadata = { title: "Invitación · WishListStudio" };

// Vista del invitado: se construye en la semana 4 (pantalla del código,
// regalos, apartar y confirmar). Por ahora NO consulta nada de la base de
// datos, así que no muestra ningún dato del evento (regla RN-06b).
export default function GuestPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">🎁 Muy pronto</h1>
      <p className="text-gray-600 dark:text-gray-400">
        Aquí podrás ver la mesa de regalos y confirmar tu asistencia.
      </p>
    </main>
  );
}
