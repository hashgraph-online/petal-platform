# Petal Platform

A Hedera-native agent console built on Next.js 16. The app wraps HCS-11 profiles, HCS-15 petal accounts, direct messaging, and HCS-16 flora coordination flows with a client-side wallet experience powered by Hedera WalletConnect.

## Prerequisites

- Node.js 18.18+
- npm 10+
- Hedera wallet (HashPack, Blade, etc.) for interactive testing

## Environment Configuration

Copy `.env.production.example` (or `.env.local`) and fill in the required values before running the app:

```bash
cp .env.production.example .env.local
```

Required keys:

- `HEDERA_NETWORK`
- `NEXT_PUBLIC_MIRROR_NODE_URL`
- `WALLETCONNECT_PROJECT_ID` & `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_PROFILE_REGISTRY_TOPIC_ID`
- `NEXT_PUBLIC_FLORA_REGISTRY_TOPIC_ID`

Optional overrides include global registry topics, `HASHGRAPH_REGISTRY_BROKER_URL`, and `NEXT_PUBLIC_DEBUG`.

## Local Development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

The app is served from [http://localhost:3000](http://localhost:3000). Wallet interactions require the tab to be served over localhost/https with the WalletConnect project ID configured.

## Quality Gates

| Command              | Purpose |
|----------------------|---------|
| `npm run lint`       | ESLint over the entire workspace |
| `npm run test`       | Vitest unit suite (uses jsdom + Testing Library) |
| `npm run test:coverage` | Vitest with V8 coverage reports under `coverage/` |
| `npm run build`      | Next.js production build (webpack) |

CI/CD pipelines should execute `lint`, `test`, and `build` to gate merges.

## Testing Notes

- Tests live under `lib/hedera/__tests__/` and `providers/__tests__/`.
- The vitest setup file stubs browser storage, WalletConnect env vars, and console noise.
- Identity switching, registry caching, messaging, and flora invite workflows are all covered by the current suite.

## Deployment Guide

1. **Prepare secrets** – Mirror node URL, registry topics, and WalletConnect IDs must be added to Vercel (or your hosting provider) as project/environment variables. Use `.env.production.example` as a reference.
2. **Verify build locally** – `npm run build` should complete without TypeScript or bundler errors.
3. **Vercel configuration** – target Node.js 18, enable Next.js 16, and disable unwanted build cache if you rely on custom patches (`patch-package`).
4. **Deploy** – push to your main branch or run `vercel --prod`. Ensure the `patches/` directory is committed so WalletConnect fixes are applied during install.
5. **Smoke test production** –
   - Connect a wallet and ensure topics generate correctly.
   - Create/update a profile and confirm HashScan/mirror entries.
   - Send petal messages and accept a flora invite to validate topic subscriptions.
6. **Monitoring** – Watch for console errors around environment validation; the app logs “Invalid environment configuration” if keys are missing.

For troubleshooting Hedera interactions, enable the in-app debug toggle to inspect cached payloads and mirror responses.
