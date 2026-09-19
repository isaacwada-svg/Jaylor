import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Store = Tables<"stores">;
type StoreRole = Tables<"store_members">["role"];

export type StoreMembership = {
  role: StoreRole;
  store: Store;
};

const CURRENT_STORE_KEY = "jaylor:currentStoreId";

async function fetchMemberships(): Promise<StoreMembership[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("store_members")
    .select("role, store:stores(*)")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? [])
    .filter((row): row is { role: StoreRole; store: Store } => row.store !== null)
    .sort((a, b) => a.store.name.localeCompare(b.store.name));
}

type StoreContextValue = {
  memberships: StoreMembership[];
  currentStore: Store | null;
  currentRole: StoreRole | null;
  setCurrentStoreId: (storeId: string) => void;
  isLoading: boolean;
  refetch: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: memberships, isLoading } = useQuery({
    queryKey: ["store-memberships"],
    queryFn: fetchMemberships,
  });

  const [currentStoreId, setCurrentStoreIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(CURRENT_STORE_KEY);
    } catch {
      return null;
    }
  });

  const list = memberships ?? [];

  useEffect(() => {
    if (list.length === 0) return;
    const stillValid = list.some((m) => m.store.id === currentStoreId);
    if (!stillValid) {
      setCurrentStoreIdState(list[0]!.store.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.map((m) => m.store.id).join(",")]);

  const setCurrentStoreId = useCallback((storeId: string) => {
    setCurrentStoreIdState(storeId);
    try {
      window.localStorage.setItem(CURRENT_STORE_KEY, storeId);
    } catch {
      // ignore storage failures (private mode etc.)
    }
  }, []);

  const current = list.find((m) => m.store.id === currentStoreId) ?? list[0] ?? null;

  const value = useMemo<StoreContextValue>(
    () => ({
      memberships: list,
      currentStore: current?.store ?? null,
      currentRole: current?.role ?? null,
      setCurrentStoreId,
      isLoading,
      refetch: () => queryClient.invalidateQueries({ queryKey: ["store-memberships"] }),
    }),
    [list, current, setCurrentStoreId, isLoading, queryClient],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within a StoreProvider");
  return ctx;
}
