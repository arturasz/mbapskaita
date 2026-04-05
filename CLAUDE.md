# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MB-apskaita — Personal Lithuanian tax dashboard for a solo MB (mažoji bendrija) member earning from US/foreign clients.

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Zustand (state management)
- React Router v7
- IndexedDB via idb-keyval (webapp phase), later Electron + iCloud Drive file storage
- Vitest + Playwright (testing)

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run unit tests (Vitest)
npm run test:e2e     # Run e2e tests (Playwright)
```

## Architecture

- `src/lib/` — Pure TypeScript calculation functions (tax, deadlines, VAT, investments). No React dependencies. This is the core logic layer and should be thoroughly unit tested.
- `src/data/` — Lithuanian tax rules encoded as typed data objects (rates by year, filing deadlines, expense categories, VAT rules). Update these files when laws change.
- `src/storage/` — StorageAdapter interface with IndexedDB implementation. Abstracted so Electron phase can swap to file-based iCloud Drive storage.
- `src/stores/` — Zustand stores that hydrate from storage and persist on mutation. Components talk to stores, stores talk to StorageAdapter.
- `src/features/` — Feature modules (dashboard, calculator, income, expenses, vat, investments, guides), one per route.
- `src/components/` — Shared UI primitives (Card, Badge, Table, etc.).
- `src/content/` — Markdown guides imported via Vite `?raw`.
- `src/types/` — All TypeScript domain types.

## Key Design Decisions

- All tax logic is pure functions in `lib/` — no side effects, deterministically testable (dates passed as parameters, not `new Date()`)
- Tax rates/rules are data, not hardcoded — `src/data/tax-rates.ts` maps year → rates
- Storage is abstracted behind `StorageAdapter` interface so webapp (IndexedDB) and Electron (file-based) use the same code
- Components → Zustand → StorageAdapter (components never touch storage directly)
