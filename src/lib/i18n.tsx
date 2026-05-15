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
    welcome_back: "Welcome back",
    apply_for_loan: "Apply for loan",
    open_approvals: "Open approvals",
    total_savings: "Total savings",
    active_loan_balance: "Active loan balance",
    eligible_to_borrow: "Eligible to borrow",
    active_loans: "Active loans",
    recent_transactions: "Recent transactions",
    recent_loans: "Recent loans",
    view_all: "View all",
    no_transactions: "No transactions yet.",
    no_loans: "No loans yet. Apply for your first loan.",
    member: "Member",
    member_number: "Member #",
    save: "Save",
    cancel: "Cancel",
    loading: "Loading…",
    delegate_review: "Delegate review",
    register_existing_intro: "Onboard a member with a pre-existing loan balance.",
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
    welcome_back: "Karibu tena",
    apply_for_loan: "Omba mkopo",
    open_approvals: "Fungua idhini",
    total_savings: "Akiba ya jumla",
    active_loan_balance: "Salio la mkopo amilifu",
    eligible_to_borrow: "Unaostahili kukopa",
    active_loans: "Mikopo amilifu",
    recent_transactions: "Miamala ya hivi karibuni",
    recent_loans: "Mikopo ya hivi karibuni",
    view_all: "Tazama yote",
    no_transactions: "Hakuna miamala bado.",
    no_loans: "Hakuna mikopo bado. Omba mkopo wako wa kwanza.",
    member: "Mwanachama",
    member_number: "Nambari ya mwanachama",
    save: "Hifadhi",
    cancel: "Ghairi",
    loading: "Inapakia…",
    delegate_review: "Kabidhi tathmini",
    register_existing_intro: "Sajili mwanachama mwenye salio la mkopo lililopo.",
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
