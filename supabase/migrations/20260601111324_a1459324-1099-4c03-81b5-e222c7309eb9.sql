
-- 1) Tighten profiles self-update: members cannot change locked columns via REST
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
CREATE POLICY "profiles self update"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND opening_balance IS NOT DISTINCT FROM (SELECT opening_balance FROM public.profiles WHERE user_id = auth.uid())
    AND member_number   IS NOT DISTINCT FROM (SELECT member_number   FROM public.profiles WHERE user_id = auth.uid())
    AND joined_at       IS NOT DISTINCT FROM (SELECT joined_at       FROM public.profiles WHERE user_id = auth.uid())
  );

-- 2) Loan proxy soft revoke
ALTER TABLE public.loan_proxies
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID,
  ADD COLUMN IF NOT EXISTS revoke_reason TEXT;

-- Active proxy must ignore revoked rows
CREATE OR REPLACE FUNCTION public.has_active_proxy(_user_id uuid, _loan_id uuid, _stage loan_stage)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.loan_proxies
     WHERE delegate_id = _user_id AND loan_id = _loan_id AND stage = _stage
       AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
  )
$$;

-- 3) Strict validation for admin_register_existing_loan
CREATE OR REPLACE FUNCTION public.admin_register_existing_loan(
  _member_id uuid, _amount numeric, _outstanding numeric, _stage loan_stage,
  _loan_type loan_type, _term_months integer, _purpose text DEFAULT 'Pre-existing loan migrated by admin'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; rule public.loan_type_rules;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _member_id) THEN
    RAISE EXCEPTION 'field=member_id; Member not found' USING ERRCODE = '22023';
  END IF;
  IF _member_id = auth.uid() THEN
    RAISE EXCEPTION 'field=member_id; You cannot register a loan for your own account' USING ERRCODE = '22023';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'field=amount; Original amount must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF _outstanding IS NULL OR _outstanding < 0 THEN
    RAISE EXCEPTION 'field=outstanding; Outstanding cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF _outstanding > _amount THEN
    RAISE EXCEPTION 'field=outstanding; Outstanding cannot exceed original amount' USING ERRCODE = '22023';
  END IF;
  IF _stage NOT IN ('disbursement'::loan_stage,'completed'::loan_stage) THEN
    RAISE EXCEPTION 'field=stage; Stage must be disbursement or completed' USING ERRCODE = '22023';
  END IF;
  IF _term_months IS NULL OR _term_months <= 0 THEN
    RAISE EXCEPTION 'field=term_months; Term must be at least 1 month' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO rule FROM public.loan_type_rules WHERE loan_type = _loan_type;
  IF rule.loan_type IS NOT NULL THEN
    IF _term_months > rule.max_term_months THEN
      RAISE EXCEPTION 'field=term_months; Exceeds max % months for % loans', rule.max_term_months, _loan_type USING ERRCODE='22023';
    END IF;
    IF _amount > rule.max_amount THEN
      RAISE EXCEPTION 'field=amount; Exceeds max TZS % for % loans', rule.max_amount, _loan_type USING ERRCODE='22023';
    END IF;
  END IF;
  INSERT INTO public.loans (
    member_id, amount_requested, amount_approved, outstanding_balance,
    purpose, term_months, stage, status, loan_type, eligibility_limit,
    disbursement_confirmed_at, disbursement_confirmed_by
  ) VALUES (
    _member_id, _amount, _amount, _outstanding,
    COALESCE(NULLIF(trim(_purpose),''), 'Pre-existing loan migrated by admin'), _term_months,
    CASE WHEN _outstanding <= 0 THEN 'completed'::loan_stage ELSE _stage END,
    CASE WHEN _outstanding <= 0 THEN 'completed'::loan_status ELSE 'disbursed'::loan_status END,
    _loan_type, _amount,
    now(), auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_register_existing_loan(uuid,numeric,numeric,loan_stage,loan_type,integer,text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_register_existing_loan(uuid,numeric,numeric,loan_stage,loan_type,integer,text) TO authenticated;

-- 4) Tighten loan_approvals insert: stage + role must match
DROP POLICY IF EXISTS "approvals staff insert" ON public.loan_approvals;
CREATE POLICY "approvals staff insert"
  ON public.loan_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    approver_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.loans l
       WHERE l.id = loan_approvals.loan_id
         AND l.member_id <> auth.uid()
         AND l.stage = loan_approvals.stage
    )
    AND (
      public.has_role(auth.uid(),'admin')
      OR (loan_approvals.stage IN ('submitted','under_review','branch_approval') AND public.has_role(auth.uid(),'approver'))
      OR (loan_approvals.stage = 'finance_approval' AND public.has_role(auth.uid(),'finance'))
      OR (loan_approvals.stage = 'board_chair'      AND public.has_board_seat(auth.uid(),'chair'))
      OR (loan_approvals.stage = 'board_member_1'   AND public.has_board_seat(auth.uid(),'member_1'))
      OR (loan_approvals.stage = 'board_member_2'   AND public.has_board_seat(auth.uid(),'member_2'))
      OR (loan_approvals.stage IN ('manager_approval','disbursement') AND public.has_role(auth.uid(),'manager'))
      OR public.has_active_proxy(auth.uid(), loan_approvals.loan_id, loan_approvals.stage)
    )
  );

