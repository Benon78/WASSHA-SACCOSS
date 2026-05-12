import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Wallet, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationsBell } from "@/components/NotificationsBell";

export function AppHeader() {
  const { user, roles, isStaff, signOut } = useAuth();
  const nav = useNavigate();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)]">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-secondary">WASSHA</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">SACCOS</div>
          </div>
        </Link>

        {user ? (
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <Link to="/dashboard" className="transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>Dashboard</Link>
            <Link to="/loans" className="transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>My Loans</Link>
            <Link to="/statements" className="transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>Statements</Link>
            {isStaff && (
              <Link to="/approvals" className="transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>Approvals</Link>
            )}
            {roles.includes("admin") && (
              <Link to="/admin" className="transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>Admin</Link>
            )}
          </nav>
        ) : (
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition hover:text-foreground">Features</a>
            <a href="#roles" className="transition hover:text-foreground">Roles</a>
            <Link to="/workflow" className="transition hover:text-foreground">Workflow Guide</Link>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <NotificationsBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {user.email?.split("@")[0]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="text-xs text-muted-foreground">Signed in as</div>
                    <div className="truncate text-sm font-medium">{user.email}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {roles.map((r) => (
                        <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{r}</span>
                      ))}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile">My profile & 2FA</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/statements">Statements</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/notifications">All notifications</Link></DropdownMenuItem>
                  {roles.includes("admin") && (
                    <>
                      <DropdownMenuItem asChild><Link to="/admin/policies">Loan policies</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link to="/admin/reports">Reports</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link to="/admin/audit">Audit log</Link></DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => { await signOut(); nav({ to: "/" }); }}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button size="sm" asChild className="bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95">
                <Link to="/auth">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
