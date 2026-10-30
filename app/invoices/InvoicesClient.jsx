"use client";

import { useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import { fmt, unitLabel, matName, numberToWordsINR } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { createInvoice, editInvoice, addPayment, createReturn, resolveTrial, deleteInvoice } from "@/app/actions";

function statusBadgeClass(status) {
  if (status === "PAID") return "approved";
  if (status === "PARTIAL") return "completed";
  return "low";
}
function statusLabel(status) {
  if (status === "PAID") return "Paid";
  if (status === "PARTIAL") return "Partial";
  return "Unpaid";
}
function actualStatus(inv) {
  const covered = inv.amountPaid + inv.creditApplied;
  if (inv.grandTotal <= 0) return "PAID";
  if (covered <= 0) return "UNPAID";
  if (covered >= inv.grandTotal) return "PAID";
  return "PARTIAL";
}
function invoiceLabel(inv) {
  return inv.invoiceNumber || "INV-" + inv.id;
}
function toDateInputValue(d) {
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}
function itemMaterialCost(design, quantity) {
  let fabricCost = 0, trimsCost = 0, packagingCost = 0;
  for (const r of design.recipe) {
    const needed = r.quantityRequired * quantity;
    const lineCost = needed * r.rawMaterial.costPerUnit;
    if (r.rawMaterial.category === "FABRIC") fabricCost += lineCost;
    else if (r.rawMaterial.category === "TRIMS") trimsCost += lineCost;
    else if (r.rawMaterial.category === "PACKAGING") packagingCost += lineCost;
  }
  return { fabricCost, trimsCost, packagingCost };
}

export default function InvoicesClient({ designs, invoices, creditNotes }) {
  const { toast, show, notify } = useToast();
  const newModalRef = useRef(null);
  const viewModalRef = useRef(null);
  const clientCopyModalRef = useRef(null);
  const returnModalRef = useRef(null);
  const receiptModalRef = useRef(null);
  const paymentSubmittingRef = useRef(false);

  const [cart, setCart] = useState([]);
  const [pickDesignId, setPickDesignId] = useState(designs[0] ? designs[0].id : "");
  const [pickQty, setPickQty] = useState(1);
  const [pickMarkup, setPickMarkup] = useState(designs[0] ? String(designs[0].defaultMarkupPercent) : "100");
  const [pickLabour, setPickLabour] = useState(designs[0] ? String(designs[0].defaultLabourCost) : "0");

  const [clientName, setClientName] = useState("");
  const [invoiceNumberInput, setInvoiceNumberInput] = useState("");
  const [invoiceDateInput, setInvoiceDateInput] = useState(function () { return toDateInputValue(new Date()); });
  const [miscCost, setMiscCost] = useState("0");
  const [shippingCost, setShippingCost] = useState("0");
  const [discountInput, setDiscountInput] = useState("0");
  const [gstInput, setGstInput] = useState("18");
  const [isGiftInput, setIsGiftInput] = useState(false);
  const [isTrialInput, setIsTrialInput] = useState(false);
  const [channelInput, setChannelInput] = useState("SHOP");
  const [exhibitionNameInput, setExhibitionNameInput] = useState("");
  const [amountPaidNow, setAmountPaidNow] = useState("0");
  const [saving, setSaving] = useState(false);

  const [creditSearch, setCreditSearch] = useState("");
  const [selectedCreditIds, setSelectedCreditIds] = useState([]);

  const [viewInvoiceId, setViewInvoiceId] = useState(null);
  const [clientCopyId, setClientCopyId] = useState(null);
  const [paymentAmt, setPaymentAmt] = useState("");
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateMode, setDateMode] = useState("none");
  const [exactDate, setExactDate] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [channelFilter, setChannelFilter] = useState("ALL");

  const [returnTargetId, setReturnTargetId] = useState(null);
  const [receiptChecked, setReceiptChecked] = useState(false);
  const [itemUndamaged, setItemUndamaged] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returning, setReturning] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState(null);

  const viewInvoice = viewInvoiceId ? invoices.find(function (i) { return i.id === viewInvoiceId; }) : null;
  const clientCopyInvoice = clientCopyId ? invoices.find(function (i) { return i.id === clientCopyId; }) : null;
  const returnTarget = returnTargetId ? invoices.find(function (i) { return i.id === returnTargetId; }) : null;

  const filteredInvoices = useMemo(function () {
    const q = searchQuery.trim().toLowerCase();
    return invoices.filter(function (inv) {
      if (q) {
        const itemNames = inv.items.map(function (it) { return it.design.name + " " + (it.design.barcode || "") + " " + (it.design.sku || ""); }).join(" ");
        const haystack = [
          inv.invoiceNumber || "",
          inv.clientName || "",
          itemNames,
          inv.exhibitionName || "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (dateMode === "exact" && exactDate) {
        if (toDateInputValue(inv.createdAt) !== exactDate) return false;
      }
      if (dateMode === "range" && (rangeStart || rangeEnd)) {
        const d = toDateInputValue(inv.createdAt);
        if (rangeStart && d < rangeStart) return false;
        if (rangeEnd && d > rangeEnd) return false;
      }
      if (channelFilter !== "ALL" && inv.channel !== channelFilter) return false;
      return true;
    });
  }, [invoices, searchQuery, dateMode, exactDate, rangeStart, rangeEnd, channelFilter]);

  const creditResults = useMemo(function () {
    const q = creditSearch.trim().toLowerCase();
    if (!q) return [];
    return creditNotes.filter(function (c) {
      if (selectedCreditIds.includes(c.id)) return false;
      const originalInvNum = c.originalInvoice ? c.originalInvoice.invoiceNumber || "" : "";
      const haystack = ((c.creditNumber || "") + " " + (c.clientName || "") + " " + originalInvNum).toLowerCase();
      return haystack.includes(q);
    });
  }, [creditNotes, creditSearch, selectedCreditIds]);

  const selectedCredits = selectedCreditIds
    .map(function (id) { return creditNotes.find(function (c) { return c.id === id; }); })
    .filter(Boolean);

  function allocateCredits(notes, grandTotal) {
    let remaining = grandTotal;
    return notes.map(function (note) {
      const use = remaining > 0 ? Math.min(note.amount, remaining) : 0;
      remaining -= use;
      return { note: note, amountUsed: use };
    });
  }

  function runSearch() {
    setSearchQuery(searchDraft);
  }

  function openNew() {
    setCart([]);
    const first = designs[0];
    setPickDesignId(first ? first.id : "");
    setPickQty(1);
    setPickMarkup(first ? String(first.defaultMarkupPercent) : "100");
    setPickLabour(first ? String(first.defaultLabourCost) : "0");
    setClientName("");
    setInvoiceNumberInput("");
    setInvoiceDateInput(toDateInputValue(new Date()));
    setMiscCost("0");
    setShippingCost("0");
    setDiscountInput("0");
    setGstInput("18");
    setIsGiftInput(false);
    setIsTrialInput(false);
    setChannelInput("SHOP");
    setExhibitionNameInput("");
    setCreditSearch("");
    setSelectedCreditIds([]);
    setAmountPaidNow("0");
    newModalRef.current && newModalRef.current.showModal();
  }

  function handlePickDesignChange(id) {
    setPickDesignId(id);
    const d = designs.find(function (x) { return x.id === Number(id); });
    if (d) {
      setPickMarkup(String(d.defaultMarkupPercent));
      setPickLabour(String(d.defaultLabourCost));
    }
  }

  function addToCart() {
    const qty = parseInt(pickQty, 10);
    if (!pickDesignId || !qty || qty < 1) {
      notify("Pick a design and a valid quantity.", true);
      return;
    }
    setCart(function (rows) {
      return rows.concat([{
        designId: Number(pickDesignId),
        quantity: qty,
        markupPercent: parseFloat(pickMarkup) || 0,
        labourCost: Math.max(0, parseFloat(pickLabour) || 0),
      }]);
    });
    setPickQty(1);
  }

  function removeFromCart(i) {
    setCart(function (rows) { return rows.filter(function (_, idx) { return idx !== i; }); });
  }

  function updateCartRow(i, patch) {
    setCart(function (rows) { return rows.map(function (r, idx) { return idx === i ? Object.assign({}, r, patch) : r; }); });
  }

  const preview = useMemo(function () {
    if (cart.length === 0) return null;

    const lineDetails = cart.map(function (row) {
      const design = designs.find(function (d) { return d.id === row.designId; });
      if (!design) return null;
      const { fabricCost, trimsCost, packagingCost } = itemMaterialCost(design, row.quantity);
      const labourCost = row.labourCost ?? design.defaultLabourCost;
      const materialAndLabour = fabricCost + trimsCost + packagingCost + labourCost;
      const markupAmount = isGiftInput ? 0 : materialAndLabour * (row.markupPercent / 100);
      const lineTotal = materialAndLabour + markupAmount;
      return { design: design, quantity: row.quantity, markupPercent: row.markupPercent, fabricCost, trimsCost, packagingCost, labourCost, materialAndLabour, markupAmount, lineTotal };
    }).filter(Boolean);

    const itemsTotal = lineDetails.reduce(function (s, l) { return s + l.lineTotal; }, 0);
    const misc = parseFloat(miscCost) || 0;
    const shipping = parseFloat(shippingCost) || 0;
    const discountN = isGiftInput ? 0 : Math.max(0, parseFloat(discountInput) || 0);
    const subtotal = itemsTotal + misc + shipping;
    const preTax = Math.max(0, subtotal - discountN);
    const gstN = isGiftInput ? 0 : parseFloat(gstInput) || 0;
    const gstAmount = isGiftInput ? 0 : preTax * (gstN / 100);
    const grandTotal = isGiftInput ? 0 : preTax + gstAmount;

    const creditAllocations = allocateCredits(selectedCredits, grandTotal);
    const creditValue = creditAllocations.reduce(function (s, a) { return s + a.amountUsed; }, 0);

    return { lineDetails: lineDetails, itemsTotal: itemsTotal, subtotal: subtotal, discountN: discountN, gstAmount: gstAmount, grandTotal: grandTotal, creditValue: creditValue, creditAllocations: creditAllocations };
  }, [cart, designs, miscCost, shippingCost, discountInput, gstInput, isGiftInput, selectedCredits]);

  async function submitInvoice(forceConfirm) {
    setSaving(true);
    const res = await createInvoice({
      items: cart,
      clientName: clientName.trim(),
      invoiceNumber: invoiceNumberInput.trim(),
      invoiceDate: invoiceDateInput,
      miscCost: parseFloat(miscCost) || 0,
      shippingCost: parseFloat(shippingCost) || 0,
      discountAmount: Math.max(0, parseFloat(discountInput) || 0),
      gstPercent: parseFloat(gstInput) || 0,
      isGift: isGiftInput,
      isTrial: isTrialInput,
      channel: channelInput,
      exhibitionName: channelInput === "EXHIBITION" ? exhibitionNameInput.trim() : "",
      creditNoteIds: selectedCreditIds.length > 0 ? selectedCreditIds : undefined,
      amountPaidNow: parseFloat(amountPaidNow) || 0,
      forceConfirm: forceConfirm,
    });
    setSaving(false);

    if (res.ok) {
      notify("Invoice created.");
      newModalRef.current && newModalRef.current.close();
      return;
    }

    if (res.needsConfirm) {
      const proceed = window.confirm(
        "Stock is short on: " + res.message + ". Are these extra units already made, just not logged yet? " +
        "Click OK to proceed anyway, or Cancel to go produce the difference first."
      );
      if (proceed) {
        await submitInvoice(true);
      }
      return;
    }

    notify(res.message || "Could not create invoice.", true);
  }

  async function handleCreate() {
    if (cart.length === 0) {
      notify("Add at least one item to the cart.", true);
      return;
    }
    if (channelInput === "EXHIBITION" && !exhibitionNameInput.trim()) {
      notify("Enter the exhibition name.", true);
      return;
    }
    await submitInvoice(false);
  }

  function openView(inv) {
    setViewInvoiceId(inv.id);
    setPaymentAmt("");
    setEditingInvoice(false);
    viewModalRef.current && viewModalRef.current.showModal();
  }

  function openClientCopy(inv) {
    setClientCopyId(inv.id);
    clientCopyModalRef.current && clientCopyModalRef.current.showModal();
  }

  function openReturn(inv) {
    setReturnTargetId(inv.id);
    setReceiptChecked(false);
    setItemUndamaged(false);
    setReturnReason("");
    returnModalRef.current && returnModalRef.current.showModal();
  }

  async function confirmReturn() {
    if (!receiptChecked || !itemUndamaged) {
      notify("Both checklist items must be confirmed.", true);
      return;
    }
    setReturning(true);
    const res = await createReturn(returnTargetId, {
      receiptChecked: receiptChecked,
      itemUndamaged: itemUndamaged,
      reason: returnReason.trim(),
    });
    setReturning(false);
    if (res.ok) {
      notify("Return processed — store credit issued, stock restored.");
      returnModalRef.current && returnModalRef.current.close();
      setActiveReceipt(res.receipt);
      receiptModalRef.current && receiptModalRef.current.showModal();
    } else {
      notify(res.message || "Could not process return.", true);
    }
  }

  function viewExistingReceipt(inv) {
    const note = inv.creditNotesIssued && inv.creditNotesIssued[0];
    if (!note) {
      notify("No credit note found for this invoice.", true);
      return;
    }
    setActiveReceipt({
      id: note.id,
      creditNumber: note.creditNumber,
      amount: note.amount,
      clientName: note.clientName,
      reason: note.reason,
      createdAt: note.createdAt,
      originalInvoiceNumber: invoiceLabel(inv),
    });
    receiptModalRef.current && receiptModalRef.current.showModal();
  }

  async function handleResolveTrial(inv, outcome) {
    const ok = window.confirm(
      outcome === "SOLD"
        ? "Mark this trial as sold? It will now count toward Net Cash/Net Profit."
        : "Mark this trial as returned? Stock will be restored and it stays excluded from Net Cash/Net Profit."
    );
    if (!ok) return;
    const res = await resolveTrial(inv.id, outcome);
    if (res.ok) {
      notify(outcome === "SOLD" ? "Trial marked as sold." : "Trial marked as returned.");
    } else {
      notify(res.message || "Could not resolve trial.", true);
    }
  }

  async function handleDeleteInvoice(inv) {
    const ok = window.confirm(
      "Delete " + invoiceLabel(inv) + "? This restores stock for every item on it and cannot be undone."
    );
    if (!ok) return;
    const res = await deleteInvoice(inv.id);
    if (res.ok) {
      notify("Invoice deleted — stock restored.");
      if (viewInvoiceId === inv.id) {
        viewModalRef.current && viewModalRef.current.close();
      }
    } else {
      notify(res.message || "Could not delete invoice.", true);
    }
  }

  function startEditInvoice(inv) {
    setEditForm({
      clientName: inv.clientName || "",
      invoiceNumber: inv.invoiceNumber || "",
      invoiceDate: toDateInputValue(inv.createdAt),
      miscCost: String(inv.miscCost),
      shippingCost: String(inv.shippingCost),
      discountAmount: String(inv.discountAmount),
      gstPercent: String(inv.gstPercent),
    });
    setEditingInvoice(true);
  }

  async function saveInvoiceEdit() {
    setSaving(true);
    const res = await editInvoice(viewInvoiceId, {
      clientName: editForm.clientName.trim(),
      invoiceNumber: editForm.invoiceNumber.trim(),
      invoiceDate: editForm.invoiceDate,
      miscCost: parseFloat(editForm.miscCost) || 0,
      shippingCost: parseFloat(editForm.shippingCost) || 0,
      discountAmount: parseFloat(editForm.discountAmount) || 0,
      gstPercent: parseFloat(editForm.gstPercent) || 0,
    });
    setSaving(false);
    if (res.ok) {
      notify("Invoice updated.");
      setEditingInvoice(false);
    } else {
      notify(res.message || "Could not update invoice.", true);
    }
  }

  async function handleLogPayment() {
    if (paymentSubmittingRef.current) return;
    const amt = parseFloat(paymentAmt);
    if (!amt || amt <= 0) {
      notify("Enter a valid payment amount.", true);
      return;
    }
    paymentSubmittingRef.current = true;
    setSaving(true);
    const res = await addPayment(viewInvoiceId, amt);
    setSaving(false);
    paymentSubmittingRef.current = false;
    if (res.ok) {
      notify("Payment logged.");
      setPaymentAmt("");
    } else {
      notify(res.message || "Could not log payment.", true);
    }
  }

  async function handleMarkPaidFull() {
    if (paymentSubmittingRef.current) return;
    if (!viewInvoice) return;
    const balance = viewInvoice.grandTotal - viewInvoice.amountPaid - viewInvoice.creditApplied;
    if (balance <= 0) {
      notify("This invoice is already fully covered.", true);
      return;
    }
    paymentSubmittingRef.current = true;
    setSaving(true);
    const res = await addPayment(viewInvoiceId, balance);
    setSaving(false);
    paymentSubmittingRef.current = false;
    if (res.ok) {
      notify("Marked as paid in full.");
      setPaymentAmt("");
    } else {
      notify(res.message || "Could not log payment.", true);
    }
  }

  function ViewFooter() {
    if (!viewInvoice) return null;
    if (editingInvoice) {
      return (
        <>
          <button type="button" className="btn outline small" onClick={function () { setEditingInvoice(false); }}>
            Cancel
          </button>
          <button type="button" className="btn small" onClick={saveInvoiceEdit} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </>
      );
    }
    return (
      <>
        <a className="btn outline small" href="#" onClick={function (e) { e.preventDefault(); openClientCopy(viewInvoice); }}>
          Client Copy
        </a>
        <button type="button" className="btn outline small" onClick={function () { startEditInvoice(viewInvoice); }}>
          Edit
        </button>
        {!viewInvoice.returnedAt && (
          <button type="button" className="btn outline small" onClick={function () { viewModalRef.current && viewModalRef.current.close(); openReturn(viewInvoice); }}>
            Return
          </button>
        )}
        {viewInvoice.returnedAt && (
          <button type="button" className="btn outline small" onClick={function () { viewExistingReceipt(viewInvoice); }}>
            View Credit Note
          </button>
        )}
        <button
          type="button"
          className="btn outline small"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
          onClick={function () { handleDeleteInvoice(viewInvoice); }}
        >
          Delete
        </button>
        <button type="button" className="btn small" onClick={function () { viewModalRef.current && viewModalRef.current.close(); }}>
          Close
        </button>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Costing &amp; Billing</div>
          <h1>Invoices</h1>
          <p>Build a cart of one or more items, get the full breakdown, and deduct stock the moment it's created.</p>
<p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>* Paid amount includes store credit applied</p>
        </div>
        <button className="btn" onClick={openNew} disabled={designs.length === 0}>
          + New Invoice
        </button>
      </div>

      <div className="search-bar" style={{ flexWrap: "wrap" }}>
        <input
          value={searchDraft}
          onChange={function (e) { setSearchDraft(e.target.value); }}
          onKeyDown={function (e) { if (e.key === "Enter") runSearch(); }}
          placeholder="Search — invoice #, client, exhibition, or item name"
        />
        <button className="btn small" onClick={runSearch}>
          Search
        </button>
        <select value={channelFilter} onChange={function (e) { setChannelFilter(e.target.value); }} style={{ maxWidth: 160 }}>
          <option value="ALL">All channels</option>
          <option value="SHOP">Shop only</option>
          <option value="EXHIBITION">Exhibition only</option>
        </select>
        <select value={dateMode} onChange={function (e) { setDateMode(e.target.value); }} style={{ maxWidth: 150 }}>
          <option value="none">Any date</option>
          <option value="exact">Exact date</option>
          <option value="range">Date range</option>
        </select>
        {dateMode === "exact" && (
          <input type="date" value={exactDate} onChange={function (e) { setExactDate(e.target.value); }} style={{ maxWidth: 170 }} />
        )}
        {dateMode === "range" && (
          <>
            <input type="date" value={rangeStart} onChange={function (e) { setRangeStart(e.target.value); }} style={{ maxWidth: 170 }} />
            <span className="muted" style={{ fontSize: 12 }}>to</span>
            <input type="date" value={rangeEnd} onChange={function (e) { setRangeEnd(e.target.value); }} style={{ maxWidth: 170 }} />
          </>
        )}
        {(searchQuery || dateMode !== "none" || channelFilter !== "ALL") && (
          <button
            className="link-btn"
            onClick={function () {
              setSearchDraft("");
              setSearchQuery("");
              setDateMode("none");
              setExactDate("");
              setRangeStart("");
              setRangeEnd("");
              setChannelFilter("ALL");
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {invoices.length === 0 ? (
          <div className="empty">No invoices yet. Create one above.</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="empty">No invoices match your search.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Items</th>
                <th>Client</th>
                <th>Channel</th>
                <th>Grand Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(function (inv) {
                const balance = inv.grandTotal - inv.amountPaid - inv.creditApplied;
                const isUnresolvedTrial = inv.isTrial && !inv.trialResolvedAt;
                const itemSummary = inv.items.map(function (it) { return it.design.name + " ×" + it.quantity; }).join(", ");
                return (
                  <tr key={inv.id} style={isUnresolvedTrial ? { background: "var(--bg-alt)" } : undefined}>
                    <td className="muted">{invoiceLabel(inv)}</td>
                    <td>{itemSummary}</td>
                    <td className="muted">{inv.clientName || "—"}</td>
                    <td className="muted">
                      {inv.channel === "EXHIBITION" ? "Exhibition — " + (inv.exhibitionName || "") : "Shop"}
                    </td>
                    <td className="num">{fmt(inv.grandTotal)}</td>
                    <td className="num">
  {fmt(inv.amountPaid)}
  {inv.creditApplied > 0 && <span title={"Includes " + fmt(inv.creditApplied) + " store credit"}>*</span>}
</td>
                    <td className="num">{fmt(balance)}</td>
                    <td>
                      <span className={"badge " + statusBadgeClass(actualStatus(inv))}>
                        {statusLabel(actualStatus(inv))}
                      </span>
                      {inv.isGift && <span className="badge" style={{ marginLeft: 4 }}>Gift</span>}
                      {inv.isTrial && (
                        <span className="badge" style={{ marginLeft: 4 }}>
                          {inv.trialResolvedAt ? "Trial (resolved)" : "Trial"}
                        </span>
                      )}
                      {inv.returnedAt && <span className="badge low" style={{ marginLeft: 4 }}>Returned</span>}
                    </td>
                    <td className="muted">{new Date(inv.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="row-actions">
                      <button className="btn outline small" onClick={function () { openView(inv); }}>
                        View
                      </button>
                      <button className="btn outline small" onClick={function () { openClientCopy(inv); }}>
                        Client Copy
                      </button>
                      {isUnresolvedTrial && (
                        <>
                          <button className="btn outline small" onClick={function () { handleResolveTrial(inv, "SOLD"); }}>
                            Mark Sold
                          </button>
                          <button className="btn outline small" onClick={function () { handleResolveTrial(inv, "RETURNED"); }}>
                            Mark Returned
                          </button>
                        </>
                      )}
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
        title="New Invoice"
        width={680}
        footer={
          <>
            <button type="button" className="btn outline small" onClick={function () { newModalRef.current && newModalRef.current.close(); }}>
              Cancel
            </button>
            <button type="button" className="btn small" onClick={handleCreate} disabled={saving}>
              {saving ? "Creating..." : "Create Invoice"}
            </button>
          </>
        }
      >
        <label>Add items to this order</label>
        <div className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10.5 }}>Design</label>
            <select value={pickDesignId} onChange={function (e) { handlePickDesignChange(e.target.value); }}>
              {designs.map(function (d) {
                return (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.inStock} in stock)
                  </option>
                );
              })}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 10, maxWidth: 90 }}>
            <label style={{ fontSize: 10.5 }}>Qty</label>
            <input type="number" min="1" step="1" value={pickQty} onChange={function (e) { setPickQty(e.target.value); }} />
          </div>
          <div className="field" style={{ marginBottom: 10, maxWidth: 110 }}>
            <label style={{ fontSize: 10.5 }}>Labour (Rs.)</label>
            <input type="number" min="0" step="0.01" value={pickLabour} onChange={function (e) { setPickLabour(e.target.value); }} />
          </div>
          <div className="field" style={{ marginBottom: 10, maxWidth: 110 }}>
            <label style={{ fontSize: 10.5 }}>Markup %</label>
            <input type="number" min="0" step="0.1" value={pickMarkup} onChange={function (e) { setPickMarkup(e.target.value); }} />
          </div>
          <button type="button" className="btn outline small" style={{ marginBottom: 10 }} onClick={addToCart}>
            + Add
          </button>
        </div>

        {cart.length > 0 && (
          <div style={{ border: "1px solid var(--line)", marginBottom: 16 }}>
            {cart.map(function (row, i) {
              const design = designs.find(function (d) { return d.id === row.designId; });
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
                  <span>
                    {design ? design.name : "Unknown"} × {row.quantity}, Labour {fmt(row.labourCost)}, {row.markupPercent}% markup
                  </span>
                  <button type="button" className="link-btn" onClick={function () { removeFromCart(i); }}>
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="field">
          <label>Client name</label>
          <input value={clientName} onChange={function (e) { setClientName(e.target.value); }} placeholder="e.g. Acme Retail Pvt Ltd" />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Invoice number (optional — auto-generated if blank)</label>
            <input value={invoiceNumberInput} onChange={function (e) { setInvoiceNumberInput(e.target.value); }} placeholder="e.g. INV-2026-0001" />
          </div>
          <div className="field">
            <label>Invoice date</label>
            <input type="date" value={invoiceDateInput} onChange={function (e) { setInvoiceDateInput(e.target.value); }} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Channel</label>
            <select value={channelInput} onChange={function (e) { setChannelInput(e.target.value); }}>
              <option value="SHOP">Shop</option>
              <option value="EXHIBITION">Exhibition</option>
            </select>
          </div>
          <div className="field">
            {channelInput === "EXHIBITION" && (
              <>
                <label>Exhibition name</label>
                <input value={exhibitionNameInput} onChange={function (e) { setExhibitionNameInput(e.target.value); }} placeholder="e.g. Pop Up Story, 23-25 Aug" />
              </>
            )}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Miscellaneous (Rs., whole order)</label>
            <input type="number" min="0" step="0.01" value={miscCost} onChange={function (e) { setMiscCost(e.target.value); }} />
          </div>
          <div className="field">
            <label>Shipping/Logistics (Rs., whole order)</label>
            <input type="number" min="0" step="0.01" value={shippingCost} onChange={function (e) { setShippingCost(e.target.value); }} />
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginBottom: 4 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textTransform: "none", letterSpacing: "normal", fontWeight: 400, fontSize: 13.5, marginBottom: 10 }}>
            <input type="checkbox" checked={isGiftInput} onChange={function (e) { setIsGiftInput(e.target.checked); }} style={{ width: "auto" }} />
            This is a gift / complimentary — no charge, zero revenue (cost is still recorded)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textTransform: "none", letterSpacing: "normal", fontWeight: 400, fontSize: 13.5, marginBottom: 14 }}>
            <input type="checkbox" checked={isTrialInput} onChange={function (e) { setIsTrialInput(e.target.checked); }} style={{ width: "auto" }} />
            This is a trial — stock leaves now, but it won't count as profit until marked Sold or Returned
          </label>
        </div>

        {!isGiftInput && (
          <div className="field-row">
            <div className="field">
              <label>GST %</label>
              <input type="number" min="0" step="0.1" value={gstInput} onChange={function (e) { setGstInput(e.target.value); }} />
            </div>
            <div className="field">
              <label>Discount (Rs., whole order)</label>
              <input type="number" min="0" step="0.01" value={discountInput} onChange={function (e) { setDiscountInput(e.target.value); }} />
            </div>
          </div>
        )}

        {!isGiftInput && (
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginBottom: 14 }}>
            <label>Apply store credit (optional — you can stack more than one)</label>

            {selectedCredits.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {(preview ? preview.creditAllocations : allocateCredits(selectedCredits, 0)).map(function (a) {
                  return (
                    <div key={a.note.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--line)", padding: "10px 12px", fontSize: 12.5, marginBottom: 6 }}>
                      <span>
                        {a.note.creditNumber || "CN-" + a.note.id} — {fmt(a.note.amount)} available
                        {a.amountUsed > 0 ? " · using " + fmt(a.amountUsed) : " · not needed"}
                      </span>
                      <button type="button" className="link-btn" onClick={function () { setSelectedCreditIds(function (ids) { return ids.filter(function (id) { return id !== a.note.id; }); }); }}>
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <input value={creditSearch} onChange={function (e) { setCreditSearch(e.target.value); }} placeholder="Search by credit note # or client name to add another" />
            {creditResults.length > 0 && (
              <div style={{ border: "1px solid var(--line)", marginTop: 8 }}>
                {creditResults.map(function (c) {
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={function () { setSelectedCreditIds(function (ids) { return ids.concat([c.id]); }); setCreditSearch(""); }}
                      style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid var(--line)", padding: "10px 12px", fontSize: 12.5, cursor: "pointer", color: "var(--ink)" }}
                    >
                      {c.creditNumber || "CN-" + c.id} — {c.clientName || "no name"} — {fmt(c.amount)}
                      {c.originalInvoice && c.originalInvoice.invoiceNumber ? " (from " + c.originalInvoice.invoiceNumber + ")" : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label>Amount paid now (Rs., optional)</label>
          <input type="number" min="0" step="0.01" value={amountPaidNow} onChange={function (e) { setAmountPaidNow(e.target.value); }} disabled={isGiftInput} />
        </div>

        {preview && (
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 6, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            {preview.lineDetails.map(function (l, i) {
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span>{l.design.name} × {l.quantity} (cost {fmt(l.materialAndLabour)} + markup {fmt(l.markupAmount)})</span>
                  <span className="num">{fmt(l.lineTotal)}</span>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)", marginTop: 6, fontWeight: 600 }}>
              <span>Items subtotal</span>
              <span className="num">{fmt(preview.itemsTotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span>+ Misc + Shipping</span>
              <span className="num">{fmt((parseFloat(miscCost) || 0) + (parseFloat(shippingCost) || 0))}</span>
            </div>
            {!isGiftInput && preview.discountN > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>− Discount</span>
                <span className="num">{fmt(preview.discountN)}</span>
              </div>
            )}
            {!isGiftInput && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>+ GST ({gstInput || 0}%)</span>
                <span className="num">{fmt(preview.gstAmount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--ink)", marginTop: 6, fontWeight: 700, fontSize: 14 }}>
              <span>Grand Total</span>
              <span className="num">{isGiftInput ? "Free (Gift)" : fmt(preview.grandTotal)}</span>
            </div>
            {preview.creditValue > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>Store credit applied</span>
                <span className="num">− {fmt(preview.creditValue)}</span>
              </div>
            )}
            {isTrialInput && (
              <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                This won't count toward Net Cash or Net Profit until you mark it Sold or Returned later.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        ref={viewModalRef}
        title={viewInvoice ? "Invoice — " + invoiceLabel(viewInvoice) : "Invoice"}
        width={640}
        footer={<ViewFooter />}
      >
        {viewInvoice && !editingInvoice && (
          <>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              <div className="muted" style={{ marginBottom: 10 }}>
                {viewInvoice.clientName ? viewInvoice.clientName + " · " : ""}
                {new Date(viewInvoice.createdAt).toLocaleDateString("en-IN")}
                {viewInvoice.channel === "EXHIBITION" ? " · " + (viewInvoice.exhibitionName || "Exhibition") : ""}
                {viewInvoice.isGift ? " · GIFT" : ""}
                {viewInvoice.isTrial ? (viewInvoice.trialResolvedAt ? " · TRIAL (resolved)" : " · TRIAL (unresolved)") : ""}
                {viewInvoice.returnedAt ? " · RETURNED" : ""}
              </div>

              <div style={{ fontWeight: 600, marginBottom: 4 }}>Items</div>
              {viewInvoice.items.map(function (item) {
                const materialAndLabour = item.fabricCost + item.trimsCost + item.packagingCost + item.labourCost;
                return (
                  <div key={item.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{item.design.name} × {item.quantity}</span>
                      <span className="num">{fmt(materialAndLabour + item.markupAmount)}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      Cost {fmt(materialAndLabour)} + Markup ({item.markupPercent.toFixed(1)}%) {fmt(item.markupAmount)}
                    </div>
                  </div>
                );
              })}

              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", marginTop: 8, fontWeight: 600 }}>
                <span>Items subtotal</span>
                <span className="num">
                  {fmt(viewInvoice.items.reduce(function (s, i) { return s + i.fabricCost + i.trimsCost + i.packagingCost + i.labourCost + i.markupAmount; }, 0))}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>Miscellaneous</span>
                <span className="num">{fmt(viewInvoice.miscCost)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>Shipping/Logistics</span>
                <span className="num">{fmt(viewInvoice.shippingCost)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)", marginTop: 6, fontWeight: 600 }}>
                <span>Subtotal</span>
                <span className="num">{fmt(viewInvoice.subtotal)}</span>
              </div>
              {viewInvoice.discountAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span>− Discount</span>
                  <span className="num">{fmt(viewInvoice.discountAmount)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>+ GST ({viewInvoice.gstPercent}%)</span>
                <span className="num">{fmt(viewInvoice.gstAmount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--ink)", marginTop: 6, fontWeight: 700, fontSize: 14 }}>
                <span>Grand Total</span>
                <span className="num">{fmt(viewInvoice.grandTotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                <span>Paid so far</span>
                <span className="num">{fmt(viewInvoice.amountPaid)}</span>
              </div>
              {viewInvoice.creditApplied > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span>
                    Store credit applied
                    {viewInvoice.creditRedemptions && viewInvoice.creditRedemptions.length > 0
                      ? " (" + viewInvoice.creditRedemptions.map(function (r) { return r.creditNote.creditNumber || "CN-" + r.creditNote.id; }).join(", ") + ")"
                      : ""}
                  </span>
                  <span className="num">{fmt(viewInvoice.creditApplied)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontWeight: 600 }}>
                <span>Balance due</span>
                <span className="num">{fmt(viewInvoice.grandTotal - viewInvoice.amountPaid - viewInvoice.creditApplied)}</span>
              </div>
            </div>

            {viewInvoice.payments.length > 0 && (
              <div style={{ marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
                <div style={{ fontWeight: 600, color: "var(--ink-soft)", marginBottom: 4 }}>Payment history</div>
                {viewInvoice.payments.map(function (p) {
                  return (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                      <span>{new Date(p.paidAt).toLocaleDateString("en-IN")}</span>
                      <span className="num">{fmt(p.amount)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {(viewInvoice.grandTotal - viewInvoice.amountPaid - viewInvoice.creditApplied) > 0 && (
              <div className="field-row" style={{ marginTop: 18, alignItems: "flex-end" }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Log a payment (Rs.)</label>
                  <input type="number" min="0" step="0.01" value={paymentAmt} onChange={function (e) { setPaymentAmt(e.target.value); }} />
                </div>
                <button type="button" className="btn small" onClick={handleLogPayment} disabled={saving} style={{ height: 41 }}>
                  {saving ? "Logging..." : "Log Payment"}
                </button>
                <button type="button" className="btn outline small" onClick={handleMarkPaidFull} disabled={saving} style={{ height: 41 }}>
                  Mark Paid in Full
                </button>
              </div>
            )}

            {viewInvoice.isTrial && !viewInvoice.trialResolvedAt && (
              <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  This is an unresolved trial — resolve it once you hear back.
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" className="btn small" onClick={function () { handleResolveTrial(viewInvoice, "SOLD"); }}>
                    Mark Sold
                  </button>
                  <button type="button" className="btn outline small" onClick={function () { handleResolveTrial(viewInvoice, "RETURNED"); }}>
                    Mark Returned
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {viewInvoice && editingInvoice && editForm && (
          <>
            <div className="field-row">
              <div className="field">
                <label>Client name</label>
                <input value={editForm.clientName} onChange={function (e) { setEditForm(function (f) { return Object.assign({}, f, { clientName: e.target.value }); }); }} />
              </div>
              <div className="field">
                <label>Invoice number</label>
                <input value={editForm.invoiceNumber} onChange={function (e) { setEditForm(function (f) { return Object.assign({}, f, { invoiceNumber: e.target.value }); }); }} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Invoice date</label>
                <input type="date" value={editForm.invoiceDate} onChange={function (e) { setEditForm(function (f) { return Object.assign({}, f, { invoiceDate: e.target.value }); }); }} />
              </div>
              <div className="field" />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Miscellaneous (Rs.)</label>
                <input type="number" min="0" step="0.01" value={editForm.miscCost} onChange={function (e) { setEditForm(function (f) { return Object.assign({}, f, { miscCost: e.target.value }); }); }} />
              </div>
              <div className="field">
                <label>Shipping/Logistics (Rs.)</label>
                <input type="number" min="0" step="0.01" value={editForm.shippingCost} onChange={function (e) { setEditForm(function (f) { return Object.assign({}, f, { shippingCost: e.target.value }); }); }} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Discount (Rs.)</label>
                <input type="number" min="0" step="0.01" value={editForm.discountAmount} onChange={function (e) { setEditForm(function (f) { return Object.assign({}, f, { discountAmount: e.target.value }); }); }} />
              </div>
              <div className="field">
                <label>GST %</label>
                <input type="number" min="0" step="0.1" value={editForm.gstPercent} onChange={function (e) { setEditForm(function (f) { return Object.assign({}, f, { gstPercent: e.target.value }); }); }} />
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Items, quantities, and per-item markup are locked — they're tied to how this invoice was created.
              Everything else here recalculates the Subtotal/GST/Grand Total immediately.
            </p>
          </>
        )}
      </Modal>

      <Modal
        ref={clientCopyModalRef}
        title="Client Copy"
        width={640}
        footer={
          <>
            <button type="button" className="btn outline small" onClick={function () { clientCopyModalRef.current && clientCopyModalRef.current.close(); }}>
              Close
            </button>
            <button type="button" className="btn small" onClick={function () { window.print(); }}>
              Download
            </button>
          </>
        }
      >
        {clientCopyInvoice && (function () {
          const itemsSubtotal = clientCopyInvoice.items.reduce(function (s, i) { return s + i.fabricCost + i.trimsCost + i.packagingCost + i.labourCost + i.markupAmount; }, 0);
          const preTaxAmount = clientCopyInvoice.subtotal - clientCopyInvoice.discountAmount;
          const balanceDue = clientCopyInvoice.grandTotal - clientCopyInvoice.amountPaid - clientCopyInvoice.creditApplied;

          return (
            <div className="print-invoice print-target">
              <div className="print-head">
                <div>
                  <div className="print-label">Invoice To</div>
                  <div className="print-value">{clientCopyInvoice.clientName || "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="print-label">Invoice No.</div>
                  <div className="print-value">{invoiceLabel(clientCopyInvoice)}</div>
                  <div className="print-label" style={{ marginTop: 10 }}>Date</div>
                  <div className="print-value">{new Date(clientCopyInvoice.createdAt).toLocaleDateString("en-IN")}</div>
                </div>
              </div>

              <table className="print-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {clientCopyInvoice.items.map(function (item) {
                    const lineTotal = item.fabricCost + item.trimsCost + item.packagingCost + item.labourCost + item.markupAmount;
                    const rate = item.quantity > 0 ? lineTotal / item.quantity : 0;
                    return (
                      <tr key={item.id}>
                        <td>
                          {item.design.name}
                          {item.design.description ? " — " + item.design.description : ""}
                          {clientCopyInvoice.isGift ? " (Gift)" : ""}
                        </td>
                        <td>{item.quantity}</td>
                        <td>{clientCopyInvoice.isGift ? "—" : fmt(rate)}</td>
                        <td>{clientCopyInvoice.isGift ? fmt(0) : fmt(lineTotal)}</td>
                      </tr>
                    );
                  })}
                  {(clientCopyInvoice.miscCost > 0 || clientCopyInvoice.shippingCost > 0) && (
                    <tr>
                      <td>Miscellaneous / Shipping</td>
                      <td>—</td>
                      <td>—</td>
                      <td>{fmt(clientCopyInvoice.miscCost + clientCopyInvoice.shippingCost)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="print-totals">
                {clientCopyInvoice.discountAmount > 0 && (
                  <div>
                    <span>Discount</span>
                    <span>− {fmt(clientCopyInvoice.discountAmount)}</span>
                  </div>
                )}
                <div>
                  <span>Taxable Value</span>
                  <span>{fmt(preTaxAmount)}</span>
                </div>
                <div>
                  <span>GST ({clientCopyInvoice.gstPercent}%)</span>
                  <span>{fmt(clientCopyInvoice.gstAmount)}</span>
                </div>
                <div className="print-total-grand">
                  <span>Grand Total</span>
                  <span>{fmt(clientCopyInvoice.grandTotal)}</span>
                </div>
                <div>
                  <span>Amount Paid</span>
                  <span>{fmt(clientCopyInvoice.amountPaid)}</span>
                </div>
                {clientCopyInvoice.creditApplied > 0 && (
                  <div>
                    <span>Store Credit Applied</span>
                    <span>− {fmt(clientCopyInvoice.creditApplied)}</span>
                  </div>
                )}
                <div className="print-total-grand">
                  <span>Balance Due</span>
                  <span>{fmt(balanceDue)}</span>
                </div>
              </div>

              <div className="print-words">{numberToWordsINR(clientCopyInvoice.grandTotal)}</div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        ref={returnModalRef}
        title={returnTarget ? "Return — " + invoiceLabel(returnTarget) : "Return"}
        footer={
          <>
            <button type="button" className="btn outline small" onClick={function () { returnModalRef.current && returnModalRef.current.close(); }}>
              Cancel
            </button>
            <button type="button" className="btn small" onClick={confirmReturn} disabled={returning || !receiptChecked || !itemUndamaged}>
              {returning ? "Processing..." : "Confirm Return"}
            </button>
          </>
        }
      >
        {returnTarget && (
          <>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
              This issues store credit worth {fmt(returnTarget.grandTotal)} against {invoiceLabel(returnTarget)}, and
              restores stock for every item on it. This does not affect Expenses or Net Cash/Net Profit calculations.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textTransform: "none", letterSpacing: "normal", fontWeight: 400, fontSize: 13.5 }}>
                <input type="checkbox" checked={receiptChecked} onChange={function (e) { setReceiptChecked(e.target.checked); }} style={{ width: "auto" }} />
                Receipt/invoice has been checked and matches
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textTransform: "none", letterSpacing: "normal", fontWeight: 400, fontSize: 13.5 }}>
                <input type="checkbox" checked={itemUndamaged} onChange={function (e) { setItemUndamaged(e.target.checked); }} style={{ width: "auto" }} />
                Item(s) inspected — not torn or damaged
              </label>
            </div>
            <div className="field">
              <label>Reason (optional)</label>
              <input value={returnReason} onChange={function (e) { setReturnReason(e.target.value); }} placeholder="e.g. Wrong size" />
            </div>
          </>
        )}
      </Modal>

      <Modal
        ref={receiptModalRef}
        title="Return Receipt"
        width={480}
        footer={
          <>
            <button type="button" className="btn outline small" onClick={function () { receiptModalRef.current && receiptModalRef.current.close(); }}>
              Close
            </button>
            <button type="button" className="btn small" onClick={function () { window.print(); }}>
              Download
            </button>
          </>
        }
      >
        {activeReceipt && (
          <div className="print-invoice print-target">
            <div className="print-head">
              <div>
                <div className="print-label">Refunded To</div>
                <div className="print-value">{activeReceipt.clientName || "—"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="print-label">Credit Note No.</div>
                <div className="print-value">{activeReceipt.creditNumber || "CN-" + activeReceipt.id}</div>
                <div className="print-label" style={{ marginTop: 10 }}>Date</div>
                <div className="print-value">{new Date(activeReceipt.createdAt).toLocaleDateString("en-IN")}</div>
              </div>
            </div>

            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span>Original Invoice</span>
                <span className="num">{activeReceipt.originalInvoiceNumber || "—"}</span>
              </div>
              {activeReceipt.reason && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <span>Reason</span>
                  <span className="num">{activeReceipt.reason}</span>
                </div>
              )}
              <div className="print-total-grand" style={{ marginTop: 10 }}>
                <span>Store Credit Issued</span>
                <span>{fmt(activeReceipt.amount)}</span>
              </div>
            </div>

            <div className="print-words" style={{ marginTop: 20 }}>
              {numberToWordsINR(activeReceipt.amount)} credited to your account for use on a future purchase.
            </div>
          </div>
        )}
      </Modal>

      <Toast toast={toast} show={show} />
    </>
  );
}
