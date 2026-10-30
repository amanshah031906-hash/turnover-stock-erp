import { prisma } from "@/lib/prisma";
import ProductsClient from "./ProductsClient";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const approved = await prisma.design.findMany({
    where: { status: "APPROVED" },
    include: { completions: true },
    orderBy: { approvedAt: "desc" },
  });
  return <ProductsClient designs={approved} />;
}
