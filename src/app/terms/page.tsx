import Link from "next/link";
import BrandIcon from "../brand-icon";

export default function TermsPage() {
  return (
    <main className="legal-page">
      <header className="site-header">
        <Link href="/" className="brand-lockup" aria-label="CartonLab home">
          <span className="brand-mark">
            <BrandIcon className="brand-mark-image" />
          </span>
          <span>CartonLab Lightweight 2.0</span>
        </Link>
        <Link href="/" className="back-link">
          Home
        </Link>
      </header>

      <article className="terms-content">
        <div className="eyebrow"><span /> CARTONLAB POLICIES</div>
        <h1>Terms of Use</h1>
        <p className="terms-effective-date">Effective date: November 13, 2026</p>
        <p>
          These Terms of Use (“Terms”) apply to CartonLab Lightweight 2.0,
          including its website, keyline designer, packaging templates, and
          exported files (the “Service”). By accessing or using the Service, you
          agree to these Terms. If you do not agree, do not use the Service.
        </p>

        <section>
          <h2>1. Accounts</h2>
          <p>
            You must be legally able to enter into an agreement to use the
            Service. You are responsible for keeping your sign-in credentials
            secure and for activity under your account. Keep your account
            information accurate and notify us if you believe your account has
            been accessed without permission.
          </p>
        </section>

        <section>
          <h2>2. The Service and acceptable use</h2>
          <p>
            CartonLab provides tools to select packaging keylines, enter
            dimensions, arrange artwork, and export or print design files. You
            may use the Service for lawful personal or business work.
          </p>
          <p>You must not use the Service to:</p>
          <ul>
            <li>break the law or violate another person&apos;s rights;</li>
            <li>
              interfere with, disrupt, probe, or attempt unauthorized access to
              the Service or its infrastructure;
            </li>
            <li>
              upload malicious code, abuse automated requests, or impair the
              Service for other users; or
            </li>
            <li>
              copy, extract, or resell the Service or its keyline catalog to
              build or supply a competing service, except where applicable law
              does not allow that restriction.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Free access, trials, and subscriptions</h2>
          <p>
            New accounts receive seven days of Premium access starting when the
            account is created. No payment method is required to begin the
            trial. When the trial expires, the account returns to the Free plan
            unless you start a paid subscription. Trial availability may be
            limited for accounts that already existed when the trial offer was
            introduced.
          </p>
          <p>
            Premium currently costs $5 USD per month. If you choose to subscribe
            during a free trial, the paid subscription starts immediately and
            the first charge is made at that time. Otherwise, a subscription
            renews monthly until canceled. You can cancel through your account;
            cancellation stops future renewals, while access already paid for
            remains available until the end of the current billing period.
          </p>
          <p>
            Paystack processes card payments and may have separate terms that
            apply to your payment. Refunds and other billing rights are subject
            to applicable law and any terms shown at checkout.
          </p>
        </section>

        <section>
          <h2>4. Your content and generated files</h2>
          <p>
            You retain your rights to artwork and other content you provide.
            You are responsible for having the rights needed to use that
            content. If you submit or transmit content through the Service, you
            allow CartonLab to use it only as needed to provide, secure, and
            support the features you request.
          </p>
          <p>
            You may use the files you create or export for your own projects,
            subject to these Terms and any rights in materials you add. The
            Service and its built-in software, templates, and catalog remain
            CartonLab&apos;s or its licensors&apos; property; using the Service
            does not transfer ownership of those materials to you.
          </p>
        </section>

        <section>
          <h2>5. Review designs before production</h2>
          <p>
            Keylines and exports are generated as design aids. You must review
            dimensions, units, allowances, scaling, material requirements, and
            machine compatibility before printing, manufacturing, or relying on
            an output. CartonLab does not certify that a design complies with a
            particular packaging standard or is suitable for a specific
            production process.
          </p>
        </section>

        <section>
          <h2>6. Changes and availability</h2>
          <p>
            We may update, suspend, or discontinue parts of the Service to
            maintain or improve it, or for security, legal, or operational
            reasons. We may suspend or restrict an account that materially
            violates these Terms or puts the Service or others at risk.
          </p>
        </section>

        <section>
          <h2>7. Disclaimers and liability</h2>
          <p>
            To the extent allowed by law, the Service is provided “as is” and
            “as available,” without a promise that it will be uninterrupted,
            error-free, or suitable for every purpose. You remain responsible
            for checking files before production.
          </p>
          <p>
            To the extent permitted by law, CartonLab is not responsible for
            indirect or consequential losses, including lost profits, lost
            data, or production losses arising from use of the Service. Nothing
            in these Terms excludes liability or consumer rights that cannot
            legally be excluded or limited.
          </p>
        </section>

        <section>
          <h2>8. Changes to these Terms</h2>
          <p>
            We may revise these Terms as the Service changes or as required by
            law. The effective date above shows when this version took effect.
            If you continue using the Service after revised Terms take effect,
            that use is subject to the revised Terms. If you do not agree, stop
            using the Service and cancel any paid subscription.
          </p>
        </section>

        <p>
          These Terms do not limit any rights you have under laws that apply to
          you. Questions about the Terms can be raised through the contact
          channel made available by CartonLab.
        </p>
      </article>

      <footer className="site-footer">
        <Link href="/" className="brand-lockup footer-brand">
          <span className="brand-mark">
            <BrandIcon className="brand-mark-image" />
          </span>
          <span>CartonLab Lightweight 2.0</span>
        </Link>
        <span>Terms of Use</span>
        <nav className="site-footer-meta" aria-label="Footer">
          <Link href="/terms">Terms of Use</Link>
          <span>© 2026 CartonLab</span>
          <Link href="/">Home</Link>
        </nav>
      </footer>
    </main>
  );
}
