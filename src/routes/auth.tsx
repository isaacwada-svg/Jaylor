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
import { COMPANY_LINE, PENDING_INVITE_KEY, PENDING_REFERRAL_KEY } from "@/lib/jaylor";
import { getErrorMessage } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { normalizePhoneNG } from "@/lib/phone";
import { signInWithPhone } from "@/lib/auth-lookup.functions";

export const Route = createFileRoute("/auth")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { mode?: "signup"; ref?: string } => ({
    ...(search["mode"] === "signup" ? { mode: "signup" as const } : {}),
    ...(typeof search["ref"] === "string" && search["ref"] ? { ref: search["ref"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Jaylor" },
      {
        name: "description",
        content:
          "Sign in to Jaylor to track every order and collect every naira for your tailoring business.",
      },
      { property: "og:title", content: "Sign in — Jaylor" },
      {
        property: "og:description",
        content: "Sign in to your Jaylor workroom: orders, measurements, payments and reminders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { mode: initialMode, ref: referralCode } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(initialMode ?? "signin");
  const [recovery, setRecovery] = useState(false);
  const [name, setName] = useState("");
  const [whatsappRaw, setWhatsappRaw] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!referralCode) return;
    try {
      sessionStorage.setItem(PENDING_REFERRAL_KEY, referralCode);
    } catch {
      // ignore storage failures
    }
  }, [referralCode]);

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
      toast.error(getErrorMessage(error, "Something went wrong"));
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
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(getErrorMessage(error, "Something went wrong"));
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (mode === "signup") {
      const whatsapp = normalizePhoneNG(whatsappRaw);
      if (!whatsapp) {
        toast.error("Enter a valid Nigerian WhatsApp number");
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
        if (!data.session) {
          if (data.user) void trackEvent("signup_completed", data.user.id);
          setSent(true);
          return;
        }
        if (data.user) void trackEvent("signup_completed", data.user.id);
        goToPostAuthDestination();
      } catch (error) {
        toast.error(getErrorMessage(error, "Something went wrong"));
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const loginEmail = identifier.trim();
      if (!loginEmail.includes("@")) {
        const phone = normalizePhoneNG(loginEmail);
        if (!phone) {
          toast.error("Enter your email or a valid WhatsApp number");
          setBusy(false);
          return;
        }
        const result = await signInWithPhone({ data: { phone, password } });
        if (!result.ok) {
          toast.error("That WhatsApp number and password don't match an account");
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
      toast.error(getErrorMessage(error, "Something went wrong"));
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
      toast.error("Google sign-in could not start. Please try again.");
      return;
    }
    if (result.redirected) return;
    goToPostAuthDestination();
  }

  return (
    <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo showTagline markClassName="h-12 w-auto" />
        </Link>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Every order tracked. Every naira collected.
        </p>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          {recovery ? (
            <>
              <h1 className="text-xl">Set a new password</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a new password for your account.
              </p>
              <form onSubmit={handleSetNewPassword} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
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
                  Update password
                </Button>
              </form>
            </>
          ) : sent ? (
            <div className="text-center">
              <h1 className="text-xl">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "reset"
                  ? `We sent a password reset link to ${email}.`
                  : `We sent a confirmation link to ${email}. Open it to finish setting up your workroom.`}
              </p>
            </div>
          ) : mode === "reset" ? (
            <>
              <h1 className="text-xl">Reset your password</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;ll email you a link to choose a new one.
              </p>
              <form onSubmit={handleResetRequest} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
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
                  Send reset link
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                <button
                  type="button"
                  className="font-medium text-gold underline-offset-4 hover:underline"
                  onClick={() => setMode("signin")}
                >
                  Back to sign in
                </button>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to your workroom."
                  : "Set up your tailoring business in a minute."}
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {mode === "signup" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="name">Your name</Label>
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
                      <Label htmlFor="signup-whatsapp">WhatsApp number</Label>
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
                    <Label htmlFor="email">Email</Label>
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
                    <Label htmlFor="identifier">Email or WhatsApp number</Label>
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
                    <Label htmlFor="password">Password</Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="text-xs font-medium text-gold underline-offset-4 hover:underline"
                        onClick={() => setMode("reset")}
                      >
                        Forgot password?
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
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>
                {mode === "signup" && (
                  <p className="text-center text-xs text-muted-foreground">
                    By creating an account you agree to our{" "}
                    <Link
                      to="/terms"
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link
                      to="/privacy-policy"
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      Privacy Policy
                    </Link>
                    .
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
                Continue with Google
              </Button>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signin" ? "New to Jaylor?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  className="font-medium text-gold underline-offset-4 hover:underline"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                >
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
