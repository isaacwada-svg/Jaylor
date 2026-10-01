import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES } from "@/lib/i18n/languages";
import { useAppLanguage, useSetAppLanguage, useAppT } from "@/lib/i18n/i18n-context";

/** The signed-in user's own app language -- per user, not per store. Changing
 *  it updates the whole app immediately, without a reload or logout, and has
 *  no effect on any other staff member's own choice or on what clients see. */
export function LanguageSettingsCard() {
  const language = useAppLanguage();
  const setLanguage = useSetAppLanguage();
  const t = useAppT("app_settings");

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-2 p-4">
        <Label htmlFor="ui-language">{t("language_label") || "Language"}</Label>
        <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
          <SelectTrigger id="ui-language" className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.nativeName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t("language_note") ||
            "Only changes what you see. Other staff in this shop can pick their own language, and clients aren't affected."}
        </p>
      </CardContent>
    </Card>
  );
}
