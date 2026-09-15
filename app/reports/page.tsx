"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import Shell from "@/components/Shell";
import {supabaseBrowser} from "@/lib/supabase-browser";
import {getCurrentProfile} from "@/lib/current-user";
export default function Reports(){
 const router=useRouter();const [period,setPeriod]=useState("month");const [r,setR]=useState<any>(null);const [allowed,setAllowed]=useState(false);
 useEffect(()=>{getCurrentProfile().then(p=>{if(!p||!["CEO","ADMIN"].includes(p.role))router.replace("/dashboard");else setAllowed(true)})},[router]);
 async function load(){const {data,error}=await supabaseBrowser().rpc("report_summary",{p_period:period});if(error)alert(error.message);else setR(data)}
 if(!allowed)return <Shell><p>Checking access...</p></Shell>;
 return <Shell><h1>Reports</h1><div className="form"><select className="select" value={period} onChange={e=>setPeriod(e.target.value)}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option></select><button className="btn primary" onClick={load}>Generate Report</button></div>{r&&<div className="cards"><div className="card">Revenue<div className="metric">{Number(r.revenue).toFixed(2)} Birr</div></div><div className="card">Gross Profit<div className="metric">{Number(r.gross_profit).toFixed(2)} Birr</div></div><div className="card">Expenses<div className="metric">{Number(r.expenses).toFixed(2)} Birr</div></div><div className="card">Net Profit<div className="metric">{Number(r.net_profit).toFixed(2)} Birr</div></div></div>}</Shell>
}
