import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wallet, LogOut, Menu, Languages } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { NotificationsBell } from "@/components/NotificationsBell";

export function AppHeader() {
  const { user, roles, isStaff, signOut } = useAuth();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = user ? (
    <>
      <Link to="/dashboard" className="transition hover:text-foreground" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>Dashboard</Link>
      <Link to="/loans" className="transition hover:text-foreground" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>My Loans</Link>
      <Link to="/statements" className="transition hover:text-foreground" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>Statements</Link>
      <Link to="/notifications" className="transition hover:text-foreground" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>Notifications</Link>
      {isStaff && (
        <Link to="/approvals" className="transition hover:text-foreground" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>Approvals</Link>
      )}
      {roles.includes("admin") && (
        <>
          <Link to="/admin" className="transition hover:text-foreground" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>Admin</Link>
          <Link to="/admin/policies" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>Loan policies</Link>
          <Link to="/admin/reports" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>Reports</Link>
          <Link to="/admin/audit" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>Audit log</Link>
        </>
      )}
      <Link to="/profile" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>My profile</Link>
    </>
  ) : (
    <>
      <a href="#features" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>Features</a>
      <a href="#roles" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>Roles</a>
      <Link to="/workflow" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>Workflow Guide</Link>
    </>
  );

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)]">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-secondary">WASSHA</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">SACCOS</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex">
          {navLinks}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <NotificationsBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex max-w-[140px] truncate">
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
                  <DropdownMenuItem asChild><Link to="/profile">My profile & 2FA</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/statements">Statements</Link></DropdownMenuItem>
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
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button size="sm" asChild className="bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95">
                <Link to="/auth">Get started</Link>
              </Button>
            </>
          )}

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-4 flex flex-col gap-3 text-sm font-medium text-muted-foreground">
                {navLinks}
                {user && (
                  <button
                    onClick={async () => { setMobileOpen(false); await signOut(); nav({ to: "/" }); }}
                    className="flex items-center gap-2 text-left text-destructive hover:opacity-80"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
