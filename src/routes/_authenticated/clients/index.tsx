import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
import { AppShell } from "@/components/jaylor/app-shell";
import { EmptyState } from "@/components/jaylor/empty-state";
import { ClientForm } from "@/components/jaylor/client-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useStore } from "@/lib/store-context";
import { supabase } from "@/integrations/supabase/client";
import { formatPhoneNG } from "@/lib/phone";
import type { Tables } from "@/integrations/supabase/types";

type ClientRow = Tables<"clients">;

const PAGE_SIZE = 25;

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({
    meta: [
      { title: "Clients — Jaylor" },
      {
        name: "description",
        content:
          "Keep client details, versioned measurements and order history together, ready for the next fitting.",
      },
      { property: "og:title", content: "Clients — Jaylor" },
      {
        property: "og:description",
        content: "Client details, versioned measurements and order history in one place.",
      },
    ],
  }),
  component: Clients,
});

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function Clients() {
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const debouncedSearch = useDebounced(search);
  const debouncedTag = useDebounced(tagFilter);
  const [formOpen, setFormOpen] = useState(false);

  const queryKey = ["clients", storeId, debouncedSearch, debouncedTag];

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey,
    enabled: !!storeId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("clients")
        .select("*")
        .eq("store_id", storeId as string)
        .order("full_name", { ascending: true })
        .range(pageParam * PAGE_SIZE, pageParam * PAGE_SIZE + PAGE_SIZE - 1);

      const term = debouncedSearch.trim();
      if (term) {
        // Quote the pattern: PostgREST's `.or()` syntax treats commas,
        // parentheses and periods in an unquoted value as filter syntax.
        const escaped = term.replace(/"/g, '\\"');
        query = query.or(`full_name.ilike."%${escaped}%",phone.ilike."%${escaped}%"`);
      }
      const tag = debouncedTag.trim();
      if (tag) {
        query = query.contains("tags", [tag]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ClientRow[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length : undefined,
  });

  const clients = data?.pages.flat() ?? [];

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const hasFilter = Boolean(search || tagFilter);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl">Clients</h1>
          <Button onClick={() => setFormOpen(true)}>
            <UserPlus className="size-4" />
            New client
          </Button>
        </div>

        <div className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone"
              className="pl-9"
            />
          </div>
          <Input
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            placeholder="Filter by tag"
            className="w-36 sm:w-48"
          />
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            className="mt-10"
            title={hasFilter ? "No clients match" : "Your client book is empty"}
            description={
              hasFilter
                ? "Try a different name, phone number or tag."
                : "Add a client once, and their measurements stay ready for every future order."
            }
            action={
              !hasFilter ? <Button onClick={() => setFormOpen(true)}>New client</Button> : undefined
            }
          />
        ) : (
          <div className="mt-4 divide-y divide-border rounded-2xl border border-border">
            {clients.map((client) => (
              <Link
                key={client.id}
                to="/clients/$clientId"
                params={{ clientId: client.id }}
                className="flex touch-target items-center gap-3 p-4 transition-colors hover:bg-accent/40"
              >
                <Avatar className="size-10 shrink-0">
                  <AvatarFallback>{initials(client.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{client.full_name}</p>
                  <p className="figures truncate text-sm text-muted-foreground">
                    {formatPhoneNG(client.phone)}
                  </p>
                </div>
                {client.tags.length > 0 && (
                  <div className="hidden shrink-0 gap-1 sm:flex">
                    {client.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </Link>
            ))}
            <div ref={sentinelRef} className="h-1" />
            {isFetchingNextPage && (
              <p className="p-4 text-center text-sm text-muted-foreground">Loading more...</p>
            )}
          </div>
        )}
      </div>

      {storeId && (
        <ClientForm
          open={formOpen}
          onOpenChange={setFormOpen}
          storeId={storeId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["clients", storeId] })}
        />
      )}
    </AppShell>
  );
}
