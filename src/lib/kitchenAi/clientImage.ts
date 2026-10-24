"use client";

import { fileTypeFromMime, type DocumentFileType } from "@/lib/documents/upload";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * A phone photo is several MB. Before it is uploaded it is scaled down to at most 2000 px on the long side and saved as a JPEG,
 * which keeps the text of a menu readable and the upload fast. PDFs are uploaded as they are.
 */
export async function prepareMenuFile(file: File): Promise<{ file: File; type: "photo" | "pdf" }> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("This PDF is larger than 12 MB. Upload a smaller copy.");
    return { file, type: "pdf" };
  }
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) throw new Error("Only photos (JPG, PNG, WEBP) and PDFs can be read.");
  if (file.size > 40 * 1024 * 1024) throw new Error("This photo is larger than 40 MB. Choose a smaller one.");

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => resolve(img);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("This photo could not be opened. Take a screenshot of it or save it as JPG, then try again."));
      };
      img.src = url;
    });
  }
  const w = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
  const h = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
  const scale = Math.min(1, 2000 / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare the photo.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("The photo could not be prepared for upload.");
  const name = file.name.replace(/\.[^.]+$/, "") || "menu";
  return { file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }), type: "photo" };
}

/**
 * A file attached in the AI Assistant: photos are scaled down (see prepareMenuFile); PDFs, Word, Excel, CSV, PowerPoint and text
 * files go up as they are (they are read as text on the server).
 */
export async function prepareAssistantFile(file: File): Promise<{ file: File; type: DocumentFileType }> {
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) return prepareMenuFile(file);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`"${file.name}" is larger than 12 MB. Upload a smaller copy.`);
  return { file, type: fileTypeFromMime(file) };
}
