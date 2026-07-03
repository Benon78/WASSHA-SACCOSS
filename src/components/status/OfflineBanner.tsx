import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Non-blocking banner shown when the browser reports offline. Uses the
 * standard `online`/`offline` events. Placed once near the top of the app
 * shell — see `_app.tsx`.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      You're offline. Changes will fail until your connection returns.
    </div>
  );
}
