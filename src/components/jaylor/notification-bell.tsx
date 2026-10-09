import { formatDistanceToNowStrict } from "date-fns";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Banknote,
  ShoppingBag,
  Clock,
  AlertTriangle,
  Users2,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type StoreNotification,
} from "@/lib/notifications";

const ICON_BY_TYPE: Record<string, LucideIcon> = {
  new_order: ShoppingBag,
  payment_received: Banknote,
  delivery_due_soon: Clock,
  balance_overdue: AlertTriangle,
  staff_joined: Users2,
  plan_limit_approaching: Gauge,
};

export function NotificationBell({
  storeId,
  tone = "plain",
}: {
  storeId: string;
  /** "plain": the original ghost icon button. "light"/"dark": the 44px
   *  square from the Home header, on a light page or on the navy header. */
  tone?: "plain" | "light" | "dark";
}) {
  const navigate = useNavigate();
  const { data: notifications } = useNotifications(storeId);
  const markRead = useMarkNotificationRead(storeId);
  const markAllRead = useMarkAllNotificationsRead(storeId);

  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length;

  function handleClick(notification: StoreNotification) {
    if (!notification.read_at) markRead.mutate(notification.id);
    if (notification.link) navigate({ to: notification.link });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {tone === "plain" ? (
          <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-ink">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        ) : (
          <button
            type="button"
            data-tour="notifications"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} new` : "Notifications"}
            className={cn(
              "relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tone === "dark"
                ? "bg-navy-raised text-on-navy hover:bg-navy-raised/80"
                : "border border-outline bg-card text-primary hover:bg-accent",
            )}
          >
            <Bell className="size-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                className={cn(
                  "absolute right-[11px] top-[10px] size-2 rounded-full",
                  tone === "dark"
                    ? "bg-gold-dot ring-2 ring-navy-raised"
                    : "bg-count-badge ring-2 ring-card",
                )}
              />
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="text-xs text-muted-foreground hover:text-gold"
            >
              Mark all as read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nothing yet — you&apos;ll see new orders, payments and reminders here.
            </p>
          ) : (
            notifications.map((n) => {
              const Icon = ICON_BY_TYPE[n.type] ?? Bell;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-accent/40",
                    !n.read_at && "border-l-2 border-l-gold bg-accent/10",
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-gold" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{n.message}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </span>
                  {!n.read_at && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
