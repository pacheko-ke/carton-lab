"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOutOfPackStudio } from "../auth-actions";

type AppFrameProps = {
  accountId: string;
  workspace?: "studio" | "production";
  organizationId?: string;
  jobId?: string;
  profile: {
    createdBy: string;
    companyName: string;
    role: string;
    contact: string;
    address: string;
  };
  profileQrCode: boolean[][];
};

export default function AppFrame({
  accountId,
  workspace = "studio",
  organizationId,
  jobId,
  profile,
  profileQrCode,
}: AppFrameProps) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const signOutFormRef = useRef<HTMLFormElement>(null);
  const productionUrl = new URLSearchParams({ workspace: "production" });
  if (organizationId) productionUrl.set("organization", organizationId);
  if (jobId) productionUrl.set("job", jobId);
  const iframeSrc = workspace === "production"
    ? `/packstudio/app.html?${productionUrl.toString()}`
    : "/packstudio/app.html";

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow ||
        typeof event.data !== "object" ||
        event.data === null ||
        !("type" in event.data) ||
        (event.data.type !== "packstudio:sign-out" &&
          event.data.type !== "packstudio:upgrade" &&
          event.data.type !== "packstudio:auth-required" &&
          event.data.type !== "packstudio:production-updated")
      ) {
        return;
      }

      if (event.data.type === "packstudio:sign-out") {
        signOutFormRef.current?.requestSubmit();
      } else if (event.data.type === "packstudio:auth-required") {
        window.location.replace("/login");
      } else if (event.data.type === "packstudio:upgrade") {
        router.push("/account");
      } else if (event.data.type === "packstudio:production-updated") {
        router.refresh();
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [router]);

  return (
    <>
      <form ref={signOutFormRef} action={signOutOfPackStudio} hidden />
      <iframe
        ref={iframeRef}
        className="h-full w-full border-0"
        src={iframeSrc}
        title={workspace === "production" ? "Production dashboard" : "PackStudio"}
        onLoad={(event) => {
          event.currentTarget.contentWindow?.postMessage(
            { type: "packstudio:profile", accountId, profile, qrCode: profileQrCode },
            window.location.origin,
          );
          event.currentTarget.contentWindow?.postMessage(
            {
              type: "packstudio:theme",
              theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
            },
            window.location.origin,
          );
        }}
      />
    </>
  );
}
