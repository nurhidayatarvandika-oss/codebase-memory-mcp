# Codebase Memory MCP — Cloudflare Worker + D1

Persistent MCP memory service running on Cloudflare Workers, with Cloudflare D1 as its storage. The Worker exposes the MCP Streamable HTTP endpoint at `/mcp` and retains all seven memory tools:

1. `save_memory`
2. `search_memory`
3. `list_memories`
4. `update_memory`
5. `delete_memory`
6. `get_project_summary`
7. `get_memory_stats`

## Configure and deploy

Requirements: Node.js 20+, npm, and a Cloudflare account authenticated with Wrangler.

```bash
npm install
npx wrangler d1 create codebase-memory
```

Copy the `database_id` from Wrangler's output into `wrangler.toml` in place of `REPLACE_WITH_D1_DATABASE_ID`, then initialize the database and deploy:

```bash
npm run db:remote
npm run build
npm run deploy
```

For local development, create/use Wrangler's local D1 database and run:

```bash
npm run db:local
npm run dev
```

The MCP server URL is `https://<worker-name>.<your-subdomain>.workers.dev/mcp`. Configure your MCP client to use that Streamable HTTP URL. The Worker is stateless between requests; memory data persists in D1.

## Notes

- `better-sqlite3` and the Node.js stdio transport are not used by the Worker; the MCP protocol is served over HTTP and data is stored in the `DB` D1 binding.
- The Worker currently has no authentication layer. Protect the endpoint with Cloudflare Access or add authentication before exposing it to untrusted clients.
- `npm run db:local` initializes Wrangler's local database. Use `npm run db:remote` only when you intend to change the Cloudflare D1 database.

## License

MIT
