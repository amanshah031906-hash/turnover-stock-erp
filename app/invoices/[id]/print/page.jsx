import { prisma } from "@/lib/prisma";
import { fmt, numberToWordsINR } from "@/lib/format";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({ params }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(params.id) },
    include: { design: true },
  });

  if (!invoice) {
    return <div className="empty">Invoice not found.</div>;
  }

  const preTaxAmount = invoice.subtotal + invoice.markupAmount;
  const rate = invoice.quantity > 0 ? preTaxAmount / invoice.quantity : preTaxAmount;
  const balanceDue = invoice.grandTotal - invoice.amountPaid;

  return (
    <div className="print-invoice">
      <div className="no-print" style={{ marginBottom: 24 }}>
        <PrintButton />
      </div>

      <div className="print-head">
        <div>
          <div className="print-label">Invoice To</div>
          <div className="print-value">{invoice.clientName || "—"}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="print-label">Invoice No.</div>
          <div className="print-value">{invoice.invoiceNumber || `INV-${invoice.id}`}</div>
          <div className="print-label" style={{ marginTop: 10 }}>
            Date
          </div>
          <div className="print-value">{new Date(invoice.createdAt).toLocaleDateString("en-IN")}</div>
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
          <tr>
            <td>
              {invoice.design.name}
              {invoice.design.description ? ` — ${invoice.design.description}` : ""}
            </td>
            <td>{invoice.quantity}</td>
            <td>{fmt(rate)}</td>
            <td>{fmt(preTaxAmount)}</td>
          </tr>
        </tbody>
      </table>

      <div className="print-totals">
        <div>
          <span>Taxable Value</span>
          <span>{fmt(preTaxAmount)}</span>
        </div>
        <div>
          <span>GST ({invoice.gstPercent}%)</span>
          <span>{fmt(invoice.gstAmount)}</span>
        </div>
        <div className="print-total-grand">
          <span>Grand Total</span>
          <span>{fmt(invoice.grandTotal)}</span>
        </div>
        <div>
          <span>Amount Paid</span>
          <span>{fmt(invoice.amountPaid)}</span>
        </div>
        <div className="print-total-grand">
          <span>Balance Due</span>
          <span>{fmt(balanceDue)}</span>
        </div>
      </div>

      <div className="print-words">{numberToWordsINR(invoice.grandTotal)}</div>
    </div>
  );
}