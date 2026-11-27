PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  device_id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  day_before INTEGER NOT NULL DEFAULT 1,
  departure INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES push_subscriptions(device_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('show_end', 'game_end', 'departure')),
  event_id TEXT,
  station_id TEXT,
  notify_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  UNIQUE (device_id, kind, event_id, station_id)
);

CREATE INDEX IF NOT EXISTS alerts_due_idx ON alerts(notify_at);

CREATE TABLE IF NOT EXISTS event_day_deliveries (
  device_id TEXT NOT NULL REFERENCES push_subscriptions(device_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  sent_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  PRIMARY KEY (device_id, event_id, event_date)
);
