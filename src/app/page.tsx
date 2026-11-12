import Image from "next/image";
import Link from "next/link";
import BrandIcon from "./brand-icon";

const features = [
  {
    number: "01",
    title: "Pick a keyline",
    description:
      "Start with packaging styles for everyday cartons, trays, pizza boxes, and more.",
  },
  {
    number: "02",
    title: "Make it yours",
    description:
      "Fine-tune dimensions, board allowances, artwork, and layout in one workspace.",
  },
  {
    number: "03",
    title: "Ready for the floor",
    description:
      "Preview your dieline, then export a clean file or print a production-ready sheet.",
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
        <Link href="/" className="brand-lockup" aria-label="CartonLab home">
          <span className="brand-mark"><BrandIcon className="brand-mark-image" /></span>
          <span>CartonLab Lightweight 2.0</span>
        </Link>
        <details className="header-menu">
          <summary aria-label="Toggle navigation menu">
            <span />
            <span />
            <span />
          </summary>
          <nav aria-label="Main navigation">
            <Link href="/" aria-current="page">Home</Link>
            <a href="#how-it-works">How it works</a>
            <Link href="/login">Sign in</Link>
            <Link href="/signup" className="button button-small">
              Sign up <span>↗</span>
            </Link>
          </nav>
        </details>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><span /> PACKAGING DESIGN, WITHOUT THE FRICTION</div>
          <h1>Good ideas.<br />Well <span>boxed.</span></h1>
          <p className="hero-description">
            Go from carton dimensions to a production-ready keyline in minutes.
            No blank page, no guesswork—just a better way to build.
          </p>
          <div className="hero-actions">
            <Link href="/signup" className="button button-large">
              Get started free <span>→</span>
            </Link>
            <Link href="/app" className="text-link">Explore the tool <span>↗</span></Link>
          </div>
          <div className="hero-note">
            <span className="note-icon">✳</span>
            Built for the people who make packaging happen.
          </div>
        </div>
        <KeylineArtwork />
      </section>

      <section className="proof-strip" aria-label="Product highlights">
        <div><span className="proof-icon">⌗</span><span><b>Real-world keylines</b><small>Practical box styles to start from</small></span></div>
        <div><span className="proof-icon">⌁</span><span><b>Dimensions in control</b><small>Adjust the details as you go</small></span></div>
        <div><span className="proof-icon">↗</span><span><b>Files that travel</b><small>Export, print, and share with ease</small></span></div>
      </section>

      <section className="steps-section" id="how-it-works">
        <div className="section-heading">
          <div>
            <div className="eyebrow"><span /> YOUR NEXT BOX STARTS HERE</div>
            <h2>From first fold to <span>final file.</span></h2>
          </div>
          <p>Less time laying out lines. More time getting the details right.</p>
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
      </section>

      <section className="closing-cta">
        <div>
          <span className="closing-spark">✳</span>
          <h2>Let&apos;s make something<br />worth opening.</h2>
          <p>Your next carton keyline is a few clicks away.</p>
        </div>
        <Link href="/signup" className="button button-large">
          Create your free account <span>→</span>
        </Link>
      </section>

      <footer className="site-footer">
        <Link href="/" className="brand-lockup footer-brand">
          <span className="brand-mark"><BrandIcon className="brand-mark-image" /></span>
          <span>CartonLab Lightweight 2.0</span>
        </Link>
        <span>Thoughtful keylines. Better packaging.</span>
        <Link href="/login">Already have an account? <b>Log in</b></Link>
      </footer>
    </main>
  );
}
