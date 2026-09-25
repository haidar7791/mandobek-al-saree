import React,{useState}from"react";
import{Alert,Pressable,ScrollView,StyleSheet,Text,View}from"react-native";
import{Ionicons,Feather}from"@expo/vector-icons";
import{router,useFocusEffect}from"expo-router";
import{getCart,getCartTotal,CartItem,clearCart}from"../../lib/food_cart";
import{createFoodOrder}from"../../lib/db_logic";
import Colors from"@/constants/colors";

const C=Colors.light;

export default function Checkout(){
 const[cart,setCart]=useState<CartItem[]>([]);
 const[payment,setPayment]=useState<"cash"|"wallet">("cash");
 const[submitting,setSubmitting]=useState(false);

 useFocusEffect(
  React.useCallback(()=>{
   setCart(getCart());
  },[])
 );

 const total=getCartTotal();

 const confirmOrder=async()=>{
  if(submitting||cart.length===0)return;

  const restaurantId=cart[0]?.item.userId;

  if(!restaurantId){
   Alert.alert("خطأ","تعذر تحديد المطعم.");
   return;
  }

  const differentRestaurant=cart.some(
   x=>x.item.userId!==restaurantId
  );

  if(differentRestaurant){
   Alert.alert(
    "السلة تحتوي مطاعم مختلفة",
    "لا يمكن إرسال طلب واحد من أكثر من مطعم."
   );
   return;
  }

  try{
   setSubmitting(true);

   const restaurantName=cart[0]?.item.userName||"المطعم";

   const items=cart.map(x=>({
    foodId:x.item.id,
    name:x.item.name,
    price:Number(x.item.price||0),
    quantity:x.quantity,
    imageUrl:
     x.item.media?.find(m=>m.type==="image")?.url
     ||x.item.media?.[0]?.url
     ||null,
   }));

   const orderId=await createFoodOrder({
    restaurantId,
    restaurantName,
    items,
    total,
    paymentMethod:payment,
   });

   clearCart();

   router.replace({
    pathname:"/restaurant/order" as any,
    params:{orderId},
   } as any);
  }catch(error){
   console.error("createFoodOrder error:",error);
   Alert.alert(
    "تعذر إرسال الطلب",
    "حدث خطأ أثناء إرسال طلبك للمطعم. حاول مرة أخرى."
   );
  }finally{
   setSubmitting(false);
  }
 };

 return(
  <View style={S.root}>

   <View style={S.header}>
    <Pressable onPress={()=>router.back()}>
     <Feather name="arrow-right" size={24} color="#fff"/>
    </Pressable>

    <Text style={S.headerTitle}>إتمام الطلب</Text>

    <Ionicons name="checkmark-circle-outline" size={24} color={C.accent}/>
   </View>

   <ScrollView
    showsVerticalScrollIndicator={false}
    contentContainerStyle={S.content}
   >

    <Text style={S.sectionTitle}>موقع التوصيل</Text>

    <View style={S.addressCard}>
     <View style={S.addressIcon}>
      <Ionicons name="location-outline" size={24} color={C.accent}/>
     </View>

     <View style={S.addressInfo}>
      <Text style={S.addressTitle}>عنوان التوصيل الحالي</Text>
      <Text style={S.addressText}>
       سيتم استخدام عنوان التوصيل المسجل في التطبيق
      </Text>
     </View>

     <Ionicons name="chevron-back" size={20} color={C.textMuted}/>
    </View>

    <Text style={S.sectionTitle}>طريقة الدفع</Text>

    <Pressable
     style={[S.payment,payment==="cash"&&S.paymentActive]}
     onPress={()=>setPayment("cash")}
    >
     <View style={S.radio}>
      {payment==="cash"&&<View style={S.radioDot}/>}
     </View>

     <View style={S.paymentInfo}>
      <Text style={S.paymentTitle}>الدفع عند الاستلام</Text>
      <Text style={S.paymentText}>ادفع للمندوب عند استلام طلبك</Text>
     </View>

     <Ionicons name="cash-outline" size={25} color={C.accent}/>
    </Pressable>

    <Pressable
     style={[S.payment,payment==="wallet"&&S.paymentActive]}
     onPress={()=>setPayment("wallet")}
    >
     <View style={S.radio}>
      {payment==="wallet"&&<View style={S.radioDot}/>}
     </View>

     <View style={S.paymentInfo}>
      <Text style={S.paymentTitle}>المحفظة</Text>
      <Text style={S.paymentText}>الدفع من رصيد المحفظة</Text>
     </View>

     <Ionicons name="wallet-outline" size={25} color={C.accent}/>
    </Pressable>

    <Text style={S.sectionTitle}>ملخص الطلب</Text>

    <View style={S.summaryCard}>

     {cart.map(item=>{
      const price=Number(item.item.price||0);

      return(
       <View style={S.summaryRow} key={item.item.id}>
        <Text style={S.summaryName}>
         {item.item.name} × {item.quantity}
        </Text>

        <Text style={S.summaryPrice}>
         {(price*item.quantity).toLocaleString()} د.ع
        </Text>
       </View>
      );
     })}

     <View style={S.divider}/>

     <View style={S.totalRow}>
      <Text style={S.totalLabel}>الإجمالي</Text>
      <Text style={S.total}>{total.toLocaleString()} د.ع</Text>
     </View>

    </View>

   </ScrollView>

   <View style={S.bottom}>
    <Pressable
     style={[S.confirm,(cart.length===0||submitting)&&S.disabled]}
     disabled={cart.length===0||submitting}
     onPress={confirmOrder}
    >
     <Ionicons name="paper-plane-outline" size={21} color="#fff"/>
     <Text style={S.confirmText}>
      {submitting?"جاري إرسال الطلب...":"تأكيد الطلب وإرساله للمطعم"}
     </Text>
    </Pressable>
   </View>

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
 content:{
  padding:15,
  paddingBottom:120
 },
 sectionTitle:{
  color:C.text,
  fontSize:18,
  fontWeight:"900",
  textAlign:"right",
  marginTop:15,
  marginBottom:10
 },
 addressCard:{
  backgroundColor:C.card,
  borderRadius:18,
  borderWidth:1,
  borderColor:C.border,
  padding:14,
  flexDirection:"row-reverse",
  alignItems:"center"
 },
 addressIcon:{
  width:45,
  height:45,
  borderRadius:23,
  backgroundColor:C.background,
  alignItems:"center",
  justifyContent:"center"
 },
 addressInfo:{
  flex:1,
  paddingHorizontal:10,
  alignItems:"flex-end"
 },
 addressTitle:{
  color:C.text,
  fontSize:14,
  fontWeight:"900"
 },
 addressText:{
  color:C.textMuted,
  fontSize:11,
  marginTop:4,
  textAlign:"right"
 },
 payment:{
  backgroundColor:C.card,
  borderRadius:18,
  borderWidth:1,
  borderColor:C.border,
  padding:14,
  marginBottom:10,
  flexDirection:"row-reverse",
  alignItems:"center"
 },
 paymentActive:{
  borderColor:C.accent,
  borderWidth:2
 },
 radio:{
  width:21,
  height:21,
  borderRadius:11,
  borderWidth:2,
  borderColor:C.accent,
  alignItems:"center",
  justifyContent:"center"
 },
 radioDot:{
  width:10,
  height:10,
  borderRadius:5,
  backgroundColor:C.accent
 },
 paymentInfo:{
  flex:1,
  paddingHorizontal:11,
  alignItems:"flex-end"
 },
 paymentTitle:{
  color:C.text,
  fontSize:14,
  fontWeight:"900"
 },
 paymentText:{
  color:C.textMuted,
  fontSize:11,
  marginTop:4
 },
 summaryCard:{
  backgroundColor:C.card,
  borderRadius:18,
  borderWidth:1,
  borderColor:C.border,
  padding:15
 },
 summaryRow:{
  flexDirection:"row-reverse",
  justifyContent:"space-between",
  alignItems:"center",
  paddingVertical:8
 },
 summaryName:{
  color:C.text,
  fontSize:12,
  fontWeight:"700",
  flex:1,
  textAlign:"right"
 },
 summaryPrice:{
  color:C.text,
  fontSize:12,
  fontWeight:"800"
 },
 divider:{
  height:1,
  backgroundColor:C.border,
  marginVertical:8
 },
 totalRow:{
  flexDirection:"row-reverse",
  justifyContent:"space-between",
  alignItems:"center"
 },
 totalLabel:{
  color:C.text,
  fontSize:16,
  fontWeight:"900"
 },
 total:{
  color:C.accent,
  fontSize:20,
  fontWeight:"900"
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
 confirm:{
  height:56,
  borderRadius:17,
  backgroundColor:C.primary,
  flexDirection:"row-reverse",
  alignItems:"center",
  justifyContent:"center",
  gap:8
 },
 disabled:{
  opacity:.45
 },
 confirmText:{
  color:"#fff",
  fontSize:14,
  fontWeight:"900"
 }
});
