"use client";

import { useRef, useState } from "react";
import Modal from "@/components/Modal";
import Badge from "@/components/Badge";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import { fmt, unitLabel, matName } from "@/lib/format";
import { addDesign, editDesign, deleteDesign, completeDesign, approveDesign, uploadDesignFile, deleteDesignFile, setDesignStock } from "@/app/actions";

const FILE_CATEGORIES = [
  { value: "TECH_PACK", label: "Tech Pack" },
  { value: "PAPER_CUTOUT", label: "Paper Pattern" },
  { value: "MODEL_SHOOT", label: "Model Shoots" },
];

function aggregates(d) {
  const units = d.completions.reduce((s, c) => s + c.quantityCompleted, 0);
  const cost = d.completions.reduce((s, c) => s + c.totalCost, 0);
  return { units, cost };
}

export default function DesignsClient({ designs, rawMaterials }) {
  const { toast, show, notify } = useToast();

  const designModalRef = useRef(null);
  const completeModalRef = useRef(null);
  const filesModalRef = useRef(null);
  const fileInputRef = useRef(null);

  const [modalMode, setModalMode] = useState("new");
  const [editTargetId, setEditTargetId] = useState(null);
  const [desName, setDesName] = useState("");
  const [desDesc, setDesDesc] = useState("");
  const [recipeRows, setRecipeRows] = useState([{ materialId: rawMaterials[0]?.id ?? "", qty: "" }]);
  const [costDefaults, setCostDefaults] = useState({ labour: "0", misc: "0", shipping: "0", markup: "100", gst: "18" });
  const [saving, setSaving] = useState(false);

  const [completeTarget, setCompleteTarget] = useState(null);
  const [completeQty, setCompleteQty] = useState(1);

  const [filesTarget, setFilesTarget] = useState(null);
  const [uploading, setUploading] = useState(false);
  const stockModalRef = useRef(null);
  const [stockTargetId, setStockTargetId] = useState(null);
  const [stockInput, setStockInput] = useState("0");

  function openNewDesign() {
    setModalMode("new");
    setEditTargetId(null);
    setDesName("");
    setDesDesc("");
    setRecipeRows([{ materialId: rawMaterials[0]?.id ?? "", qty: "" }]);
    setCostDefaults({ labour: "0", misc: "0", shipping: "0", markup: "100", gst: "18" });
    designModalRef.current?.showModal();
  }

  function openEdit(d) {
    setModalMode("edit");
    setEditTargetId(d.id);
    setDesName(d.name);
    setDesDesc(d.description || "");
    setRecipeRows(d.recipe.map((r) => ({ materialId: r.rawMaterialId, qty: String(r.quantityRequired) })));
    setCostDefaults({
      labour: String(d.defaultLabourCost),
      misc: String(d.defaultMiscCost),
      shipping: String(d.defaultShippingCost),
      markup: String(d.defaultMarkupPercent),
      gst: String(d.defaultGstPercent),
    });
    designModalRef.current?.showModal();
  }

  function openCopy(d) {
    setModalMode("copy");
    setEditTargetId(null);
    setDesName(`${d.name} Copy`);
    setDesDesc(d.description || "");
    setRecipeRows(d.recipe.map((r) => ({ materialId: r.rawMaterialId, qty: String(r.quantityRequired) })));
    setCostDefaults({
      labour: String(d.defaultLabourCost),
      misc: String(d.defaultMiscCost),
      shipping: String(d.defaultShippingCost),
      markup: String(d.defaultMarkupPercent),
      gst: String(d.defaultGstPercent),
    });
    designModalRef.current?.showModal();
  }

  function updateRow(i, patch) {
    setRecipeRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRecipeRows((rows) => [...rows, { materialId: rawMaterials[0]?.id ?? "", qty: "" }]);
  }
  function removeRow(i) {
    setRecipeRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function saveDesign() {
    if (!desName.trim()) {
      notify("Give the design a name.", true);
      return;
    }
    const recipe = recipeRows
      .map((r) => ({ materialId: Number(r.materialId), qty: parseFloat(r.qty) }))
      .filter((r) => !isNaN(r.qty) && r.qty > 0);
    if (recipe.length === 0) {
      notify("Add at least one material line to the recipe.", true);
      return;
    }
    const payload = {
      name: desName.trim(),
      description: desDesc.trim(),
      recipe,
      defaultLabourCost: parseFloat(costDefaults.labour) || 0,
      defaultMiscCost: parseFloat(costDefaults.misc) || 0,
      defaultShippingCost: parseFloat(costDefaults.shipping) || 0,
      defaultMarkupPercent: parseFloat(costDefaults.markup) || 0,
      defaultGstPercent: parseFloat(costDefaults.gst) || 0,
    };

    setSaving(true);
    const res = modalMode === "edit" ? await editDesign(editTargetId, payload) : await addDesign(payload);
    setSaving(false);

    if (res.ok) {
      notify(modalMode === "edit" ? `${payload.name} updated.` : `${payload.name} added to the design register.`);
      designModalRef.current?.close();
    } else {
      notify(res.message || "Something went wrong.", true);
    }
  }

  async function handleDelete(d) {
    const { units } = aggregates(d);
    const ok = window.confirm(
      units > 0
        ? `Delete "${d.name}"? This removes it and its production history (${units} unit${units > 1 ? "s" : ""} made so far).`
        : `Delete "${d.name}"? This removes it from the design register.`
    );
    if (!ok) return;

    let restoreStock = false;
    if (units > 0) {
      restoreStock = window.confirm(
        `Also restore the raw material stock this design consumed (${units} unit${units > 1 ? "s" : ""} worth)? Click OK to restore it, Cancel to leave stock as-is.`
      );
    }

    const res = await deleteDesign(d.id, restoreStock);
    if (res.ok) notify(restoreStock ? "Design deleted — stock restored." : "Design deleted.");
    else notify(res.message || "Could not delete design.", true);
  }

  function openComplete(d) {
    setCompleteTarget(d);
    setCompleteQty(1);
    completeModalRef.current?.showModal();
  }
  async function confirmComplete() {
    const qty = parseInt(completeQty, 10);
    if (!qty || qty < 1) {
      notify("Enter a valid quantity.", true);
      return;
    }
    setSaving(true);
    const res = await completeDesign(completeTarget.id, qty);
    setSaving(false);
    if (res.ok) {
      notify(`${completeTarget.name} — ${qty} unit(s) produced.`);
      completeModalRef.current?.close();
    } else {
      notify(res.message || "Could not complete design.", true);
    }
  }

  async function handleApprove(d) {
    const res = await approveDesign(d.id);
    if (res.ok) notify("Design approved — SKU generated.");
    else notify(res.message || "Could not approve design.", true);
  }

  function openStockAdjust(d) {
    setStockTargetId(d.id);
    setStockInput(String(d.inStock));
    stockModalRef.current && stockModalRef.current.showModal();
  }

  async function saveStockAdjust() {
    const count = parseInt(stockInput, 10);
    if (isNaN(count) || count < 0) {
      notify("Enter a valid stock count.", true);
      return;
    }
    const res = await setDesignStock(stockTargetId, count);
    if (res.ok) {
      notify("In-stock count updated.");
      stockModalRef.current && stockModalRef.current.close();
    } else {
      notify(res.message || "Could not update stock.", true);
    }
  }

  function openFiles(d, category, label) {
    setFilesTarget({ designId: d.id, category, label });
    filesModalRef.current?.showModal();
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !filesTarget) return;

    const fd = new FormData();
    fd.append("designId", String(filesTarget.designId));
    fd.append("category", filesTarget.category);
    fd.append("file", file);

    setUploading(true);
    const res = await uploadDesignFile(fd);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!res.ok) notify(res.message || "Upload failed.", true);
  }

  async function handleFileDelete(fileId) {
    const ok = window.confirm("Delete this file? This can't be undone.");
    if (!ok) return;
    const res = await deleteDesignFile(fileId);
    if (!res.ok) notify(res.message || "Could not delete file.", true);
  }

  const previewLines = completeTarget
    ? completeTarget.recipe.map((r) => {
        const m = rawMaterials.find((x) => x.id === r.rawMaterialId);
        const needed = r.quantityRequired * (parseInt(completeQty, 10) || 0);
        const short = m && m.quantityInStock < needed;
        return { m, needed, short };
      })
    : [];
  const previewTotal = previewLines.reduce((sum, l) => sum + (l.m ? l.needed * l.m.costPerUnit : 0), 0);
  const insufficient = previewLines.some((l) => l.short);

  const modalTitle = modalMode === "edit" ? "Edit Design" : modalMode === "copy" ? "Copy Design" : "New Design";
  const modalSaveLabel = modalMode === "edit" ? "Save Changes" : "Save Design";

  const filesTargetDesign = filesTarget ? designs.find((d) => d.id === filesTarget.designId) : null;
  const filesTargetFiles = filesTargetDesign
    ? filesTargetDesign.files.filter((f) => f.category === filesTarget.category)
    : [];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Bill of Materials</div>
          <h1>Designs</h1>
          <p>Define each design&apos;s exact material recipe, complete a production run, then send it for approval.</p>
        </div>
        <button className="btn" onClick={openNewDesign}>
          + New Design
        </button>
      </div>

      <div className="grid cols-3">
        {designs.map((d) => {
          const { units, cost } = aggregates(d);
          return (
            <div className="design-card" key={d.id}>
              <div className="dtitle">
                <div>
                  <h3>{d.name}</h3>
                  <div className="desc">{d.description || "No description"}</div>
                </div>
                <Badge status={d.status} />
              </div>

              <div className="recipe-list">
                {d.recipe.map((r) => {
                  const m = rawMaterials.find((x) => x.id === r.rawMaterialId);
                  return (
                    <div key={r.id}>
                      <span>{m ? matName(m) : "Unknown"}</span>
                      <span className="num">
                        {r.quantityRequired} {m ? unitLabel(m.unit) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>

              {units > 0 && (
                <div className="cost-line">
                  <span>
                    Produced so far ({units} unit{units > 1 ? "s" : ""})
                  </span>
                  <span className="num">{fmt(cost)}</span>
                </div>
              )}
              <div className="cost-line">
                <span>In stock</span>
                <span className="num">
                  {d.inStock} unit{d.inStock !== 1 ? "s" : ""}
                </span>
              </div>
              <button className="btn outline small btn-full" onClick={() => openStockAdjust(d)}>
                Adjust Stock
              </button>
              {d.sku && (
                <div className="cost-line">
                  <span>SKU / Barcode</span>
                  <span className="num">{d.sku}</span>
                </div>
              )}

              <div className="attachments-row">
                {FILE_CATEGORIES.map((c) => {
                  const count = d.files.filter((f) => f.category === c.value).length;
                  return (
                    <button
                      key={c.value}
                      className="btn outline small"
                      onClick={() => openFiles(d, c.value, c.label)}
                    >
                      {c.label} <span className="file-count">({count})</span>
                    </button>
                  );
                })}
              </div>

              {d.status === "NOT_COMPLETED" && (
                <button className="btn small btn-full" onClick={() => openComplete(d)}>
                  Mark Completed
                </button>
              )}
              {d.status === "COMPLETED" && (
                <button className="btn small btn-full" onClick={() => handleApprove(d)}>
                  Approve &amp; Generate SKU
                </button>
              )}
              {d.status === "APPROVED" && (
                <button className="btn small btn-full" onClick={() => openComplete(d)}>
                  Produce More Units
                </button>
              )}

              <div className="secondary-actions-row">
                <button className="btn outline small" onClick={() => openEdit(d)}>
                  Edit
                </button>
                <button className="btn outline small" onClick={() => openCopy(d)}>
                  Copy
                </button>
                <button
                  className="btn outline small"
                  style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                  onClick={() => handleDelete(d)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        ref={designModalRef}
        title={modalTitle}
        footer={
          <>
            <button type="button" className="btn outline small" onClick={() => designModalRef.current?.close()}>
              Cancel
            </button>
            <button type="button" className="btn small" onClick={saveDesign} disabled={saving}>
              {saving ? "Saving..." : modalSaveLabel}
            </button>
          </>
        }
      >
        <div className="field-row">
          <div className="field">
            <label>Design name</label>
            <input value={desName} onChange={(e) => setDesName(e.target.value)} placeholder="e.g. Design 2" />
          </div>
          <div className="field">
            <label>Description</label>
            <input value={desDesc} onChange={(e) => setDesDesc(e.target.value)} placeholder="e.g. Shirt" />
          </div>
        </div>
        <label style={{ marginTop: 4 }}>Bill of Materials (recipe)</label>
        {recipeRows.map((row, i) => (
          <div className="recipe-row" key={i}>
            <div className="field" style={{ marginBottom: 0 }}>
              <select value={row.materialId} onChange={(e) => updateRow(i, { materialId: e.target.value })}>
                {rawMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {matName(m)} ({unitLabel(m.unit)})
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Qty"
                value={row.qty}
                onChange={(e) => updateRow(i, { qty: e.target.value })}
              />
            </div>
            <button type="button" className="rm-btn" onClick={() => removeRow(i)}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="link-btn" style={{ marginTop: 4 }} onClick={addRow}>
          + Add material line
        </button>

        <label style={{ marginTop: 20 }}>Default costs (prefill onto every invoice for this design — editable per invoice)</label>
        <div className="field-row">
          <div className="field">
            <label>Labour (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costDefaults.labour}
              onChange={(e) => setCostDefaults((c) => ({ ...c, labour: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Miscellaneous (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costDefaults.misc}
              onChange={(e) => setCostDefaults((c) => ({ ...c, misc: e.target.value }))}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Shipping/Logistics (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costDefaults.shipping}
              onChange={(e) => setCostDefaults((c) => ({ ...c, shipping: e.target.value }))}
            />
          </div>
          <div className="field" />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Markup %</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={costDefaults.markup}
              onChange={(e) => setCostDefaults((c) => ({ ...c, markup: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>GST %</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={costDefaults.gst}
              onChange={(e) => setCostDefaults((c) => ({ ...c, gst: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      <Modal
        ref={completeModalRef}
        title={completeTarget?.status === "APPROVED" ? "Produce More Units" : "Mark Design Completed"}
        footer={
          <>
            <button
              type="button"
              className="btn outline small"
              onClick={() => completeModalRef.current?.close()}
            >
              Cancel
            </button>
            <button type="button" className="btn small" onClick={confirmComplete} disabled={saving}>
              {saving ? "Saving..." : "Confirm"}
            </button>
          </>
        }
      >
        {completeTarget && (
          <>
            {completeTarget.status === "APPROVED" && (
              <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
                This design already has SKU {completeTarget.sku}. Producing more units deducts
                stock and adds to its total — the SKU and barcode stay the same.
              </p>
            )}
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 16 }}>
              {previewLines.map((l, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "2px 0",
                    color: l.short ? "var(--danger)" : undefined,
                    fontWeight: l.short ? 600 : 400,
                  }}
                >
                  <span>{l.m ? matName(l.m) : "Unknown"}</span>
                  <span className="num">
                    {l.needed} {l.m ? unitLabel(l.m.unit) : ""} needed ({l.m?.quantityInStock} {l.m ? unitLabel(l.m.unit) : ""} in stock)
                  </span>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingTop: 8,
                  marginTop: 6,
                  borderTop: "1px solid var(--line)",
                  fontWeight: 600,
                }}
              >
                <span>Total material cost</span>
                <span className="num">{fmt(previewTotal)}</span>
              </div>
            </div>
            <div className="field">
              <label>Quantity to produce (units)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={completeQty}
                onChange={(e) => setCompleteQty(e.target.value)}
              />
            </div>
            {insufficient && (
              <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10, fontWeight: 600 }}>
                Insufficient raw material stock for this quantity. Completion is blocked until
                stock is sufficient.
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        ref={filesModalRef}
        title={filesTarget?.label || "Attachments"}
        footer={
          <>
            <button type="button" className="btn outline small" onClick={() => filesModalRef.current?.close()}>
              Close
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "+ Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
          </>
        }
      >
        {filesTargetDesign && (
          <>
            <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
              {filesTargetDesign.name} — PDF, JPG, or PNG, up to 8MB each.
            </p>
            {filesTargetFiles.length === 0 ? (
              <div className="empty">Nothing uploaded yet.</div>
            ) : (
              <div className="file-grid">
                {filesTargetFiles.map((f) => (
                  <div className="file-item" key={f.id}>
                    {f.mimeType.startsWith("image/") ? (
                      <a href={`/files/${f.id}`} target="_blank" rel="noreferrer">
                        <img src={`/files/${f.id}`} alt={f.fileName} />
                      </a>
                    ) : (
                      <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="file-pdf-link">
                        <span className="file-icon">📄</span>
                        {f.fileName}
                      </a>
                    )}
                    <button
                      type="button"
                      className="file-delete"
                      onClick={() => handleFileDelete(f.id)}
                      aria-label="Delete file"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        ref={stockModalRef}
        title="Adjust In-Stock Count"
        footer={
          <>
            <button type="button" className="btn outline small" onClick={() => stockModalRef.current?.close()}>
              Cancel
            </button>
            <button type="button" className="btn small" onClick={saveStockAdjust}>
              Save
            </button>
          </>
        }
      >
        <div className="field">
          <label>Units currently in stock</label>
          <input
            type="number"
            min="0"
            step="1"
            value={stockInput}
            onChange={(e) => setStockInput(e.target.value)}
          />
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Sets the exact count directly — use this to correct the number to what's actually sitting in the
          warehouse right now, rather than adding to it.
        </p>
      </Modal>

      <Toast toast={toast} show={show} />
    </>
  );
}