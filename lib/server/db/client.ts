import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | null = null;

export function getDb(): Db {
  if (!cached) {
    const sql = neon(process.env.DATABASE_URL!);
    cached = drizzle(sql, { schema });
  }
  return cached;
}
