
import React,{useCallback,useState}from"react";
import{ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,View}from"react-native";
import{Ionicons,Feather}from"@expo/vector-icons";
import{router,useLocalSearchParams}from"expo-router";
import{fetchFoodItems,FoodItem}from"../../lib/db_logic";
import Colors from"@/constants/colors";
import {addToCart} from"../../lib/food_cart";

const C=Colors.light;

export default function DishScreen(){
 const{id}=useLocalSearchParams<{id?:string}>();
 const[item,setItem]=useState<FoodItem|null>(null);
 const[qty,setQty]=useState(1);
 const[loading,setLoading]=useState(true);

 const load=useCallback(async()=>{
  try{
   const all=await fetchFoodItems();
   setItem(all.find(x=>x.id===id)||null);
  }finally{
   setLoading(false);
  }
 },[id]);

 React.useEffect(()=>{load()},[load]);

 if(loading)return<View style={S.center}><ActivityIndicator size="large" color={C.accent}/><Text style={S.muted}>جاري تحميل الوجبة...</Text></View>;

 if(!item)return<View style={S.center}><Text style={S.empty}>الوجبة غير موجودة</Text></View>;

 const price=Number(item.price||0);
 const total=price*qty;

 const handleAdd=()=>{
  addToCart(item,qty);
  router.back();
 };
 const image=item.media?.find(x=>x.type==="image")?.url||item.media?.[0]?.url;

 return<View style={S.root}>
  <ScrollView showsVerticalScrollIndicator={false}>
   <View style={S.imageBox}>
    {image?<Image source={{uri:image}} style={S.image}/>:<View style={S.placeholder}><Ionicons name="restaurant-outline" size={70} color={C.accent}/></View>}
    <Pressable style={S.back} onPress={()=>router.back()}>
     <Feather name="arrow-right" size={23} color="#fff"/>
    </Pressable>
   </View>

   <View style={S.body}>
    <Text style={S.name}>{item.name}</Text>

    {!!item.appetizers&&
     <Text style={S.description}>{item.appetizers}</Text>
    }

    <Text style={S.price}>{price.toLocaleString()} د.ع</Text>

    <View style={S.line}/>

    <Text style={S.section}>الكمية</Text>

    <View style={S.quantity}>
     <Pressable
      style={S.qtyButton}
      onPress={()=>setQty(x=>Math.max(1,x-1))}
     >
      <Ionicons name="remove" size={22} color="#fff"/>
     </Pressable>

     <Text style={S.qtyText}>{qty}</Text>

     <Pressable
      style={S.qtyButton}
      onPress={()=>setQty(x=>x+1)}
     >
      <Ionicons name="add" size={22} color="#fff"/>
     </Pressable>
    </View>

    <View style={S.totalBox}>
     <Text style={S.totalLabel}>الإجمالي</Text>
     <Text style={S.total}>{total.toLocaleString()} د.ع</Text>
    </View>
   </View>
  </ScrollView>

  <View style={S.bottom}>
   <Pressable style={S.cartButton} onPress={handleAdd}>
    <Ionicons name="cart-outline" size={22} color="#fff"/>
    <Text style={S.cartText}>إضافة إلى السلة - {total.toLocaleString()} د.ع</Text>
   </Pressable>
  </View>
 </View>
}

const S=StyleSheet.create({
 root:{flex:1,backgroundColor:C.background},
 imageBox:{height:320,backgroundColor:C.primary,position:"relative"},
 image:{width:"100%",height:"100%"},
 placeholder:{flex:1,alignItems:"center",justifyContent:"center"},
 back:{position:"absolute",top:48,right:15,width:44,height:44,borderRadius:22,backgroundColor:"rgba(0,0,0,.55)",alignItems:"center",justifyContent:"center"},
 body:{padding:18,paddingBottom:130},
 name:{fontSize:25,fontWeight:"900",color:C.text,textAlign:"right"},
 description:{fontSize:13,color:C.textMuted,lineHeight:21,textAlign:"right",marginTop:8},
 price:{fontSize:21,fontWeight:"900",color:C.accent,textAlign:"right",marginTop:13},
 line:{height:1,backgroundColor:C.border,marginVertical:20},
 section:{fontSize:17,fontWeight:"900",color:C.text,textAlign:"right"},
 quantity:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:22,marginTop:15},
 qtyButton:{width:43,height:43,borderRadius:22,backgroundColor:C.primary,alignItems:"center",justifyContent:"center"},
 qtyText:{fontSize:20,fontWeight:"900",color:C.text,minWidth:30,textAlign:"center"},
 totalBox:{marginTop:25,padding:16,borderRadius:16,backgroundColor:C.card,borderWidth:1,borderColor:C.border,flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},
 totalLabel:{fontSize:15,fontWeight:"800",color:C.text},
 total:{fontSize:19,fontWeight:"900",color:C.accent},
 bottom:{position:"absolute",bottom:0,left:0,right:0,padding:13,paddingBottom:22,backgroundColor:C.background,borderTopWidth:1,borderTopColor:C.border},
 cartButton:{height:55,borderRadius:17,backgroundColor:C.primary,flexDirection:"row-reverse",alignItems:"center",justifyContent:"center",gap:8},
 cartText:{color:"#fff",fontSize:14,fontWeight:"900"},
 center:{flex:1,backgroundColor:C.background,alignItems:"center",justifyContent:"center",gap:10},
 muted:{color:C.textMuted},
 empty:{color:C.text,fontSize:17,fontWeight:"900"}
});
