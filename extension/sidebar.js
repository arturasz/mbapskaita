const LIST_URL =
  "https://app.deel.com/invoices?" +
  ["cancelled", "failed", "paid", "pending", "processing", "refunded", "skipped", "unpayable"]
    .map((s) => `statuses[]=${s}`)
    .join("&");
const $ = (id) => document.getElementById(id);
const log = (text) => ($("log").textContent = text);
const done = (id) => $(id).classList.add("done");

let selected = [];

async function deelTab() {
  const [tab] = await browser.tabs.query({ url: "https://app.deel.com/*", active: true, currentWindow: true });
  if (!tab) throw new Error("Open a Deel tab first (step 1)");
  return tab;
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "progress") log(msg.text);
});

browser.storage.local.get("token").then(({ token }) => {
  if (token) {
    done("s0");
    $("token").placeholder = "saved";
  }
});

$("saveToken").onclick = async () => {
  await browser.storage.local.set({ token: $("token").value.trim() });
  $("token").value = "";
  done("s0");
};

$("open").onclick = async () => {
  await browser.tabs.create({ url: LIST_URL });
  done("s1");
};

$("read").onclick = async () => {
  try {
    const tab = await deelTab();
    log("Reading list…");
    const all = await browser.tabs.sendMessage(tab.id, { type: "readList" });
    const paid = all.filter((i) => i.status === "paid");
    selected = paid;
    log(`Found ${all.length}, ${paid.length} paid, checking dates from the newest:\n` + paid.map((i) => i.invoiceNumber).join("\n"));
    $("collect").disabled = paid.length === 0;
    done("s2");
  } catch (err) {
    log(String(err.message ?? err));
  }
};

$("collect").onclick = async () => {
  try {
    const tab = await deelTab();
    $("collect").disabled = true;
    const failed = await browser.tabs.sendMessage(tab.id, { type: "collect-many", invoices: selected, fromDate: $("from").value || null });
    const status = await browser.runtime.sendMessage({ type: "status" });
    log(`Collected ${status.count} (${status.withPdf} with PDF).` + (failed.length ? `\nProblems:\n${failed.join("\n")}` : ""));
    $("send").disabled = status.count === 0;
    done("s3");
  } catch (err) {
    log(String(err.message ?? err));
    $("collect").disabled = false;
  }
};

$("send").onclick = async () => {
  const { token } = await browser.storage.local.get("token");
  if (!token) return log("Save the inbox token first (step 0)");
  const results = await browser.runtime.sendMessage({ type: "upload", token });
  const ok = results.filter((r) => r.ok).length;
  log(`Sent ${ok}/${results.length}.` + results.filter((r) => !r.ok).map((r) => `\n${r.invoiceNumber}: ${r.status}`).join(""));
  $("openMb").disabled = ok === 0;
  if (ok === results.length) done("s4");
};

$("openMb").onclick = () => browser.tabs.create({ url: "https://mb.rezvart.com/income" });

$("copy").onclick = () => navigator.clipboard.writeText($("log").textContent);
