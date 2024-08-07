interface Queue<any> {
  send(message: any): Promise<void>;
}

interface Env {
  readonly ENVIRONMENT: string;
  readonly ERROR_QUEUE: Queue<any>;
  readonly PROXY_DOMAIN: string;
  readonly WEBHOOK_PATH: string;
  readonly WEBHOOK_TEST_PATH: string;
  readonly DEDUPLICATION_ENABLED: boolean;
  readonly DEDUPLICATION_TTL: number;
  readonly DEDUPLICATION_KV: KVNamespace;
  readonly RATELIMITING_ENABLED: boolean;
  readonly RATELIMITER: any;
}
