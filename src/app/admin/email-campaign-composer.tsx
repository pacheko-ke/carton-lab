"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createEmailCampaign } from "./actions";

type Audience = "premium" | "free";
type AudienceCounts = Record<Audience, number>;

function QueueButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="button button-large admin-email-submit"
      type="submit"
      disabled={pending}
    >
      {pending ? "Queueing campaign…" : "Queue campaign"}
      <span aria-hidden="true">→</span>
    </button>
  );
}

export default function EmailCampaignComposer({
  audienceCounts,
}: {
  audienceCounts: AudienceCounts;
}) {
  const [audience, setAudience] = useState<Audience>("premium");
  const [subject, setSubject] = useState("");
  const [heading, setHeading] = useState("");
  const [message, setMessage] = useState("");

  return (
    <div className="admin-email-layout">
      <form action={createEmailCampaign} className="admin-campaign-form">
        <fieldset className="admin-audience-fieldset">
          <legend>
            <span className="admin-email-step">01</span>
            Choose your audience
          </legend>
          <div className="admin-audience-options">
            <label
              className={`admin-audience-option${audience === "premium" ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name="audience"
                value="premium"
                checked={audience === "premium"}
                onChange={() => setAudience("premium")}
              />
              <span className="admin-audience-mark" aria-hidden="true">P</span>
              <span className="admin-audience-copy">
                <strong>Premium members</strong>
                <small>
                  Product news and feature announcements
                  <span className="admin-audience-count">
                    {audienceCounts.premium.toLocaleString()} eligible now
                  </span>
                </small>
              </span>
              <span className="admin-audience-check" aria-hidden="true" />
            </label>
            <label
              className={`admin-audience-option${audience === "free" ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name="audience"
                value="free"
                checked={audience === "free"}
                onChange={() => setAudience("free")}
              />
              <span className="admin-audience-mark is-free" aria-hidden="true">F</span>
              <span className="admin-audience-copy">
                <strong>Free members</strong>
                <small>
                  Premium features and upgrade offers
                  <span className="admin-audience-count">
                    {audienceCounts.free.toLocaleString()} eligible now
                  </span>
                </small>
              </span>
              <span className="admin-audience-check" aria-hidden="true" />
            </label>
          </div>
          <p className="admin-email-field-hint">
            Only verified users who opted in are included. Active trials are
            excluded from Free campaigns. Counts are estimates and are checked
            again when queued.
          </p>
        </fieldset>

        <div className="admin-email-section-label">
          <span className="admin-email-step">02</span>
          <span>Write your email</span>
        </div>
        <div className="admin-email-content-fields">
          <label className="admin-campaign-field">
            <span>Email subject</span>
            <input
              name="subject"
              type="text"
              maxLength={150}
              placeholder="A clear subject that sets expectations"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
            />
            <small>Shown in the recipient&apos;s inbox.</small>
          </label>
          <label className="admin-campaign-field">
            <span>Email heading</span>
            <input
              name="heading"
              type="text"
              maxLength={120}
              placeholder="The main headline in your email"
              value={heading}
              onChange={(event) => setHeading(event.target.value)}
              required
            />
          </label>
        </div>

        <label className="admin-campaign-field">
          <span className="admin-email-message-label">
            <span>Message</span>
            <small>{message.length}/4000</small>
          </span>
          <textarea
            name="message"
            rows={7}
            maxLength={4000}
            placeholder="Write a concise update for your selected audience…"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
          />
          <small>Line breaks are preserved in the delivered email.</small>
        </label>

        <div className="admin-email-submit-row">
          <p>
            Up to 100 emails are processed per daily run. Larger campaigns
            continue automatically.
          </p>
          <QueueButton />
        </div>
      </form>

      <aside className="admin-email-preview" aria-label="Live email preview">
        <div className="admin-email-preview-toolbar">
          <div>
            <span className="admin-email-preview-dot" />
            <span>LIVE PREVIEW</span>
          </div>
          <span className="admin-email-preview-audience">
            {audience === "premium" ? "PREMIUM" : "FREE"}
          </span>
        </div>
        <div className="admin-email-inbox">
          <div className="admin-email-inbox-label">SUBJECT</div>
          <p>{subject || "Your email subject will appear here"}</p>
          <div className="admin-email-inbox-sender">
            <span className="admin-email-sender-mark">C</span>
            <span>
              <strong>CartonLab</strong>
              <small>to opted-in {audience} members</small>
            </span>
          </div>
        </div>
        <div className="admin-email-preview-card">
          <div className="admin-email-preview-brand">
            <span className="admin-email-brand-mark">C</span>
            <span>CARTONLAB</span>
          </div>
          <h3>{heading || "Your email heading"}</h3>
          <p className={message ? "" : "is-placeholder"}>
            {message || "Your message will appear here as you write it."}
          </p>
          <span className="admin-email-preview-cta">
            Open CartonLab <span aria-hidden="true">→</span>
          </span>
          <div className="admin-email-preview-footer">
            CartonLab · Packaging design, made simple
            <span>Unsubscribe</span>
          </div>
        </div>
        <p className="admin-email-preview-note">
          This preview updates as you write. Each email includes an
          unsubscribe link and is sent only to the selected, opted-in audience.
        </p>
      </aside>
    </div>
  );
}
