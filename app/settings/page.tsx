"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import Shell from "@/components/Shell";
import {supabaseBrowser} from "@/lib/supabase-browser";
import {getCurrentProfile} from "@/lib/current-user";
const fields:[string,string,string][]=[
 ["shop_name","Business Name","Roba Dabo"],["owner","CEO / Owner Name",""],["phone","Business Phone",""],["email","Business Email","robelyared777@gmail.com"],["address","Business Address",""],["tin","TIN",""],["currency","Currency","ETB / Birr"],["tax_rate","Tax Rate (%)",""],["opening_time","Opening Time",""],["closing_time","Closing Time",""],["receipt_paper","Receipt Paper",""],["receipt_header","Receipt Header",""],["receipt_footer","Receipt Footer",""]
];
export default function Settings(){
 const router=useRouter();const [allowed,setAllowed]=useState(false);const [v,setV]=useState<any>(Object.fromEntries(fields.map(([k,,d])=>[k,d])));
 useEffect(()=>{getCurrentProfile().then(async p=>{if(!p||!["CEO","ADMIN"].includes(p.role)){router.replace("/dashboard");return}setAllowed(true);const {data}=await supabaseBrowser().from("business_settings").select("*").eq("id",1).single();if(data)setV(data)})},[router]);
 function set(k:string,x:string){setV((a:any)=>({...a,[k]:x}))}
 async function save(){const {error}=await supabaseBrowser().from("business_settings").upsert({...v,id:1});alert(error?error.message:"Settings saved successfully.")}
 if(!allowed)return <Shell><p>Checking access...</p></Shell>;
 return <Shell><h1>Business Settings</h1><div className="card"><p className="muted">Unknown business information can remain blank. Add it whenever you receive it.</p><div className="settings-grid">{fields.map(([k,label,placeholder])=><label key={k}>{label}<input className="input" placeholder={placeholder||label} value={v[k]||""} onChange={e=>set(k,e.target.value)}/></label>)}</div><button className="btn primary" onClick={save}>Save Settings</button></div></Shell>
}
