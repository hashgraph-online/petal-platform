import { Client } from "@hashgraph/sdk";
import { env } from "@/config/env";

let cachedClient: Client | null = null;

/**
 * Creates a Hedera SDK client scoped to the configured network.
 * The client is memoised to avoid repeated instantiation on the server.
 */
export function getHederaClient(): Client {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = Client.forName(env.HEDERA_NETWORK);
  return cachedClient;
}

/**
 * Clears the cached client. Useful for tests to ensure a clean instance.
 */
export function resetHederaClient(): void {
  cachedClient?.close();
  cachedClient = null;
}
