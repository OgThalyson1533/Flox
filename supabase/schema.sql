-- ═══════════════════════════════════════════════════════════════════
--  GROKFIN ELITE V6 — SUPABASE SCHEMA (CORRIGIDO)
-- ═══════════════════════════════════════════════════════════════════

-- Função genérica para atualizar a coluna updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- ═══════════════════════════════════════════════════════════════════
-- 1. PROFILES
-- Estende o auth.users padrão com dados customizados.
-- ═══════════════════════════════════════════════════════════════════
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
-- [FIX SQL #1] Policy de INSERT ausente: sem ela, novos usuários não conseguiam
-- criar seu próprio perfil (o upsert inicial falhava silenciosamente com RLS).
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE TRIGGER update_profiles_modtime
BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════
-- 2. TRANSACTIONS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL, -- Valores positivos para receita, negativos para despesa
  payment TEXT,
  card_id UUID,
  recurring_template BOOLEAN DEFAULT FALSE,
  installments INTEGER DEFAULT 1,
  installment_current INTEGER DEFAULT 1,
  -- [FIX TX #1] Campo de observações livre para notas sobre a transação
  notes TEXT,
  -- [FIX TX #2] URL do anexo (comprovante) armazenado no Supabase Storage
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER update_transactions_modtime
BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ═══════════════════════════════════════════════════════════════════
-- 3. CARDS & INVOICES
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
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
  -- [FIX SQL #2] Coluna updated_at e trigger ausentes em card_invoices.
  -- Sem ela, atualizações de faturas não podiam ser rastreadas e o upsert
  -- não tinha como detectar conflitos de tempo para multi-device sync.
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.card_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own card invoices"
  ON public.card_invoices
  FOR ALL
  USING (
    auth.uid() = user_id
    AND card_id IN (SELECT id FROM public.cards WHERE user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND card_id IN (SELECT id FROM public.cards WHERE user_id = auth.uid())
  );

-- [FIX SQL #2] Trigger correspondente ao updated_at adicionado acima.
CREATE TRIGGER update_card_invoices_modtime
BEFORE UPDATE ON public.card_invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════
-- 4. GOALS (Metas)
-- ═══════════════════════════════════════════════════════════════════
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
CREATE POLICY "Users can manage own goals" ON public.goals FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER update_goals_modtime
BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════
-- 5. INVESTMENTS
-- ═══════════════════════════════════════════════════════════════════
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
CREATE POLICY "Users can manage own investments" ON public.investments FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER update_investments_modtime
BEFORE UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════
-- 6. FIXED EXPENSES / INCOMES
-- ═══════════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════════
-- 7. BUDGETS (Envelopes)
-- ═══════════════════════════════════════════════════════════════════
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

CREATE TRIGGER update_budgets_modtime
BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════
-- 8. EXCHANGE RATE CACHE (Uso Global / Público Opcional)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.exchange_rate_cache (
  currency_code TEXT PRIMARY KEY,
  rate NUMERIC(16, 6) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.exchange_rate_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read exchange rates"
  ON public.exchange_rate_cache
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════════
-- SCRIPT DE MIGRAÇÃO (rodar apenas em banco existente, não em novo)
-- Se você já tem o schema antigo aplicado, execute os comandos abaixo
-- separadamente para aplicar apenas os fixes sem recriar tabelas:
-- ═══════════════════════════════════════════════════════════════════
-- [FIX SQL #1] Adicionar policy INSERT em profiles (se não existir):
--   CREATE POLICY "Users can insert own profile" ON public.profiles
--     FOR INSERT WITH CHECK (auth.uid() = id);
--
--
-- [FIX SQL #2] Adicionar updated_at + trigger em card_invoices (se não existir):
--   ALTER TABLE public.card_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
--   CREATE TRIGGER update_card_invoices_modtime
--     BEFORE UPDATE ON public.card_invoices FOR EACH ROW
--     EXECUTE FUNCTION update_updated_at_column();
--
-- [FIX SQL #3] Adicionar novos campos em transactions (se não existir):
--   ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment TEXT;
--   ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS card_id UUID;
--   ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS recurring_template BOOLEAN DEFAULT FALSE;
--   ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installments INTEGER DEFAULT 1;
--   ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installment_current INTEGER DEFAULT 1;
--
-- [FIX SQL #4] Adicionar onboarding flag no perfil (se não existir):
--   ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;



-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION SCRIPT v2 — Aplicar em banco existente
-- Execute cada bloco separadamente no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- [MIGRATION v2 #1] Adicionar campo used_amount em cards para evitar recálculo
-- (opcional — o sync agora recalcula das faturas automaticamente)
-- ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS used_amount NUMERIC(12,2) DEFAULT 0;

-- [MIGRATION v2 #2] Garantir que budgets tem policy de INSERT (novo schema já tem)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'budgets' AND policyname = 'Users can insert own budgets'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own budgets" ON public.budgets FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- [MIGRATION v2 #3] Índices de performance para queries frequentes
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON public.transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_card_invoices_card_id ON public.card_invoices(card_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_fixed_expenses_user_id ON public.fixed_expenses(user_id);

-- ═══════════════════════════════════════════════════════════════════
-- [MIGRATION v2 #5] Adicionar campos notes e attachment_url em transactions
-- Execute em banco existente para habilitar observações e anexos no formulário
-- ═══════════════════════════════════════════════════════════════════

-- Adiciona campo de observações livres na transação
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS notes TEXT;

-- Adiciona URL pública do comprovante enviado ao Supabase Storage
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- ── Supabase Storage: bucket para anexos de transações ──────────────────────
-- Execute no SQL Editor do Supabase para criar o bucket (se ainda não existir).
-- Depois acesse Storage → transaction-attachments → Policies e defina:
--   • INSERT: auth.uid() = owner  (usuário só sobe os próprios arquivos)
--   • SELECT: auth.uid() = owner  (ou público se quiser URLs abertas)
--
INSERT INTO storage.buckets (id, name, public)
VALUES ('transaction-attachments', 'transaction-attachments', false)
ON CONFLICT (id) DO NOTHING;
--
CREATE POLICY "Owners can upload/read attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'transaction-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
--
CREATE POLICY "Owners can read attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'transaction-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- [MIGRATION v2 #4] Trigger automático para criar perfil ao registrar novo usuário
-- Evita que o upsert de perfil falhe se o usuário nunca acessou o app depois do signup
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


-- ═══════════════════════════════════════════════════════════════════
-- 9. CUSTOM CATEGORIES (Categorias personalizadas por usuário)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.custom_categories (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own custom categories"
  ON public.custom_categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_custom_categories_user ON public.custom_categories(user_id);
