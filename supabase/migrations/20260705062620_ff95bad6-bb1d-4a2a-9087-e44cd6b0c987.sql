-- Split RLS on public.loans so USING checks OLD.stage against the actor's
-- role/seat, and WITH CHECK only ensures staff can still access the member.
-- Stage-transition validity is enforced by enforce_loan_transition trigger.

DROP POLICY IF EXISTS "loans staff update" ON public.loans;

CREATE POLICY "loans staff update"
ON public.loans
FOR UPDATE
USING (
  staff_can_access_user(member_id) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (stage = 'submitted'::loan_stage        AND has_role(auth.uid(), 'approver'::app_role))
    OR (stage = 'under_review'::loan_stage     AND has_role(auth.uid(), 'approver'::app_role))
    OR (stage = 'branch_approval'::loan_stage  AND has_role(auth.uid(), 'approver'::app_role))
    OR (stage = 'finance_approval'::loan_stage AND has_role(auth.uid(), 'finance'::app_role))
    OR (stage = 'board_chair'::loan_stage      AND has_board_seat(auth.uid(), 'chair'))
    OR (stage = 'board_member_1'::loan_stage   AND has_board_seat(auth.uid(), 'member_1'))
    OR (stage = 'board_member_2'::loan_stage   AND has_board_seat(auth.uid(), 'member_2'))
    OR (stage = 'manager_approval'::loan_stage AND has_role(auth.uid(), 'manager'::app_role))
    OR (stage = 'disbursement'::loan_stage     AND has_role(auth.uid(), 'manager'::app_role))
  )
)
WITH CHECK (
  staff_can_access_user(member_id)
);
