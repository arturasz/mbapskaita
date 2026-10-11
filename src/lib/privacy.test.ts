import { describe, expect, it } from "vitest";
import { maskNumbers } from "./privacy";

describe("maskNumbers", () => {
  it("hides amounts", () => {
    expect(maskNumbers("105 300,72 €")).toBe("••• €");
    expect(maskNumbers("12710.04 EUR")).toBe("••• EUR");
  });

  it("keeps dates, years and percentages", () => {
    expect(maskNumbers("2026-07-16 · 2026 m. · 15% · 7,5 %")).toBe("2026-07-16 · 2026 m. · 15% · 7,5 %");
  });

  it("masks a number that starts like a year", () => {
    expect(maskNumbers("20 000 EUR")).toBe("••• EUR");
  });

  it("leaves text without digits alone", () => {
    expect(maskNumbers("Pajamos")).toBe("Pajamos");
  });
});

describe("year look-alikes", () => {
  it("masks an amount that equals a year", () => {
    expect(maskNumbers("2026,50 EUR")).toBe("••• EUR");
    expect(maskNumbers("2 026 m.")).toBe("••• m.");
  });
});
