# Repository Guidelines

## Project Structure & Module Organization
Next.js 15 App Router drives the Petal Platform. Keep page segments under `app/`, grouped by intent—`app/(profile)` for HCS-11 identity views, `app/(petals)` for multi-account tools, and `app/(flora)` for coordination flows. Shared UI stays in `components/`, Hedera adapters and hooks in `lib/hedera/`, and topic constants in `config/`. Static assets live in `public/`, automation helpers under `scripts/`, and integration suites in `tests/`.

## Build, Test, and Development Commands
- `npm install` restores dependencies after branch switches.
- `npm run dev` starts the Next.js dev server with mirror mocks.
- `npm run lint` enforces ESLint and Tailwind ordering; append `-- --fix` to auto-correct.
- `npm run test` runs Vitest + Testing Library in watch mode.
- `npm run build` compiles the production bundle and surfaces SSR issues.
- `npm run format` applies Prettier to staged files before commit.

## Coding Style & Naming Conventions
Author code in TypeScript with 2-space indentation and `tsx` components. Rely on the repo’s ESLint (`next/core-web-vitals`) and Prettier configs; resolve warnings before review. Components, providers, and layouts use `PascalCase`, hooks follow `useCamelCase`, utilities stay `camelCase`, and constants tied to network IDs use `UPPER_SNAKE_CASE`. Tailwind classes should flow layout → spacing → color, extracting repeated bundles into helpers when reused.

## Testing Guidelines
Colocate unit specs beside source as `*.spec.ts` and keep orchestration suites inside `tests/`. Mock Hedera clients through shared fixtures in `tests/utils` to avoid real network calls and make mirror-topic scenarios deterministic. Target ≥80% branch coverage, add regression cases whenever topic message schemas change, and run `npm run test -- --coverage` before opening a pull request.

## Commit & Pull Request Guidelines
Use Conventional Commits such as `feat: add petal creation flow` or `fix: handle mirror backoff`. Keep commits focused, bundling code, docs, and tests for a single concern. Pull requests should outline the Hedera topics touched, link tracking issues, checklist any env variable changes, and attach UI screenshots or CLI transcripts that demonstrate the happy path. Confirm automated checks and request a teammate review prior to merge.

## Security & Configuration Tips
Secrets stay in `.env.local`; never commit them. Minimum keys are `HEDERA_NETWORK`, `NEXT_PUBLIC_MIRROR_NODE_URL`, and `WALLETCONNECT_PROJECT_ID`. Validate env updates by restarting `npm run dev`, documenting new topics in `config/topics.ts`, and confirming wallet connectors list the deployed domain—testnet first, mainnet once verified.
