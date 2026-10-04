import type {} from "fastify"
declare module "fastify" {
  interface FastifyRequest {
    userId: string
    tenantId: string
    role: "ADMIN" | "MEMBER" | "GUEST"
    isSuperAdmin: boolean
  }
}
export {}
