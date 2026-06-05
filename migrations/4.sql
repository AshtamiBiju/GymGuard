
CREATE TABLE notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  notification_type TEXT NOT NULL,
  target_date DATE NOT NULL,
  provider_message_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_notification_logs_unique
  ON notification_logs(user_id, notification_type, target_date);

CREATE INDEX idx_notification_logs_target_date
  ON notification_logs(target_date);
