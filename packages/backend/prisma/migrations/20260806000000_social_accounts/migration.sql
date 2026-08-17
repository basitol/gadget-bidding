-- Store social provider accounts (Google / Apple) linked to a user so users
-- can sign in with the same provider account repeatedly without a password.
CREATE TABLE social_accounts (
  id                UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id           UUID NOT NULL,
  provider          VARCHAR(20) NOT NULL,
  provider_user_id  VARCHAR(255) NOT NULL,
  email             VARCHAR(255),
  created_at        TIMESTAMP(6) DEFAULT now(),
  CONSTRAINT uq_social_accounts_provider_user UNIQUE (provider, provider_user_id),
  CONSTRAINT fk_social_accounts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_social_accounts_user ON social_accounts (user_id);
