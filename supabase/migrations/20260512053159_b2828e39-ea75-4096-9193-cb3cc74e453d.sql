
-- A. Loan types
DO $$ BEGIN
  CREATE TYPE public.loan_type AS ENUM ('development','chapchap','emergency');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS loan_type public.loan_type NOT NULL DEFAULT 'development';

ALTER TABLE public.loans ALTER COLUMN interest_rate SET DEFAULT 13.0;

-- B. transactions.loan_id link
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS loan_id UUID NULL REFERENCES public.loans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_loan_id ON public.transactions(loan_id);

-- C. Savings = deposits/contributions/withdrawals/fees only (exclude loan flows)
CREATE OR REPLACE FUNCTION public.get_savings_balance(_user_id uuid)
 RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _user_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN COALESCE((
    SELECT SUM(CASE
      WHEN tx_type IN ('deposit','contribution') THEN amount
      WHEN tx_type IN ('withdrawal','fee')        THEN -amount
      ELSE 0 END)
    FROM public.transactions WHERE user_id = _user_id
  ), 0);
END $fn$;

-- D. Apply repayment ONLY to the specific loan referenced on the tx
CREATE OR REPLACE FUNCTION public.apply_repayment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.tx_type = 'repayment' THEN
    IF NEW.loan_id IS NULL THEN
      RAISE EXCEPTION 'loan_id is required for repayment transactions';
    END IF;
    UPDATE public.loans
       SET outstanding_balance = GREATEST(0, outstanding_balance - NEW.amount),
           status = CASE WHEN outstanding_balance - NEW.amount <= 0
                        THEN 'completed'::loan_status ELSE status END
     WHERE id = NEW.loan_id;
  END IF;
  RETURN NEW;
END $fn$;

-- E. Disbursement trigger now stamps loan_id on the auto-posted tx
CREATE OR REPLACE FUNCTION public.post_disbursement_tx()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF OLD.stage = 'disbursement' AND NEW.stage = 'completed' THEN
    NEW.status := 'disbursed';
    INSERT INTO public.transactions (user_id, amount, tx_type, description, loan_id)
    VALUES (NEW.member_id, COALESCE(NEW.amount_approved, NEW.amount_requested),
            'disbursement', 'Loan ' || NEW.loan_number || ' disbursed', NEW.id);
  END IF;
  RETURN NEW;
END $fn$;

-- F. New active policy version with 13% interest
INSERT INTO public.loan_policies (version, interest_rate, min_savings, savings_multiplier, min_membership_months, max_term_months, effective_from, notes)
SELECT COALESCE(MAX(version),0)+1, 13.0, 100000, 3, 3, 36, now(), 'Interest rate updated to 13%'
FROM public.loan_policies;

-- G. Stop auto-generating member_number
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.raw_user_meta_data->>'phone');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (NEW.id, 'system', 'Welcome to WASSHA SACCOS', 'Your member account is ready. An admin will assign your member number shortly.');
  RETURN NEW;
END $fn$;

-- H. Notification preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY,
  channel_email BOOLEAN NOT NULL DEFAULT true,
  channel_sms BOOLEAN NOT NULL DEFAULT false,
  sms_phone TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prefs self read" ON public.notification_preferences;
CREATE POLICY "prefs self read" ON public.notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "prefs self upsert" ON public.notification_preferences;
CREATE POLICY "prefs self upsert" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "prefs self update" ON public.notification_preferences;
CREATE POLICY "prefs self update" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- I. Tighten realtime topic policy: only own user-notif-<uid> channel
DROP POLICY IF EXISTS "user notif topic read" ON realtime.messages;
DROP POLICY IF EXISTS "user notif topic write" ON realtime.messages;
CREATE POLICY "user notif topic read" ON realtime.messages
  FOR SELECT TO authenticated
  USING (realtime.topic() = ('user-notif-' || auth.uid()::text));
CREATE POLICY "user notif topic write" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (realtime.topic() = ('user-notif-' || auth.uid()::text));
