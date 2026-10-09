const LIST_URL =
  "https://app.deel.com/invoices?" +
  ["cancelled", "failed", "paid", "pending", "processing", "refunded", "skipped", "unpayable"]
    .map((s) => `statuses[]=${s}`)
    .join("&");
const $ = (id) => document.getElementById(id);
const log = (text) => ($("log").textContent = text);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "progress") log(msg.text);
});

async function refreshSetup() {
  const { token, from } = await browser.storage.local.get(["token", "from"]);
  $("tokenBox").classList.toggle("hidden", !!token);
  if (from && !$("from").value) $("from").value = from;
}
refreshSetup();

$("saveToken").onclick = async () => {
  await browser.storage.local.set({ token: $("token").value.trim() });
  $("token").value = "";
  refreshSetup();
};

async function deelListTab() {
  const [existing] = await browser.tabs.query({ url: "https://app.deel.com/invoices*" });
  if (existing) return existing;
  return browser.tabs.create({ url: LIST_URL, active: true });
}

// The content script may not be loaded yet in a fresh tab, so retry until it answers.
async function readList(tabId) {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await browser.tabs.sendMessage(tabId, { type: "readList" });
      if (list?.length) return list;
    } catch {
      // not ready
    }
    await sleep(500);
  }
  throw new Error("Could not read the Deel invoice list. Are you logged in to Deel?");
}

// Shared first part: tab, list, headers.
async function prepare() {
  log("Opening Deel…");
  const tab = await deelListTab();
  log("Reading invoice list…");
  const list = (await readList(tab.id)).filter((i) => i.status === "paid");
  // The add-on learns Deel's request headers from the page's own calls; reload once if needed.
  if (!(await browser.runtime.sendMessage({ type: "hasHeaders" }))) {
    log("Refreshing Deel tab…");
    await browser.tabs.reload(tab.id);
    for (let i = 0; i < 60 && !(await browser.runtime.sendMessage({ type: "hasHeaders" })); i++) {
      await sleep(500);
    }
    await readList(tab.id); // wait until the reloaded page answers again
  }
  return { tab, list };
}

// Dry run: 2 API calls for the newest invoice, nothing uploaded.
$("try").onclick = async () => {
  $("try").disabled = true;
  try {
    const { tab, list } = await prepare();
    if (!list.length) throw new Error("No paid invoices in the list.");
    await browser.runtime.sendMessage({ type: "reset" });
    const failed = await browser.runtime.sendMessage({
      type: "collect-many",
      tabId: tab.id,
      invoices: list.slice(0, 1),
      fromDate: null,
    });
    const status = await browser.runtime.sendMessage({ type: "status" });
    await browser.runtime.sendMessage({ type: "reset" });
    log(
      status.count
        ? `Try OK (nothing sent):\n${status.summary.join("\n")}\nNow press the big button.`
        : `Try failed:\n${failed.join("\n")}`,
    );
  } catch (err) {
    log(String(err.message ?? err));
  } finally {
    $("try").disabled = false;
  }
};

$("sync").onclick = async () => {
  $("sync").disabled = true;
  try {
    const { token } = await browser.storage.local.get("token");
    if (!token) throw new Error("Save the inbox token first.");
    const fromDate = $("from").value || null;
    await browser.storage.local.set({ from: fromDate ?? "" });

    const { tab, list } = await prepare();

    log(`Collecting ${list.length} paid invoices…`);
    await browser.runtime.sendMessage({ type: "reset" });
    const failed = await browser.runtime.sendMessage({
      type: "collect-many",
      tabId: tab.id,
      invoices: list,
      fromDate,
    });
    const status = await browser.runtime.sendMessage({ type: "status" });
    if (status.count === 0) throw new Error("Nothing collected.\n" + failed.join("\n"));

    log(`Sending ${status.count} invoices…`);
    const results = await browser.runtime.sendMessage({ type: "upload", token });
    const ok = results.filter((r) => r.ok).length;
    const problems = [...failed, ...results.filter((r) => !r.ok).map((r) => `${r.invoiceNumber}: ${r.status}`)];
    log(`Done: ${ok} sent (${status.withPdf} with PDF).` + (problems.length ? `\nProblems:\n${problems.join("\n")}` : ""));
    if (ok > 0) await browser.tabs.create({ url: "https://mb.rezvart.com/income" });
  } catch (err) {
    log(String(err.message ?? err));
  } finally {
    $("sync").disabled = false;
  }
};

$("copy").onclick = () => navigator.clipboard.writeText($("log").textContent);
