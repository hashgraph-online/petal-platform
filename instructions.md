Building a Hedera DApp with Profiles, Petal Accounts, Messaging, and Flora Coordination

This guide outlines a comprehensive step-by-step process to build a Next.js 15+ application on Hedera Hashgraph that implements profile management, multi-account (petal) identities, direct messaging, and group coordination (flora accounts). We leverage the Hedera Consensus Service (HCS) standards for Profiles (HCS-11), Petal accounts (HCS-15), Messaging (HCS-10), Discovery (HCS-2), Flora coordination (HCS-16), and plan for future state hashing (HCS-17). Using these open standards ensures our app is interoperable and “best-of-class.” Below, we integrate the Hashgraph Online Standards SDK (@hashgraphonline/standards-sdk) and follow UI/UX best practices (Tailwind CSS for a clean interface).

Hedera HCS Standards in this App: HCS-11 defines a profile metadata schema for consistent on-chain identity
hashgraphonline.com
, HCS-15 enables multiple “petal” accounts controlled by one key for isolated profiles
hashgraphonline.com
, HCS-10 provides a secure messaging protocol on Hedera’s consensus service
hashgraphonline.com
, HCS-2 offers a registry mechanism for discovering topics/agents
hashgraphonline.com
, and HCS-16 outlines multi-party “flora” accounts using three coordinated topics
hashgraphonline.com
. (HCS-17 specifies state-hash verification
hashgraphonline.com
, which we will stub for future use.) Using these together (as Hashgraph Online DAO suggests, “HCS-2 provides a registry..., HCS-10 defines how they communicate, HCS-11 standardizes their profile”
genfinity.io
) will allow users to seamlessly connect, identify each other, message, and form groups on Hedera. Now, let’s dive into the build steps.

Step 1: Initialize the Next.js Project and Tailwind UI Setup

Set up a Next.js 15+ app – Begin by creating a new Next.js project (ensure you have Node.js 18+). You can use create-next-app or the Next.js CLI. For example:

npx create-next-app@latest hedera-dapp


This will scaffold a Next.js 15 project structure (with the new App Router if applicable). Navigate into the project directory.

Add Tailwind CSS – Install Tailwind and initialize it for styling. Run:

npm install -D tailwindcss postcss autoprefixer  
npx tailwindcss init -p


This creates a tailwind.config.js and postcss.config.js. In tailwind.config.js, set the content paths to include your Next.js pages/components (e.g. ./app/**/*.{js,ts,jsx,tsx}). Import Tailwind’s base styles in your global CSS (e.g. create globals.css with @tailwind base; @tailwind components; @tailwind utilities; and import it in _app.js or the Root Layout). This integration will allow rapid UI development with utility classes.

Plan a minimalistic UI structure – Using Tailwind UI components, sketch the page layout:

A simple navbar/header with the app name and a “Connect Wallet” button.

Pages or sections for Profile, Messages, and Floras (groups), corresponding to user stories.

Tailwind’s utility classes will keep the design clean and responsive. Aim for a light, easy-to-read interface (ample spacing, clear typography). For example, use classes like p-4, text-lg, bg-gray-50 for a soft background, etc. Keep the color scheme neutral/minimal.

Ensure the HTML structure is semantic (e.g., use <main>, <section> tags) and accessible. Use short instructional text in the UI to guide non-technical users (e.g., “Connect your Hedera wallet to begin” on the home screen).

Step 2: Install Hedera SDKs and Configure Environment

Install Hedera libraries – Add the required Hedera packages to your project:

Hedera JS SDK (if needed by the standards SDK) and the Hashgraph Online Standards SDK:

npm install @hashgraph/sdk @hashgraphonline/standards-sdk


Hedera Wallet Connect library for web:

npm install @hashgraph/hedera-wallet-connect


(Ensure this is the correct package name per the spec; this library will handle wallet connections, likely supporting HashPack or Blade wallets via WalletConnect protocol.)

Configure network – In a Next.js environment file (e.g. .env.local), set configuration like Hedera network (TESTNET by default for development) and your Hedera Operator account if needed. For a client-only app, you typically won’t have a server operator account; instead, each user will act as their own operator via their wallet. Still, if any server-side calls are needed (like using Hedera SDK on Next.js API routes), configure HEDERA_NETWORK=testnet and credentials as needed. The standards SDK will accept a network parameter when initializing clients.

Modular data fetching setup – Plan how to access Hedera network data:

