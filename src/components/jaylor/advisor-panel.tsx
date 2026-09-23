import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useAdvisorThreads,
  useAdvisorMessages,
  useSendAdvisorMessage,
  useDeleteAdvisorThread,
} from "@/lib/advisor";

const TRIAL_DAYS = 30;
const TRIAL_NOTICE_KEY_PREFIX = "jaylor:advisor-trial-notice:";
const NEW_CONVERSATION_VALUE = "__new";

export function AdvisorPanel({
  storeId,
  storeCreatedAt,
}: {
  storeId: string;
  storeCreatedAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: threads } = useAdvisorThreads(storeId);
  const { data: messages } = useAdvisorMessages(threadId);
  const send = useSendAdvisorMessage(storeId);
  const deleteThread = useDeleteAdvisorThread(storeId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, send.isPending]);

  useEffect(() => {
    if (!open) return;
    const trialEnd = new Date(storeCreatedAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() < trialEnd) return;
    const key = `${TRIAL_NOTICE_KEY_PREFIX}${storeId}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      return;
    }
    toast("Your workroom's advisor is now on the Free plan's allowance.", {
      description: "Upgrade any time for a higher monthly limit and a stronger model.",
    });
  }, [open, storeCreatedAt, storeId]);

  async function handleSend() {
    const text = input.trim();
    if (!text || send.isPending) return;
    setInput("");
    try {
      const result = await send.mutateAsync({ threadId, message: text });
      setThreadId(result.threadId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reach the advisor");
      setInput(text);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this conversation?")) return;
    await deleteThread.mutateAsync(id);
    if (threadId === id) setThreadId(null);
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        aria-label="Ask Jaylor"
        className="fixed bottom-36 right-4 z-40 gap-2 rounded-none shadow-float lg:bottom-8 lg:right-8"
      >
        <Sparkles className="size-4" />
        Ask Jaylor
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader className="text-left">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="text-xl">Ask Jaylor</SheetTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setThreadId(null);
                  setInput("");
                }}
              >
                <Plus className="size-4" />
                New
              </Button>
            </div>
            {threads && threads.length > 0 && (
              <Select
                value={threadId ?? NEW_CONVERSATION_VALUE}
                onValueChange={(value) =>
                  setThreadId(value === NEW_CONVERSATION_VALUE ? null : value)
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="New conversation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_CONVERSATION_VALUE}>New conversation</SelectItem>
                  {threads.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </SheetHeader>

          <ScrollArea className="mt-2 flex-1 pr-2">
            <div className="space-y-3 pb-2">
              {!threadId || !messages || messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ask about a client, a price, cash flow, or how to use any feature — Jaylor knows
                  your shop&apos;s own orders, payments and balances.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                      m.role === "user"
                        ? "ml-auto bg-accent text-accent-foreground"
                        : "border border-border bg-card",
                    )}
                  >
                    {m.content}
                  </div>
                ))
              )}
              {send.isPending && (
                <div className="max-w-[85%] rounded-2xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                  Thinking…
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {threadId && (
            <button
              type="button"
              onClick={() => handleDelete(threadId)}
              className="mt-1 self-end text-xs text-muted-foreground hover:text-owed"
            >
              <Trash2 className="mr-1 inline size-3" />
              Delete conversation
            </button>
          )}

          <div className="mt-2 flex items-end gap-2 border-t border-border pt-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Ask a question…"
              rows={2}
              className="min-h-0 flex-1 resize-none"
              disabled={send.isPending}
            />
            <Button
              size="icon"
              onClick={() => void handleSend()}
              disabled={send.isPending || !input.trim()}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
