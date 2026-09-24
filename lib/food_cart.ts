import { FoodItem } from "./db_logic";

export type CartItem={
  item:FoodItem;
  quantity:number;
};

let cart:CartItem[]=[];

export function getCart(){
  return [...cart];
}

export function addToCart(item:FoodItem,quantity=1){
  const found=cart.find(x=>x.item.id===item.id);

  if(found){
    found.quantity+=quantity;
  }else{
    cart.push({item,quantity});
  }

  return getCart();
}

export function updateCartQuantity(id:string,quantity:number){
  const found=cart.find(x=>x.item.id===id);

  if(!found)return getCart();

  if(quantity<=0){
    cart=cart.filter(x=>x.item.id!==id);
  }else{
    found.quantity=quantity;
  }

  return getCart();
}

export function clearCart(){
  cart=[];
}

export function getCartCount(){
  return cart.reduce((sum,x)=>sum+x.quantity,0);
}

export function getCartTotal(){
  return cart.reduce(
    (sum,x)=>sum+Number(x.item.price||0)*x.quantity,
    0
  );
}
