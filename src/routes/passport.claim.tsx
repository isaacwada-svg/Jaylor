import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BrandLogo } from "@/components/jaylor/logo";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { LanguageSwitcher } from "@/components/jaylor/language-switcher";
import { useOnlineStatus } from "@/lib/use-online-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPANY_LINE } from "@/lib/jaylor";
import { displayPhone } from "@/lib/portal-phone";
import { requestPassportCode, verifyPassportCode } from "@/lib/passport-claim.functions";
import { savePassportSession } from "@/lib/passport-session";
import { resolveLanguage } from "@/lib/i18n/resolve-language.server";
import { loadNamespaces } from "@/lib/i18n/load-namespaces";
import { I18nProvider, useT } from "@/lib/i18n/i18n-context";

export const Route = createFileRoute("/passport/claim")({
  staticData: { sitemap: false },
  validateSearch: (
    search: Record<string, unknown>,
  ): { shareTo?: string; shareToName?: string; shareToWhatsapp?: string; lang?: string } => ({
    ...(typeof search["shareTo"] === "string" ? { shareTo: search["shareTo"] } : {}),
    ...(typeof search["shareToName"] === "string" ? { shareToName: search["shareToName"] } : {}),
    ...(typeof search["shareToWhatsapp"] === "string"
      ? { shareToWhatsapp: search["shareToWhatsapp"] }
      : {}),
    ...(typeof search["lang"] === "string" ? { lang: search["lang"] } : {}),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ deps }) => {
    const language = await resolveLanguage({ data: { urlLang: deps.lang } });
    const resources = await loadNamespaces(language, ["common", "passport"]);
    return { language, resources };
  },
  head: () => ({
    meta: [
      { title: "Claim your Passport — Jaylor" },
      { name: "description", content: "Verify your phone number to see your measurements." },
    ],
  }),
  component: ClaimPassportRoute,
});

function ClaimPassportRoute() {
  const { language, resources } = Route.useLoaderData();
  return (
    <I18nProvider language={language} resources={resources}>
      <ClaimPassportPage />
    </I18nProvider>
  );
}

function ClaimPassportPage() {
  const navigate = useNavigate();
  const t = useT("passport");
  const { shareToName, shareToWhatsapp } = Route.useSearch();
  const online = useOnlineStatus();
  const requestCode = useServerFn(requestPassportCode);
  const verifyCode = useServerFn(verifyPassportCode);

  const [step, setStep] = useState<"phone" | "whatsapp" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [waLink, setWaLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRequestCode() {
    setBusy(true);
    try {
      const result = await requestCode({ data: { phone: phoneInput } });
      if (result.status === "error") {
        toast.error(result.error);
        return;
      }
      setPhone(phoneInput);
      if (result.status === "sent") {
        setStep("code");
        toast.success(t("code_sent_toast"));
      } else {
        setWaLink(result.whatsappLink);
        setStep("whatsapp");
      }
    } catch {
      toast.error(t("verify_error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    try {
      const result = await verifyCode({ data: { phone, code } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      savePassportSession(result.sessionToken);
      navigate({
        to: "/passport/me",
        search: shareToName && shareToWhatsapp ? { shareToName, shareToWhatsapp } : {},
      });
    } catch {
      toast.error(t("verify_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between">
          <span />
          <LanguageSwitcher />
        </div>
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl">{t("claim_title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("claim_description")}</p>

          {!online ? (
            <div className="mt-6">
              <OfflineNotice label={t("offline_claim")} />
            </div>
          ) : step === "phone" ? (
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="claim-phone">{t("phone_label")}</Label>
                <Input
                  id="claim-phone"
                  type="tel"
                  inputMode="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder={t("phone_placeholder")}
                  autoComplete="tel"
                />
              </div>
              <Button
                className="w-full"
                disabled={busy || phoneInput.trim().length < 6}
                onClick={handleRequestCode}
              >
                {busy ? t("sending") : t("send_code_button")}
              </Button>
            </div>
          ) : step === "whatsapp" ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">{t("whatsapp_message_first")}</p>
              <Button className="w-full" asChild>
                <a href={waLink ?? "#"} target="_blank" rel="noopener noreferrer">
                  {t("open_whatsapp_button")}
                </a>
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setStep("code")}>
                {t("have_code_button")}
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="claim-code">{t("code_label")}</Label>
                <Input
                  id="claim-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("code_placeholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("sent_to", {
                    phone: phone ? displayPhone(phone) : t("sent_to_whatsapp_fallback"),
                  })}
                </p>
              </div>
              <Button className="w-full" disabled={busy || code.length < 4} onClick={handleVerify}>
                {busy ? t("checking") : t("verify_button")}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep("phone")}>
                {t("use_different_number")}
              </Button>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
