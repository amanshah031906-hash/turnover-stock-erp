// Loads the client's own worked example from the master brief so the app
// isn't empty the first time you open it. Safe to re-run — it wipes and
// reseeds every time.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  await prisma.materialDeduction.deleteMany();
  await prisma.designCompletion.deleteMany();
  await prisma.designRecipeItem.deleteMany();
  await prisma.design.deleteMany();
  await prisma.rawMaterial.deleteMany();

  const cotton = await prisma.rawMaterial.create({
    data: {
      name: "Cotton Cloth",
      color: "Red",
      unit: "METER",
      category: "FABRIC",
      subtype: "Main Fabric",
      quantityInStock: 100,
      costPerUnit: 1000,
    },
  });
  const silk = await prisma.rawMaterial.create({
    data: {
      name: "Silk Cloth",
      color: "Blue",
      unit: "METER",
      category: "FABRIC",
      subtype: "Lining Fabric",
      quantityInStock: 100,
      costPerUnit: 1500,
    },
  });
  const blueButton = await prisma.rawMaterial.create({
    data: {
      name: "Button",
      color: "Blue",
      unit: "PIECE",
      category: "TRIMS",
      subtype: "Button",
      quantityInStock: 100,
      costPerUnit: 10,
    },
  });
  await prisma.rawMaterial.create({
    data: {
      name: "Button",
      color: "Red",
      unit: "PIECE",
      category: "TRIMS",
      subtype: "Button",
      quantityInStock: 100,
      costPerUnit: 7,
    },
  });

  await prisma.design.create({
    data: {
      name: "Design 1",
      description: "Shirt",
      status: "NOT_COMPLETED",
      recipe: {
        create: [
          { rawMaterialId: cotton.id, quantityRequired: 10 },
          { rawMaterialId: silk.id, quantityRequired: 5 },
          { rawMaterialId: blueButton.id, quantityRequired: 5 },
        ],
      },
    },
  });

  console.log("Seeded raw materials + Design 1.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());