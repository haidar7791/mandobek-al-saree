import React,{useCallback,useMemo,useState}from"react";
import{ActivityIndicator,FlatList,Image,Pressable,RefreshControl,StyleSheet,Text,TextInput,View}from"react-native";
import{Ionicons,Feather}from"@expo/vector-icons";
import{router,useFocusEffect}from"expo-router";
import{fetchFoodItems,FoodItem}from"../lib/db_logic";
import Colors from"@/constants/colors";

const C=Colors.light;

const cats=[
["all","الكل"],
["grills","مشويات 🍢"],
["fast","وجبات سريعة 🍔"],
["iraqi","مأكولات شعبية 🍲"],
["dessert","حلويات ومشروبات 🍰"]
];

function typeOf(x:FoodItem){
 const s=(x.name+" "+(x.appetizers||"")).toLowerCase();
 if(/مشوي|كباب|تكة|شيش/.test(s))return"grills";
 if(/برجر|برغر|بيتزا|شاورما|زنجر/.test(s))return"fast";
 if(/مندي|كبسة|برياني|دولمة|تشريب|قوزي|عراقي/.test(s))return"iraqi";
 if(/حلويات|كيك|بقلاوة|كنافة|عصير|مشروب|قهوة|شاي/.test(s))return"dessert";
 return"all";
}

export default function FoodScreen(){
 const[items,setItems]=useState<FoodItem[]>([]);
 const[q,setQ]=useState("");
 const[cat,setCat]=useState("all");
 const[loading,setLoading]=useState(true);
 const[refresh,setRefresh]=useState(false);

 const load=useCallback(async()=>{
  try{setItems(await fetchFoodItems())}
  catch(e){console.error(e)}
  finally{setLoading(false);setRefresh(false)}
 },[]);

 useFocusEffect(useCallback(()=>{load()},[load]));

 const restaurants=useMemo(()=>{
  const map=new Map<string,FoodItem[]>();
  items.forEach(x=>{
   const k=x.userId||x.id;
   if(!map.has(k))map.set(k,[]);
   map.get(k)!.push(x);
  });

  return [...map].map(([id,dishes])=>{
   const first=dishes[0];
   const image=first.media?.find(m=>m.type==="image")?.url||first.media?.[0]?.url;
   return{id,dishes,name:first.userName||"مطعم",image};
  }).filter(r=>{
   const s=q.toLowerCase();
   return(!s||r.name.toLowerCase().includes(s)||r.dishes.some(x=>x.name.toLowerCase().includes(s)))
   &&(cat==="all"||r.dishes.some(x=>typeOf(x)===cat));
  });
 },[items,q,cat]);

 if(loading)return<View style={S.center}><ActivityIndicator size="large" color={C.accent}/><Text style={S.muted}>جاري تحميل المطاعم...</Text></View>;

 return<View style={S.root}>
  <View style={S.header}>
   <Pressable onPress={()=>router.back()}><Feather name="arrow-right" size={24} color="#fff"/></Pressable>
   <Text style={S.headerText}>المطاعم</Text>
   <Ionicons name="restaurant-outline" size={24} color={C.accent}/>
  </View>

  <FlatList
   data={restaurants}
   keyExtractor={x=>x.id}
   contentContainerStyle={S.list}
   refreshControl={<RefreshControl refreshing={refresh} onRefresh={()=>{setRefresh(true);load()}}/>}
   ListHeaderComponent={<>
    <View style={S.search}>
     <Ionicons name="search-outline" size={21} color={C.textMuted}/>
     <TextInput
      value={q}
      onChangeText={setQ}
      placeholder="ابحث عن مطعم أو وجبة..."
      placeholderTextColor={C.textMuted}
      style={S.input}
      textAlign="right"
     />
    </View>

    <FlatList
     data={cats}
     horizontal
     inverted
     keyExtractor={x=>x[0]}
     showsHorizontalScrollIndicator={false}
     contentContainerStyle={S.cats}
     renderItem={({item})=>
      <Pressable onPress={()=>setCat(item[0])} style={[S.cat,cat===item[0]&&S.catActive]}>
       <Text style={[S.catText,cat===item[0]&&S.catTextActive]}>{item[1]}</Text>
      </Pressable>
     }
    />

    <Text style={S.title}>اكتشف المطاعم</Text>
   </>}
   renderItem={({item:r})=>
    <Pressable
     style={S.card}
     onPress={()=>router.push(("/restaurant/" + r.id) as any)}
    >
     {r.image?<Image source={{uri:r.image}} style={S.image}/>:<View style={S.placeholder}><Ionicons name="restaurant-outline" size={55} color={C.accent}/></View>}

     <View style={S.info}>
      <Text style={S.name}>{r.name}</Text>
      <View style={S.row}>
       <Text style={S.meta}>⭐ 4.8</Text>
       <Text style={S.meta}>⏱ 25-35 دقيقة</Text>
       <Text style={S.open}>● مفتوح الآن</Text>
      </View>
     </View>
    </Pressable>
   }
   ListEmptyComponent={<View style={S.center}><Text style={S.empty}>لا توجد مطاعم حالياً</Text></View>}
  />
 </View>
}

const S=StyleSheet.create({
 root:{flex:1,backgroundColor:C.background},
 header:{height:62,backgroundColor:C.primary,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16},
 headerText:{color:"#fff",fontSize:21,fontWeight:"900"},
 list:{padding:12,paddingBottom:30},
 search:{height:52,borderRadius:16,backgroundColor:C.card,borderWidth:1,borderColor:C.border,flexDirection:"row-reverse",alignItems:"center",paddingHorizontal:14,gap:8,marginBottom:10},
 input:{flex:1,color:C.text,fontSize:14},
 cats:{gap:8,paddingVertical:3},
 cat:{paddingHorizontal:15,height:40,borderRadius:20,backgroundColor:C.card,borderWidth:1,borderColor:C.border,justifyContent:"center"},
 catActive:{backgroundColor:C.primary,borderColor:C.primary},
 catText:{color:C.text,fontSize:12,fontWeight:"800"},
 catTextActive:{color:"#fff"},
 title:{fontSize:20,fontWeight:"900",color:C.text,textAlign:"right",marginVertical:16},
 card:{backgroundColor:C.card,borderRadius:20,overflow:"hidden",marginBottom:15,borderWidth:1,borderColor:C.border},
 image:{width:"100%",height:190},
 placeholder:{height:190,alignItems:"center",justifyContent:"center",backgroundColor:C.background},
 info:{padding:14,alignItems:"flex-end"},
 name:{fontSize:19,fontWeight:"900",color:C.text},
 row:{flexDirection:"row-reverse",gap:12,marginTop:9},
 meta:{fontSize:11,color:C.textMuted},
 open:{fontSize:11,color:"#22C55E",fontWeight:"800"},
 center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},
 muted:{color:C.textMuted},
 empty:{color:C.text,fontSize:16,fontWeight:"800"}
});
