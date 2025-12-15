# Production Build Checklist

## Project Bootstrap
- [x] Confirm Node.js 18+ and pnpm/npm availability; initialize repo with `npx create-next-app@latest hedera-dapp` using App Router, TypeScript, ESLint, Tailwind, and no `src/` folder.
- [x] Scaffold base routes `app/(profile)/page.tsx`, `app/(petals)/page.tsx`, `app/(messages)/page.tsx`, `app/(flora)/page.tsx` with semantic `<main>`/`<section>` placeholders.
- [x] Install Tailwind (`npm install -D tailwindcss postcss autoprefixer`), run `npx tailwindcss init -p`, set `content` paths to `./app/**/*.{js,ts,jsx,tsx}` and `./components/**/*.{js,ts,jsx,tsx}`, and add Tailwind directives to `app/globals.css`.
- [x] Implement `app/layout.tsx` importing `globals.css`, defining metadata, rendering header with “Connect Wallet” trigger, and wrapping children in a padded `<main>`.
- [x] Create `components/` primitives (navigation, forms, topic message list) and wire them into the new routes.

## Dependencies & Configuration
- [x] Install Hedera tooling via `npm install @hashgraph/sdk @hashgraphonline/standards-sdk @hashgraphonline/standards-agent-kit @hashgraphonline/hashinal-wc axios zod dotenv`.
- [x] Add `.env.local` with `HEDERA_NETWORK`, `NEXT_PUBLIC_MIRROR_NODE_URL`, `WALLETCONNECT_PROJECT_ID`, and placeholders for registry endpoints.
- [x] Implement `config/env.ts` to validate env vars with zod and expose normalized configuration/constants.
- [x] Create `lib/hedera/client.ts` (Hedera Client factory) and `lib/hedera/wallet.ts` (WalletConnect initialization and signer helpers).
- [x] Add `lib/hedera/mirror.ts` utilities for REST queries (`fetchTopicMessages`, `subscribeTopicWebsocket`, `lookupAccount`) with axios + retry logic.

## Profiles (HCS-11)
- [x] Build `components/profile/ProfileForm.tsx` with alias/display name/avatar inputs, validation, and consensus status badges.
- [x] Implement `lib/hedera/profile.ts` exposing `createOrUpdateProfile` using the standards SDK and handling inbound topic provisioning.
- [x] Create inbound topic via `TopicCreateTransaction` (memo `HCS-10 Inbox for <accountId>`), sign with wallet, and persist returned topic ID.
- [x] Update account memo (`AccountUpdateTransaction` with `HCS11:<alias>`) and confirm via mirror query.
- [x] Publish profile payload to registry topic using SDK or manual `TopicMessageSubmitTransaction`; include `{accountId, alias, displayName, avatarUrl, inboundTopicId, lastUpdated}`.
- [x] Refresh UI with confirmed data, provide explorer links, and cache profile payload by account ID in `localStorage`.

## Discovery (HCS-2)
- [x] Store registry topic IDs inside `config/topics.ts`, differentiating global vs environment-specific values.
- [x] Implement `lib/hedera/registry.ts` with `searchProfileByAlias`, `fetchLatestProfileForAccount`, `listRecentProfiles` decoding mirror payloads.
- [x] Cache registry responses (IndexedDB/localStorage) with TTL invalidation to balance freshness and rate limits.
- [x] Integrate alias search panel in Messages/Floras views leveraging cached data with live fallback queries.
- [x] Log discovery lookups in development mode for troubleshooting and schema validation.

## Petal Accounts (HCS-15)
- [x] Develop `components/petals/PetalList.tsx` showing account ID, memo, balance, and profile status with actions for activation/profile setup.
- [x] Implement `lib/hedera/petals.ts` using standards SDK `createPetalAccount`, including initial HBAR seed transfer from base account.
- [x] Update petal memo (`AccountUpdateTransaction` → `Petal:<alias>`), verify shared public key with base account via mirror data.
- [x] Implement identity activation logic updating global React context and wallet signer to act as selected account.
- [x] Reuse profile workflow for petals, linking inbound topics/registry entries, and flagging incomplete petals in UI.

## Messaging (HCS-10)
- [x] Create `components/messages/Inbox.tsx` subscribing to inbound topic via WebSocket, sorting by consensus timestamp, and resolving sender aliases.
- [x] Implement `lib/hedera/messaging.ts` with `sendDirectMessage` posting JSON `{type:'text', from, to, content, sentAt}` payloads to recipient topics.
- [x] Add optimistic UI updates with confirmation ticks once mirror messages arrive.
- [x] Build compose form supporting alias/account ID input, performing registry lookup, and storing recent contacts locally.
- [x] Deduplicate inbound messages using consensus timestamps and sequence tracking.

