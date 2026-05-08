
-- ===== ENUMS =====
CREATE TYPE public.app_role AS ENUM ('member','approver','finance','manager','admin');
CREATE TYPE public.loan_stage AS ENUM ('submitted','under_review','branch_approval','finance_approval','manager_approval','disbursement','completed','rejected');
CREATE TYPE public.loan_status AS ENUM ('pending','approved','rejected','disbursed','completed');
CREATE TYPE public.tx_type AS ENUM ('deposit','withdrawal','contribution','fee','repayment','disbursement');
CREATE TYPE public.approval_decision AS ENUM ('approved','rejected','forwarded','docs_requested');
CREATE TYPE public.notif_type AS ENUM ('deposit','loan_update','loan_approved','loan_rejected','due_reminder','docs_requested','system');

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  member_number TEXT UNIQUE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===== USER ROLES =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('approver','finance','manager','admin'))
$$;

-- ===== TRANSACTIONS (savings ledger) =====
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tx_type tx_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tx_user ON public.transactions(user_id, created_at DESC);

-- savings balance = deposits + contributions - withdrawals - fees
CREATE OR REPLACE FUNCTION public.get_savings_balance(_user_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(
    CASE WHEN tx_type IN ('deposit','contribution') THEN amount
         WHEN tx_type IN ('withdrawal','fee') THEN -amount
         ELSE 0 END
  ),0) FROM public.transactions WHERE user_id = _user_id
$$;

-- ===== LOANS =====
CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_number TEXT UNIQUE NOT NULL DEFAULT ('LN-' || lpad((floor(random()*900000)+100000)::text, 6, '0')),
  member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_requested NUMERIC(14,2) NOT NULL CHECK (amount_requested > 0),
  amount_approved NUMERIC(14,2),
  purpose TEXT NOT NULL,
  term_months INT NOT NULL CHECK (term_months BETWEEN 1 AND 60),
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 12.0,
  stage loan_stage NOT NULL DEFAULT 'submitted',
  status loan_status NOT NULL DEFAULT 'pending',
  outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  eligibility_limit NUMERIC(14,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_loans_member ON public.loans(member_id);
CREATE INDEX idx_loans_stage ON public.loans(stage);

-- outstanding balance for member (active loans)
CREATE OR REPLACE FUNCTION public.get_active_loan_balance(_user_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(outstanding_balance),0) FROM public.loans
  WHERE member_id = _user_id AND status IN ('approved','disbursed')
$$;

-- eligibility: 3x savings - active loan balance, with reasons
CREATE OR REPLACE FUNCTION public.calculate_eligibility(_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_savings NUMERIC; v_active NUMERIC; v_max NUMERIC; v_min_savings NUMERIC := 100000;
  v_min_months INT := 3; v_joined TIMESTAMPTZ; v_months_member NUMERIC;
  v_pending INT; v_reasons JSONB := '[]'::jsonb; v_eligible BOOLEAN := true;
BEGIN
  SELECT joined_at INTO v_joined FROM public.profiles WHERE user_id = _user_id;
  v_savings := public.get_savings_balance(_user_id);
  v_active := public.get_active_loan_balance(_user_id);
  v_months_member := EXTRACT(EPOCH FROM (now() - COALESCE(v_joined, now())))/2592000;
  SELECT COUNT(*) INTO v_pending FROM public.loans WHERE member_id=_user_id AND status='pending';

  v_max := GREATEST(0, (v_savings * 3) - v_active);

  IF v_savings < v_min_savings THEN
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_object('code','low_savings','message', format('Minimum savings of TZS %s required (you have TZS %s).', v_min_savings, v_savings));
  END IF;
  IF v_months_member < v_min_months THEN
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_object('code','new_member','message', format('Membership must be at least %s months (you have %s).', v_min_months, round(v_months_member,1)));
  END IF;
  IF v_pending > 0 THEN
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_object('code','pending_loan','message','You have a pending loan application. Please wait for it to be processed.');
  END IF;
  IF v_max <= 0 AND v_eligible THEN
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_object('code','no_capacity','message','Active loan balance has consumed your borrowing capacity.');
  END IF;

  RETURN jsonb_build_object(
    'eligible', v_eligible,
    'max_amount', v_max,
    'savings', v_savings,
    'active_loan_balance', v_active,
    'months_member', round(v_months_member,1),
    'reasons', v_reasons
  );
END $$;

-- ===== LOAN APPROVALS =====
CREATE TABLE public.loan_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  stage loan_stage NOT NULL,
  approver_id UUID NOT NULL REFERENCES auth.users(id),
  decision approval_decision NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loan_approvals ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_approvals_loan ON public.loan_approvals(loan_id, created_at DESC);

-- ===== LOAN DOCUMENTS =====
CREATE TABLE public.loan_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INT NOT NULL,
  mime_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loan_documents ENABLE ROW LEVEL SECURITY;

-- ===== NOTIFICATIONS =====
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notif_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifs_user ON public.notifications(user_id, created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ===== RLS POLICIES =====
-- profiles: user reads own; staff reads all; user updates own
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- user_roles: user reads own; admin manages
CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles admin insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles admin update" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles admin delete" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- transactions: user reads own; staff reads all; only staff inserts (members can't fake deposits)
CREATE POLICY "tx self read" ON public.transactions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "tx staff insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- loans: member reads own; staff reads all; member inserts own
CREATE POLICY "loans member read" ON public.loans FOR SELECT TO authenticated USING (member_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "loans member create" ON public.loans FOR INSERT TO authenticated WITH CHECK (member_id = auth.uid());
CREATE POLICY "loans staff update" ON public.loans FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- loan_approvals: visible to loan owner + staff; staff inserts
CREATE POLICY "approvals read" ON public.loan_approvals FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.member_id = auth.uid()));
CREATE POLICY "approvals staff insert" ON public.loan_approvals FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND approver_id = auth.uid());

-- loan_documents: visible to loan owner + staff; loan owner or staff inserts
CREATE POLICY "docs read" ON public.loan_documents FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.member_id = auth.uid()));
CREATE POLICY "docs insert" ON public.loan_documents FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND (public.is_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.member_id = auth.uid())));

