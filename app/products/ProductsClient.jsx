"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Barcode from "@/components/Barcode";
import { fmt } from "@/lib/format";

function aggregates(d) {
  const units = d.completions.reduce((s, c) => s + c.quantityCompleted, 0);
  const cost = d.completions.reduce((s, c) => s + c.totalCost, 0);
  return { units, cost };
}

function FunnelIcon({ active }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--ink)" : "var(--muted)"}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h16l-6.2 7.4V19l-3.6 1.8v-8.4L4 5z" />
    </svg>
  );
}

function SortHeader({ label, columnKey, options, value, onChange, openKey, setOpenKey }) {
  const wrapRef = useRef(null);
  const isOpen = openKey === columnKey;
  const isActive = value !== "none";

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpenKey(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, setOpenKey]);

  return (
    <th style={{ position: "relative" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {label}
        <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
          <button
            type="button"
            onClick={() => setOpenKey(isOpen ? null : columnKey)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
            aria-label={`Sort ${label}`}
          >
            <FunnelIcon active={isActive} />
          </button>
          {isOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                minWidth: 168,
                background: "#fff",
                border: "1px solid var(--line)",
                boxShadow: "0 10px 30px rgba(0,0,0,.12)",
                padding: "6px 0",
                zIndex: 20,
                textTransform: "none",
                letterSpacing: "normal",
              }}
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpenKey(null);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: value === opt.value ? "var(--bg-alt)" : "none",
                    border: "none",
                    padding: "8px 14px",
                    fontSize: 12.5,
                    fontWeight: value === opt.value ? 600 : 400,
                    color: "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </span>
      </span>
    </th>
  );
}

export default function ProductsClient({ designs }) {
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState(null);

  const [sortName, setSortName] = useState("none");
  const [sortUnits, setSortUnits] = useState("none");
  const [sortDate, setSortDate] = useState("none");

  const activeFilterCount = [sortName, sortUnits, sortDate].filter((v) => v !== "none").length;

  const filtered = useMemo(
    () =>
      designs.filter((d) =>
        (d.name + " " + d.description + " " + d.sku).toLowerCase().includes(query.toLowerCase())
      ),
    [designs, query]
  );

  const sorted = useMemo(() => {
    const withStats = filtered.map((d) => ({ d, ...aggregates(d) }));

    withStats.sort((a, b) => {
      if (sortName !== "none") {
        const cmp = a.d.name.localeCompare(b.d.name);
        if (cmp !== 0) return sortName === "asc" ? cmp : -cmp;
      }
      if (sortUnits !== "none") {
        if (a.units !== b.units) return sortUnits === "desc" ? b.units - a.units : a.units - b.units;
      }
      if (sortDate !== "none") {
        const ad = a.d.approvedAt ? new Date(a.d.approvedAt).getTime() : 0;
        const bd = b.d.approvedAt ? new Date(b.d.approvedAt).getTime() : 0;
        if (ad !== bd) return sortDate === "desc" ? bd - ad : ad - bd;
      }
      return 0;
    });

    return withStats.map((x) => x.d);
  }, [filtered, sortName, sortUnits, sortDate]);

  function clearFilters() {
    setSortName("none");
    setSortUnits("none");
    setSortDate("none");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Finished Goods</div>
          <h1>Products</h1>
          <p>Everything approved and ready to sell — barcoded and costed.</p>
        </div>
      </div>

      <div className="search-bar">
        <input
          placeholder="Search by name, description or SKU"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {activeFilterCount > 0 && (
          <button className="link-btn" onClick={clearFilters}>
            Clear sorting ({activeFilterCount})
          </button>
        )}
      </div>

      <div className="panel" style={{ padding: 0, overflow: "visible" }}>
        {sorted.length === 0 ? (
          <div className="empty">No approved products yet. Complete and approve a design to see it here.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <SortHeader
                  label="Product"
                  columnKey="name"
                  value={sortName}
                  onChange={setSortName}
                  openKey={openKey}
                  setOpenKey={setOpenKey}
                  options={[
                    { value: "none", label: "Not sorted" },
                    { value: "asc", label: "A → Z" },
                    { value: "desc", label: "Z → A" },
                  ]}
                />
                <th>Description</th>
                <SortHeader
                  label="Units produced"
                  columnKey="units"
                  value={sortUnits}
                  onChange={setSortUnits}
                  openKey={openKey}
                  setOpenKey={setOpenKey}
                  options={[
                    { value: "none", label: "Not sorted" },
                    { value: "desc", label: "Most → Least" },
                    { value: "asc", label: "Least → Most" },
                  ]}
                />
                <th>Total material cost</th>
                <th>In stock</th>
                <th>SKU</th>
                <th>Barcode</th>
                <SortHeader
                  label="Approved"
                  columnKey="date"
                  value={sortDate}
                  onChange={setSortDate}
                  openKey={openKey}
                  setOpenKey={setOpenKey}
                  options={[
                    { value: "none", label: "Not sorted" },
                    { value: "desc", label: "Newest → Oldest" },
                    { value: "asc", label: "Oldest → Newest" },
                  ]}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => {
                const { units, cost } = aggregates(d);
                return (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td className="muted">{d.description || "—"}</td>
                    <td className="num">{units}</td>
                    <td className="num">{fmt(cost)}</td>
                    <td className="num">{d.inStock}</td>
                    <td className="num">{d.sku}</td>
                    <td className="barcode-cell">
                      <Barcode value={d.barcode} />
                    </td>
                    <td className="muted">
                      {d.approvedAt ? new Date(d.approvedAt).toLocaleDateString("en-IN") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}