import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resizeImageFile } from "@/lib/image";
import { useStorefrontPhotoUrls } from "@/lib/storefront-photos";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export function StoreProfileSettings({
  storeId,
  storeName,
  logoUrl,
  coverUrl,
}: {
  storeId: string;
  storeName: string;
  logoUrl: string | null;
  coverUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const photoUrl = useStorefrontPhotoUrls([logoUrl, coverUrl]);

  async function handleUpload(
    file: File | null,
    kind: "logo" | "cover",
    setBusy: (busy: boolean) => void,
  ) {
    if (!file) return;
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error("That photo is too large (max 15MB)");
      return;
    }
    setBusy(true);
    try {
      const resized = await resizeImageFile(file, kind === "logo" ? 512 : 1600, 0.85);
      const path = `${storeId}/${kind}-${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("storefront-photos")
        .upload(path, resized, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;

      const { error } =
        kind === "logo"
          ? await supabase.from("stores").update({ logo_url: path }).eq("id", storeId)
          : await supabase.from("stores").update({ cover_url: path }).eq("id", storeId);
      if (error) throw error;

      toast.success(kind === "logo" ? "Logo updated" : "Cover image updated");
      queryClient.invalidateQueries({ queryKey: ["store-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["storefront-photo-urls"] });
    } catch (error) {
      toast.error(
        getErrorMessage(error, `Could not upload your ${kind === "logo" ? "logo" : "cover image"}`),
      );
    } finally {
      setBusy(false);
    }
  }

  const resolvedLogo = photoUrl(logoUrl);
  const resolvedCover = photoUrl(coverUrl);

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-6 p-5">
        <div>
          <p className="font-medium">Shop logo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown on your storefront, receipts and invoices. Use a square image, at least 512×512px.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card font-heading text-xl">
              {uploadingLogo ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : resolvedLogo ? (
                <img src={resolvedLogo} alt="" className="size-full object-cover" />
              ) : (
                (storeName || "?").slice(0, 1).toUpperCase()
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingLogo}
              onClick={() => logoInputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              {logoUrl ? "Change logo" : "Upload logo"}
            </Button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleUpload(e.target.files?.[0] ?? null, "logo", setUploadingLogo);
                e.target.value = "";
              }}
            />
          </div>
          <Label className="sr-only">Shop logo</Label>
        </div>

        <div className="border-t border-border pt-6">
          <p className="font-medium">Storefront cover image</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The wide banner at the top of your public storefront page. Use a wide image, at least
            1600×400px (a 4:1 ratio works best) — anything narrower gets cropped.
          </p>
          <div className="mt-4 space-y-3">
            <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary to-primary/70">
              {uploadingCover ? (
                <Loader2 className="size-5 animate-spin text-primary-foreground" />
              ) : resolvedCover ? (
                <img src={resolvedCover} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-sm text-primary-foreground/70">No cover image yet</span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingCover}
              onClick={() => coverInputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              {coverUrl ? "Change cover image" : "Upload cover image"}
            </Button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleUpload(e.target.files?.[0] ?? null, "cover", setUploadingCover);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
