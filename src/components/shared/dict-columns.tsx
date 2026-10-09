"use client";

// ============================================================
// Настройка столбцов таблиц справочников (доработка 1.3):
// — выбор отображаемых столбцов (чекбоксы);
// — изменение порядка столбцов (вверх/вниз);
// — сохранение в localStorage по ключу справочника;
// — используется списками НВ, ЛПУ, городов, номенклатуры,
//   специализаций и статусов.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Columns3, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface DictCol {
  key: string;
  label: string;
}

const orderStorageKey = (dictKey: string) => `mrt-dict-cols-order-${dictKey}`;
const hiddenStorageKey = (dictKey: string) => `mrt-dict-cols-hidden-${dictKey}`;

interface StoredState {
  order: string[];
  hidden: string[];
}

function loadState(dictKey: string, allKeys: string[]): StoredState {
  if (typeof window === "undefined") return { order: allKeys, hidden: [] };
  try {
    const rawOrder = window.localStorage.getItem(orderStorageKey(dictKey));
    const rawHidden = window.localStorage.getItem(hiddenStorageKey(dictKey));
    let order: string[] = [];
    if (rawOrder) {
      const saved = JSON.parse(rawOrder) as unknown;
      if (Array.isArray(saved)) order = saved.filter((k): k is string => typeof k === "string" && allKeys.includes(k));
    }
    // колонки, появившиеся после сохранения, добавляем в конец
    allKeys.forEach((k) => {
      if (!order.includes(k)) order.push(k);
    });
    let hidden: string[] = [];
    if (rawHidden) {
      const saved = JSON.parse(rawHidden) as unknown;
      if (Array.isArray(saved)) hidden = saved.filter((k): k is string => typeof k === "string" && allKeys.includes(k));
    }
    return { order, hidden };
  } catch {
    return { order: allKeys, hidden: [] };
  }
}

/**
 * Управление составом и порядком столбцов таблицы справочника.
 * Возвращает видимые столбцы (в сохраненном порядке), кнопку «Столбцы…»
 * и готовый диалог настройки.
 */
export function useDictColumns(dictKey: string, allCols: readonly DictCol[]) {
  const allKeys = useMemo(() => allCols.map((c) => c.key), [allCols]);
  // До монтирования — полный состав (совпадает с SSR), затем состояние из localStorage
  const [order, setOrder] = useState<string[]>(() => allCols.map((c) => c.key));
  const [hidden, setHidden] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const s = loadState(dictKey, allKeys);
    // Гидрация сохраненной настройки после монтирования: localStorage — внешняя
    // система, SSR отрисовывает состав по умолчанию (иначе — mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(s.order);
    setHidden(s.hidden);
    setHydrated(true);
  }, [dictKey, allKeys]);

  const persist = useCallback(
    (nextOrder: string[], nextHidden: string[]) => {
      try {
        window.localStorage.setItem(orderStorageKey(dictKey), JSON.stringify(nextOrder));
        window.localStorage.setItem(hiddenStorageKey(dictKey), JSON.stringify(nextHidden));
      } catch {
        // localStorage может быть недоступен — настройка просто не сохранится
      }
    },
    [dictKey]
  );

  const setVisible = useCallback(
    (key: string, visible: boolean) => {
      setHidden((prevHidden) => {
        const nextHidden = visible
          ? prevHidden.filter((k) => k !== key)
          : prevHidden.includes(key)
            ? prevHidden
            : [...prevHidden, key];
        // не даем скрыть последний видимый столбец
        const visibleCount = order.length - nextHidden.length;
        if (visibleCount < 1) return prevHidden;
        persist(order, nextHidden);
        return nextHidden;
      });
    },
    [order, persist]
  );

  const move = useCallback(
    (key: string, dir: -1 | 1) => {
      setOrder((prev) => {
        const idx = prev.indexOf(key);
        const to = idx + dir;
        if (idx < 0 || to < 0 || to >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[to]] = [next[to], next[idx]];
        persist(next, hidden);
        return next;
      });
    },
    [hidden, persist]
  );

  const reset = useCallback(() => {
    persist(allKeys, []);
    setOrder(allKeys);
    setHidden([]);
  }, [allKeys, persist]);

  /** Все столбцы в текущем сохраненном порядке (включая скрытые) */
  const orderedCols = useMemo(
    () =>
      order
        .map((k) => allCols.find((c) => c.key === k))
        .filter((c): c is DictCol => Boolean(c)),
    [order, allCols]
  );

  /** Видимые столбцы таблицы (порядок + фильтр скрытых) */
  const visibleCols = useMemo(
    () => orderedCols.filter((c) => !hidden.includes(c.key)),
    [orderedCols, hidden]
  );

  const settingsButton = (
    <button
      type="button"
      className="onec-btn"
      onClick={() => setOpen(true)}
      title="Настроить видимость и порядок столбцов"
      aria-label="Настроить столбцы таблицы"
    >
      <Columns3 className="h-3.5 w-3.5" strokeWidth={2} />
      Столбцы…
    </button>
  );

  const settingsDialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-brand">Настройка столбцов</DialogTitle>
          <DialogDescription>
            Отметьте столбцы, которые должны отображаться в списке, и при необходимости измените
            их порядок стрелками. Настройка сохраняется для этого справочника.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border bg-white p-2">
          {orderedCols.map((c, idx) => {
            const visible = !hidden.includes(c.key);
            return (
              <div
                key={c.key}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-sky-light/60"
              >
                <Checkbox
                  checked={visible}
                  disabled={visible && visibleCols.length === 1}
                  onCheckedChange={(checked) => setVisible(c.key, checked === true)}
                  aria-label={`Показывать столбец «${c.label}»`}
                />
                <span className={cn("flex-1 text-sm text-brand", !visible && "text-muted-foreground line-through")}>
                  {c.label}
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-sky hover:text-brand"
                    disabled={idx === 0}
                    onClick={() => move(c.key, -1)}
                    aria-label={`Переместить столбец «${c.label}» выше`}
                  >
                    <ChevronUp className="h-4 w-4" strokeWidth={2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-sky hover:text-brand"
                    disabled={idx === orderedCols.length - 1}
                    onClick={() => move(c.key, 1)}
                    aria-label={`Переместить столбец «${c.label}» ниже`}
                  >
                    <ChevronDown className="h-4 w-4" strokeWidth={2} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Видимых столбцов: {visibleCols.length} из {orderedCols.length}
        </p>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={reset} className="gap-1.5 text-brand hover:bg-sky-light">
            <RotateCcw className="h-4 w-4" strokeWidth={2} />
            По умолчанию
          </Button>
          <Button onClick={() => setOpen(false)}>Готово</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { visibleCols, orderedCols, hydrated, settingsButton, settingsDialog, resetColumns: reset };
}
