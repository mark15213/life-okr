CREATE TABLE IF NOT EXISTS daily_records (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  cigarettes INT NOT NULL DEFAULT 0,
  exercises INT NOT NULL DEFAULT 0,
  pushup_balance INT NOT NULL DEFAULT 0,
  focus_minutes INT NOT NULL DEFAULT 0,
  tasks_completed INT NOT NULL DEFAULT 0,
  calories_burned INT NOT NULL DEFAULT 0,
  focus_minutes_ticktick INT NOT NULL DEFAULT 0,
  tasks_completed_ticktick INT NOT NULL DEFAULT 0,
  ticktick_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records(date DESC);

CREATE TABLE IF NOT EXISTS token_usage (
  date         DATE   NOT NULL,
  tool         TEXT   NOT NULL,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (date, tool)
);

CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(date DESC);

-- Per-category breakdown of the TickTick-synced focus minutes / completed tasks.
-- daily_records keeps the authoritative totals; these rows only say how they split.
-- No extra index: PRIMARY KEY (date, category) already gives a date-leading btree.
CREATE TABLE IF NOT EXISTS daily_category_stats (
  date            DATE NOT NULL REFERENCES daily_records(date) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN ('work','study','hustle','life','uncategorized')),
  focus_minutes   INT  NOT NULL DEFAULT 0,
  tasks_completed INT  NOT NULL DEFAULT 0,
  updated_at      TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (date, category)
);
