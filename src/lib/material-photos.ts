export const MATERIAL_PHOTOS_BUCKET = "order-materials";
export const MAX_MATERIAL_PHOTOS = 6;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // 15MB, checked before compression

export class UnsupportedPhotoFormatError extends Error {
  constructor() {
    super(
      "This photo format is not supported, please take the photo again with the camera option.",
    );
    this.name = "UnsupportedPhotoFormatError";
  }
}

export function materialPhotoPathPrefix(
  storeId: string,
  orderId: string,
  materialId: string,
): string {
  return `${storeId}/${orderId}/${materialId}`;
}

/** Downscale/re-encode a fabric photo client-side (also strips EXIF, e.g.
 *  location data, since canvas re-encoding never carries it over). Unlike
 *  the shared resizeImageFile helper, a decode failure (e.g. some HEIC
 *  files) throws instead of silently falling back to the original file, so
 *  the caller can show a clear "format not supported" message. */
export async function compressMaterialPhoto(file: File): Promise<File> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("That photo is too large (max 15MB)");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UnsupportedPhotoFormatError();
  }

  const maxDimension = 1600;
  const quality = 0.8;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new UnsupportedPhotoFormatError();
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new UnsupportedPhotoFormatError();

  return new File([blob], `${crypto.randomUUID()}.jpg`, { type: "image/jpeg" });
}
