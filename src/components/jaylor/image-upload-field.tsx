import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resizeImageFile } from "@/lib/image";
import { useOnlineStatus } from "@/lib/use-online-status";
import { getErrorMessage } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { OfflineNotice } from "@/components/jaylor/offline-notice";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // 15MB, before client-side resize

export function ImageUploadField({
  storeId,
  value,
  onChange,
  max = 6,
  label = "Photos",
}: {
  storeId: string;
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  label?: string;
}) {
  const online = useOnlineStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const remaining = max - value.length;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files).slice(0, Math.max(0, remaining));
    if (picked.length === 0) {
      toast.error(`You can add up to ${max} photos`);
      return;
    }

    setUploadingCount((n) => n + picked.length);
    for (const original of picked) {
      try {
        if (original.size > MAX_SOURCE_BYTES) {
          toast.error(`${original.name} is too large (max 15MB)`);
          continue;
        }
        const file = await resizeImageFile(original);
        const path = `${storeId}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("storefront-photos")
          .upload(path, file, { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw uploadError;
        onChange([...value, path]);
      } catch (error) {
        toast.error(getErrorMessage(error, `Could not upload ${original.name}`));
      } finally {
        setUploadingCount((n) => Math.max(0, n - 1));
      }
    }
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {value.length}/{max}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((url, i) => (
          <div
            key={url}
            className="group relative aspect-square overflow-hidden rounded-xl border border-border"
          >
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label="Remove photo"
              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        {Array.from({ length: uploadingCount }).map((_, i) => (
          <div
            key={`uploading-${i}`}
            className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border"
          >
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ))}

        {remaining > 0 && uploadingCount === 0 && online && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-muted-foreground hover:bg-accent/40"
          >
            <ImagePlus className="size-5" />
            <span className="text-xs">Add</span>
          </button>
        )}
      </div>

      {!online && value.length < max && (
        <OfflineNotice label="Uploading photos needs an internet connection." />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
