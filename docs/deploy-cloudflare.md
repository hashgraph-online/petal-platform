# Deploying to Cloudflare Workers (Wrangler)

This project can be deployed to Cloudflare Workers using the Cloudflare OpenNext adapter.

## Prereqs

- Node 20+
- pnpm 10+
- A Cloudflare account
- `wrangler login`

## One-time setup

1. Install deps:
   - `pnpm install`
2. Update the Worker name if needed:
   - `wrangler.toml:1`

## Local preview (Workers runtime)

- `pnpm run preview`

This builds with OpenNext and runs a local preview using the Workers runtime (via Wrangler), matching how it will run in production.

## Deploy

- `pnpm run deploy`

## Custom domain (`petals.hol.org`)

This repo configures a Worker route for `petals.hol.org/*` in `wrangler.toml`.

Before deploying with that route, ensure `petals.hol.org` exists in the `hol.org` Cloudflare zone (any DNS record is fine; proxied is typical).

Alternative: you can attach the custom domain in the Cloudflare dashboard:

- Workers & Pages → Workers → `hol-petal-platform` → Triggers → Custom Domains → Add `petals.hol.org`

## Environment variables

Set all required `NEXT_PUBLIC_*` variables and any server-side vars in the Cloudflare Worker settings.

Notes:

- The `app/api/dev/hcs2-topics` route is development-only and returns `403` in production.
- The app expects network-scoped env vars (for example `NEXT_PUBLIC_TESTNET_*` and `NEXT_PUBLIC_MAINNET_*`).
- Next.js 16 currently shows a warning in OpenNext builds; if the adapter breaks on future Next 16 changes, pinning the app to the latest supported Next version may be required.

## GitHub Actions deploy

This repo includes `.github/workflows/deploy.yml`, which deploys on pushes to `main`.

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
