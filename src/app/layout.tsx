import type { Metadata, Viewport } from "next";
import { Arimo, Montserrat } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// Акцентный шрифт гайдлайна (заголовки, крупные цифры)
const arimo = Arimo({
  variable: "--font-arimo",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Основной шрифт текстовых блоков. Фирменный Cygre — коммерческий шрифт,
// поэтому используется ближайший по геометрии веб-фолбэк (Montserrat).
// font-family: 'Cygre', Montserrat — при наличии Cygre локально будет применен он.
const montserrat = Montserrat({
  variable: "--font-body",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});
export const metadata: Metadata = {
  title: "МРТ ТОЧНО · CRM направляющих врачей",
  description:
    "Корпоративное веб-приложение для учета статистики и CRM-сопровождения направляющих врачей (внутренний контур).",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${arimo.variable} ${montserrat.variable} antialiased bg-background text-foreground`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
