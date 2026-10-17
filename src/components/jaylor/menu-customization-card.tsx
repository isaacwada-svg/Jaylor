import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { TierBadge } from "./tier-badge";
import { PINNABLE_NAV, PINNABLE_NAV_GROUPS, PINNABLE_NAV_HINTS, visibleFor } from "./app-nav";
import { usePinnedNav } from "@/lib/pinned-nav";
import { useStore } from "@/lib/store-context";
import { useAppT } from "@/lib/i18n/i18n-context";

/** Settings > Customize your menu: the sidebar only shows Home, Orders,
 *  Clients, Payments and Settings by default. Everything else lives here,
 *  grouped, with a switch to pin it into the sidebar / mobile menu. */
export function MenuCustomizationCard() {
  const t = useAppT("app_common");
  const { currentRole } = useStore();
  const { isPinned, toggle } = usePinnedNav();
  const items = visibleFor(PINNABLE_NAV, currentRole);
  if (items.length === 0) return null;
  const byKey = new Map(items.map((item) => [item.key, item]));

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-5 p-5">
        <div>
          <p className="font-medium">{t("customize_menu_title") || "Customize your menu"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("customize_menu_hint") ||
              "Pin the features you use to the sidebar. Everything else stays here, out of the way."}
          </p>
        </div>
        <div className="space-y-5">
          {PINNABLE_NAV_GROUPS.map((group) => {
            const groupItems = group.keys
              .map((key) => byKey.get(key))
              .filter((item): item is NonNullable<typeof item> => !!item);
            if (groupItems.length === 0) return null;
            return (
              <div key={group.title} className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {group.title}
                </p>
                <div className="space-y-2">
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    const label = t(item.labelKey) || item.fallback;
                    const hint = PINNABLE_NAV_HINTS[item.key];
                    const pinned = isPinned(item.key);
                    return (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                      >
                        <Link
                          to={item.to}
                          {...(item.search ? { search: item.search } : {})}
                          {...(item.hash ? { hash: item.hash } : {})}
                          className="flex min-w-0 flex-1 items-center gap-3"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-gold">
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{label}</span>
                              {item.tier ? <TierBadge tier={item.tier} /> : null}
                            </span>
                            {hint && (
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {hint}
                              </span>
                            )}
                          </span>
                        </Link>
                        <Switch
                          checked={pinned}
                          onCheckedChange={() => toggle(item.key)}
                          aria-label={
                            pinned
                              ? `${t("unpin_from_menu") || "Remove from menu"} — ${label}`
                              : `${t("pin_to_menu") || "Add to menu"} — ${label}`
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
