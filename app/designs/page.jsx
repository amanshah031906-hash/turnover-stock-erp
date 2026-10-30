import { prisma } from "@/lib/prisma";
import DesignsClient from "./DesignsClient";

export const dynamic = "force-dynamic";

export default async function DesignsPage() {
  const [designs, rawMaterials] = await Promise.all([
    prisma.design.findMany({
      include: {
        recipe: true,
        completions: true,
        // Metadata only — the actual bytes are fetched separately via
        // /files/[id] when a file is actually viewed, not on every page load.
        files: {
          select: { id: true, category: true, fileName: true, mimeType: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.rawMaterial.findMany({ orderBy: { id: "asc" } }),
  ]);
  return <DesignsClient designs={designs} rawMaterials={rawMaterials} />;
}