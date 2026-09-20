import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "storefront-photos";
const MARKER = `/${BUCKET}/`;
const SIGNED_SECONDS = 60 * 60;

/** Accepts a bare storage path or a legacy full public URL and returns the object path. */
export function toStorefrontPath(value: string): string {
  const marker = value.indexOf(MARKER);
  if (marker === -1) return value.replace(/^\/+/, "");
  return value.slice(marker + MARKER.length).split("?")[0] as string;
}

/**
 * Storefront photos live in a private bucket. This signs every referenced photo
 * once and returns a lookup that maps the stored value to a viewable URL.
 */
export function useStorefrontPhotoUrls(values: (string | null | undefined)[]) {
  const paths = Array.from(
    new Set(
      values
        .filter((v): v is string => !!v && !v.startsWith("data:") && !v.startsWith("blob:"))
        .map(toStorefrontPath),
    ),
  ).sort();

  const { data } = useQuery({
    queryKey: ["storefront-photo-urls", paths.join("|")],
    enabled: paths.length > 0,
    staleTime: (SIGNED_SECONDS - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_SECONDS);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
      }
      return map;
    },
  });

  return (value?: string | null): string | undefined => {
    if (!value) return undefined;
    if (value.startsWith("data:") || value.startsWith("blob:")) return value;
    return data?.[toStorefrontPath(value)];
  };
}
