
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import Database from "better-sqlite3";

const db = new Database("memory.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

const server = new McpServer({
  name: "codebase-memory-mcp",
  version: "1.0.0"
});

server.registerTool(
  "save_memory",
  {
    description: "Save project information to persistent memory",
    inputSchema: {
      project: z.string(),
      content: z.string()
    }
  },
  async ({ project, content }) => {
    const result = db.prepare(
      "INSERT INTO memories (project, content) VALUES (?, ?)"
    ).run(project, content);

    return {
      content: [{
        type: "text",
        text: `Memory saved successfully. ID: ${result.lastInsertRowid}`
      }]
    };
  }
);

server.registerTool(
  "search_memory",
  {
    description: "Search saved project memories",
    inputSchema: {
      project: z.string(),
      keyword: z.string()
    }
  },
  async ({ project, keyword }) => {
    const results = db.prepare(
      "SELECT * FROM memories WHERE project = ? AND content LIKE ? ORDER BY id DESC"
    ).all(project, `%${keyword}%`);

    return {
      content: [{
        type: "text",
        text: JSON.stringify(results, null, 2)
      }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
