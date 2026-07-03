
-- =========================================================================
-- WASSHA SACCOS: PRODUCTION HARDENING (non-breaking, additive)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Financial integrity CHECK constraints (NOT VALID first, then validate)
-- -------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='loans_amounts_positive') THEN
    ALTER TABLE public.loans
      ADD CONSTRAINT loans_amounts_positive CHECK (
        amount_requested > 0
        AND (amount_approved IS NULL OR amount_approved > 0)
        AND term_months > 0 AND term_months <= 120
        AND (interest_rate IS NULL OR (interest_rate >= 0 AND interest_rate <= 100))
        AND outstanding_balance >= 0
        AND COALESCE(fee_outstanding,0) >= 0
        AND COALESCE(fee_amount,0) >= 0
        AND (amount_approved IS NULL OR outstanding_balance <= amount_approved * 1.5)
      ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transactions_amount_positive') THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_amount_positive CHECK (amount > 0) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='loan_policies_sane') THEN
    ALTER TABLE public.loan_policies
      ADD CONSTRAINT loan_policies_sane CHECK (
        interest_rate >= 0 AND interest_rate <= 100
        AND savings_multiplier >= 0 AND savings_multiplier <= 20
        AND max_term_months > 0 AND max_term_months <= 120
        AND min_savings >= 0
        AND min_membership_months >= 0
        AND COALESCE(late_penalty_rate,0) >= 0 AND COALESCE(late_penalty_rate,0) <= 100
        AND COALESCE(processing_fee_rate,0) >= 0 AND COALESCE(processing_fee_rate,0) <= 100
      ) NOT VALID;
  END IF;
END $$;

-- Try to validate; ignore if legacy rows fail (keeps migration idempotent)
DO $$ BEGIN BEGIN ALTER TABLE public.loans VALIDATE CONSTRAINT loans_amounts_positive; EXCEPTION WHEN check_violation THEN NULL; END; END $$;
DO $$ BEGIN BEGIN ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_amount_positive; EXCEPTION WHEN check_violation THEN NULL; END; END $$;
DO $$ BEGIN BEGIN ALTER TABLE public.loan_policies VALIDATE CONSTRAINT loan_policies_sane; EXCEPTION WHEN check_violation THEN NULL; END; END $$;

-- -------------------------------------------------------------------------
-- 2. Loan immutability guard (post-disbursement)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_loan_immutable_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE frozen boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  frozen := OLD.stage IN ('disbursement','completed','rejected');
  IF NOT frozen THEN RETURN NEW; END IF;

  IF (NEW.member_id       IS DISTINCT FROM OLD.member_id)
  OR (NEW.loan_type       IS DISTINCT FROM OLD.loan_type)
  OR (NEW.amount_requested IS DISTINCT FROM OLD.amount_requested)
  OR (NEW.amount_approved  IS DISTINCT FROM OLD.amount_approved)
  OR (NEW.interest_rate    IS DISTINCT FROM OLD.interest_rate)
  OR (NEW.loan_number      IS DISTINCT FROM OLD.loan_number)
  OR (NEW.eligibility_limit IS DISTINCT FROM OLD.eligibility_limit)
  OR (NEW.term_months      IS DISTINCT FROM OLD.term_months)
  THEN
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
      RAISE EXCEPTION 'Loan financial terms are immutable after disbursement (loan %s)', OLD.loan_number
        USING ERRCODE = '42501';
    END IF;
    -- audit override
    INSERT INTO public.audit_log(actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'super_admin_override', 'loans', OLD.id,
      jsonb_build_object('summary', format('super_admin overrode immutable fields on loan %s', OLD.loan_number),
                         'old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_loan_immutable_fields ON public.loans;
CREATE TRIGGER trg_guard_loan_immutable_fields
BEFORE UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.guard_loan_immutable_fields();

-- -------------------------------------------------------------------------
-- 3. Append-only guards on transactions and audit_log
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_mutation_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '% on % is not permitted (append-only ledger)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS trg_transactions_append_only ON public.transactions;
CREATE TRIGGER trg_transactions_append_only
BEFORE UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.block_mutation_append_only();

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON public.audit_log;
CREATE TRIGGER trg_audit_log_append_only
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.block_mutation_append_only();

REVOKE UPDATE, DELETE ON public.transactions FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE ON public.audit_log    FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------
-- 4. AI context wall — block financial/permission writes in AI transactions
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_context_active()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(current_setting('app.ai_context', true), 'false') = 'true'
$$;

CREATE OR REPLACE FUNCTION public.block_ai_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.ai_context_active() THEN
    RAISE EXCEPTION 'AI-context sessions cannot % on % — a human must perform this action',
      TG_OP, TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions','loans','loan_approvals','user_roles',
                           'loan_board_members','loan_policies','loan_proxies',
                           'loan_type_rules','profiles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_block_ai_writes ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_block_ai_writes
                    BEFORE INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.block_ai_writes()', t);
  END LOOP;
END $$;

-- Server code sets: perform_config('app.ai_context', 'true', true) before invoking AI.

-- -------------------------------------------------------------------------
-- 5. Proxy hardening
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_loan_proxy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_member uuid;
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'Proxy expires_at must be in the future';
  END IF;
  SELECT member_id INTO v_member FROM public.loans WHERE id = NEW.loan_id;
  IF v_member = NEW.delegate_id THEN
    RAISE EXCEPTION 'Cannot delegate approval to the loan applicant';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_loan_proxy ON public.loan_proxies;
CREATE TRIGGER trg_guard_loan_proxy
BEFORE INSERT OR UPDATE OF delegate_id, expires_at, loan_id ON public.loan_proxies
FOR EACH ROW EXECUTE FUNCTION public.guard_loan_proxy();

-- -------------------------------------------------------------------------
-- 6. Storage: extended upload guard
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_loan_doc_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE lname text;
BEGIN
  IF NEW.bucket_id <> 'loan-documents' THEN RETURN NEW; END IF;
  lname := lower(NEW.name);
  IF length(NEW.name) > 240 OR NEW.name LIKE '%..%' THEN
    RAISE EXCEPTION 'Invalid filename';
  END IF;
  IF lname ~ '\.svgz?($|\?)' THEN
    RAISE EXCEPTION 'SVG uploads are not permitted';
  END IF;
  IF NOT (lname ~ '\.(pdf|png|jpe?g|webp|gif|doc|docx|xls|xlsx|csv|txt)($|\?)') THEN
    RAISE EXCEPTION 'File type not allowed for loan documents';
  END IF;
  RETURN NEW;
END $$;

-- -------------------------------------------------------------------------
-- 7. Separation of duties: one board seat per user
-- -------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='loan_board_members_one_seat_per_user') THEN
    BEGIN
      ALTER TABLE public.loan_board_members
        ADD CONSTRAINT loan_board_members_one_seat_per_user UNIQUE (user_id);
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- 8. Audit metadata + retention helper
-- -------------------------------------------------------------------------
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text;

CREATE OR REPLACE FUNCTION public.archive_audit_log(_retain_days int DEFAULT 365)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE moved int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'super_admin only' USING ERRCODE = '42501';
  END IF;
  CREATE TABLE IF NOT EXISTS public.audit_log_archive (LIKE public.audit_log INCLUDING ALL);
  REVOKE ALL ON public.audit_log_archive FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON public.audit_log_archive TO authenticated;
  WITH moved_rows AS (
    DELETE FROM public.audit_log
    WHERE created_at < now() - make_interval(days => _retain_days)
    RETURNING *
  ) INSERT INTO public.audit_log_archive SELECT * FROM moved_rows;
  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END $$;
REVOKE EXECUTE ON FUNCTION public.archive_audit_log(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_audit_log(int) TO authenticated;

-- -------------------------------------------------------------------------
-- 9. AI memory: conversations + retention fields
-- -------------------------------------------------------------------------
ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid,
  ADD COLUMN IF NOT EXISTS token_count int,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx
  ON public.ai_messages(conversation_id, created_at)
  WHERE conversation_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- 10. Notifications: widened dedupe + per-user rate limit
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dedupe_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE recent_count int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = NEW.user_id
       AND type = NEW.type
       AND COALESCE(link,'') = COALESCE(NEW.link,'')
       AND title = NEW.title
       AND created_at > now() - interval '5 minutes'
  ) THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO recent_count
    FROM public.notifications
    WHERE user_id = NEW.user_id AND created_at > now() - interval '10 minutes';
  IF recent_count >= 30 THEN
    RETURN NULL;  -- silently drop to prevent storms; audit if desired
  END IF;
  RETURN NEW;
END $$;

-- -------------------------------------------------------------------------
-- 11. Performance indexes
-- -------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS notifications_inbox_idx
  ON public.notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_user_created_idx
  ON public.transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_loan_created_idx
  ON public.transactions(loan_id, created_at DESC) WHERE loan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS loans_member_status_idx
  ON public.loans(member_id, status);
CREATE INDEX IF NOT EXISTS loans_open_stage_idx
  ON public.loans(stage) WHERE stage NOT IN ('completed','rejected');
CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON public.audit_log(entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx
  ON public.audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_messages_user_created_idx
  ON public.ai_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS loan_approvals_loan_created_idx
  ON public.loan_approvals(loan_id, created_at DESC);

-- -------------------------------------------------------------------------
-- 12. Realtime hygiene: default replica identity on ledger tables
-- -------------------------------------------------------------------------
ALTER TABLE public.transactions REPLICA IDENTITY DEFAULT;
ALTER TABLE public.loans        REPLICA IDENTITY DEFAULT;
ALTER TABLE public.audit_log    REPLICA IDENTITY DEFAULT;
