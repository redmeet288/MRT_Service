"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, qs } from "@/lib/api-client";
import type { City, CityData, CooperationStatus, DoctorItem, NomenclatureItem } from "@/lib/types";
import { useSession } from "next-auth/react";
import { SectionCard, EmptyState, DeleteButton, RowsSkeleton } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, MapPin, Building2, ListChecks, Tag, Users2 } from "lucide-react";

export function DictionariesView() {
  return (
    <Tabs defaultValue="cities" className="space-y-4">
      <TabsList className="bg-white border border-border h-11 p-1 rounded-lg">
        <TabsTrigger value="cities" className="gap-2 px-4 data-[state=active]:bg-sky-light data-[state=active]:text-brand">
          <MapPin className="h-4 w-4" strokeWidth={2} /> Города
        </TabsTrigger>
        <TabsTrigger value="lpus" className="gap-2 px-4 data-[state=active]:bg-sky-light data-[state=active]:text-brand">
          <Building2 className="h-4 w-4" strokeWidth={2} /> ЛПУ
        </TabsTrigger>
        <TabsTrigger value="nomenclature" className="gap-2 px-4 data-[state=active]:bg-sky-light data-[state=active]:text-brand">
          <ListChecks className="h-4 w-4" strokeWidth={2} /> Номенклатура
        </TabsTrigger>
        <TabsTrigger value="statuses" className="gap-2 px-4 data-[state=active]:bg-sky-light data-[state=active]:text-brand">
          <Tag className="h-4 w-4" strokeWidth={2} /> Статусы сотрудничества
        </TabsTrigger>
      </TabsList>

      <TabsContent value="cities"><CitiesTab /></TabsContent>
      <TabsContent value="lpus"><LpusTab /></TabsContent>
      <TabsContent value="nomenclature"><NomenclatureTab /></TabsContent>
      <TabsContent value="statuses"><StatusesTab /></TabsContent>
    </Tabs>
  );
}

