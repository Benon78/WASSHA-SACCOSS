import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import {
  listBranches,
  createBranch,
  updateBranch,
  mergeBranches,
} from "@/lib/superadmin-config.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmWithPassword } from "@/components/superadmin/ConfirmWithPassword";
import { toast } from "sonner";
import { Loader2, Plus, Save, Building2, Users, GitMerge, Power } from "lucide-react";
import { PageLoader } from "@/components/status/LoadingState";
import { ErrorState } from "@/components/status/ErrorState";

export const Route = createFileRoute("/_app/superadmin/branches")({
  head: () => ({
    meta: [{ title: "Branches — Super Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: BranchesPage,
});

const branchesQueryOptions = () =>
  queryOptions({
    queryKey: ["superadmin", "branches"],
    queryFn: () => listBranches(),
    staleTime: 30_000,
  });

function BranchesPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(branchesQueryOptions());

  if (isLoading) return <PageLoader label="Loading branches…" />;
  if (error || !data) return <ErrorState onRetry={refetch} title="Failed to load branches" />;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["superadmin", "branches"] });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Branches</h1>
          <p className="text-sm text-muted-foreground">
            Manage physical / regional branches. Members can be reassigned or bulk-transferred via
            merge.
          </p>
        </div>
        <CreateBranchDialog onCreated={invalidate} />
      </header>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          <Building2 className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-2">
            No branches yet. Create the first one to enable branch-based member segmentation.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((b) => (
            <BranchCard key={b.id} branch={b} allBranches={data} onChanged={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------

function CreateBranchDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", address: "" });
  const create = useServerFn(createBranch);
  const mutation = useMutation({
    mutationFn: async (password: string) =>
      create({
        data: {
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          address: form.address.trim() || undefined,
          password,
        },
      }),
    onSuccess: () => {
      toast.success("Branch created");
      setOpen(false);
      setForm({ code: "", name: "", address: "" });
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New branch
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create branch</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Code</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="DAR-01"
            />
          </div>
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Dar es Salaam — Kariakoo"
            />
          </div>
          <div>
            <Label>Address</Label>
            <Textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <ConfirmWithPassword
            title="Confirm branch creation"
            description={`Create branch “${form.name || "…"}” (${form.code || "…"}).`}
            actionLabel="Create"
            trigger={
              <Button disabled={mutation.isPending || !form.code || !form.name}>
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create
              </Button>
            }
            onConfirmed={async (pw) => {
              await mutation.mutateAsync(pw);
            }}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Branch = Awaited<ReturnType<typeof listBranches>>[number];

function BranchCard({
  branch,
  allBranches,
  onChanged,
}: {
  branch: Branch;
  allBranches: Branch[];
  onChanged: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(branch.name);
  const [address, setAddress] = useState(branch.address ?? "");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");

  const upd = useServerFn(updateBranch);
  const merge = useServerFn(mergeBranches);

  const saveMut = useMutation({
    mutationFn: async (password: string) =>
      upd({
        data: { id: branch.id, name: name.trim(), address: address.trim() || null, password },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditOpen(false);
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleMut = useMutation({
    mutationFn: async (password: string) =>
      upd({
        data: {
          id: branch.id,
          status: branch.status === "active" ? "disabled" : "active",
          password,
        },
      }),
    onSuccess: () => {
      toast.success(branch.status === "active" ? "Disabled" : "Activated");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const mergeMut = useMutation({
    mutationFn: async (password: string) =>
      merge({ data: { sourceId: branch.id, targetId: mergeTarget, password } }),
    onSuccess: (r) => {
      toast.success(`Merged — ${r.moved} member(s) moved`);
      setMergeOpen(false);
      setMergeTarget("");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">{branch.name}</h3>
        <Badge variant="outline" className="text-xs">
          {branch.code}
        </Badge>
        {branch.status === "disabled" && <Badge variant="secondary">Disabled</Badge>}
        <Badge variant="outline" className="ml-auto text-xs">
          <Users className="mr-1 h-3 w-3" /> {branch.member_count}
        </Badge>
      </div>
      {branch.address && <p className="mt-1 text-sm text-muted-foreground">{branch.address}</p>}
      {branch.manager && (
        <p className="mt-1 text-xs text-muted-foreground">
          Manager: {branch.manager.full_name}
          {branch.manager.member_number ? ` · #${branch.manager.member_number}` : ""}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Dialog
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o);
            if (o) {
              setName(branch.name);
              setAddress(branch.address ?? "");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Edit
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit branch</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Address</Label>
                <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <ConfirmWithPassword
                title="Save branch changes"
                description={`Save changes to “${branch.name}”.`}
                actionLabel="Save"
                trigger={
                  <Button disabled={saveMut.isPending}>
                    {saveMut.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save
                  </Button>
                }
                onConfirmed={async (pw) => {
                  await saveMut.mutateAsync(pw);
                }}
              />
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmWithPassword
          title={branch.status === "active" ? "Disable branch" : "Activate branch"}
          description={
            branch.status === "active"
              ? `Disable “${branch.name}”. Existing members remain assigned but the branch is marked inactive.`
              : `Reactivate “${branch.name}”.`
          }
          actionLabel={branch.status === "active" ? "Disable" : "Activate"}
          trigger={
            <Button variant="outline" size="sm">
              <Power className="mr-2 h-4 w-4" />
              {branch.status === "active" ? "Disable" : "Activate"}
            </Button>
          }
          onConfirmed={async (pw) => {
            await toggleMut.mutateAsync(pw);
          }}
        />

        <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={allBranches.length < 2}>
              <GitMerge className="mr-2 h-4 w-4" /> Merge into…
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Merge “{branch.name}” into another branch</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              All {branch.member_count} member(s) will be reassigned. Source branch is soft-disabled
              (not deleted) so audit history stays intact.
            </p>
            <Label>Target branch</Label>
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Select target" />
              </SelectTrigger>
              <SelectContent>
                {allBranches
                  .filter((b) => b.id !== branch.id && b.status === "active")
                  .map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <ConfirmWithPassword
                title="Confirm merge"
                description={`Merge “${branch.name}” into the selected branch and reassign ${branch.member_count} member(s).`}
                actionLabel="Merge"
                destructive
                trigger={
                  <Button variant="destructive" disabled={mergeMut.isPending || !mergeTarget}>
                    {mergeMut.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <GitMerge className="mr-2 h-4 w-4" />
                    )}
                    Merge
                  </Button>
                }
                onConfirmed={async (pw) => {
                  await mergeMut.mutateAsync(pw);
                }}
              />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
