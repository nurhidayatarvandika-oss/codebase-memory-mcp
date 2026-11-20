
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Simpan database di folder utama proyek, baik dijalankan dari src maupun dist.
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(currentDir, "../memory.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL DEFAULT 'personal',
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migrasi agar database lama tetap bisa digunakan.
const columns = db.prepare("PRAGMA table_info(memories)").all() as
  Array<{ name: string }>;

const columnNames = columns.map((column) => column.name);

if (!columnNames.includes("category")) {
  db.exec("ALTER TABLE memories ADD COLUMN category TEXT NOT NULL DEFAULT 'general'");
}

if (!columnNames.includes("tags")) {
  db.exec("ALTER TABLE memories ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
}

if (!columnNames.includes("importance")) {
  db.exec("ALTER TABLE memories ADD COLUMN importance TEXT NOT NULL DEFAULT 'normal'");
}

if (!columnNames.includes("updated_at")) {
  db.exec("ALTER TABLE memories ADD COLUMN updated_at TEXT");
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
`);

const categories = [
  "personal",
  "work",
  "content",
  "task",
  "schedule",
  "preference",
  "project",
  "general"
] as const;

const importanceLevels = ["low", "normal", "high"] as const;

const server = new McpServer({
  name: "personal-ai-memory",
  version: "2.0.0"
});

function textResult(value: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2)
    }]
  };
}

// 1. Menyimpan ingatan
server.registerTool(
  "save_memory",
  {
    description: "Save personal information, preferences, tasks, schedules, content ideas, or project context into persistent local memory.",
    inputSchema: {
      project: z.string().min(1).default("personal"),
      category: z.enum(categories).default("general"),
      content: z.string().min(1),
      tags: z.array(z.string()).default([]),
      importance: z.enum(importanceLevels).default("normal")
    }
  },
  async ({ project, category, content, tags, importance }) => {
    const result = db.prepare(`
      INSERT INTO memories
      (project, category, content, tags, importance, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      project,
      category,
      content,
      JSON.stringify(tags),
      importance
    );

    return textResult({
      success: true,
      message: "Memory saved successfully.",
      id: Number(result.lastInsertRowid),
      project,
      category
    });
  }
);

// 2. Mencari ingatan
server.registerTool(
  "search_memory",
  {
    description: "Search saved memories using a keyword and optional project or category filters.",
    inputSchema: {
      keyword: z.string().optional(),
      project: z.string().optional(),
      category: z.enum(categories).optional(),
      limit: z.number().int().min(1).max(100).default(20)
    }
  },
  async ({ keyword, project, category, limit }) => {
    const conditions: string[] = [];
    const params: any[] = [];

    if (keyword) {
      conditions.push("content LIKE ?");
      params.push(`%${keyword}%`);
    }

    if (project) {
      conditions.push("project = ?");
      params.push(project);
    }

    if (category) {
      conditions.push("category = ?");
      params.push(category);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const results = db.prepare(`
      SELECT * FROM memories
      ${where}
      ORDER BY id DESC
      LIMIT ?
    `).all(...params, limit);

    return textResult(results);
  }
);

// 3. Melihat daftar ingatan
server.registerTool(
  "list_memories",
  {
    description: "List saved memories, optionally filtered by project or category.",
    inputSchema: {
      project: z.string().optional(),
      category: z.enum(categories).optional(),
      limit: z.number().int().min(1).max(100).default(30)
    }
  },
  async ({ project, category, limit }) => {
    const conditions: string[] = [];
    const params: any[] = [];

    if (project) {
      conditions.push("project = ?");
      params.push(project);
    }

    if (category) {
      conditions.push("category = ?");
      params.push(category);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const results = db.prepare(`
      SELECT * FROM memories
      ${where}
      ORDER BY id DESC
      LIMIT ?
    `).all(...params, limit);

    return textResult(results);
  }
);

// 4. Memperbarui ingatan
server.registerTool(
  "update_memory",
  {
    description: "Update the content, category, tags, or importance of an existing memory.",
    inputSchema: {
      id: z.number().int().positive(),
      content: z.string().min(1).optional(),
      category: z.enum(categories).optional(),
      tags: z.array(z.string()).optional(),
      importance: z.enum(importanceLevels).optional()
    }
  },
  async ({ id, content, category, tags, importance }) => {
    const updates: string[] = [];
    const params: any[] = [];

    if (content !== undefined) {
      updates.push("content = ?");
      params.push(content);
    }

    if (category !== undefined) {
      updates.push("category = ?");
      params.push(category);
    }

    if (tags !== undefined) {
      updates.push("tags = ?");
      params.push(JSON.stringify(tags));
    }

    if (importance !== undefined) {
      updates.push("importance = ?");
      params.push(importance);
    }

    if (updates.length === 0) {
      return textResult("No changes supplied.");
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);

    const result = db.prepare(`
      UPDATE memories
      SET ${updates.join(", ")}
      WHERE id = ?
    `).run(...params);

    return textResult({
      success: result.changes > 0,
      message: result.changes > 0
        ? "Memory updated."
        : "Memory ID not found.",
      id
    });
  }
);

// 5. Menghapus ingatan berdasarkan ID
server.registerTool(
  "delete_memory",
  {
    description: "Permanently delete a specific saved memory by its ID. Use only when deletion is requested.",
    inputSchema: {
      id: z.number().int().positive()
    }
  },
  async ({ id }) => {
    const result = db.prepare(
      "DELETE FROM memories WHERE id = ?"
    ).run(id);

    return textResult({
      success: result.changes > 0,
      message: result.changes > 0
        ? "Memory deleted."
        : "Memory ID not found.",
      id
    });
  }
);

// 6. Ringkasan ingatan suatu proyek
server.registerTool(
  "get_project_summary",
  {
    description: "Retrieve a project's saved context and category counts.",
    inputSchema: {
      project: z.string().min(1)
    }
  },
  async ({ project }) => {
    const memories = db.prepare(`
      SELECT id, category, content, tags, importance, created_at, updated_at
      FROM memories
      WHERE project = ?
      ORDER BY id DESC
    `).all(project);

    const counts = db.prepare(`
      SELECT category, COUNT(*) AS total
      FROM memories
      WHERE project = ?
      GROUP BY category
    `).all(project);

    return textResult({
      project,
      totalMemories: memories.length,
      categoryCounts: counts,
      memories
    });
  }
);

// 7. Statistik seluruh ingatan
server.registerTool(
  "get_memory_stats",
  {
    description: "Show total saved memories and counts grouped by project and category.",
    inputSchema: {}
  },
  async () => {
    const total = db.prepare(
      "SELECT COUNT(*) AS total FROM memories"
    ).get();

    const byProject = db.prepare(`
      SELECT project, COUNT(*) AS total
      FROM memories
      GROUP BY project
      ORDER BY total DESC
    `).all();

    const byCategory = db.prepare(`
      SELECT category, COUNT(*) AS total
      FROM memories
      GROUP BY category
      ORDER BY total DESC
    `).all();

    return textResult({
      total,
      byProject,
      byCategory,
      database: dbPath
    });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