-- notifications: read/update own
CREATE POLICY "notif self read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif self update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ===== TRIGGERS =====
-- Profile + member role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_num TEXT;
BEGIN
  v_num := 'WS-' || lpad((floor(random()*900000)+100000)::text, 6, '0');
  INSERT INTO public.profiles (user_id, full_name, phone, member_number)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.raw_user_meta_data->>'phone', v_num);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (NEW.id, 'system', 'Welcome to WASSHA SACCOS', 'Your member account is ready. Start saving and apply for loans.');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Notify on deposit
CREATE OR REPLACE FUNCTION public.notify_on_tx()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tx_type IN ('deposit','contribution') THEN
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (NEW.user_id, 'deposit', 'Deposit confirmed',
            format('TZS %s credited to your account.', NEW.amount));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tx_notify AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.notify_on_tx();

-- Notify on loan stage/status change
CREATE OR REPLACE FUNCTION public.notify_on_loan_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.member_id, 'loan_update', 'Loan application submitted',
      format('Your loan %s for TZS %s is being reviewed.', NEW.loan_number, NEW.amount_requested),
      '/loans/' || NEW.id);
  ELSIF TG_OP = 'UPDATE' AND (OLD.stage IS DISTINCT FROM NEW.stage OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (NEW.member_id, 'loan_rejected', 'Loan rejected',
        format('Your loan %s was rejected.', NEW.loan_number),
        '/loans/' || NEW.id);
    ELSIF NEW.status = 'approved' OR NEW.stage = 'disbursement' THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (NEW.member_id, 'loan_approved', 'Loan approved',
        format('Your loan %s has been approved.', NEW.loan_number),
        '/loans/' || NEW.id);
    ELSE
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (NEW.member_id, 'loan_update', 'Loan status updated',
        format('Loan %s moved to %s.', NEW.loan_number, NEW.stage),
        '/loans/' || NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loan_notify_ins BEFORE INSERT ON public.loans FOR EACH ROW EXECUTE FUNCTION public.notify_on_loan_change();
CREATE TRIGGER loan_notify_upd BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.notify_on_loan_change();

-- Notify approver actions to member
CREATE OR REPLACE FUNCTION public.notify_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_member UUID; v_num TEXT;
BEGIN
  SELECT member_id, loan_number INTO v_member, v_num FROM public.loans WHERE id = NEW.loan_id;
  IF NEW.decision = 'docs_requested' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_member, 'docs_requested', 'Additional documents requested',
      format('Loan %s: %s', v_num, COALESCE(NEW.comment,'Please upload more documents.')),
      '/loans/' || NEW.loan_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approval_notify AFTER INSERT ON public.loan_approvals FOR EACH ROW EXECUTE FUNCTION public.notify_on_approval();

-- ===== STORAGE BUCKET =====
INSERT INTO storage.buckets (id, name, public) VALUES ('loan-documents', 'loan-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "loan docs read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'loan-documents' AND (
  public.is_staff(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text
));
CREATE POLICY "loan docs insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'loan-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
