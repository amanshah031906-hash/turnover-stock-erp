import { prisma } from "@/lib/prisma";
import MaterialsClient from "./MaterialsClient";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const rawMaterials = await prisma.rawMaterial.findMany({ orderBy: { id: "asc" } });
  return <MaterialsClient materials={rawMaterials} />;
}
