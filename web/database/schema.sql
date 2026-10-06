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
  conference_can_add_call INTEGER,
  conferenceable_count INTEGER,
  active_call_count INTEGER,
  conference_status TEXT NOT NULL DEFAULT 'unknown',
  conference_checked_at TEXT,
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
  recording_file TEXT,
  media_status TEXT NOT NULL DEFAULT 'not_connected',
  media_pin TEXT,
  media_bridge_number TEXT,
  media_requested_at TEXT,
  media_connected_at TEXT,
  media_gateway_connected_at TEXT,
  media_merge_requested_at TEXT,
  media_merge_confirmed_at TEXT,
  media_disconnected_at TEXT,
  media_error TEXT,
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

INSERT OR IGNORE INTO settings(setting_key,setting_value,updated_at)
VALUES('media_bridge_enabled','0',datetime('now'));

INSERT OR IGNORE INTO settings(setting_key,setting_value,updated_at)
VALUES('media_bridge_number','',datetime('now'));

INSERT OR IGNORE INTO settings(setting_key,setting_value,updated_at)
VALUES('media_auto_merge','1',datetime('now'));


CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS voice_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gemini_live',
  model TEXT NOT NULL DEFAULT 'gemini-3.8-live',
  voice_name TEXT NOT NULL DEFAULT 'Puck',
  system_prompt TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_voice_agents_tenant
ON voice_agents(tenant_id,is_active);

CREATE TABLE IF NOT EXISTS ai_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  device_id INTEGER NOT NULL,
  call_id INTEGER NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared',
  client_token_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  voice_name TEXT NOT NULL,
  input_transcript TEXT,
  output_transcript TEXT,
  last_error TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(agent_id) REFERENCES voice_agents(id),
  FOREIGN KEY(device_id) REFERENCES devices(id),
  FOREIGN KEY(call_id) REFERENCES calls(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_call
ON ai_sessions(call_id,status);
