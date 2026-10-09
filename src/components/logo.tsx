import { cn } from "@/lib/utils";

/**
 * Логотипы «МРТ ТОЧНО» — оригинальные файлы из брендбука:
 *  - на тёмном фоне — версия с белыми надписями (logo-white.png);
 *  - на светлом фоне — цветная версия (logo-color.png).
 * Полный логотип: aspect ≈ 4.45 (ширина ≈ 4.45 × высота).
 * Эмблема: aspect ≈ 1.10.
 */

export function LogoFull({
  className,
  /** Высота в px; ширина — автоматически по пропорциям оригинала */
  height = 36,
  /** light — белые надписи для тёмного фона; default — цветная версия для светлого */
  variant = "default",
}: {
  className?: string;
  height?: number;
  variant?: "default" | "light";
}) {
  return (
    <img
      src={variant === "light" ? "/logo-white.png" : "/logo-color.png"}
      alt="МРТ ТОЧНО · Троицк"
      style={{ height, width: "auto" }}
      className={cn("shrink-0 select-none", className)}
      draggable={false}
    />
  );
}

/** Эмблема (арка-томограф с фигурой человека) без словесной части */
export function LogoMark({
  className,
  size = 40,
  variant = "default",
}: {
  className?: string;
  size?: number;
  variant?: "default" | "light";
}) {
  return (
    <img
      src={variant === "light" ? "/logo-mark-white.png" : "/logo-mark-color.png"}
      alt=""
      style={{ height: size, width: "auto" }}
      className={cn("shrink-0 select-none", className)}
      aria-hidden="true"
      draggable={false}
    />
  );
}
