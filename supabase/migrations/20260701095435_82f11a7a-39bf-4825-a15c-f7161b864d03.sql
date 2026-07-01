-- 1) Enforce eligibility server-side on every loan insert (blocks REST bypass)
DROP TRIGGER IF EXISTS trg_enforce_loan_eligibility ON public.loans;
CREATE TRIGGER trg_enforce_loan_eligibility
BEFORE INSERT ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.enforce_loan_eligibility();

-- 2) Tighten approvals staff insert policy: proxy branch must also be staff
DROP POLICY IF EXISTS "approvals staff insert" ON public.loan_approvals;
CREATE POLICY "approvals staff insert" ON public.loan_approvals
FOR INSERT TO authenticated
WITH CHECK (
  approver_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.loans l
    WHERE l.id = loan_approvals.loan_id
      AND l.member_id <> auth.uid()
      AND l.stage = loan_approvals.stage
  )
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR ((stage = ANY (ARRAY['submitted'::loan_stage,'under_review'::loan_stage,'branch_approval'::loan_stage]))
        AND public.has_role(auth.uid(),'approver'::app_role))
    OR (stage = 'finance_approval'::loan_stage AND public.has_role(auth.uid(),'finance'::app_role))
    OR (stage = 'board_chair'::loan_stage      AND public.has_board_seat(auth.uid(),'chair'))
    OR (stage = 'board_member_1'::loan_stage   AND public.has_board_seat(auth.uid(),'member_1'))
    OR (stage = 'board_member_2'::loan_stage   AND public.has_board_seat(auth.uid(),'member_2'))
    OR ((stage = ANY (ARRAY['manager_approval'::loan_stage,'disbursement'::loan_stage]))
        AND public.has_role(auth.uid(),'manager'::app_role))
    -- Proxy path: delegate must also be a staff user
    OR (public.has_active_proxy(auth.uid(), loan_id, stage) AND public.is_staff(auth.uid()))
  )
);

-- 3) Add sitemap-only note: no schema change needed here.

-- 4) Scope profiles PII: restrict non-admin staff to a safe subset via view.
--    Base policy now allows read only if: self, admin, or a related loan exists.
DROP POLICY IF EXISTS "profiles self read" ON public.profiles;
CREATE POLICY "profiles read scoped" ON public.profiles
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.is_staff(auth.uid())
    AND EXISTS (SELECT 1 FROM public.loans l WHERE l.member_id = profiles.user_id)
  )
);