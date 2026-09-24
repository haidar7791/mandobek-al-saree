import React,{useState}from"react";
import{FlatList,Image,Pressable,StyleSheet,Text,View}from"react-native";
import{Ionicons,Feather}from"@expo/vector-icons";
import{router,useFocusEffect}from"expo-router";
import{getCart,updateCartQuantity,CartItem,getCartTotal}from"../../lib/food_cart";
import Colors from"@/constants/colors";

const C=Colors.light;

export default function RestaurantCart(){
 const[cart,setCart]=useState<CartItem[]>([]);

 const refresh=()=>{
  setCart(getCart());
 };

 useFocusEffect(
  React.useCallback(()=>{
   refresh();
  },[])
 );

 const change=(id:string,quantity:number)=>{
  updateCartQuantity(id,quantity);
  refresh();
 };

 const total=getCartTotal();

 return(
  <View style={S.root}>

   <View style={S.header}>
    <Pressable onPress={()=>router.back()}>
     <Feather name="arrow-right" size={24} color="#fff"/>
    </Pressable>

    <Text style={S.headerTitle}>سلة المطاعم</Text>

    <Ionicons name="cart-outline" size={24} color={C.accent}/>
   </View>

   <FlatList
    data={cart}
    keyExtractor={x=>x.item.id}
    contentContainerStyle={S.list}
    renderItem={({item})=>{
     const price=Number(item.item.price||0);
     const image=item.item.media?.find(x=>x.type==="image")?.url||item.item.media?.[0]?.url;

     return(
      <View style={S.item}>

       {image?
        <Image source={{uri:image}} style={S.image}/>:
        <View style={S.placeholder}>
         <Ionicons name="restaurant-outline" size={35} color={C.accent}/>
        </View>
       }

       <View style={S.info}>
        <Text style={S.name}>{item.item.name}</Text>

        <Text style={S.price}>
         {price.toLocaleString()} د.ع
        </Text>

        <View style={S.controls}>
         <Pressable
          style={S.qtyButton}
          onPress={()=>change(item.item.id,item.quantity-1)}
         >
          <Ionicons name="remove" size={19} color="#fff"/>
         </Pressable>

         <Text style={S.quantity}>{item.quantity}</Text>

         <Pressable
          style={S.qtyButton}
          onPress={()=>change(item.item.id,item.quantity+1)}
         >
          <Ionicons name="add" size={19} color="#fff"/>
         </Pressable>
        </View>
       </View>

       <Text style={S.itemTotal}>
        {(price*item.quantity).toLocaleString()} د.ع
       </Text>

      </View>
     );
    }}

    ListEmptyComponent={
     <View style={S.empty}>
      <Ionicons name="cart-outline" size={70} color={C.accent}/>
      <Text style={S.emptyTitle}>السلة فارغة</Text>
      <Text style={S.emptyText}>أضف وجبات من المطاعم للمتابعة</Text>

      <Pressable
       style={S.browse}
       onPress={()=>router.back()}
      >
       <Text style={S.browseText}>العودة للمطعم</Text>
      </Pressable>
     </View>
    }
   />

   {cart.length>0&&
    <View style={S.bottom}>

     <View style={S.summary}>
      <Text style={S.summaryLabel}>الإجمالي</Text>
      <Text style={S.summaryTotal}>
       {total.toLocaleString()} د.ع
      </Text>
     </View>

     <Pressable
      style={S.checkout}
      onPress={()=>router.push("/restaurant/checkout" as any)}
     >
      <Text style={S.checkoutText}>متابعة لإتمام الطلب</Text>
      <Ionicons name="arrow-back" size={20} color="#fff"/>
     </Pressable>

    </View>
   }

  </View>
 );
}

const S=StyleSheet.create({
 root:{
  flex:1,
  backgroundColor:C.background
 },
 header:{
  height:62,
  backgroundColor:C.primary,
  flexDirection:"row",
  alignItems:"center",
  justifyContent:"space-between",
  paddingHorizontal:16
 },
 headerTitle:{
  color:"#fff",
  fontSize:21,
  fontWeight:"900"
 },
 list:{
  padding:13,
  paddingBottom:150
 },
 item:{
  backgroundColor:C.card,
  borderRadius:18,
  borderWidth:1,
  borderColor:C.border,
  padding:10,
  marginBottom:12,
  flexDirection:"row-reverse",
  alignItems:"center"
 },
 image:{
  width:90,
  height:90,
  borderRadius:15
 },
 placeholder:{
  width:90,
  height:90,
  borderRadius:15,
  backgroundColor:C.background,
  alignItems:"center",
  justifyContent:"center"
 },
 info:{
  flex:1,
  paddingHorizontal:10,
  alignItems:"flex-end"
 },
 name:{
  color:C.text,
  fontSize:15,
  fontWeight:"900",
  textAlign:"right"
 },
 price:{
  color:C.accent,
  fontSize:13,
  fontWeight:"800",
  marginTop:5
 },
 controls:{
  flexDirection:"row",
  alignItems:"center",
  gap:12,
  marginTop:9
 },
 qtyButton:{
  width:32,
  height:32,
  borderRadius:16,
  backgroundColor:C.primary,
  alignItems:"center",
  justifyContent:"center"
 },
 quantity:{
  color:C.text,
  fontSize:15,
  fontWeight:"900",
  minWidth:20,
  textAlign:"center"
 },
 itemTotal:{
  color:C.text,
  fontSize:12,
  fontWeight:"900",
  alignSelf:"flex-end"
 },
 bottom:{
  position:"absolute",
  bottom:0,
  left:0,
  right:0,
  padding:13,
  paddingBottom:22,
  backgroundColor:C.background,
  borderTopWidth:1,
  borderTopColor:C.border
 },
 summary:{
  flexDirection:"row-reverse",
  justifyContent:"space-between",
  alignItems:"center",
  marginBottom:10
 },
 summaryLabel:{
  color:C.text,
  fontSize:15,
  fontWeight:"800"
 },
 summaryTotal:{
  color:C.accent,
  fontSize:20,
  fontWeight:"900"
 },
 checkout:{
  height:55,
  borderRadius:17,
  backgroundColor:C.primary,
  flexDirection:"row-reverse",
  alignItems:"center",
  justifyContent:"center",
  gap:8
 },
 checkoutText:{
  color:"#fff",
  fontSize:14,
  fontWeight:"900"
 },
 empty:{
  minHeight:500,
  alignItems:"center",
  justifyContent:"center",
  gap:10
 },
 emptyTitle:{
  color:C.text,
  fontSize:20,
  fontWeight:"900"
 },
 emptyText:{
  color:C.textMuted,
  fontSize:13
 },
 browse:{
  marginTop:10,
  paddingHorizontal:25,
  paddingVertical:13,
  borderRadius:15,
  backgroundColor:C.primary
 },
 browseText:{
  color:"#fff",
  fontSize:13,
  fontWeight:"900"
 }
});
