"use client";

import { useFormStatus } from "react-dom";

// Botón de enviar que pregunta "¿seguro?" antes de mandar el formulario.
// Va dentro de un <form action={...}>; si cancelas, no se envía nada.
export function ConfirmButton({
  children,
  question,
  className,
}: {
  children: React.ReactNode;
  question: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(question)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
