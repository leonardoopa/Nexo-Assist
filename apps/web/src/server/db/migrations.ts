export interface Migration {
  id: string;
  sql: string;
}

/** Append-only: a released migration is never edited, a new one is added instead. */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: "0001_conversations",
    sql: `
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  employee_email TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  department TEXT,
  status TEXT NOT NULL CHECK (status IN ('agent', 'awaiting_analyst', 'with_analyst', 'closed')),
  handoff_reason TEXT CHECK (handoff_reason IN ('employee_request', 'critical', 'overdue', 'low_confidence')),
  handoff_summary TEXT,
  handoff_group TEXT CHECK (handoff_group IN ('N1', 'N2')),
  handoff_at TEXT,
  handoff_respond_by TEXT,
  assignee_email TEXT,
  assignee_name TEXT,
  assumed_at TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  analyst_unread INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  last_message_preview TEXT,
  last_message_role TEXT CHECK (last_message_role IN ('user', 'assistant', 'analyst')),
  closed_at TEXT,
  closed_by TEXT CHECK (closed_by IN ('agent', 'analyst')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_conversations_employee ON conversations (employee_email);
CREATE INDEX idx_conversations_status ON conversations (status, updated_at);
-- An employee has at most one open conversation; closed ones stay as history.
CREATE UNIQUE INDEX idx_conversations_one_open ON conversations (employee_email) WHERE status != 'closed';

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id),
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'analyst', 'system')),
  author_email TEXT,
  author_name TEXT,
  content TEXT NOT NULL,
  parts TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE (conversation_id, seq)
);
`,
  },
];
