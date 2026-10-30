"use client";

import { useRef, useState } from "react";
import Modal from "@/components/Modal";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import { fmt, unitLabel } from "@/lib/format";
import { CATEGORIES, SUBTYPES, categoryLabel } from "@/lib/categories";
import { addMaterial, editMaterial, addStock, deleteMaterial } from "@/app/actions";

const emptyForm = {
  category: "FABRIC",
  subtype: SUBTYPES.FABRIC[0],
  subtypeOther: "",
  name: "",
  color: "",
  unit: "METER",
  cost: "",
  qty: "",
  minStock: "20",
};

export default function MaterialsClient({ materials }) {
  const { toast, show, notify } = useToast();
  const formModalRef = useRef(null);
  const stockModalRef = useRef(null);

  const [mode, setMode] = useState("new"); // "new" | "edit"
  const [editTargetId, setEditTargetId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [stockTarget, setStockTarget] = useState(null);
  const [stockAmt, setStockAmt] = useState("");
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setMode("new");
    setEditTargetId(null);
    setForm(emptyForm);
    formModalRef.current?.showModal();
  }

  function openEdit(m) {
    setMode("edit");
    setEditTargetId(m.id);
    const knownSubtypes = SUBTYPES[m.category] || [];
    const isOther = !knownSubtypes.includes(m.subtype);
    setForm({
      category: m.category,
      subtype: isOther ? "Other" : m.subtype,
      subtypeOther: isOther ? m.subtype : "",
      name: m.name,
      color: m.color || "",
      unit: m.unit,
      cost: String(m.costPerUnit),
      qty: "",
      minStock: String(m.minStock),
    });
    formModalRef.current?.showModal();
  }

  function handleCategoryChange(category) {
    setForm((f) => ({ ...f, category, subtype: SUBTYPES[category][0], subtypeOther: "" }));
  }

  async function saveMaterial() {
    const cost = parseFloat(form.cost);
    const subtype = form.subtype === "Other" ? form.subtypeOther.trim() : form.subtype;
    const minStock = parseFloat(form.minStock);

    if (!form.name.trim() || isNaN(cost) || !subtype || isNaN(minStock) || minStock < 0) {
      notify("Fill in name, subtype, cost, and a valid minimum stock level.", true);
      return;
    }
    if (mode === "new" && (isNaN(parseFloat(form.qty)) )) {
      notify("Enter an opening stock quantity.", true);
      return;
    }

    setSaving(true);
    let res;
    if (mode === "edit") {
      res = await editMaterial(editTargetId, {
        name: form.name.trim(),
        color: form.color.trim(),
        unit: form.unit,
        category: form.category,
        subtype,
        cost,
        minStock,
      });
    } else {
      res = await addMaterial({
        name: form.name.trim(),
        color: form.color.trim(),
        unit: form.unit,
        category: form.category,
        subtype,
        cost,
        qty: parseFloat(form.qty),
        minStock,
      });
    }
    setSaving(false);

    if (res.ok) {
      notify(mode === "edit" ? `${form.name.trim()} updated.` : `Added ${form.name.trim()} to raw materials.`);
      formModalRef.current?.close();
    } else {
      notify(res.message || "Could not save material.", true);
    }
  }

  function openStock(m) {
    setStockTarget(m);
    setStockAmt("");
    stockModalRef.current?.showModal();
  }

  async function saveStock() {
    const amt = parseFloat(stockAmt);
    if (isNaN(amt) || amt <= 0) {
      notify("Enter a valid quantity.", true);
      return;
    }
    setSaving(true);
    const res = await addStock(stockTarget.id, amt);
    setSaving(false);
    if (res.ok) {
      notify(`Added ${amt} ${unitLabel(stockTarget.unit)} to ${stockTarget.name}.`);
      stockModalRef.current?.close();
    } else {
      notify(res.message || "Could not add stock.", true);
    }
  }

  async function handleDelete(m) {
    const ok = window.confirm(`Delete "${m.name}${m.color ? " — " + m.color : ""}"? This can't be undone.`);
    if (!ok) return;
    const res = await deleteMaterial(m.id);
    if (res.ok) notify("Material deleted.");
    else notify(res.message || "Could not delete material.", true);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Inventory</div>
          <h1>Raw Materials</h1>
          <p>
            Fabric, Trims/Notions, and Packaging — tracked by category, matching the costing
            sheet. Every deduction happens automatically when a design is completed.
          </p>
        </div>
        <button className="btn" onClick={openAdd}>
          + Add Material
        </button>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Subtype</th>
              <th>Material</th>
              <th>Unit</th>
              <th>In stock</th>
              <th>Min. stock</th>
              <th>Cost / unit</th>
              <th>Stock value</th>
              <th></th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id} className={m.quantityInStock < m.minStock ? "row-low" : ""}>
                <td className="muted">{categoryLabel(m.category)}</td>
                <td>{m.subtype}</td>
                <td>
                  {m.name}
                  {m.color ? <span className="muted"> — {m.color}</span> : ""}
                </td>
                <td className="muted">{m.unit === "METER" ? "Meter" : "Piece"}</td>
                <td className="num">
                  {m.quantityInStock} {unitLabel(m.unit)} {m.quantityInStock < m.minStock && <span className="badge low">Low</span>}
                </td>
                <td className="num muted">
                  {m.minStock} {unitLabel(m.unit)}
                </td>
                <td className="num">{fmt(m.costPerUnit)}</td>
                <td className="num">{fmt(m.quantityInStock * m.costPerUnit)}</td>
                <td>
                  <button className="btn outline small" onClick={() => openEdit(m)}>
                    Edit
                  </button>
                </td>
                <td>
                  <button className="btn outline small" onClick={() => openStock(m)}>
                    Add Stock
                  </button>
                </td>
                <td>
                  <button
                    className="btn outline small"
                    style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                    onClick={() => handleDelete(m)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        ref={formModalRef}
        title={mode === "edit" ? "Edit Raw Material" : "Add Raw Material"}
        footer={
          <>
            <button type="button" className="btn outline small" onClick={() => formModalRef.current?.close()}>
              Cancel
            </button>
            <button type="button" className="btn small" onClick={saveMaterial} disabled={saving}>
              {saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Add Material"}
            </button>
          </>
        }
      >
        <div className="field-row">
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={(e) => handleCategoryChange(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Subtype</label>
            <select value={form.subtype} onChange={(e) => setForm((f) => ({ ...f, subtype: e.target.value }))}>
              {SUBTYPES[form.category].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {form.subtype === "Other" && (
          <div className="field">
            <label>Custom subtype name</label>
            <input
              value={form.subtypeOther}
              onChange={(e) => setForm((f) => ({ ...f, subtypeOther: e.target.value }))}
              placeholder="e.g. Snap Buttons"
            />
          </div>
        )}

        <div className="field-row">
          <div className="field">
            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Cotton Poplin"
            />
          </div>
          <div className="field">
            <label>Color</label>
            <input
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              placeholder="e.g. Red"
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Unit</label>
            <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
              <option value="METER">Meter (fabric)</option>
              <option value="PIECE">Piece (component)</option>
            </select>
          </div>
          <div className="field">
            <label>Cost per unit (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Minimum stock level</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.minStock}
              onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
            />
          </div>
          <div className="field" />
        </div>
        {mode === "new" && (
          <div className="field">
            <label>Opening stock quantity</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
            />
          </div>
        )}
        {mode === "edit" && (
          <p className="muted" style={{ fontSize: 12 }}>
            Stock quantity isn't edited here — use "Add Stock" on the table for replenishment.
          </p>
        )}
      </Modal>

      <Modal
        ref={stockModalRef}
        title={stockTarget ? `Add Stock — ${stockTarget.name}${stockTarget.color ? " — " + stockTarget.color : ""}` : "Add Stock"}
        footer={
          <>
            <button type="button" className="btn outline small" onClick={() => stockModalRef.current?.close()}>
              Cancel
            </button>
            <button type="button" className="btn small" onClick={saveStock} disabled={saving}>
              {saving ? "Saving..." : "Add Stock"}
            </button>
          </>
        }
      >
        <div className="field">
          <label>Quantity to add</label>
          <input type="number" min="0" step="0.01" value={stockAmt} onChange={(e) => setStockAmt(e.target.value)} />
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          This is a simple replenishment entry — no supplier or purchase tracking yet.
        </p>
      </Modal>

      <Toast toast={toast} show={show} />
    </>
  );
}