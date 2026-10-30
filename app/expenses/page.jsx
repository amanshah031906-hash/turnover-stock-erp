import { prisma } from "@/lib/prisma";
import ExpensesClient from "./ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const [expenses, settingsRow] = await Promise.all([
    prisma.expense.findMany({ orderBy: { date: "desc" } }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);

  const settings = settingsRow || { labourIsFixed: true, shippingIsFixed: true };

  return <ExpensesClient expenses={expenses} settings={settings} />;
}