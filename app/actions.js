"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/session";

const DEFAULT_PASSWORD = "TurnOver@123";

function refreshAll() {
  revalidatePath("/dashboard");
  revalidatePath("/materials");
  revalidatePath("/designs");
  revalidatePath("/products");
}

// ---------- Raw materials ----------

export async function addMaterial({ name, color, unit, category, subtype, cost, qty, minStock }) {
  const min = minStock ?? 20;
  await prisma.rawMaterial.create({
    data: {
      name,
      color: color || null,
      unit,
      category,
      subtype,
      costPerUnit: cost,
      quantityInStock: qty,
      minStock: min,
      lowStockSeen: !(qty < min),
    },
  });
  refreshAll();
  return { ok: true };
}

export async function addStock(materialId, amount) {
  const material = await prisma.rawMaterial.findUnique({ where: { id: materialId } });
  if (!material) return { ok: false, message: "Material not found." };

  const newQty = material.quantityInStock + amount;
  const clearsAlert = newQty >= material.minStock;

  await prisma.rawMaterial.update({
    where: { id: materialId },
    data: {
      quantityInStock: { increment: amount },
      ...(clearsAlert ? { lowStockSeen: true } : {}),
    },
  });
  refreshAll();
  return { ok: true };
}

export async function deleteMaterial(materialId) {
  try {
    await prisma.rawMaterial.delete({ where: { id: materialId } });
    refreshAll();
    return { ok: true };
  } catch (err) {
    if (err.code === "P2003") {
      return {
        ok: false,
        message:
          "Can't delete this — it's used in one or more design recipes or production runs. Remove it from those designs first.",
      };
    }
    return { ok: false, message: "Could not delete material." };
  }
}

export async function editMaterial(materialId, { name, color, unit, category, subtype, cost, minStock }) {
  const current = await prisma.rawMaterial.findUnique({ where: { id: materialId } });
  if (!current) return { ok: false, message: "Material not found." };

  const newMin = minStock ?? current.minStock;
  const minChanged = newMin !== current.minStock;

  const data = { name, color: color || null, unit, category, subtype, costPerUnit: cost, minStock: newMin };
  if (minChanged) {
    data.lowStockSeen = !(current.quantityInStock < newMin);
  }

  await prisma.rawMaterial.update({ where: { id: materialId }, data });
  refreshAll();
  return { ok: true };
}

// ---------- Designs ----------

export async function addDesign({
  name,
  description,
  recipe,
  defaultLabourCost,
  defaultMiscCost,
  defaultShippingCost,
  defaultMarkupPercent,
  defaultGstPercent,
}) {
  await prisma.design.create({
    data: {
      name,
      description: description || null,
      status: "NOT_COMPLETED",
      defaultLabourCost: defaultLabourCost ?? 0,
      defaultMiscCost: defaultMiscCost ?? 0,
      defaultShippingCost: defaultShippingCost ?? 0,
      defaultMarkupPercent: defaultMarkupPercent ?? 100,
      defaultGstPercent: defaultGstPercent ?? 18,
      recipe: {
        create: recipe.map((r) => ({ rawMaterialId: r.materialId, quantityRequired: r.qty })),
      },
    },
  });
  refreshAll();
  return { ok: true };
}

export async function editDesign(
  designId,
  { name, description, recipe, defaultLabourCost, defaultMiscCost, defaultShippingCost, defaultMarkupPercent, defaultGstPercent }
) {
  await prisma.$transaction(async (tx) => {
    await tx.designRecipeItem.deleteMany({ where: { designId } });
    await tx.design.update({
      where: { id: designId },
      data: {
        name,
        description: description || null,
        defaultLabourCost: defaultLabourCost ?? 0,
        defaultMiscCost: defaultMiscCost ?? 0,
        defaultShippingCost: defaultShippingCost ?? 0,
        defaultMarkupPercent: defaultMarkupPercent ?? 100,
        defaultGstPercent: defaultGstPercent ?? 18,
        recipe: {
          create: recipe.map((r) => ({ rawMaterialId: r.materialId, quantityRequired: r.qty })),
        },
      },
    });
  });
  refreshAll();
  return { ok: true };
}

