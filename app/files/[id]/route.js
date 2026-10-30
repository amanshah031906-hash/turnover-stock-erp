import { prisma } from "@/lib/prisma";

// Serves the raw bytes of an uploaded design file (tech pack, paper cutout,
// or model shoot photo) so <img> tags and "view PDF" links can just point
// straight at /files/<id>. When storage moves to R2 later, this route is
// the only place that needs to change — everything else keeps working.
export async function GET(request, { params }) {
  const id = Number(params.id);
  const file = await prisma.designFile.findUnique({ where: { id } });

  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(file.data, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
      "Cache-Control": "no-store",
    },
  });
}