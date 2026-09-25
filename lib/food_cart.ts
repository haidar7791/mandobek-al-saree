import { FoodItem } from "./db_logic";

export type CartItem = {
  item: FoodItem;
  quantity: number;
};

let cart: CartItem[] = [];

export function getCart(): CartItem[] {
  return [...cart];
}

export function getCartRestaurantId(): string | null {
  return cart[0]?.item.userId || null;
}

export function getCartRestaurantName(): string {
  return cart[0]?.item.userName || "";
}

export function addToCart(
  item: FoodItem,
  quantity = 1
): CartItem[] {
  const q = Math.max(1, Math.floor(Number(quantity) || 1));

  const restaurantId = getCartRestaurantId();

  if (restaurantId && restaurantId !== item.userId) {
    return getCart();
  }

  const found = cart.find(
    x => x.item.id === item.id
  );

  if (found) {
    found.quantity += q;
  } else {
    cart.push({
      item,
      quantity: q,
    });
  }

  return getCart();
}

export function updateCartQuantity(
  id: string,
  quantity: number
): CartItem[] {
  const found = cart.find(
    x => x.item.id === id
  );

  if (!found) return getCart();

  if (quantity <= 0) {
    cart = cart.filter(
      x => x.item.id !== id
    );
  } else {
    found.quantity = Math.floor(quantity);
  }

  return getCart();
}

export function removeFromCart(id: string): CartItem[] {
  cart = cart.filter(
    x => x.item.id !== id
  );
  return getCart();
}

export function clearCart(): void {
  cart = [];
}

export function getCartCount(): number {
  return cart.reduce(
    (sum, x) => sum + x.quantity,
    0
  );
}

export function getCartTotal(): number {
  return cart.reduce(
    (sum, x) =>
      sum +
      Number(x.item.price || 0) * x.quantity,
    0
  );
}