export async function deleteDesign(designId, restoreStock = false) {
  await prisma.$transaction(async (tx) => {
    if (restoreStock) {
      const deductions = await tx.materialDeduction.findMany({
        where: { completion: { designId } },
      });
      for (const d of deductions) {
        await tx.rawMaterial.update({
          where: { id: d.rawMaterialId },
          data: { quantityInStock: { increment: d.amountDeducted } },
        });
      }
    }
    await tx.design.delete({ where: { id: designId } });
  });
  refreshAll();
  return { ok: true };
}

export async function completeDesign(designId, qty) {
  try {
    await prisma.$transaction(async (tx) => {
      const design = await tx.design.findUnique({
        where: { id: designId },
        include: { recipe: { include: { rawMaterial: true } } },
      });
      if (!design) throw new Error("Design not found.");

      for (const item of design.recipe) {
        const needed = item.quantityRequired * qty;
        if (item.rawMaterial.quantityInStock < needed) {
          throw new Error(`Not enough ${item.rawMaterial.name} in stock to complete ${qty} unit(s).`);
        }
      }

      let totalCost = 0;
      const deductionsData = [];
      for (const item of design.recipe) {
        const needed = item.quantityRequired * qty;
        totalCost += needed * item.rawMaterial.costPerUnit;

        const newQty = item.rawMaterial.quantityInStock - needed;
        const justCrossedLow = item.rawMaterial.quantityInStock >= item.rawMaterial.minStock && newQty < item.rawMaterial.minStock;

        await tx.rawMaterial.update({
          where: { id: item.rawMaterialId },
          data: {
            quantityInStock: { decrement: needed },
            ...(justCrossedLow ? { lowStockSeen: false } : {}),
          },
        });
        deductionsData.push({ rawMaterialId: item.rawMaterialId, amountDeducted: needed });
      }

      await tx.designCompletion.create({
        data: {
          designId,
          quantityCompleted: qty,
          totalCost,
          deductions: { create: deductionsData },
        },
      });

      if (design.status === "NOT_COMPLETED") {
        await tx.design.update({ where: { id: designId }, data: { status: "COMPLETED" } });
      }

      await tx.design.update({ where: { id: designId }, data: { inStock: { increment: qty } } });
    });

    refreshAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || "Could not complete design." };
  }
}

export async function approveDesign(designId) {
  try {
    await prisma.$transaction(async (tx) => {
      const design = await tx.design.findUnique({ where: { id: designId } });
      if (!design || design.status !== "COMPLETED") {
        throw new Error("Design must be completed before it can be approved.");
      }

      let barcode;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = Math.floor(100000000000 + Math.random() * 899999999999).toString();
        const clash = await tx.design.findUnique({ where: { barcode: candidate } });
        if (!clash) {
          barcode = candidate;
          break;
        }
      }
      if (!barcode) throw new Error("Could not generate a unique barcode, try again.");

      const sku =
        "TO-" + design.name.replace(/\s+/g, "").toUpperCase().slice(0, 6) + "-" + String(design.id).padStart(3, "0");

      await tx.design.update({
        where: { id: designId },
        data: { status: "APPROVED", barcode, sku, approvedAt: new Date() },
      });
    });

    refreshAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || "Could not approve design." };
  }
}

// ---------- Scan / lookup ----------

export async function lookupBarcode(barcode) {
  const clean = barcode.trim();
  if (!clean) return { ok: false, message: "Enter or scan a barcode." };

  const design = await prisma.design.findUnique({
    where: { barcode: clean },
    include: { recipe: { include: { rawMaterial: true } }, completions: true },
  });

  if (!design) {
    return { ok: false, message: `No product found for barcode ${clean}.` };
  }

  return { ok: true, design };
}

// ---------- Invoices ----------

