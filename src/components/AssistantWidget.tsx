import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Bot, MessageCircle, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { getAiHistory, clearAiHistory } from "@/lib/ai-chat.functions";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";

function rowsToUiMessages(rows: { id: string; role: string; content: string }[]): UIMessage[] {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      parts: [{ type: "text", text: r.content }],
    })) as UIMessage[];
}

export function AssistantWidget() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<UIMessage[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const loadHistory = useServerFn(getAiHistory);
  const clear = useServerFn(clearAiHistory);
  const transportRef = useRef<DefaultChatTransport<UIMessage> | null>(null);

  if (!transportRef.current) {
    transportRef.current = new DefaultChatTransport<UIMessage>({
      api: "/api/chat",
      fetch: async (url, init) => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const headers = new Headers(init?.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(url, { ...init, headers });
      },
    });
  }

  // Load history once when first opened
  useEffect(() => {
    if (!open || initial !== null || !user) return;
    setLoadingHistory(true);
    loadHistory({})
      .then((rows) => setInitial(rowsToUiMessages(rows ?? [])))
      .catch(() => setInitial([]))
      .finally(() => setLoadingHistory(false));
  }, [open, initial, user, loadHistory]);

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
        <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[400px]">
          <div className="flex h-[80vh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-[var(--shadow-elegant)] sm:h-[600px] sm:rounded-2xl">
            <header className="flex items-center justify-between gap-2 border-b border-border bg-[image:var(--gradient-hero)] px-4 py-3 text-primary-foreground">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-semibold">{t("ai_assistant_title")}</div>
                  <div className="text-[10px] uppercase tracking-wider text-white/80">{t("ai_assistant_subtitle")}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  onClick={async () => {
                    try {
                      await clear({});
                      setInitial([]);
                      toast.success(t("ai_history_cleared"));
                    } catch {
                      toast.error(t("ai_history_clear_failed"));
                    }
                  }}
                  variant="ghost"
                  size="icon"
                  aria-label={t("ai_clear_history")}
                  className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => setOpen(false)}
                  variant="ghost"
                  size="icon"
                  aria-label={t("ai_assistant_close")}
                  className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </header>

            {loadingHistory || initial === null ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                <Shimmer>{`${t("loading")}…`}</Shimmer>
              </div>
            ) : (
              <AssistantChatBody
                key={initial.length}
                initialMessages={initial}
                transport={transportRef.current}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function AssistantChatBody({
  initialMessages,
  transport,
}: {
  initialMessages: UIMessage[];
  transport: DefaultChatTransport<UIMessage>;
}) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const { messages, sendMessage, status, stop, error } = useChat({
    id: "wassha-assistant",
    messages: initialMessages,
    transport,
    onError: (err) => {
      console.error("[assistant] error", err);
      toast.error(err?.message ?? "Assistant error");
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    if (status === "ready") inputRef.current?.focus();
  }, [status]);

  const onSubmit = () => {
    const text = input.trim();
    if (!text || status === "submitted" || status === "streaming") return;
    void sendMessage({ text });
    setInput("");
  };

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-4 p-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<Bot className="h-8 w-8" />}
              title={t("ai_empty_title")}
              description={t("ai_empty_desc")}
            />
          ) : (
            messages.map((m) => {
              const text = m.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("");
              return (
                <Message key={m.id} from={m.role}>
                  <MessageContent>
                    {m.role === "assistant" ? (
                      <MessageResponse>{text}</MessageResponse>
                    ) : (
                      <p className="whitespace-pre-wrap">{text}</p>
                    )}
                  </MessageContent>
                </Message>
              );
            })
          )}
          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>{`${t("ai_thinking")}…`}</Shimmer>
              </MessageContent>
            </Message>
          )}
          {error && (
            <p className="text-xs text-destructive">{error.message}</p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border bg-background p-3">
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea
            ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("ai_placeholder")}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit
              status={status}
              disabled={!input.trim() && !isBusy}
              onClick={isBusy ? () => stop() : undefined}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
