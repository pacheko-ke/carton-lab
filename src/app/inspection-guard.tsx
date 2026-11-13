"use client";

import { useEffect } from "react";

const editableSelector = "input, textarea, select, [contenteditable='true']";

function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(editableSelector));
}

function blockInspectionShortcuts(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;
  const devToolsShortcut =
    event.key === "F12" ||
    (modifier && event.shiftKey && ["i", "j", "c", "k"].includes(key)) ||
    (modifier && key === "u") ||
    (event.metaKey && event.altKey && ["i", "j", "c"].includes(key));

  if (devToolsShortcut) event.preventDefault();
}

export default function InspectionGuard() {
  useEffect(() => {
    const blockContextMenu = (event: MouseEvent) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };

    document.addEventListener("contextmenu", blockContextMenu, true);
    document.addEventListener("keydown", blockInspectionShortcuts, true);
    return () => {
      document.removeEventListener("contextmenu", blockContextMenu, true);
      document.removeEventListener("keydown", blockInspectionShortcuts, true);
    };
  }, []);

  return null;
}