export async function createInvoice({
  items,
  clientName,
  invoiceNumber,
  invoiceDate,
  miscCost,
  shippingCost,
  discountAmount,
  gstPercent,
  isGift,
  isTrial,
  channel,
  exhibitionName,
  reminderDays,
  creditNoteIds,
  amountPaidNow,
  forceConfirm,
}) {
  if (!items || items.length === 0) {
    return { ok: false, message: "Add at least one item." };
  }

  try {
    let invoiceId;
    let needsConfirm = false;
    let shortages = [];

    await prisma.$transaction(async (tx) => {
      const designs = [];
      for (const line of items) {
        const design = await tx.design.findUnique({
          where: { id: line.designId },
          include: { recipe: { include: { rawMaterial: true } } },
        });
        if (!design) throw new Error("A selected design was not found.");
        designs.push(design);
        if (design.inStock < line.quantity) {
          shortages.push({ name: design.name, available: design.inStock, requested: line.quantity });
        }
      }

      if (shortages.length > 0 && !forceConfirm) {
        needsConfirm = true;
        return;
      }

      const gift = !!isGift;
      const trial = !!isTrial;
      const gst = gstPercent ?? 18;
      const discount = gift ? 0 : Math.max(0, discountAmount || 0);
      const misc = miscCost || 0;
      const shipping = shippingCost || 0;

      const itemRows = [];
      let itemsTotal = 0;

      for (let i = 0; i < items.length; i++) {
        const line = items[i];
        const design = designs[i];

        const newStock = design.inStock >= line.quantity ? design.inStock - line.quantity : 0;
        await tx.design.update({ where: { id: design.id }, data: { inStock: newStock } });

        if (design.status === "NOT_COMPLETED") {
          await tx.design.update({ where: { id: design.id }, data: { status: "COMPLETED" } });
        }
        if (design.status !== "APPROVED") {
          const existingBarcodes = new Set(
            (await tx.design.findMany({ where: { barcode: { not: null } }, select: { barcode: true } })).map((d) => d.barcode)
          );
          const makeBarcode = () => Math.floor(100000000000 + Math.random() * 899999999999).toString();
          let barcode = makeBarcode();
          while (existingBarcodes.has(barcode)) barcode = makeBarcode();
          const sku = "TO-" + design.name.replace(/\s+/g, "").toUpperCase().slice(0, 6) + "-" + String(design.id).padStart(3, "0");
          await tx.design.update({
            where: { id: design.id },
            data: { status: "APPROVED", barcode, sku, approvedAt: new Date() },
          });
        }

        let fabricCost = 0;
        let trimsCost = 0;
        let packagingCost = 0;
        for (const r of design.recipe) {
          const needed = r.quantityRequired * line.quantity;
          const lineCost = needed * r.rawMaterial.costPerUnit;
          if (r.rawMaterial.category === "FABRIC") fabricCost += lineCost;
          else if (r.rawMaterial.category === "TRIMS") trimsCost += lineCost;
          else if (r.rawMaterial.category === "PACKAGING") packagingCost += lineCost;
        }
        const labourCost = line.labourCost ?? design.defaultLabourCost;
        const materialAndLabour = fabricCost + trimsCost + packagingCost + labourCost;
        const markupPercent = gift ? 0 : (line.markupPercent ?? design.defaultMarkupPercent);
        const markupAmount = gift ? 0 : materialAndLabour * (markupPercent / 100);

        itemsTotal += materialAndLabour + markupAmount;

        itemRows.push({
          designId: design.id,
          quantity: line.quantity,
          fabricCost,
          trimsCost,
          packagingCost,
          labourCost,
          markupPercent,
          markupAmount,
        });
      }

      const subtotal = itemsTotal + misc + shipping;
      const preTax = Math.max(0, subtotal - discount);
      const gstAmount = gift ? 0 : preTax * (gst / 100);
      const grandTotal = gift ? 0 : preTax + gstAmount;

      let credit = 0;
      const allocations = [];
      if (creditNoteIds && creditNoteIds.length > 0) {
        let remainingNeed = grandTotal;
        for (const cnId of creditNoteIds) {
          if (remainingNeed <= 0) break;
          const note = await tx.creditNote.findUnique({ where: { id: cnId } });
          if (!note || note.status !== "UNREDEEMED" || note.amount <= 0) continue;
          const use = Math.min(note.amount, remainingNeed);
          if (use <= 0) continue;
          allocations.push({ note, amountUsed: use });
          credit += use;
          remainingNeed -= use;
        }
      }

      const paid = Math.min(Math.max(amountPaidNow || 0, 0), Math.max(0, grandTotal - credit));
      const totalCovered = paid + credit;
      const paymentStatus = grandTotal <= 0 ? "PAID" : totalCovered <= 0 ? "UNPAID" : totalCovered >= grandTotal ? "PAID" : "PARTIAL";

      const invoice = await tx.invoice.create({
        data: {
          clientName: clientName || null,
          createdAt: invoiceDate ? new Date(invoiceDate) : undefined,
          channel: channel || "SHOP",
          exhibitionName: channel === "EXHIBITION" ? (exhibitionName || null) : null,
          isTrial: trial,
          reminderDays: reminderDays || null,
          miscCost: misc,
          shippingCost: shipping,
          discountAmount: discount,
          isGift: gift,
          gstPercent: gift ? 0 : gst,
          gstAmount,
          subtotal,
          grandTotal,
          amountPaid: paid,
          creditApplied: credit,
          paymentStatus,
          payments: paid > 0 ? { create: [{ amount: paid }] } : undefined,
          items: { create: itemRows },
        },
      });

      for (const alloc of allocations) {
        await tx.creditNoteRedemption.create({
          data: { invoiceId: invoice.id, creditNoteId: alloc.note.id, amountUsed: alloc.amountUsed },
        });
        const remaining = Math.max(0, alloc.note.amount - alloc.amountUsed);
        await tx.creditNote.update({
          where: { id: alloc.note.id },
          data: {
            amount: remaining,
            status: remaining <= 0 ? "REDEEMED" : "UNREDEEMED",
            redeemedAt: new Date(),
          },
        });
      }

      const finalInvoiceNumber =
        invoiceNumber && invoiceNumber.trim()
          ? invoiceNumber.trim()
          : "INV-" + new Date().getFullYear() + "-" + String(invoice.id).padStart(4, "0");
      await tx.invoice.update({ where: { id: invoice.id }, data: { invoiceNumber: finalInvoiceNumber } });

      invoiceId = invoice.id;
    });

    if (needsConfirm) {
      return {
        ok: false,
        needsConfirm: true,
        shortages,
        message: shortages.map((s) => `${s.name}: only ${s.available} in stock, ${s.requested} requested`).join("; "),
      };
    }

    refreshAll();
    revalidatePath("/invoices");
    return { ok: true, invoiceId };
  } catch (err) {
    return { ok: false, message: err.message || "Could not create invoice." };
  }
}
export async function createReturn(invoiceId, { receiptChecked, itemUndamaged, reason }) {
  if (!receiptChecked || !itemUndamaged) {
    return { ok: false, message: "Both checklist items must be confirmed before returning." };
  }
  try {
    let creditNoteId;
    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
      if (!invoice) throw new Error("Invoice not found.");
      if (invoice.returnedAt) throw new Error("This invoice has already been returned.");

      for (const item of invoice.items) {
        await tx.design.update({
          where: { id: item.designId },
          data: { inStock: { increment: item.quantity } },
        });
      }

      const note = await tx.creditNote.create({
        data: {
          originalInvoiceId: invoice.id,
          clientName: invoice.clientName,
          amount: invoice.grandTotal,
          reason: reason || null,
          receiptChecked: true,
          itemUndamaged: true,
        },
      });

      const creditNumber = "CN-" + new Date().getFullYear() + "-" + String(note.id).padStart(4, "0");
      await tx.creditNote.update({ where: { id: note.id }, data: { creditNumber } });

      await tx.invoice.update({ where: { id: invoice.id }, data: { returnedAt: new Date() } });

      creditNoteId = note.id;
    });

    refreshAll();
    revalidatePath("/invoices");
    return { ok: true, creditNoteId };
  } catch (err) {
    return { ok: false, message: err.message || "Could not process return." };
  }
}

