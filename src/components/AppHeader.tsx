import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";

export function AppHeader() {
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
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="transition hover:text-foreground">Features</a>
          <a href="#roles" className="transition hover:text-foreground">Roles</a>
          <a href="#workflow" className="transition hover:text-foreground">Loan Workflow</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard">Sign in</Link>
          </Button>
          <Button size="sm" asChild className="bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95">
            <Link to="/dashboard">Open Dashboard</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
