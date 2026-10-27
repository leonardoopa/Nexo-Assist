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
  {
    id: "0002_agent",
    sql: `
-- Pending actions the employee must confirm before anything is created or changed.
CREATE TABLE drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations (id),
  kind TEXT NOT NULL CHECK (kind IN ('ticket_create', 'ticket_update', 'ticket_reopen')),
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'superseded')),
  message_id TEXT REFERENCES messages (id),
  ticket_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX idx_drafts_conversation ON drafts (conversation_id, status);

-- What the agent understood, did and why, one record per assistant message.
CREATE TABLE agent_decisions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id),
  message_id TEXT NOT NULL UNIQUE REFERENCES messages (id),
  intent TEXT NOT NULL,
  confidence REAL NOT NULL,
  model TEXT,
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_decisions_conversation ON agent_decisions (conversation_id, created_at);

-- Tickets a conversation created, changed, transferred or looked at.
CREATE TABLE conversation_tickets (
  conversation_id TEXT NOT NULL REFERENCES conversations (id),
  ticket_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('created', 'updated', 'reopened', 'transferred', 'consulted')),
  at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, ticket_id, relation)
);
`,
  },
];
