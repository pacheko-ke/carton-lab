"use server";

import { requireAdminUser } from "@/lib/admin";
import { queueEmailCampaign } from "@/lib/email-campaigns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const MAX_CAMPAIGN_SUBJECT_LENGTH = 150;
const MAX_CAMPAIGN_HEADING_LENGTH = 120;
const MAX_CAMPAIGN_MESSAGE_LENGTH = 4000;

function readCampaignField(
  formData: FormData,
  name: string,
  maxLength: number,
) {
  const value = formData.get(name);
  if (typeof value !== "string") {
    throw new Error(`Missing ${name} value.`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new Error(`${name} must be 1-${maxLength} characters.`);
  }
  return trimmed;
}

export async function createEmailCampaign(formData: FormData) {
  const admin = await requireAdminUser();
  const audience = formData.get("audience");
  if (audience !== "premium" && audience !== "free") {
    throw new Error("Choose a valid email audience.");
  }

  const queued = await queueEmailCampaign({
    audience,
    subject: readCampaignField(
      formData,
      "subject",
      MAX_CAMPAIGN_SUBJECT_LENGTH,
    ),
    heading: readCampaignField(
      formData,
      "heading",
      MAX_CAMPAIGN_HEADING_LENGTH,
    ),
    message: readCampaignField(
      formData,
      "message",
      MAX_CAMPAIGN_MESSAGE_LENGTH,
    ),
    createdByUserId: admin.id,
  });

  revalidatePath("/admin");
  redirect(`/admin?campaign=queued&recipients=${queued}`);
}
