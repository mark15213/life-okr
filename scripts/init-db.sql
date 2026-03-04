CREATE TABLE IF NOT EXISTS daily_records (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  cigarettes INT NOT NULL DEFAULT 0,
  exercises INT NOT NULL DEFAULT 0,
  pushup_balance INT NOT NULL DEFAULT 0,
  focus_minutes INT NOT NULL DEFAULT 0,
  tasks_completed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records(date DESC);
