# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `artifacts/wallet-guard` (`@workspace/wallet-guard`)

TRON Wallet Analyzer PWA — React + Vite, dark fintech theme, all UI in Spanish.

**5 tabs:** Dashboard, Wallets, Scanner, Connections, Settings

**Key libraries:**
- `@noble/secp256k1` v3 — secp256k1 key generation
- `@scure/bip39` — BIP39 mnemonic (wordlist import: `@scure/bip39/wordlists/english.js` with `.js` ext)
- `@scure/bip32` — BIP44 HD key derivation (`m/44'/195'/0'/0/0` for TRON)
- TronGrid API key: `VITE_TRON_API_KEY`
- USDT TRC20 contract: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`

**Security architecture (`src/lib/security.ts`):**
- AES-256-GCM encryption for stored private keys (Web Crypto API)
- PBKDF2-SHA256 key derivation (200k iterations) for PIN
- Device-local random key fallback when no PIN set
- WebAuthn biometric registration + authentication
- All secrets remain in localStorage (encrypted), never transmitted

**Wallet types (`src/lib/tronWallet.ts`):**
- `generateTronWallet()` → creates address + private key + 12-word BIP39 mnemonic
- `importFromMnemonic(phrase)` → BIP44 path derivation → address
- `importFromPrivateKey(hex)` → validates secp256k1 scalar → address
- `importFromKeystore(json, password)` → PBKDF2 + AES-128-CTR decrypt (Ethereum v3 format)
- `validateTronAddress(addr)` → double-SHA256 base58check

**NOTE:** `@noble/hashes` subpath imports are broken with Vite bundler — always use `crypto.subtle` instead. `@ts-nocheck` on `tronWallet.ts` suppresses noble type quirks.

**TronGrid API (`src/lib/tronApi.ts`):**
- `fetchAccountInfo(address)` → TRX balance (SUN÷1e6) + USDT TRC20 balance from `trc20` array
- `fetchTRXTransactions(address)` + `fetchUSDTTransactions(address)` → merged/sorted as `TxRecord[]`
- `sendTRX(from, to, amountTrx, privKey)` → createtransaction → sign secp256k1 → broadcasttransaction
- `sendUSDT(from, to, amountUsdt, privKey)` → triggersmartcontract (ABI encoded transfer) → sign → broadcast
- Address utils: `tronAddrToHex(b58)` / `hexToTronAddr(hex21)` (async, uses crypto.subtle SHA-256 for checksum)
- Rate limiter: 110ms gap between requests. TRON API key in `VITE_TRON_API_KEY`.
- Signing: `secp256k1.sign(txHashBytes, privBytes, { lowS: false })` → `toCompactHex() + recovery (0 or 1)` (NOT +27 like Ethereum)

**Wallet Detail Sheet (`src/components/WalletDetailSheet.tsx`):**
- Views: `overview` (balances + action buttons + recent txs) | `receive` (QR + copy) | `send` (form → confirm → signing → done) | `history` (full tx list)
- QR generation: `qrcode` package, `toDataURL()` with dark theme colors
- Send: validates amount/address, calls `decryptPrivateKey(walletId)`, routes to `sendTRX` or `sendUSDT`
- Watch wallets show "Solo lectura" instead of Send button
- Empty state: "Esta wallet no tiene transacciones en la red TRON aún."
- Opened by tapping any wallet row in WalletsPage (ChevronRight indicator)

**Wallet storage:** `wg_wallets` (public data), `wg_secure_keys` (encrypted privkeys), `wg_pin_vault` (PIN verification sentinel), `wg_device_key` (fallback AES key)

**Dev port:** 25766 (reads from `PORT` env var)

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
