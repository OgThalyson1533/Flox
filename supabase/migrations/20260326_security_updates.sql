-- GrokFin - Migração incremental de segurança (aplicar em banco existente)
-- Data: 2026-03-26

BEGIN;

-- 1) exchange_rate_cache: habilitar RLS e permitir leitura para autenticados
ALTER TABLE IF EXISTS public.exchange_rate_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read exchange rates" ON public.exchange_rate_cache;
CREATE POLICY "Authenticated users can read exchange rates"
  ON public.exchange_rate_cache
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2) card_invoices: policy mais restritiva (valida user_id + vínculo com cards do auth.uid)
DROP POLICY IF EXISTS "Users can manage own card invoices" ON public.card_invoices;
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

-- 3) Storage bucket + policies de anexos
INSERT INTO storage.buckets (id, name, public)
VALUES ('transaction-attachments', 'transaction-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Remove nomes antigos e recria policies atuais
DROP POLICY IF EXISTS "Owners can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owners can upload/read attachments" ON storage.objects;
CREATE POLICY "Owners can upload/read attachments"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'transaction-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Owners can read attachments" ON storage.objects;
CREATE POLICY "Owners can read attachments"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'transaction-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4) handle_new_user com search_path explícito
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