## Flora Coordination (HCS-16)
- [x] Implement “New Flora” wizard capturing flora name, initiating identity, and invitees (alias search backed by registry).
- [x] Create comm/tx/state topics via `TopicCreateTransaction` (memos `<FloraName>-Comm|Tx|State`) and store IDs pending acceptance.
- [x] Dispatch `flora_create_request` payloads to invitee inboxes and the communication topic with participant list and topic IDs.
- [x] Handle inbox invites, prompting accept/decline; on accept emit `flora_join_accept` and finalize flora after all responses with `flora_created` message.
- [x] Persist flora registry in localStorage keyed by comm topic ID with status, members, and sync metadata.

## Flora Interaction
- [x] Build `components/flora/FloraDashboard.tsx` subscribing to comm/tx/state topics and rendering separate panels.
- [x] Enable posting chat messages, proposals (unique IDs, optional deadlines), and state updates through dedicated forms.
- [x] Track per-flora preferences (e.g., mute) in localStorage and ensure subscriptions clean up when leaving the view.
- [x] Implement simple voting on proposals via tx topic messages `{type:'vote', proposalId, vote}` with client-side aggregation.
- [x] Insert TODO hook for future HCS-17 `stateHash` generation within state topic payloads and surface explanatory tooltip.

## Data & Storage
- [x] Centralize Hedera service exports in `lib/hedera/index.ts` for future backend swap-outs.
- [x] Wrap mirror requests with React Query/SWR for caching, retries, and revalidation.
- [x] Mirror key data (profiles, petals, contacts, floras, message history) into localStorage/IndexedDB with versioning and migration helpers.
- [x] Provide cleanup utilities to purge caches when wallet identity changes, preventing cross-user leakage.
- [x] Add debug logging toggled by `NEXT_PUBLIC_DEBUG` to trace topic IDs and payloads during development.

## UX & Polish
- [x] Apply cohesive Tailwind theme for buttons/cards/inputs ensuring accessible contrast and responsive layouts.
- [x] Display aliases instead of raw account IDs, surfacing IDs via tooltips when needed.
- [x] Implement loading indicators and toast notifications for transaction progress, success, and failure states.
- [x] Provide contextual help modal explaining Profiles, Petals, Floras in plain language with Hedera references.
- [x] Add developer/debug toggle revealing raw JSON payloads and consensus timestamps for troubleshooting.

## Testing & Release
- [ ] Configure scripts/Husky hooks for `npm run lint`, `npm run test`, `npm run test -- --coverage`, and `npm run build`.
- [ ] Author Vitest + Testing Library integration tests in `tests/` covering profile creation, messaging flows, and flora invitations with mocked Hedera clients.
- [ ] Manually verify on Hedera testnet (memos, topics, registry messages) via mirror API or HashScan; capture topic IDs for QA notes.
- [ ] Stress-test messaging with multiple sessions to confirm ordering and performance; monitor for subscription leaks.
- [ ] Prepare Vercel deployment, configure env vars, run `npm run build`, inspect bundle size, and perform smoke tests on deployed instance with real wallet connections.

## Hedera DApp Production Execution Checklist

### Step 1 – Project Initialization & Tailwind Baseline
- [x] Verify Node.js 18+ readiness with `node -v` and ensure npm/pnpm tooling is installed.
- [x] Confirm Next.js 15+ App Router structure (TypeScript, ESLint, Tailwind) matches specification or retrofit existing layout.
- [x] Ensure `app/layout.tsx` imports `globals.css`, sets metadata, and renders header with Connect Wallet action placeholders.
- [x] Validate profile/messages/flora route shells use semantic `<main>`/`<section>` containers and accessible copy.
- [x] Inspect `tailwind.config.ts` content globs (`./app/**/*`, `./components/**/*`) and theme customizations for accuracy.
- [x] Confirm `postcss.config.mjs` and `app/globals.css` include Tailwind directives and base style resets.

