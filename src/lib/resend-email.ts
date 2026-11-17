type EmailDetail = {
  label: string;
  value: string;
};

type ResendEmailInput = {
  to: string;
  subject: string;
  heading: string;
  message: string;
  details?: EmailDetail[];
  action?: {
    label: string;
    href: string;
  };
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
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:24px 0">${input.details
        .map(
          (detail) =>
            `<tr><td style="padding:10px 12px;border-bottom:1px solid #e5eee9;color:#61716a;font-size:13px">${escapeHtml(detail.label)}</td><td style="padding:10px 12px;border-bottom:1px solid #e5eee9;color:#203b32;font-size:13px;font-weight:600;text-align:right">${escapeHtml(detail.value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const action = input.action
    ? `<p style="margin:28px 0 8px"><a href="${escapeHtml(input.action.href)}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#d66b3d;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(input.action.label)}</a></p>`
    : "";
  const textDetails = input.details?.length
    ? `\n\n${input.details.map((detail) => `${detail.label}: ${detail.value}`).join("\n")}`
    : "";
  const textAction = input.action
    ? `\n\n${input.action.label}: ${input.action.href}`
    : "";

  return {
    html: `<!doctype html><html><body style="margin:0;background:#eef5f1;font-family:Arial,sans-serif;color:#203b32"><div style="display:none;max-height:0;overflow:hidden">CartonLab email notification</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef5f1;padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dce9e1;border-radius:14px;overflow:hidden"><tr><td style="padding:24px 30px;background:#17483d"><div style="color:#a7e6c1;font-size:12px;font-weight:700;letter-spacing:2px">CARTONLAB</div><h1 style="margin:14px 0 0;color:#fff;font-size:25px;line-height:1.3">${escapeHtml(input.heading)}</h1></td></tr><tr><td style="padding:28px 30px"><p style="margin:0;color:#40574d;font-size:15px;line-height:1.7">${message}</p>${details}${action}<p style="margin:30px 0 0;color:#829188;font-size:12px">CartonLab · Packaging design, made simple</p></td></tr><tr><td style="height:5px;background:#d66b3d"></td></tr></table></td></tr></table></body></html>`,
    text: `${input.heading}\n\n${input.message}${textDetails}${textAction}\n\nCartonLab`,
  };
}

export async function sendResendEmail(
  input: ResendEmailInput,
  options: { from?: string } = {},
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = options.from ?? process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error("RESEND_API_KEY must be configured.");
  if (!from) throw new Error("RESEND_FROM_EMAIL must be configured.");

  const email = formatEmail(input);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: email.html,
      text: email.text,
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
    console.error("CartonLab email alert has no recipients.", email.subject);
    return;
  }

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.error(
      "CartonLab email alert not sent: RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.",
    );
    return;
  }

  await Promise.all(
    recipients.map(async (to) => {
      try {
        await sendResendEmail({ ...message, to });
      } catch (error) {
        console.error(
          `Could not send CartonLab email alert to ${to}:`,
          error,
        );
      }
    }),
  );
}
