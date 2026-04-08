CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  matricula TEXT,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'colaborador')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibilidade: adiciona coluna matricula em bases existentes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'matricula'
  ) THEN
    ALTER TABLE users ADD COLUMN matricula TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS prazo_requests (
  id BIGSERIAL PRIMARY KEY,
  demanda_id TEXT NOT NULL,
  requester_user_id UUID NOT NULL REFERENCES users(id),
  requester_email TEXT NOT NULL,
  prazo_atual TEXT NOT NULL,
  prazo_solicitado TEXT NOT NULL,
  motivo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_prazo_requests_demanda ON prazo_requests(demanda_id);
CREATE INDEX IF NOT EXISTS idx_prazo_requests_status ON prazo_requests(status);

-- Controle de notificações para evitar e-mails duplicados
CREATE TABLE IF NOT EXISTS demanda_notifications (
  demanda_id TEXT PRIMARY KEY,
  assignment_hash TEXT,
  assignment_sent_at TIMESTAMPTZ,
  last_reminder_key TEXT,
  last_reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demanda_notifications_assignment ON demanda_notifications(assignment_sent_at);
CREATE INDEX IF NOT EXISTS idx_demanda_notifications_reminder ON demanda_notifications(last_reminder_sent_at);

CREATE TABLE IF NOT EXISTS weekly_demand_reports (
  report_key TEXT PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary_json JSONB NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_demand_reports_sent_at ON weekly_demand_reports(sent_at);
CREATE INDEX IF NOT EXISTS idx_weekly_demand_reports_period_end ON weekly_demand_reports(period_end);
