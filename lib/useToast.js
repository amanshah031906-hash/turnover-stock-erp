"use client";

import { useState, useCallback, useEffect } from "react";

// Each client page manages its own toast now — no global context needed once
// data is coming from the server, since there's no shared client-side state
// left to synchronize across pages.
export function useToast() {
  const [toast, setToast] = useState(null);
  const [show, setShow] = useState(false);

  const notify = useCallback((text, isErr = false) => {
    setToast({ text, isErr, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  return { toast, show, notify };
}
