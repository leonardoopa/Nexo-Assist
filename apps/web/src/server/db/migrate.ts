import { MIGRATIONS, type Migration } from "./migrations";
import type { Db } from "./types";

/** Applies the migrations that have not run yet, each in its own transaction. Safe to call on every start. */
export function migrate(db: Db, migrations: readonly Migration[] = MIGRATIONS): string[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const done = new Set(db.prepare("SELECT id FROM schema_migrations").pluck().all() as string[]);
  const applied: string[] = [];

  for (const migration of migrations) {
    if (done.has(migration.id)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
        migration.id,
        new Date().toISOString(),
      );
    })();
    applied.push(migration.id);
  }
  return applied;
}
