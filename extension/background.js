// Collects invoices (data + PDF) over Deel's API and uploads them to the MB inbox.
const MB = "https://mb.rezvart.com";
const CONCURRENCY = 3;

let collected = []; // invoices ready to send

// Auth headers the Deel page itself sends to its API. Kept in memory, used only for app.deel.com.
const SKIP_HEADERS = /^(cookie|host|user-agent|accept.*|content-.*|origin|referer|sec-.*|priority|connection|pragma|cache-control|dnt|te|if-.*|upgrade-.*)$/i;
let deelHeaders = null;

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const picked = {};
    for (const h of details.requestHeaders) {
      if (!SKIP_HEADERS.test(h.name)) picked[h.name] = h.value;
    }
    if (Object.keys(picked).length) deelHeaders = picked;
  },
  { urls: ["https://app.deel.com/deelapi/*"] },
  ["requestHeaders"],
);

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function downloadPdf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PDF download ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "%PDF") throw new Error("not a PDF");
  return toBase64(bytes);
}

async function collectAll(tabId, allInvoices, fromDate) {
  let invoices = allInvoices;
  const failed = [];
  let next = 0;
  let finished = 0;
  let aborted = false; // first error stops everything: never repeat failing requests against Deel

  const worker = async () => {
    for (;;) {
      const invoice = invoices[next++];
      if (!invoice || aborted) return;
      try {
        if (!invoice.url) throw new Error("no link in list");
        const info = await browser.tabs.sendMessage(tabId, { type: "fetchInvoice", url: invoice.url, headers: deelHeaders });
        if (!fromDate || info.issueDate >= fromDate) {
          const pdfBase64 = info.pdfBase64 ?? (await downloadPdf(info.pdfUrl));
          const { url, ...rest } = invoice;
          collected = collected.filter((c) => c.invoiceNumber !== invoice.invoiceNumber);
          collected.push({
            ...rest,
            issueDate: info.issueDate,
            amount: info.amount || rest.amount,
            currency: info.currency || rest.currency,
            client: info.client || rest.client,
            pdfBase64,
          });
        }
      } catch (err) {
        aborted = true;
        failed.push(`${invoice.invoiceNumber}: ${err.message}\nStopped after the first error.`);
      }
      finished++;
      browser.runtime
        .sendMessage({ type: "progress", text: `${finished}/${invoices.length} done` })
        .catch(() => {});
    }
  };

  // First invoice alone: if Deel rejects it, nothing else is sent.
  const first = invoices.slice(0, 1);
  const rest = invoices.slice(1);
  invoices = first;
  next = 0;
  await worker();
  if (!aborted && rest.length) {
    invoices = rest;
    next = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rest.length) }, worker));
  }
  return failed;
}

async function upload(token) {
  const results = [];
  for (const invoice of collected) {
    try {
      const res = await fetch(`${MB}/api/inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(invoice),
      });
      results.push({ invoiceNumber: invoice.invoiceNumber, ok: res.ok, status: res.status });
    } catch (err) {
      results.push({ invoiceNumber: invoice.invoiceNumber, ok: false, status: String(err) });
    }
  }
  collected = collected.filter((i) => !results.find((r) => r.ok && r.invoiceNumber === i.invoiceNumber));
  return results;
}

browser.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "collect-many":
      return collectAll(msg.tabId, msg.invoices, msg.fromDate);
    case "status":
      return Promise.resolve({
        count: collected.length,
        withPdf: collected.filter((i) => i.pdfBase64).length,
        summary: collected.map(
          (i) => `${i.invoiceNumber}: ${i.issueDate}, ${i.amount} ${i.currency}, ${i.client}, PDF ${Math.round(((i.pdfBase64?.length ?? 0) * 3) / 4 / 1024)} KB`,
        ),
      });
    case "upload":
      return upload(msg.token);
    case "hasHeaders":
      return Promise.resolve(!!deelHeaders);
    case "reset":
      collected = [];
      return Promise.resolve(0);
    default:
      return undefined;
  }
});

// Toolbar icon opens the side panel.
browser.browserAction.onClicked.addListener(() => browser.sidebarAction.toggle());
