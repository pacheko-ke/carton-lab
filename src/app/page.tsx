import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import BrandLogo from "./brand-logo";

export const metadata: Metadata = {
  title: "CartonLab | Carton Keyline & Box Dieline Generator",
  description:
    "Create carton keylines and box dielines online. Customize dimensions, explore FEFCO-style packaging, and export production-ready PDF, SVG, or DXF with CartonLab.",
  keywords: [
    "carton keyline generator",
    "box dieline generator",
    "carton dieline software",
    "packaging design software",
    "FEFCO 0201 keyline",
    "FEFCO 0203 glue flap",
    "bulk carton keyline generator",
    "packaging dieline export",
  ],
  openGraph: {
    title: "CartonLab | Carton Keyline & Box Dieline Generator",
    description:
      "Turn box dimensions into production-ready carton keylines. Design, customize, and export with CartonLab.",
    type: "website",
  },
};

const features = [
  {
    number: "01",
    title: "Start from a proven dieline",
    description:
      "Browse carton, tray, pizza-box, and flower-box keylines. Start with RSC 0201 and its 0203-style glue flap; Premium unlocks the complete keyline library.",
  },
  {
    number: "02",
    title: "Get the dimensions right",
    description:
      "Set length, width, height, units, and board settings. Adjust flower-box strap holes from a practical 20 mm default.",
  },
  {
    number: "03",
    title: "Put your brand in the drawing",
    description:
      "Encode creator, company, role, contact, and address details in a QR beside the technical table. Premium lets you hide both together in exports.",
  },
  {
    number: "04",
    title: "Generate a batch with Premium",
    description:
      "Turn up to 500 Excel, CSV, or TXT rows into one combined PDF or a ZIP of individual PDFs. A sample Excel workbook makes setup easy.",
  },
  {
    number: "05",
    title: "Send production-ready files",
    description:
      "Export PDF, SVG, or DXF, print a keyline, or share it with your team. Add image and text artwork, then bookmark designs you use again.",
  },
  {
    number: "06",
    title: "Stay focused in the workspace",
    description:
      "Thumbnail and bulk selectors stay in sync, and each selection updates the artboard. Use grid and zoom controls, collapse long sidebar sections, and explore supported cartons in 3D.",
  },
];

