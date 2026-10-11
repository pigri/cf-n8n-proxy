.DEFAULT_GOAL := help

# Needs Node 22.18+ (or 23.6+): tests import .ts directly via default type stripping, and
# `node --test` expands globs. Tested on Node 26 (see .nvmrc).

.PHONY: help install build test lint fmt clean

help: ## List the targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies from the lockfile
	pnpm install --frozen-lockfile

# The compatibility date is 2024-09-23 because the dependencies need nodejs_compat v2 (bare node
# built-ins such as `url`); the 2024-03-04 date in wrangler.toml_example no longer bundles.
build: ## Bundle the Worker into dist/ without publishing (wrangler --dry-run)
	pnpm exec wrangler deploy src/index.ts --dry-run --outdir dist --name cf-n8n-proxy --compatibility-date 2024-09-23 --compatibility-flags nodejs_compat

# `node --test` exits 0 when the glob matches nothing, so check that there are tests first.
test: ## Run the tests (node --test)
	@find test -name '*.test.ts' 2>/dev/null | grep -q . || { echo "no test/**/*.test.ts files found" >&2; exit 1; }
	node --test "test/**/*.test.ts"

lint: ## Check formatting with prettier
	pnpm exec prettier --check src test

fmt: ## Format src and test with prettier
	pnpm exec prettier --write src test

clean: ## Remove build output
	rm -rf dist
