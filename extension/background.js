// Captures invoice PDFs as Deel downloads them, keeps collected invoices, uploads on request.
const MB = "https://mb.rezvart.com";
const PDF_URLS = ["https://s3.eu-west-1.amazonaws.com/api-prod.letsdeel.com/file-service/*"];

let lastPdf = null; // { at, base64 }
let collected = []; // invoices ready to send

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const filter = browser.webRequest.filterResponseData(details.requestId);
    const chunks = [];
    filter.ondata = (event) => {
      chunks.push(new Uint8Array(event.data.slice(0)));
      filter.write(event.data);
    };
    filter.onstop = () => {
      filter.close();
      const size = chunks.reduce((n, c) => n + c.length, 0);
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      const isPdf = String.fromCharCode(...bytes.subarray(0, 4)) === "%PDF";
      if (isPdf) lastPdf = { at: Date.now(), base64: toBase64(bytes) };
    };
  },
  { urls: PDF_URLS },
  ["blocking"],
);

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
    case "pdfSince":
      return Promise.resolve(lastPdf && lastPdf.at >= msg.since ? lastPdf.base64 : null);
    case "collect":
      collected = collected.filter((i) => i.invoiceNumber !== msg.invoice.invoiceNumber);
      collected.push(msg.invoice);
      return Promise.resolve(collected.length);
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
