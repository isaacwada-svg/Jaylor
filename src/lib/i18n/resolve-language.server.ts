import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from "./languages";

/** Written by the client-side language switcher (document.cookie), read here
 *  on the server so a returning visitor keeps their choice without needing
 *  ?lang= on every link. */
export const LANGUAGE_COOKIE_NAME = "jaylor_lang";

function parseAcceptLanguage(header: string | null | undefined): LanguageCode | null {
  if (!header) return null;
  const candidates = header
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .filter((v): v is string => !!v);
  for (const candidate of candidates) {
    if (isLanguageCode(candidate)) return candidate;
    const base = candidate.split("-")[0];
    if (isLanguageCode(base)) return base;
  }
  return null;
}

const schema = z.object({
  urlLang: z.string().nullish(),
  clientPreferredLanguage: z.string().nullish(),
  storeLanguage: z.string().nullish(),
});

/** Priority, per PR L's spec: ?lang= -> the jaylor_lang cookie -> the client's
 *  saved preferred_language (only passed on pages that know a single client)
 *  -> the shop's own language (only passed on pages that know a single
 *  store) -> the browser's Accept-Language -> English.
 *
 *  A createServerFn so it always runs on the server (cookies/headers aren't
 *  readable otherwise) even though route loaders can run client-side during
 *  SPA navigation -- calling it is then just another server round trip, the
 *  same pattern already used for every other loader in this codebase. */
export const resolveLanguage = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(({ data }): LanguageCode => {
    if (isLanguageCode(data.urlLang)) return data.urlLang;

    const cookieLang = getCookie(LANGUAGE_COOKIE_NAME);
    if (isLanguageCode(cookieLang)) return cookieLang;

    if (isLanguageCode(data.clientPreferredLanguage)) return data.clientPreferredLanguage;

    if (isLanguageCode(data.storeLanguage)) return data.storeLanguage;

    const browserLang = parseAcceptLanguage(getRequestHeader("accept-language"));
    if (browserLang) return browserLang;

    return DEFAULT_LANGUAGE;
  });
