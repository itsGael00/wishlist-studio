import Link from "next/link";
import { signOut } from "@/app/auth/actions";

// Marco común de todas las páginas del panel del anfitrión.
export default function PanelLayout({ children }: LayoutProps<"/panel">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <Link href="/panel" className="text-lg font-bold">
          WishListStudio 🎁
        </Link>
        <form action={signOut}>
          <button type="submit" className="text-sm font-medium underline">
            Cerrar sesión
          </button>
        </form>
      </header>
      <div className="mx-auto w-full max-w-2xl flex-1 p-6">{children}</div>
    </div>
  );
}
