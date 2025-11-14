"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { isDebug } from "@/config/env";

const DebugContext = createContext<{
  debugMode: boolean;
  toggleDebug: () => void;
}>({
  debugMode: false,
  toggleDebug: () => undefined,
});

export function DebugProvider({ children }: { children: ReactNode }) {
  const [debugMode, setDebugMode] = useState<boolean>(isDebug);

  const toggleDebug = () => {
    setDebugMode((current) => !current);
  };

  return (
    <DebugContext.Provider value={{ debugMode, toggleDebug }}>
      {children}
    </DebugContext.Provider>
  );
}

export function useDebug() {
  return useContext(DebugContext);
}
