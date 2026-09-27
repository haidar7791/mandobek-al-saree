export const PRODUCT_CATEGORY_OPTIONS = [
  { key: "all", label: "الكل", icon: "grid" },
  { key: "clothing", label: "ملابس", icon: "shopping-bag" },
  { key: "perfumes", label: "عطور", icon: "wind" },
  { key: "cosmetics", label: "مواد تجميل", icon: "star" },
  { key: "accessories", label: "إكسسوارات", icon: "watch" },
  { key: "phones", label: "هواتف", icon: "smartphone" },
  { key: "home", label: "منزل وديكور", icon: "home" },
  { key: "other", label: "أخرى", icon: "more-horizontal" },
] as const;

export type ProductCategoryFilter =
  (typeof PRODUCT_CATEGORY_OPTIONS)[number]["key"];

export type ProductCategory = Exclude<ProductCategoryFilter, "all">;

const PRODUCT_CATEGORY_KEYS = new Set<ProductCategory>(
  PRODUCT_CATEGORY_OPTIONS
    .filter((item) => item.key !== "all")
    .map((item) => item.key as ProductCategory),
);

export const normalizeProductCategory = (value: unknown): ProductCategory =>
  typeof value === "string" && PRODUCT_CATEGORY_KEYS.has(value as ProductCategory)
    ? (value as ProductCategory)
    : "other";