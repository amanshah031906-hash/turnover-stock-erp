"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import { fmt } from "@/lib/format";
import { createApproval, resolveApproval, logApprovalPayment, deleteApproval } from "@/app/actions";
import { useRef } from "react";

function statusBadgeClass(status) {
  if (status === "SOLD") return "approved";
  if (status === "RETURNED") return "low";
  return "completed";
}
function approvalLabel(a) {
  return a.approvalNumber || "AP-" + a.id;
}
function computeTotals(items, gstPercent, advancePaid) {
  const subtotal = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
  const gstAmount = subtotal * (gstPercent / 100);
  const grandTotal = subtotal + gstAmount;
  const balance = Math.max(0, grandTotal - advancePaid);
  return { subtotal: subtotal, gstAmount: gstAmount, grandTotal: grandTotal, balance: balance };
}

export default function ApprovalsClient({ approvals, designs }) {
  const { toast, show, notify } = useToast();
  const newModalRef = useRef(null);
  const viewModalRef = useRef(null);

  const [contextName, setContextName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState("SHOP");
  const [gstPercent, setGstPercent] = useState("18");
  const [advancePaid, setAdvancePaid] = useState("0");
  const [balanceMethod, setBalanceMethod] = useState("");
  const [items, setItems] = useState([{ designId: "", name: "", price: "", quantity: "1" }]);
  const [saving, setSaving] = useState(false);

  const [viewId, setViewId] = useState(null);
  const [paymentAmt, setPaymentAmt] = useState("");

  const viewApproval = viewId ? approvals.find(function (a) { return a.id === viewId; }) : null;

  function openNew() {
    setContextName("");
    setCustomerName("");
    setNotes("");
    setAddress("");
    setPhone("");
    setChannel("SHOP");
    setGstPercent("18");
    setAdvancePaid("0");
    setBalanceMethod("");
    setItems([{ designId: "", name: "", price: "", quantity: "1" }]);
    newModalRef.current && newModalRef.current.showModal();
  }

  function openView(a) {
    setViewId(a.id);
    setPaymentAmt("");
    viewModalRef.current && viewModalRef.current.showModal();
  }

  function updateItem(i, patch) {
    setItems(function (rows) { return rows.map(function (r, idx) { return idx === i ? Object.assign({}, r, patch) : r; }); });
  }
  function addItemRow() {
    setItems(function (rows) { return rows.concat([{ designId: "", name: "", price: "", quantity: "1" }]); });
  }
  function removeItemRow(i) {
    setItems(function (rows) { return rows.filter(function (_, idx) { return idx !== i; }); });
  }
  function handleItemDesignChange(i, designId) {
    const d = designs.find(function (x) { return x.id === Number(designId); });
    updateItem(i, { designId: designId, name: d ? d.name : "" });
  }

  const previewItems = items
    .filter(function (r) { return r.name.trim() && parseFloat(r.price) > 0; })
    .map(function (r) { return { price: parseFloat(r.price) || 0, quantity: parseInt(r.quantity, 10) || 1 }; });
  const preview = computeTotals(previewItems, parseFloat(gstPercent) || 0, parseFloat(advancePaid) || 0);

  async function handleCreate() {
    const cleanItems = items
      .filter(function (r) { return r.name.trim() && parseFloat(r.price) > 0; })
      .map(function (r) {
        return {
          designId: r.designId ? Number(r.designId) : null,
          name: r.name.trim(),
          price: parseFloat(r.price) || 0,
          quantity: parseInt(r.quantity, 10) || 1,
        };
      });

    if (!contextName.trim()) {
      notify("Enter an exhibition or person's name.", true);
      return;
    }
    if (cleanItems.length === 0) {
      notify("Add at least one item with a name and price.", true);
      return;
    }

    setSaving(true);
    const res = await createApproval({
      contextName: contextName.trim(),
      customerName: customerName.trim(),
      notes: notes.trim(),
      address: address.trim(),
      phone: phone.trim(),
      channel: channel,
      gstPercent: parseFloat(gstPercent) || 0,
      advancePaid: parseFloat(advancePaid) || 0,
      balanceCollectionMethod: balanceMethod.trim(),
      items: cleanItems,
    });
    setSaving(false);

    if (res.ok) {
      notify("Approval created.");
      newModalRef.current && newModalRef.current.close();
    } else {
      notify(res.message || "Could not create approval.", true);
    }
  }

  async function handleResolve(a, outcome) {
    const ok = window.confirm(
      outcome === "SOLD"
        ? "Mark this approval as sold?"
        : "Mark this approval as returned? Any linked stock will be restored."
    );
    if (!ok) return;
    const res = await resolveApproval(a.id, outcome);
    if (res.ok) {
      notify(outcome === "SOLD" ? "Marked as sold." : "Marked as returned.");
    } else {
      notify(res.message || "Could not resolve approval.", true);
    }
  }

  async function handleDelete(a) {
    const ok = window.confirm("Delete " + approvalLabel(a) + "? This cannot be undone.");
    if (!ok) return;
    const res = await deleteApproval(a.id);
    if (res.ok) {
      notify("Approval deleted.");
      if (viewId === a.id) viewModalRef.current && viewModalRef.current.close();
    } else {
      notify(res.message || "Could not delete approval.", true);
    }
  }

  async function handleLogPayment() {
    const amt = parseFloat(paymentAmt);
    if (!amt || amt <= 0) {
      notify("Enter a valid amount.", true);
      return;
    }
    const res = await logApprovalPayment(viewId, amt);
    if (res.ok) {
      notify("Payment logged.");
      setPaymentAmt("");
    } else {
      notify(res.message || "Could not log payment.", true);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Stock Out &amp; Pre-Orders</div>
          <h1>Approvals</h1>
          <p>Exhibition stock taken out, items sent to try, or pre-orders taken with no stock on hand yet.</p>
        </div>
        <button className="btn" onClick={openNew}>
          + New Approval
        </button>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {approvals.length === 0 ? (
          <div className="empty">No approvals yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Approval #</th>
                <th>Context / Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Advance</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {approvals.map(function (a) {
                const totals = computeTotals(a.items, a.gstPercent, a.advancePaid);
                return (
                  <tr key={a.id}>
                    <td className="muted">{approvalLabel(a)}</td>
                    <td>
                      {a.contextName}
                      {a.customerName ? " — " + a.customerName : ""}
                    </td>
                    <td className="muted">{a.items.length} item{a.items.length !== 1 ? "s" : ""}</td>
                    <td className="num">{fmt(totals.grandTotal)}</td>
                    <td className="num">{fmt(a.advancePaid)}</td>
                    <td className="num">{fmt(totals.balance)}</td>
                    <td>
                      <span className={"badge " + statusBadgeClass(a.status)}>{a.status}</span>
                    </td>
                    <td className="muted">{new Date(a.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="row-actions">
                      <button className="btn outline small" onClick={function () { openView(a); }}>
                        View
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
        ref={newModalRef}
        title="New Approval"
        width={640}
        footer={
          <>
            <button type="button" className="btn outline small" onClick={function () { newModalRef.current && newModalRef.current.close(); }}>
              Cancel
            </button>
            <button type="button" className="btn small" onClick={handleCreate} disabled={saving}>
              {saving ? "Creating..." : "Create Approval"}
            </button>
          </>
        }
      >
        <div className="field-row">
          <div className="field">
            <label>Exhibition or person's name</label>
            <input value={contextName} onChange={function (e) { setContextName(e.target.value); }} placeholder="e.g. Pop Up Story, 23-25 Aug" />
          </div>
          <div className="field">
            <label>Channel</label>
            <select value={channel} onChange={function (e) { setChannel(e.target.value); }}>
              <option value="SHOP">Shop</option>
              <option value="EXHIBITION">Exhibition</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Customer name</label>
          <input value={customerName} onChange={function (e) { setCustomerName(e.target.value); }} />
        </div>

        <div className="field">
          <label>Notes (customization, measurements, etc.)</label>
          <input value={notes} onChange={function (e) { setNotes(e.target.value); }} />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Address</label>
            <input value={address} onChange={function (e) { setAddress(e.target.value); }} />
          </div>
          <div className="field">
            <label>Contact number</label>
            <input value={phone} onChange={function (e) { setPhone(e.target.value); }} />
          </div>
        </div>

        <label style={{ marginTop: 4 }}>Items</label>
        {items.map(function (row, i) {
          return (
            <div className="field-row" key={i} style={{ alignItems: "flex-end" }}>
              <div className="field" style={{ marginBottom: 10 }}>
                <select value={row.designId} onChange={function (e) { handleItemDesignChange(i, e.target.value); }}>
                  <option value="">Custom item (not in catalog)</option>
                  {designs.map(function (d) {
                    return (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.inStock} in stock)
                      </option>
                    );
                  })}
                </select>
                {!row.designId && (
                  <input
                    style={{ marginTop: 6 }}
                    value={row.name}
                    onChange={function (e) { updateItem(i, { name: e.target.value }); }}
                    placeholder="Item name"
                  />
                )}
              </div>
              <div className="field" style={{ marginBottom: 10, maxWidth: 110 }}>
                <input type="number" min="0" step="0.01" value={row.price} onChange={function (e) { updateItem(i, { price: e.target.value }); }} placeholder="Price" />
              </div>
              <div className="field" style={{ marginBottom: 10, maxWidth: 80 }}>
                <input type="number" min="1" step="1" value={row.quantity} onChange={function (e) { updateItem(i, { quantity: e.target.value }); }} placeholder="Qty" />
              </div>
              <button type="button" className="rm-btn" onClick={function () { removeItemRow(i); }} style={{ marginBottom: 10 }}>
                ✕
              </button>
            </div>
          );
        })}
        <button type="button" className="link-btn" style={{ marginBottom: 16 }} onClick={addItemRow}>
          + Add item
        </button>

        <div className="field-row">
          <div className="field">
            <label>GST %</label>
            <input type="number" min="0" step="0.1" value={gstPercent} onChange={function (e) { setGstPercent(e.target.value); }} />
          </div>
          <div className="field">
            <label>Advance paid (Rs.)</label>
            <input type="number" min="0" step="0.01" value={advancePaid} onChange={function (e) { setAdvancePaid(e.target.value); }} />
          </div>
        </div>
        <div className="field">
          <label>Balance to be collected via (optional)</label>
          <input value={balanceMethod} onChange={function (e) { setBalanceMethod(e.target.value); }} placeholder="e.g. Cash on delivery, GPay" />
        </div>

        {previewItems.length > 0 && (
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span>Subtotal</span>
              <span className="num">{fmt(preview.subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span>+ GST ({gstPercent || 0}%)</span>
              <span className="num">{fmt(preview.gstAmount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--ink)", marginTop: 6, fontWeight: 700, fontSize: 14 }}>
              <span>Grand Total</span>
              <span className="num">{fmt(preview.grandTotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span>Balance pending</span>
              <span className="num">{fmt(preview.balance)}</span>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        ref={viewModalRef}
        title={viewApproval ? "Approval — " + approvalLabel(viewApproval) : "Approval"}
        width={560}
        footer={
          <>
            {viewApproval && viewApproval.status === "OUT" && (
              <>
                <button type="button" className="btn outline small" onClick={function () { handleResolve(viewApproval, "SOLD"); }}>
                  Mark Sold
                </button>
                <button type="button" className="btn outline small" onClick={function () { handleResolve(viewApproval, "RETURNED"); }}>
                  Mark Returned
                </button>
              </>
            )}
            <button
              type="button"
              className="btn outline small"
              style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
              onClick={function () { viewApproval && handleDelete(viewApproval); }}
            >
              Delete
            </button>
            <button type="button" className="btn small" onClick={function () { viewModalRef.current && viewModalRef.current.close(); }}>
              Close
            </button>
          </>
        }
      >
        {viewApproval && (function () {
          const totals = computeTotals(viewApproval.items, viewApproval.gstPercent, viewApproval.advancePaid);
          return (
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              <div className="muted" style={{ marginBottom: 10 }}>
                {viewApproval.contextName}
                {viewApproval.customerName ? " · " + viewApproval.customerName : ""} ·{" "}
                {new Date(viewApproval.createdAt).toLocaleDateString("en-IN")} · {viewApproval.status}
              </div>

              {viewApproval.notes && (
                <div style={{ marginBottom: 8 }}>
                  <strong>Notes:</strong> {viewApproval.notes}
                </div>
              )}
              {viewApproval.address && (
                <div style={{ marginBottom: 8 }}>
                  <strong>Address:</strong> {viewApproval.address}
                </div>
              )}
              {viewApproval.phone && (
                <div style={{ marginBottom: 8 }}>
                  <strong>Phone:</strong> {viewApproval.phone}
                </div>
              )}

              <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 4 }}>Items</div>
              {viewApproval.items.map(function (item) {
                return (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                    <span>
                      {item.name} × {item.quantity}
                      {item.designId ? "" : " (custom)"}
                    </span>
                    <span className="num">{fmt(item.price * item.quantity)}</span>
                  </div>
                );
              })}

              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", borderTop: "1px solid var(--line)", marginTop: 8 }}>
                <span>Subtotal</span>
                <span className="num">{fmt(totals.subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>+ GST ({viewApproval.gstPercent}%)</span>
                <span className="num">{fmt(totals.gstAmount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--ink)", marginTop: 6, fontWeight: 700, fontSize: 14 }}>
                <span>Grand Total</span>
                <span className="num">{fmt(totals.grandTotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                <span>Advance paid</span>
                <span className="num">{fmt(viewApproval.advancePaid)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontWeight: 600 }}>
                <span>Balance pending</span>
                <span className="num">{fmt(totals.balance)}</span>
              </div>
              {viewApproval.balanceCollectionMethod && (
                <div style={{ marginTop: 8 }}>
                  <strong>Balance via:</strong> {viewApproval.balanceCollectionMethod}
                </div>
              )}

              {totals.balance > 0 && (
                <div className="field-row" style={{ marginTop: 16, alignItems: "flex-end" }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Log a payment (Rs.)</label>
                    <input type="number" min="0" step="0.01" value={paymentAmt} onChange={function (e) { setPaymentAmt(e.target.value); }} />
                  </div>
                  <button type="button" className="btn small" onClick={handleLogPayment} style={{ height: 41 }}>
                    Log Payment
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      <Toast toast={toast} show={show} />
    </>
  );
}