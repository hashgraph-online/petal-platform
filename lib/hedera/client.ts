import { Client } from "@hashgraph/sdk";
import { env } from "@/config/env";

const cachedClients = new Map<string, Client>();

/**
 * Creates a Hedera SDK client scoped to the configured network.
 * The client is memoised to avoid repeated instantiation on the server.
 */
export function getHederaClient(
  network: "mainnet" | "testnet" | "previewnet" = env.HEDERA_NETWORK,
): Client {
  const cacheKey = network;
  const existing = cachedClients.get(cacheKey);
  if (existing) {
    return existing;
  }

  const client = Client.forName(network);
  cachedClients.set(cacheKey, client);
  return client;
}

/**
 * Clears the cached client. Useful for tests to ensure a clean instance.
 */
export function resetHederaClient(): void {
  cachedClients.forEach((client) => client.close());
  cachedClients.clear();
}