export async function resolveTrial(invoiceId, outcome) {
  try {
    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
      if (!invoice) throw new Error("Invoice not found.");
      if (!invoice.isTrial) throw new Error("This invoice isn't a trial.");
      if (invoice.trialResolvedAt) throw new Error("This trial has already been resolved.");

      if (outcome === "RETURNED") {
        for (const item of invoice.items) {
          await tx.design.update({
            where: { id: item.designId },
            data: { inStock: { increment: item.quantity } },
          });
        }
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { trialResolvedAt: new Date(), returnedAt: new Date() },
        });
      } else {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { trialResolvedAt: new Date() },
        });
      }
    });

    refreshAll();
    revalidatePath("/invoices");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || "Could not resolve trial." };
  }
}

export async function setDesignStock(designId, count) {
  await prisma.design.update({ where: { id: designId }, data: { inStock: Math.max(0, count) } });
  refreshAll();
  return { ok: true };
}

export async function deleteInvoice(invoiceId) {
  try {
    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
      if (!invoice) throw new Error("Invoice not found.");

      for (const item of invoice.items) {
        await tx.design.update({
          where: { id: item.designId },
          data: { inStock: { increment: item.quantity } },
        });
      }

      await tx.invoice.delete({ where: { id: invoiceId } });
    });

    refreshAll();
    revalidatePath("/invoices");
    return { ok: true };
  } catch (err) {
    if (err.code === "P2003") {
      return {
        ok: false,
        message: "Can't delete — this invoice has a linked record (e.g. a credit note) blocking it.",
      };
    }
    return { ok: false, message: err.message || "Could not delete invoice." };
  }
}

