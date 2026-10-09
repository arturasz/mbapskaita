// Runs on app.deel.com. Reads the invoice list and each invoice page, in the user's own session.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = fn();
    if (value) return value;
    await sleep(200);
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
  return {
    invoiceNumber: number,
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

async function findRow(number) {
  const area = scroller();
  area.scrollTop = 0;
  for (let i = 0; i < 40; i++) {
    const row = rowEls().find((r) => r.innerText.includes(number));
    if (row) return row;
    area.scrollBy(0, 500);
    await sleep(300);
  }
  return null;
}

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function readIssueDate() {
  const m = document.body.innerText.match(/Issue\s*Date[\s:]*([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  return month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

async function collectOne(invoice) {
  const row = await findRow(invoice.invoiceNumber);
  if (!row) throw new Error("row not found");
  const since = Date.now();
  const target = row.querySelector('[data-qa="work-period"]') ?? row;
  for (const type of ["mousedown", "mouseup", "click"]) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
  const issueDate = await waitFor(readIssueDate);
  if (!issueDate) {
    const snippet = document.body.innerText.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`issue date not found at ${location.pathname} :: ${snippet}`);
  }
  let pdfBase64 = null;
  for (let i = 0; i < 40 && !pdfBase64; i++) {
    pdfBase64 = await browser.runtime.sendMessage({ type: "pdfSince", since });
    if (!pdfBase64) await sleep(500);
  }
  await browser.runtime.sendMessage({
    type: "collect",
    invoice: { ...invoice, issueDate, pdfBase64 },
  });
  document.querySelector('[data-qa="page-header-secondary-back-button"]')?.click();
  await waitFor(() => rowEls().length > 0);
  return { issueDate, hasPdf: !!pdfBase64 };
}

async function collectMany(invoices) {
  const failed = [];
  for (const [i, invoice] of invoices.entries()) {
    browser.runtime.sendMessage({
      type: "progress",
      text: `${i + 1}/${invoices.length} ${invoice.invoiceNumber}`,
    });
    try {
      const result = await collectOne(invoice);
      if (!result.hasPdf) failed.push(`${invoice.invoiceNumber}: no PDF captured`);
    } catch (err) {
      failed.push(`${invoice.invoiceNumber}: ${err.message}`);
    }
  }
  return failed;
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "readList") return readList();
  if (msg.type === "collect-many") return collectMany(msg.invoices);
  return undefined;
});
