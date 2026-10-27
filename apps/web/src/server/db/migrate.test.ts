import { describe, expect, it } from "vitest";

import { migrate } from "./migrate";
import { MIGRATIONS } from "./migrations";
import { openDatabase } from "./open";

describe("migrate", () => {
  it("creates the whole schema on a fresh database", () => {
    const db = openDatabase(":memory:");
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
    expect(tables).toEqual(
      expect.arrayContaining(["conversations", "messages", "drafts", "agent_decisions", "conversation_tickets", "schema_migrations"]),
    );
  });

  it("runs each migration once", () => {
    const db = openDatabase(":memory:");
    expect(migrate(db)).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) FROM schema_migrations").pluck().get()).toBe(MIGRATIONS.length);
  });

  it("rolls a failing migration back and keeps the earlier ones", () => {
    const db = openDatabase(":memory:");
    expect(() =>
      migrate(db, [...MIGRATIONS, { id: "9999_broken", sql: "CREATE TABLE ok (id TEXT); CREATE TABLE ok (id TEXT);" }]),
    ).toThrow();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'ok'").get()).toBeUndefined();
    expect(db.prepare("SELECT id FROM schema_migrations ORDER BY id").pluck().all()).toEqual(MIGRATIONS.map((migration) => migration.id));
  });
});
