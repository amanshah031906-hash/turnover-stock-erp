"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export default function Barcode({ value }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: "CODE128",
          displayValue: true,
          fontSize: 11,
          height: 34,
          margin: 0,
          background: "transparent",
        });
      } catch (e) {
        // ignore render errors for invalid codes
      }
    }
  }, [value]);

  return <svg ref={ref} className="bc" />;
}
