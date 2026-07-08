
-- 1. Repayment allocation: apply to fee_outstanding first, then to outstanding_balance.
CREATE OR REPLACE FUNCTION public.apply_repayment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_amount NUMERIC;
  v_bal NUMERIC;
  v_fee NUMERIC;
  v_pay_to_fee NUMERIC;
  v_pay_to_principal NUMERIC;
BEGIN
  IF NEW.tx_type = 'repayment' THEN
    IF NEW.loan_id IS NULL THEN RAISE EXCEPTION 'loan_id required for repayment'; END IF;
    SELECT outstanding_balance, fee_outstanding
      INTO v_bal, v_fee
      FROM public.loans WHERE id = NEW.loan_id FOR UPDATE;
    v_amount := COALESCE(NEW.amount, 0);
    -- Allocation order: fees first, then principal.
    v_pay_to_fee := LEAST(COALESCE(v_fee, 0), v_amount);
    v_pay_to_principal := v_amount - v_pay_to_fee;
    v_fee := GREATEST(0, COALESCE(v_fee, 0) - v_pay_to_fee);
    v_bal := GREATEST(0, COALESCE(v_bal, 0) - v_pay_to_principal);
    UPDATE public.loans
       SET outstanding_balance = v_bal,
           fee_outstanding = v_fee,
           status = CASE WHEN v_bal <= 0 AND v_fee <= 0 THEN 'completed'::loan_status ELSE status END,
           stage  = CASE WHEN v_bal <= 0 AND v_fee <= 0 THEN 'completed'::loan_stage  ELSE stage  END
     WHERE id = NEW.loan_id;
  ELSIF NEW.tx_type = 'loan_fee' THEN
    IF NEW.loan_id IS NULL THEN RAISE EXCEPTION 'loan_id required for loan_fee'; END IF;
    SELECT outstanding_balance, GREATEST(0, fee_outstanding - NEW.amount)
      INTO v_bal, v_fee
      FROM public.loans WHERE id = NEW.loan_id FOR UPDATE;
    UPDATE public.loans
       SET fee_outstanding = v_fee,
           status = CASE WHEN COALESCE(v_bal,0) <= 0 AND v_fee <= 0 THEN 'completed'::loan_status ELSE status END,
           stage  = CASE WHEN COALESCE(v_bal,0) <= 0 AND v_fee <= 0 THEN 'completed'::loan_stage  ELSE stage  END
     WHERE id = NEW.loan_id;
  END IF;
  RETURN NEW;
END $function$;

-- 2. Confirm-disbursement RPC:
--    Manager clicks Disburse → loan becomes active (status='disbursed'),
--    fee is calculated & stored, outstanding balances set, disbursement transaction posted.
--    Stage stays at 'disbursement' until repayments drive it to 'completed'.
CREATE OR REPLACE FUNCTION public.rpc_confirm_disbursement(_loan_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_loan public.loans;
  v_principal NUMERIC;
  v_fee NUMERIC;
  v_tx_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE='42501';
  END IF;
  IF NOT public.has_role(auth.uid(),'manager') THEN
    RAISE EXCEPTION 'Only a Manager can disburse a loan' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF v_loan.id IS NULL THEN
    RAISE EXCEPTION 'Loan not found' USING ERRCODE='22023';
  END IF;
  IF v_loan.member_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot disburse your own loan' USING ERRCODE='42501';
  END IF;
  IF v_loan.stage <> 'disbursement' THEN
    RAISE EXCEPTION 'Loan is not at the disbursement stage' USING ERRCODE='22023';
  END IF;
  IF v_loan.disbursement_confirmed_at IS NOT NULL OR v_loan.status = 'disbursed' THEN
    RAISE EXCEPTION 'Loan has already been disbursed' USING ERRCODE='22023';
  END IF;

  v_principal := COALESCE(v_loan.amount_approved, v_loan.amount_requested);
  v_fee := public.calc_returned_fee(v_principal, v_loan.interest_rate, v_loan.term_months);

  -- Prevent duplicate disbursement transactions for the same loan.
  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE loan_id = _loan_id AND tx_type = 'disbursement'
  ) THEN
    RAISE EXCEPTION 'A disbursement transaction already exists for this loan' USING ERRCODE='22023';
  END IF;

  UPDATE public.loans
     SET status = 'disbursed'::loan_status,
         outstanding_balance = v_principal,
         fee_amount = v_fee,
         fee_outstanding = v_fee,
         disbursement_confirmed_at = now(),
         disbursement_confirmed_by = auth.uid()
   WHERE id = _loan_id;

  INSERT INTO public.transactions (user_id, amount, tx_type, description, loan_id)
  VALUES (v_loan.member_id, v_principal, 'disbursement',
          'Loan ' || v_loan.loan_number || ' disbursed', _loan_id)
  RETURNING id INTO v_tx_id;

  INSERT INTO public.loan_approvals (loan_id, stage, approver_id, decision, comment)
  VALUES (_loan_id, 'disbursement', auth.uid(), 'approved',
          format('Disbursement confirmed. Principal TZS %s, fee TZS %s.', v_principal, v_fee));

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_loan.member_id, 'loan_update', 'Loan disbursed',
          format('TZS %s from loan %s has been credited to your account. Fee due: TZS %s.',
                 v_principal, v_loan.loan_number, v_fee),
          '/loans/' || _loan_id);

  RETURN v_tx_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.rpc_confirm_disbursement(uuid) TO authenticated;
