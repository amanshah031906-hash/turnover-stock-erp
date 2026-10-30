import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = parseInt(searchParams.get("year"), 10) || now.getFullYear();
  const month = parseInt(searchParams.get("month"), 10) || now.getMonth() + 1;

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const monthLabel = monthStart.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const [allInvoices, creditNotes, expenses, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { createdAt: { gte: monthStart, lt: monthEnd } },
      include: { items: { include: { design: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.creditNote.findMany({
      where: { createdAt: { gte: monthStart, lt: monthEnd } },
      include: { originalInvoice: { include: { items: { include: { design: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      orderBy: { date: "asc" },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: monthStart, lt: monthEnd } },
    }),
  ]);

  const invoices = allInvoices.filter((inv) => !inv.isTrial || inv.trialResolvedAt);

  function invoiceMargin(inv) {
    return inv.items.reduce((s, it) => s + it.markupAmount, 0);
  }

  const salesRows = [];
  for (const inv of allInvoices) {
    const balanceDue = inv.grandTotal - inv.amountPaid - inv.creditApplied;
    inv.items.forEach((item, idx) => {
      salesRows.push({
        "Invoice #": inv.invoiceNumber || "INV-" + inv.id,
        Date: inv.createdAt.toLocaleDateString("en-IN"),
        Client: inv.clientName || "",
        Product: item.design.name,
        Quantity: item.quantity,
        Channel: inv.channel === "EXHIBITION" ? "Exhibition — " + (inv.exhibitionName || "") : "Shop",
        Trial: inv.isTrial ? (inv.trialResolvedAt ? "Resolved" : "Unresolved") : "No",
        "Grand Total": idx === 0 ? inv.grandTotal : "",
        "Amount Paid": idx === 0 ? inv.amountPaid : "",
        "Credit Applied": idx === 0 ? inv.creditApplied : "",
        "Balance Due": idx === 0 ? balanceDue : "",
        Status: inv.paymentStatus,
        Gift: inv.isGift ? "Yes" : "No",
        Returned: inv.returnedAt ? "Yes" : "No",
      });
    });
  }

  const refundRows = creditNotes.map((cn) => ({
    "Credit Note #": cn.creditNumber || "CN-" + cn.id,
    Date: cn.createdAt.toLocaleDateString("en-IN"),
    Client: cn.clientName || "",
    "Original Invoice": cn.originalInvoice.invoiceNumber || "INV-" + cn.originalInvoice.id,
    Products: cn.originalInvoice.items.map((it) => it.design.name + " ×" + it.quantity).join(", "),
    "Credit Issued": cn.originalInvoice.grandTotal,
    "Remaining Balance": cn.amount,
    Status: cn.status,
    Reason: cn.reason || "",
  }));

  const expenseRows = expenses.map((e) => ({
    Date: e.date.toLocaleDateString("en-IN"),
    Category: e.category,
    Amount: e.amount,
    Note: e.note || "",
  }));

  const totalSales = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalMargin = invoices.reduce((s, i) => s + invoiceMargin(i), 0);
  const totalReturnedMargin = creditNotes.reduce((s, cn) => s + invoiceMargin(cn.originalInvoice), 0);
  const totalRefundsValue = creditNotes.reduce((s, cn) => s + cn.originalInvoice.grandTotal, 0);
  const exhibitionCount = invoices.filter((i) => i.channel === "EXHIBITION").length;
  const exhibitionTotal = invoices.filter((i) => i.channel === "EXHIBITION").reduce((s, i) => s + i.grandTotal, 0);
  const unresolvedTrialCount = allInvoices.filter((i) => i.isTrial && !i.trialResolvedAt).length;
  const netCash = totalPaid - totalExpenses;
  const netProfit = totalMargin - totalExpenses - totalReturnedMargin;

  const summaryRows = [
    { Metric: "Month", Value: monthLabel },
    { Metric: "Total Invoices Created", Value: allInvoices.length },
    { Metric: "Unresolved Trials (excluded above)", Value: unresolvedTrialCount },
    { Metric: "Exhibition Sales Count", Value: exhibitionCount },
    { Metric: "Exhibition Sales Value", Value: exhibitionTotal },
    { Metric: "Total Sales (Grand Total)", Value: totalSales },
    { Metric: "Total Payments Collected", Value: totalPaid },
    { Metric: "Total Expenses", Value: totalExpenses },
    { Metric: "Total Refunds Issued (value)", Value: totalRefundsValue },
    { Metric: "Gross Margin (Markup)", Value: totalMargin },
    { Metric: "Margin Reversed by Returns", Value: totalReturnedMargin },
    { Metric: "Net Cash (Payments − Expenses)", Value: netCash },
    { Metric: "Net Profit (Margin − Expenses − Returns)", Value: netProfit },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesRows), "Sales");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(refundRows), "Refunds");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expenseRows), "Expenses");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filename = "TurnOver-Report-" + year + "-" + String(month).padStart(2, "0") + ".xlsx";

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}