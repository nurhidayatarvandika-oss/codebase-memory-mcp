# Codebase Memory MCP — Cloudflare Pages + D1

Persistent MCP memory service running as a Cloudflare Pages Function, using Cloudflare D1 for storage. The MCP Streamable HTTP endpoint is `/mcp`; the seven tools are `save_memory`, `search_memory`, `list_memories`, `update_memory`, `delete_memory`, `get_project_summary`, and `get_memory_stats`.

## Cloudflare Pages setup (browser dashboard)

1. In **Workers & Pages**, connect this GitHub repository to a Pages project and select the `cloudflare-d1-worker` branch (or merge these changes into the branch Pages deploys).
2. Set the build command to `npm run build` and the build output directory to `public`.
3. Create a D1 database named `codebase-memory` under **Storage & Databases → D1**.
4. Open the Pages project **Settings → Functions → D1 database bindings** (the exact menu label can vary), add a binding named `DB`, and select the `codebase-memory` database. Configure the binding for production and preview if both environments will be used.
5. Initialize the D1 schema by running the SQL in `migrations/0001_init.sql` in the D1 dashboard console, then redeploy the Pages project.

The D1 database ID is set by selecting the database in the dashboard binding. There is intentionally no placeholder database ID in `wrangler.toml`; the Pages project binding supplies `env.DB` at runtime.

After deployment, configure your MCP client to connect to `https://<pages-project>.pages.dev/mcp`.

## Notes

- This is a Pages Function project, not a static-only Pages site and not a standalone Worker deployment. The `functions/mcp.ts` file handles `/mcp` and delegates to the shared MCP implementation.
- `better-sqlite3` and the Node.js stdio transport are not used in this deployment.
- The endpoint has no authentication by default. Restrict access with Cloudflare Access or add authentication before exposing it to untrusted clients.
- Avoid using Pages' generic static asset deployment or the `wrangler deploy` command; use the Pages Git integration or `wrangler pages deploy ./public`.

## License

MIT