-- 5) Audit log enrichment with names & summaries
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_name TEXT; v_actor_no TEXT; v_actor_roles TEXT;
  v_member_name TEXT; v_loan_no TEXT; v_amount NUMERIC;
  v_summary TEXT; v_meta JSONB;
  v_row JSONB := to_jsonb(COALESCE(NEW, OLD));
BEGIN
  SELECT p.full_name, p.member_number INTO v_actor_name, v_actor_no
    FROM public.profiles p WHERE p.user_id = auth.uid();
  SELECT string_agg(role::text, ',') INTO v_actor_roles
    FROM public.user_roles WHERE user_id = auth.uid();
  v_actor_name := COALESCE(NULLIF(v_actor_name,''), 'Unknown');

  IF TG_TABLE_NAME = 'transactions' THEN
    SELECT p.full_name INTO v_member_name FROM public.profiles p WHERE p.user_id = (v_row->>'user_id')::uuid;
    v_amount := (v_row->>'amount')::numeric;
    v_summary := format('%s posted %s of TZS %s for member %s',
      v_actor_name, v_row->>'tx_type', v_amount, COALESCE(v_member_name,'(unknown)'));
    IF v_row->>'loan_id' IS NOT NULL THEN
      SELECT loan_number INTO v_loan_no FROM public.loans WHERE id = (v_row->>'loan_id')::uuid;
      v_summary := v_summary || format(' against loan %s', COALESCE(v_loan_no,'?'));
    END IF;

  ELSIF TG_TABLE_NAME = 'loans' THEN
    v_loan_no := COALESCE(v_row->>'loan_number','?');
    SELECT p.full_name INTO v_member_name FROM public.profiles p WHERE p.user_id = (v_row->>'member_id')::uuid;
    v_amount := COALESCE((v_row->>'amount_approved')::numeric,(v_row->>'amount_requested')::numeric);
    IF TG_OP = 'INSERT' THEN
      v_summary := format('%s submitted loan %s for %s (TZS %s)',
        v_actor_name, v_loan_no, COALESCE(v_member_name,'?'), v_amount);
    ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
      v_summary := format('%s moved loan %s (%s) from %s to %s',
        v_actor_name, v_loan_no, COALESCE(v_member_name,'?'), OLD.stage, NEW.stage);
    ELSE
      v_summary := format('%s updated loan %s (%s)', v_actor_name, v_loan_no, COALESCE(v_member_name,'?'));
    END IF;

  ELSIF TG_TABLE_NAME = 'loan_approvals' THEN
    SELECT l.loan_number, p.full_name INTO v_loan_no, v_member_name
      FROM public.loans l LEFT JOIN public.profiles p ON p.user_id = l.member_id
     WHERE l.id = (v_row->>'loan_id')::uuid;
    v_summary := format('%s recorded %s on loan %s (%s) at stage %s',
      v_actor_name, v_row->>'decision', COALESCE(v_loan_no,'?'), COALESCE(v_member_name,'?'), v_row->>'stage');

  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_summary := format('%s %s profile of %s', v_actor_name, lower(TG_OP), COALESCE(v_row->>'full_name','(no name)'));

  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    SELECT p.full_name INTO v_member_name FROM public.profiles p WHERE p.user_id = (v_row->>'user_id')::uuid;
    v_summary := format('%s %s role %s for %s', v_actor_name, lower(TG_OP), v_row->>'role', COALESCE(v_member_name,'?'));

  ELSIF TG_TABLE_NAME = 'loan_board_members' THEN
    SELECT p.full_name INTO v_member_name FROM public.profiles p WHERE p.user_id = (v_row->>'user_id')::uuid;
    v_summary := format('%s %s board seat %s for %s', v_actor_name, lower(TG_OP), v_row->>'seat', COALESCE(v_member_name,'?'));

  ELSIF TG_TABLE_NAME = 'loan_proxies' THEN
    SELECT l.loan_number INTO v_loan_no FROM public.loans l WHERE l.id = (v_row->>'loan_id')::uuid;
    SELECT p.full_name INTO v_member_name FROM public.profiles p WHERE p.user_id = (v_row->>'delegate_id')::uuid;
    IF TG_OP = 'INSERT' THEN
      v_summary := format('%s granted proxy on loan %s stage %s to %s (reason: %s)',
        v_actor_name, COALESCE(v_loan_no,'?'), v_row->>'stage', COALESCE(v_member_name,'?'), COALESCE(v_row->>'reason','-'));
    ELSIF TG_OP = 'UPDATE' AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at AND NEW.revoked_at IS NOT NULL THEN
      v_summary := format('%s revoked proxy on loan %s stage %s for %s (reason: %s)',
        v_actor_name, COALESCE(v_loan_no,'?'), v_row->>'stage', COALESCE(v_member_name,'?'), COALESCE(v_row->>'revoke_reason','-'));
    ELSIF TG_OP = 'UPDATE' AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at AND NEW.consumed_at IS NOT NULL THEN
      v_summary := format('%s used proxy on loan %s stage %s',
        v_actor_name, COALESCE(v_loan_no,'?'), v_row->>'stage');
    ELSE
      v_summary := format('%s updated proxy on loan %s', v_actor_name, COALESCE(v_loan_no,'?'));
    END IF;

  ELSIF TG_TABLE_NAME = 'loan_policies' THEN
    v_summary := format('%s %s loan policy v%s', v_actor_name, lower(TG_OP), v_row->>'version');

  ELSE
    v_summary := format('%s %s %s', v_actor_name, lower(TG_OP), TG_TABLE_NAME);
  END IF;

  v_meta := jsonb_build_object(
    'actor_name', v_actor_name,
    'actor_member_no', v_actor_no,
    'actor_roles', v_actor_roles,
    'summary', v_summary,
    'row', v_row
  );

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, COALESCE((NEW).id, (OLD).id), v_meta);

  RETURN COALESCE(NEW, OLD);
END $$;

-- Ensure audit triggers exist on the relevant tables
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions','loans','loan_approvals','profiles','user_roles','loan_board_members','loan_proxies','loan_policies']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit()', t, t);
  END LOOP;
END $$;

-- 6) Realtime channel scoping
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'messages' AND relnamespace = 'realtime'::regnamespace) THEN
    EXECUTE 'DROP POLICY IF EXISTS "rt loan topic read" ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY "rt loan topic read" ON realtime.messages FOR SELECT TO authenticated
      USING (
        realtime.topic() ~ '^loan:' AND (
          public.is_staff(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.loans l
            WHERE l.id::text = substring(realtime.topic() FROM 'loan:(.*)$')
              AND l.member_id = auth.uid()
          )
        )
      )
    $POL$;
    EXECUTE 'DROP POLICY IF EXISTS "rt tx topic read" ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY "rt tx topic read" ON realtime.messages FOR SELECT TO authenticated
      USING (
        realtime.topic() ~ '^tx:' AND (
          public.is_staff(auth.uid())
          OR substring(realtime.topic() FROM 'tx:(.*)$') = auth.uid()::text
        )
      )
    $POL$;
  END IF;
END $$;
