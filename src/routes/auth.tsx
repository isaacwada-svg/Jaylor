import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/jaylor/logo";
import { StitchDivider } from "@/components/jaylor/stitch-divider";
import {
  COMPANY_LINE,
  PENDING_INVITE_KEY,
  PENDING_PASSPORT_SHARE_KEY,
  PENDING_REFERRAL_KEY,
} from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { normalizePhoneNG } from "@/lib/phone";
import { signInWithPhone } from "@/lib/auth-lookup.functions";
import { TermsGateDialog } from "@/components/jaylor/terms-gate-dialog";
import { LanguageSwitcher } from "@/components/jaylor/language-switcher";
import { resolveLanguage } from "@/lib/i18n/resolve-language.server";
import { loadNamespaces } from "@/lib/i18n/load-namespaces";
import { I18nProvider, useT, useLanguage } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/auth")({
  staticData: { sitemap: false },
  validateSearch: (
    search: Record<string, unknown>,
  ): { mode?: "signup"; ref?: string; passport_share?: string; lang?: string } => ({
    ...(search["mode"] === "signup" ? { mode: "signup" as const } : {}),
    ...(typeof search["ref"] === "string" && search["ref"] ? { ref: search["ref"] } : {}),
    ...(typeof search["passport_share"] === "string" && search["passport_share"]
      ? { passport_share: search["passport_share"] }
      : {}),
    ...(typeof search["lang"] === "string" ? { lang: search["lang"] } : {}),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ deps }) => {
    const language = await resolveLanguage({ data: { urlLang: deps.lang } });
    const resources = await loadNamespaces(language, ["common", "auth"]);
    return { language, resources };
  },
  head: () => ({
    meta: [
      { title: "Sign in: Jaylor" },
      {
        name: "description",
        content:
          "Sign in to Jaylor to track every order and collect every naira for your tailoring business.",
      },
      { property: "og:title", content: "Sign in: Jaylor" },
      {
        property: "og:description",
        content: "Sign in to your Jaylor workroom: orders, measurements, payments and reminders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthRoute,
});

function AuthRoute() {
  const { language, resources } = Route.useLoaderData();
  return (
    <I18nProvider language={language} resources={resources}>
      <AuthPage />
    </I18nProvider>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const t = useT("auth");
  const language = useLanguage();
  const {
    mode: initialMode,
    ref: referralCode,
    passport_share: passportShareToken,
  } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(initialMode ?? "signin");
  const [recovery, setRecovery] = useState(false);
  const [name, setName] = useState("");
  const [whatsappRaw, setWhatsappRaw] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => {
    if (!referralCode) return;
    try {
      sessionStorage.setItem(PENDING_REFERRAL_KEY, referralCode);
    } catch {
      // ignore storage failures
    }
  }, [referralCode]);

  useEffect(() => {
    if (!passportShareToken) return;
    try {
      sessionStorage.setItem(PENDING_PASSPORT_SHARE_KEY, passportShareToken);
    } catch {
      // ignore storage failures
    }
  }, [passportShareToken]);

  useEffect(() => {
    document.title =
      mode === "signup"
        ? "Create account | Jaylor"
        : mode === "reset"
          ? "Reset password | Jaylor"
          : "Sign in | Jaylor";
  }, [mode]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_IN" && session?.user) {
        const phone = (session.user.user_metadata as { whatsapp_phone?: string } | undefined)
          ?.whatsapp_phone;
        if (phone) {
          void supabase
            .from("phone_directory")
            .upsert({ phone, user_id: session.user.id }, { onConflict: "phone" });
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleResetRequest(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/auth",
      });
      if (error) throw error;
      setSent(true);
    } catch (error) {
      toast.error(getErrorMessage(error, t("something_wrong")));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetNewPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t("password_updated"));
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(getErrorMessage(error, t("something_wrong")));
    } finally {
      setBusy(false);
    }
  }

  function goToPostAuthDestination() {
    let pendingInviteToken: string | null = null;
    try {
      pendingInviteToken = sessionStorage.getItem(PENDING_INVITE_KEY);
    } catch {
      // ignore storage failures
    }
    if (pendingInviteToken) {
      navigate({ to: "/join/$token", params: { token: pendingInviteToken } });
      return;
    }
    navigate({ to: "/dashboard" });
  }

  async function performSignup() {
    const whatsapp = normalizePhoneNG(whatsappRaw);
    if (!whatsapp) {
      toast.error(t("invalid_whatsapp"));
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: name, whatsapp_phone: whatsapp },
        },
      });
      if (error) throw error;
      setTermsOpen(false);
      if (!data.session) {
        if (data.user) void trackEvent("signup_completed", data.user.id);
        setSent(true);
        return;
      }
      if (data.user) void trackEvent("signup_completed", data.user.id);
      // Carry the language picked on this page (via the switcher, already
      // written to the jaylor_lang cookie) into the new profile's own
      // ui_language, now that signup gave us a session to call this as.
      void supabase.rpc("set_my_ui_language", { p_language: language });
      goToPostAuthDestination();
    } catch (error) {
      toast.error(getErrorMessage(error, t("something_wrong")));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (mode === "signup") {
      const whatsapp = normalizePhoneNG(whatsappRaw);
      if (!whatsapp) {
        toast.error(t("invalid_whatsapp"));
        return;
      }
      setTermsOpen(true);
      return;
    }

    setBusy(true);
    try {
      const loginEmail = identifier.trim();
      if (!loginEmail.includes("@")) {
        const phone = normalizePhoneNG(loginEmail);
        if (!phone) {
          toast.error(t("invalid_identifier"));
          setBusy(false);
          return;
        }
        const result = await signInWithPhone({ data: { phone, password } });
        if (!result.ok) {
          toast.error(t("whatsapp_login_mismatch"));
          setBusy(false);
          return;
        }
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });
        if (sessionError) throw sessionError;
        goToPostAuthDestination();
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
      if (error) throw error;
      goToPostAuthDestination();
    } catch (error) {
      toast.error(getErrorMessage(error, t("something_wrong")));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error(t("google_signin_failed"));
      return;
    }
    if (result.redirected) return;
    goToPostAuthDestination();
  }

  return (
    <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo showTagline markClassName="h-12 w-auto" />
        </Link>
        <p className="mt-3 text-center text-sm text-muted-foreground">{t("tagline")}</p>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          {recovery ? (
            <>
              <h1 className="text-xl">{t("set_new_password_title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("set_new_password_description")}
              </p>
              <form onSubmit={handleSetNewPassword} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("new_password_label")}</Label>
                  <PasswordInput
                    id="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={10}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {t("update_password_button")}
                </Button>
              </form>
            </>
          ) : sent ? (
            <div className="text-center">
              <h1 className="text-xl">{t("check_email_title")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "reset"
                  ? t("check_email_reset", { email })
                  : t("check_email_confirm", { email })}
              </p>
            </div>
          ) : mode === "reset" ? (
            <>
              <h1 className="text-xl">{t("reset_title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("reset_description")}</p>
              <form onSubmit={handleResetRequest} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">{t("email_label")}</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {t("send_reset_link_button")}
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                <button
                  type="button"
                  className="font-medium text-gold underline-offset-4 hover:underline"
                  onClick={() => setMode("signin")}
                >
                  {t("back_to_sign_in")}
                </button>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl">
                {mode === "signin" ? t("welcome_back") : t("create_your_account")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signin" ? t("sign_in_subtitle") : t("signup_subtitle")}
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {mode === "signup" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="name">{t("name_label")}</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Chioma Eze"
                        autoComplete="name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-whatsapp">{t("whatsapp_label")}</Label>
                      <Input
                        id="signup-whatsapp"
                        type="tel"
                        value={whatsappRaw}
                        onChange={(e) => setWhatsappRaw(e.target.value)}
                        placeholder="0800 000 0000"
                        autoComplete="tel"
                        required
                      />
                    </div>
                  </>
                )}
                {mode === "signup" ? (
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("email_label")}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="identifier">{t("identifier_label")}</Label>
                    <Input
                      id="identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="you@example.com or 0800 000 0000"
                      autoComplete="username"
                      required
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t("password_label")}</Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="text-xs font-medium text-gold underline-offset-4 hover:underline"
                        onClick={() => setMode("reset")}
                      >
                        {t("forgot_password")}
                      </button>
                    )}
                  </div>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    minLength={mode === "signup" ? 10 : 8}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {mode === "signin" ? t("sign_in_button") : t("create_account_button")}
                </Button>
                {mode === "signup" && (
                  <p className="text-center text-xs text-muted-foreground">
                    {t("terms_agreement_prefix")}{" "}
                    <Link
                      to="/terms"
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      {t("terms_link")}
                    </Link>{" "}
                    {t("terms_agreement_middle")}{" "}
                    <Link
                      to="/privacy-policy"
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      {t("privacy_link")}
                    </Link>{" "}
                    {t("terms_agreement_suffix")}
                  </p>
                )}
              </form>

              <StitchDivider className="my-6" />

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogle}
                disabled={busy}
              >
                {t("continue_google")}
              </Button>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signin" ? t("new_to_jaylor") : t("already_have_account")}{" "}
                <button
                  type="button"
                  className="font-medium text-gold underline-offset-4 hover:underline"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                >
                  {mode === "signin" ? t("create_an_account") : t("sign_in_link")}
                </button>
              </p>
            </>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>

      <TermsGateDialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        onAccept={performSignup}
        busy={busy}
      />
    </main>
  );
}
