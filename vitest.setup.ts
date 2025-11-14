import "@testing-library/jest-dom/vitest";

declare const vi:
  | undefined
  | {
      stubGlobal: (key: string, value: unknown) => void;
      fn: <Args extends unknown[], Return>(
        implementation?: (...args: Args) => Return,
      ) => {
        (...args: Args): Return;
        mock: { calls: Array<Args> };
      };
    };

// Provide default WalletConnect identifiers so env parsing does not warn in tests.
if (!process.env.WALLETCONNECT_PROJECT_ID) {
  process.env.WALLETCONNECT_PROJECT_ID = "vitest-walletconnect";
}

if (!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = process.env.WALLETCONNECT_PROJECT_ID;
}

// Ensure localStorage/sessionStorage exist in jsdom before modules read them.
if (typeof window !== "undefined") {
  const storageFactory = () => {
    let store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store = new Map();
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    } satisfies Storage;
  };

  Object.defineProperty(window, "localStorage", {
    value: storageFactory(),
    configurable: true,
  });

  Object.defineProperty(window, "sessionStorage", {
    value: storageFactory(),
    configurable: true,
  });
}

// Silence noisy debug logging during tests.
const originalConsole = globalThis.console;

if (typeof vi !== "undefined") {
  vi.stubGlobal("console", {
    ...originalConsole,
    debug: vi.fn(),
    warn: vi.fn(),
  });
}