export async function editInvoice(
  invoiceId,
  { clientName, invoiceNumber, invoiceDate, miscCost, shippingCost, discountAmount, gstPercent }
) {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
    if (!invoice) return { ok: false, message: "Invoice not found." };

    const itemsTotal = invoice.items.reduce((s, i) => {
      const materialAndLabour = i.fabricCost + i.trimsCost + i.packagingCost + i.labourCost;
      return s + materialAndLabour + i.markupAmount;
    }, 0);

    const subtotal = itemsTotal + miscCost + shippingCost;
    const discount = invoice.isGift ? 0 : Math.max(0, discountAmount || 0);
    const preTax = Math.max(0, subtotal - discount);
    const gstAmount = invoice.isGift ? 0 : preTax * (gstPercent / 100);
    const grandTotal = invoice.isGift ? 0 : preTax + gstAmount;

    const totalCovered = invoice.amountPaid + invoice.creditApplied;
    const paymentStatus = grandTotal <= 0 ? "PAID" : totalCovered <= 0 ? "UNPAID" : totalCovered >= grandTotal ? "PAID" : "PARTIAL";

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        clientName: clientName || null,
        invoiceNumber: invoiceNumber || null,
        createdAt: invoiceDate ? new Date(invoiceDate) : undefined,
        miscCost,
        shippingCost,
        subtotal,
        discountAmount: discount,
        gstPercent: invoice.isGift ? 0 : gstPercent,
        gstAmount,
        grandTotal,
        paymentStatus,
      },
    });

    revalidatePath("/invoices");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || "Could not update invoice." };
  }
}

export async function addPayment(invoiceId, amount) {
  if (!amount || amount <= 0) return { ok: false, message: "Enter a valid amount." };

  try {
    let blocked = false;
    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw new Error("Invoice not found.");

      const remainingBeforePayment = Math.max(0, invoice.grandTotal - invoice.amountPaid - invoice.creditApplied);
      if (remainingBeforePayment <= 0) {
        blocked = true;
        return;
      }

      const actualPayment = Math.min(amount, remainingBeforePayment);
      const newPaid = invoice.amountPaid + actualPayment;
      const totalCovered = newPaid + invoice.creditApplied;
      const status = totalCovered <= 0 ? "UNPAID" : totalCovered >= invoice.grandTotal ? "PAID" : "PARTIAL";

      await tx.payment.create({ data: { invoiceId, amount: actualPayment } });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { amountPaid: newPaid, paymentStatus: status },
      });
    });

    if (blocked) {
      return { ok: false, message: "This invoice is already fully covered — nothing left to log." };
    }

    revalidatePath("/invoices");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || "Could not log payment." };
  }
}

