import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">No pudimos confirmar tu correo</h1>
      <p className="text-gray-600 dark:text-gray-400">
        El enlace ya expiró, ya se usó, o lo abriste en otro navegador. Intenta
        iniciar sesión; si tu correo aún no está confirmado, regístrate de nuevo
        para recibir otro enlace.
      </p>
      <Link href="/login" className="font-medium underline">
        Ir a iniciar sesión
      </Link>
    </main>
  );
}
