import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, RotateCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useMaterialPhotoUrls } from "@/lib/use-material-photo-urls";
import {
  MATERIAL_PHOTOS_BUCKET,
  MAX_MATERIAL_PHOTOS,
  UnsupportedPhotoFormatError,
  compressMaterialPhoto,
} from "@/lib/material-photos";
import { getErrorMessage } from "@/lib/utils";
import { PhotoLightbox } from "@/components/jaylor/photo-lightbox";

type PendingUpload = {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "failed";
  error?: string | undefined;
};

/**
 * Fabric intake photo grid + capture controls. Photos already committed
 * (persisted in `photoPaths`) are shown as normal thumbnails; a photo being
 * uploaded shows a spinner, and a failed one shows a retry button — a
 * failure in one photo of a batch never loses the others.
 */
export function MaterialPhotoManager({
  pathPrefix,
  photoPaths,
  onAdd,
  onRemove,
  canRemove,
  disabledReason,
}: {
  pathPrefix: string;
  photoPaths: string[];
  onAdd: (path: string) => Promise<void> | void;
  onRemove?: ((path: string) => Promise<void> | void) | undefined;
  canRemove: boolean;
  /** When set (e.g. "Photos need a connection...") disables adding and shows this text. */
  disabledReason?: string | null;
}) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [removingPath, setRemovingPath] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const { data: signedByPath } = useMaterialPhotoUrls(photoPaths);
  const thumbnails = photoPaths.map((p) => signedByPath?.get(p) ?? null);

  const roomLeft = MAX_MATERIAL_PHOTOS - photoPaths.length - pending.length;

  async function processOne(upload: PendingUpload) {
    try {
      const compressed = await compressMaterialPhoto(upload.file);
      const path = `${pathPrefix}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(MATERIAL_PHOTOS_BUCKET)
        .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;

      try {
        await onAdd(path);
      } catch (commitError) {
        // Upload succeeded but the DB commit didn't -- clean up the orphan.
        await supabase.storage.from(MATERIAL_PHOTOS_BUCKET).remove([path]);
        throw commitError;
      }

      setPending((prev) => prev.filter((p) => p.id !== upload.id));
      URL.revokeObjectURL(upload.previewUrl);
    } catch (error) {
      const message =
        error instanceof UnsupportedPhotoFormatError
          ? error.message
          : getErrorMessage(error, "Could not upload this photo");
      setPending((prev) =>
        prev.map((p) => (p.id === upload.id ? { ...p, status: "failed", error: message } : p)),
      );
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_MATERIAL_PHOTOS - photoPaths.length - pending.length;
    if (room <= 0) {
      toast.error(`Maximum ${MAX_MATERIAL_PHOTOS} photos per material`);
      return;
    }
    const toAdd = Array.from(files).slice(0, room);
    const uploads: PendingUpload[] = toAdd.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "uploading",
    }));
    setPending((prev) => [...prev, ...uploads]);
    for (const upload of uploads) void processOne(upload);
  }

  function retry(upload: PendingUpload) {
    setPending((prev) =>
      prev.map((p) => (p.id === upload.id ? { ...p, status: "uploading", error: undefined } : p)),
    );
    void processOne({ ...upload, status: "uploading" });
  }

  function dismissFailed(id: string) {
    setPending((prev) => {
      const upload = prev.find((p) => p.id === id);
      if (upload) URL.revokeObjectURL(upload.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function handleRemove(path: string) {
    if (!onRemove) return;
    setRemovingPath(path);
    try {
      await onRemove(path);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not remove this photo"));
    } finally {
      setRemovingPath(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photoPaths.map((path, i) => (
          <div key={path} className="relative size-16">
            <button
              type="button"
              className="size-16 cursor-zoom-in overflow-hidden rounded-lg border border-border bg-muted"
              onClick={() => setLightboxIndex(i)}
              disabled={!thumbnails[i]}
            >
              {thumbnails[i] ? (
                <img src={thumbnails[i] as string} alt="" className="size-full object-cover" />
              ) : (
                <Loader2 className="m-auto size-4 animate-spin text-muted-foreground" />
              )}
            </button>
            {canRemove && onRemove && (
              <button
                type="button"
                onClick={() => handleRemove(path)}
                disabled={removingPath === path}
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-background shadow-sm"
              >
                {removingPath === path ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <X className="size-3" />
                )}
              </button>
            )}
          </div>
        ))}

        {pending.map((upload) => (
          <div key={upload.id} className="relative size-16">
            <img
              src={upload.previewUrl}
              alt=""
              className="size-16 rounded-lg border border-border object-cover opacity-60"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              {upload.status === "uploading" ? (
                <Loader2 className="size-5 animate-spin text-white drop-shadow" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => retry(upload)}
                    aria-label="Retry upload"
                    className="flex size-6 items-center justify-center rounded-full bg-owed text-white"
                  >
                    <RotateCw className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
            {upload.status === "failed" && (
              <button
                type="button"
                onClick={() => dismissFailed(upload.id)}
                aria-label="Dismiss"
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-background shadow-sm"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {pending.some((p) => p.status === "failed") && (
        <p className="text-xs text-owed">Some photos couldn&apos;t upload — tap to retry.</p>
      )}

      {disabledReason ? (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      ) : roomLeft <= 0 ? (
        <p className="text-xs text-muted-foreground">
          Maximum {MAX_MATERIAL_PHOTOS} photos per material
        </p>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="size-4" />
            Take photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => galleryInputRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            Choose photo
          </Button>
        </div>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <PhotoLightbox
        photos={thumbnails.filter((t): t is string => !!t)}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  );
}
