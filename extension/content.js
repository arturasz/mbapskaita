// Runs on app.deel.com. Reads the invoice list and each invoice page, in the user's own session.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = fn();
    if (value) return value;
    await sleep(100);
  }
  return null;
}

const rowEls = () =>
  [...document.querySelectorAll('[role="row"]')].filter((r) =>
    r.querySelector('[data-qa="amount"]'),
  );

function parseRow(row) {
  const text = (qa) => row.querySelector(`[data-qa="${qa}"]`)?.innerText.trim() ?? "";
  const number = row.innerText.match(/INV-[\w-]+/)?.[0];
  if (!number) return null;
  const amountText = text("amount");
  const amount = parseFloat(amountText.replace(/[^0-9.]/g, ""));
  const currency = amountText.includes("€") ? "EUR" : amountText.includes("£") ? "GBP" : "USD";
  const firstCell = row.querySelector('[role="cell"]');
  const lines = (firstCell?.innerText ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const href = row.querySelector('a[href*="/invoice/"]')?.href;
  return {
    invoiceNumber: number,
    url: href,
    period: text("work-period"),
    amount,
    currency,
    status: text("status").toLowerCase(),
    client: lines[lines.length - 1] || "Deel",
  };
}

function scroller() {
  let el = rowEls()[0];
  while (el && el !== document.body) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return document.scrollingElement;
}

async function readList() {
  await waitFor(() => rowEls().length > 0);
  const total = Number(document.body.innerText.match(/Total of (\d+) invoices/)?.[1] ?? 0);
  const seen = new Map();
  let stale = 0;
  scroller().scrollTop = 0;
  while (stale < 6) {
    const before = seen.size;
    for (const row of rowEls()) {
      const parsed = parseRow(row);
      if (parsed) seen.set(parsed.invoiceNumber, parsed);
    }
    if (total && seen.size >= total) break;
    stale = seen.size === before ? stale + 1 : 0;
    document.querySelector('[data-qa="datagrid-scroll-sentinel"]')?.scrollIntoView();
    scroller().scrollBy(0, 600);
    await sleep(400);
  }
  return [...seen.values()];
}

// Same-origin calls to Deel's own API (uses your logged-in session).
async function deelJson(path, headers) {
  const res = await fetch(new URL(path, location.origin).href, { credentials: "include", headers: { Accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`Deel API ${res.status} for ${path.split("?")[0]}`);
  return res.json();
}

const vilniusDate = (iso) =>
  new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Vilnius" }); // YYYY-MM-DD

async function fetchInvoice(url, headers) {
  const publicId = new URL(url).pathname.split("/").filter(Boolean).pop();
  const [info, pdf] = await Promise.all([
    deelJson(`/deelapi/invoices/${publicId}/extended`, headers),
    deelJson(`/deelapi/invoices/${publicId}/pdf?noredirect`, headers),
  ]);
  return {
    issueDate: vilniusDate(info.issuedAt),
    amount: parseFloat(info.total),
    currency: info.currency,
    status: info.status,
    client: info.client?.displayName ?? info.client?.name,
    pdfUrl: pdf.url,
  };
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "readList") return readList();
  if (msg.type === "fetchInvoice") return fetchInvoice(msg.url, msg.headers);
  return undefined;
});
