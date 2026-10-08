"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LogoFull } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";

export function LoginView() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      login,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Неверный логин или пароль");
    } else {
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex bg-soft">
      {/* Левая брендовая панель */}
      <div className="hidden lg:flex flex-col justify-between w-[44%] bg-brand-deep relative overflow-hidden">
        <div className="mrt-pattern absolute inset-0" />
        <div className="relative p-10 flex items-center gap-4">
          <LogoFull markSize={64} variant="light" />
        </div>
        <div className="relative px-10 pb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-1.5 text-xs font-medium text-sky-light mb-6">
            <ShieldCheck className="h-4 w-4 text-terra" strokeWidth={2} />
            Внутренний контур · Доступ по ролям
          </div>
          <h2 className="font-display text-4xl font-bold text-white leading-tight max-w-md">
            CRM-сопровождение направляющих врачей
          </h2>
          <p className="mt-4 text-sky/90 text-sm leading-relaxed max-w-md">
            Учет статистики направлений, визиты, календарь МП и отчетность
            по обследованиям — в едином рабочем пространстве диагностического центра.
          </p>
        </div>
      </div>

      {/* Правая часть — форма входа */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex justify-center">
            <LogoFull markSize={48} />
          </div>
          <Card className="border-border shadow-[0_8px_32px_rgba(25,70,136,0.08)] rounded-xl">
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-1">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-light">
                  <LockKeyhole className="h-5 w-5 text-brand" strokeWidth={2} />
                </span>
                <div>
                  <h1 className="font-display text-xl font-bold text-brand">Вход в систему</h1>
                  <p className="text-xs text-muted-foreground">Авторизация по логину и паролю</p>
                </div>
              </div>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login">Логин</Label>
                  <Input
                    id="login"
                    autoComplete="username"
                    placeholder="например, m.ivanova"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Пароль</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <div
                    role="alert"
                    className="rounded-lg bg-terra-light border border-terra/50 px-4 py-2.5 text-sm text-brand-dark"
                  >
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full h-11 gap-2 text-[15px]" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" strokeWidth={2} />}
                  Войти
                </Button>
              </form>

              <div className="mt-6 rounded-lg bg-muted border border-border p-4">
                <p className="text-xs font-semibold text-brand mb-2 uppercase tracking-wide">
                  Демонстрационные учетные записи
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 font-mono">
                  <li>МП: m.ivanova / mrtno2026 · a.petrov / mrtno2026</li>
                  <li>Оператор: a.sidorova / mrtno2026</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
