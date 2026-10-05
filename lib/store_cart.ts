import type { Product } from "./db_logic";

export type StoreCartItem = {
  product: Product;
  quantity: number;
  color?: string;
  size?: string;
};

let cart: StoreCartItem[] = [];

export function getStoreCart(): StoreCartItem[] {
  return cart.map((entry) => ({ ...entry }));
}

export function getStoreCartSellerId(): string | null {
  return cart[0]?.product.sellerId ?? null;
}

export function addStoreCartItem(
  product: Product,
  quantity = 1,
  color = "",
  size = "",
): "added" | "different-seller" {
  const sellerId = getStoreCartSellerId();
  if (sellerId && sellerId !== product.sellerId) return "different-seller";

  const amount = Math.max(1, Math.floor(Number(quantity) || 1));
  const existing = cart.find(
    (entry) =>
      entry.product.id === product.id &&
      (entry.color || "") === color &&
      (entry.size || "") === size,
  );
  if (existing) existing.quantity += amount;
  else cart.push({ product, quantity: amount, color, size });
  return "added";
}

export function updateStoreCartQuantity(
  productId: string,
  color: string | undefined,
  size: string | undefined,
  quantity: number,
): StoreCartItem[] {
  const index = cart.findIndex(
    (entry) =>
      entry.product.id === productId &&
      (entry.color || "") === (color || "") &&
      (entry.size || "") === (size || ""),
  );
  if (index < 0) return getStoreCart();
  if (quantity <= 0) cart.splice(index, 1);
  else cart[index].quantity = Math.floor(quantity);
  return getStoreCart();
}

export function clearStoreCart(): void {
  cart = [];
}

export function getStoreCartTotal(): number {
  return cart.reduce(
    (sum, entry) => sum + Number(entry.product.price || 0) * entry.quantity,
    0,
  );
}

export function getStoreCartCount(): number {
  return cart.reduce((sum, entry) => sum + entry.quantity, 0);
}
