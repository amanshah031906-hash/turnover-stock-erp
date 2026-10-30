"use client";

import { useEffect } from "react";

export default function PrintButton() {
  useEffect(function () {
    const t = setTimeout(function () {
      window.print();
    }, 300);
    return function () { clearTimeout(t); };
  }, []);

  return (
    <button className="btn small" onClick={function () { window.print(); }}>
      Download
    </button>
  );
}