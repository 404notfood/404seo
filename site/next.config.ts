import type { NextConfig } from "next";
import { join } from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://accounts.google.com" },
    ] }]
  },
  // PAS de bloc `turbopack` : sa simple presence force Turbopack au build,
  // qui echoue sur les dialectes SQLite de better-auth/kysely-adapter (non
  // utilises, on est sur prismaAdapter). On build donc en Webpack.
  // Equivalent de l'ancien turbopack.root pour le tracing standalone monorepo :
  outputFileTracingRoot: join(__dirname, ".."),
  // On externalise SEULEMENT kysely et son adapter (les dialectes SQLite
  // bun/d1/node non utilises qui cassaient le build). PAS better-auth :
  // better-auth contient aussi le client React (better-auth/react,
  // createAuthClient) ; l'externaliser lui donne un React different du bundle
  // -> "Cannot read properties of null (reading 'useRef')" au SSR. On le laisse
  // donc bundle normalement, et Webpack gere correctement ses imports.
  serverExternalPackages: ["kysely", "@better-auth/kysely-adapter"],
};

export default nextConfig;
