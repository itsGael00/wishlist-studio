import Link from "next/link";
import { Suspense } from "react";
import { EventTabs } from "./event-tabs";

// Marco común de las páginas de UN evento: regresar + pestañas.
export default function EventLayout({ children }: LayoutProps<"/panel/eventos/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel" className="text-sm underline">
        ← Mis eventos
      </Link>
      {/* Las pestañas leen la URL, que solo se conoce al pedir la página:
          por eso van dentro de <Suspense> (regla de cacheComponents). */}
      <Suspense fallback={<div className="h-10 border-b border-gray-200 dark:border-gray-800" />}>
        <EventTabs />
      </Suspense>
      {children}
    </div>
  );
}
