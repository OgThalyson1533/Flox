-- ═══════════════════════════════════════════════════════════════════
--  GROKFIN — Migration de Auditoria de Segurança + Custom Categories
--  Data: 2026-03-26
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. TABELA: custom_categories
--    Categorias personalizadas por usuário, isoladas por RLS.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_categories (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own custom categories"
  ON public.custom_categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_custom_categories_user ON public.custom_categories(user_id);

-- ─────────────────────────────────────────────────────────────────
-- 2. SEGURANÇA: Políticas RLS granulares (separar SELECT / INSERT /
--    UPDATE / DELETE) nas tabelas principais.
--    O padrão FOR ALL é funcional, mas políticas explícitas são
--    recomendadas para auditoria e conformidade.
-- ─────────────────────────────────────────────────────────────────

-- transactions
DROP POLICY IF EXISTS "Users can manage own transactions" ON public.transactions;
CREATE POLICY "tx_select" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tx_insert" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tx_update" ON public.transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tx_delete" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

-- goals
DROP POLICY IF EXISTS "Users can manage own goals" ON public.goals;
CREATE POLICY "goals_select" ON public.goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "goals_insert" ON public.goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_update" ON public.goals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_delete" ON public.goals FOR DELETE USING (auth.uid() = user_id);

-- investments
DROP POLICY IF EXISTS "Users can manage own investments" ON public.investments;
CREATE POLICY "inv_select" ON public.investments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "inv_insert" ON public.investments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "inv_update" ON public.investments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "inv_delete" ON public.investments FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. SEGURANÇA: Campo de pagamento na tabela transactions
--    Valida que o valor do campo 'payment' é um dos permitidos.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS chk_payment_method;

ALTER TABLE public.transactions
  ADD CONSTRAINT chk_payment_method CHECK (
    payment IS NULL OR payment IN (
      'pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'conta', 'boleto'
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 4. SEGURANÇA: Limita tamanho de campos de texto para prevenir
--    abuso de armazenamento.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS chk_tx_desc_len,
  DROP CONSTRAINT IF EXISTS chk_tx_notes_len;
ALTER TABLE public.transactions
  ADD CONSTRAINT chk_tx_desc_len  CHECK (char_length(description) <= 200),
  ADD CONSTRAINT chk_tx_notes_len CHECK (char_length(notes) <= 500);

ALTER TABLE public.custom_categories
  DROP CONSTRAINT IF EXISTS chk_cat_name_len;
ALTER TABLE public.custom_categories
  ADD CONSTRAINT chk_cat_name_len CHECK (char_length(name) >= 2 AND char_length(name) <= 50);

-- ─────────────────────────────────────────────────────────────────
-- 5. SEGURANÇA: handle_new_user com search_path explícito
--    (proteção contra SQL injection via search_path hijacking)
-- ─────────────────────────────────────────────────────────────────
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

COMMIT;
