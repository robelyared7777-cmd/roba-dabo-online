"use client";
import {useEffect,useState} from "react";
import Shell from "@/components/Shell";
import {supabaseBrowser} from "@/lib/supabase-browser";
import type {Product} from "@/lib/types";
export default function POS(){
 const [products,setProducts]=useState<Product[]>([]);const [productId,setProductId]=useState("");const [qty,setQty]=useState(1);const [msg,setMsg]=useState("");
 async function load(){const {data}=await supabaseBrowser().from("products").select("*").eq("active",true).order("name");setProducts(data||[])}
 useEffect(()=>{load()},[]);
 async function sell(){setMsg("");const {data:{user}}=await supabaseBrowser().auth.getUser();if(!user){setMsg("Please sign in.");return}const {data,error}=await supabaseBrowser().rpc("record_sale",{p_product_id:productId,p_quantity:qty,p_payment_method:"Cash"});if(error)setMsg(error.message);else{setMsg(`Sale recorded. Total: ${Number(data?.total||0).toFixed(2)} Birr`);setQty(1);load()}}
 const p=products.find(x=>x.id===productId);return <Shell><h1>POS — New Sale</h1><div className="card"><div className="form"><select className="select" value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Select bread</option>{products.map(x=><option key={x.id} value={x.id}>{x.name} — {x.sale_price} Birr — Stock {x.quantity}</option>)}</select><input className="input" type="number" min="1" max={p?.quantity||1} value={qty} onChange={e=>setQty(Number(e.target.value))}/><select className="select"><option>Cash</option><option>Telebirr</option><option>Bank</option></select><button className="btn primary" onClick={sell} disabled={!productId}>Complete Sale</button></div>{p&&<p>Total: <b>{(p.sale_price*qty).toFixed(2)} Birr</b></p>}{msg&&<div className="notice">{msg}</div>}</div></Shell>
}