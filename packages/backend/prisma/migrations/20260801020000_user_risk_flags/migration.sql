CREATE TABLE IF NOT EXISTS user_risk_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  flag_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  reason TEXT NOT NULL,
  signal_count INTEGER NOT NULL DEFAULT 1,
  last_signal_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP(6),
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, flag_type)
);

CREATE INDEX IF NOT EXISTS idx_user_risk_flags_user
  ON user_risk_flags(user_id, resolved_at, last_signal_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_risk_flags_type
  ON user_risk_flags(flag_type, resolved_at, last_signal_at DESC);
