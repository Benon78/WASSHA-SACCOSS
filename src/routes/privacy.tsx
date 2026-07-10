import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Shield, Lock, Eye, FileText, Trash2, Cookie, UserCheck, Mail } from "lucide-react";

const URL = "https://wassha-saccos.lovable.app/privacy";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — WASSHA SACCOS" },
      {
        name: "description",
        content: "How WASSHA SACCOS collects, uses, stores, and protects member and user data.",
      },
      { property: "og:title", content: "Privacy Policy — WASSHA SACCOS" },
      {
        property: "og:description",
        content: "How WASSHA SACCOS collects, uses, stores, and protects member and user data.",
      },
      { property: "og:url", content: URL },
      { name: "twitter:title", content: "Privacy Policy — WASSHA SACCOS" },
      {
        name: "twitter:description",
        content: "How WASSHA SACCOS collects, uses, stores, and protects member and user data.",
      },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: PrivacyPage,
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

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="bg-[image:var(--gradient-hero)] py-14 text-primary-foreground">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">Legal</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">Privacy Policy</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/85">
            This page explains how WASSHA SACCOS handles personal information. It is maintained by
            WASSHA SACCOS to answer common privacy questions about the platform.
          </p>
        </div>
      </div>

      <article className="container mx-auto max-w-3xl px-4 pb-20">
        <p className="mt-10 text-sm text-muted-foreground">
          <strong>Last updated:</strong> {new Date().getFullYear()}. This Privacy Policy describes
          how WASSHA SACCOS collects, uses, stores, and protects personal information when you use
          the WASSHA SACCOS platform, website, and related services. If you have questions about
          this policy or your personal data, please contact the administrator of your WASSHA SACCOS
          organization.
        </p>

        <Section icon={Shield} title="Information we collect">
          <p>
            We collect information needed to operate the cooperative platform and comply with
            applicable record-keeping requirements:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>Account information:</strong> name, email address, phone number, password, and
              role assigned by your organization.
            </li>
            <li>
              <strong>Member profile information:</strong> identification details, address,
              employment or income information, and next-of-kin details provided during onboarding.
            </li>
            <li>
              <strong>Financial information:</strong> savings balances, contributions, loan
              applications, approved amounts, disbursements, repayments, fees, and penalties.
            </li>
            <li>
              <strong>Documents:</strong> uploaded identity documents, proof of income, collateral
              records, and other supporting files submitted with loan applications.
            </li>
            <li>
              <strong>Usage data:</strong> login history, IP address, browser type, device
              information, and audit-log entries for security and accountability.
            </li>
          </ul>
        </Section>

        <Section icon={Eye} title="How we use your information">
          <p>We use the information we collect to:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Provide member savings, loan, and statement services.</li>
            <li>Process loan applications, approvals, disbursements, and repayments.</li>
            <li>
              Calculate eligibility, interest, fees, and penalties according to your policies.
            </li>
            <li>Send notifications about application status, repayments, and account activity.</li>
            <li>Maintain audit trails required for governance and compliance.</li>
            <li>Protect accounts, detect fraud, and resolve disputes.</li>
          </ul>
        </Section>

        <Section icon={Lock} title="How we protect your data">
          <p>
            We apply reasonable technical and organizational safeguards to protect personal and
            financial information, including:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Role-based access controls and row-level security so users can only access data they
              are authorized to see.
            </li>
            <li>Encryption in transit using modern transport security (TLS/HTTPS).</li>
            <li>
              Encrypted storage for sensitive data at rest, managed by the platform hosting
              provider.
            </li>
            <li>
              Audit logs that record key actions such as approvals, disbursements, and policy
              changes.
            </li>
            <li>Multi-factor authentication options for added account protection.</li>
          </ul>
          <p>
            No system can guarantee absolute security. You are responsible for keeping your password
            and authentication factors confidential.
          </p>
        </Section>

        <Section icon={FileText} title="Sharing and disclosure">
          <p>
            We do not sell personal information. We may share data only in the following limited
            circumstances:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>Within your organization:</strong> with staff, approvers, managers, and
              administrators who need access to perform their roles.
            </li>
            <li>
              <strong>Service providers:</strong> with hosting, authentication, and communication
              providers that help operate the platform under strict confidentiality.
            </li>
            <li>
              <strong>Legal requirements:</strong> when required by law, court order, or to protect
              the rights, property, or safety of WASSHA SACCOS, its members, or others.
            </li>
          </ul>
        </Section>

        <Section icon={Cookie} title="Cookies and analytics">
          <p>
            We use essential cookies to keep you signed in and maintain session security. We may
            also use analytics cookies to understand how the platform is used and to improve the
            user experience. You can manage cookie preferences through your browser settings.
            Disabling essential cookies may prevent you from signing in or using certain features.
          </p>
        </Section>

        <Section icon={Trash2} title="Data retention">
          <p>
            We keep your personal and financial information for as long as your account is active or
            as needed to provide services, maintain audit records, and comply with legal and
            regulatory obligations. When data is no longer required, it is securely deleted or
            anonymized according to your organization's retention policy.
          </p>
        </Section>

        <Section icon={UserCheck} title="Your rights">
          <p>
            Depending on your jurisdiction, you may have the right to access, correct, delete, or
            restrict the use of your personal information. To exercise these rights, contact your
            WASSHA SACCOS administrator. We will respond in accordance with applicable law and the
            policies set by your organization.
          </p>
        </Section>

        <Section icon={Mail} title="Contact us">
          <p>
            If you have questions about this Privacy Policy or how your data is handled, please
            contact your WASSHA SACCOS administrator or the organization that granted you access.
          </p>
        </Section>

        <div className="mt-12 rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
          <p>
            This Privacy Policy is app-owned content maintained by WASSHA SACCOS. It may be updated
            from time to time. Continued use of the platform after changes means you accept the
            revised policy.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
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
