import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmt, unitLabel } from "@/lib/format";
import LowStockPanel from "@/components/LowStockPanel";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [rawMaterials, designs, rawCompletions, monthPayments, monthExpenses, monthInvoices, monthCreditNotes, monthApprovals, settingsRow] =
    await Promise.all([
      prisma.rawMaterial.findMany({ orderBy: { id: "asc" } }),
      prisma.design.findMany(),
      prisma.designCompletion.findMany({
        orderBy: { completedAt: "desc" },
        take: 20,
        include: { design: true },
      }),
      prisma.payment.findMany({ where: { paidAt: { gte: monthStart, lt: monthEnd } } }),
      prisma.expense.findMany({ where: { date: { gte: monthStart, lt: monthEnd } } }),
      prisma.invoice.findMany({
        where: {
          createdAt: { gte: monthStart, lt: monthEnd },
          OR: [{ isTrial: false }, { trialResolvedAt: { not: null } }],
        },
        include: { items: true },
      }),
      prisma.creditNote.findMany({
        where: { createdAt: { gte: monthStart, lt: monthEnd } },
        include: { originalInvoice: { include: { items: true } } },
      }),
      prisma.approval.findMany({ where: { createdAt: { gte: monthStart, lt: monthEnd } } }),
      prisma.settings.findUnique({ where: { id: 1 } }),
    ]);

  const settings = settingsRow || { labourIsFixed: true, shippingIsFixed: true };

  const cashIn = monthPayments.reduce((s, p) => s + p.amount, 0);
  const expensesTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const variableLabour = settings.labourIsFixed ? 0 : monthInvoices.reduce((s, i) => s + i.items.reduce((s2, it) => s2 + it.labourCost, 0), 0);
  const variableShipping = settings.shippingIsFixed ? 0 : monthInvoices.reduce((s, i) => s + i.shippingCost, 0);
  const advancesCollected = monthApprovals.reduce((s, a) => s + a.advancePaid, 0);
  const netCash = cashIn + advancesCollected - expensesTotal - variableLabour - variableShipping;

  const grossMargin = monthInvoices.reduce((s, i) => s + i.items.reduce((s2, it) => s2 + it.markupAmount, 0), 0);
  const returnedMargin = monthCreditNotes.reduce((s, cn) => s + cn.originalInvoice.items.reduce((s2, it) => s2 + it.markupAmount, 0), 0);
  const netProfit = grossMargin - expensesTotal - returnedMargin;

  const exhibitionInvoices = monthInvoices.filter((i) => i.channel === "EXHIBITION");
  const exhibitionSalesTotal = exhibitionInvoices.reduce((s, i) => s + i.grandTotal, 0);

  const unresolvedTrialsCount = await prisma.invoice.count({
    where: { isTrial: true, trialResolvedAt: null },
  });

  const byStatus = { NOT_COMPLETED: 0, COMPLETED: 0, APPROVED: 0 };
  designs.forEach((d) => byStatus[d.status]++);

  const grouped = new Map();
  for (const c of rawCompletions) {
    const existing = grouped.get(c.designId);
    if (existing) {
      existing.units += c.quantityCompleted;
      existing.cost += c.totalCost;
      if (c.completedAt > existing.latest) existing.latest = c.completedAt;
    } else {
      grouped.set(c.designId, {
        designId: c.designId,
        designName: c.design.name,
        units: c.quantityCompleted,
        cost: c.totalCost,
        latest: c.completedAt,
      });
    }
  }
  const recentCompletions = Array.from(grouped.values())
    .sort((a, b) => b.latest - a.latest)
    .slice(0, 5);

  const lowStock = rawMaterials
    .filter((m) => m.quantityInStock < m.minStock)
    .sort((a, b) => a.quantityInStock - a.minStock - (b.quantityInStock - b.minStock));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>Dashboard</h1>
          <p>Live snapshot of raw material stock, design pipeline, and recent production.</p>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 30 }}>
        <div className="stat-card">
          <div className="n">{rawMaterials.length}</div>
          <div className="l">Raw material types</div>
        </div>
        <div className="stat-card">
          <div className="n">{byStatus.NOT_COMPLETED}</div>
          <div className="l">Designs pending</div>
        </div>
        <div className="stat-card">
          <div className="n">{byStatus.COMPLETED}</div>
          <div className="l">Awaiting approval</div>
        </div>
        <div className="stat-card">
          <div className="n">{byStatus.APPROVED}</div>
          <div className="l">Finished goods (SKUs)</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 30 }}>
        <div className="panel">
          <h2>Net Cash — {now.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Money actually in hand — payments received minus what's gone out.
          </p>
          <div className="cost-line" style={{ borderTop: "none" }}>
            <span>Payments collected</span>
            <span className="num">{fmt(cashIn)}</span>
          </div>
          {advancesCollected > 0 && (
            <div className="cost-line" style={{ borderTop: "none" }}>
              <span>+ Approval advances collected</span>
              <span className="num">{fmt(advancesCollected)}</span>
            </div>
          )}
          <div className="cost-line" style={{ borderTop: "none" }}>
            <span>− Expenses</span>
            <span className="num">{fmt(expensesTotal)}</span>
          </div>
          {!settings.labourIsFixed && (
            <div className="cost-line" style={{ borderTop: "none" }}>
              <span>− Labour (variable)</span>
              <span className="num">{fmt(variableLabour)}</span>
            </div>
          )}
          {!settings.shippingIsFixed && (
            <div className="cost-line" style={{ borderTop: "none" }}>
              <span>− Shipping (variable)</span>
              <span className="num">{fmt(variableShipping)}</span>
            </div>
          )}
          <div className="cost-line" style={{ fontWeight: 700, fontSize: 15 }}>
            <span>Net Cash</span>
            <span className="num">{fmt(netCash)}</span>
          </div>
        </div>

        <div className="panel">
          <h2>Net Profit — {now.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            What was actually earned on this month's sales, whether or not it's been paid yet. Unresolved trials
            aren't counted here yet.
          </p>
          <div className="cost-line" style={{ borderTop: "none" }}>
            <span>Gross margin (markup on invoices)</span>
            <span className="num">{fmt(grossMargin)}</span>
          </div>
          <div className="cost-line" style={{ borderTop: "none" }}>
            <span>− Expenses</span>
            <span className="num">{fmt(expensesTotal)}</span>
          </div>
          {returnedMargin > 0 && (
            <div className="cost-line" style={{ borderTop: "none" }}>
              <span>− Returns (margin reversed)</span>
              <span className="num">{fmt(returnedMargin)}</span>
            </div>
          )}
          <div className="cost-line" style={{ fontWeight: 700, fontSize: 15 }}>
            <span>Net Profit</span>
            <span className="num">{fmt(netProfit)}</span>
          </div>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 30 }}>
        <div className="stat-card">
          <div className="n">{fmt(exhibitionSalesTotal)}</div>
          <div className="l">Exhibition sales — {now.toLocaleDateString("en-IN", { month: "long" })} ({exhibitionInvoices.length})</div>
        </div>
        <div className="stat-card">
          <div className="n">{unresolvedTrialsCount}</div>
          <div className="l">Unresolved trials</div>
        </div>
        <div />
      </div>

      <div className="grid cols-3">
        <div className="panel">
          <h2>Raw material stock</h2>
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rawMaterials.map((m) => (
                <tr key={m.id} className={m.quantityInStock < m.minStock ? "row-low" : ""}>
                  <td>
                    {m.name}
                    {m.color ? ` — ${m.color}` : ""}
                  </td>
                  <td className="num">
                    {m.quantityInStock} {unitLabel(m.unit)}
                  </td>
                  <td>{m.quantityInStock < m.minStock ? <span className="badge low">Low</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Recent completions</h2>
          {recentCompletions.length ? (
            <table>
              <thead>
                <tr>
                  <th>Design</th>
                  <th>Units</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {recentCompletions.map((c) => (
                  <tr key={c.designId}>
                    <td>
                      <Link href="/designs" className="table-link">
                        {c.designName}
                      </Link>
                    </td>
                    <td className="num">{c.units}</td>
                    <td className="num">{fmt(c.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No designs completed yet.</div>
          )}
        </div>

        <LowStockPanel materials={lowStock} />
      </div>

      <div style={{ textAlign: "center", marginTop: 40 }}>
        <Link href="/account" className="link-btn">
          Account Settings
        </Link>
      </div>
    </>
  );
}