/* ============ Города ============ */
function CitiesTab() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isMP = session?.user?.role === "MP";
  const [name, setName] = useState("");
  const { data: cities, isLoading } = useQuery<City[]>({
    queryKey: ["cities"],
    queryFn: () => api.get("/api/app/cities"),
  });

  const create = useMutation({
    mutationFn: () => api.post("/api/app/cities", { name }),
    onSuccess: () => {
      toast.success("Город добавлен");
      setName("");
      qc.invalidateQueries({ queryKey: ["cities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/cities?id=${id}`),
    onSuccess: () => {
      toast.success("Город удален");
      qc.invalidateQueries({ queryKey: ["cities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard
      title="Города"
      description="Справочник городов для привязки ЛПУ и врачей"
      action={
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Новый город…"
            className="w-56 bg-white"
            onKeyDown={(e) => e.key === "Enter" && name.trim() && create.mutate()}
          />
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending} className="gap-1.5">
            <Plus className="h-4 w-4" strokeWidth={2} /> Добавить
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <RowsSkeleton />
      ) : !cities?.length ? (
        <EmptyState />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Город</TableHead>
              <TableHead>ЛПУ</TableHead>
              <TableHead>Врачи (НВ)</TableHead>
              {isMP && <TableHead className="w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cities.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-brand">{c.name}</TableCell>
                <TableCell>{c._count?.lpus ?? 0}</TableCell>
                <TableCell>{c._count?.doctors ?? 0}</TableCell>
                {isMP && (
                  <TableCell>
                    <DeleteButton
                      title={`Удалить город «${c.name}»?`}
                      onConfirm={() => remove.mutateAsync(c.id)}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}

/* ============ ЛПУ ============ */
function LpusTab() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isMP = session?.user?.role === "MP";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CityData | null>(null);
  const [form, setForm] = useState({ name: "", cityId: "", address: "" });
  const [staffLpu, setStaffLpu] = useState<CityData | null>(null);

  const { data: cities } = useQuery<City[]>({
    queryKey: ["cities"],
    queryFn: () => api.get("/api/app/cities"),
  });
  const { data: lpus, isLoading } = useQuery<CityData[]>({
    queryKey: ["lpus"],
    queryFn: () => api.get("/api/app/lpus"),
  });
  const { data: staff } = useQuery<DoctorItem[]>({
    queryKey: ["lpu-staff", staffLpu?.id],
    queryFn: () => api.get(`/api/app/doctors${qs({ lpuId: staffLpu!.id })}`),
    enabled: !!staffLpu,
  });

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.put(`/api/app/lpus`, { id: editing.id, ...form }).then(() => null)
        : api.post("/api/app/lpus", form),
    onSuccess: () => {
      toast.success(editing ? "ЛПУ обновлено" : "ЛПУ добавлено");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["lpus"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/lpus?id=${id}`),
    onSuccess: () => {
      toast.success("ЛПУ удалено");
      qc.invalidateQueries({ queryKey: ["lpus"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm({ name: "", cityId: cities?.[0]?.id ?? "", address: "" });
    setDialogOpen(true);
  }
  function openEdit(l: CityData) {
    setEditing(l);
    setForm({ name: l.name, cityId: l.cityId, address: l.address ?? "" });
    setDialogOpen(true);
  }

  return (
    <>
      <SectionCard
        title="ЛПУ"
        description="Лечебно-профилактические учреждения, привязанные к городам. В карточке ЛПУ отображаются все НВ и их МП."
        action={
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" strokeWidth={2} /> Добавить ЛПУ
          </Button>
        }
      >
        {isLoading ? (
          <RowsSkeleton />
        ) : !lpus?.length ? (
          <EmptyState title="ЛПУ пока не добавлены" />
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Название</TableHead>
                  <TableHead>Город</TableHead>
                  <TableHead>Адрес</TableHead>
                  <TableHead>НВ</TableHead>
                  <TableHead>Заявки</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lpus.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setStaffLpu(l)}
                        className="font-medium text-azure hover:underline text-left"
                        title="Показать врачей ЛПУ"
                      >
                        {l.name}
                      </button>
                    </TableCell>
                    <TableCell>{l.city.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{l.address ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-sky-light text-brand border-transparent">
                        <Users2 className="h-3 w-3 mr-1" strokeWidth={2} />
                        {l._count?.doctors ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell>{l._count?.requests ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-sky hover:text-brand" onClick={() => openEdit(l)} aria-label="Редактировать">
                          <Pencil className="h-4 w-4" strokeWidth={2} />
                        </Button>
                        {isMP && (
                          <DeleteButton
                            title={`Удалить ЛПУ «${l.name}»?`}
                            onConfirm={() => remove.mutateAsync(l.id)}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* Диалог создания/редактирования ЛПУ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-brand">{editing ? "Редактирование ЛПУ" : "Новое ЛПУ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: ГКБ № 5" />
            </div>
            <div className="space-y-1.5">
              <Label>Город</Label>
              <Select value={form.cityId} onValueChange={(v) => setForm({ ...form, cityId: v })}>
                <SelectTrigger><SelectValue placeholder="Выберите город" /></SelectTrigger>
                <SelectContent>
                  {cities?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Адрес</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Улица, дом" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate()} disabled={!form.name.trim() || !form.cityId || save.isPending}>
              {editing ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Карточка ЛПУ: все НВ и их МП (двусторонняя навигация) */}
      <Dialog open={!!staffLpu} onOpenChange={(o) => !o && setStaffLpu(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-brand">{staffLpu?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            {staffLpu?.city.name}{staffLpu?.address ? `, ${staffLpu.address}` : ""} · Направляющие врачи и курирующие МП
          </p>
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {!staff?.length ? (
              <EmptyState title="К ЛПУ не привязаны врачи" hint="Привяжите НВ в карточке врача" />
            ) : (
              staff.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-border bg-white p-3">
                  <div>
                    <p className="text-sm font-medium text-brand">{d.fullName}</p>
                    <p className="text-xs text-muted-foreground">МП: {d.mp.name}</p>
                  </div>
                  {d.status && (
                    <Badge variant="outline" className="text-[11px]" style={{ borderColor: d.status.color, color: d.status.color }}>
                      {d.status.name}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ============ Номенклатура ============ */
function NomenclatureTab() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isMP = session?.user?.role === "MP";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NomenclatureItem | null>(null);
  const [form, setForm] = useState({ name: "", category: "Обследования" });

  const { data: items, isLoading } = useQuery<NomenclatureItem[]>({
    queryKey: ["nomenclature"],
    queryFn: () => api.get("/api/app/nomenclature"),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, NomenclatureItem[]>();
    items?.forEach((i) => {
      const arr = map.get(i.category) ?? [];
      arr.push(i);
      map.set(i.category, arr);
    });
    return Array.from(map.entries());
  }, [items]);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.put(`/api/app/nomenclature`, { id: editing.id, ...form })
        : api.post("/api/app/nomenclature", form),
    onSuccess: () => {
      toast.success(editing ? "Позиция обновлена" : "Позиция добавлена");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["nomenclature"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/nomenclature?id=${id}`),
    onSuccess: (r: { deactivated?: boolean }) => {
      toast.success(r.deactivated ? "Позиция используется — деактивирована" : "Позиция удалена");
      qc.invalidateQueries({ queryKey: ["nomenclature"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <SectionCard
        title="Номенклатура"
        description="Справочник услуг/обследований для полей «Что назначено» и «Что сделано»"
        action={
          <Button onClick={() => { setEditing(null); setForm({ name: "", category: "Обследования" }); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" strokeWidth={2} /> Добавить
          </Button>
        }
      >
        {isLoading ? (
          <RowsSkeleton />
        ) : !grouped.length ? (
          <EmptyState />
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-5 pr-1">
            {grouped.map(([category, list]) => (
              <div key={category}>
                <div className="text-xs font-semibold uppercase tracking-wide text-sky mb-2">{category}</div>
                <div className="rounded-lg border border-border overflow-hidden">
                  {list.map((n, idx) => (
                    <div
                      key={n.id}
                      className={`flex items-center justify-between px-4 py-2.5 bg-white ${idx > 0 ? "border-t border-border" : ""}`}
                    >
                      <span className={`text-sm ${n.isActive ? "text-brand font-medium" : "text-muted-foreground line-through"}`}>
                        {n.name}
                        {!n.isActive && <span className="ml-2 text-[10px] text-terra-dark">неактивна</span>}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-sky hover:text-brand"
                          onClick={() => { setEditing(n); setForm({ name: n.name, category: n.category }); setDialogOpen(true); }}
                          aria-label="Редактировать"
                        >
                          <Pencil className="h-4 w-4" strokeWidth={2} />
                        </Button>
                        {isMP && <DeleteButton onConfirm={() => remove.mutateAsync(n.id)} title={`Удалить «${n.name}»?`} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-brand">{editing ? "Редактирование позиции" : "Новая позиция номенклатуры"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Наименование</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: МРТ головного мозга" />
            </div>
            <div className="space-y-1.5">
              <Label>Категория</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Обследования / Комплексные" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
              {editing ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ============ Статусы сотрудничества ============ */
function StatusesTab() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isMP = session?.user?.role === "MP";
  const [name, setName] = useState("");
  const { data: items, isLoading } = useQuery<CooperationStatus[]>({
    queryKey: ["statuses"],
    queryFn: () => api.get("/api/app/statuses"),
  });

  const create = useMutation({
    mutationFn: () => api.post("/api/app/statuses", { name }),
    onSuccess: () => {
      toast.success("Статус добавлен");
      setName("");
      qc.invalidateQueries({ queryKey: ["statuses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/statuses?id=${id}`),
    onSuccess: () => {
      toast.success("Статус удален");
      qc.invalidateQueries({ queryKey: ["statuses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard
      title="Статусы сотрудничества"
      description="Варианты сотрудничества с НВ (ИП, СЗ, штат и др.)"
      action={
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Новый статус…"
            className="w-56 bg-white"
            onKeyDown={(e) => e.key === "Enter" && name.trim() && create.mutate()}
          />
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending} className="gap-1.5">
            <Plus className="h-4 w-4" strokeWidth={2} /> Добавить
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <RowsSkeleton />
      ) : !items?.length ? (
        <EmptyState />
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm font-medium"
              style={{ borderColor: `${s.color}66`, color: s.color }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
              <span className="text-[10px] text-muted-foreground">({s._count?.doctors ?? 0})</span>
              {isMP && (
                <button
                  type="button"
                  onClick={() => remove.mutate(s.id)}
                  className="ml-1 text-muted-foreground hover:text-terra-dark"
                  aria-label={`Удалить статус ${s.name}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
