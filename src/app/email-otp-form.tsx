"use client";

import { useActionState, useState } from "react";
import {
  requestEmailOtp,
  verifyEmailOtp,
  type EmailOtpActionState,
} from "./auth-actions";

type EmailOtpFormProps = {
  configured: boolean;
};

const initialState: EmailOtpActionState = { status: "idle" };

export default function EmailOtpForm({ configured }: EmailOtpFormProps) {
  const [email, setEmail] = useState("");
  const [codeEmail, setCodeEmail] = useState("");
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [requestState, requestAction, isRequesting] = useActionState(
    async (previousState: EmailOtpActionState, formData: FormData) => {
      const state = await requestEmailOtp(previousState, formData);
      if (state.status === "sent" && state.email) {
        setEmail(state.email);
        setCodeEmail(state.email);
        setShowCodeForm(true);
      }
      return state;
    },
    initialState,
  );
  const [resendState, resendAction, isResending] = useActionState(
    requestEmailOtp,
    initialState,
  );
  const [verifyState, verifyAction, isVerifying] = useActionState(
    verifyEmailOtp,
    initialState,
  );

  return (
    <>
      <div className="auth-divider"><span>OR</span></div>
      {!configured && (
        <p className="auth-config-notice" role="status">
          Email codes require AUTH_SECRET, POSTGRES_PRISMA_URL, and Resend
          credentials. Google sign-in requires Google OAuth credentials.
        </p>
      )}
      {configured && showCodeForm ? (
        <div className="email-otp-panel">
          <p className="email-otp-intro" role="status">
            Enter the six-digit code sent to <b>{codeEmail}</b>.
          </p>
          <form action={verifyAction} className="auth-form email-otp-form">
            <input type="hidden" name="email" value={codeEmail} />
            <label htmlFor="email-otp-code">
              Verification code
              <input
                autoComplete="one-time-code"
                id="email-otp-code"
                inputMode="numeric"
                maxLength={6}
                name="code"
                pattern="[0-9]{6}"
                placeholder="000000"
                required
                type="text"
              />
            </label>
            {verifyState.status === "error" && (
              <p className="email-otp-message" role="alert">
                {verifyState.message}
              </p>
            )}
            <button
              className="email-otp-submit"
              disabled={isVerifying}
              type="submit"
            >
              {isVerifying ? "Verifying…" : "Verify email and continue"}
            </button>
          </form>
          {resendState.message && (
            <p
              className={
                resendState.status === "error"
                  ? "email-otp-message"
                  : "email-otp-message email-otp-success"
              }
              role={resendState.status === "error" ? "alert" : "status"}
            >
              {resendState.message}
            </p>
          )}
          <div className="email-otp-links">
            <form action={resendAction}>
              <input type="hidden" name="email" value={codeEmail} />
              <button disabled={isResending} type="submit">
                {isResending ? "Sending…" : "Resend code"}
              </button>
            </form>
            <button
              onClick={() => setShowCodeForm(false)}
              type="button"
            >
              Use another email
            </button>
          </div>
        </div>
      ) : (
        <form action={requestAction} className="auth-form email-otp-form">
          <label htmlFor="email-otp-address">
            Email address
            <input
              autoComplete="email"
              id="email-otp-address"
              maxLength={254}
              name="email"
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </label>
          {requestState.status === "error" && (
            <p className="email-otp-message" role="alert">
              {requestState.message}
            </p>
          )}
          <button
            className="email-otp-submit"
            disabled={!configured || isRequesting}
            type="submit"
          >
            {isRequesting
              ? "Sending code…"
              : configured
                ? "Continue with email"
                : "Email sign-in unavailable"}
          </button>
        </form>
      )}
    </>
  );
}
