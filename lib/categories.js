// Straight from the client's costing sheet. "Other" always shows a free-text
// box in the UI, so nothing is ever a dead end.

export const CATEGORIES = [
  { value: "FABRIC", label: "Fabric" },
  { value: "TRIMS", label: "Trims/Notions" },
  { value: "PACKAGING", label: "Packaging" },
];

export const SUBTYPES = {
  FABRIC: ["Main Fabric", "Lining Fabric", "Fusing", "Other"],
  TRIMS: [
    "Bra Cups",
    "Zipper",
    "Zipper Puller",
    "Button",
    "Sewing Thread",
    "Elastic Band",
    "Drawstring",
    "Piping",
    "Bias Binding",
    "Bridle Tape",
    "Hook & Eye",
    "Buckle",
    "Eyelets",
    "Rivets",
    "Chain",
    "Hooks",
    "Metal Label",
    "Main Label",
    "Other",
  ],
  PACKAGING: [
    "Hang Tag",
    "Bag",
    "Ribbon",
    "Butter Paper",
    "Mailer Envelope",
    "Sticker",
    "Thankyou Note",
    "Other",
  ],
};

export function categoryLabel(cat) {
  return CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}