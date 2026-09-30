import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGUAGES, type LanguageCode } from "@/lib/i18n/languages";
import { useLanguage } from "@/lib/i18n/i18n-context";
import { LANGUAGE_COOKIE_NAME } from "@/lib/i18n/resolve-language.server";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function setLanguageCookie(code: LanguageCode) {
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${code}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

/** Compact switcher for every client-facing page. Writes this browser's
 *  choice to a cookie (never the shop's settings or any other client's page)
 *  and updates ?lang= on the current URL so the route's own loader re-resolves
 *  language and re-fetches just the namespaces it needs. */
export function LanguageSwitcher() {
  const language = useLanguage();

  function choose(code: LanguageCode) {
    if (code === language) return;
    setLanguageCookie(code);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", code);
    // A full navigation (not router.navigate) so the loader re-runs against
    // the new cookie/?lang= from scratch -- simpler and more reliable here
    // than fighting TanStack Router's per-route search-param typing in a
    // component shared across many different route shapes.
    window.location.href = url.toString();
  }

  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Languages className="size-3.5" />
          {current.nativeName}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} onSelect={() => choose(l.code)}>
            {l.nativeName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
