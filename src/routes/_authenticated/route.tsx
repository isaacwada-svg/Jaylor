import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StoreProvider, useStore } from "@/lib/store-context";

export const Route = createFileRoute("/_authenticated")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => (
    <StoreProvider>
      <RequireStore>
        <Outlet />
      </RequireStore>
    </StoreProvider>
  ),
});

function RequireStore({ children }: { children: React.ReactNode }) {
  const { memberships, isLoading } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && memberships.length === 0) {
      navigate({ to: "/onboarding" });
    }
  }, [isLoading, memberships.length, navigate]);

  if (isLoading || memberships.length === 0) {
    return <div className="min-h-screen bg-background" />;
  }

  return <>{children}</>;
}
