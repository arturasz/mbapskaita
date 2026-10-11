import { afterEach, describe, expect, it, vi } from "vitest";
import { convertToEur, getExchangeRate } from "./currency";

const csv = (rows: [string, string][]) =>
  ["KEY,TIME_PERIOD,OBS_VALUE", ...rows.map(([d, v]) => `EXR.D.USD.EUR.SP00.A,${d},${v}`)].join("\n");

const mockFetch = (body: string, ok = true) => {
  const fn = vi.fn(async () => ({ ok, text: async () => body }) as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
};

afterEach(() => vi.unstubAllGlobals());

describe("getExchangeRate", () => {
  it("returns 1 for EUR without a request", async () => {
    const fn = mockFetch("");
    expect(await getExchangeRate("EUR", "2026-04-01")).toBe(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it("inverts the ECB quote for the exact date", async () => {
    mockFetch(csv([["2026-04-01", "1.25"]]));
    expect(await getExchangeRate("USD", "2026-04-01")).toBeCloseTo(0.8, 6);
  });

  it("uses the last earlier fixing on weekends", async () => {
    // 2026-04-04 is a Saturday: only Thursday and Friday exist.
    mockFetch(csv([["2026-04-02", "1.00"], ["2026-04-03", "2.00"]]));
    expect(await getExchangeRate("USD", "2026-04-04")).toBeCloseTo(0.5, 6);
  });

  it("ignores fixings after the requested date", async () => {
    mockFetch(csv([["2026-05-01", "1.00"], ["2026-05-09", "4.00"]]));
    expect(await getExchangeRate("USD", "2026-05-05")).toBeCloseTo(1, 6);
  });

  it("caches per currency and date", async () => {
    const fn = mockFetch(csv([["2026-06-01", "1.25"]]));
    await getExchangeRate("USD", "2026-06-01");
    await getExchangeRate("USD", "2026-06-01");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws when ECB has no data or fails", async () => {
    mockFetch(csv([]));
    await expect(getExchangeRate("USD", "2026-07-01")).rejects.toThrow();
    mockFetch("", false);
    await expect(getExchangeRate("USD", "2026-07-02")).rejects.toThrow();
  });
});

describe("convertToEur", () => {
  it("rounds to cents", async () => {
    mockFetch(csv([["2026-08-01", "1.1605"]]));
    expect(await convertToEur(14750, "USD", "2026-08-01")).toBe(12710.04);
  });
});
