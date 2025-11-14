export function createRequire() {
  return function throwRequire(moduleId) {
    throw new Error(`Dynamic require of "${moduleId}" is not supported in this environment.`);
  };
}
