import type { APIContext } from 'astro';
import { getRuntimeEnv } from './runtime-env';
import type { BusinessSettings } from './types';

export function getDb(context: Pick<APIContext, 'locals'>): D1Database {
  const db = getRuntimeEnv(context.locals).DB;
  if (!db) throw new Error('D1 binding DB is missing');
  return db;
}

export async function getBusinessSettings(db: D1Database): Promise<BusinessSettings> {
  const row = await db.prepare('SELECT * FROM business_settings WHERE id = 1').first<BusinessSettings>();
  if (!row) throw new Error('business_settings not initialized');
  return row;
}

export async function querySingle<T>(db: D1Database, sql: string, bindings: unknown[] = []): Promise<T> {
  const row = await db.prepare(sql).bind(...bindings).first<T>();
  if (!row) throw new Error('Record not found');
  return row;
}

export async function queryAll<T>(db: D1Database, sql: string, bindings: unknown[] = []): Promise<T[]> {
  const result = await db.prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}
