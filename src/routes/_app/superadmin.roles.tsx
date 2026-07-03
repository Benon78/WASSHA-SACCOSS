import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import {
  getRolesOverview,
  setBuiltInRolePermissions,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
} from "@/lib/superadmin-config.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmWithPassword } from "@/components/superadmin/ConfirmWithPassword";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2, Users, ShieldCheck, ShieldOff } from "lucide-react";
import { PageLoader } from "@/components/status/LoadingState";
import { ErrorState } from "@/components/status/ErrorState";

export const Route = createFileRoute("/_app/superadmin/roles")({
  head: () => ({ meta: [{ title: "Roles & Permissions — Super Admin" }, { name: "robots", content: "noindex" }] }),
  component: RolesPage,
});

const rolesQueryOptions = () =>
  queryOptions({
    queryKey: ["superadmin", "roles-overview"],
    queryFn: () => getRolesOverview(),
    staleTime: 30_000,
  });

function RolesPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(rolesQueryOptions());

  if (isLoading) return <PageLoader label="Loading roles…" />;
  if (error || !data) return <ErrorState onRetry={refetch} title="Failed to load roles" />;

  const permsByCategory = data.permissions.reduce<Record<string, typeof data.permissions>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["superadmin", "roles-overview"] });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Roles &amp; Permissions</h1>
        <p className="text-sm text-muted-foreground">
          Built-in roles are locked to their identity; edit their permission grants. Create custom roles for
          fine-grained access. <span className="font-medium text-primary">super_admin</span> always holds every
          permission implicitly.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Built-in roles</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.builtInRoles
            .filter((r) => r !== "super_admin")
            .map((role) => (
              <BuiltInRoleCard
                key={role}
                role={role}
                allPermsByCategory={permsByCategory}
                assigned={data.builtInMatrix[role] ?? []}
                userCount={data.builtInCounts[role] ?? 0}
                onSaved={invalidate}
              />
            ))}
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">super_admin</h3>
              <Badge variant="secondary" className="ml-auto text-xs">
                {data.builtInCounts["super_admin"] ?? 0} user(s)
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Implicit full authority. Cannot be edited or removed. Protected at the database layer.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Custom roles</h2>
          <CreateCustomRoleDialog
            permsByCategory={permsByCategory}
            onCreated={invalidate}
          />
        </div>
        {data.customRoles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
            No custom roles yet. Custom roles let you compose permissions without touching built-in roles.
          </p>
        ) : (
          <div className="grid gap-4">
            {data.customRoles.map((r) => (
              <CustomRoleCard
                key={r.id}
                role={r}
                permsByCategory={permsByCategory}
                onChanged={invalidate}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// -----------------------------------------------------------------

function PermissionMatrix({
  permsByCategory,
  selected,
  onToggle,
}: {
  permsByCategory: Record<string, { code: string; description: string; category: string }[]>;
  selected: Set<string>;
  onToggle: (code: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {Object.entries(permsByCategory).map(([cat, list]) => (
        <div key={cat} className="rounded-lg border border-border/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {list.map((p) => (
              <label key={p.code} className="flex items-start gap-2 rounded-md p-1 hover:bg-accent">
                <Checkbox
                  checked={selected.has(p.code)}
                  onCheckedChange={() => onToggle(p.code)}
                  className="mt-0.5"
                />
                <span className="flex-1">
                  <code className="text-xs font-mono text-foreground">{p.code}</code>
                  <span className="block text-xs text-muted-foreground">{p.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BuiltInRoleCard({
  role,
  allPermsByCategory,
  assigned,
  userCount,
  onSaved,
}: {
  role: string;
  allPermsByCategory: Record<string, { code: string; description: string; category: string }[]>;
  assigned: string[];
  userCount: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(new Set(assigned));
  const setPerms = useServerFn(setBuiltInRolePermissions);
  const mutation = useMutation({
    mutationFn: async (password: string) =>
      setPerms({
        data: {
          role: role as never,
          permissions: [...selected],
          password,
        },
      }),
    onSuccess: () => {
      toast.success(`Updated ${role}`);
      setOpen(false);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggle = (code: string) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelected(next);
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold capitalize">{role}</h3>
        <Badge variant="secondary" className="ml-auto text-xs">
          <Users className="mr-1 h-3 w-3" /> {userCount}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {assigned.length} permission{assigned.length === 1 ? "" : "s"} granted
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        {assigned.slice(0, 6).map((p) => (
          <Badge key={p} variant="outline" className="text-[10px] font-mono">
            {p}
          </Badge>
        ))}
        {assigned.length > 6 && <Badge variant="outline">+{assigned.length - 6}</Badge>}
      </div>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setSelected(new Set(assigned)); }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="mt-3">
            Edit permissions
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize">Edit “{role}” permissions</DialogTitle>
          </DialogHeader>
          <PermissionMatrix
            permsByCategory={allPermsByCategory}
            selected={selected}
            onToggle={toggle}
          />
          <DialogFooter>
            <ConfirmWithPassword
              title="Confirm permission changes"
              description={`Update grants for role “${role}”. This affects ${userCount} user(s) immediately.`}
              actionLabel="Save"
              trigger={
                <Button disabled={mutation.isPending}>
                  {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
              }
              onConfirmed={async (pw) => { await mutation.mutateAsync(pw); }}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateCustomRoleDialog({
  permsByCategory,
  onCreated,
}: {
  permsByCategory: Record<string, { code: string; description: string; category: string }[]>;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const create = useServerFn(createCustomRole);
  const mutation = useMutation({
    mutationFn: async (password: string) =>
      create({
        data: { name: name.trim(), description: description.trim() || undefined, permissions: [...selected], password },
      }),
    onSuccess: () => {
      toast.success("Custom role created");
      setOpen(false);
      setName(""); setDescription(""); setSelected(new Set());
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New custom role
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create custom role</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Role identifier</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. auditor" />
              <p className="mt-1 text-xs text-muted-foreground">
                Lowercase letters, digits, dash or underscore. Unique.
              </p>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Read-only compliance access" />
            </div>
          </div>
          <div>
            <Label>Permissions</Label>
            <div className="mt-2">
              <PermissionMatrix
                permsByCategory={permsByCategory}
                selected={selected}
                onToggle={(c) => {
                  const n = new Set(selected);
                  if (n.has(c)) n.delete(c); else n.add(c);
                  setSelected(n);
                }}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <ConfirmWithPassword
            title="Confirm role creation"
            description={`Create custom role “${name || "…"}” with ${selected.size} permission(s).`}
            actionLabel="Create"
            trigger={
              <Button disabled={mutation.isPending || !name}>
                {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create role
              </Button>
            }
            onConfirmed={async (pw) => { await mutation.mutateAsync(pw); }}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomRoleCard({
  role,
  permsByCategory,
  onChanged,
}: {
  role: {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    userCount: number;
    permissions: string[];
  };
  permsByCategory: Record<string, { code: string; description: string; category: string }[]>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(new Set(role.permissions));
  const [description, setDescription] = useState(role.description ?? "");
  const update = useServerFn(updateCustomRole);
  const del = useServerFn(deleteCustomRole);

  const saveMut = useMutation({
    mutationFn: async (password: string) =>
      update({
        data: {
          id: role.id,
          description: description.trim() || null,
          permissions: [...selected],
          password,
        },
      }),
    onSuccess: () => { toast.success("Saved"); setOpen(false); onChanged(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleActiveMut = useMutation({
    mutationFn: async (password: string) =>
      update({ data: { id: role.id, is_active: !role.is_active, password } }),
    onSuccess: () => { toast.success(role.is_active ? "Disabled" : "Enabled"); onChanged(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const delMut = useMutation({
    mutationFn: async (password: string) => del({ data: { id: role.id, password } }),
    onSuccess: () => { toast.success("Deleted"); onChanged(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{role.name}</h3>
        {role.is_active ? (
          <Badge className="bg-success/15 text-success">Active</Badge>
        ) : (
          <Badge variant="secondary">Disabled</Badge>
        )}
        <Badge variant="outline" className="ml-auto text-xs">
          <Users className="mr-1 h-3 w-3" /> {role.userCount} · {role.permissions.length} perms
        </Badge>
      </div>
      {role.description && <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1">
        {role.permissions.slice(0, 8).map((p) => (
          <Badge key={p} variant="outline" className="text-[10px] font-mono">
            {p}
          </Badge>
        ))}
        {role.permissions.length > 8 && <Badge variant="outline">+{role.permissions.length - 8}</Badge>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setSelected(new Set(role.permissions)); setDescription(role.description ?? ""); } }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">Edit</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit role “{role.name}”</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <PermissionMatrix
                permsByCategory={permsByCategory}
                selected={selected}
                onToggle={(c) => {
                  const n = new Set(selected);
                  if (n.has(c)) n.delete(c); else n.add(c);
                  setSelected(n);
                }}
              />
            </div>
            <DialogFooter>
              <ConfirmWithPassword
                title="Confirm changes"
                description={`Update “${role.name}”. Affects ${role.userCount} user(s).`}
                actionLabel="Save"
                trigger={
                  <Button disabled={saveMut.isPending}>
                    {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save
                  </Button>
                }
                onConfirmed={async (pw) => { await saveMut.mutateAsync(pw); }}
              />
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmWithPassword
          title={role.is_active ? "Disable role" : "Enable role"}
          description={`This will ${role.is_active ? "disable" : "enable"} the role. Disabled roles do not grant any permissions.`}
          actionLabel={role.is_active ? "Disable" : "Enable"}
          trigger={
            <Button variant="outline" size="sm">
              {role.is_active ? <ShieldOff className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              {role.is_active ? "Disable" : "Enable"}
            </Button>
          }
          onConfirmed={async (pw) => { await toggleActiveMut.mutateAsync(pw); }}
        />

        <ConfirmWithPassword
          title="Delete role"
          description={`Permanently delete “${role.name}”. Only allowed if no users hold this role.`}
          actionLabel="Delete"
          destructive
          trigger={
            <Button variant="destructive" size="sm">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          }
          onConfirmed={async (pw) => { await delMut.mutateAsync(pw); }}
        />
      </div>
    </div>
  );
}
