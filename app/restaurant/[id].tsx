
import React,{useCallback,useState}from"react";
import{ActivityIndicator,FlatList,Image,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View}from"react-native";
import{Ionicons,Feather}from"@expo/vector-icons";
import{router,useLocalSearchParams,useFocusEffect}from"expo-router";
import{fetchFoodItems,getUserProfile,FoodItem,UserProfile}from"../../lib/db_logic";
import Colors from"@/constants/colors";
import {getCart,getCartCount,getCartTotal} from"../../lib/food_cart";

const C=Colors.light;

export default function Restaurant(){
 const{id}=useLocalSearchParams<{id?:string}>();
 const[items,setItems]=useState<FoodItem[]>([]);
 const[profile,setProfile]=useState<UserProfile|null>(null);
 const[activeCategory,setActiveCategory]=useState<"all"|"main"|"appetizer"|"drink"|"dessert">("all");
 const[loading,setLoading]=useState(true);
 const[refreshing,setRefreshing]=useState(false);
 const[cartCount,setCartCount]=useState(0);
 const[cartTotal,setCartTotal]=useState(0);

 const updateCart=()=>{
  setCartCount(getCartCount());
  setCartTotal(getCartTotal());
 };

 const load=useCallback(async()=>{
  try{
    const [all, restaurantProfile]=await Promise.all([fetchFoodItems(),id?getUserProfile(id):Promise.resolve(null)]);
   setItems(all.filter(x=>x.userId===id));
    setProfile(restaurantProfile);
  }finally{
   setLoading(false);
   setRefreshing(false);
  }
 },[id]);

 useFocusEffect(useCallback(()=>{
  load();
  updateCart();
 },[load]));

 const name=profile?.name||items[0]?.userName||"المطعم";
 const cover=profile?.coverUri||items[0]?.media?.find(x=>x.type==="image")?.url||items[0]?.media?.[0]?.url;
 const visibleItems=activeCategory==="all"?items:items.filter(item=>(item.category||"main")===activeCategory);

 if(loading)return<View style={S.center}><ActivityIndicator size="large" color={C.accent}/><Text style={S.muted}>جاري تحميل المطعم...</Text></View>;

 return<View style={S.root}>
  <FlatList
    data={visibleItems}
   keyExtractor={x=>x.id}
   contentContainerStyle={S.list}
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}}/>}
   ListHeaderComponent={<>
    <View style={S.hero}>
     {cover?<Image source={{uri:cover}} style={S.heroImage}/>:<View style={S.placeholder}><Ionicons name="restaurant-outline" size={65} color={C.accent}/></View>}
     <View style={S.overlay}/>
     <Pressable style={S.back} onPress={()=>router.back()}><Feather name="arrow-right" size={23} color="#fff"/></Pressable>
     <Pressable style={S.share}><Feather name="share-2" size={21} color="#fff"/></Pressable>
     <View style={S.heroText}>
      <Text style={S.name}>{name}</Text>
      <View style={S.metaRow}>
        {!!profile?.restaurantCategory&&<Text style={S.meta}>{profile.restaurantCategory}</Text>}
        <Text style={S.meta}>⏱ {profile?.estimatedDelivery||"25-35 دقيقة"}</Text>
        <Text style={[S.open,!(profile?.isAvailable??true)&&S.closed]}>{profile?.isAvailable===false?"● مغلق الآن":"● مفتوح الآن"}</Text>
      </View>
     </View>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.tabs}>
      {([
       ["all","قائمة الطعام"],["main","الأطباق الرئيسية"],["appetizer","المقبلات"],["drink","المشروبات"],["dessert","الحلويات"]
      ] as const).map(([key,label])=>
       <Pressable key={key} onPress={()=>setActiveCategory(key)} style={activeCategory===key?S.tabActive:S.tab}>
        <Text style={activeCategory===key?S.tabActiveText:S.tabText}>{label}</Text>
       </Pressable>
      )}
     </ScrollView>

    <Text style={S.heading}>الأطباق</Text>
   </>}
   renderItem={({item})=>
    <Pressable style={S.dish} onPress={()=>router.push("/restaurant/dish" as any)}>
     {item.media?.[0]?.url?
      <Image source={{uri:item.media[0].url}} style={S.dishImage}/>:
      <View style={S.dishPlaceholder}><Ionicons name="restaurant-outline" size={35} color={C.accent}/></View>
     }

     <View style={S.dishInfo}>
      <Text style={S.dishName} numberOfLines={2}>{item.name}</Text>
       {!!(item.description||item.appetizers)&&<Text style={S.description} numberOfLines={2}>{item.description||item.appetizers}</Text>}
      <Text style={S.price}>{Number(item.price||0).toLocaleString()} د.ع</Text>
     </View>

     <View style={S.add}><Ionicons name="add" size={24} color="#fff"/></View>
    </Pressable>
   }
    ListEmptyComponent={<View style={S.center}><Ionicons name="restaurant-outline" size={55} color={C.accent}/><Text style={S.empty}>لا توجد أطباق حالياً</Text></View>}
  />
 </View>
}

