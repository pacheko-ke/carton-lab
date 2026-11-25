"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FiAlertCircle, FiCheckCircle, FiInfo, FiX } from "react-icons/fi";

const TOAST_EVENT = "packstudio:toast";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };

function isToastDetail(value: unknown): value is { message: string; type: ToastType } {
  if (typeof value !== "object" || value === null) return false;
  const detail = value as Record<string, unknown>;
  return (
    typeof detail.message === "string" &&
    Boolean(detail.message.trim()) &&
    (detail.type === "success" || detail.type === "error" || detail.type === "info")
  );
}

export function notifyToast(message: string, type: ToastType = "success") {
  if (typeof window === "undefined" || !message.trim()) return;
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { message, type } }),
  );
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (event: Event) => {
      if (!(event instanceof CustomEvent) || !isToastDetail(event.detail)) return;
      const toast = { id: ++nextId.current, ...event.detail };
      setToasts((current) => [...current, toast].slice(-4));
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 5000);
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  return (
    <>
      {children}
      <div aria-label="Notifications" className="app-toast-region" role="region">
        {toasts.map((toast) => {
          const Icon = toast.type === "success"
            ? FiCheckCircle
            : toast.type === "error"
              ? FiAlertCircle
              : FiInfo;
          return (
            <div
              aria-live={toast.type === "error" ? "assertive" : "polite"}
              className="app-toast"
              key={toast.id}
              role={toast.type === "error" ? "alert" : "status"}
              data-type={toast.type}
            >
              <Icon aria-hidden="true" className="app-toast-icon" />
              <span>{toast.message}</span>
              <button
                aria-label="Dismiss notification"
                className="app-toast-dismiss"
                onClick={() =>
                  setToasts((current) => current.filter((item) => item.id !== toast.id))
                }
                type="button"
              >
                <FiX aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
