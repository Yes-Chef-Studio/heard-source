// Heard: what kind of issue a ticket is. Optional; a ticket can have no category.
// The values are stored in the database, so treat them as stable slugs: change labels and
// colours freely, never the values.
export const CATEGORY_OPTIONS = {
  copy: "copy",
  functionality: "functionality",
  visualAssets: "visual_assets",
  brokenLink: "broken_link",
  designMismatch: "design_mismatch",
  localization: "localization",
} as const

export type Category = (typeof CATEGORY_OPTIONS)[keyof typeof CATEGORY_OPTIONS]

// Display order, label and colour for every category. The one place to change them.
export const CATEGORIES: ReadonlyArray<{
  value: Category
  label: string
  color: string
}> = [
  { value: "copy", label: "Copy", color: "#6c5ce7" },
  { value: "functionality", label: "Functionality", color: "#f43f6e" },
  { value: "visual_assets", label: "Visual Assets", color: "#2563eb" },
  { value: "broken_link", label: "Missing/Broken Link", color: "#38bdf8" },
  { value: "design_mismatch", label: "Design Mismatch", color: "#fb9a5a" },
  { value: "localization", label: "Localization", color: "#9ca3af" },
]

export const CATEGORY_VALUES = CATEGORIES.map((item) => item.value) as [
  Category,
  ...Category[],
]

export const NO_CATEGORY_LABEL = "No category"

export function isCategory(value: unknown): value is Category {
  return CATEGORY_VALUES.includes(value as Category)
}

// Anything that is not a known slug (including null) reads as "no category".
export function normalizeCategory(value: unknown): Category | null {
  return isCategory(value) ? value : null
}

export function getCategoryMeta(category: string | null | undefined) {
  return CATEGORIES.find((item) => item.value === category)
}
