import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StoreProvider, useStore } from "@/lib/store-context";
import { AppI18nProvider } from "@/lib/i18n/i18n-context";

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
        <AppLanguageGate>
          <Outlet />
        </AppLanguageGate>
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

/** Fetches the signed-in user's own ui_language once, then wraps every
 *  authenticated screen in AppI18nProvider (PR M). */
function AppLanguageGate({ children }: { children: React.ReactNode }) {
  const { currentStore } = useStore();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile-ui-language"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("ui_language")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <AppI18nProvider
      profileUiLanguage={profile?.ui_language}
      storeLanguage={currentStore?.language}
    >
      {children}
    </AppI18nProvider>
  );
}
