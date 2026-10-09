// Captures invoice PDFs as Deel downloads them, keeps collected invoices, uploads on request.
const MB = "https://mb.rezvart.com";
const PDF_URLS = ["https://s3.eu-west-1.amazonaws.com/api-prod.letsdeel.com/file-service/*"];

const pdfs = new Map(); // invoice number -> base64
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
      // The signed URL carries the file name, e.g. ..._INV-9vgkwe8-2026-10_Sep1-Sep30.pdf
      const number = decodeURIComponent(details.url).match(/(INV-[A-Za-z0-9-]+)_/)?.[1];
      if (isPdf && number) pdfs.set(number, toBase64(bytes));
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitTabComplete(tabId, timeout = 15000) {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    let sawLoading = false; // ignore a "complete" left over from the previous page
    const listener = (id, info) => {
      if (id !== tabId) return;
      if (info.status === "loading") sawLoading = true;
      if (info.status === "complete" && sawLoading) finish();
    };
    const timer = setTimeout(finish, timeout);
    browser.tabs.onUpdated.addListener(listener);
  });
}

async function readDetail(tabId, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const date = await browser.tabs.sendMessage(tabId, { type: "readDetail" });
      if (date) return date;
    } catch {
      // content script not ready yet
    }
    await sleep(250);
  }
  return null;
}

async function waitPdf(number, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (pdfs.has(number)) return pdfs.get(number);
    await sleep(250);
  }
  return null;
}

const CONCURRENCY = 4;

// Loads each invoice link as a fresh page (Deel caches PDFs it already opened), several at a time.
async function collectAll(invoices, fromDate) {
  const failed = [];
  let next = 0;
  let finished = 0;
  let stopAfter = Infinity; // list is newest first: stop two invoices after the first too-old one

  const progress = () =>
    browser.runtime
      .sendMessage({ type: "progress", text: `${finished}/${invoices.length} done` })
      .catch(() => {});

  const slow = [];
  const handle = async (tabId, invoice, index) => {
    if (!invoice.url) throw new Error("no link in list");
    const t0 = Date.now();
    const lap = () => ((Date.now() - t0) / 1000).toFixed(1);
    pdfs.delete(invoice.invoiceNumber);
    let issueDate = null;
    let pdfBase64 = null;
    let timing = "";
    for (let attempt = 1; attempt <= 2 && !(issueDate && pdfBase64); attempt++) {
      const loaded = waitTabComplete(tabId);
      await browser.tabs.update(tabId, { url: invoice.url });
      await loaded;
      timing += ` load ${lap()}s`;
      issueDate = await readDetail(tabId);
      timing += ` date ${lap()}s`;
      if (!issueDate) continue;
      if (fromDate && issueDate < fromDate) {
        stopAfter = Math.min(stopAfter, index + 2);
        return;
      }
      pdfBase64 = await waitPdf(invoice.invoiceNumber);
      timing += ` pdf ${lap()}s`;
    }
    if (Date.now() - t0 > 12000 || !pdfBase64) slow.push(`${invoice.invoiceNumber}:${timing}`);
    if (!issueDate) throw new Error("issue date not found");
    if (!pdfBase64) failed.push(`${invoice.invoiceNumber}: no PDF captured`);
    const { url, ...rest } = invoice;
    collected = collected.filter((c) => c.invoiceNumber !== invoice.invoiceNumber);
    collected.push({ ...rest, issueDate, pdfBase64 });
  };

  const worker = async () => {
    const tab = await browser.tabs.create({ url: "about:blank", active: false });
    try {
      for (;;) {
        const index = next++;
        if (index >= invoices.length || index > stopAfter) break;
        try {
          await handle(tab.id, invoices[index], index);
        } catch (err) {
          failed.push(`${invoices[index].invoiceNumber}: ${err.message}`);
        }
        finished++;
        progress();
      }
    } finally {
      browser.tabs.remove(tab.id);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, invoices.length) }, worker));
  return [...failed, ...slow.map((s) => `slow ${s}`)];
}

browser.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "collect-many":
      return collectAll(msg.invoices, msg.fromDate);
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

// --- API discovery: records the shape (never the values) of Deel's JSON calls ---
const apiLog = [];
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}|^[A-Z][a-z]+ \d{1,2}, \d{4}/;

function shape(value, depth) {
  if (Array.isArray(value)) return depth > 0 && value.length ? [shape(value[0], depth - 1)] : "array";
  if (value && typeof value === "object") {
    if (depth === 0) return "object";
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth - 1)]));
  }
  if (typeof value === "string" && DATE_LIKE.test(value)) return `date-like: ${value}`;
  return typeof value;
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
      try {
        const size = chunks.reduce((n, c) => n + c.length, 0);
        if (size > 400000) return;
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const c of chunks) {
          bytes.set(c, offset);
          offset += c.length;
        }
        const json = JSON.parse(new TextDecoder().decode(bytes));
        const url = new URL(details.url);
        apiLog.push({
          call: `${details.method} ${url.pathname}`,
          query: [...url.searchParams.keys()].join(","),
          shape: shape(json, 3),
        });
        if (apiLog.length > 60) apiLog.shift();
      } catch {
        // not JSON
      }
    };
  },
  { urls: ["https://app.deel.com/*"], types: ["xmlhttprequest"] },
  ["blocking"],
);

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "apiLog") return Promise.resolve(JSON.stringify(apiLog, null, 1));
  if (msg.type === "apiLogClear") {
    apiLog.length = 0;
    return Promise.resolve(true);
  }
  return undefined;
});
