import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MATERIAL_PHOTOS_BUCKET } from "@/lib/material-photos";

/** Fabric photos live in a private bucket, viewed through short-lived signed
 *  links, batched (one call for every path) rather than one request each. */
export function useMaterialPhotoUrls(paths: string[]) {
  const key = paths.join(",");
  return useQuery({
    queryKey: ["material-photo-urls", key],
    enabled: paths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(MATERIAL_PHOTOS_BUCKET)
        .createSignedUrls(paths, 3600);
      if (error) throw error;
      const map = new Map<string, string>();
      (data ?? []).forEach((item) => {
        if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
      });
      return map;
    },
  });
}
