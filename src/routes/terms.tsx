import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import {
  FileText,
  Scale,
  Users,
  Gavel,
  Wallet,
  Receipt,
  AlertTriangle,
  RotateCcw,
  Mail,
} from "lucide-react";

const URL = "https://wassha-saccos.lovable.app/terms";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — WASSHA SACCOS" },
      {
        name: "description",
        content:
          "Terms and conditions for using the WASSHA SACCOS member savings and loans platform.",
      },
      { property: "og:title", content: "Terms of Service — WASSHA SACCOS" },
      {
        property: "og:description",
        content:
          "Terms and conditions for using the WASSHA SACCOS member savings and loans platform.",
      },
      { property: "og:url", content: URL },
      { name: "twitter:title", content: "Terms of Service — WASSHA SACCOS" },
      {
        name: "twitter:description",
        content:
          "Terms and conditions for using the WASSHA SACCOS member savings and loans platform.",
      },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: TermsPage,
});

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="bg-[image:var(--gradient-hero)] py-14 text-primary-foreground">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">Legal</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">Terms of Service</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/85">
            These terms set out the rules for using the WASSHA SACCOS platform. Please read them
            carefully. By using the platform, you agree to these terms.
          </p>
        </div>
      </div>

      <article className="container mx-auto max-w-3xl px-4 pb-20">
        <p className="mt-10 text-sm text-muted-foreground">
          <strong>Last updated:</strong> {new Date().getFullYear()}. These Terms of Service apply to
          all users of the WASSHA SACCOS website, member portal, dashboards, and related services
          operated by or on behalf of WASSHA SACCOS. If you do not agree with these terms, you must
          not use the platform.
        </p>

        <Section icon={FileText} title="About these terms">
          <p>
            WASSHA SACCOS is a digital cooperative platform for managing member savings, loans,
            statements, approvals, and reporting. These terms are a binding agreement between you
            and the WASSHA SACCOS organization that operates your account. Certain rules, fees, loan
            limits, and policies may be set by your organization and are communicated separately
            within the platform.
          </p>
        </Section>

        <Section icon={Users} title="Eligibility and accounts">
          <p>
            To use the platform you must be an approved member, staff member, or authorized user of
            WASSHA SACCOS. You agree to:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Provide accurate, complete, and up-to-date information.</li>
            <li>Keep your login credentials and multi-factor authentication factors secure.</li>
            <li>Notify your administrator immediately if you suspect unauthorized access.</li>
            <li>
              Use the platform only for lawful purposes and in line with your organization's rules.
            </li>
          </ul>
        </Section>

        <Section icon={Gavel} title="Loan applications and approvals">
          <p>
            Submitting a loan application does not guarantee approval. All loans are subject to the
            multi-stage review process configured by your organization, which may include branch
            review, finance review, board sign-off, and manager approval. Each approver may approve,
            request additional documents, reject, or forward the application. WASSHA SACCOS records
            every action in an audit trail.
          </p>
        </Section>

        <Section icon={Wallet} title="Disbursement and fees">
          <p>
            When a loan is approved and disbursed, the approved principal amount is credited to the
            member. The system calculates any applicable loan fee from the approved amount and
            attaches it to the loan as an outstanding fee balance. Members are responsible for
            repaying the principal, fees, and any penalties in accordance with the repayment
            schedule.
          </p>
        </Section>

        <Section icon={Receipt} title="Repayments and allocation">
          <p>
            Every repayment is applied in the following order unless your organization's policies
            state otherwise:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Outstanding fees</li>
            <li>Outstanding penalties</li>
            <li>Outstanding principal</li>
          </ul>
          <p>
            A loan is automatically marked as completed only when outstanding fees, penalties, and
            principal are all zero. Early or partial payments may not fully close a loan until all
            balances are cleared.
          </p>
        </Section>

        <Section icon={AlertTriangle} title="Default and penalties">
          <p>
            Missing scheduled repayments may result in late penalties, reporting to authorized
            bodies, and collection actions as permitted by your organization's policies and
            applicable law. Penalties are calculated according to the active loan policy at the time
            the repayment is due.
          </p>
        </Section>

        <Section icon={Scale} title="Roles and responsibilities">
          <p>
            The platform assigns roles such as member, branch approver, finance officer, board
            member, manager, and administrator. Each role has specific permissions and duties. You
            may only perform actions that your role authorizes. Delegated or proxy approvals must be
            granted through the platform's proxy workflow and are recorded in the audit log.
          </p>
        </Section>

        <Section icon={RotateCcw} title="Termination and suspension">
          <p>
            WASSHA SACCOS or your organization may suspend or terminate your access at any time if
            you violate these terms, attempt to misuse the platform, or for operational, legal, or
            security reasons. You may also request closure of your account through your
            administrator, subject to any outstanding loan or savings obligations.
          </p>
        </Section>

        <Section icon={Mail} title="Changes and contact">
          <p>
            These terms may be updated from time to time. Continued use of the platform after an
            update means you accept the revised terms. If you have questions about these terms,
            please contact your WASSHA SACCOS administrator.
          </p>
        </Section>

        <div className="mt-12 rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
          <p>
            These Terms of Service are app-owned content maintained by WASSHA SACCOS. They are not
            legal advice. Your organization may supplement them with additional policies or
            agreements.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            <Link to="/" className="text-primary hover:underline">
              Back to home
            </Link>
          </div>
        </div>
      </article>

      <AppFooter />
    </div>
  );
}
