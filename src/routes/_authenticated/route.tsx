import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StoreProvider, useStore } from "@/lib/store-context";
import { AppI18nProvider } from "@/lib/i18n/i18n-context";
import { AiCreditsProvider } from "@/lib/ai-credits";

export const Route = createFileRoute("/_authenticated")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  // PR U: the app uses Montserrat 700/800 and Playfair Display 700, which the
  // public pages don't load. Requested here so only logged-in screens pay
  // for them.
  head: () => ({
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Playfair+Display:wght@700&display=swap",
      },
    ],
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => (
    <AppThemeScope>
      <StoreProvider>
        <RequireStore>
          <AppLanguageGate>
            {/* Every authenticated page can use voice order entry, WhatsApp
              reply drafts, and the Ask Jaylor advisor -- not just AI Studio
              and Festive, which already wrap themselves in their own nested
              provider (harmless, just redundant). One provider here means
              every AI feature's credit sheet/toast UX works everywhere. */}
            <AiCreditsProvider>
              <Outlet />
            </AiCreditsProvider>
          </AppLanguageGate>
        </RequireStore>
      </StoreProvider>
    </AppThemeScope>
  ),
});

/** Puts .jaylor-app on <html> while a logged-in screen is mounted, so the
 *  app's navy-and-gold tokens (styles.css) also reach dialogs, sheets and
 *  toasts portalled to <body>. Public and client pages never get it. */
function AppThemeScope({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.classList.add("jaylor-app");
    return () => document.documentElement.classList.remove("jaylor-app");
  }, []);
  return <>{children}</>;
}

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
