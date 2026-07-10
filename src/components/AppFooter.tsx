import { Wallet } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function AppFooter() {
  return (
    <footer className="border-t border-border/60 bg-secondary text-secondary-foreground">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 py-8 md:flex-row">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-primary)]">
            <Wallet className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">WASSHA SACCOS</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-secondary-foreground/80">
          <Link to="/privacy" className="transition hover:text-secondary-foreground">
            Privacy Policy
          </Link>
          <Link to="/terms" className="transition hover:text-secondary-foreground">
            Terms of Service
          </Link>
          <Link to="/workflow" className="transition hover:text-secondary-foreground">
            Workflow Guide
          </Link>
          <Link
            to="/guides/choosing-sacco-software"
            className="transition hover:text-secondary-foreground"
          >
            Workflow Guide
          </Link>
        </div>

        <p className="text-xs text-secondary-foreground/60">
          © {new Date().getFullYear()} WASSHA SACCOS. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
