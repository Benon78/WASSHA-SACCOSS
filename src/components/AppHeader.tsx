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
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = roles.includes("admin") || roles.includes("super_admin");
  const isSuperAdmin = roles.includes("super_admin");

  // Primary nav — kept small so it doesn't overflow. Admin sub-pages go into a dropdown.
  const primaryLinks = user ? (
    <>
      <Link to="/dashboard" className="transition hover:text-foreground whitespace-nowrap" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>{t("nav_dashboard")}</Link>
      <Link to="/loans" className="transition hover:text-foreground whitespace-nowrap" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>{t("nav_loans")}</Link>
      <Link to="/loans/simulator" className="transition hover:text-foreground whitespace-nowrap" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>Simulator</Link>
      <Link to="/statements" className="transition hover:text-foreground whitespace-nowrap" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>{t("nav_statements")}</Link>
      <Link to="/notifications" className="transition hover:text-foreground whitespace-nowrap" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>{t("nav_notifications")}</Link>
      <Link to="/escalations" className="transition hover:text-foreground whitespace-nowrap" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>{t("nav_escalations")}</Link>
      {isStaff && (
        <Link to="/approvals" className="transition hover:text-foreground whitespace-nowrap" activeProps={{ className: "text-foreground font-semibold" }} onClick={() => setMobileOpen(false)}>{t("nav_approvals")}</Link>
      )}
    </>
  ) : (
    <>
      <a href="#features" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>Features</a>
      <a href="#roles" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>Roles</a>
      <Link to="/workflow" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>Workflow Guide</Link>
    </>
  );

  // Admin dropdown for admin sub-pages so the top bar never crowds
  const adminMenu = isAdmin ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto px-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          {t("nav_admin")} ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild><Link to="/admin">{t("nav_admin")} home</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/admin/board">{t("nav_board")}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/admin/policies">{t("nav_policies")}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/admin/reports">{t("nav_reports")}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/admin/audit">{t("nav_audit")}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/admin/escalations">Escalations queue</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/admin/sla">SLA tracking</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/admin/import">Bulk member import</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  // Mobile nav — full list including admin sub-pages
  const mobileNavLinks = user ? (
    <>
      {primaryLinks}
      {isAdmin && (
        <>
          <div className="mt-2 border-t pt-2 text-xs uppercase tracking-wider text-muted-foreground/70">{t("nav_admin")}</div>
          <Link to="/admin" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>{t("nav_admin")} home</Link>
          <Link to="/admin/board" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>{t("nav_board")}</Link>
          <Link to="/admin/policies" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>{t("nav_policies")}</Link>
          <Link to="/admin/reports" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>{t("nav_reports")}</Link>
          <Link to="/admin/audit" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>{t("nav_audit")}</Link>
          <Link to="/admin/escalations" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>Escalations queue</Link>
          <Link to="/admin/sla" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>SLA tracking</Link>
          <Link to="/admin/import" className="transition hover:text-foreground" onClick={() => setMobileOpen(false)}>Bulk member import</Link>
        </>
      )}
      <Link to="/profile" className="mt-2 border-t pt-2 transition hover:text-foreground" onClick={() => setMobileOpen(false)}>{t("nav_profile")}</Link>
    </>
  ) : primaryLinks;

  const langSwitcher = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("language")}>
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">{t("language")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setLang("en")}>{lang === "en" ? "✓ " : ""}English</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLang("sw")}>{lang === "sw" ? "✓ " : ""}Kiswahili</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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

        <nav className="hidden items-center gap-5 text-sm font-medium text-muted-foreground xl:flex">
          {primaryLinks}
          {adminMenu}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          {user ? (
            <>
              {langSwitcher}
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
                  <DropdownMenuItem onClick={async () => { await signOut(); nav({ to: "/auth", replace: true }); }}>
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
              <Button variant="ghost" size="icon" className="xl:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-4 flex flex-col gap-3 text-sm font-medium text-muted-foreground">
                {mobileNavLinks}
                {user && (
                  <button
                    onClick={async () => { setMobileOpen(false); await signOut(); nav({ to: "/auth", replace: true }); }}
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