### Step 2 – Hedera SDK & Environment Configuration
- [x] Install/verify `@hashgraph/sdk`, `@hashgraphonline/standards-sdk`, `@hashgraphonline/hashinal-wc`, and supporting libs (`axios`, `zod`, `swr`).
- [x] Audit `package.json`/lockfile to ensure dependency versions align with Hedera SDK requirements.
- [x] Populate `.env.local` with `HEDERA_NETWORK`, `NEXT_PUBLIC_MIRROR_NODE_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, registry topic IDs, and document defaults.
- [x] Implement/configure `config/env.ts` (or equivalent) using zod to validate required env variables on boot.
- [x] Centralize network endpoints and topic IDs in config modules with testnet/mainnet support.
- [x] Verify sensitive values are not accidentally exposed in client bundles beyond necessary public vars.

### Step 3 – Wallet Connection Implementation
- [x] Create Hedera wallet context/provider wrapping `@hashgraphonline/hashinal-wc` for session management.
- [x] Implement connect/disconnect flows with UI feedback, storing session metadata in state/localStorage for auto-reconnect.
- [x] Expose signer, accountId, publicKey, and active identity via React context hooks.
- [x] Handle wallet errors (rejections, network mismatch) with toast notifications and retry guidance.
- [x] Ensure WalletConnect metadata (name, description, icons, redirect) reflects project branding.
- [x] Add loading and disabled states to the Connect Wallet button during handshake.

### Step 4 – Base Profile (HCS-11) Implementation
- [x] Build profile form capturing alias, display name, avatar URL, and optional bio with client-side validation.
- [x] On submission, create inbound topic via `TopicCreateTransaction` (memo `HCS-10 Inbox for <accountId>`), sign with wallet, and persist topic ID.
- [x] Update base account memo to `HCS11:<alias>` using `AccountUpdateTransaction`, confirming via mirror query.
- [x] Assemble HCS-11 profile payload per standard (accountId, alias, displayName, avatarUrl, inboundTopicId, outboundTopicId placeholder, metadata).
- [x] Publish profile payload to profile registry topic through standards SDK or manual `TopicMessageSubmitTransaction`.
- [x] Cache confirmed profile locally, refresh UI, and surface explorer links/consensus timestamp.

### Step 5 – Registry Integration & Discovery Preparation
- [x] Store registry topic IDs and broker endpoints in `config/topics.ts` with environment overrides.
- [x] Implement registry client helpers (`searchProfileByAlias`, `fetchLatestProfileForAccount`, `listRecentProfiles`) with base64 decoding + schema validation.
- [x] Layer caching (SWR/React Query) with TTL and stale-while-revalidate strategy for registry lookups.
- [x] Provide graceful fallback when alias not found or network unavailable, including retry controls.
- [x] Instrument verbose logging in debug mode to trace registry queries and responses.
- [x] Preload current user profile into registry cache after successful publish to avoid duplicate fetch.

### Step 6 – Petal Account Creation (HCS-15)
- [x] Design Petal list UI showing account ID, memo, balance, and profile completeness badges.
- [x] Wire `createPetalAccount` via standards SDK (or manual `AccountCreateTransaction`) with initial HBAR balance transfer.
- [x] Verify new petal public key matches base account via mirror API before finalizing UI success state.
- [x] Update petal account memo (`Petal:<alias or baseId>`) and verify transaction receipt.
- [x] Persist petal metadata (id, memo, createdAt, profileStatus) to localStorage/SWR cache.
- [x] Handle failure states (insufficient balance, signer rejection) with descriptive user messaging.

### Step 7 – Petal Profile Management
- [x] Enable identity switching UI updating global context and signer target accountId.
- [x] Reuse profile form for petals, auto-populating defaults while allowing unique alias/avatar per petal.
- [x] Create dedicated inbound topics for each petal and register them with HCS-11 schema.
- [x] Publish petal profiles to registry and refresh alias mapping cache.
- [x] Update petal list badges once profile + registry synchronization completes.
- [x] Ensure memo updates and topic creations are signed against the petal account (accountId override).

### Step 8 – Direct Messaging (HCS-10)
- [x] Build compose panel accepting alias/account ID, resolving recipient via registry before send.
- [x] Submit messages to recipient inbound topic using `TopicMessageSubmitTransaction` with payload `{type, from, to, content, sentAt}`.
- [x] Subscribe to active identity inbound topic via mirror WebSocket/polling, tracking consensus sequence to deduplicate.
- [x] Sort and render inbox chronologically with alias resolution, timestamps, and read status indicators.
- [x] Implement optimistic send + reconciliation when mirror confirmation arrives (adds consensus timestamp + receipt link).
- [x] Surface new message notifications (badge/toast) even when user is in other sections.

### Step 9 – Profile Discovery Experience
- [x] Integrate global alias search component leveraging registry helpers with cached suggestions.
- [x] Provide saved contacts list storing alias → accountId/inboundTopicId mappings with TTL.
- [x] Support inline alias resolution across messaging and flora invitation flows (auto-fill inbound topic).
- [x] Render helpful empty/error states guiding users to request contacts to publish profiles if not found.
- [x] Track search analytics/events in debug logs for troubleshooting alias collisions.
- [x] Offer manual refresh control to force re-query registry topics when cache stale.

### Step 10 – Flora Creation Workflow (HCS-16)
- [x] Implement multi-step "New Flora" wizard capturing flora name/purpose, initiating identity, and invitees (alias picker).
- [x] Create communication/transaction/state topics via `TopicCreateTransaction` with HCS-16-compliant memos and record admin keys.
- [x] Construct `flora_create_request` payload (members, topic IDs, metadata) and dispatch to each invitee inbox plus comm topic.
- [x] Persist flora draft locally with invitee acceptance tracking and topic identifiers.
- [x] Display creation progress UI with ability to resend/cancel invitations prior to activation.
- [x] Handle partial topic creation failures by rolling back persisted state or prompting retry.

### Step 11 – Flora Invitation Handling & Activation
- [x] Detect `flora_invite` messages in inbox UI and render dedicated card with accept/decline actions.
- [x] On accept, post `flora_create_accepted` (or equivalent) message to communication topic and notify initiator if necessary.
- [x] Update local flora registries to mark member acceptance and add flora to dashboard when quorum reached.
- [x] Listen on communication topic for all acceptances; once complete, broadcast `flora_created` message and promote flora status to active.
- [x] Surface decline/time-out handling, alerting initiator and adjusting flora status accordingly.
- [x] Bind flora membership to identity used during acceptance for accurate context switching.

### Step 12 – Flora Dashboard & Topic Interaction
- [x] Build flora detail dashboard with tabs/sections for Communication, Proposals (Tx), and State logs.
- [x] Subscribe to comm/tx/state topics with cleanup on identity change or component unmount to prevent leaks.
- [x] Enable chat posting on communication topic with alias display and consensus timestamps.
- [x] Provide proposal composer on Tx topic generating unique proposal IDs and optional deadline metadata.
- [x] Implement simple voting UI (yes/no/abstain) posting vote messages and aggregating client-side tallies.
- [x] Allow state updates with optional `stateHash` field and TODO marker for future HCS-17 integration; render historical state log with explorer links.

### Step 13 – Data Management & Local Storage Strategy
- [x] Centralize Hedera service exports (`lib/hedera/index.ts`) to ease backend/provider swapping.
- [x] Wrap mirror fetches with SWR/React Query caching, retries, and focus/interval revalidation policies.
- [x] Define localStorage schema versions, migration routines, and purge-on-identity-change safeguards.
- [x] Persist petals, floras, contacts, and preferences with timestamps and TTL to mitigate stale data.
- [x] Provide debug utilities for viewing/purging cached payloads via developer toggle.
- [x] Ensure no private keys or sensitive secrets are stored client-side beyond expected metadata.

### Step 14 – UI/UX Polish & Accessibility
- [x] Apply cohesive Tailwind theme for headers, cards, buttons, and forms maintaining WCAG contrast ratios.
- [x] Replace raw account IDs with alias-first display and tooltip/secondary text for IDs when needed.
- [x] Add loading indicators, disabled states, and toast notifications around all async Hedera interactions.
- [x] Ship contextual help modal/tooltips explaining Profiles, Petals, Floras with approachable language and docs links.
- [x] Introduce developer/debug toggle exposing raw JSON payloads, topic IDs, and consensus metadata.
- [x] Validate responsive layouts across breakpoints and add keyboard navigation/focus styles for accessibility.

### Step 15 – Testing & Quality Assurance
- [x] Configure npm scripts (and optional Husky hooks) for `lint`, `test`, `test -- --coverage`, and `build` workflows.
- [x] Write Vitest + Testing Library suites covering profile creation, registry lookups, messaging pipelines, and flora invitations with mocked Hedera clients.
- [x] Add integration/regression tests for local storage caching and identity switching behaviour.
- [ ] Manually verify on Hedera testnet: account memo updates, topic creation, registry entries using mirror API/HashScan, recording IDs for QA logs.
- [x] Perform multi-session messaging and flora stress tests to confirm ordering, latency, and subscription cleanup.
- [x] Profile performance of topic polling/subscriptions and tune intervals or batching as needed.

### Step 16 – Deployment & Post-Launch Readiness
- [x] Prepare `.env.production`/Vercel secrets for network, mirror node, WalletConnect project ID, registry endpoints, and optional analytics keys.
- [x] Execute `npm run build` locally, resolve warnings, and monitor bundle/chunk sizes for heavy dependencies (e.g., standards SDK).
- [ ] Configure Vercel project (Node 18) and link GitHub repo for continuous deployments.
- [ ] Deploy via Vercel dashboard or CLI; verify environment variables and Hedera integrations operate in deployed environment.
- [ ] Run production smoke tests (wallet connect, profile creation, messaging, flora flows) against deployed URL.
- [x] Update README/help documentation with usage steps, known limitations, and support contact channels.
