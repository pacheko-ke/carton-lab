"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  signOutAfterSessionReplaced,
  signOutOfCartonLab,
} from "../auth-actions";

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
  const replacedSessionFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let checkingSession = false;
    let sessionReplaced = false;

    async function checkSession() {
      if (checkingSession || sessionReplaced) return;
      checkingSession = true;
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;

        const session: { user?: { id?: string } } | null =
          await response.json();
        if (session?.user?.id === accountId) return;

        sessionReplaced = true;
        replacedSessionFormRef.current?.requestSubmit();
      } catch {
        // The studio can work offline; retry the session check when online.
      } finally {
        checkingSession = false;
      }
    }

    const intervalId = window.setInterval(() => {
      void checkSession();
    }, 15_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkSession();
    };
    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow ||
        typeof event.data !== "object" ||
        event.data === null ||
        !("type" in event.data) ||
        (event.data.type !== "cartonlab:sign-out" &&
          event.data.type !== "cartonlab:upgrade")
      ) {
        return;
      }

      if (event.data.type === "cartonlab:sign-out") {
        signOutFormRef.current?.requestSubmit();
      } else if (event.data.type === "cartonlab:upgrade") {
        router.push("/account");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("message", handleMessage);
    };
  }, [accountId, router]);

  return (
    <>
      <form
        ref={replacedSessionFormRef}
        action={signOutAfterSessionReplaced}
        target="_top"
        hidden
      />
      <form
        ref={signOutFormRef}
        action={signOutOfCartonLab}
        target="_top"
        hidden
      />
      <iframe
        ref={iframeRef}
        className="h-full w-full border-0"
        src="/cartonlab/app.html"
        title="CartonLab Studio"
        onLoad={(event) =>
          event.currentTarget.contentWindow?.postMessage(
            { type: "cartonlab:profile", accountId, profile, qrCode: profileQrCode },
            window.location.origin,
          )
        }
      />
    </>
  );
}
