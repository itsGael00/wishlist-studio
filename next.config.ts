import type { NextConfig } from "next";

// ---------------------------------------------------------------------
// Encabezados de seguridad (lista 9.2 del plan)
// El navegador los lee en cada respuesta y se protege solo.
// ---------------------------------------------------------------------
const isDev = process.env.NODE_ENV === "development";
// En los previews de Vercel aparece su barra de comentarios (vercel.live).
// Solo ahí la dejamos cargar; en producción no.
const isPreview = process.env.VERCEL_ENV === "preview";
const vercelLive = isPreview ? " https://vercel.live" : "";

// CSP (Content Security Policy): la lista de lugares de donde la página
// puede cargar cosas. Si alguien lograra meter un <script> de otro sitio,
// el navegador se niega a ejecutarlo.
// - 'unsafe-inline' en scripts: Next.js mete scripts pequeños dentro del
//   HTML. La alternativa (nonces) obliga a renderizar todo en cada visita;
//   como React ya escapa el texto de los usuarios, aquí basta con esto.
// - 'unsafe-eval' solo en desarrollo (React lo usa para mostrar errores).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${vercelLive}`,
  `style-src 'self' 'unsafe-inline'${vercelLive}`,
  `img-src 'self' blob: data:${isPreview ? " https://vercel.live https://vercel.com" : ""}`,
  `font-src 'self'${isPreview ? " https://vercel.live https://assets.vercel.com" : ""}`,
  `connect-src 'self'${isPreview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `frame-src ${isPreview ? "https://vercel.live" : "'none'"}`,
  "object-src 'none'", // nada de Flash/plugins viejos
  "base-uri 'self'",
  "form-action 'self'", // los formularios solo se envían a tu sitio
  "frame-ancestors 'none'", // nadie puede meter tu sitio en un <iframe> (clickjacking)
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Lo mismo que frame-ancestors, para navegadores viejos.
  { key: "X-Frame-Options", value: "DENY" },
  // El navegador no "adivina" el tipo de archivo (evita trucos con archivos).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Al hacer clic en "Ver en tienda", la tienda NO ve el link del evento
  // (que lleva el token); solo ve "wishlist-studio-chi.vercel.app".
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La app no usa cámara, micrófono ni ubicación: los apagamos.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Siempre HTTPS durante 2 años (Vercel ya lo hace; esto lo deja explícito).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Quita el encabezado "X-Powered-By: Next.js" (no hay que anunciar qué usamos).
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
