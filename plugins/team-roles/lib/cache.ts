/** Results kept per key until their stamp changes; callers that arrive mid-run share its promise. */
export function createStampedCache<T>() {
  const entries = new Map<string, { stamp: string; value: Promise<T> }>();
  return {
    get(key: string, stamp: string, produce: () => Promise<T>): Promise<T> {
      const found = entries.get(key);
      if (found !== undefined && found.stamp === stamp) return found.value;
      const value = produce();
      entries.set(key, { stamp, value });
      return value;
    },
    clear(): void {
      entries.clear();
    },
  };
}
