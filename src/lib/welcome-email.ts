type WelcomeEmailInput = {
  email: string;
  name: string | null;
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

export async function sendWelcomeEmail({ email, name }: WelcomeEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.");
  }

  const appUrl = new URL("/app", process.env.APP_URL ?? "http://localhost:3000").toString();
  const greeting = name?.trim() ? `Hi ${name.trim()},` : "Welcome to CartonLab!";
  const htmlGreeting = escapeHtml(greeting);
  const safeAppUrl = escapeHtml(appUrl);
  const text = `${greeting}

Your CartonLab account is ready, and your 7-day Premium trial has started.

Open CartonLab Studio: ${appUrl}

Thanks,
The CartonLab team`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Welcome to CartonLab",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#20251f"><p>${htmlGreeting}</p><p>Your CartonLab account is ready, and your 7-day Premium trial has started.</p><p><a href="${safeAppUrl}">Open CartonLab Studio</a></p><p>Thanks,<br>The CartonLab team</p></div>`,
      text,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    console.error("Resend rejected the CartonLab welcome email.", response.status);
    throw new Error(`Resend rejected the welcome email (HTTP ${response.status}).`);
  }
}
