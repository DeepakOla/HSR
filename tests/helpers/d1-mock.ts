import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export interface CreateMockD1Options {
  migrationsDir?: string;
  applyMigrations?: boolean;
}

function normalizeParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isReadQuery(sql: string): boolean {
  const stripped = sql.trim().replace(/^(\/\*[\s\S]*?\*\/|--[^\n]*\n*)+/, '').trim();
  if (/^SELECT\b/i.test(stripped) || /^PRAGMA\b/i.test(stripped) || /^EXPLAIN\b/i.test(stripped)) {
    return true;
  }
  if (/^WITH\b/i.test(stripped) && !/\b(INSERT|UPDATE|DELETE)\b/i.test(stripped)) {
    return true;
  }
  return false;
}

export class MockD1PreparedStatement implements D1PreparedStatement {
  constructor(
    private rawDb: DatabaseSync,
    private sql: string,
    private params: unknown[] = []
  ) {}

  bind(...values: unknown[]): MockD1PreparedStatement {
    const normalized = values.map((v) => normalizeParam(v));
    return new MockD1PreparedStatement(this.rawDb, this.sql, normalized);
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const stmt = this.rawDb.prepare(this.sql);
    const row = stmt.get(...(this.params as any[])) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName) return (row[colName] ?? null) as T;
    return row as T;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const stmt = this.rawDb.prepare(this.sql);
    const results = stmt.all(...(this.params as any[])) as T[];
    return {
      results,
      success: true,
      meta: {
        changes: 0,
        duration: 0,
        served_by: 'v3-sqlite-mock',
      },
    };
  }

  async run<T = unknown>(): Promise<D1Response> {
    const stmt = this.rawDb.prepare(this.sql);
    const info = stmt.run(...(this.params as any[]));
    return {
      success: true,
      meta: {
        changes: Number(info.changes),
        last_row_id: Number(info.lastInsertRowid),
        duration: 0,
        served_by: 'v3-sqlite-mock',
      },
    };
  }

  async raw<T = unknown>(): Promise<T[]> {
    const stmt = this.rawDb.prepare(this.sql);
    const rows = stmt.all(...(this.params as any[])) as Record<string, unknown>[];
    return rows.map((r) => Object.values(r)) as T[];
  }

  getSQL(): string {
    return this.sql;
  }

  getParams(): unknown[] {
    return this.params;
  }
}

export class MockD1Database implements D1Database {
  constructor(private rawDb: DatabaseSync) {}

  prepare(query: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this.rawDb, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    this.rawDb.exec('BEGIN IMMEDIATE');
    try {
      for (const statement of statements) {
        const stmt = statement as MockD1PreparedStatement;
        const sql = stmt.getSQL().trim();
        const prepared = this.rawDb.prepare(sql);
        const params = stmt.getParams() as any[];

        if (isReadQuery(sql)) {
          const rows = prepared.all(...params) as T[];
          results.push({
            results: rows,
            success: true,
            meta: {
              changes: 0,
              duration: 0,
              served_by: 'v3-sqlite-mock',
            },
          });
        } else {
          const runResult = prepared.run(...params);
          results.push({
            success: true,
            meta: {
              changes: Number(runResult.changes),
              last_row_id: Number(runResult.lastInsertRowid),
              duration: 0,
              served_by: 'v3-sqlite-mock',
            },
          });
        }
      }
      this.rawDb.exec('COMMIT');
      return results;
    } catch (error) {
      this.rawDb.exec('ROLLBACK');
      throw error;
    }
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.rawDb.exec(query);
    return {
      count: 0,
      duration: 0,
    };
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error('dump() not supported in in-memory D1 mock');
  }

  close(): void {
    this.rawDb.close();
  }

  getRaw(): DatabaseSync {
    return this.rawDb;
  }
}

/**
 * Creates a fresh, isolated in-memory D1 database with all migrations applied.
 */
export function createMockD1(options: CreateMockD1Options = {}): MockD1Database {
  const rawDb = new DatabaseSync(':memory:');
  rawDb.exec('PRAGMA foreign_keys = ON;');

  const applyMigrations = options.applyMigrations ?? true;
  if (applyMigrations) {
    const migrationsDir = options.migrationsDir ?? path.resolve(process.cwd(), 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.sql'))
        .sort();

      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        rawDb.exec(sql);
      }
    }
  }

  return new MockD1Database(rawDb);
}