export async function markLowStockSeen(materialId) {
  await prisma.rawMaterial.update({ where: { id: materialId }, data: { lowStockSeen: true } });
  revalidatePath("/dashboard");
  return { ok: true };
}

const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILE_SIZE = 8 * 1024 * 1024;

export async function uploadDesignFile(formData) {
  const designId = Number(formData.get("designId"));
  const category = formData.get("category");
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return { ok: false, message: "No file selected." };
  }
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return { ok: false, message: "Only PDF, JPG, or PNG files are allowed." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, message: "File is too large — max 8MB for now." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  await prisma.designFile.create({
    data: {
      designId,
      category,
      fileName: file.name,
      mimeType: file.type,
      data: buffer,
    },
  });

  revalidatePath("/designs");
  return { ok: true };
}

export async function deleteDesignFile(fileId) {
  await prisma.designFile.delete({ where: { id: fileId } });
  revalidatePath("/designs");
  return { ok: true };
}

export async function addExpense({ date, category, amount, note }) {
  await prisma.expense.create({
    data: {
      date: new Date(date),
      category,
      amount,
      note: note || null,
    },
  });
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function editExpense(expenseId, { date, category, amount, note }) {
  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      date: new Date(date),
      category,
      amount,
      note: note || null,
    },
  });
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteExpense(expenseId) {
  await prisma.expense.delete({ where: { id: expenseId } });
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function getSettings() {
  let existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!existing) {
    existing = await prisma.settings.create({ data: { id: 1 } });
  }
  if (!existing.passwordHash) {
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    existing = await prisma.settings.update({ where: { id: 1 }, data: { passwordHash: hash } });
  }
  return existing;
}

export async function updateSettings({ labourIsFixed, shippingIsFixed }) {
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { labourIsFixed, shippingIsFixed },
    create: { id: 1, labourIsFixed, shippingIsFixed },
  });
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function login({ username, password }) {
  const settings = await getSettings();
  if (!username || username !== settings.username) {
    return { ok: false, message: "Incorrect username or password." };
  }
  const valid = await bcrypt.compare(password || "", settings.passwordHash);
  if (!valid) {
    return { ok: false, message: "Incorrect username or password." };
  }

  const token = await createSessionToken();
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return { ok: true };
}

export async function logout() {
  cookies().delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export async function changeUsername({ currentPassword, newUsername }) {
  const settings = await getSettings();
  const valid = await bcrypt.compare(currentPassword || "", settings.passwordHash);
  if (!valid) return { ok: false, message: "Current password is incorrect." };
  if (!newUsername || !newUsername.trim()) return { ok: false, message: "Enter a new username." };

  await prisma.settings.update({ where: { id: 1 }, data: { username: newUsername.trim() } });
  return { ok: true };
}

export async function changePassword({ currentPassword, newPassword }) {
  const settings = await getSettings();
  const valid = await bcrypt.compare(currentPassword || "", settings.passwordHash);
  if (!valid) return { ok: false, message: "Current password is incorrect." };
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, message: "New password must be at least 6 characters." };
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.settings.update({ where: { id: 1 }, data: { passwordHash: hash } });
  return { ok: true };
}

