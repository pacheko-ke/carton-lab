"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOutOfCartonLab } from "../auth-actions";
import CartonFoldPreview, { isFoldPreviewData } from "./carton-fold-preview";
import type { FoldPreviewData } from "./carton-fold-preview";

export default function AppFrame() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const signOutFormRef = useRef<HTMLFormElement>(null);
  const [foldPreviewData, setFoldPreviewData] = useState<FoldPreviewData | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow ||
        typeof event.data !== "object" ||
        event.data === null ||
        !("type" in event.data) ||
        (event.data.type !== "cartonlab:sign-out" &&
          event.data.type !== "cartonlab:upgrade" &&
          event.data.type !== "cartonlab:fold-preview")
      ) {
        return;
      }

      if (event.data.type === "cartonlab:sign-out") {
        signOutFormRef.current?.requestSubmit();
      } else if (event.data.type === "cartonlab:upgrade") {
        router.push("/account");
      } else if (isFoldPreviewData(event.data.payload)) {
        setFoldPreviewData(event.data.payload);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [router]);

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
        src="/cartonlab/app.html"
        title="CartonLab Lightweight 2.0"
      />
      {foldPreviewData ? (
        <CartonFoldPreview
          data={foldPreviewData}
          onClose={() => setFoldPreviewData(null)}
        />
      ) : null}
    </>
  );
}
