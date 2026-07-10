import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Spinner } from "@/components/status/LoadingState";

export const Route = createFileRoute("/auth/callback")({
  component: Callback,
});

function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    async function finishLogin() {
      await supabase.auth.getSession();

      navigate({
        to: "/dashboard",
        replace: true,
      });
    }

    void finishLogin();
  }, [navigate]);

  return <Spinner label="Signing you in..."></Spinner>;
}
