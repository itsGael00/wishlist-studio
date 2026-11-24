// Estilos compartidos de formularios, para no repetir clases de Tailwind.
export const inputClass =
  "w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/30 dark:border-gray-700";

export const buttonClass =
  "rounded-lg bg-pink-600 px-4 py-2 font-medium text-white hover:bg-pink-700 disabled:opacity-60";

export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        {error}
      </p>
    );
  }
  if (message) {
    return (
      <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
        {message}
      </p>
    );
  }
  return null;
}
