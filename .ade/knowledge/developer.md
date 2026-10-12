# Developer knowledge

- 2026-10-12: `SessionUsage` object literals live in three test helpers (`src/lib/__tests__/tokenUsage.test.ts`, `src/stores/__tests__/fleetStore.test.ts`, `src/components/__tests__/TokensPanel.test.tsx`); adding a required field fails `npx tsc --noEmit` until all three have it.
