export class RoleCache {
  private cache: Map<string, { data: Set<string>; timestamp: number }> =
    new Map();
  private maxEntries: number;
  private maxAge: number;
  constructor(maxEntries?: number, maxAge?: number) {
    console.log(`===== Create new cache!!!! ${new Date().toUTCString()}`);
    this.maxEntries = maxEntries || 100;
    this.maxAge = maxAge || 60 * 60 * 1000; // 1 hour (60 minutes * 60 seconds * 1000 milliseconds) <-- double check this math? I think we want is in millisecond
  }

  public get(key: string): Set<string> | undefined {
    const hasKey = this.cache.has(key);
    if (!hasKey) return undefined;

    const { data } = this.cache.get(key)!;
    return data;
  }

  public put(key: string, value: Set<string>) {
    if (this.cache.size >= this.maxEntries) {
      const keyToDelete = this.cache.keys().next().value;
      this.cache.delete(keyToDelete);
    }

    const currentTime = Date.now();

    this.cache.set(key, { data: value, timestamp: currentTime });
  }

  public delete(key: string) {
    this.cache.delete(key);
  }

  public shouldUpdate(key: string): boolean {
    const currentTime = Date.now();
    const hasKey = this.cache.has(key);
    if (!hasKey) return false;

    const { timestamp } = this.cache.get(key)!;
    if (currentTime - timestamp > this.maxAge) {
      return true;
    }

    return false;
  }
}
