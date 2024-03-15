# cf-n8n-proxy
Cloudflare worker for n8n proxy

You need a paid Worker plan ($5 USD) for this service due to the queue.
Requirements:
- A cloudflare domain

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
- Change `DEDUPLICATION=false` to `DEDUPLICATION=true` in the wrangler.toml file.
- `DEDUPLICATION_TTL` is optional; by default, it is set to 60 seconds.

### Deploy your service
```
wrangler deploy -e production
```

### How to test in local?
```
wrangler dev
```
