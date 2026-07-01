
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.assistant_escalations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raised_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
  target_stage public.loan_stage,
  category TEXT NOT NULL CHECK (category IN ('approval','delegation','question','other')),
  notes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','dismissed')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.assistant_escalations TO authenticated;
GRANT ALL ON public.assistant_escalations TO service_role;

ALTER TABLE public.assistant_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "escalations read own or staff" ON public.assistant_escalations
  FOR SELECT TO authenticated
  USING (raised_by = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "escalations insert self" ON public.assistant_escalations
  FOR INSERT TO authenticated
  WITH CHECK (raised_by = auth.uid());

CREATE POLICY "escalations staff update" ON public.assistant_escalations
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_esc_updated
  BEFORE UPDATE ON public.assistant_escalations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_esc_audit
  AFTER INSERT OR UPDATE ON public.assistant_escalations
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE OR REPLACE FUNCTION public.notify_on_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_link TEXT;
BEGIN
  v_link := CASE WHEN NEW.loan_id IS NOT NULL THEN '/loans/'||NEW.loan_id ELSE '/approvals' END;
  FOR r IN SELECT DISTINCT user_id FROM public.user_roles
           WHERE role IN ('approver','finance','manager','admin') LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (r.user_id, 'system',
            'Assistant escalation: '||NEW.category,
            left(NEW.notes, 240), v_link);
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_esc_notify
  AFTER INSERT ON public.assistant_escalations
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_escalation();

CREATE OR REPLACE FUNCTION public.log_assistant_action(
  _action TEXT, _entity TEXT, _entity_id UUID, _meta JSONB
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'assistant:'||_action, _entity, _entity_id,
          COALESCE(_meta,'{}'::jsonb) || jsonb_build_object('source','ai_assistant'));
END $$;

REVOKE ALL ON FUNCTION public.log_assistant_action(TEXT,TEXT,UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_assistant_action(TEXT,TEXT,UUID,JSONB) TO authenticated;
