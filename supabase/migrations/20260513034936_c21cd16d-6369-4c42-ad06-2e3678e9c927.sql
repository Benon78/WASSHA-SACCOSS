
-- ===== A. Owner-guard helpers: revoke from anon =====
REVOKE EXECUTE ON FUNCTION public.get_savings_balance(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_active_loan_balance(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.calculate_eligibility(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_savings_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_loan_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_eligibility(uuid) TO authenticated;

-- ===== B. Opening balance on profiles =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC NOT NULL DEFAULT 0;

-- Update get_savings_balance to include opening_balance
CREATE OR REPLACE FUNCTION public.get_savings_balance(_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_open NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _user_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT COALESCE(opening_balance,0) INTO v_open FROM public.profiles WHERE user_id = _user_id;
  RETURN COALESCE(v_open,0) + COALESCE((
    SELECT SUM(CASE
      WHEN tx_type IN ('deposit','contribution') THEN amount
      WHEN tx_type IN ('withdrawal','fee')        THEN -amount
      ELSE 0 END)
    FROM public.transactions WHERE user_id = _user_id
  ), 0);
END $$;

-- ===== C. Loan type rules =====
CREATE TABLE IF NOT EXISTS public.loan_type_rules (
  loan_type loan_type PRIMARY KEY,
  max_amount NUMERIC NOT NULL,
  max_term_months INT NOT NULL,
  notes TEXT
);
ALTER TABLE public.loan_type_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "type rules read" ON public.loan_type_rules;
CREATE POLICY "type rules read" ON public.loan_type_rules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "type rules admin write" ON public.loan_type_rules;
CREATE POLICY "type rules admin write" ON public.loan_type_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

INSERT INTO public.loan_type_rules (loan_type, max_amount, max_term_months, notes) VALUES
  ('chapchap',    200000,   1,  'Chap chap quick loan: max TZS 200,000 / 1 month'),
  ('emergency', 1000000,   6,  'Emergency loan: priority review'),
  ('development', 50000000, 36, 'Development loan: subject to savings multiplier')
ON CONFLICT (loan_type) DO UPDATE
  SET max_amount = EXCLUDED.max_amount,
      max_term_months = EXCLUDED.max_term_months,
      notes = EXCLUDED.notes;

-- ===== D. Server-side eligibility enforcement on loan insert =====
CREATE OR REPLACE FUNCTION public.enforce_loan_eligibility()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE elig JSONB; rule public.loan_type_rules; cap NUMERIC;
BEGIN
  -- Members may only apply for themselves
  IF NEW.member_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'You can only apply for your own account';
  END IF;
  -- Type rule check
  SELECT * INTO rule FROM public.loan_type_rules WHERE loan_type = NEW.loan_type;
  IF rule.loan_type IS NOT NULL THEN
    IF NEW.term_months > rule.max_term_months THEN
      RAISE EXCEPTION 'Term exceeds max % months for % loan', rule.max_term_months, NEW.loan_type;
    END IF;
    IF NEW.amount_requested > rule.max_amount THEN
      RAISE EXCEPTION 'Amount exceeds max % for % loan', rule.max_amount, NEW.loan_type;
    END IF;
  END IF;
  -- Eligibility check
  elig := public.calculate_eligibility(NEW.member_id);
  IF (elig->>'eligible')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'Not eligible: %', elig->'reasons';
  END IF;
  cap := (elig->>'max_amount')::NUMERIC;
  IF rule.max_amount IS NOT NULL THEN cap := LEAST(cap, rule.max_amount); END IF;
  IF NEW.amount_requested > cap THEN
    RAISE EXCEPTION 'Amount exceeds your limit of TZS %', cap;
  END IF;
  NEW.eligibility_limit := cap;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_loan_eligibility ON public.loans;
CREATE TRIGGER trg_enforce_loan_eligibility
  BEFORE INSERT ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_loan_eligibility();

-- ===== E. Transactions integrity =====
DROP POLICY IF EXISTS "tx staff insert" ON public.transactions;
CREATE POLICY "tx staff insert" ON public.transactions FOR INSERT TO authenticated
WITH CHECK (
  is_staff(auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = transactions.user_id)
  AND (
    transactions.loan_id IS NULL
    OR EXISTS (SELECT 1 FROM public.loans l WHERE l.id = transactions.loan_id AND l.member_id = transactions.user_id)
  )
);

-- ===== F. Loan policies lock-down =====
DROP POLICY IF EXISTS "policies admin update" ON public.loan_policies;
CREATE POLICY "policies admin update" ON public.loan_policies FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "policies admin delete" ON public.loan_policies;
CREATE POLICY "policies admin delete" ON public.loan_policies FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

-- ===== G. New approval stages + board members =====
DO $$ BEGIN
  ALTER TYPE loan_stage ADD VALUE IF NOT EXISTS 'board_chair';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE loan_stage ADD VALUE IF NOT EXISTS 'board_member_1';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE loan_stage ADD VALUE IF NOT EXISTS 'board_member_2';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.loan_board_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  seat text NOT NULL CHECK (seat IN ('chair','member_1','member_2')),
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seat),
  UNIQUE (user_id, seat)
);
ALTER TABLE public.loan_board_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board read" ON public.loan_board_members;
CREATE POLICY "board read" ON public.loan_board_members FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "board admin write" ON public.loan_board_members;
CREATE POLICY "board admin write" ON public.loan_board_members FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.has_board_seat(_user_id uuid, _seat text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.loan_board_members WHERE user_id = _user_id AND seat = _seat) $$;

-- ===== H. Updated transition trigger: new flow + repayment bypass =====
CREATE OR REPLACE FUNCTION public.enforce_loan_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE allowed boolean := false;
BEGIN
  -- Bypass when invoked from a repayment trigger (set via session var)
  IF current_setting('app.repayment', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- Same stage and same status: allow staff in-place edits (e.g. amount_approved)
  IF OLD.stage = NEW.stage AND OLD.status = NEW.status THEN
    IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
    RETURN NEW;
  END IF;

  -- Required role per current stage
  CASE OLD.stage
    WHEN 'submitted'        THEN allowed := public.has_role(auth.uid(),'approver');
    WHEN 'under_review'     THEN allowed := public.has_role(auth.uid(),'approver');
    WHEN 'branch_approval'  THEN allowed := public.has_role(auth.uid(),'approver');
    WHEN 'finance_approval' THEN allowed := public.has_role(auth.uid(),'finance');
    WHEN 'board_chair'      THEN allowed := public.has_board_seat(auth.uid(),'chair');
    WHEN 'board_member_1'   THEN allowed := public.has_board_seat(auth.uid(),'member_1');
    WHEN 'board_member_2'   THEN allowed := public.has_board_seat(auth.uid(),'member_2');
    WHEN 'manager_approval' THEN allowed := public.has_role(auth.uid(),'manager');
    WHEN 'disbursement'     THEN allowed := public.has_role(auth.uid(),'manager');
    ELSE allowed := false;
  END CASE;

  IF NOT (allowed OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'You do not have authority for stage %', OLD.stage;
  END IF;

  -- Validate transitions
  IF NEW.stage <> OLD.stage THEN
    IF NEW.stage = 'rejected' THEN
      NEW.status := 'rejected';
    ELSIF NOT (
      (OLD.stage = 'submitted'        AND NEW.stage = 'under_review') OR
      (OLD.stage = 'under_review'     AND NEW.stage = 'finance_approval') OR
      (OLD.stage = 'finance_approval' AND NEW.stage = 'board_chair') OR
      (OLD.stage = 'board_chair'      AND NEW.stage = 'board_member_1') OR
      (OLD.stage = 'board_member_1'   AND NEW.stage = 'board_member_2') OR
      (OLD.stage = 'board_member_2'   AND NEW.stage = 'manager_approval') OR
      (OLD.stage = 'manager_approval' AND NEW.stage = 'disbursement') OR
      (OLD.stage = 'disbursement'     AND NEW.stage = 'completed') OR
      -- legacy paths (existing pending data)
      (OLD.stage = 'branch_approval'  AND NEW.stage = 'finance_approval') OR
      (OLD.stage = 'manager_approval' AND NEW.stage = 'disbursement')
    ) THEN
      RAISE EXCEPTION 'Invalid stage transition: % -> %', OLD.stage, NEW.stage;
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ===== I. Apply repayment bypasses transition check, allows completion =====
CREATE OR REPLACE FUNCTION public.apply_repayment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_new_balance NUMERIC;
BEGIN
  IF NEW.tx_type = 'repayment' THEN
    IF NEW.loan_id IS NULL THEN
      RAISE EXCEPTION 'loan_id is required for repayment transactions';
    END IF;
    PERFORM set_config('app.repayment','1', true);
    SELECT GREATEST(0, outstanding_balance - NEW.amount) INTO v_new_balance
      FROM public.loans WHERE id = NEW.loan_id;
    UPDATE public.loans
       SET outstanding_balance = v_new_balance,
           status = CASE WHEN v_new_balance <= 0 THEN 'completed'::loan_status ELSE status END,
           stage  = CASE WHEN v_new_balance <= 0 THEN 'completed'::loan_stage  ELSE stage  END
     WHERE id = NEW.loan_id;
    PERFORM set_config('app.repayment','', true);
  END IF;
  RETURN NEW;
END $$;

-- Notify on repayment too
CREATE OR REPLACE FUNCTION public.notify_on_tx()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tx_type IN ('deposit','contribution') THEN
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (NEW.user_id, 'deposit', 'Deposit confirmed',
            format('TZS %s credited to your account.', NEW.amount));
  ELSIF NEW.tx_type = 'repayment' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'loan_update', 'Loan repayment received',
            format('TZS %s applied to your loan.', NEW.amount),
            CASE WHEN NEW.loan_id IS NOT NULL THEN '/loans/' || NEW.loan_id ELSE NULL END);
  END IF;
  RETURN NEW;
END $$;

-- ===== J. Notification preferences: per-channel toggles already exist =====
-- (existing notification_preferences table is unchanged.)
