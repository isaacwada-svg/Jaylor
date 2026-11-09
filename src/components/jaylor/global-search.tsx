import { useEffect, useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Scissors, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppT } from "@/lib/i18n/i18n-context";
import { cn } from "@/lib/utils";

function useDebounced(value: string, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Orders and clients by name, phone, order number or garment. */
function useSearchResults(storeId: string | undefined, raw: string) {
  const term = useDebounced(
    raw
      .trim()
      .replace(/[%,()*\\]/g, "")
      .slice(0, 60),
  );
  const query = useQuery({
    queryKey: ["global-search", storeId, term],
    enabled: !!storeId && term.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const [clients, orders] = await Promise.all([
        supabase
          .from("clients")
          .select("id, full_name, phone")
          .eq("store_id", storeId as string)
          .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`)
          .limit(5),
        supabase
          .from("orders_for_tailor")
          .select("id, number, garment_type, status")
          .eq("store_id", storeId as string)
          .or(`number.ilike.%${term}%,garment_type.ilike.%${term}%`)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      if (clients.error) throw clients.error;
      if (orders.error) throw orders.error;
      return { clients: clients.data ?? [], orders: orders.data ?? [] };
    },
  });
  return { term, ...query };
}

export function SearchPanel({
  storeId,
  variant,
  autoFocus,
  onNavigate,
  className,
}: {
  storeId: string | undefined;
  /** "inline" shows results as a dropdown under the field (desktop header);
   *  "stacked" lists them below it (inside the phone search dialog). */
  variant: "inline" | "stacked";
  autoFocus?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const t = useAppT("app_common");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const { term, data, isFetching } = useSearchResults(storeId, q);
  const showResults = term.length >= 2 && (variant === "stacked" || open);
  const empty = data && data.clients.length === 0 && data.orders.length === 0;

  function done() {
    setQ("");
    setOpen(false);
    onNavigate?.();
  }

  const results = (
    <div
      id={listId}
      role="listbox"
      aria-label={t("search_results") || "Search results"}
      className={cn(
        "overflow-hidden",
        variant === "inline" &&
          "absolute inset-x-0 top-full z-40 mt-2 rounded-xl border border-border bg-popover shadow-lg",
        variant === "stacked" && "mt-3",
      )}
    >
      {empty ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {isFetching ? t("searching") || "Searching..." : t("search_none") || "Nothing found"}
        </p>
      ) : (
        <>
          {(data?.orders ?? []).map((o) => (
            <Link
              key={`o-${o.id}`}
              role="option"
              aria-selected={false}
              to="/orders/$orderId"
              params={{ orderId: o.id ?? "" }}
              onClick={done}
              className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm hover:bg-accent"
            >
              <Scissors className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="num shrink-0 text-xs text-muted-foreground">{o.number}</span>
              <span className="min-w-0 truncate font-semibold">{o.garment_type}</span>
            </Link>
          ))}
          {(data?.clients ?? []).map((c) => (
            <Link
              key={`c-${c.id}`}
              role="option"
              aria-selected={false}
              to="/clients/$clientId"
              params={{ clientId: c.id }}
              onClick={done}
              className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm hover:bg-accent"
            >
              <User className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-semibold">{c.full_name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{c.phone}</span>
            </Link>
          ))}
        </>
      )}
    </div>
  );

  return (
    <div
      className={cn("relative", className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-outline bg-card px-3 text-muted-foreground focus-within:ring-1 focus-within:ring-ring">
        <Search className="size-[18px] shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          maxLength={60}
          aria-label={t("search_aria") || "Search orders and clients"}
          aria-controls={showResults ? listId : undefined}
          placeholder={t("search_placeholder") || "Search orders, clients"}
          className="min-w-0 flex-1 bg-transparent text-base text-foreground lg:text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      {showResults && results}
    </div>
  );
}
