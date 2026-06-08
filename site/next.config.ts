import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: "..",
  },
  // better-auth embarque des dialectes kysely (SQLite bun/d1/node) qu'on
  // n'utilise pas (on est sur prismaAdapter + PostgreSQL). Turbopack tente de
  // les bundler statiquement et echoue sur des exports kysely inexistants.
  // On force ces paquets serveur a rester externes (require Node natif) :
  // ils ne sont jamais bundles, donc plus d'erreur de build.
  serverExternalPackages: ["better-auth", "kysely", "@better-auth/kysely-adapter"],
};

export default nextConfig;
