import { describe, expect, it } from "vitest";
import { isStale, lastSyncLabel } from "./sync-status";

const now = new Date("2026-10-12T12:00:00Z");

describe("lastSyncLabel", () => {
  it("says never when missing", () => {
    expect(lastSyncLabel(undefined, now)).toBe("niekada");
  });
  it("says today for same day", () => {
    expect(lastSyncLabel("2026-10-12T08:00:00Z", now)).toBe("šiandien (2026-10-12)");
  });
  it("counts whole days", () => {
    expect(lastSyncLabel("2026-10-09T08:00:00Z", now)).toBe("prieš 3 d. (2026-10-09)");
  });
});

describe("isStale", () => {
  it("is stale when never synced or too old", () => {
    expect(isStale(undefined, now, 35)).toBe(true);
    expect(isStale("2026-08-01T00:00:00Z", now, 35)).toBe(true);
  });
  it("is fresh inside the limit", () => {
    expect(isStale("2026-10-01T00:00:00Z", now, 35)).toBe(false);
  });
});
