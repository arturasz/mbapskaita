import type { Currency, ExpenseCategory } from "../types";
import { expenseCategories } from "../data/expense-categories";

const MAX_IMAGE_SIDE = 1800;

async function toBase64(file: File): Promise<{ contentType: string; dataBase64: string }> {
  if (file.type === "application/pdf") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return { contentType: file.type, dataBase64: btoa(binary) };
  }
  // Photos are shrunk first: phone cameras produce files larger than the upload limit.
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { contentType: "image/jpeg", dataBase64: dataUrl.split(",")[1] };
}

export const asCurrency = (raw: unknown): Currency =>
  raw === "USD" || raw === "GBP" ? raw : "EUR";

export const asCategory = (raw: unknown): ExpenseCategory =>
  expenseCategories.some((c) => c.key === raw) ? (raw as ExpenseCategory) : "other";

export interface UploadedReceipt {
  fileId: string;
  extracted: Record<string, unknown> | null;
  extractError: string | null;
}

/** Store the file on the server and, when OpenRouter is configured, read it. */
export async function uploadReceipt(file: File): Promise<UploadedReceipt> {
  const payload = await toBase64(file);
  const res = await fetch("/api/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, ...payload }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}`);
  return (await res.json()) as UploadedReceipt;
}
