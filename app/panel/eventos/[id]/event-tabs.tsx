"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

// Pestañas del evento. Es "client" porque necesita saber en qué URL
// estás (usePathname) para resaltar la pestaña activa.
export function EventTabs() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `/panel/eventos/${id}`;

  const tabs = [
    { href: base, label: "Evento" },
    { href: `${base}/regalos`, label: "Regalos" },
    { href: `${base}/asistencia`, label: "Asistencia" },
    { href: `${base}/configuracion`, label: "Configuración" },
  ];

  return (
    <nav className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
      {tabs.map((tab) => {
        // "Regalos" sigue activa dentro de /regalos/<id-del-regalo>.
        const active =
          tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              active
                ? "border-pink-600 text-pink-700 dark:text-pink-400"
                : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
