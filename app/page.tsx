import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">WishListStudio 🎁</h1>
      <p className="text-lg text-gray-600">
        Hola mundo. Aquí vivirá la mesa de regalos.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-pink-600 px-4 py-2 font-medium text-white hover:bg-pink-700"
      >
        Entrar como anfitrión
      </Link>
    </main>
  );
}