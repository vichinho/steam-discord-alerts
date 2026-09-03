import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { Database, SqlResult, Statement } from '../src/storage/repository.ts';
export class LocalDatabase implements Database {
  sqlite: DatabaseSync;
  constructor(path = ':memory:') {
    this.sqlite = new DatabaseSync(path);
    const migrations = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(migrations).filter(file => /^\d+.*\.sql$/.test(file)).sort()) this.sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  prepare(sql: string): Statement {
    const db = this.sqlite;
    let values: SQLInputValue[] = [];
    return {
      bind(...args: unknown[]) { values = args as SQLInputValue[]; return this; },
      async all<T>(): Promise<SqlResult<T>> {
        const statement = db.prepare(sql); const results = statement.all(...values) as T[];
        const changes = (db.prepare('SELECT changes() AS n').get() as { n: number }).n;
        return { success: true, results, meta: { changes } };
      },
      async run() { return this.all(); }
    };
  }
  async batch<T>(statements: Statement[]): Promise<SqlResult<T>[]> {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results: SqlResult<T>[] = [];
      for (const statement of statements) results.push(await statement.all<T>());
      this.sqlite.exec('COMMIT'); return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  close(): void { this.sqlite.close(); }
}
