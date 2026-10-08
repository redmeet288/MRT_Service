"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { Role, UserItem } from "@/lib/types";
import { SectionCard, EmptyState, DeleteButton, RowsSkeleton } from "@/components/shared/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Users2, ShieldCheck, KeyRound } from "lucide-react";

interface UserForm {
  login: string;
  name: string;
  role: Role;
  password: string;
}

const EMPTY_FORM: UserForm = { login: "", name: "", role: "OPERATOR", password: "" };

export function UsersView() {
  const { data: session } = useSession();
  const isMP = session?.user?.role === "MP";

  if (!isMP) {
    return (
      <EmptyState
        title="Доступно только МП"
        hint="Управление пользователями доступно пользователям с ролью «МП · Администратор территории»."
        className="rounded-xl border border-dashed border-sky/50 bg-white/60"
      />
    );
  }
  const uid = (session?.user as { uid?: string } | undefined)?.uid ?? "";
  return <UsersTable currentUserId={uid} />;
}

function UsersTable({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);

  const { data: users, isLoading } = useQuery<UserItem[]>({
    queryKey: ["users"],
    queryFn: () => api.get<UserItem[]>("/api/app/users"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/api/app/users", {
        login: form.login,
        name: form.name,
        role: form.role,
        password: form.password,
      }),
    onSuccess: () => {
      toast.success("Пользователь создан");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: () =>
      api.put(`/api/app/users/${editing!.id}`, {
        name: form.name,
        role: form.role,
        ...(form.password ? { password: form.password } : {}),
      }),
    onSuccess: () => {
      toast.success("Пользователь обновлен");
      setEditing(null);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/users/${id}`),
    onSuccess: () => {
      toast.success("Пользователь деактивирован");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  function openEdit(u: UserItem) {
    setEditing(u);
    setForm({ login: u.login, name: u.name, role: u.role, password: "" });
    setCreateOpen(true);
  }

  const isEdit = !!editing;
  const dialogOpen = createOpen || isEdit;

  return (
    <>
      <SectionCard
        title="Пользователи системы"
        description="МП · Администраторы территории и Операторы. Роль МП дает доступ к удалению справочников, импорту и журналу действий."
        action={
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" strokeWidth={2} /> Добавить пользователя
          </Button>
        }
      >
        {isLoading ? (
          <RowsSkeleton />
        ) : !users?.length ? (
          <EmptyState title="Пользователи не найдены" />
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Имя</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Курируемых НВ</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium text-brand">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.login}</p>
                    </TableCell>
                    <TableCell>
                      {u.role === "MP" ? (
                        <Badge className="bg-brand text-white hover:bg-brand gap-1">
                          <ShieldCheck className="h-3 w-3" strokeWidth={2} /> МП
                        </Badge>
                      ) : (
                        <Badge className="bg-sky text-white hover:bg-sky gap-1">
                          <Users2 className="h-3 w-3" strokeWidth={2} /> Оператор
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.role === "MP" ? (
                        u._count?.doctors ?? 0
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge variant="outline" className="border-azure/40 text-azure-dark bg-azure/5">
                          Активен
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-terra/60 bg-terra-light text-terra-dark">
                          Деактивирован
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-sky hover:text-brand"
                          onClick={() => openEdit(u)}
                          aria-label={`Редактировать ${u.name}`}
                        >
                          <Pencil className="h-4 w-4" strokeWidth={2} />
                        </Button>
                        {u.isActive && u.id !== currentUserId && (
                          <DeleteButton
                            title={`Деактивировать «${u.name}»?`}
                            description="Пользователь не удаляется, а деактивируется — вход в систему будет заблокирован. МП нельзя деактивировать, пока за ним закреплены врачи. Действие будет зафиксировано в журнале аудита."
                            onConfirm={() => deactivate.mutateAsync(u.id)}
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

      {/* Диалог создания / редактирования */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditing(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-brand">
              {isEdit ? "Редактирование пользователя" : "Новый пользователь"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!isEdit && (
              <div className="space-y-1.5">
                <Label>Логин *</Label>
                <Input
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  placeholder="Например: a.petrova"
                  autoComplete="off"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Имя *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Фамилия Имя (например: Петрова Анна)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Роль</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите роль" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MP">МП · Администратор территории</SelectItem>
                  <SelectItem value="OPERATOR">Пользователь · Оператор</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{isEdit ? "Новый пароль (пусто — не менять)" : "Пароль *"}</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={2} />
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={isEdit ? "Оставьте пустым, чтобы не менять" : "Минимум 6 символов"}
                  className="pl-9"
                  autoComplete="new-password"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                setEditing(null);
                setForm(EMPTY_FORM);
              }}
            >
              Отмена
            </Button>
            <Button
              onClick={() => (isEdit ? update.mutate() : create.mutate())}
              disabled={
                create.isPending ||
                update.isPending ||
                !form.name.trim() ||
                (!isEdit && (!form.login.trim() || form.password.length < 6)) ||
                (isEdit && form.password.length > 0 && form.password.length < 6)
              }
            >
              {isEdit ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
