class ApiCache {
  private cache: Map<string, any> = new Map();

  private generateKey(url: string, params?: any, data?: any): string {
    return JSON.stringify({ url, params, data });
  }

  set(url: string, params: any, data: any, responseData: any) {
    const key = this.generateKey(url, params, data);
    this.cache.set(key, responseData);
  }

  get(url: string, params?: any, data?: any): any | null {
    const key = this.generateKey(url, params, data);
    return this.cache.get(key) || null;
  }

  has(url: string, params?: any, data?: any): boolean {
    const key = this.generateKey(url, params, data);
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }
}

export const apiCache = new ApiCache();
