.DEFAULT_GOAL := help

# pnpm's dependency check re-runs `pnpm install` before every `pnpm exec`; skip it, `make install` is explicit.
PNPM := pnpm --config.verify-deps-before-run=false

.PHONY: help install build test lint fmt clean

help: ## List the targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies from the lockfile
	pnpm install --frozen-lockfile

build: ## Bundle the Worker into dist/ without publishing (wrangler --dry-run)
	$(PNPM) exec wrangler deploy src/index.ts --dry-run --outdir dist --name cf-n8n-proxy --compatibility-date 2024-09-23 --compatibility-flags nodejs_compat

test: ## Run the tests (node --test)
	node --test "test/**/*.test.ts"

lint: ## Check formatting with prettier
	$(PNPM) exec prettier --check src test

fmt: ## Format src and test with prettier
	$(PNPM) exec prettier --write src test

clean: ## Remove build output
	rm -rf dist
