
CREATE TABLE membership (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  start_date DATE,
  expiry_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_membership_user_id ON membership(user_id);
CREATE INDEX idx_membership_expiry ON membership(expiry_date);
