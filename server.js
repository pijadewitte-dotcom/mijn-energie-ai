import 'dotenv/config';
import express from 'express';
import mqtt from 'mqtt';
import {WebSocketServer} from 'ws';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'8kb'}));
app.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next()});
const password=process.env.APP_PASSWORD;
if(!password || password.length<12 || password.startsWith('SET_')) throw Error('Set an APP_PASSWORD secret of 12+ characters');
const mac=(process.env.LOWI_MAC||'4c75252ccdd3').toLowerCase().replace(/[^a-f0-9]/g,'');
if(mac.length!==12) throw Error('LOWI_MAC should contain 12 hex characters');
const topic=mac+'/PUB/CH0';
const state={connected:false,at:null,last:null,history:[]};
const sessions=new Map(),failures=new Map();
const dataDir=process.env.DATA_DIR||path.join(process.cwd(),'data');
const historyFile=path.join(dataDir,'history.jsonl');
fs.mkdirSync(dataDir,{recursive:true});
try{state.history=fs.readFileSync(historyFile,'utf8').trim().split('\n').slice(-8000).map(JSON.parse).filter(x=>Number.isFinite(x.at));}catch{}
function cookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('me_session='))?.slice(11)}
function authed(req){const t=cookie(req),exp=t&&sessions.get(t);return !!(exp&&exp>Date.now())}
function auth(req,res,next){if(!authed(req)) return res.status(401).json({error:'Aanmelden vereist'});next()}
app.get('/health',(_req,res)=>res.json({ok:true}));
app.post('/api/login',(req,res)=>{
  const ip=req.ip||'unknown',entry=failures.get(ip)||{n:0,until:0};
  if(entry.until>Date.now()) return res.status(429).json({error:'Probeer later opnieuw'});
  const a=Buffer.from(String(req.body?.password||'')),b=Buffer.from(password);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)){
    entry.n++;entry.until=entry.n>=8?Date.now()+15*60_000:0;failures.set(ip,entry);
    return res.status(401).json({error:'Onjuist wachtwoord'});
  }
  failures.delete(ip);
  const token=crypto.randomBytes(32).toString('hex');
  sessions.set(token,Date.now()+7*86400000);
  res.set('Set-Cookie','me_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800'+(process.env.NODE_ENV==='production'?'; Secure':''));
  res.json({ok:true});
});
app.post('/api/logout',auth,(req,res)=>{sessions.delete(cookie(req));res.set('Set-Cookie','me_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');res.json({ok:true})});
function snapshot(){const age=state.at===null?null:Math.floor((Date.now()-state.at)/1000);return {connected:state.connected,live:state.connected&&age!==null&&age<=30,age,at:state.at,last:state.last,history:state.history.filter((_,i)=>i%Math.max(1,Math.floor(state.history.length/350))===0).slice(-350),devices:{solar:false,jacuzzi:false,battery:false}}}
app.get('/api/state',auth,(_req,res)=>res.json(snapshot()));
app.use(express.static('public'));
const server=app.listen(Number(process.env.PORT)||3000,()=>console.log('Mijn Energie listening'));
const wss=new WebSocketServer({server,path:'/live'});
wss.on('connection',(ws,req)=>{if(!authed(req)){ws.close(1008,'Login required');return}ws.send(JSON.stringify(snapshot()))});
function broadcast(){const payload=JSON.stringify(snapshot());for(const c of wss.clients)if(c.readyState===1)c.send(payload)}
setInterval(()=>{const now=Date.now();for(const [key,exp] of sessions)if(exp<now)sessions.delete(key);for(const [key,v] of failures)if(v.until<now-86400000)failures.delete(key);broadcast()},10000).unref();
function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
const mqttToken=process.env.MQTT_TOKEN;
if(!mqttToken||mqttToken.startsWith('SET_')) console.warn('MQTT_TOKEN not configured: no live data');
else {
 const client=mqtt.connect('mqtts://'+(process.env.MQTT_HOST||'mqtt.flespi.io')+':'+(Number(process.env.MQTT_PORT)||8883),{username:mqttToken,password:'',clientId:'mijn-energie-'+crypto.randomBytes(6).toString('hex'),reconnectPeriod:5000,connectTimeout:15000});
 client.on('connect',()=>{state.connected=true;client.subscribe(topic,err=>{if(err)console.error('subscribe error',err.message)});broadcast()});
 client.on('close',()=>{state.connected=false;broadcast()});
 client.on('error',e=>console.error('mqtt error',e.message));
 client.on('message',(t,message)=>{
  if(t!==topic)return;
  let obj;try{obj=JSON.parse(message.toString('utf8'))}catch{return}
  if(Array.isArray(obj))obj=obj.find(x=>String(x?.device_CH)==='0');
  if(!obj||typeof obj!=='object')return;
  if(obj.ident && String(obj.ident).toLowerCase().replace(/[^a-f0-9]/g,'')!==mac)return;
  const d={};for(const k of ['PI','PE','CIH','CIL','CEH','CEL','CG'])d[k]=num(obj[k]);
  if(d.PI===null&&d.PE===null&&d.CIH===null&&d.CIL===null&&d.CG===null)return;
  const at=Date.now();state.at=at;state.last=d;state.history.push({at,...d});
  if(state.history.length>8000)state.history=state.history.slice(-8000);
  fs.appendFile(historyFile,JSON.stringify({at,...d})+'\n',()=>{});
  broadcast();
 });
}