const S=StyleSheet.create({
 root:{flex:1,backgroundColor:C.background},
 list:{paddingBottom:30},
 hero:{height:300,position:"relative",backgroundColor:C.primary},
 heroImage:{width:"100%",height:"100%"},
 placeholder:{flex:1,alignItems:"center",justifyContent:"center"},
 overlay:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,0,0,.38)"},
 back:{position:"absolute",top:48,right:15,width:43,height:43,borderRadius:22,backgroundColor:"rgba(0,0,0,.5)",alignItems:"center",justifyContent:"center"},
 share:{position:"absolute",top:48,left:15,width:43,height:43,borderRadius:22,backgroundColor:"rgba(0,0,0,.5)",alignItems:"center",justifyContent:"center"},
 heroText:{position:"absolute",bottom:22,right:17,left:17,alignItems:"flex-end"},
 name:{color:"#fff",fontSize:27,fontWeight:"900"},
 metaRow:{flexDirection:"row-reverse",gap:13,marginTop:9},
 meta:{color:"#fff",fontSize:12,fontWeight:"800"},
  open:{color:"#4ade80",fontSize:12,fontWeight:"800"},
  closed:{color:"#FDA4AF"},
  tabs:{flexDirection:"row-reverse",gap:8,padding:13,borderBottomWidth:1,borderBottomColor:C.border},
  tab:{paddingHorizontal:13,paddingVertical:10,borderRadius:18,backgroundColor:C.card,borderWidth:1,borderColor:C.border},
  tabText:{color:C.textMuted,fontSize:12,fontWeight:"800"},
  tabActive:{paddingHorizontal:15,paddingVertical:10,borderRadius:18,backgroundColor:C.primary,borderWidth:1,borderColor:C.primary},
  tabActiveText:{color:"#fff",fontSize:12,fontWeight:"900"},
 heading:{fontSize:21,fontWeight:"900",color:C.text,textAlign:"right",paddingHorizontal:15,paddingVertical:12},
 dish:{marginHorizontal:13,marginBottom:12,padding:10,borderRadius:18,backgroundColor:C.card,borderWidth:1,borderColor:C.border,flexDirection:"row-reverse",alignItems:"center"},
 dishImage:{width:105,height:105,borderRadius:15},
 dishPlaceholder:{width:105,height:105,borderRadius:15,backgroundColor:C.background,alignItems:"center",justifyContent:"center"},
 dishInfo:{flex:1,paddingHorizontal:11,alignItems:"flex-end"},
 dishName:{color:C.text,fontSize:16,fontWeight:"900",textAlign:"right"},
 description:{color:C.textMuted,fontSize:11,marginTop:5,textAlign:"right"},
 price:{color:C.accent,fontSize:15,fontWeight:"900",marginTop:8},
 add:{width:39,height:39,borderRadius:20,backgroundColor:C.primary,alignItems:"center",justifyContent:"center"},
 center:{flex:1,minHeight:250,alignItems:"center",justifyContent:"center",gap:10},
 muted:{color:C.textMuted},
 empty:{color:C.text,fontSize:15,fontWeight:"800"},
 cartBar:{position:"absolute",bottom:14,left:12,right:12,height:64,borderRadius:20,backgroundColor:C.primary,flexDirection:"row-reverse",alignItems:"center",paddingHorizontal:10,elevation:8,shadowOpacity:.2,shadowRadius:8},
 cartInfo:{flex:1,alignItems:"flex-end",paddingRight:10},
 cartCount:{color:"#fff",fontSize:12,fontWeight:"800"},
 cartTotal:{color:"#fff",fontSize:16,fontWeight:"900",marginTop:2},
 cartButton:{height:46,paddingHorizontal:18,borderRadius:15,backgroundColor:C.accent,flexDirection:"row-reverse",alignItems:"center",justifyContent:"center",gap:6},
 cartText:{color:"#fff",fontSize:13,fontWeight:"900"}
});
