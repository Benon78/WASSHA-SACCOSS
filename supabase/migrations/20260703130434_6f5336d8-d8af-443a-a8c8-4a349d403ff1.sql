
-- =====================================================================
-- Phase 3: Branch isolation (single branch per user via profiles.branch_id)
-- Backward compatible: staff without a branch keep org-wide access.
-- =====================================================================

-- Small, cached-shape helpers ---------------------------------------------
CREATE OR REPLACE FUNCTION public.user_branch(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT branch_id FROM public.profiles WHERE user_id = _user_id $$;

REVOKE ALL ON FUNCTION public.user_branch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_branch(uuid) TO authenticated, service_role;

-- Actor can access target user's data if:
--   super_admin, OR actor has no branch (backward compat / org-wide staff),
--   OR target has no branch, OR they share a branch.
CREATE OR REPLACE FUNCTION public.staff_can_access_user(_target_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_super_admin(auth.uid())
    OR public.user_branch(auth.uid()) IS NULL
    OR public.user_branch(_target_user) IS NULL
    OR public.user_branch(auth.uid()) = public.user_branch(_target_user)
$$;

REVOKE ALL ON FUNCTION public.staff_can_access_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_access_user(uuid) TO authenticated, service_role;

-- =====================================================================
-- PROFILES: staff reads / admin updates restricted to same branch
-- =====================================================================
DROP POLICY IF EXISTS "profiles read scoped" ON public.profiles;
CREATE POLICY "profiles read scoped" ON public.profiles
FOR SELECT USING (
  user_id = auth.uid()
  OR (
    (public.has_role(auth.uid(),'admin') OR public.is_staff(auth.uid()))
    AND public.staff_can_access_user(user_id)
  )
);

DROP POLICY IF EXISTS "profiles admin update" ON public.profiles;
CREATE POLICY "profiles admin update" ON public.profiles
FOR UPDATE USING (
  public.has_role(auth.uid(),'admin') AND public.staff_can_access_user(user_id)
);

-- =====================================================================
-- LOANS: staff read / update restricted to same-branch members
-- =====================================================================
DROP POLICY IF EXISTS "loans member read" ON public.loans;
CREATE POLICY "loans member read" ON public.loans
FOR SELECT USING (
  member_id = auth.uid()
  OR (public.is_staff(auth.uid()) AND public.staff_can_access_user(member_id))
);

DROP POLICY IF EXISTS "loans staff update" ON public.loans;
CREATE POLICY "loans staff update" ON public.loans
FOR UPDATE USING (
  public.staff_can_access_user(member_id)
  AND (
    public.has_role(auth.uid(),'admin')
    OR ((stage = 'submitted'::loan_stage)         AND public.has_role(auth.uid(),'approver'))
    OR ((stage = 'under_review'::loan_stage)      AND public.has_role(auth.uid(),'approver'))
    OR ((stage = 'branch_approval'::loan_stage)   AND public.has_role(auth.uid(),'approver'))
    OR ((stage = 'finance_approval'::loan_stage)  AND public.has_role(auth.uid(),'finance'))
    OR ((stage = 'board_chair'::loan_stage)       AND public.has_board_seat(auth.uid(),'chair'))
    OR ((stage = 'board_member_1'::loan_stage)    AND public.has_board_seat(auth.uid(),'member_1'))
    OR ((stage = 'board_member_2'::loan_stage)    AND public.has_board_seat(auth.uid(),'member_2'))
    OR ((stage = 'manager_approval'::loan_stage)  AND public.has_role(auth.uid(),'manager'))
    OR ((stage = 'disbursement'::loan_stage)      AND public.has_role(auth.uid(),'manager'))
  )
);

-- =====================================================================
-- TRANSACTIONS: staff visibility scoped to same-branch users
-- =====================================================================
DROP POLICY IF EXISTS "tx self read" ON public.transactions;
CREATE POLICY "tx self read" ON public.transactions
FOR SELECT USING (
  user_id = auth.uid()
  OR (public.is_staff(auth.uid()) AND public.staff_can_access_user(user_id))
);

-- =====================================================================
-- LOAN APPROVALS: staff read/insert scoped by loan's member branch
-- =====================================================================
DROP POLICY IF EXISTS "approvals read" ON public.loan_approvals;
CREATE POLICY "approvals read" ON public.loan_approvals
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.loans l WHERE l.id = loan_approvals.loan_id
      AND (
        l.member_id = auth.uid()
        OR (public.is_staff(auth.uid()) AND public.staff_can_access_user(l.member_id))
      )
  )
);

-- =====================================================================
-- LOAN PROXIES: admin write scoped to same-branch loans
-- =====================================================================
DROP POLICY IF EXISTS "proxy admin write" ON public.loan_proxies;
CREATE POLICY "proxy admin write" ON public.loan_proxies
FOR ALL USING (
  public.has_role(auth.uid(),'admin')
  AND EXISTS (
    SELECT 1 FROM public.loans l WHERE l.id = loan_proxies.loan_id
      AND public.staff_can_access_user(l.member_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  AND EXISTS (
    SELECT 1 FROM public.loans l WHERE l.id = loan_proxies.loan_id
      AND public.staff_can_access_user(l.member_id)
  )
);

DROP POLICY IF EXISTS "proxy read" ON public.loan_proxies;
CREATE POLICY "proxy read" ON public.loan_proxies
FOR SELECT USING (
  delegate_id = auth.uid()
  OR (
    public.has_role(auth.uid(),'admin')
    AND EXISTS (
      SELECT 1 FROM public.loans l WHERE l.id = loan_proxies.loan_id
        AND public.staff_can_access_user(l.member_id)
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.loans l WHERE l.id = loan_proxies.loan_id
      AND l.member_id = auth.uid()
  )
);

-- =====================================================================
-- AUDIT LOG: super_admin full; admins limited to entries whose target
-- user (when resolvable) is in their branch.
-- =====================================================================
DROP POLICY IF EXISTS "audit admin read" ON public.audit_log;
DROP POLICY IF EXISTS "audit.view permission read" ON public.audit_log;
CREATE POLICY "audit read scoped" ON public.audit_log
FOR SELECT USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(),'admin')
    AND (
      public.user_branch(auth.uid()) IS NULL
      OR entity_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.user_id = audit_log.entity_id
      )
      OR public.staff_can_access_user(entity_id)
    )
  )
);
