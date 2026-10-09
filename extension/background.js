// Collects invoices (data + PDF) over Deel's API and uploads them to the MB inbox.
const MB = "https://mb.rezvart.com";
const CONCURRENCY = 5;

let collected = []; // invoices ready to send

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

async function collectAll(tabId, invoices, fromDate) {
  const failed = [];
  let next = 0;
  let finished = 0;

  const worker = async () => {
    for (;;) {
      const invoice = invoices[next++];
      if (!invoice) return;
      try {
        if (!invoice.url) throw new Error("no link in list");
        const info = await browser.tabs.sendMessage(tabId, { type: "fetchInvoice", url: invoice.url });
        if (!fromDate || info.issueDate >= fromDate) {
          const pdfBase64 = await downloadPdf(info.pdfUrl);
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
        failed.push(`${invoice.invoiceNumber}: ${err.message}`);
      }
      finished++;
      browser.runtime
        .sendMessage({ type: "progress", text: `${finished}/${invoices.length} done` })
        .catch(() => {});
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, invoices.length) }, worker));
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
      });
    case "upload":
      return upload(msg.token);
    case "reset":
      collected = [];
      return Promise.resolve(0);
    default:
      return undefined;
  }
});

// Toolbar icon opens the side panel.
browser.browserAction.onClicked.addListener(() => browser.sidebarAction.toggle());
