"use client";
import {useEffect,useState} from "react";
import Shell from "@/components/Shell";
import {supabaseBrowser} from "@/lib/supabase-browser";
import {getCurrentProfile} from "@/lib/current-user";

export default function Dashboard(){
 const [profile,setProfile]=useState<any>(null); const [d,setD]=useState<any>({}); const [mine,setMine]=useState<any>({}); const [loading,setLoading]=useState(true);
 async function load(){
  const sb=supabaseBrowser();
  const p=await getCurrentProfile(); setProfile(p);
  if(!p){setLoading(false);return;}
  if(p.role==="CEO"||p.role==="ADMIN") { const {data}=await sb.rpc("dashboard_summary"); if(data)setD(data); }
  else { const {data}=await sb.rpc("employee_sales_summary",{p_employee_id:p.id}); if(data)setMine(data); }
  setLoading(false);
 }
 useEffect(()=>{load();const sb=supabaseBrowser();const ch=sb.channel("dashboard-live").on("postgres_changes",{event:"*",schema:"public",table:"sales"},load).on("postgres_changes",{event:"*",schema:"public",table:"products"},load).subscribe();return()=>{sb.removeChannel(ch)}},[]);
 const management=profile?.role==="CEO"||profile?.role==="ADMIN";
 return <Shell><h1>{management?"CEO Dashboard":"My Employee Dashboard"}</h1><p className="muted">Welcome, <b>{profile?.full_name||profile?.authEmail||"User"}</b>{profile?.employee_code?` • ${profile.employee_code}`:""}</p>
 {management?<><div className="cards"><Metric title="Today Revenue" value={d.revenue}/><Metric title="Gross Profit" value={d.gross_profit}/><Metric title="Expenses" value={d.expenses}/><Metric title="Net Profit" value={d.net_profit}/></div><div className="cards" style={{marginTop:14}}><Metric title="Transactions" value={d.transactions} money={false}/><Metric title="Items Sold" value={d.items_sold} money={false}/><Metric title="Low Stock" value={d.low_stock} money={false}/><Metric title="Products" value={d.products} money={false}/></div><div className="notice">All financial and stock numbers are calculated from the central PostgreSQL database and update in real time.</div></>:<><div className="cards"><Metric title="Today's Sales" value={mine.day_revenue}/><Metric title="Today's Transactions" value={mine.day_transactions} money={false}/><Metric title="Today's Items" value={mine.day_items} money={false}/><Metric title="This Month" value={mine.month_revenue}/></div><div className="cards" style={{marginTop:14}}><Metric title="This Week" value={mine.week_revenue}/><Metric title="Week Items" value={mine.week_items} money={false}/><Metric title="Year Sales" value={mine.year_revenue}/><Metric title="Year Items" value={mine.year_items} money={false}/></div><div className="notice">You can record sales from POS and see your own performance here. Product prices and business settings are controlled by management.</div></>}
 {loading&&<p>Loading...</p>}</Shell>
}
function Metric({title,value,money=true}:{title:string,value:any,money?:boolean}){return <div className="card"><div>{title}</div><div className="metric">{money?`${Number(value||0).toFixed(2)} Birr`:Number(value||0)}</div></div>}
