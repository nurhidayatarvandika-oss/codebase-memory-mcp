import worker from "../src/index.js";

// Cloudflare Pages routes this function at /mcp. Reuse the same stateless
// Streamable HTTP MCP handler used by the standalone Worker entry point.
export const onRequest = (context: {
  request: Request;
  env: Parameters<typeof worker.fetch>[1];
}): Promise<Response> => worker.fetch(context.request, context.env);
