import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "member" | "approver" | "finance" | "manager" | "admin";
export type BoardSeat = "chair" | "member_1" | "member_2";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  boardSeats: BoardSeat[];
  loading: boolean;
  isStaff: boolean;
  hasRole: (r: AppRole) => boolean;
  hasBoardSeat: (s: BoardSeat) => boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [boardSeats, setBoardSeats] = useState<BoardSeat[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (uid: string) => {
    const [{ data: r }, { data: b }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("loan_board_members").select("seat").eq("user_id", uid),
    ]);
    setRoles((r ?? []).map((x: any) => x.role as AppRole));
    setBoardSeats((b ?? []).map((x: any) => x.seat as BoardSeat));
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadRoles(s.user.id), 0);
      } else {
        setRoles([]);
        setBoardSeats([]);
      }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadRoles(s.user.id);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    user, session, roles, boardSeats, loading,
    isStaff: roles.some((r) => ["approver", "finance", "manager", "admin"].includes(r)) || boardSeats.length > 0,
    hasRole: (r) => roles.includes(r),
    hasBoardSeat: (s) => boardSeats.includes(s),
    signOut: async () => { await supabase.auth.signOut(); },
    refreshRoles: async () => { if (user) await loadRoles(user.id); },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
