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

- Change everywhere example.com to your domain


### Create queue
```
wrangler queues create cf-n8n-proxy-production -e production
```

### Deploy your service
```
wrangler deploy -e production
```


### How to test in local?
```
wrangler dev
```
