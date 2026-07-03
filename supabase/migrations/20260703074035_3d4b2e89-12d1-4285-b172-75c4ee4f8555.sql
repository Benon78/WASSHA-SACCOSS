
-- Loans: enforce eligibility on submission
DROP TRIGGER IF EXISTS trg_enforce_loan_eligibility ON public.loans;
CREATE TRIGGER trg_enforce_loan_eligibility
  BEFORE INSERT ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_loan_eligibility();

-- Loans: enforce workflow transitions and role/seat authority
DROP TRIGGER IF EXISTS trg_enforce_loan_transition ON public.loans;
CREATE TRIGGER trg_enforce_loan_transition
  BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_loan_transition();

-- Loans: post disbursement transaction + returned-fee at completion
DROP TRIGGER IF EXISTS trg_post_disbursement_tx ON public.loans;
CREATE TRIGGER trg_post_disbursement_tx
  BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.post_disbursement_tx();

-- Loans: notifications + updated_at maintenance
DROP TRIGGER IF EXISTS trg_notify_on_loan_change ON public.loans;
CREATE TRIGGER trg_notify_on_loan_change
  AFTER INSERT OR UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_loan_change();

-- Transactions: apply repayments to loans & notify member
DROP TRIGGER IF EXISTS trg_apply_repayment ON public.transactions;
CREATE TRIGGER trg_apply_repayment
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_repayment();

DROP TRIGGER IF EXISTS trg_notify_on_tx ON public.transactions;
CREATE TRIGGER trg_notify_on_tx
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_tx();

-- Loan approvals: notify member if docs are requested
DROP TRIGGER IF EXISTS trg_notify_on_approval ON public.loan_approvals;
CREATE TRIGGER trg_notify_on_approval
  AFTER INSERT ON public.loan_approvals
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_approval();

-- Profiles: block members from changing sensitive fields
DROP TRIGGER IF EXISTS trg_guard_profile_self_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

-- Profiles: keep updated_at fresh
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- New users: auto-create profile + default member role
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User roles: prevent removing the last admin
DROP TRIGGER IF EXISTS trg_protect_last_admin ON public.user_roles;
CREATE TRIGGER trg_protect_last_admin
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin();

-- Notifications: dedupe rapid duplicates
DROP TRIGGER IF EXISTS trg_dedupe_notification ON public.notifications;
CREATE TRIGGER trg_dedupe_notification
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dedupe_notification();

-- Escalations: notify admins on new, member on resolve
DROP TRIGGER IF EXISTS trg_notify_on_escalation ON public.assistant_escalations;
CREATE TRIGGER trg_notify_on_escalation
  AFTER INSERT ON public.assistant_escalations
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_escalation();

DROP TRIGGER IF EXISTS trg_notify_escalation_resolved ON public.assistant_escalations;
CREATE TRIGGER trg_notify_escalation_resolved
  AFTER UPDATE ON public.assistant_escalations
  FOR EACH ROW EXECUTE FUNCTION public.notify_escalation_resolved();

-- Audit trail for sensitive tables
DROP TRIGGER IF EXISTS trg_audit_loans ON public.loans;
CREATE TRIGGER trg_audit_loans
  AFTER INSERT OR UPDATE OR DELETE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_transactions ON public.transactions;
CREATE TRIGGER trg_audit_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_loan_approvals ON public.loan_approvals;
CREATE TRIGGER trg_audit_loan_approvals
  AFTER INSERT OR UPDATE OR DELETE ON public.loan_approvals
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_board ON public.loan_board_members;
CREATE TRIGGER trg_audit_board
  AFTER INSERT OR UPDATE OR DELETE ON public.loan_board_members
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_proxies ON public.loan_proxies;
CREATE TRIGGER trg_audit_proxies
  AFTER INSERT OR UPDATE OR DELETE ON public.loan_proxies
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_loan_policies ON public.loan_policies;
CREATE TRIGGER trg_audit_loan_policies
  AFTER INSERT OR UPDATE OR DELETE ON public.loan_policies
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- Storage guard: block SVG uploads to loan-documents
DROP TRIGGER IF EXISTS trg_guard_loan_doc_upload ON storage.objects;
CREATE TRIGGER trg_guard_loan_doc_upload
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.guard_loan_doc_upload();
