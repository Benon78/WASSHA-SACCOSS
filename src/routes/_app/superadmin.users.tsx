import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { useState } from "react";
import { toast } from "sonner";
import {
  listUsers,
  suspendUser,
  reactivateUser,
  softDeleteUser,
  sendPasswordReset,
  unlockUser,
  verifyEmail,
  changeUserRole,
  removeUserRole,
  forceSignOutUser,
  getUserDetail,
} from "@/lib/superadmin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TableSkeleton } from "@/components/status/LoadingState";
import { ErrorState, classifyError } from "@/components/status/ErrorState";
import { EmptyState } from "@/components/status/EmptyState";
import { ConfirmWithPassword } from "@/components/superadmin/ConfirmWithPassword";
import { MoreHorizontal, Search, ShieldOff, ShieldCheck, KeyRound, Mail, Trash2, LogOut, UserCog, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDate } from "@/lib/format";

const searchSchema = z.object({
  page: z.number().int().min(1).max(10_000).catch(1),
  pageSize: z.number().int().min(10).max(100).catch(25),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["all", "active", "suspended", "deleted"]).catch("active"),
});

export const Route = createFileRoute("/_app/superadmin/users")({
  head: () => ({ meta: [{ title: "Users — Super Admin" }, { name: "robots", content: "noindex" }] }),
  validateSearch: zodValidator(searchSchema),
  component: UsersPage,
});

const APP_ROLES = ["member", "approver", "finance", "manager", "admin", "super_admin"] as const;

function UsersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const list = useServerFn(listUsers);
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState(search.search ?? "");
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "users", search],
    queryFn: () =>
      list({
        data: {
          page: search.page,
          pageSize: search.pageSize,
          search: search.search,
          status: search.status,
        },
      }),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["superadmin", "users"] });
    void qc.invalidateQueries({ queryKey: ["superadmin", "stats"] });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage every user on the platform. Sensitive actions require password confirmation.
          </p>
        </div>
        {data && <p className="text-sm text-muted-foreground">{data.total.toLocaleString()} total</p>}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-background/60 p-3">
        <form
          className="flex flex-1 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ search: (s: z.infer<typeof searchSchema>) => ({ ...s, search: searchInput || undefined, page: 1 }) });
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="user-search">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="user-search"
                placeholder="Name, member number, phone"
                className="pl-8"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={search.status}
            onValueChange={(v) =>
              navigate({ search: (s: z.infer<typeof searchSchema>) => ({ ...s, status: v as never, page: 1 }) })
            }
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Rows</Label>
          <Select
            value={String(search.pageSize)}
            onValueChange={(v) =>
              navigate({ search: (s: z.infer<typeof searchSchema>) => ({ ...s, pageSize: Number(v), page: 1 }) })
            }
          >
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : error ? (
        <ErrorState kind={classifyError(error)} onRetry={() => void refetch()} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title="No users found" description="Try adjusting your filters." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-background/60">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Member #</th>
                  <th className="px-3 py-2">Roles</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Joined</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((u) => (
                  <tr key={u.user_id} className="border-t border-border/40 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <button
                        className="text-left font-medium hover:underline"
                        onClick={() => setDetailUserId(u.user_id)}
                      >
                        {u.full_name || <span className="text-muted-foreground italic">(no name)</span>}
                      </button>
                      <div className="text-xs text-muted-foreground">{u.phone ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{u.member_number ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <Badge variant="outline">member</Badge>
                        ) : (
                          u.roles.map((r) => (
                            <Badge key={r} variant={r === "super_admin" ? "default" : "outline"}>{r}</Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{u.branch?.name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2">
                      {u.deleted_at ? (
                        <Badge variant="destructive">Deleted</Badge>
                      ) : u.suspended_at ? (
                        <Badge className="bg-amber-500 text-white hover:bg-amber-500">Suspended</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(u.joined_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <UserActionsMenu user={u} onDone={invalidate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border/40 px-3 py-2 text-sm">
            <div className="text-muted-foreground">
              Page {search.page} of {totalPages}
              {isFetching ? " · refreshing…" : ""}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={search.page <= 1}
                onClick={() => navigate({ search: (s: z.infer<typeof searchSchema>) => ({ ...s, page: s.page - 1 }) })}
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={search.page >= totalPages}
                onClick={() => navigate({ search: (s: z.infer<typeof searchSchema>) => ({ ...s, page: s.page + 1 }) })}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <UserDetailSheet userId={detailUserId} onClose={() => setDetailUserId(null)} />
    </div>
  );
}

// -------- row actions dropdown --------
type UserRow = Awaited<ReturnType<typeof listUsers>>["rows"][number];

function UserActionsMenu({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const suspend = useServerFn(suspendUser);
  const reactivate = useServerFn(reactivateUser);
  const softDelete = useServerFn(softDeleteUser);
  const resetPw = useServerFn(sendPasswordReset);
  const unlock = useServerFn(unlockUser);
  const verifyEm = useServerFn(verifyEmail);
  const changeRole = useServerFn(changeUserRole);
  const removeRole = useServerFn(removeUserRole);
  const forceOut = useServerFn(forceSignOutUser);

  const [reason, setReason] = useState("");
  const [roleDraft, setRoleDraft] = useState<(typeof APP_ROLES)[number]>("member");
  const [roleToRemove, setRoleToRemove] = useState<(typeof APP_ROLES)[number] | "">("");

  const wrap = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Account</DropdownMenuLabel>

        <ConfirmWithPassword
          title="Send password reset"
          description={<>Emails a recovery link to <strong>{user.full_name || "this user"}</strong>.</>}
          actionLabel="Send reset"
          trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><Mail className="mr-2 h-4 w-4" />Send password reset</DropdownMenuItem>}
          onConfirmed={(password) => wrap(() => resetPw({ data: { userId: user.user_id, password } }), "Reset link sent")}
        />

        <ConfirmWithPassword
          title="Verify email"
          description={<>Mark <strong>{user.full_name || "this user"}</strong>'s email as verified.</>}
          actionLabel="Verify email"
          trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><ShieldCheck className="mr-2 h-4 w-4" />Mark email verified</DropdownMenuItem>}
          onConfirmed={(password) => wrap(() => verifyEm({ data: { userId: user.user_id, password } }), "Email verified")}
        />

        <ConfirmWithPassword
          title="Unlock account"
          description={<>Clear any lockout on <strong>{user.full_name || "this user"}</strong>.</>}
          actionLabel="Unlock"
          trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><KeyRound className="mr-2 h-4 w-4" />Unlock account</DropdownMenuItem>}
          onConfirmed={(password) => wrap(() => unlock({ data: { userId: user.user_id, password } }), "Account unlocked")}
        />

        <ConfirmWithPassword
          title="Force sign-out"
          description={<>Terminates every active session for <strong>{user.full_name || "this user"}</strong>.</>}
          actionLabel="Force sign-out"
          trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><LogOut className="mr-2 h-4 w-4" />Force sign-out</DropdownMenuItem>}
          onConfirmed={(password) => wrap(() => forceOut({ data: { userId: user.user_id, password } }), "All sessions signed out")}
        />

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Role</DropdownMenuLabel>
        <ConfirmWithPassword
          title="Change role"
          description={<>Replace current roles for <strong>{user.full_name || "this user"}</strong> with the selected role.</>}
          actionLabel="Change role"
          trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><UserCog className="mr-2 h-4 w-4" />Change role…</DropdownMenuItem>}
          extraFields={
            <div className="space-y-1.5">
              <Label>New role</Label>
              <Select value={roleDraft} onValueChange={(v) => setRoleDraft(v as never)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APP_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          onConfirmed={(password) =>
            wrap(
              () => changeRole({ data: { userId: user.user_id, password, role: roleDraft, replaceAll: true } }),
              `Role changed to ${roleDraft}`,
            )
          }
        />

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Status</DropdownMenuLabel>

        {user.suspended_at || user.deleted_at ? (
          <ConfirmWithPassword
            title="Reactivate user"
            description={<>Restore access for <strong>{user.full_name || "this user"}</strong>.</>}
            actionLabel="Reactivate"
            trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><ShieldCheck className="mr-2 h-4 w-4" />Reactivate</DropdownMenuItem>}
            onConfirmed={(password) => wrap(() => reactivate({ data: { userId: user.user_id, password } }), "User reactivated")}
          />
        ) : (
          <ConfirmWithPassword
            title="Suspend user"
            description={<>Temporarily block <strong>{user.full_name || "this user"}</strong>. Provide a reason for the audit log.</>}
            actionLabel="Suspend"
            destructive
            trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><ShieldOff className="mr-2 h-4 w-4" />Suspend</DropdownMenuItem>}
            extraFields={
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this user being suspended?" />
              </div>
            }
            onConfirmed={(password) => {
              if (reason.trim().length < 3) {
                throw new Error("Reason must be at least 3 characters");
              }
              return wrap(
                () => suspend({ data: { userId: user.user_id, password, reason: reason.trim() } }),
                "User suspended",
              );
            }}
          />
        )}

        {!user.deleted_at && (
          <ConfirmWithPassword
            title="Delete user (soft)"
            description={
              <>
                Marks <strong>{user.full_name || "this user"}</strong> as deleted. Financial history is preserved for audit.
              </>
            }
            actionLabel="Delete"
            destructive
            trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete (soft)</DropdownMenuItem>}
            extraFields={
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for deletion" />
              </div>
            }
            onConfirmed={(password) => {
              if (reason.trim().length < 3) throw new Error("Reason must be at least 3 characters");
              return wrap(
                () => softDelete({ data: { userId: user.user_id, password, reason: reason.trim() } }),
                "User deleted",
              );
            }}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// -------- detail sheet --------
function UserDetailSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const detail = useServerFn(getUserDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "user-detail", userId],
    queryFn: () => detail({ data: { userId: userId! } }),
    enabled: !!userId,
    staleTime: 10_000,
  });

  return (
    <Sheet open={!!userId} onOpenChange={(v) => (!v ? onClose() : null)}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>User details</SheetTitle>
        </SheetHeader>
        {isLoading || !data ? (
          <div className="mt-6"><TableSkeleton rows={5} cols={2} /></div>
        ) : (
          <div className="mt-6 space-y-6 text-sm">
            <section>
              <h3 className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Profile</h3>
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-muted-foreground">Name</dt><dd>{data.profile?.full_name || "—"}</dd>
                <dt className="text-muted-foreground">Email</dt><dd>{data.email ?? "—"}</dd>
                <dt className="text-muted-foreground">Email confirmed</dt><dd>{data.emailConfirmedAt ? fmtDate(data.emailConfirmedAt) : "No"}</dd>
                <dt className="text-muted-foreground">Last sign-in</dt><dd>{data.lastSignInAt ? fmtDate(data.lastSignInAt) : "Never"}</dd>
                <dt className="text-muted-foreground">Roles</dt><dd>{data.roles.join(", ") || "member"}</dd>
                <dt className="text-muted-foreground">Locked</dt><dd>{data.bannedUntil ? "Yes" : "No"}</dd>
              </dl>
            </section>
            <section>
              <h3 className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Recent sessions</h3>
              {data.sessions.length === 0 ? (
                <p className="text-muted-foreground">No sessions recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {data.sessions.slice(0, 8).map((s) => (
                    <li key={s.id} className="rounded-lg border border-border/40 p-2">
                      <div className="text-xs text-muted-foreground">{fmtDate(s.last_seen)}</div>
                      <div className="truncate">{s.browser || s.user_agent || "Unknown browser"}</div>
                      <div className="text-xs text-muted-foreground">{s.ip ?? "—"} · {s.location ?? "—"}{s.revoked_at ? " · revoked" : ""}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Login history</h3>
              {data.events.length === 0 ? (
                <p className="text-muted-foreground">No events recorded.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.events.slice(0, 15).map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 text-xs">
                      <span><Badge variant="outline">{e.event_type}</Badge> <span className="text-muted-foreground">{e.ip ?? "—"}</span></span>
                      <span className="text-muted-foreground">{fmtDate(e.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
