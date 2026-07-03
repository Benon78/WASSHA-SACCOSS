import { AlertCircle, RefreshCcw, Home, WifiOff, ShieldAlert, Clock, ServerCrash } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type ErrorKind = "generic" | "network" | "forbidden" | "session" | "server" | "notfound";

interface ErrorStateProps {
  kind?: ErrorKind;
  title?: string;
  description?: string;
  onRetry?: () => void;
  hideHome?: boolean;
  extra?: ReactNode;
  className?: string;
  /** When true, occupies full screen. When false, fits inline in a card. */
  fullscreen?: boolean;
}

const PRESET: Record<ErrorKind, { icon: LucideIcon; title: string; description: string }> = {
  generic: {
    icon: AlertCircle,
    title: "Something went wrong",
    description: "An unexpected error occurred. You can try again or head back home.",
  },
  network: {
    icon: WifiOff,
    title: "Connection problem",
    description: "We couldn't reach the server. Check your internet connection and try again.",
  },
  forbidden: {
    icon: ShieldAlert,
    title: "You don't have access",
    description: "Your account doesn't have permission to view this page. Contact an admin if you think this is a mistake.",
  },
  session: {
    icon: Clock,
    title: "Your session expired",
    description: "For your security, please sign in again to continue.",
  },
  server: {
    icon: ServerCrash,
    title: "Service temporarily unavailable",
    description: "Our servers are having trouble responding. Please try again in a moment.",
  },
  notfound: {
    icon: AlertCircle,
    title: "Not found",
    description: "The item you're looking for doesn't exist or was removed.",
  },
};

/** Classifies a thrown error into one of the semantic kinds. */
export function classifyError(err: unknown): ErrorKind {
  if (!err) return "generic";
  const anyErr = err as { status?: number; message?: string; name?: string };
  const msg = (anyErr.message ?? "").toLowerCase();
  const status = anyErr.status;

  if (status === 401 || /jwt|unauthorized|invalid.*token|session.*expired/.test(msg)) return "session";
  if (status === 403 || /forbidden|permission denied|row-level security|not authorized/.test(msg)) return "forbidden";
  if (status === 404 || /not.?found/.test(msg)) return "notfound";
  if (typeof status === "number" && status >= 500) return "server";
  if (
    anyErr.name === "TypeError" &&
    /fetch|network|failed to fetch|load failed/.test(msg)
  ) return "network";
  if (/network|offline|failed to fetch|net::/.test(msg)) return "network";
  return "generic";
}

export function ErrorState({
  kind = "generic",
  title,
  description,
  onRetry,
  hideHome,
  extra,
  className,
  fullscreen = false,
}: ErrorStateProps) {
  const preset = PRESET[kind];
  const Icon = preset.icon;

  const body = (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-border/60 bg-card p-6 text-center shadow-sm",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{title ?? preset.title}</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {description ?? preset.description}
        </p>
      </div>
      {extra}
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        {onRetry && (
          <Button onClick={onRetry} size="sm">
            <RefreshCcw className="mr-2 h-4 w-4" aria-hidden />
            Try again
          </Button>
        )}
        {kind === "session" ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        ) : !hideHome ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <Home className="mr-2 h-4 w-4" aria-hidden />
              Go home
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );

  if (!fullscreen) return body;
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">{body}</div>
    </div>
  );
}
