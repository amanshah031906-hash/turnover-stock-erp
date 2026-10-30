"use client";

import { useState } from "react";
import { markLowStockSeen } from "@/app/actions";
import { unitLabel } from "@/lib/format";

// Sits as the third panel next to "Raw material stock" and "Recent
// completions" — same .panel treatment so all three line up evenly.
// Materials passed in are already filtered to "below minStock". Clicking a
// row just dismisses its black "unseen" dot — it stays listed until it's
// actually restocked above minStock.
export default function LowStockPanel({ materials }) {
  const [items, setItems] = useState(materials);

  async function handleClick(m) {
    if (m.lowStockSeen) return;
    setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, lowStockSeen: true } : x)));
    await markLowStockSeen(m.id);
  }

  return (
    <div className="panel">
      <h2>Low stock alerts</h2>
      {items.length === 0 ? (
        <div className="empty">Nothing running low right now.</div>
      ) : (
        <div>
          {items.map((m) => (
            <button key={m.id} className="alert-row" onClick={() => handleClick(m)}>
              <span className={`alert-dot ${m.lowStockSeen ? "seen" : ""}`} />
              <span className="alert-name">
                {m.name}
                {m.color ? ` — ${m.color}` : ""}
              </span>
              <span className="alert-qty">
                {m.quantityInStock} / {m.minStock} {unitLabel(m.unit)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}