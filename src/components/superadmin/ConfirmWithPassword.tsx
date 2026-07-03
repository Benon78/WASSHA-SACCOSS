import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reauthenticate } from "@/lib/superadmin.functions";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";

/**
 * ConfirmWithPassword — sensitive-action gate.
 *
 * Renders `trigger` and, on click, prompts for the current user's password
 * before running `onConfirmed`. Server functions still re-verify the password
 * on every call — this component is UX, not the security boundary.
 */
export function ConfirmWithPassword({
  title,
  description,
  actionLabel = "Confirm",
  destructive = false,
  trigger,
  onConfirmed,
  extraFields,
}: {
  title: string;
  description: ReactNode;
  actionLabel?: string;
  destructive?: boolean;
  trigger: ReactNode;
  onConfirmed: (password: string) => Promise<void>;
  extraFields?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const reauth = useServerFn(reauthenticate);

  const submit = async () => {
    if (!pw) return;
    setBusy(true);
    try {
      await reauth({ data: { password: pw } });
    } catch {
      setBusy(false);
      toast.error("Incorrect password");
      return;
    }
    try {
      await onConfirmed(pw);
      setOpen(false);
      setPw("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Action failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <Dialog open={open} onOpenChange={(v) => (!busy ? setOpen(v) : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {extraFields}
            <div className="space-y-1.5">
              <Label htmlFor="reauth-pw">Confirm with your password</Label>
              <Input
                id="reauth-pw"
                type="password"
                autoComplete="current-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                disabled={busy}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              onClick={submit}
              disabled={busy || !pw}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
