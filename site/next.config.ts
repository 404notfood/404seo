import type { NextConfig } from "next";
import { join } from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // PAS de bloc `turbopack` : sa simple presence force Turbopack au build,
  // qui echoue sur les dialectes SQLite de better-auth/kysely-adapter (non
  // utilises, on est sur prismaAdapter). On build donc en Webpack.
  // Equivalent de l'ancien turbopack.root pour le tracing standalone monorepo :
  outputFileTracingRoot: join(__dirname, ".."),
  // better-auth embarque des dialectes kysely (SQLite bun/d1/node) qu'on
  // n'utilise pas. On force ces paquets serveur a rester externes (require
  // Node natif) : ils ne sont jamais bundles, donc plus d'erreur de build.
  serverExternalPackages: ["better-auth", "kysely", "@better-auth/kysely-adapter"],
};

export default nextConfig;
