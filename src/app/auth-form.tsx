import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isGoogleAuthConfigured } from "@/auth-config";
import BrandIcon from "./brand-icon";
import { signInWithGoogle, signOutOfCartonLab } from "./auth-actions";

type AuthFormProps = {
  mode: "login" | "signup";
  error?: string | string[];
};

export function AuthLoading() {
  return (
    <main className="auth-page">
      <section className="auth-content">
        <div className="auth-card">
          <div className="auth-card-top">
            <div className="auth-mini-mark">
              <BrandIcon className="auth-mini-mark-image" />
            </div>
            <div className="eyebrow"><span /> YOUR PACKAGING WORKSPACE</div>
            <h1>Loading sign-in…</h1>
            <p>Preparing your secure Google sign-in.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark">
      <BrandIcon className="brand-mark-image" />
    </span>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="google-mark" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 5)" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 38.05 46.98 31.95 46.98 24.55Z" />
      <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z" transform="translate(0 5)" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.13 1.43-4.86 2.3-8.18 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" transform="translate(0 -5)" />
    </svg>
  );
}

export default async function AuthForm({ mode, error }: AuthFormProps) {
  const isSignup = mode === "signup";
  const configured = isGoogleAuthConfigured();
  const session = configured ? await auth() : null;
  const isUnverifiedEmailError =
    error === "UnverifiedEmail" ||
    (Array.isArray(error) && error.includes("UnverifiedEmail"));

  if (session?.user.isEmailVerified) {
    redirect("/app");
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration" aria-hidden="true">
        <span className="auth-line auth-line-one" />
        <span className="auth-line auth-line-two" />
        <span className="auth-orb" />
        <span className="auth-grid" />
      </div>
      <header className="auth-header">
        <Link href="/" className="brand-lockup" aria-label="CartonLab home">
          <BrandMark />
          <span>CartonLab Lightweight 2.0</span>
        </Link>
        <Link href="/" className="back-link">← Back to home</Link>
      </header>
      <section className="auth-content">
        <div className="auth-card">
          <div className="auth-card-top">
            <div className="auth-mini-mark">
              <BrandIcon className="auth-mini-mark-image" />
            </div>
            <div className="eyebrow"><span /> YOUR PACKAGING WORKSPACE</div>
            <h1>{isSignup ? "Start making." : "Welcome back."}</h1>
            <p>
              {isSignup
                ? "Create your CartonLab account with Google."
                : "Sign in securely with your Google account."}
            </p>
          </div>
          {isUnverifiedEmailError && (
            <p className="auth-config-notice" role="alert">
              Your Google sign-in succeeded, but your account&apos;s verification
              status was out of date. Sign out and sign back in to refresh it.
            </p>
          )}
          {session?.user ? (
            <div className="auth-signed-in">
              <p>
                Signed in as <b>{session.user.name || session.user.email}</b>
              </p>
              <Link href="/app" className="button auth-submit">
                Open the designer <span>→</span>
              </Link>
              <form action={signOutOfCartonLab}>
                <button type="submit" className="auth-signout">Sign out</button>
              </form>
            </div>
          ) : (
            <>
              {(error === "AccessDenied" ||
                (Array.isArray(error) && error.includes("AccessDenied"))) && (
                <p className="auth-config-notice" role="alert">
                  Google did not confirm a verified email address, so access
                  was denied. Sign in with a Google account that has a verified
                  email.
                </p>
              )}
              <form action={signInWithGoogle} className="google-auth-form">
                <button
                  type="submit"
                  className="google-button"
                  disabled={!configured}
                >
                  <GoogleMark />
                  {isSignup ? "Sign up with Google" : "Continue with Google"}
                </button>
              </form>
              {!configured && (
                <p className="auth-config-notice" role="status">
                  Google sign-in is not ready yet. Configure AUTH_SECRET,
                  AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, and POSTGRES_PRISMA_URL.
                </p>
              )}
            </>
          )}
          <div className="auth-switch">
            {isSignup ? "Already have an account?" : "New to CartonLab?"}{" "}
            <Link href={isSignup ? "/login" : "/signup"}>
              {isSignup ? "Log in" : "Create an account"}
            </Link>
          </div>
          <div className="auth-privacy">
            <span>◇</span> Google-only sign-in. Your password is never shared with CartonLab.
          </div>
        </div>
        <p className="auth-footnote">
          Design confidently. Get the dimensions right. Make something that fits.
        </p>
      </section>
    </main>
  );
}
