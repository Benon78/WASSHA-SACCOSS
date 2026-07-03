import { lazy, Suspense, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// Lazy import: the heavy AI SDK + ai-elements + streaming code (~2k LoC)
// only downloads when the user clicks the chat bubble. Cuts initial JS on
// every authenticated page.
const AssistantWidgetPanel = lazy(() => import("./AssistantWidgetPanel"));

export function AssistantWidget() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          aria-label={t("ai_assistant_open")}
          className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:opacity-95"
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}
      {open && (
        <Suspense fallback={null}>
          <AssistantWidgetPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