export async function createApproval({
  contextName,
  customerName,
  notes,
  address,
  phone,
  channel,
  gstPercent,
  advancePaid,
  balanceCollectionMethod,
  items,
}) {
  if (!contextName || !contextName.trim()) {
    return { ok: false, message: "Enter an exhibition or person's name." };
  }
  if (!items || items.length === 0) {
    return { ok: false, message: "Add at least one item." };
  }

  try {
    let approvalId;
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        if (item.designId) {
          const design = await tx.design.findUnique({ where: { id: item.designId } });
          if (!design) throw new Error("A selected design was not found.");
          if (design.inStock < item.quantity) {
            throw new Error(`Not enough ${design.name} in stock (only ${design.inStock} available).`);
          }
        }
      }

      for (const item of items) {
        if (item.designId) {
          await tx.design.update({
            where: { id: item.designId },
            data: { inStock: { decrement: item.quantity } },
          });
        }
      }

      const approval = await tx.approval.create({
        data: {
          contextName: contextName.trim(),
          customerName: customerName || null,
          notes: notes || null,
          address: address || null,
          phone: phone || null,
          channel: channel || "SHOP",
          gstPercent: gstPercent ?? 18,
          advancePaid: Math.max(0, advancePaid || 0),
          balanceCollectionMethod: balanceCollectionMethod || null,
          items: {
            create: items.map((item) => ({
              designId: item.designId || null,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
            })),
          },
        },
      });

      const approvalNumber = "AP-" + new Date().getFullYear() + "-" + String(approval.id).padStart(4, "0");
      await tx.approval.update({ where: { id: approval.id }, data: { approvalNumber } });

      approvalId = approval.id;
    });

    revalidatePath("/approvals");
    refreshAll();
    return { ok: true, approvalId };
  } catch (err) {
    return { ok: false, message: err.message || "Could not create approval." };
  }
}
export async function resolveApproval(approvalId, outcome) {
  try {
    let createdInvoiceId = null;
    await prisma.$transaction(async (tx) => {
      const approval = await tx.approval.findUnique({
        where: { id: approvalId },
        include: { items: { include: { design: { include: { recipe: { include: { rawMaterial: true } } } } } } },
      });
      if (!approval) throw new Error("Approval not found.");
      if (approval.status !== "OUT") throw new Error("This approval has already been resolved.");

      if (outcome === "RETURNED") {
        for (const item of approval.items) {
          if (item.designId) {
            await tx.design.update({
              where: { id: item.designId },
              data: { inStock: { increment: item.quantity } },
            });
          }
        }
      }

      if (outcome === "SOLD") {
        const linkedItems = approval.items.filter((i) => i.designId && i.design);

        if (linkedItems.length > 0) {
          const itemRows = [];
          let itemsTotal = 0;

          for (const item of linkedItems) {
            const design = item.design;

            let fabricCost = 0;
            let trimsCost = 0;
            let packagingCost = 0;
            for (const r of design.recipe) {
              const needed = r.quantityRequired * item.quantity;
              const lineCost = needed * r.rawMaterial.costPerUnit;
              if (r.rawMaterial.category === "FABRIC") fabricCost += lineCost;
              else if (r.rawMaterial.category === "TRIMS") trimsCost += lineCost;
              else if (r.rawMaterial.category === "PACKAGING") packagingCost += lineCost;
            }
            const labourCost = design.defaultLabourCost;
            const materialAndLabour = fabricCost + trimsCost + packagingCost + labourCost;

            const targetPreTax = item.price * item.quantity;
            const markupAmount = targetPreTax - materialAndLabour;
            const markupPercent = materialAndLabour > 0 ? (markupAmount / materialAndLabour) * 100 : 0;

            itemsTotal += targetPreTax;

            if (design.status === "NOT_COMPLETED") {
              await tx.design.update({ where: { id: design.id }, data: { status: "COMPLETED" } });
            }
            if (design.status !== "APPROVED") {
              const existingBarcodes = new Set(
                (await tx.design.findMany({ where: { barcode: { not: null } }, select: { barcode: true } })).map((d) => d.barcode)
              );
              const makeBarcode = () => Math.floor(100000000000 + Math.random() * 899999999999).toString();
              let barcode = makeBarcode();
              while (existingBarcodes.has(barcode)) barcode = makeBarcode();
              const sku = "TO-" + design.name.replace(/\s+/g, "").toUpperCase().slice(0, 6) + "-" + String(design.id).padStart(3, "0");
              await tx.design.update({
                where: { id: design.id },
                data: { status: "APPROVED", barcode, sku, approvedAt: new Date() },
              });
            }

            itemRows.push({
              designId: design.id,
              quantity: item.quantity,
              fabricCost,
              trimsCost,
              packagingCost,
              labourCost,
              markupPercent,
              markupAmount,
            });
          }

          const gstAmount = itemsTotal * (approval.gstPercent / 100);
          const grandTotal = itemsTotal + gstAmount;
          const paid = Math.min(approval.advancePaid, grandTotal);
          const paymentStatus = grandTotal <= 0 ? "PAID" : paid <= 0 ? "UNPAID" : paid >= grandTotal ? "PAID" : "PARTIAL";

          const invoice = await tx.invoice.create({
            data: {
              clientName: approval.customerName || null,
              channel: approval.channel,
              exhibitionName: approval.channel === "EXHIBITION" ? approval.contextName : null,
              miscCost: 0,
              shippingCost: 0,
              discountAmount: 0,
              isGift: false,
              gstPercent: approval.gstPercent,
              gstAmount,
              subtotal: itemsTotal,
              grandTotal,
              amountPaid: paid,
              paymentStatus,
              payments: paid > 0 ? { create: [{ amount: paid }] } : undefined,
              items: { create: itemRows },
            },
          });

          const finalInvoiceNumber = "INV-" + new Date().getFullYear() + "-" + String(invoice.id).padStart(4, "0");
          await tx.invoice.update({ where: { id: invoice.id }, data: { invoiceNumber: finalInvoiceNumber } });

          createdInvoiceId = invoice.id;
        }
      }

      await tx.approval.update({
        where: { id: approvalId },
        data: { status: outcome, resolvedAt: new Date() },
      });
    });

    revalidatePath("/approvals");
    revalidatePath("/invoices");
    refreshAll();
    return { ok: true, createdInvoiceId };
  } catch (err) {
    return { ok: false, message: err.message || "Could not resolve approval." };
  }
}

