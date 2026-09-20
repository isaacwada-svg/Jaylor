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
}: {
  storeId: string;
  storeName: string;
  logoUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photoUrl = useStorefrontPhotoUrls([logoUrl]);

  async function handleFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error("That photo is too large (max 15MB)");
      return;
    }
    setUploading(true);
    try {
      const resized = await resizeImageFile(file, 512, 0.85);
      const path = `${storeId}/logo-${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("storefront-photos")
        .upload(path, resized, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;

      const { error } = await supabase.from("stores").update({ logo_url: path }).eq("id", storeId);
      if (error) throw error;

      toast.success("Logo updated");
      queryClient.invalidateQueries({ queryKey: ["store-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["storefront-photo-urls"] });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not upload your logo"));
    } finally {
      setUploading(false);
    }
  }

  const resolvedLogo = photoUrl(logoUrl);

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <p className="font-medium">Shop logo</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Shown on your storefront, receipts and invoices.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card font-heading text-xl">
            {uploading ? (
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
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            {logoUrl ? "Change logo" : "Upload logo"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void handleFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>
        <Label className="sr-only">Shop logo</Label>
      </CardContent>
    </Card>
  );
}
