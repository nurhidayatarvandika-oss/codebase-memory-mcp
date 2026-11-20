import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

interface D1Statement {
  bind(...values: Array<string | number | null>): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
}

interface D1Database {
  prepare(query: string): D1Statement;
}

interface Env {
  DB: D1Database;
}

const categories = [
  "personal",
  "work",
  "content",
  "task",
  "schedule",
  "preference",
  "project",
  "general",
] as const;

const importanceLevels = ["low", "normal", "high"] as const;

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function createMcpServer(db: D1Database) {
  const server = new McpServer({ name: "personal-ai-memory", version: "2.0.0" });

  // 1. Save a memory.
  server.registerTool(
    "save_memory",
    {
      description:
        "Save personal information, preferences, tasks, schedules, content ideas, or project context into persistent Cloudflare D1 memory.",
      inputSchema: {
        project: z.string().min(1).default("personal"),
        category: z.enum(categories).default("general"),
        content: z.string().min(1),
        tags: z.array(z.string()).default([]),
        importance: z.enum(importanceLevels).default("normal"),
      },
    },
    async ({ project, category, content, tags, importance }) => {
      const saved = await db
        .prepare(
          `INSERT INTO memories (project, category, content, tags, importance, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           RETURNING id`,
        )
        .bind(project, category, content, JSON.stringify(tags), importance)
        .first<{ id: number }>();

      return textResult({
        success: true,
        message: "Memory saved successfully.",
        id: saved?.id,
        project,
        category,
      });
    },
  );

  // 2. Search memories.
  server.registerTool(
    "search_memory",
    {
      description:
        "Search saved memories using a keyword and optional project or category filters.",
      inputSchema: {
        keyword: z.string().optional(),
        project: z.string().optional(),
        category: z.enum(categories).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ keyword, project, category, limit }) => {
      const conditions: string[] = [];
      const values: Array<string | number | null> = [];

      if (keyword) {
        conditions.push("content LIKE ?");
        values.push(`%${keyword}%`);
      }
      if (project) {
        conditions.push("project = ?");
        values.push(project);
      }
      if (category) {
        conditions.push("category = ?");
        values.push(category);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await db
        .prepare(`SELECT * FROM memories ${where} ORDER BY id DESC LIMIT ?`)
        .bind(...values, limit)
        .all();
      return textResult(result.results);
    },
  );

  // 3. List memories.
  server.registerTool(
    "list_memories",
    {
      description: "List saved memories, optionally filtered by project or category.",
      inputSchema: {
        project: z.string().optional(),
        category: z.enum(categories).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      },
    },
    async ({ project, category, limit }) => {
      const conditions: string[] = [];
      const values: Array<string | number | null> = [];

      if (project) {
        conditions.push("project = ?");
        values.push(project);
      }
      if (category) {
        conditions.push("category = ?");
        values.push(category);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await db
        .prepare(`SELECT * FROM memories ${where} ORDER BY id DESC LIMIT ?`)
        .bind(...values, limit)
        .all();
      return textResult(result.results);
    },
  );

  // 4. Update a memory.
  server.registerTool(
    "update_memory",
    {
      description: "Update the content, category, tags, or importance of an existing memory.",
      inputSchema: {
        id: z.number().int().positive(),
        content: z.string().min(1).optional(),
        category: z.enum(categories).optional(),
        tags: z.array(z.string()).optional(),
        importance: z.enum(importanceLevels).optional(),
      },
    },
    async ({ id, content, category, tags, importance }) => {
      const updates: string[] = [];
      const values: Array<string | number | null> = [];

      if (content !== undefined) {
        updates.push("content = ?");
        values.push(content);
      }
      if (category !== undefined) {
        updates.push("category = ?");
        values.push(category);
      }
      if (tags !== undefined) {
        updates.push("tags = ?");
        values.push(JSON.stringify(tags));
      }
      if (importance !== undefined) {
        updates.push("importance = ?");
        values.push(importance);
      }
      if (updates.length === 0) return textResult("No changes supplied.");

      updates.push("updated_at = CURRENT_TIMESTAMP");
      const result = await db
        .prepare(`UPDATE memories SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...values, id)
        .run();
      const changed = result.meta.changes > 0;

      return textResult({
        success: changed,
        message: changed ? "Memory updated." : "Memory ID not found.",
        id,
      });
    },
  );

  // 5. Delete a memory.
  server.registerTool(
    "delete_memory",
    {
      description:
        "Permanently delete a specific saved memory by its ID. Use only when deletion is requested.",
      inputSchema: { id: z.number().int().positive() },
    },
    async ({ id }) => {
      const result = await db
        .prepare("DELETE FROM memories WHERE id = ?")
        .bind(id)
        .run();
      const deleted = result.meta.changes > 0;
      return textResult({
        success: deleted,
        message: deleted ? "Memory deleted." : "Memory ID not found.",
        id,
      });
    },
  );

  // 6. Get a project's summary.
  server.registerTool(
    "get_project_summary",
    {
      description: "Retrieve a project's saved context and category counts.",
      inputSchema: { project: z.string().min(1) },
    },
    async ({ project }) => {
      const [memoryResult, countResult] = await Promise.all([
        db
          .prepare(
            `SELECT id, category, content, tags, importance, created_at, updated_at
             FROM memories WHERE project = ? ORDER BY id DESC`,
          )
          .bind(project)
          .all(),
        db
          .prepare(
            `SELECT category, COUNT(*) AS total FROM memories
             WHERE project = ? GROUP BY category`,
          )
          .bind(project)
          .all(),
      ]);
      return textResult({
        project,
        totalMemories: memoryResult.results.length,
        categoryCounts: countResult.results,
        memories: memoryResult.results,
      });
    },
  );

  // 7. Get global memory statistics.
  server.registerTool(
    "get_memory_stats",
    {
      description: "Show total saved memories and counts grouped by project and category.",
      inputSchema: {},
    },
    async () => {
      const [total, projectResult, categoryResult] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS total FROM memories").first(),
        db
          .prepare(
            `SELECT project, COUNT(*) AS total FROM memories
             GROUP BY project ORDER BY total DESC`,
          )
          .all(),
        db
          .prepare(
            `SELECT category, COUNT(*) AS total FROM memories
             GROUP BY category ORDER BY total DESC`,
          )
          .all(),
      ]);
      return textResult({
        total,
        byProject: projectResult.results,
        byCategory: categoryResult.results,
        database: "Cloudflare D1",
      });
    },
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") {
      return new Response("Not found. MCP endpoint: /mcp", { status: 404 });
    }

    if (!["GET", "POST", "DELETE"].includes(request.method)) {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, POST, DELETE" },
      });
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = createMcpServer(env.DB);
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};
