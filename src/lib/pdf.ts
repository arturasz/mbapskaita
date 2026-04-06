import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

// Use bundled worker
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

/**
 * Extract all text from a PDF file, page by page.
 * Returns an array of strings, one per page.
 */
export async function extractPDFText(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const doc = await getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
  }

  return pages;
}

/**
 * Extract text from a PDF and return as a single string.
 */
export async function extractPDFFullText(file: File): Promise<string> {
  const pages = await extractPDFText(file);
  return pages.join("\n");
}
