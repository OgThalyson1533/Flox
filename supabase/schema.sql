-- ═══════════════════════════════════════════════════════════════════
--  GROKFIN ELITE — COMPLETE SUPABASE SCHEMA
--  Consolidated schema containing base tables, security policies, 
--  triggers, Fingu banking integrations, and storage configurations.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 0. UTILITY FUNCTIONS
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- ─────────────────────────────────────────────────────────────────
-- 1. PROFILES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  nickname TEXT,
  display_name TEXT,
  handle TEXT UNIQUE,
  bio TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE TRIGGER update_profiles_modtime
BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- User Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, nickname, handle, onboarding_completed)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'GrokFin User'),
    'Navigator',
    '@' || LOWER(REPLACE(COALESCE(NEW.raw_user_meta_data->>'display_name', 'user'), ' ', '.')),
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────
-- 2. BANKS (Contas Bancárias)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.banks (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'conta_corrente'
               CHECK (type IN ('conta_corrente','conta_poupanca','investimentos','outros')),
  balance      NUMERIC(15, 2) NOT NULL DEFAULT 0,
  color        TEXT DEFAULT '#00f5ff',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own banks" ON public.banks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_banks_modtime
  BEFORE UPDATE ON public.banks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_banks_user_id ON public.banks(user_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. CARDS & INVOICES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  bank_id UUID REFERENCES public.banks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  flag TEXT,
  card_type TEXT DEFAULT 'credito',
  color TEXT,
  card_limit NUMERIC(12, 2) DEFAULT 0,
  closing_day INTEGER,
  due_day INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own cards" ON public.cards FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER update_cards_modtime
BEFORE UPDATE ON public.cards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_cards_bank_id ON public.cards(bank_id);

CREATE TABLE IF NOT EXISTS public.card_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  installments INTEGER DEFAULT 1,
  installment_current INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.card_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own card invoices"
  ON public.card_invoices FOR ALL
  USING (auth.uid() = user_id AND card_id IN (SELECT id FROM public.cards WHERE user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id AND card_id IN (SELECT id FROM public.cards WHERE user_id = auth.uid()));

CREATE TRIGGER update_card_invoices_modtime
BEFORE UPDATE ON public.card_invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_card_invoices_card_id ON public.card_invoices(card_id);

-- ─────────────────────────────────────────────────────────────────
-- 4. TRANSACTIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  bank_id UUID REFERENCES public.banks(id) ON DELETE SET NULL,
  card_id UUID,
  date DATE NOT NULL,
  due_date DATE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  
  is_paid BOOLEAN NOT NULL DEFAULT TRUE,
  account_type TEXT NOT NULL DEFAULT 'bank' CHECK (account_type IN ('bank', 'credit_card')),
  transaction_type TEXT NOT NULL DEFAULT 'entrada' CHECK (transaction_type IN ('entrada','saida','transferencia','reajuste')),
  installment_type TEXT NOT NULL DEFAULT 'avista' CHECK (installment_type IN ('avista','fixo_recorrente','parcelado')),
  payment TEXT,
  
  contact TEXT,
  cost_center TEXT,
  recurring_template BOOLEAN DEFAULT FALSE,
  installments INTEGER DEFAULT 1,
  installment_current INTEGER DEFAULT 1,
  notes TEXT,
  attachment_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_payment_method CHECK (payment IS NULL OR payment IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'conta', 'boleto')),
  CONSTRAINT chk_tx_desc_len CHECK (char_length(description) <= 200),
  CONSTRAINT chk_tx_notes_len CHECK (char_length(notes) <= 500)
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tx_select" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tx_insert" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tx_update" ON public.transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tx_delete" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_transactions_modtime
BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON public.transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_transactions_bank_id ON public.transactions(bank_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_type ON public.transactions(user_id, account_type);
CREATE INDEX IF NOT EXISTS idx_transactions_is_paid ON public.transactions(user_id, is_paid);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date ON public.transactions(user_id, transaction_type, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_card_id_date ON public.transactions(card_id, date DESC) WHERE card_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 5. BANK SUMMARY VIEW
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.bank_summary AS
SELECT
  b.id,
  b.user_id,
  b.name,
  b.type,
  b.color,
  b.balance AS initial_balance,
  COALESCE(SUM(CASE WHEN t.is_paid = TRUE AND t.account_type = 'bank' THEN t.amount ELSE 0 END), 0) AS computed_balance,
  COALESCE(COUNT(t.id), 0) AS transaction_count,
  b.created_at
FROM public.banks b
LEFT JOIN public.transactions t ON t.bank_id = b.id AND t.user_id = b.user_id
GROUP BY b.id, b.user_id, b.name, b.type, b.color, b.balance, b.created_at;

GRANT SELECT ON public.bank_summary TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 6. GOALS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  current_amount NUMERIC(12, 2) DEFAULT 0,
  target_amount NUMERIC(12, 2) NOT NULL,
  theme TEXT,
  custom_image TEXT,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals_select" ON public.goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "goals_insert" ON public.goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_update" ON public.goals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_delete" ON public.goals FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_goals_modtime
BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);

-- ─────────────────────────────────────────────────────────────────
-- 7. INVESTMENTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  subtype TEXT,
  current_value NUMERIC(12, 2) DEFAULT 0,
  cost_basis NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_select" ON public.investments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "inv_insert" ON public.investments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "inv_update" ON public.investments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "inv_delete" ON public.investments FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_investments_modtime
BEFORE UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────
-- 8. FIXED EXPENSES / INCOMES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fixed_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  execution_day INTEGER NOT NULL,
  is_income BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own fixed expenses" ON public.fixed_expenses FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER update_fixed_expenses_modtime
BEFORE UPDATE ON public.fixed_expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_fixed_expenses_user_id ON public.fixed_expenses(user_id);

-- ─────────────────────────────────────────────────────────────────
-- 9. BUDGETS (Envelopes)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budgets (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  limit_amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, category)
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own budgets" ON public.budgets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own budgets" ON public.budgets FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_budgets_modtime
BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────
-- 10. CUSTOM CATEGORIES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_categories (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name),
  CONSTRAINT chk_cat_name_len CHECK (char_length(name) >= 2 AND char_length(name) <= 50)
);

ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own custom categories" ON public.custom_categories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_custom_categories_user ON public.custom_categories(user_id);

-- ─────────────────────────────────────────────────────────────────
-- 11. EXCHANGE RATE CACHE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exchange_rate_cache (
  currency_code TEXT PRIMARY KEY,
  rate NUMERIC(16, 6) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exchange_rate_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read exchange rates" ON public.exchange_rate_cache FOR SELECT USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────
-- 12. STORAGE BUCKET: TRANSACTION ATTACHMENTS
-- ─────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('transaction-attachments', 'transaction-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Owners can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owners can upload/read attachments" ON storage.objects;
CREATE POLICY "Owners can upload/read attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'transaction-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Owners can read attachments" ON storage.objects;
CREATE POLICY "Owners can read attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'transaction-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ═══════════════════════════════════════════════════════════════════
-- END OF COMPLETE SCHEMA
-- ═══════════════════════════════════════════════════════════════════
