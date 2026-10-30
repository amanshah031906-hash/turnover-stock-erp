import { prisma } from "@/lib/prisma";
import InvoicesClient from "./InvoicesClient";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const [designs, invoices, creditNotes] = await Promise.all([
    prisma.design.findMany({
      include: { recipe: { include: { rawMaterial: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.invoice.findMany({
      include: {
        items: { include: { design: { include: { recipe: { include: { rawMaterial: true } } } } } },
        payments: { orderBy: { paidAt: "asc" } },
        creditNotesIssued: true,
        creditRedemptions: { include: { creditNote: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.creditNote.findMany({
      where: { status: "UNREDEEMED", amount: { gt: 0 } },
      include: { originalInvoice: { select: { invoiceNumber: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return <InvoicesClient designs={designs} invoices={invoices} creditNotes={creditNotes} />;
}
