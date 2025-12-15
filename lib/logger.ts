type LoggerLike = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const instances = new Map<string, LoggerLike>();
const noopLogger: LoggerLike = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function getLogger(moduleContext = "app"): LoggerLike {
  if (instances.has(moduleContext)) {
    return instances.get(moduleContext) ?? noopLogger;
  }
  instances.set(moduleContext, noopLogger);
  return noopLogger;
}
