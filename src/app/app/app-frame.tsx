"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOutOfPackStudio } from "../auth-actions";

type AppFrameProps = {
  accountId: string;
  profile: {
    createdBy: string;
    companyName: string;
    role: string;
    contact: string;
    address: string;
  };
  profileQrCode: boolean[][];
};

export default function AppFrame({ accountId, profile, profileQrCode }: AppFrameProps) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const signOutFormRef = useRef<HTMLFormElement>(null);

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
          event.data.type !== "packstudio:auth-required")
      ) {
        return;
      }

      if (event.data.type === "packstudio:sign-out") {
        signOutFormRef.current?.requestSubmit();
      } else if (event.data.type === "packstudio:auth-required") {
        window.location.replace("/login");
      } else if (event.data.type === "packstudio:upgrade") {
        router.push("/account");
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
        src="/packstudio/app.html"
        title="PackStudio"
        onLoad={(event) =>
          event.currentTarget.contentWindow?.postMessage(
            { type: "packstudio:profile", accountId, profile, qrCode: profileQrCode },
            window.location.origin,
          )
        }
      />
    </>
  );
}
