import React,{useState}from"react";
import{
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
}from"react-native";
import{Ionicons,Feather}from"@expo/vector-icons";
import{router,useFocusEffect}from"expo-router";
import{getCart,getCartTotal,CartItem,clearCart}from"../../lib/food_cart";
import{
  createFoodOrder,
  type GeoLocation
}from"../../lib/db_logic";
import Colors from"@/constants/colors";
import*as Location from"expo-location";


const C=Colors.light;

export default function Checkout(){
 const[cart,setCart]=useState<CartItem[]>([]);
 const[payment,setPayment]=useState<"cash"|"wallet">("cash");
 const[phone,setPhone]=useState("");
 const[address,setAddress]=useState("");
 const[location,setLocation]=useState<GeoLocation|null>(null);
 const[submitting,setSubmitting]=useState(false);
 const[locationLoading,setLocationLoading]=useState(false);

 useFocusEffect(
  React.useCallback(()=>{
   setCart(getCart());
  },[])
 );

 const total=getCartTotal();

 const getCurrentLocation=async()=>{
  try{
   setLocationLoading(true);

   const permission=
    await Location.requestForegroundPermissionsAsync();

   if(permission.status!=="granted"){
    Alert.alert(
     "صلاحية الموقع",
     "يجب السماح للتطبيق بالوصول إلى الموقع."
    );
    return;
   }

   const pos=
    await Location.getCurrentPositionAsync({
     accuracy:Location.Accuracy.High
    });

   setLocation({
    lat:pos.coords.latitude,
    lng:pos.coords.longitude
   });

   Alert.alert(
    "تم تحديد الموقع",
    "تم حفظ موقعك الحالي للطلب."
   );
  }catch(error){
   console.error(error);
   Alert.alert(
    "خطأ",
    "تعذر تحديد موقعك الحالي."
   );
  }finally{
   setLocationLoading(false);
  }
 };

 const confirmOrder=async()=>{
  if(submitting||cart.length===0)return;

  if(!phone.trim()){
   Alert.alert(
    "رقم الهاتف مطلوب",
    "أدخل رقم هاتفك حتى يستطيع المطعم أو المندوب التواصل معك."
   );
   return;
  }

  if(!address.trim()&&!location){
   Alert.alert(
    "موقع التوصيل مطلوب",
    "اكتب عنوان التوصيل أو حدد موقعك على الخريطة."
   );
   return;
  }

  const restaurantId=cart[0]?.item.userId;

  if(!restaurantId){
   Alert.alert(
    "خطأ",
    "تعذر تحديد المطعم."
   );
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

   const restaurantName=
    cart[0]?.item.userName||"المطعم";

   const items=cart.map(x=>({
    foodId:x.item.id,
    name:x.item.name,
    price:Number(x.item.price||0),
    quantity:x.quantity,
    imageUrl:
      x.item.media?.find(
       m=>m.type==="image"
      )?.url||
      x.item.media?.[0]?.url||
      null,
   }));

   const orderId=
    await createFoodOrder({
     restaurantId,
     restaurantName,
     items,
     total,
     paymentMethod:payment,
     customerPhone:phone.trim(),
     customerAddress:address.trim(),
     customerLocation:location,
    });

   clearCart();

   router.replace("/dashboard" as any);

  }catch(error){
   console.error(
    "createFoodOrder error:",
    error
   );

   const message=
    error instanceof Error &&
    error.message==="INSUFFICIENT_WALLET_BALANCE"
      ? "رصيد محفظتك غير كافٍ لإتمام الطلب."
      : "حدث خطأ أثناء إرسال طلبك للمطعم. حاول مرة أخرى.";

   Alert.alert(
    "تعذر إرسال الطلب",
    message
   );
  }finally{
   setSubmitting(false);
  }
 };

 return(
  <View style={S.root}>

   <View style={S.header}>
    <Pressable onPress={()=>router.back()}>
     <Feather
      name="arrow-right"
      size={24}
      color="#fff"
     />
    </Pressable>

    <Text style={S.headerTitle}>
     إتمام الطلب
    </Text>

    <Ionicons
     name="checkmark-circle-outline"
     size={24}
     color={C.accent}
    />
   </View>

   <ScrollView
    showsVerticalScrollIndicator={false}
    contentContainerStyle={S.content}
   >

    <Text style={S.sectionTitle}>
     معلومات التوصيل
    </Text>

    <TextInput
     style={S.input}
     value={phone}
     onChangeText={setPhone}
     placeholder="رقم الهاتف"
     placeholderTextColor={C.textMuted}
     keyboardType="phone-pad"
     textAlign="right"
    />

    <TextInput
     style={[S.input,S.addressInput]}
     value={address}
     onChangeText={setAddress}
     placeholder="عنوان التوصيل"
     placeholderTextColor={C.textMuted}
     multiline
     textAlign="right"
    />

    <Pressable
     style={S.locationButton}
     onPress={getCurrentLocation}
     disabled={locationLoading}
    >
     {locationLoading?(
      <ActivityIndicator color="#fff"/>
     ):(
      <Ionicons
       name="navigate"
       size={21}
       color="#fff"
      />
     )}
     <Text style={S.locationButtonText}>
      {locationLoading
       ?"جاري تحديد الموقع..."
       :"استخدام موقعي الحالي"}
     </Text>
    </Pressable>

    {location?(
     <View style={S.locationInfo}>
      <Ionicons
       name="checkmark-circle"
       size={20}
       color="#16A34A"
      />
      <Text style={S.locationInfoText}>
       تم تحديد موقع التوصيل
      </Text>

      <Pressable
       onPress={()=>{
        Linking.openURL(
         `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`
        );
       }}
      >
       <Text style={S.mapLink}>
        فتح الخريطة
       </Text>
      </Pressable>
     </View>
    ):null}

    <Text style={S.sectionTitle}>
     طريقة الدفع
    </Text>

    <Pressable
     style={[
      S.payment,
      payment==="cash"&&S.paymentActive
     ]}
     onPress={()=>setPayment("cash")}
    >
     <View style={S.radio}>
      {payment==="cash"&&
       <View style={S.radioDot}/>}
     </View>

     <View style={S.paymentInfo}>
      <Text style={S.paymentTitle}>
       الدفع عند الاستلام
      </Text>
      <Text style={S.paymentText}>
       ادفع للمندوب عند استلام طلبك
      </Text>
     </View>

     <Ionicons
      name="cash-outline"
      size={25}
      color={C.accent}
     />
    </Pressable>

    <Pressable
     style={[
      S.payment,
      payment==="wallet"&&S.paymentActive
     ]}
     onPress={()=>setPayment("wallet")}
    >
     <View style={S.radio}>
      {payment==="wallet"&&
       <View style={S.radioDot}/>}
     </View>

     <View style={S.paymentInfo}>
      <Text style={S.paymentTitle}>
       المحفظة
      </Text>
      <Text style={S.paymentText}>
       الدفع من رصيد المحفظة
      </Text>
     </View>

     <Ionicons
      name="wallet-outline"
      size={25}
      color={C.accent}
     />
    </Pressable>

    <Text style={S.sectionTitle}>
     ملخص الطلب
    </Text>

    <View style={S.summaryCard}>

     {cart.map(item=>{
      const price=
       Number(item.item.price||0);

      return(
       <View
        style={S.summaryRow}
        key={item.item.id}
       >
        <Text style={S.summaryName}>
         {item.item.name} × {item.quantity}
        </Text>

        <Text style={S.summaryPrice}>
         {(price*item.quantity)
          .toLocaleString()} د.ع
        </Text>
       </View>
      );
     })}

     <View style={S.divider}/>

     <View style={S.totalRow}>
      <Text style={S.totalLabel}>
       الإجمالي
      </Text>

      <Text style={S.total}>
       {total.toLocaleString()} د.ع
      </Text>
     </View>

    </View>

   </ScrollView>

   <View style={S.bottom}>
    <Pressable
     style={[
      S.confirm,
      {transform:[{translateY:-20}]},
      (cart.length===0||submitting)&&
       S.disabled
     ]}
     disabled={
      cart.length===0||submitting
     }
     onPress={confirmOrder}
    >
     <Ionicons
      name="paper-plane-outline"
      size={21}
      color="#fff"
     />

     <Text style={S.confirmText}>
      {submitting
       ?"جاري إرسال الطلب..."
       :"تأكيد الطلب وإرساله للمطعم"}
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
  flexDirection:"row-reverse",
  alignItems:"center",
  justifyContent:"space-between",
  paddingHorizontal:16
 },
 headerTitle:{
  color:"#fff",
  fontSize:18,
  fontWeight:"800"
 },
 content:{
  padding:16,
  paddingBottom:120
 },
 sectionTitle:{
  color:C.text,
  fontSize:16,
  fontWeight:"800",
  marginTop:12,
  marginBottom:10,
  textAlign:"right"
 },
 input:{
  minHeight:52,
  borderRadius:14,
  backgroundColor:C.card,
  borderWidth:1,
  borderColor:C.border,
  paddingHorizontal:15,
  color:C.text,
  marginBottom:10
 },
 addressInput:{
  minHeight:90,
  paddingTop:14,
  textAlignVertical:"top"
 },
 locationButton:{
  minHeight:50,
  borderRadius:14,
  backgroundColor:C.primary,
  flexDirection:"row-reverse",
  alignItems:"center",
  justifyContent:"center",
  gap:8,
  marginBottom:10
 },
 locationButtonText:{
  color:"#fff",
  fontSize:14,
  fontWeight:"800"
 },
 locationInfo:{
  minHeight:48,
  borderRadius:12,
  backgroundColor:"rgba(22,163,74,.08)",
  flexDirection:"row-reverse",
  alignItems:"center",
  gap:7,
  paddingHorizontal:12,
  marginBottom:10
 },
 locationInfoText:{
  flex:1,
  color:"#16A34A",
  fontWeight:"800",
  textAlign:"right"
 },
 mapLink:{
  color:C.primary,
  fontWeight:"800"
 },
 
 payment:{
  minHeight:76,
  borderRadius:16,
  backgroundColor:C.card,
  borderWidth:1,
  borderColor:C.border,
  flexDirection:"row-reverse",
  alignItems:"center",
  padding:14,
  marginBottom:10
 },
 paymentActive:{
  borderColor:C.accent,
  backgroundColor:"rgba(245,158,11,.07)"
 },
 radio:{
  width:22,
  height:22,
  borderRadius:11,
  borderWidth:2,
  borderColor:C.accent,
  alignItems:"center",
  justifyContent:"center"
 },
 radioDot:{
  width:11,
  height:11,
  borderRadius:6,
  backgroundColor:C.accent
 },
 paymentInfo:{
  flex:1,
  marginHorizontal:12
 },
 paymentTitle:{
  color:C.text,
  fontSize:15,
  fontWeight:"800",
  textAlign:"right"
 },
 paymentText:{
  color:C.textMuted,
  fontSize:12,
  marginTop:3,
  textAlign:"right"
 },
 summaryCard:{
  backgroundColor:C.card,
  borderRadius:16,
  padding:15,
  borderWidth:1,
  borderColor:C.border
 },
 summaryRow:{
  flexDirection:"row-reverse",
  justifyContent:"space-between",
  alignItems:"center",
  paddingVertical:7
 },
 summaryName:{
  flex:1,
  color:C.text,
  textAlign:"right",
  fontSize:13
 },
 summaryPrice:{
  color:C.text,
  fontWeight:"800",
  marginLeft:12
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
  fontSize:18,
  fontWeight:"900"
 },
 bottom:{
  position:"absolute",
  left:0,
  right:0,
  bottom:0,
  padding:14,
  backgroundColor:C.background,
  borderTopWidth:1,
  borderTopColor:C.border
 },
 confirm:{
  minHeight:54,
  borderRadius:16,
  backgroundColor:C.primary,
  flexDirection:"row-reverse",
  alignItems:"center",
  justifyContent:"center",
  gap:8
 },
 confirmText:{
  color:"#fff",
  fontSize:15,
  fontWeight:"900"
 },
 disabled:{
  opacity:.55
 }
});
