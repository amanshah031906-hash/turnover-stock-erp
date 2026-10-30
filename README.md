# Turn,Over. — Stock & Design ERP

Raw material + design (BOM) stock management for the Turn,Over. clothing brand.

## Status

Real persistence now — backed by Postgres (Neon) via Prisma. Every page action
(add material, add stock, create a design/BOM, edit, copy, delete, mark
completed with atomic stock deduction + cost calc, approve with barcode/SKU
generation, produce more units on an already-approved design, finished-goods
catalog) writes straight to the database. Nothing resets on refresh anymore.

## First-time setup

1. In your Neon dashboard: Project → Connection Details → copy the **pooled
   connection string**.
2. Create a `.env` file in this folder (copy `.env.example` and fill in your
   real URL):
   ```
   DATABASE_URL="postgresql://...your-neon-url...?sslmode=require"
   ```
3. Install, create the tables, and seed the worked example:
   ```bash
   npm install
   npx prisma db push
   npx prisma db seed
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000).

Run `npx prisma studio` any time you want a spreadsheet-style view straight
into your Neon data.

## Structure

```
prisma/
  schema.prisma        — RawMaterial, Design, DesignRecipeItem, DesignCompletion, MaterialDeduction
  seed.js               — loads the worked example into the DB
app/
  actions.js            — every DB mutation (Server Actions), atomic where it matters
  layout.js, page.js
  dashboard/page.jsx     — fully server-rendered, read-only
  materials/page.jsx + MaterialsClient.jsx
  designs/page.jsx + DesignsClient.jsx
  products/page.jsx + ProductsClient.jsx
lib/
  prisma.js              — Prisma Client singleton
  format.js              — currency/unit display helpers
  useToast.js             — local toast hook (each client page manages its own)
components/
  Nav.jsx, Toast.jsx, Modal.jsx, Badge.jsx, Barcode.jsx
```

Each page is a Server Component that reads from Postgres directly, paired with
a Client Component for the interactive bits (modals, forms). Mutations call
Server Actions in `app/actions.js`, which write to the DB and trigger
`revalidatePath` so the page re-renders with fresh data — no client-side
state to keep in sync.

## One design, multiple production runs

A design can be produced more than once after approval — "Produce More Units"
on an already-approved design deducts stock and adds another row to its
`DesignCompletion` history, keeping the same SKU/barcode. The Products page
shows the running total (units + cost) across all of a design's runs.

## Worked example baked in as seed data

- 100m Cotton Cloth (Red) @ ₹1000/m
- 100m Silk Cloth (Blue) @ ₹1500/m
- 100pc Button (Blue) @ ₹10/pc
- 100pc Button (Red) @ ₹7/pc
- Design 1 (Shirt): 10m cotton red, 5m silk blue, 5pc blue button

Completing Design 1 (qty 1) should leave stock at 90m / 95m / 95pc / 100pc and
a material cost of ₹17,550 — verify this first after any change to the
completion logic.

## Open questions (from master brief, still pending client answers)

- Barcode/SKU format — currently `TO-<NAME>-<ID>` + random 12-digit barcode
- Insufficient stock on completion — currently a hard block
- Separate Approver role vs. same admin doing both steps
- Purchase/supplier tracking on stock replenishment vs. simple "Add Stock" entry
