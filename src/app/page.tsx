"use client";

import { SessionProvider } from "next-auth/react";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { LoginView } from "@/components/views/login-view";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { LogoMark } from "@/components/logo";

function Inner() {
  const { status } = useSession();
  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-soft">
        <LogoMark size={56} />
        <Loader2 className="h-5 w-5 animate-spin text-azure" />
        <p className="text-sm text-muted-foreground">Загрузка системы…</p>
      </div>
    );
  }
  if (status === "authenticated") return <AppShell />;
  return <LoginView />;
}

export default function Page() {
  return (
    <SessionProvider>
      <Providers>
        <Inner />
      </Providers>
    </SessionProvider>
  );
}
