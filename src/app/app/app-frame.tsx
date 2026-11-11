"use client";

import { useEffect, useRef } from "react";
import { signOutOfCartonLab } from "../auth-actions";

export default function AppFrame() {
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
        event.data.type !== "cartonlab:sign-out"
      ) {
        return;
      }

      signOutFormRef.current?.requestSubmit();
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <>
      <form
        ref={signOutFormRef}
        action={signOutOfCartonLab}
        target="_top"
        hidden
      />
      <iframe
        ref={iframeRef}
        className="h-full w-full border-0"
        src="/cartonlab/app.html?account=free"
        title="CartonLab Lightweight 2.0"
      />
    </>
  );
}
