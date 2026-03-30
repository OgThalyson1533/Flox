-- ═══════════════════════════════════════════════════════════════════
--  GROKFIN ELITE V6 — SEED DE HOMOLOGAÇÃO
-- ═══════════════════════════════════════════════════════════════════
-- Execute este script caso queira preencher a base com dados fictícios.
-- Normalmente usado localmente ou no ambiente de staging.
-- IMPORTANTE: Ajuste o user_id para um auth.user válido criado no painel.

/* Exemplo de Inserção Básica para um Usuário 

DO $$
DECLARE
  v_user_id UUID := '00000000-0000-0000-0000-000000000000'; -- Substitua pelo ID real do Auth
  v_card_id UUID;
BEGIN
  -- Cria perfil caso não exista (o app cria no signup)
  INSERT INTO public.profiles (id, nickname, display_name, handle, bio)
  VALUES (v_user_id, 'Admin', 'Administrador Local', '@admin.test', 'Desenvolvedor em testes')
  ON CONFLICT (id) DO NOTHING;

  -- Insere uma transação
  INSERT INTO public.transactions (user_id, date, description, category, amount)
  VALUES (v_user_id, CURRENT_DATE, 'Salário Teste', 'Receita', 5000.00);

  -- Cria um cartão
  INSERT INTO public.cards (user_id, name, flag, color, card_limit, closing_day, due_day)
  VALUES (v_user_id, 'Cartão de Teste', 'mastercard', '#7c3aed', 10000, 15, 20)
  RETURNING id INTO v_card_id;

  -- Adiciona fatura
  INSERT INTO public.card_invoices (user_id, card_id, description, category, amount)
  VALUES (v_user_id, v_card_id, 'Almoço', 'Alimentação', 85.50);

  -- Adiciona Meta
  INSERT INTO public.goals (user_id, name, target_amount, current_amount)
  VALUES (v_user_id, 'Notebook Novo', 8000.00, 1500.00);

END $$;

*/