We will mostly rely on Hedera Mirror Node REST APIs (or WebSocket streams) to fetch consensus topic messages and account info. No dedicated backend is needed; Next.js can call mirror node endpoints directly from the client or via API routes. Keep base URLs (e.g. https://testnet.mirrornode.hedera.com/api/v1) in a config.

Alternatively, note that Hgraph.io (provided by hgraph.com) could offer an enhanced API or indexing for Hedera data. We won’t integrate it immediately, but structure our code so swapping the data layer is easy. For example, encapsulate all mirror node calls in a helper module (hederaApi.ts), so later you can replace those with Hgraph API calls if needed.

Local storage usage – Decide what data to persist in the browser’s localStorage. According to the spec, we want to avoid needing a database (Supabase) unless absolutely necessary. We’ll use window.localStorage for:

Caching the user’s petal accounts list (account IDs of sub-accounts created).

Caching flora memberships (list of flora IDs or topic IDs the user is part of).

Maybe caching profile info (like the user’s name/alias) to show instantly on UI load. All authoritative data remains on Hedera, but localStorage can speed up UI and allow offline viewing of last known data.

Note: Use JSON serialization for complex data (e.g., localStorage.setItem('petals', JSON.stringify([...]))). Keep storage usage minimal and refresh it by re-fetching from network when needed to avoid stale data.

Step 3: Implement Wallet Connection (Hedera Wallet Connect Integration)

User Story: “As a user, I want to easily connect my wallet on the home page.”

Initialize wallet connector – Using the @hashgraph/hedera-wallet-connect library, set up a connection flow. This likely involves creating a WalletConnect object with Hedera parameters. For example, in a React context or Next.js component:

import { HederaWalletConnector } from '@hashgraph/hedera-wallet-connect';
// ...
const connector = new HederaWalletConnector({ network: 'testnet' });


(If the library is based on WalletConnect v2, you may need to specify the wallet’s metadata, project ID, etc. Refer to library docs for exact initialization.)

Connect wallet button – In your Nav or Home page, add a “Connect Wallet” button. On click, trigger the wallet connect flow:

Use connector.connect() to open the wallet pairing. For example, with HashPack wallet, this might open a QR code or a new window to authorize. The library should handle this and return the connected account ID and a signer.

After successful connection, retrieve the user’s Hedera account ID (e.g., connector.getAccountId() or from the session object). Also fetch the public key if needed (for verifying signatures or linking accounts).

Update the UI state to show the wallet as connected (e.g., display the shortened account ID, like 0.0.xxxx). Also, hide or disable the connect button after success.

Account context – Create a React context or state to store the connected account info globally. This will include:

accountId (e.g., "0.0.12345"),

signer or a function to sign transactions (from the wallet connector),

Perhaps the publicKey string.
This context will be used by other components (profile, messaging, etc.) to know which account is active and to sign HCS transactions. For example, a context provider can wrap the app so any component can call wallet.signTransaction(tx) via the connector’s signer.

Wallet connect UX – Smooth the user experience:

If the user is not connected, show the connect prompt prominently (maybe a modal or a centered section on home page explaining the app and asking to connect).

If connected, show a confirmation (like “✅ Connected to Hedera account 0.0.X”) and proceed to load user data (profile, messages, etc.).

Handle errors (e.g., user rejects connection): show a friendly message or toast. Allow retrying connection.

Remember the connection for the session if possible. For example, if the wallet connector provides a persistent session, reuse it so that a page reload doesn’t force reconnection. If not, the user may have to reconnect each time (inconvenient, so explore storing the connector’s session in localStorage if supported).

Step 4: Create and Update the User Profile (HCS-11 Standard)

User Story: “I want to easily manage my profile for my base account.”

With the wallet connected, the user should create an HCS-11 profile for their account. The HCS-11 Profile Metadata Standard defines a common schema for identity on Hedera (name, avatar, etc.)
hashgraphonline.com
. It’s used to represent both human users and autonomous agents in a uniform way. Notably, an HCS-11 profile includes the agent’s name/alias and also the “inbound” and “outbound” topic IDs for messaging
genfinity.io
. We will leverage the Standards SDK to simplify profile creation.

Generate a profile object – Prompt the user to enter basic profile info (at least a display name or alias, maybe an avatar URL or short bio). Use a simple form in the Profile page. When the user submits:

Construct an HCS-11 profile JSON/object. The @hashgraphonline/standards-sdk likely provides a class or builder for HCS-11 profiles. For example, there might be an HCS11Client or methods to format profile data. (Check SDK docs or types for HCS11Client or HCS11Profile.)

Include fields per the HCS-11 schema: name, nickname/alias, profile image (could be optional), and any other metadata defined by the standard. Most importantly, include messaging topic IDs: if the user doesn’t have an inbound messages topic yet, create one now (see next step). The profile should store the inboundTopicId (where this user listens for messages) and possibly an outboundTopicId (topic used for the user’s outgoing message log or for connection handshakes)
genfinity.io
. These IDs allow others to contact this profile.

Create a personal inbound topic – Use the Hedera Consensus Service to create a new topic for this user’s incoming messages:

Call the SDK or Hedera JS to build a TopicCreateTransaction. We can mark the topic with a special memo indicating its purpose. For example, set the topic memo to a code or text like "HCS-10 Inbox for acct 0.0.X" or a numeric enum if the standard defines one. (Ensuring a memo can help indexers discover it easily
hashgraphonline.com
, though for a personal inbox it’s mainly for clarity.)

Have the user sign this TopicCreate transaction via their wallet (since the user will be the topic admin by default). The Standards SDK might have a utility to create a personal inbox topic as part of HCS-10 or HCS-11 flows – check if something like HCS10Client.createInbox() exists. If not, directly use the Hedera SDK:

const tx = new TopicCreateTransaction().setTopicMemo("HCS-10 Inbox");
const submit = await tx.freezeWithSigner(walletSigner).executeWithSigner(walletSigner);
const receipt = await submit.getReceipt(client);
const topicId = receipt.topicId.toString();


Capture the topicId. This will be the inboundTopicId for the user’s profile. (No need for a separate outbound topic for basic messaging; however, HCS-10 spec refers to both inbound/outbound. To keep it simple, we can treat this one as the primary channel others use to reach the user. Outbound can be just a logical concept or used for AI agents’ internal logging.)

Submit profile to Hedera (HCS-11) – Now that we have the profile data and topic IDs, use the Standards SDK to write the profile on-chain:

The profile could be published as a consensus message on a profile registry topic or stored in the user’s account. HCS-11 likely uses a registry (possibly in combination with HCS-2) to make profiles discoverable across applications
genfinity.io
. We will both update the account memo field and publish to a registry topic:

Update account memo: Use the Hedera AccountUpdateTransaction to set the account’s memo to identify the profile. A recommended approach is to put a short identifier or pointer. For example, set the memo to the user’s chosen alias or a prefix like "HCS11Profile" plus some ID. This step ensures that anyone viewing the account on-chain sees that it has an associated HCS-11 profile. The standards SDK might handle this if we call something like HCS11Client.createProfile() – check if it returns an AccountUpdate tx. If not, do manually:

const accountId = myAccount; 
const memo = "HCS11:"+ alias;  // or some profile reference
const updateTx = new AccountUpdateTransaction()
    .setAccountId(accountId)
    .setAccountMemo(memo);
await updateTx.freezeWithSigner(walletSigner).executeWithSigner(walletSigner);


Ensure to sign with the wallet. After execution, the account’s memo is updated on Hedera (you can verify via mirror API).

Publish profile data: Use the HCS-2 registry (next step) to actually store the full profile JSON on-chain. This could be done by sending a ConsensusMessage to a known Profile Registry Topic designated by Hashgraph Online’s standards. The Standards SDK’s HCS-11 module or HCS-2 module likely has a method for registration. For example, HCS11Client.registerProfile(profileObject) or a more generic RegistryClient.register(topicId, data). We will detail this in Step 5 (Discovery).

Profile UI update – Once the profile creation transaction is complete:

Display the updated profile info on the Profile page (e.g., show the entered name, and maybe the account’s memo, etc.).

Indicate to the user that their profile is now “on-chain.” If possible, provide a link to a Hedera explorer or the registry explorer for their profile.

The profile can be updated anytime: allow the user to edit fields and re-submit. If they change their alias or image, you should:

Update the on-chain data (post an updated profile message to the registry topic) and optionally update the account memo if the alias changed.

Use the same functions as creation, but treat it as an update (the HCS-11 standard likely says that the latest message for that account on the registry is the active profile; older ones could be ignored or archived).

Ensure compliance with HCS-11 – By using the standardized schema and SDK, you guarantee compatibility. The profile metadata is standardized so other apps or agents can read it uniformly
genfinity.io
. Our use of the standards SDK means we handle any serialization or field naming according to spec. (For example, if the standard requires a certain JSON structure or a specific memo format for linking profiles to accounts, the SDK will enforce that.) This results in cross-app identity “enabling consistent identity representation across applications”
hashgraphonline.com
.

Step 5: Register Profile in HCS-2 Registry for Discovery

To allow others to discover and message the user, we use HCS-2: Advanced Topic Registries. HCS-2 provides a standardized way to organize data in topics for discovery
hashgraphonline.com
. In our case, we’ll use a Profile Registry (a specialized consensus topic or set of topics) to publish the user’s profile entry. This acts like a decentralized “phone book” for Hedera identities.

Obtain registry topic – Determine which topic to use for profile listings:

Hashgraph Online likely runs a registry service (the “Registry Broker”) and a well-known topic for agent/user profiles. There might be a global topic ID for all HCS-11 profiles, or one can be created for your app specifically. Check the documentation or community info for a registry. For instance, the Hashgraph Online Agent Registry could be accessible via registry.hashgraphonline.com and may have an API. For development, you could also create your own registry topic.

If using the standards SDK, see if it offers a RegistryClient or similar. In the SDK docs, a Registry Broker Client is mentioned for interacting with discovery services
hashgraphonline.com
. This might abstract away the details of where the data is stored (possibly using HIP-563 JSON in topic etc.). For simplicity, assume a known ProfileRegistryTopicId is available (you can store it in config).

Publish profile to registry – Take the HCS-11 profile JSON constructed in Step 4 and publish it as a message to the registry topic:

Use the Hedera ConsensusMessageSubmit transaction. The message could be the raw profile JSON or a standardized format (perhaps it needs to include a key like the user’s account as an identifier). The HCS-11 standard likely defines how profile data is stored in the registry (e.g., as a JSON object with fields for account, alias, image, inboundTopic, etc.).

Submit this transaction with the user’s wallet. Since this is just a message, the user will pay a tiny HCS fee. The result is that anyone reading the registry topic can find the profile. For example:

const registryTopicId = "<ProfileRegistryTopicId>";
const msgTx = new TopicMessageSubmitTransaction()
    .setTopicId(registryTopicId)
    .setMessage(JSON.stringify(profileObject));
await msgTx.freezeWithSigner(walletSigner).executeWithSigner(walletSigner);


(In practice, use the standards SDK if available, which might do JSON schema validation and topic management automatically.)

Verify registration – After publishing, you can query the mirror node for the latest messages on the registry topic to ensure it’s recorded. The profile entry will likely contain your account ID as a reference. This decentralized registry is how others will look you up by alias or ID. According to the standard, “topic registries within the HCS framework enable organized data discovery”
hashgraphonline.com
 – meaning we can later search this topic for a given alias to get the corresponding profile (and inbound topic ID for messaging).

Profile discovery UI – Although not visible to the user explicitly, this step enables a future feature: a “search user” function. We will implement that later (Step 8) to allow sending messages to others by alias. For now, just ensure the profile is registered. (Optionally, log the transaction ID or timestamp of the registry entry in localStorage so the app knows the profile is live.)

Security and privacy – Note that by publishing an HCS-11 profile on a public topic, the user’s profile data becomes public (as intended for discoverability). Ensure the user is aware that their alias and any info they put will be visible on-chain. Advise them to keep sensitive info out. The benefit is others can find them easily and verify the profile’s integrity via the Hedera consensus logs.

Step 6: Create Petal Accounts (HCS-15 Standard) for Multiple Identities

User Story: “I want to create petal accounts and see all the petal accounts I’ve made.”

With the base profile set, we implement HCS-15: Petal Accounts. This standard allows a user to spawn multiple account instances (child accounts) that use the same private key as the base account
hashgraphonline.com
. Petal accounts let a user compartmentalize assets or profiles (like having sub-identities) without managing new keys for each. We will enable users to create and manage petal accounts directly from the app.

UI for petal creation – On the Profile page (or a dedicated “Identities” page), add a section “My Petal Accounts” with a list and a “Create New Petal” button. Explain to the user that petal accounts are additional accounts controlled by their wallet’s key (so they don’t need to manage extra keys). Each petal can have its own profile and be used independently in the app.

HCS-15 account creation – When the user clicks Create New Petal:

Use the @hashgraphonline/standards-sdk HCS-15 module to create a petal account. The SDK provides high-level methods so you don’t have to craft the transaction manually. For example:

import { HCS15BrowserClient } from '@hashgraphonline/standards-sdk/hcs-15';
const petalClient = new HCS15BrowserClient({ network: 'testnet' });
const result = await petalClient.createPetalAccount({ 
  basePrivateKey: walletSigner, 
  initialBalance: 5, 
  accountMemo: "Petal of " + baseAccountId 
});


This should create a new account on Hedera with the same public/private key as the base (the basePrivateKey provides the key; in browser context, the wallet signer may be used instead of raw key). The result typically includes the new accountId (and a receipt)
hashgraphonline.com
. Under the hood, this issues an AccountCreateTransaction where the publicKey is the same as the base account’s public key, thus the same key controls both
hashgraphonline.com
. The initial balance can be a small amount transferred from the base (say 5 HBAR, as in example) to activate the account.

If not using the SDK for some reason, you can manually do:

const basePublicKey = ...; // get from wallet (PublicKey.fromString)
const createTx = new AccountCreateTransaction()
    .setKey(basePublicKey)
    .setInitialBalance(new Hbar(5))
    .setAccountMemo("Petal of " + baseAccountId);
await createTx.freezeWithSigner(walletSigner).executeWithSigner(walletSigner);
// get receipt and new accountId


But the SDK’s createPetalAccount is preferred to ensure the standard’s nuances are handled.

Record and confirm – Once the transaction succeeds:

Retrieve the new Petal account ID from the result/receipt.

Use the HCS15Client.verifyPetalAccount(newId, baseAccountId) method to confirm on the mirror that the new account’s public key matches the base’s
hashgraphonline.com
hashgraphonline.com
. This is an extra check (the SDK likely does it or you can simply trust the creation if no error).

Add the new Petal account to the app’s state:

Append to the petal accounts list in localStorage (e.g., store an array of account IDs or objects with {id, memo}).

Update the UI list to display it. For display, you might show the account ID and allow the user to give it a nickname (to distinguish multiple petals).

Show a success message like “✅ Petal account 0.0.XYZ created.” Encourage the user to create an HCS-11 profile for it (next step).

Petal account usage – Explain to the user that they can now use this petal account as a separate identity:

In the UI, each petal in the list can have an “Activate” or “Switch to this identity” action. This would set the context so that subsequent actions (sending messages, joining floras, etc.) are done as that account. Technically, since the key is the same, the wallet can sign for it too. We just need to track which account ID we are acting as.

For example, if the user selects a petal account, update a state currentIdentity = petalAccountId. Use this when constructing transactions: many HCS actions require specifying the payer account. The wallet’s key signs, but the accountId on the transaction should be the petal’s ID if you want fees to be charged to the petal account. (However, note: since the key is identical, it can sign as the petal. Ensure the wallet connector supports signing for a different account ID with the same key – HashPack might need you to explicitly switch accounts. If that’s an issue, one might always pay from base but conceptually act as petal. Ideally, the wallet should be aware of multiple accounts with one key.)

If direct wallet usage of petal accounts is problematic, you could default to all transactions being paid by the base account (which is simpler) but still label messages as coming from the petal identity within the content. However, the proper method is to actually use the petal account to pay for its own transactions, so attempt that if the wallet supports a “sign as account X” feature.

UI listing – For each petal in the list, show:

Account ID (shortened).

Memo (if we set “Petal of base” or a user-defined label).

Perhaps a balance (you can fetch its balance via mirror node to show it has the initial HBAR).

Buttons: “Switch to this” (sets active identity), “Profile” (to go to manage profile of this petal), maybe “Delete” (though deleting an account on Hedera requires transfer to 0.0.0 and is advanced; we likely won’t implement deletion).

Using Tailwind, you can style this as a simple list group or cards. For example, a <ul> with <li> items having a title (account ID) and actions in a smaller button row.

Best practices – Petal accounts give users flexibility with the same key. Remind them through UI text or docs that all petals share the same private key, so they are not meant for security separation but rather organizational separation (multiple profiles or use-cases)
hashgraphonline.com
. Each petal can hold assets separately and have its own profile/identity, but if the base key is compromised, all are. This is analogous to having multiple sub-accounts under one login.

Step 7: Enable Profile Management for Petal Accounts

Each petal account is essentially a new identity on the network, so we allow the user to create an HCS-11 profile for each one as well (similar to the base profile). This addresses the story: “I want to update profiles for each of my petal accounts.” The process is almost the same as for the base account:

Profile creation flow (reuse) – When the user selects a petal account and clicks something like “Setup Profile”:

Show a form to enter profile details for that petal (maybe default some fields, e.g., if petal is for a different persona or project, they might give it a different alias).

Internally, use the same HCS-11 routine: create a profile JSON, create an inbound topic for that petal (so it can receive messages independently of the base), update the petal account’s memo, and register the profile on the HCS-2 registry.

The only difference is that the transactions must be signed as the petal account. Since the petal has the same key, the signature is possible. But the wallet might require switching context to that account to sign an AccountUpdate or TopicCreate for it. Check your wallet connector’s capabilities:

If possible, simply specify .setAccountId(petalId) on the AccountUpdateTransaction and sign. The key is the same, so the signature is valid for that account. The mirror node will check that the transaction’s signature key matches the petal’s key, which it does.

The Standards SDK’s HCS15BrowserClient could also have a convenience: after creating a petal, it might keep track of the key so you can directly call something like petalClient.createPetalProfile(petalId, profileData). If not, you can manually instantiate an HCS11Client with the petal’s account as operator (but since key is same, you might reuse the connection).

Follow through updating the petal’s account memo (e.g., “PetalProfile:<alias>”) and publishing to the profile registry (with the petal’s account in the profile data).

List in registry – Now others can discover the petal’s profile too. For example, if the user wants a separate alias for a specific community, others can find that alias and message the petal account without necessarily knowing the connection to the base account. This uses the same discovery mechanism. The registry will simply have multiple entries (one for base, one for each petal, each identified by their account ID and alias).

UI indication – In the petal list, once a petal has a profile, show a badge or info (e.g., “Profile created ✔”). You could allow editing it similar to base profile. Perhaps clicking on the petal in the list navigates to a profile edit page specific to that petal.

Profile switching – Ensure that when the active identity is switched (base or a specific petal), the app’s context uses the corresponding profile for display. For instance, at the top of the Messages page, you might indicate “Messaging as [Alias] (Account 0.0.X)”. This clarity helps users remember which persona they are using.

Consistency with standards – We are essentially treating each petal just like a normal user/agent on the network with its own HCS-11 profile and HCS-10 inbox topic. This adheres to the idea of petal accounts being “isolated profiles and asset holdings” under one key
hashgraphonline.com
. By using the standards SDK and same process, we maintain compatibility (the profile schema and registry entries for petals are no different from base accounts). The only unique aspect is HCS-15’s relationship which we manage on our side (linking base and petals in UI, using the same key).

Step 8: Implement Direct Messaging Between Profiles (HCS-10 OpenConvAI Standard)

User Story: “I want to see my inbound messages and send outbound messages.”

Now that users (base or petal) have profiles and have registered their messaging topics, we can enable peer-to-peer messaging using HCS-10, which defines a protocol for secure, verifiable communication via HCS
hashgraphonline.com
. In the context of our app, this means one user can send a message to another’s inbound topic, and the recipient will fetch it from that topic. We will implement a simple messaging UI and logic for sending/receiving messages.

Messaging data model – Decide how to represent messages:

We can use a basic schema: e.g., each message is a JSON object with fields like from (sender account or alias), to (receiver account or alias), type (perhaps "text" or "flora_invite" etc.), content (the message text or payload), and maybe a timestamp.

HCS-10 being the “OpenConvAI” standard might have a more complex message structure (since it’s designed for AI agent comms). For human messaging, we can keep it simple or check if the standard’s SDK provides a helper. (The Standards Agent Kit mentions a SendMessageTool for HCS-10
genfinity.io
 which likely wraps sending JSON messages to the correct topic.)

For our implementation, we’ll treat any message posted to a user’s inbound topic as an incoming message from someone. The from field might not be automatically included, so we will include it in the JSON payload when sending (the sender knows their own ID and alias).

Send Message flow – On the Messages page, provide a way to send a direct message:

A form with fields: Recipient (this could be an alias or account ID) and Message content.

When user submits:

Resolve the recipient: If the user entered an alias, look it up in the registry (see Step 8 below for discovery). If it’s an account ID, you might still want to fetch the profile to get their inbound topic ID. Either way, you need the target’s inboundTopicId. We likely stored that in their profile (in registry). If we have the profile object from registry, extract inboundTopicId.

Construct the message payload. For example:

const msg = {
  from: currentIdentity,  // e.g. "0.0.12345" or alias of sender
  content: userMessageText,
  type: "text"
};


(Including the sender’s alias might be user-friendly, but the recipient can cross-reference the account ID with a profile lookup if needed.)

Submit to HCS: Use TopicMessageSubmitTransaction on the recipient’s inbound topic ID:

new TopicMessageSubmitTransaction()
  .setTopicId(inboundTopicIdOfRecipient)
  .setMessage(JSON.stringify(msg))
  .freezeWithSigner(walletSigner)
  .executeWithSigner(walletSigner);


The walletSigner here corresponds to the sender’s identity. If the active identity is a petal account, attempt to sign as that account (with the same key). The message will carry the signature of the key, but since topics don’t require signing keys to match certain accounts (anyone can submit), it’s actually not critical which account pays the tiny fee. For consistency, try to have the petal pay if sending from a petal identity.

The transaction receipt isn’t that important for messaging (except to confirm success). You can optimistically add the message to the UI as sent.

The Standards SDK might have a more convenient method, e.g., HCS10.sendMessage(fromProfile, toProfile, content). If so, that would handle finding topics and formatting. We know from the Agent Kit that “SendMessageTool sends messages to other agents using HCS-10”
genfinity.io
. We are essentially implementing that logic manually here for our app.

Receive Message flow – The app needs to listen for new messages on the current user’s inbound topic(s):

For a given identity (base or petal) that is active, subscribe to its inbound topic. The Hedera Mirror Node provides a WebSocket topic stream at wss://testnet.mirrornode.hedera.com/api/v1/topics/<topicId>/messages. You can use a WebSocket client in the browser to get real-time updates. Alternatively, perform polling via REST GET /topics/<topicId>/messages?order=asc&limit=... periodically.

To keep it simple, set up a polling interval (e.g., every 5 seconds) to fetch new messages for the active identity’s topic. Use a React effect that runs on component mount or when the active identity changes. Keep track of the last timestamp or sequence number seen to only fetch newer messages.

When messages are retrieved, parse the content (they will be base64-encoded if from REST, so decode and then JSON parse if you sent JSON). Add them to a local state array of messages.

Filter out any messages not relevant. Since the inbound topic might receive all sorts of HCS-10 communications (including possibly connection requests or flora invites, which we will handle in Step 9/10), you may want to categorize:

If msg.type === "text" (regular chat), put it in the general inbox list or in a thread associated with the sender.

If msg.type === "flora_invite" or other special type, handle accordingly (maybe put it under “Flora Requests”).

If no type field, assume it’s a plain message.

For now, simply display inbound messages in chronological order with who sent them. We’ll handle flora invites separately.

Messages UI – Design the Messages page to have:

An “Inbox” listing incoming messages (with sender info and a snippet of content). Each entry could show the alias (or account) of sender, the message text, and timestamp. If you want, group by sender for a chat-like feel (e.g., clicking a sender filters messages to that conversation).

A “Sent” box or indicator: Outgoing messages could be shown for reference. If we maintain a list of messages the user sent (we can intercept when sending and add to a state), we can either combine with inbox or have a separate toggle to view sent messages. It might be fine to just have everything in one chronological feed labeled with sender=me or others.

Input controls to send a new message: The recipient field and message textbox as described. You might structure it as a “New Message” form at the top of the page. Optionally, if the user clicked a specific sender from the inbox to reply, you could auto-fill that as the recipient.

Using localStorage for messages? – We will not store messages in local storage, to avoid duplication of on-chain data and potential privacy issues. Instead, we fetch from the network so we’re always up-to-date. We might cache the last few messages in memory (state) or even localStorage for quick UI, but given messages are on-chain, it’s safe to rely on the mirror node. The user can always retrieve complete history from Hedera (the benefit of using HCS is persistence and auditability).

Test messaging – Using two browser sessions (or two accounts):

Connect with Account A in one window, Account B in another (you might use a petal as a second identity for testing, or testnet accounts).

Ensure both have profiles and have each other’s alias or account info.

Have A send a message to B’s alias. Verify B’s app receives it (polling picks it up) and displays it.

Reply from B to A. Check A sees it.

Also test what happens if a message arrives when the user is not currently on the Messages page or not active – maybe consider a simple notification (like increment an “unread” count in the nav or use a toast).

By implementing messaging over HCS like this, we adhere to HCS-10 principles: secure, verifiable interactions over Hedera’s consensus service
hashgraphonline.com
. Every message has a consensus timestamp and is immutable, viewable on Hedera Explorer for transparency. Our simple protocol (JSON with from/content) can be extended or encrypted later, but even now it achieves decentralized, trust-minimized chat.

Step 9: Implement Profile Discovery (Using HCS-2 Registry Lookups)

User Story (implied): The app should allow users to find other profiles to message them. (“…register profiles on HCS-2 for profile discovery to send messages through HCS-10.”) Now that profiles are registered (Step 5), we need to utilize that for discovery:

Search UI – In the Messages section (or as a global search bar), add a “Find User by Alias” field. This allows a user to enter someone’s alias or username and search for their profile.

When submitted, perform a lookup in the HCS-2 profile registry. If we had an index, we would query it. Without a dedicated index server, one approach is to fetch messages from the registry topic and filter by alias (which is not scalable if many profiles exist). Instead, we can integrate with a Registry Service API if provided by Hashgraph Online:

The “Registry Broker” likely offers an API endpoint to search by alias and return matching profile records (similar to how a centralized phonebook lookup would work, but backed by the on-chain data). If such an API is available (perhaps registry.hashgraphonline.com/api/search?alias=<name>), use it. If not, for our prototype, we can maintain a small local directory.

For demonstration, assume a simple solution: the app keeps a cache of known profiles (e.g., any profile you have interacted with, you store their alias->topic mapping in localStorage). This is limited, but for a small user pool it works. You could pre-load some known entries (if this were a public app, ideally you’d use the registry service).

If a user enters an alias not in cache, you might alert “Alias not found. Ensure the user has registered their profile.”

Fetching profile from registry – If implementing directly:

Query the registry topic via mirror node for messages containing the alias. The registry messages might be JSON with an alias field; you could fetch recent messages and filter. This isn’t efficient on the client side if the registry is large. However, as a fallback for a demo, you might do:

const res = await fetch(`<mirror_api>/topics/${ProfileRegistryTopicId}/messages?limit=100&order=desc`);
const msgs = await res.json();
const profileMsg = msgs.find(m => /* decode m.message and check alias field */);


Then parse profileMsg.message for the profile.

A more practical approach is using the Standards SDK Registry Client. If provided, it could have a method like registryClient.getProfileByAlias(alias). Internally it might query an index or the mirror. Because the prompt suggests using the SDK as much as possible, look for such a function or perhaps the registry might even be wrapped in a smart contract (but likely not, since it’s HCS).

In summary, for our application, we emphasize that the profile search feature is powered by the on-chain registry (HCS-2), which “enables organized data discovery”
hashgraphonline.com
. In production, we'd utilize an indexing service for quick lookup.

Using found profile – Once we retrieve the target’s profile data:

Display their basic info (name, maybe avatar if any) to confirm with the user, “Send message to Alice (0.0.X)?”.

Use the profile’s inboundTopicId for messaging (we already integrated that in Step 8’s send flow — here we supply it).

Possibly allow adding this profile to a “contacts” list in localStorage for easy access later.

Direct alias addressing – Optionally, support sending messages by alias without manual search:

E.g., user types alias in the Recipient field and presses send, the app behind the scenes does the lookup (as above) and then sends the message if found. If not found, show error.

This streamlines the UX (no separate search step needed), at the cost of a slight delay on send due to lookup. This is acceptable given our use of local caches or a fast registry service.

Testing discovery – Create two profiles (like your test accounts) with distinct aliases. From one, try searching the other’s alias and sending a message. Confirm that the message goes through. This will prove that our HCS-2 registry integration works and that HCS-10 messaging can be initiated purely via discovered profile information. Essentially, “agents can discover each other (HCS-2) and communicate (HCS-10)” as the standards intend
genfinity.io
.

At this point, our app supports a decentralized social experience: profiles are on-chain, and any user can message any other by looking them up, without any centralized server – fulfilling core open standards for identity and communication.

Step 10: Initiate Flora Account Creation (HCS-16 Multi-Party Coordination)

User Story: “I want to request to create a flora account together with others.”

Now we implement Flora accounts (HCS-16) – multi-party accounts that enable collaborative groups or shared entities. A Flora is essentially a formation of multiple petal accounts (potentially from different users) that coordinate via three consensus topics
hashgraphonline.com
. Think of it as a group chat with governance: there’s a communication channel, a channel for transaction proposals, and a channel for state updates (like group state or multi-sig status). We’ll allow a user to invite others to form a Flora and coordinate the creation handshake.

Flora creation UI – On a “Floras” page, include a “New Flora” button or form. When clicked:

Ask the user for a Flora name (optional, for their reference), and to select members to invite. Member selection could allow:

Choosing from a list of known contacts (if the user has some in a contacts list or previously messaged profiles).

Entering aliases or account IDs manually (with lookup similar to messaging).

The user themselves is implicitly a member (likely using one of their identities – either their base or a chosen petal to represent them in the Flora). You might allow the user to pick which of their identities will join the Flora. For simplicity, assume the user’s currently active identity will be their participant in the Flora.

Once the user has input the other members (e.g., a multi-select input of aliases), proceed with the creation process.

Create Flora topics – Following HCS-16, each Flora requires three dedicated HCS topics
hashgraphonline.com
:

Communication Topic (CTopic) – for general coordination messages (e.g., group chat, invites, join/leave notices).

Transaction Topic (TTopic) – for proposing multi-party transactions or actions (e.g., signing a transfer).

State Topic (STopic) – for publishing the state or outcome (e.g., current group state or a hash of state for audit).
These topics are usually created by the Flora initiator. Use the Hedera SDK to create three topics:

const memoBase = "Flora:" + floraName;  // you might incorporate a short name
const commTopicTx = new TopicCreateTransaction().setTopicMemo(memoBase+"-Comm");
const txTopicTx  = new TopicCreateTransaction().setTopicMemo(memoBase+"-Tx");
const stateTopicTx = new TopicCreateTransaction().setTopicMemo(memoBase+"-State");
// sign and execute each, retrieve the new Topic IDs


It’s important to set recognizable memos or use the numeric enums defined by HCS-16 spec for each topic type
hashgraphonline.com
. For example, if the standard says Communication Topic memo must contain a certain code, follow that. The standards SDK might abstract this (e.g., an HCS16Client.createFloraTopics() that returns all three IDs with correct memos).

Execute these transactions with the user’s wallet (the initiator becomes admin of these topics by default, but we could later set access control if needed).

Collect the three new topic IDs. These define the Flora’s channels.

flora_create_request message – Now, notify the invited members:

Compose a Flora creation request message as per HCS-16 core operations: it starts with a flora_create_request event
hashgraphonline.com
. This message should include:

The list of participant account IDs (or their profile identifiers) who are invited.

The three topic IDs (CTopic, TTopic, STopic) that have been created for this Flora.

Perhaps a human-readable name or purpose of the Flora.

The sender (initiator) identity.

We send this request to each invitee. Options:

Direct message to each invitee’s inbox (their HCS-10 inbound topic). This ensures they will see an invite in their Messages.

Additionally or alternatively, post it on the Flora’s Communication Topic. Since the initiator has created the comm topic, they can publish the invite there. The others aren’t listening to it yet (they don’t know it until they read the invite via direct message), so posting on comm topic alone is not enough for them to know. But it will be recorded on that topic for completeness.

So do both: for each invitee, send a direct HCS-10 message: type: "flora_invite" with the Flora details. Also, put a message on CTopic like “Invited A, B, C to Flora; awaiting acceptance”.

The standards SDK might have a buildFloraCreateRequestTx(members, topics) in HCS-16. If yes, use it to get a transaction or message bytes that conform exactly to spec, then submit to each target’s topic.

Local tracking – Mark this Flora as “pending” in the initiator’s UI:

In local state, add an entry for the new Flora with its topics and members, and a status flag “pending acceptance”.

Display it in the Floras list (with maybe a gray icon indicating not active yet).

The initiator may need to wait for responses. Perhaps show the invited members and whether each has accepted (initially none have).

Invitation handling (for recipients) – When invitees receive the flora_invite message in their inbox:

The Messages page should recognize the type: flora_invite and show it separately (e.g., under a “Flora Invites” subsection, or highlight it in the inbox with an “Accept” button).

The invite message includes the necessary info (topics, etc.). The UI should display “X invites you to form a Flora group [Name]. Accept?” and list who else is invited if included.

If the user clicks Accept:

We need to send a flora_create_accepted message (per HCS-16 flow)
hashgraphonline.com
. Likely, this should be posted on the Flora’s Communication Topic (CTopic) so that all members (especially the initiator) see it. The invitee now knows the comm topic ID from the invite data.

So, have the app use the invite’s commTopicId to submit a message: e.g., {"type": "flora_accept", "from": myAccount}.

Optionally, also send a direct confirmation back to initiator’s inbox, but that’s redundant if everyone monitors the comm topic.

Mark in the invitee’s local state that they’ve joined. Add the Flora to their Floras list (with status maybe “pending (waiting for group creation)”).

If Decline, optionally send a flora_create_rejected (not explicitly in core ops, but could be inferred or just not respond which implies rejection). At least, notify the initiator somehow (could DM them a “decline” message).

The UI should remove the invite from the pending list once responded or if declined.

Flora creation finalization – The initiator’s app should watch the comm topic for responses:

As soon as it sees all invited members have sent flora_accept on the comm topic (or a majority, depending on policy – but likely it needs unanimity to proceed):

It then sends a flora_created message on the comm topic
hashgraphonline.com
 indicating the Flora is active. This could include maybe an initial state or just a confirmation.

At this point, the Flora is officially formed. All three topics are now “in use”:

The comm topic can be used for group chat or further coordination.

The tx topic can be used if they want to coordinate signing transactions (e.g., one member proposes a multi-sig transaction here).

The state topic can record any shared state (like a running tally, or a hash of a document, etc., possibly along with HCS-17 hashes for audit).

The Standards SDK likely streamlines this process. For example, HCS16Client.createFlora(members) might under the hood create topics and manage the handshake messages. If such high-level function exists, it could abstract all of the above. Since we want clarity, we detailed the manual steps, but using the SDK’s flows is advisable to avoid mistakes (ensuring all message types and memos match spec).

Multi-sig or shared account – Note that so far we created topics for coordination, but we have not created a shared crypto account controlled by the group. HCS-16 by itself might not create an on-chain account; it just coordinates existing accounts (the members’ petals). Shared escrow or multi-signature actions would be done via scheduled transactions that the group coordinates on the tx topic. Implementing actual fund escrow is advanced (would involve creating a Hedera account with a threshold key of all members – which could be done if needed). However, the user specs say “flora accounts together” and “shared escrow” is mentioned in HCS-16 standard
hashgraphonline.com
. To keep scope manageable:

We assume flora = group of individuals coordinating; we won’t create a new Hedera account for the flora itself in this iteration.

“Shared escrow” can be conceptually handled by members agreeing to use one member’s account as escrow or a multi-sig schedule, but implementing that fully is complex. We skip to focusing on messaging coordination.

We do leave a placeholder: e.g., in the Flora’s info we can note “(A shared account can be added later for escrow if needed)” for future development.

By completing this step, we have the mechanism for users to form groups (“floras”) in a decentralized way. The structured messages (flora_create_request → accepted → created) follow the standard, making it auditable and predictable. As noted, each Flora is built from HCS-15 Petals and uses three topics with explicit operations for membership and state
hashgraphonline.com
hashgraphonline.com
. This structure keeps our group implementation modular and transparent.

Step 11: Manage and View Flora Accounts (Flora UI and Functionality)

User Story: “I want to see all the floras I am part of on one page, select a flora to view its information on the three topics, and send messages on those topics from the flora view.”

Now that flora creation and joining is possible, we need to present the floras and allow interaction on their topics.

Flora list page – In the “Floras” section of the app, list all flora groups that the user is involved in:

Use localStorage or state where we stored flora memberships. Each entry should have the flora’s name (if given), the topic IDs, and members.

For each flora, show an item with:

Flora Name or ID – e.g., “Flora: Alice&Bob Project” or a generated ID if no name (maybe use the comm topic ID as an identifier).

Key details: number of members, possibly list the members’ aliases (you can resolve their profiles via the registry to show names).

If the flora is pending (not fully created yet), indicate that (e.g., “Pending acceptance”).

This list should update when:

The user creates a flora (we added it as pending, then mark active on completion).

The user accepts an invite (we add it once accepted).

Possibly, if someone else invites and user is offline, when they come online and fetch messages, upon accepting it will be added.

Provide a way to enter a flora’s detail view, e.g., clicking the item.

Flora detail view – When a flora is selected, show a dashboard for that group:

Members: list all participant profiles. Show their alias and account (maybe highlight which one is the user).

Topics: divide the interface into three sections corresponding to the three topics:

Communication (Comm) Topic – Display messages from this topic (similar to a group chat). This will include system messages (like join/leave or the flora_created message) and any user chat messages. We should subscribe to this topic via mirror node in real-time (or poll) just like we did for inbox. The difference is, all members will write to this same topic for group chat.

Show the message history (who said what at what time).

Provide an input box to send a message to the comm topic. For example, if users want to discuss within the group, they type here and submit, and your app does a TopicMessageSubmit on the comm topic with their content (mark the sender).

Also handle any special flora operations via this channel: e.g., if a user wants to invite a new member later (that could be a flora_join_request flow as hinted by HCS-16
hashgraphonline.com
). This is advanced; for now maybe skip dynamic membership changes beyond initial create.

Transaction (Tx) Topic – This topic is for proposals that might require agreement. For simplicity:

We can treat it as a place to propose textual ideas or actions. E.g., a member could post “Proposal: We all fund 100 HBAR to account X” or “Vote: do X”. In a real scenario, this could be a serialized scheduled transaction needing signatures, but implementing actual multi-sig is complex. Instead, simulate proposals:

Show any messages on this topic. Likely none until someone posts. Provide a form: “New Proposal” where a user can input a description. Submitting will send a message to the Tx topic (e.g., {"type":"proposal", "from": me, "text": "...", "id": proposal1}).

Others could respond by posting votes or comments on the comm topic, or we could define a vote message on Tx topic. If we wanted, we could implement a simple voting: e.g., each member can send {"type":"vote","proposal":"proposal1","vote":"yes"} on the Tx topic. But to keep it simple, just record proposals on Tx topic.

The UI can label the Tx topic section as “Proposals” and list all proposals and their statuses (status we determine off-chain for now, e.g., “Pending” or “Approved” if all responded).

State Topic – This is meant to hold compact state updates for the flora, often accompanied by a state hash (HCS-17)
hashgraphonline.com
. Initially, we might not have a concrete state (especially if we didn’t create a joint account). But we can use it to log any important agreed outcomes or snapshots:

For example, if a proposal passes, a member can post a state update: {"state":"Proposal1 approved and executed"}. Or if the flora had a treasury, they could post balance updates.

We also use this section to stub the integration of HCS-17 state hashes. HCS-17 defines how to compute a cryptographic hash of the state of an account or group for audit
hashgraphonline.com
. We will not implement hashing now, but we design for it:

Decide on a structure: e.g., if the Flora has a shared document or balance, one could compute a hash of that and post it in the state topic for transparency. For now, we just leave a placeholder in code where such a hash would be inserted.

For instance, when posting a state message, include a field "stateHash": null or "stateHash": "<future>" to indicate where a hash would go. We can even include a comment in the code: // TODO: compute HCS-17 state hash when state tracking is implemented.

The UI for state topic shows a log of state changes. Likely this is not heavily used in our initial app, but we include it for completeness. If there are no state messages, just display “No state updates yet.”

Provide an input for posting a new state update (e.g., an admin or any member can type a note and submit to state topic).

Topic Subscription: Similar to inbox, the app should fetch messages for each of the three topics:

You might open three WebSocket listeners or poll sequentially. To optimize, maybe poll less frequently on Tx and State if they’re used rarely, but for simplicity, treat all similar.

Use the mirror node to get messages and update the respective section in UI.

Sending messages: Ensure when the user posts to any of these topics, they sign the transaction with the appropriate identity (their membership in the flora, which is one of their accounts). If the user created the flora with their base account and someone else joined with their petal, each will use their respective account to sign messages. This way, each message on the topics is provably from a certain member (signature by their key).

Use Tailwind to differentiate the sections visually, maybe using tabs or accordion for Comm/Tx/State, or a three-column layout if space permits (probably vertically stacked on mobile). Label them clearly and perhaps include a short description (like “Communication channel for general messages”, “Proposals channel for multi-party decisions”, “State channel for official records”).

Flora actions – Additional group management actions can be considered (not explicitly in user stories but logical):

Leave Flora: A member might leave a flora. This would entail sending a message on comm topic (and possibly removing themselves from further coordination). We can skip implementing leave for now, assuming floras are relatively static once created.

Add Member after creation: HCS-16 suggests join requests and votes
hashgraphonline.com
. We won’t fully implement, but note that if needed, a member could propose adding someone new (maybe as a Tx proposal, then if agreed, send them an invite).

These can be future enhancements; our current focus is initial creation and basic messaging within the flora.

Experience for technical vs non-technical users – Provide some guidance in the UI:

Non-technical: Use simple terms like “group” instead of “flora” (you might name the feature “Group Accounts” or similar on the front-end, and use “flora” in tooltips or advanced sections). Explain that the group has three internal channels and what each is for, perhaps with a short note or an info icon that pops up help text.

Technical: They might appreciate seeing the topic IDs, etc. You could show the raw topic IDs and allow copying them for debugging. Possibly provide links to a Hedera explorer for each topic (so they can see the sequence of messages on hashscan or equivalent).

Keep the interface uncluttered by default but have advanced info expandable. For instance, listing member account IDs might be enough; an advanced toggle could show their public keys or something if needed.

Testing flora – Simulate a multi-party scenario:

Use at least two accounts (e.g., your base and a petal as two different “users” in a group). Create a flora with those two and maybe a dummy third (you can create another petal to mimic a third user).

Accept invites and ensure the flora becomes active.

Exchange messages in the Communication topic (they should appear for both users).

Make a “proposal” on Tx topic from one side, see it appear on the other.

Post a “state update” on State topic, see it logged.

Verify that all these messages are retrievable via mirror APIs and consistent.

Check that if one user is offline (not connected), when they come back and load the flora page, the history of messages populates (since we fetch from chain).

This confirms our flora implementation is robust and uses HCS-16’s structured approach for multi-party coordination (separating concerns into distinct topics, which keeps things auditable and easier to index
hashgraphonline.com
).

Step 12: Data Management – Local Storage and Avoiding Unneeded Backend

We have touched on this, but to reiterate how the app stores and retrieves data, ensuring we align with the instruction “Don’t use Supabase if you don’t need to”:

On-chain data sources: Almost all dynamic data in this app lives on Hedera:

Profiles (HCS-11) are stored in HCS topics (registry) and partly in account memo.

Petal account relationships are evident on-chain (same public key for multiple accounts) and we verify via mirror.

Direct messages and Flora messages are all on HCS topics (HCS-10, HCS-16).

There is no centralized database of messages or profiles needed – we use mirror queries to fetch everything.

Local storage usage: We use it for convenience and UX:

Caching lists of Petal accounts (petals list as array of IDs) so we don’t have to refetch or recalc them each session. (Although we could regenerate by scanning mirror for accounts with same public key as base, that’s an expensive call, so caching is fine.)

Caching Flora membership (floras list with topic IDs and names) for quick display. Again, one could discover this by scanning flora topics for one’s ID, but easier to maintain locally when invites are accepted.

Possibly caching profile alias of the user or their contacts to avoid frequent registry lookups.

These caches should be updated when relevant events happen (account created, profile updated, invite accepted, etc.), and can be purged or refreshed if needed.

No Supabase: Given the above, we indeed have no necessity for a remote DB or auth; Hedera accounts are our identity system and HCS our database for messages. This dramatically simplifies deployment (front-end only). Supabase could have been used as a relay or to store off-chain copies of messages for faster queries, but that’s optional. We might mention that if the app needed full-text search or large file storage we could integrate Supabase or another storage for those specific cases. But as per spec, we avoid it entirely in this initial build.

Switchable data layer: We wrote our data access in one place (for example, a hederaService.js that has functions like getMessages(topicId), sendMessage(topicId, msg), searchProfile(alias)). If later we want to use a more sophisticated service (like a GraphQL API from Hgraph or a dedicated indexing microservice), we can swap out the implementation inside these functions without changing the rest of the app. This modular design future-proofs the app for scaling. For instance, if HGraph offers a single API call to list all floras a user is in, we could use that instead of relying on localStorage of invites.

Error handling: Ensure to handle cases where data isn’t found or transactions fail:

If a registry lookup fails (mirror node down or alias not found), inform the user gracefully.

If sending a message fails (maybe network issues), let the user retry.

Local storage reads might return null (e.g., no petals created yet) – handle defaults.

This approach satisfies the requirement: “utilize localStorage instead if easier, only use supabase if something requires it”. Our app is self-contained using browser storage and Hedera network – truly decentralized and serverless.

Step 13: Refine UI/UX for Clarity and Smoothness

With functionality in place, focus on polish and user experience:

Consistency and Minimalism: Use a consistent design system via Tailwind:

Choose a primary color for highlights or buttons (maybe Hedera purple or a calming blue) and apply it through Tailwind classes (e.g., bg-purple-600 text-white for primary buttons).

Use Tailwind UI components examples for forms, modals, lists: they offer accessible and pretty designs out-of-the-box (like nicely styled buttons, input fields with borders, etc.). Incorporate those to avoid spending too much time on CSS details.

Keep pages uncluttered. Only show advanced info on demand. For example, the default profile page might just show “Name, Alias, Avatar” fields; an advanced accordion could reveal the raw account memo or keys if needed for devs.

Explaining concepts in simple terms: Non-technical users should not need to know the terms HCS-10, HCS-16, etc. Use friendly labels:

HCS-11 profile → just call it “Profile”.

Petal account → maybe call it “Sub-account” or “Linked account”. You could use “Petal (sub-account)” in the UI to introduce the term gently.

Flora account → call it “Group” or “Shared account”. Perhaps in a help tooltip mention “(Powered by Hedera HCS-16 standard Flora accounts)”, but not in main UI text.

In messages, instead of raw account IDs, show aliases (resolve via registry). E.g., if 0.0.123’s alias is Alice, display “Alice: [message]”. Only show the ID in a tooltip or if alias not found.

Provide feedback messages: e.g., after profile creation, “Profile saved on Hedera!”; after sending message, maybe clear input and show it in chat immediately with a subtle “✓” once confirmed by consensus timestamp.

Smooth interactions:

Where possible, avoid page refresh or full reloads when switching identities or pages. Use React state to dynamically update components (Next.js App Router or pages can manage state lifting via context).

If using Next.js App Router (v13+), you might leverage React context for wallet and current identity, and use useState hooks for data. That ensures snappy SPA-like transitions.

Loading states: when waiting for a transaction (like creating petal or sending message), give user a visual indicator (spinner or “Sending…” text) so they don’t click twice or wonder if it worked. On completion, either auto-refresh relevant data or confirm to user.

Validate inputs: e.g., ensure alias is alphanumeric and not too long, prevent sending empty messages, etc., to reduce errors.

Technical user toggles:

Possibly have a debug mode (maybe triggered by a keypress or a setting) that if enabled, shows raw data for those who care. E.g., show full JSON of a profile, or the consensus timestamps of messages, etc. This can help in testing and will be appreciated by dev users, but keep it hidden by default to avoid confusing average users.

By prioritizing a “good feeling” UI, we make the app inviting. For example, a minimal theme with pleasant spacing, maybe slight animations on button clicks (Tailwind CSS can be paired with headless UI or basic CSS transitions). The goal is the app should feel as seamless as using a normal chat or social app, even though under the hood it’s all decentralized.

Step 14: Testing the Integrated Application

Before deploying, thoroughly test each component to ensure the step-by-step integration works as a whole:

Profile & Registry: Create a profile and verify on Hedera Explorer or mirror API that:

Account memo was updated.

A message was published on the registry topic (check its contents match your profile).

Try updating the profile and see that changes propagate.

Petal accounts: After creating a petal, ensure:

The new account shows up on a Hedera explorer with the correct public key (matching base). For instance, HashScan will show the key; compare it to base account’s key (they should match, confirming HCS-15 multi-account usage
hashgraphonline.com
).

Test signing with petal: try sending a small HBAR transfer from petal to another account using the app (just to test the wallet can act as petal). If wallet doesn’t natively switch, you may have to always use base to pay fees; make sure that’s handled gracefully.

Messaging: Simulate conversations:

Send messages to self (base to petal and vice versa) to test both sending and receiving in one client. They should appear in the inbox list.

Check that the content and sender info is correctly displayed (and that alias resolution works if the profile of sender is known to the receiver).

Test edge cases: extremely long message content, sending non-ASCII text (emojis, etc.), sending simultaneous messages from two different clients – ensure ordering by consensus timestamp is handled (the mirror node results are timestamped; our app can sort messages by timestamp to display in correct order).

Flora flows:

Test full invite flow with at least 2 members:

Initiator sends invite, invitee sees it and accepts, initiator sees acceptance, flora gets created.

If possible, test with 3 members to see that initiator waits for all three to accept.

What if one declines? Ensure the initiator knows (maybe implement at least a notification if someone doesn't respond or declines – e.g., timeout or explicit decline message).

Once Flora is active, test posting in each topic by different members:

Check that messages on comm topic show up for all.

If a proposal is posted on tx topic, maybe manually simulate others posting a vote or just note it.

Post a state update, see it.

Confirm all these are visible via mirror query as well, proving data integrity.

Check that leaving and re-entering the flora detail page reloads the history correctly (so we’re indeed fetching from HCS, not just memory).

Performance: With multiple subscriptions (inbox, possibly multiple flora topics), ensure the app performance is still good:

We might need to tune polling intervals or use efficient updates to state so that UI doesn’t bog down. For now, with only a handful of topics, it should be fine.

If any memory leaks or stale listeners, fix those (e.g., when switching active identity or leaving a page, close any open WebSocket subscriptions to topics that are no longer relevant).

By completing testing, we can be confident the app is production-ready and robust. The reliance on Hedera’s consensus finality (messages are final in ~5s) gives near real-time UX with the benefits of auditability (we can always cite the transaction ID or timestamp for verification if needed).

Step 15: Deployment to Vercel (Production Setup)

Finally, prepare to deploy the application to Vercel for hosting:

Environment configuration – Double check that any environment-specific values are set via Vercel’s dashboard or included in a .env.production:

Network: likely switch to mainnet if going live. But be careful – if this is a public app, real HBAR costs apply. Perhaps initially deploy on testnet for beta users. You can allow a toggle between testnet and mainnet if desired.

Wallet connect might require specific metadata or project IDs (for WalletConnect v2 you need a Project ID from walletconnect cloud). Ensure those are set.

If using any third-party service (e.g., if integrated a registry search API), set its endpoint or keys.

On Vercel, add these as environment variables in project settings so Next.js can use them.

Build Optimizations – Run npm run build to create a production build locally and fix any errors or warnings. Next.js will tree-shake and optimize. Make sure the @hashgraph/sdk and others don’t bloat the client bundle unnecessarily:

The standards SDK might be large; consider using dynamic imports for heavy modules if needed (Next.js supports dynamic import for components – e.g., maybe load certain admin tools only when needed).

But given a specialized domain, it should be fine. Just be mindful of bundle size and loading times.

Vercel deployment – Connect the GitHub repo to Vercel (if not done already). Vercel will auto-deploy on pushes. Ensure the project is set to use Node 18 in Vercel (via engines field in package.json or settings).

Alternatively, use vercel CLI: vercel deploy from the project directory. This will upload the project and configure accordingly.

Vercel provides a domain; you can set a custom domain if desired once it’s live.

Post-deploy testing – After deployment, test the app at the Vercel URL:

Try connecting a wallet in production environment (some wallets might treat localhost vs. real domain differently; e.g., HashPack might require the domain to be in allowed list if using WalletConnect – ensure to check wallet documentation).

Go through all features quickly to ensure nothing broke in production build (sometimes timing issues or environment differences can cause minor issues).

Monitor the browser console and network calls for any errors (CORS issues with mirror node calls on a different domain, etc., should be resolved by mirror’s permissive policy but good to check).

Security review – Since this is a production-ready app, do a quick audit:

No sensitive info is stored server-side (none in our case).

The user’s private key never leaves their wallet – we did everything via wallet signatures. Good.

Ensure we are not exposing any secrets in the front-end (there shouldn’t be any except perhaps a WalletConnect Project ID which is okay).

The app should only interact with trusted domains (Hedera public APIs, maybe Hashgraph Online’s if using their services).

If using any external resources (fonts, icons), host or use reputable CDNs.

Documentation & Support – Write a README or a small help section in-app explaining how to use it. Since this is an innovative dApp, users might need guidance:

E.g., in the app’s About or Help page, explain what profiles, petals, floras are in simple terms.

Provide contact info or GitHub link for bug reports.

This isn’t a code step, but a production readiness step.

By following all these steps, we have built a production-ready Hedera dApp that is modular, standards-compliant, and user-friendly. The app allows users to manage their identity on Hedera (with HCS-11 profiles), spawn sub-identities (HCS-15 petal accounts), discover other users (HCS-2 registry), communicate directly (HCS-10 messaging), and form collaborative groups (HCS-16 flora, with consideration for HCS-17 future state verification). All of this is achieved without a centralized server, showcasing the power of Hedera’s consensus service and a well-designed front-end.

Throughout development we used the Hashgraph Online Standards SDK to adhere to best practices – this ensures our transactions and data formats conform to the expected shapes (for example, using the same field names and memos as the published standards). Adhering to these standards means our app can interoperate with others in the ecosystem and take advantage of any future tooling (for instance, an explorer could natively recognize our flora’s topics by their memos or a wallet could manage HCS-11 profiles directly).

Conclusion: Following this guide, you should end up with a live application on Vercel that provides a smooth UX for both technical and non-technical users to engage with Hedera’s capabilities – all through a simple web interface backed by robust on-chain standards. Happy building! 🚀

Sources:

Hedera Consensus Service Standards (Hashgraph Online DAO):

Profile Metadata Standard (HCS-11)
hashgraphonline.com
genfinity.io

Petal Accounts (HCS-15)
hashgraphonline.com

OpenConvAI Communication (HCS-10)
hashgraphonline.com

Topic Registries for discovery (HCS-2)
hashgraphonline.com

Flora Coordination (HCS-16)
hashgraphonline.com
hashgraphonline.com

State Hashing (HCS-17)
hashgraphonline.com

Hashgraph Online Standards SDK documentation (HCS-15 example usage)
hashgraphonline.com

“Building the Decentralized Agentic Internet” – Genfinity (context on HCS-10, HCS-11, HCS-2 interplay)
genfinity.io
genfinity.io

HCS-16 Flora Overview (three-topic structure and message flows)
hashgraphonline.com
hashgraphonline.com