type EmailDetail = {
  label: string;
  value: string;
};

type EmailAttachment = {
  filename: string;
  content: string;
  content_type?: string;
};

type ResendEmailInput = {
  to: string;
  idempotencyKey?: string;
  subject: string;
  heading: string;
  message: string;
  details?: EmailDetail[];
  attachments?: EmailAttachment[];
  action?: {
    label: string;
    href: string;
  };
  unsubscribeUrl?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function formatEmail(input: ResendEmailInput) {
  const message = escapeHtml(input.message).replace(/\r?\n/g, "<br>");
  const details = input.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:24px 0;border-top:1px solid #e0e8f0">${input.details
        .map(
          (detail) =>
            `<tr><td style="padding:11px 12px;border-bottom:1px solid #e0e8f0;color:#76879a;font-size:13px">${escapeHtml(detail.label)}</td><td style="padding:11px 12px;border-bottom:1px solid #e0e8f0;color:#20364a;font-size:13px;font-weight:700;text-align:right">${escapeHtml(detail.value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const action = input.action
    ? `<p style="margin:28px 0 8px"><a href="${escapeHtml(input.action.href)}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#39a9ed;color:#091626;text-decoration:none;font-weight:700">${escapeHtml(input.action.label)}</a></p>`
    : "";
  const textDetails = input.details?.length
    ? `\n\n${input.details.map((detail) => `${detail.label}: ${detail.value}`).join("\n")}`
    : "";
  const textAction = input.action
    ? `\n\n${input.action.label}: ${input.action.href}`
    : "";
  const unsubscribe = input.unsubscribeUrl
    ? `<p style="margin:22px 0 0;color:#76879a;font-size:12px">You are receiving product updates from PackStudio. <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#147cac">Unsubscribe</a></p>`
    : "";
  const textUnsubscribe = input.unsubscribeUrl
    ? `\n\nUnsubscribe: ${input.unsubscribeUrl}`
    : "";

  return {
    html: `<!doctype html>
<html>
  <body style="margin:0;background:#edf3f9;font-family:Arial,Helvetica,sans-serif;color:#20364a">
    <div style="display:none;max-height:0;overflow:hidden">PackStudio email notification</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf3f9;padding:36px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #d5e0ec;border-radius:16px;overflow:hidden">
            <tr>
              <td style="padding:26px 30px 28px;background:#091626;border-bottom:4px solid #39a9ed">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width:42px;height:42px;border-radius:11px;background:#102238;color:#66d3e8;text-align:center;vertical-align:middle;font-size:22px;font-weight:700">C</td>
                    <td style="padding-left:13px;vertical-align:middle">
                      <div style="color:#f0f7ff;font-size:15px;font-weight:700;letter-spacing:.02em">PackStudio</div>
                      <div style="margin-top:4px;color:#9aacc0;font-size:10px;font-weight:700;letter-spacing:.14em">PACKAGING DESIGN STUDIO</div>
                    </td>
                  </tr>
                </table>
                <h1 style="margin:25px 0 0;color:#f0f7ff;font-size:25px;line-height:1.3;letter-spacing:-.02em">${escapeHtml(input.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px">
                <p style="margin:0;color:#425466;font-size:15px;line-height:1.75">${message}</p>
                ${details}${action}${unsubscribe}
                <p style="margin:30px 0 0;padding-top:18px;border-top:1px solid #e0e8f0;color:#76879a;font-size:12px;line-height:1.6">PackStudio · Packaging design, made simple</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    text: `${input.heading}\n\n${input.message}${textDetails}${textAction}${textUnsubscribe}\n\nPackStudio`,
  };
}

export async function sendResendEmail(input: ResendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error("RESEND_API_KEY must be configured.");
  if (!from) throw new Error("RESEND_FROM_EMAIL must be configured.");

  const senderAddress = from.match(/<([^<>]+)>/)?.[1]?.trim() ?? from.trim();
  const email = formatEmail(input);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : {}),
    },
    body: JSON.stringify({
      from: `PackStudio <${senderAddress}>`,
      to: [input.to],
      subject: input.subject,
      html: email.html,
      text: email.text,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Resend rejected the email (HTTP ${response.status}).`);
  }
}

export function getAdminEmailRecipients() {
  return [
    ...new Set(
      (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean),
    ),
  ];
}

export function getEmailAlertRecipients(userEmail?: string | null) {
  return [
    ...new Map(
      [...getAdminEmailRecipients(), ...(userEmail ? [userEmail] : [])].map(
        (email) => [email.toLowerCase(), email],
      ),
    ).values(),
  ];
}

export async function sendEmailAlert(
  email: Omit<ResendEmailInput, "to"> & { recipients: string[] },
) {
  const { recipients, ...message } = email;
  if (!recipients.length) {
    console.error("PackStudio email alert has no recipients.", email.subject);
    return;
  }

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.error(
      "PackStudio email alert not sent: RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.",
    );
    return;
  }

  await Promise.all(
    recipients.map(async (to) => {
      try {
        await sendResendEmail({ ...message, to });
      } catch (error) {
        console.error(
          `Could not send PackStudio email alert to ${to}:`,
          error,
        );
      }
    }),
  );
}
