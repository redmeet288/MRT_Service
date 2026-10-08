import { cn } from "@/lib/utils";

/**
 * Эмблема «МРТ ТОЧНО» — реконструкция по гайдлайну (июнь 2026):
 * арка (контур томографа), концентрические дуги, фигура человека.
 * Цвета строго из фирменной палитры. Без теней и градиентов.
 */
export function LogoMark({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {/* Арка — светло-голубой контур */}
      <path
        d="M 12 74 A 52 52 0 0 1 116 74 L 116 106 Q 116 120 102 120 L 26 120 Q 12 120 12 106 Z"
        stroke="#7692cb"
        strokeWidth="8"
        fill="none"
      />
      {/* Внутренняя дуга — светло-голубая */}
      <path
        d="M 43.2 84 A 24 24 0 1 1 84.8 84"
        stroke="#7692cb"
        strokeWidth="8"
        fill="none"
      />
      {/* Внешняя дуга — тёмно-синяя */}
      <path
        d="M 26.4 85.7 A 40 40 0 1 1 101.6 85.7"
        stroke="#194688"
        strokeWidth="10"
        fill="none"
      />
      {/* Голова — тёплый терракот */}
      <circle cx="64" cy="72" r="9" fill="#e8a486" />
      {/* Фигура человека — тёмно-синяя */}
      <path d="M 37 112 A 27 27 0 0 1 91 112 Z" fill="#194688" />
      {/* Платформа-дуга — светло-голубая */}
      <path
        d="M 30 106 A 42 26 0 0 0 98 106"
        stroke="#7692cb"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Основная версия логотипа: эмблема + словесная часть + «Троицк» */
export function LogoFull({
  className,
  markSize = 44,
  variant = "default",
}: {
  className?: string;
  markSize?: number;
  variant?: "default" | "light";
}) {
  const titleColor = variant === "light" ? "#ffffff" : "#194688";
  const subColor = variant === "light" ? "#e3eaf8" : "#194688";
  return (
    <span className={cn("flex items-center gap-3 select-none", className)}>
      <LogoMark size={markSize} />
      <span className="flex flex-col leading-none">
        <span
          className="font-display font-bold tracking-tight"
          style={{ color: titleColor, fontSize: markSize * 0.52 }}
        >
          МРТ ТОЧНО
        </span>
        <span
          className="font-display mt-1"
          style={{ color: subColor, fontSize: markSize * 0.33, opacity: variant === "light" ? 0.85 : 1 }}
        >
          Троицк
        </span>
      </span>
    </span>
  );
}
