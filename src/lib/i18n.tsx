import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "sw";

const dict = {
  en: {
    nav_dashboard: "Dashboard",
    nav_loans: "My Loans",
    nav_statements: "Statements",
    nav_notifications: "Notifications",
    nav_approvals: "Approvals",
    nav_admin: "Admin",
    nav_policies: "Loan policies",
    nav_reports: "Reports",
    nav_audit: "Audit log",
    nav_board: "Board members",
    nav_profile: "My profile",
    sign_in: "Sign in",
    sign_out: "Sign out",
    get_started: "Get started",
    language: "Language",
    confirm_disbursement: "Confirm disbursement",
    mark_completed: "Mark as completed",
    register_existing_loan: "Register existing loan",
    opening_balance: "Opening balance",
  },
  sw: {
    nav_dashboard: "Dashibodi",
    nav_loans: "Mikopo Yangu",
    nav_statements: "Taarifa",
    nav_notifications: "Arifa",
    nav_approvals: "Idhini",
    nav_admin: "Msimamizi",
    nav_policies: "Sera za mikopo",
    nav_reports: "Ripoti",
    nav_audit: "Kumbukumbu",
    nav_board: "Wajumbe wa bodi",
    nav_profile: "Wasifu wangu",
    sign_in: "Ingia",
    sign_out: "Toka",
    get_started: "Anza",
    language: "Lugha",
    confirm_disbursement: "Thibitisha utoaji",
    mark_completed: "Weka kuwa imekamilika",
    register_existing_loan: "Sajili mkopo uliopo",
    opening_balance: "Salio la kuanzia",
  },
} as const;

type Key = keyof typeof dict["en"];

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Key) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (typeof window !== "undefined" ? ((localStorage.getItem("lang") as Lang) || "en") : "en"));
  useEffect(() => { try { localStorage.setItem("lang", lang); } catch {} }, [lang]);
  const value: I18nCtx = {
    lang,
    setLang: setLangState,
    t: (k) => (dict[lang] as Record<string, string>)[k] ?? (dict.en as Record<string, string>)[k] ?? k,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) return { lang: "en" as Lang, setLang: () => {}, t: (k: string) => k };
  return c;
}
