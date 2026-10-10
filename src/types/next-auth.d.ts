import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/types";

// ============================================================
// Аугментация типов next-auth: в сессию и JWT добавляются uid и
// роль (MP | OPERATOR), которые кладутся в колбэках auth.ts.
// ============================================================

declare module "next-auth" {
  interface Session {
    user?: {
      uid?: string;
      role?: Role;
    } & DefaultSession["user"];
  }

  interface User {
    uid?: string;
    role?: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
  }
}