export async function logApprovalPayment(approvalId, amount) {
  if (!amount || amount <= 0) return { ok: false, message: "Enter a valid amount." };

  try {
    await prisma.$transaction(async (tx) => {
      const approval = await tx.approval.findUnique({ where: { id: approvalId }, include: { items: true } });
      if (!approval) throw new Error("Approval not found.");

      const subtotal = approval.items.reduce((s, i) => s + i.price * i.quantity, 0);
      const grandTotal = subtotal + subtotal * (approval.gstPercent / 100);
      const newPaid = Math.min(approval.advancePaid + amount, grandTotal);

      await tx.approval.update({ where: { id: approvalId }, data: { advancePaid: newPaid } });
    });

    revalidatePath("/approvals");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || "Could not log payment." };
  }
}

export async function deleteApproval(approvalId) {
  try {
    await prisma.$transaction(async (tx) => {
      const approval = await tx.approval.findUnique({
        where: { id: approvalId },
        include: { items: true },
      });
      if (!approval) throw new Error("Approval not found.");

      if (approval.status === "OUT") {
        for (const item of approval.items) {
          if (item.designId) {
            await tx.design.update({
              where: { id: item.designId },
              data: { inStock: { increment: item.quantity } },
            });
          }
        }
      }

      await tx.approval.delete({ where: { id: approvalId } });
    });

    revalidatePath("/approvals");
    refreshAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || "Could not delete approval." };
  }
}

export async function getNotifications() {
  const [unresolvedTrials, unpaidInvoices, openApprovals] = await Promise.all([
    prisma.invoice.count({ where: { isTrial: true, trialResolvedAt: null } }),
    prisma.invoice.count({ where: { paymentStatus: { not: "PAID" } } }),
    prisma.approval.findMany({ where: { status: "OUT" }, include: { items: true } }),
  ]);

  const approvalsWithBalance = openApprovals.filter((a) => {
    const subtotal = a.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const grandTotal = subtotal + subtotal * (a.gstPercent / 100);
    return grandTotal - a.advancePaid > 0;
  }).length;

  return {
    unresolvedTrials,
    unpaidInvoices,
    approvalsWithBalance,
    total: unresolvedTrials + unpaidInvoices + approvalsWithBalance,
  };
}