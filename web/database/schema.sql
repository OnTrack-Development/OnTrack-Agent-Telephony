CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone_number TEXT,
  platform TEXT NOT NULL DEFAULT 'android',
  manufacturer TEXT,
  model TEXT,
  app_version TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'online',
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS pairing_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS phone_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  contact_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  phone_key TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
  UNIQUE(device_id, phone_key)
);

CREATE INDEX IF NOT EXISTS idx_phone_contacts_device ON phone_contacts(device_id);
CREATE INDEX IF NOT EXISTS idx_phone_contacts_key ON phone_contacts(device_id, phone_key);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  scenario TEXT NOT NULL,
  agent_name TEXT NOT NULL DEFAULT 'Voice Agent',
  device_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY(device_id) REFERENCES devices(id)
);

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  phone_number TEXT NOT NULL,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  contact_id INTEGER,
  device_id INTEGER NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  outcome TEXT,
  started_at TEXT,
  answered_at TEXT,
  ended_at TEXT,
  duration_seconds INTEGER,
  transcript TEXT,
  ai_summary TEXT,
  notes TEXT,
  action_result TEXT,
  recording_status TEXT NOT NULL DEFAULT 'not_recorded',
  recording_url TEXT,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY(contact_id) REFERENCES campaign_contacts(id),
  FOREIGN KEY(device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_queue ON campaign_contacts(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_calls_device_status ON calls(device_id, status);

CREATE TABLE IF NOT EXISTS settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO settings(setting_key,setting_value,updated_at)
VALUES('incoming_mode','ai',datetime('now'));
