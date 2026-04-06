# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MB-apskaita — Personal Lithuanian tax dashboard for a solo MB (mažoji bendrija) member earning from US/foreign clients. Calculates taxes, tracks income/expenses/investments, optimizes withdrawal strategy, and shows filing obligations.

## Commands

```bash
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build (tsc + vite build)
npm run test         # Run all unit tests (Vitest)
npm run test:watch   # Run tests in watch mode
npx vitest run src/lib/tax.test.ts  # Run a single test file
```

## Architecture

### Core calculation layer (`src/lib/`)
Pure TypeScript functions with no React dependencies. All dates passed as parameters, never `new Date()`.

- **`optimizer.ts`** — Main tax engine. Calculates optimal withdrawal split between civilinė sutartis (code 77) and lėšos asmeniniams poreikiams (code 02). Generates monthly Sodra breakdown and obligations timeline with step-by-step instructions. This is the primary calculation used by dashboard and calculator.
- **`tax.ts`** — Legacy tax calculations (deprecated, kept for tests). Use optimizer.ts for new work.
- **`vat.ts`** — Quarterly VAT. Only LT-source income counts toward 45k EUR PVM threshold (non-EU B2B services excluded).
- **`currency.ts`** — ECB exchange rate fetching. In dev, proxied through Vite (`/api/ecb/*`) to avoid CORS. Uses ECB XML feed, not JSON API.
- **`import-deel.ts` / `import-ibkr.ts`** — CSV parsers for Deel invoices and IBKR activity statements (stocks only, skips forex). Auto-convert USD→EUR.
- **`import-deel-pdf.ts` / `import-ibkr-pdf.ts`** — PDF parsers via pdfjs-dist. Less reliable than CSV — prefer CSV imports.

### Tax data (`src/data/`)
- **`tax-rates.ts`** — All Lithuanian tax rates by year (2024-2026). Rates change yearly — verify against `SOURCES.md` before updating. Includes progressive GPM brackets for 2026+.
- **`SOURCES.md`** — Official government URLs for every rate. Always check these when tax law questions arise.

### Key domain concepts

**Two withdrawal methods for MB sole member** (cannot combine with darbo sutartis — illegal for sole MB member/director):

| Method | Code | GPM | Sodra | Stažas | MB treatment |
|--------|------|-----|-------|--------|--------------|
| Civilinė sutartis | 77 | 15% (progressive 2026+) | 0% | No | MB expense |
| Lėšos asmeniniams poreikiams | 02 | 15% flat | VSD 13.83% + PSD 6.98% | Yes | From after-tax profit |

**Tax flow**: MB income → expenses → MB profit → pelno mokestis → after-tax profit → member withdrawal (code 02) → GPM + Sodra. Civil contract (code 77) reduces MB profit as an expense before pelno mokestis.

**Pelno mokestis**: Applied to MB profit before dividend/withdrawal distribution. Rate depends on year and company age (0% first 1-2 years, then 5-7% small company, 15-17% standard).

### Storage layer (`src/storage/`)
`StorageAdapter` interface with IndexedDB implementation (idb-keyval). Components never touch storage directly — always through Zustand stores.

### Stores (`src/stores/`)
Zustand stores with `hydrate()` from IndexedDB and `importBatch()` with duplicate detection (matching on date+amount+client for income, asset+date+qty+price for investments).

### UI (`src/features/`, `src/components/`)
One feature module per route. Shared primitives: Card, Badge, Table, StatCard, FileImport, DirectoryImport. All UI text is in Lithuanian.

## ECB Currency Proxy

Vite dev server proxies `/api/ecb/*` to `ecb.europa.eu` to avoid CORS. In production (future Electron), fetches directly. The ECB XML uses **single quotes** in attributes.

## Changing Tax Rates

When Lithuanian tax law changes:
1. Check sources in `src/data/SOURCES.md`
2. Update `src/data/tax-rates.ts` — add new year entry or modify existing
3. If GPM brackets change, update `gpmProgressive` field
4. Update `pelnoMokestisFirstYearCount` if first-year exemption rules change
5. Run tests — legacy tax.test.ts has hardcoded rate expectations that need updating
