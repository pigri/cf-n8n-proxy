# cf-n8n-proxy

Cloudflare worker for n8n proxy

### Why do you need this?

- You can use this service to protect your n8n instance from DDoS attacks.
- You can use this service to hide your n8n instance from the public.
- You can use this service to add rate limiting to your n8n instance.
- You can use this service to add deduplication to your n8n instance.
- You can use this service to add a queue to your n8n instance.
- You can use this service to add a retry mechanism to your n8n instance.

### Requirements:

- You need a paid Worker plan ($5 USD) for this service due to the queue.
- A cloudflare domain

### Architecture:

cloudflare -> cloudflare worker -> n8n

## How to use?

### Wrangler install

```
npm install -g wrangler pnpm
```

### NPM package install

```
pnpm install
```

### Wrangler login

```
wrangler login
```

### Create your wrangler config

```
cp wrangler.toml_example wrangler.toml
```

- Change everywhere `example.com` to your domain

### Create queue

```
wrangler queues create cf-n8n-proxy-production -e production
wrangler queues create dlq-cf-n8n-proxy-production -e production
```

### Enable deduplication feature

```
wrangler kv:namespace create cf-n8n-proxy
```

- Replace `<mykvid>` with the response ID in the wrangler.toml file.
- Change `DEDUPLICATION_ENABLED=false` to `DEDUPLICATION_ENABLED=true` in the wrangler.toml file.

### IMPORTANT NOTES ABOUT DEDUPLICATION "As of January 2022, expiration targets that are less than 60 seconds into the future are not supported. This is true for both expiration methods."

- `DEDUPLICATION_TTL` is optional; by default, it is set to 60 seconds.

### Rate limiting

- Change `RATE_LIMITING_ENABLED=false` to `RATE_LIMITING_ENABLED=true` in the wrangler.toml file.

#### Default 100 requests per minute

```
simple = { limit = 100, period = 60 }
```

### Deploy your service

```
wrangler deploy -e production
```

### How to test in local?

```
wrangler dev
```
