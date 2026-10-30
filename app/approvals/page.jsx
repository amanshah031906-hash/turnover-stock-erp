import { prisma } from "@/lib/prisma";
import ApprovalsClient from "./ApprovalsClient";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const [rawApprovals, rawDesigns] = await Promise.all([
    prisma.approval.findMany({
      include: { items: { include: { design: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.design.findMany({ orderBy: { name: "asc" } }),
  ]);

  const approvals = JSON.parse(JSON.stringify(rawApprovals));
  const designs = JSON.parse(JSON.stringify(rawDesigns));

  return <ApprovalsClient approvals={approvals} designs={designs} />;
}