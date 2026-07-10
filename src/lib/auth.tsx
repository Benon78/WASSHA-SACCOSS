import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { recordSession } from "@/lib/session-tracker.functions";
import { logAuthEvent } from "@/lib/auth-log.functions";
import type { Session, User } from "@supabase/supabase-js";

import {
  can as canDo,
  hasAnyRole as ctxHasAnyRole,
  hasBoardSeat as ctxHasBoardSeat,
  hasMinRole as ctxHasMinRole,
  hasRole as ctxHasRole,
  isStaff as ctxIsStaff,
  type AppRole,
  type BoardSeat,
  type Permission,
} from "@/lib/permissions";

export type { AppRole, BoardSeat, Permission };

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  boardSeats: BoardSeat[];
  loading: boolean;
  isStaff: boolean;
  hasRole: (r: AppRole) => boolean;
  hasAnyRole: (r: AppRole[]) => boolean;
  hasMinRole: (r: AppRole) => boolean;
  hasBoardSeat: (s: BoardSeat) => boolean;
  can: (p: Permission) => boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  /** True immediately after a PASSWORD_RECOVERY event. Reset pages watch this. */
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [boardSeats, setBoardSeats] = useState<BoardSeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  // Track the current user id so we only refetch roles when identity changes.
  const currentUserId = useRef<string | null>(null);

  const loadRoles = useCallback(async (uid: string) => {
    try {
      const [{ data: r }, { data: b }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("loan_board_members").select("seat").eq("user_id", uid),
      ]);
      setRoles(((r ?? []) as Array<{ role: string }>).map((x) => x.role as AppRole));
      setBoardSeats(((b ?? []) as Array<{ seat: string }>).map((x) => x.seat as BoardSeat));
    } catch {
      // Non-fatal: RLS/network hiccup shouldn't lock the UI.
      setRoles([]);
      setBoardSeats([]);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;

      // Always keep session/user fresh so bearer attacher sees the newest token.
      setSession(s);
      setUser(s?.user ?? null);

      switch (event) {
        case "INITIAL_SESSION":
        case "SIGNED_IN": {
          const nextId = s?.user?.id ?? null;
          if (nextId && nextId !== currentUserId.current) {
            currentUserId.current = nextId;
            // Defer to avoid running inside the auth callback stack.
            setTimeout(() => {
              void loadRoles(nextId);
            }, 0);
          } else if (!nextId) {
            currentUserId.current = null;
            setRoles([]);
            setBoardSeats([]);
          }
          // Record this session so Super Admin Security Center sees it.
          if (nextId && s?.access_token) {
            const marker = s.access_token.split(".").pop()?.slice(-16) ?? nextId;
            setTimeout(() => {
              void recordSession({ data: { sessionId: marker } }).catch(() => undefined);
            }, 0);
            // Log successful sign-in once per identity transition.
            if (event === "SIGNED_IN") {
              const provider =
                (s?.user?.app_metadata as { provider?: string } | undefined)?.provider ?? "email";
              setTimeout(() => {
                void logAuthEvent({
                  data: {
                    eventType: "login",
                    userId: nextId,
                    email: s?.user?.email ?? null,
                    provider,
                    sessionId: marker,
                  },
                }).catch(() => undefined);
              }, 0);
            }
          }
          break;
        }
        case "TOKEN_REFRESHED":
          // Token rotation — nothing else to reload. Router/query cache stays intact.
          break;
        case "USER_UPDATED":
          if (s?.user?.id) {
            setTimeout(() => {
              void loadRoles(s.user!.id);
            }, 0);
          }
          break;
        case "PASSWORD_RECOVERY":
          setIsPasswordRecovery(true);
          break;
        case "SIGNED_OUT": {
          const prevId = currentUserId.current;
          currentUserId.current = null;
          setRoles([]);
          setBoardSeats([]);
          setIsPasswordRecovery(false);
          if (prevId) {
            setTimeout(() => {
              void logAuthEvent({ data: { eventType: "logout", userId: prevId } }).catch(
                () => undefined,
              );
            }, 0);
          }
          // Stop in-flight protected queries before they 401.
          void queryClient.cancelQueries();
          queryClient.clear();
          break;
        }
        default:
          break;
      }
    });

    // Prime the session on mount (covers hard refresh; onAuthStateChange also
    // fires INITIAL_SESSION but we still need to end the loading flash).
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        currentUserId.current = s.user.id;
        void loadRoles(s.user.id);
        // Prime the session tracker immediately so a hard refresh still
        // shows the current user in Security Center even if INITIAL_SESSION
        // is delayed or racy.
        if (s.access_token) {
          const marker = s.access_token.split(".").pop()?.slice(-16) ?? s.user.id;
          void recordSession({ data: { sessionId: marker } }).catch(() => undefined);
        }
      }
      setLoading(false);
    });

    // Heartbeat: while signed in, refresh the session-tracker row every 60s
    // so the Super Admin → Security Center reliably shows the active session
    // (last_seen stays fresh, and lost rows are re-inserted).
    const heartbeat = window.setInterval(() => {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (!mounted || !s?.user || !s.access_token) return;
        const marker = s.access_token.split(".").pop()?.slice(-16) ?? s.user.id;
        void recordSession({ data: { sessionId: marker } }).catch(() => undefined);
      });
    }, 60_000);

    return () => {
      mounted = false;
      window.clearInterval(heartbeat);
      subscription.unsubscribe();
    };
  }, [loadRoles, queryClient]);

  const permCtx = { roles, boardSeats };

  const value: AuthCtx = {
    user,
    session,
    roles,
    boardSeats,
    loading,
    isStaff: ctxIsStaff(permCtx),
    hasRole: (r) => ctxHasRole(permCtx, r),
    hasAnyRole: (r) => ctxHasAnyRole(permCtx, r),
    hasMinRole: (r) => ctxHasMinRole(permCtx, r),
    hasBoardSeat: (s) => ctxHasBoardSeat(permCtx, s),
    can: (p) => canDo(permCtx, p),
    signOut: async () => {
      // Ordered teardown per Sign-Out Hygiene: cancel → clear → signOut.
      // Navigation happens in the caller so we can use router.navigate() with replace.
      try {
        await queryClient.cancelQueries();
      } catch {
        /* noop */
      }
      queryClient.clear();
      await supabase.auth.signOut();
    },
    refreshRoles: async () => {
      if (currentUserId.current) await loadRoles(currentUserId.current);
    },
    isPasswordRecovery,
    clearPasswordRecovery: () => setIsPasswordRecovery(false),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
