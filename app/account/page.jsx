import { prisma } from "@/lib/prisma";
import AccountClient from "./AccountClient";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return <AccountClient currentUsername={settings ? settings.username : "admin"} />;
}