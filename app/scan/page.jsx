"use client";

import { useRef, useState } from "react";
import Barcode from "@/components/Barcode";
import Badge from "@/components/Badge";
import { fmt, unitLabel, matName } from "@/lib/format";
import { lookupBarcode } from "@/app/actions";

function aggregates(d) {
  const units = d.completions.reduce((s, c) => s + c.quantityCompleted, 0);
  const cost = d.completions.reduce((s, c) => s + c.totalCost, 0);
  return { units, cost };
}

export default function ScanPage() {
  const inputRef = useRef(null);
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function runLookup(barcode) {
    if (!barcode.trim()) return;
    setLoading(true);
    const res = await lookupBarcode(barcode);
    setLoading(false);
    setResult(res);
    setValue("");
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") runLookup(value);
  }

  const d = result?.ok ? result.design : null;
  const stats = d ? aggregates(d) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Lookup</div>
          <h1>Scan</h1>
          <p>Scan a barcode with a handheld/USB scanner, or type it in and press Enter, to pull up that product.</p>
        </div>
      </div>

      <div className="panel">
        <div className="search-bar" style={{ marginBottom: 0 }}>
          <input
            ref={inputRef}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scan or type a barcode, then press Enter"
            style={{ maxWidth: 320 }}
          />
          <button className="btn small" onClick={() => runLookup(value)} disabled={loading}>
            {loading ? "Looking up..." : "Look Up"}
          </button>
        </div>
      </div>

      {result && !result.ok && (
        <div className="panel">
          <div className="empty">{result.message}</div>
        </div>
      )}

      {d && (
        <div className="grid cols-2">
          <div className="design-card">
            <div className="dtitle">
              <div>
                <h3>{d.name}</h3>
                <div className="desc">{d.description || "No description"}</div>
              </div>
              <Badge status={d.status} />
            </div>

            <div className="recipe-list">
              {d.recipe.map((r) => (
                <div key={r.id}>
                  <span>{matName(r.rawMaterial)}</span>
                  <span className="num">
                    {r.quantityRequired} {unitLabel(r.rawMaterial.unit)}
                  </span>
                </div>
              ))}
            </div>

            <div className="cost-line">
              <span>
                Produced so far ({stats.units} unit{stats.units !== 1 ? "s" : ""})
              </span>
              <span className="num">{fmt(stats.cost)}</span>
            </div>
            <div className="cost-line">
              <span>In stock</span>
              <span className="num">
                {d.inStock} unit{d.inStock !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="cost-line">
              <span>SKU</span>
              <span className="num">{d.sku}</span>
            </div>
            <div className="cost-line">
              <span>Approved</span>
              <span className="num">
                {d.approvedAt ? new Date(d.approvedAt).toLocaleDateString("en-IN") : "—"}
              </span>
            </div>
          </div>

          <div className="panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <Barcode value={d.barcode} />
            <span className="muted" style={{ fontSize: 12 }}>{d.barcode}</span>
          </div>
        </div>
      )}
    </>
  );
}