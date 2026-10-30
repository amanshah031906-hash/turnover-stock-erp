"use client";

import { useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import { fmt } from "@/lib/format";
import { addExpense, editExpense, deleteExpense, updateSettings } from "@/app/actions";

const CATEGORIES = [
  { value: "RENT", label: "Rent" },
  { value: "SALARIES", label: "Salaries" },
  { value: "ELECTRICITY", label: "Electricity" },
  { value: "TRANSPORT", label: "Transport/Logistics" },
  { value: "MISCELLANEOUS", label: "Miscellaneous" },
];

function categoryLabel(value) {
  const found = CATEGORIES.find(function (c) { return c.value === value; });
  return found ? found.label : value;
}

function todayInputValue() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

function toDateInputValue(d) {
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

function monthLabel(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function monthRange(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start: start, end: end };
}

export default function ExpensesClient({ expenses, settings }) {
  const { toast, show, notify } = useToast();
  const modalRef = useRef(null);

  const [monthOffset, setMonthOffset] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [dateInput, setDateInput] = useState(todayInputValue());
  const [category, setCategory] = useState("RENT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [labourIsFixed, setLabourIsFixed] = useState(settings.labourIsFixed);
  const [shippingIsFixed, setShippingIsFixed] = useState(settings.shippingIsFixed);
  const [savingSettings, setSavingSettings] = useState(false);

  const { start, end } = monthRange(monthOffset);

  const monthExpenses = useMemo(function () {
    return expenses
      .filter(function (e) {
        const d = new Date(e.date);
        return d >= start && d < end;
      })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  }, [expenses, monthOffset]);

  const monthTotal = monthExpenses.reduce(function (s, e) { return s + e.amount; }, 0);
  const allTimeTotal = expenses.reduce(function (s, e) { return s + e.amount; }, 0);

  const categoryBreakdown = useMemo(function () {
    const map = {};
    monthExpenses.forEach(function (e) {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.keys(map).map(function (k) { return { category: k, amount: map[k] }; });
  }, [monthExpenses]);

  function openAdd() {
    setEditingId(null);
    setDateInput(todayInputValue());
    setCategory("RENT");
    setAmount("");
    setNote("");
    modalRef.current && modalRef.current.showModal();
  }

  function openEdit(e) {
    setEditingId(e.id);
    setDateInput(toDateInputValue(e.date));
    setCategory(e.category);
    setAmount(String(e.amount));
    setNote(e.note || "");
    modalRef.current && modalRef.current.showModal();
  }

  async function handleSave() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      notify("Enter a valid amount.", true);
      return;
    }
    setSaving(true);
    const payload = { date: dateInput, category: category, amount: amt, note: note.trim() };
    const res = editingId ? await editExpense(editingId, payload) : await addExpense(payload);
    setSaving(false);
    if (res.ok) {
      notify(editingId ? "Expense updated." : "Expense added.");
      modalRef.current && modalRef.current.close();
    } else {
      notify(res.message || "Could not save expense.", true);
    }
  }

  async function handleDelete(e) {
    const ok = window.confirm("Delete this expense entry?");
    if (!ok) return;
    const res = await deleteExpense(e.id);
    if (res.ok) notify("Expense deleted.");
    else notify(res.message || "Could not delete expense.", true);
  }

  async function handleToggleLabour() {
    const next = !labourIsFixed;
    setLabourIsFixed(next);
    setSavingSettings(true);
    await updateSettings({ labourIsFixed: next, shippingIsFixed: shippingIsFixed });
    setSavingSettings(false);
  }

  async function handleToggleShipping() {
    const next = !shippingIsFixed;
    setShippingIsFixed(next);
    setSavingSettings(true);
    await updateSettings({ labourIsFixed: labourIsFixed, shippingIsFixed: next });
    setSavingSettings(false);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Costing &amp; Cash Flow</div>
          <h1>Expenses</h1>
          <p>Rent, salaries, electricity, and other business-wide costs — kept separate from per-design costing.</p>
        </div>
        <button className="btn" onClick={openAdd}>
          + Add Expense
        </button>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="n">{fmt(monthTotal)}</div>
          <div className="l">{monthLabel(monthOffset)} total</div>
        </div>
        <div className="stat-card">
          <div className="n">{fmt(allTimeTotal)}</div>
          <div className="l">All-time total</div>
        </div>
      </div>

      <div className="panel">
        <h2>Cash flow settings</h2>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
          These decide whether Labour/Shipping typed into invoices count as real cash going out on the
          Dashboard's Net Cash figure, or whether that cost is already covered by an expense entry above (so
          counting it again would be double-counting).
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textTransform: "none", letterSpacing: "normal", fontWeight: 400, fontSize: 13.5 }}>
            <input type="checkbox" checked={labourIsFixed} onChange={handleToggleLabour} style={{ width: "auto" }} />
            Labour is a fixed salary (already counted in Expenses) — don't subtract it again from Net Cash
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textTransform: "none", letterSpacing: "normal", fontWeight: 400, fontSize: 13.5 }}>
            <input type="checkbox" checked={shippingIsFixed} onChange={handleToggleShipping} style={{ width: "auto" }} />
            Shipping is a fixed monthly cost (already counted in Expenses) — don't subtract it again from Net Cash
          </label>
        </div>
      </div>

      <div className="page-head" style={{ marginBottom: 16, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button className="btn outline small" onClick={function () { setMonthOffset(monthOffset - 1); }}>
            ← Prev
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 700, minWidth: 160, textAlign: "center" }}>{monthLabel(monthOffset)}</h2>
          <button className="btn outline small" onClick={function () { setMonthOffset(monthOffset + 1); }} disabled={monthOffset >= 0}>
            Next →
          </button>
        </div>
        {monthOffset !== 0 && (
          <button className="link-btn" onClick={function () { setMonthOffset(0); }}>
            Back to this month
          </button>
        )}
      </div>

      {categoryBreakdown.length > 0 && (
        <div className="panel">
          <h2>By category — {monthLabel(monthOffset)}</h2>
          {categoryBreakdown.map(function (c) {
            return (
              <div key={c.category} className="cost-line" style={{ borderTop: "none", paddingTop: 4 }}>
                <span>{categoryLabel(c.category)}</span>
                <span className="num">{fmt(c.amount)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="panel" style={{ padding: 0 }}>
        {monthExpenses.length === 0 ? (
          <div className="empty">No expenses logged for {monthLabel(monthOffset)}.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Note</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {monthExpenses.map(function (e) {
                return (
                  <tr key={e.id}>
                    <td className="muted">{new Date(e.date).toLocaleDateString("en-IN")}</td>
                    <td>{categoryLabel(e.category)}</td>
                    <td className="muted">{e.note || "—"}</td>
                    <td className="num">{fmt(e.amount)}</td>
                    <td className="row-actions">
                      <button className="btn outline small" onClick={function () { openEdit(e); }}>
                        Edit
                      </button>
                      <button
                        className="btn outline small"
                        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                        onClick={function () { handleDelete(e); }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        ref={modalRef}
        title={editingId ? "Edit Expense" : "Add Expense"}
        footer={
          <>
            <button type="button" className="btn outline small" onClick={function () { modalRef.current && modalRef.current.close(); }}>
              Cancel
            </button>
            <button type="button" className="btn small" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        <div className="field-row">
          <div className="field">
            <label>Date</label>
            <input type="date" value={dateInput} onChange={function (e) { setDateInput(e.target.value); }} />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={category} onChange={function (e) { setCategory(e.target.value); }}>
              {CATEGORIES.map(function (c) {
                return (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Amount (₹)</label>
          <input type="number" min="0" step="0.01" value={amount} onChange={function (e) { setAmount(e.target.value); }} />
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <input value={note} onChange={function (e) { setNote(e.target.value); }} placeholder="e.g. August electricity bill" />
        </div>
      </Modal>

      <Toast toast={toast} show={show} />
    </>
  );
}