function KeylineArtwork() {
  return (
    <div className="artwork-wrap" aria-label="Herbs Box keyline preview">
      <div className="artwork-glow" />
      <div className="artwork-card">
        <div className="artwork-toolbar">
          <div className="window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <span>KEYLINE PREVIEW</span>
          <span className="artwork-scale">HERBS BOX</span>
        </div>
        <div className="drawing-area">
          <div className="drawing-caption">HERBS BOX · KEYLINE</div>
          <Image
            className="keyline-drawing"
            src="/herbs-keyline.svg"
            alt="Herbs Box carton keyline with cut and crease lines"
            width={762}
            height={637}
          />
          <div className="artwork-legend">
            <span><i className="legend-cut" /> CUT</span>
            <span><i className="legend-crease" /> CREASE</span>
            <span className="legend-status"><i /> READY TO EXPORT</span>
          </div>
        </div>
        <div className="artwork-footer">
          <span>CartonLab Lightweight 2.0</span>
          <span>210 × 294.9 × 114.7 MM · 3 PLY</span>
        </div>
      </div>
      <div className="floating-chip">
        <span className="chip-check">✓</span>
        <span><b>Print-ready</b><small>PDF · SVG · DXF</small></span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <Link href="/" className="brand-lockup" aria-label="Carton Lab home">
          <BrandLogo className="brand-logo-image" />
        </Link>
        <nav className="header-desktop-nav" aria-label="Main navigation">
          <Link href="#pricing">Pricing</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/signup" className="button button-small">
            Sign up <span>↗</span>
          </Link>
        </nav>
        <details className="header-menu">
          <summary aria-label="Toggle navigation menu">
            <span />
            <span />
            <span />
          </summary>
          <nav aria-label="Mobile navigation">
            <Link href="#pricing">Pricing</Link>
            <Link href="/login">Sign in</Link>
            <Link href="/signup" className="button button-small">
              Sign up <span>↗</span>
            </Link>
          </nav>
        </details>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><span /> CARTON KEYLINE &amp; BOX DIELINE STUDIO</div>
          <h1>Turn dimensions into<br /><span>production-ready keylines.</span></h1>
          <p className="hero-description">
            Customize a proven packaging structure, then export a clean PDF,
            SVG, or DXF—without
            drawing every panel from scratch. Open the Studio online once, then
            keep working offline; bookmark changes sync when you reconnect.
          </p>
          <div className="hero-actions">
            <Link href="/signup" className="button button-large">
              Create your first keyline <span>→</span>
            </Link>
            <Link href="/app" className="text-link">Visit Studio <span>↗</span></Link>
          </div>
          <div className="hero-note">
            <span className="note-icon">✳</span>
            Made for packaging designers, converters, and box makers.
          </div>
        </div>
        <KeylineArtwork />
      </section>

      <section className="proof-strip" aria-label="Product highlights">
        <div><span className="proof-icon">⌗</span><span><b>Packaging-ready keylines</b><small>Cartons, trays, pizza &amp; flower boxes</small></span></div>
        <div><span className="proof-icon">⌁</span><span><b>Control every dimension</b><small>Including adjustable strap-hole sizing</small></span></div>
        <div><span className="proof-icon">↗</span><span><b>Production-friendly output</b><small>PDF, SVG, DXF and Premium batch PDFs</small></span></div>
        <div><span className="proof-icon">◉</span><span><b>Keep working offline</b><small>Cached keylines and bookmarks; bookmark changes sync online</small></span></div>
      </section>

      <section className="steps-section" id="how-it-works">
        <div className="section-heading">
          <div>
            <div className="eyebrow"><span /> A FASTER PACKAGING DESIGN WORKFLOW</div>
            <h2>Everything to build a better <span>box keyline.</span></h2>
          </div>
          <p>Design one carton precisely—or let Premium turn a spreadsheet into a whole batch.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <span className="feature-number">{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
        <div className="feature-cta">
          <div>
            <h3>Make your next dieline <span>the easy part.</span></h3>
            <p>Start designing with CartonLab and get from dimensions to a file your team can use.</p>
          </div>
          <Link href="/signup" className="button button-large">
            Start designing free <span>→</span>
          </Link>
        </div>
      </section>

      <section className="pricing-section" id="pricing" aria-labelledby="pricing-heading">
        <div className="pricing-intro">
          <div className="eyebrow"><span /> CLEAR, SIMPLE PRICING</div>
          <h2 id="pricing-heading">Start free—no credit card needed.</h2>
          <p>Explore CartonLab for free, then unlock the complete keyline library and batch tools with Premium.</p>
        </div>
        <article className="pricing-card" aria-labelledby="premium-plan-heading">
          <div className="pricing-card-copy">
            <span className="pricing-plan-label">CARTONLAB PREMIUM</span>
            <h3 id="premium-plan-heading">Everything for production-ready work.</h3>
            <ul className="pricing-feature-list">
              <li>Access to every packaging keyline</li>
              <li>PDF, SVG, and DXF exports for every keyline</li>
              <li>Bulk-generate up to 500 keylines from Excel, CSV, or TXT</li>
              <li>Customize export details, QR codes, dimensions, and carton colours</li>
            </ul>
          </div>
          <div className="pricing-card-action">
            <p className="pricing-price">$5<span> / month</span></p>
            <p className="pricing-price-note">Start free—no credit card needed.</p>
            <Link href="/signup" className="button button-large">
              Get Premium <span>→</span>
            </Link>
          </div>
        </article>
      </section>

      <footer className="site-footer">
        <Link href="/" className="brand-lockup footer-brand" aria-label="Carton Lab home">
          <BrandLogo className="brand-logo-image" />
        </Link>
        <nav className="site-footer-meta" aria-label="Footer">
          <Link href="/terms">Terms of Use</Link>
          <span>© 2026 CartonLab</span>
        </nav>
      </footer>
    </main>
  );
}
