
-- 1. approvals insert must match loan's current stage
DROP POLICY IF EXISTS "approvals staff insert" ON public.loan_approvals;
CREATE POLICY "approvals staff insert" ON public.loan_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND approver_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_approvals.loan_id
        AND l.stage = loan_approvals.stage
    )
  );

-- 2. calc_returned_fee: pin search_path
ALTER FUNCTION public.calc_returned_fee(numeric, numeric, integer) SET search_path = public, pg_temp;

-- 3. Revoke EXECUTE on SECURITY DEFINER + other public functions from public/anon
REVOKE EXECUTE ON FUNCTION public.admin_register_existing_loan(uuid, numeric, numeric, loan_stage, loan_type, integer, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.apply_repayment() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.calc_returned_fee(numeric, numeric, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_eligibility(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.current_policy() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.dedupe_notification() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_loan_eligibility() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_loan_transition() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_active_loan_balance(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_savings_balance(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.guard_loan_doc_upload() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.guard_profile_self_update() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_proxy(uuid, uuid, loan_stage) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.has_board_seat(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.log_assistant_action(text, text, uuid, jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.log_audit() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_escalation_resolved() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_approval() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_escalation() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_loan_change() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_tx() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.post_disbursement_tx() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.protect_last_admin() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.touch_stage_entered_at() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM public, anon;

-- Grant back to authenticated for callable helpers used by app code (RPC surface)
GRANT EXECUTE ON FUNCTION public.calculate_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_loan_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_savings_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_proxy(uuid, uuid, loan_stage) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_board_seat(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_policy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_assistant_action(text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_existing_loan(uuid, numeric, numeric, loan_stage, loan_type, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calc_returned_fee(numeric, numeric, integer) TO authenticated;

-- 4. Restrict loan_policies and loan_type_rules reads to staff
DROP POLICY IF EXISTS "policies read" ON public.loan_policies;
CREATE POLICY "policies read" ON public.loan_policies
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "type rules read" ON public.loan_type_rules;
CREATE POLICY "type rules read" ON public.loan_type_rules
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
