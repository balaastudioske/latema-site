import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, process.env.LATEMA_STATIC_PREVIEW === '1' ? 'dist' : 'public');
const DATA_DIR = join(ROOT, 'data');
const STORE_PATH = join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT || 4173);

const routes = [
  { id: 'kabiria', name: 'Kabiria Service Line', corridor: 'Ngong Road · Adams Arcade · Satellite', stages: ['CBD Ambassador', 'Upper Hill', 'KNH', 'Coptic', 'Ngong Road', 'Adams Arcade', 'Prestige', 'Corner Junction', 'Wanyee', 'Satellite', 'Kabiria / Satellite', 'Kabiria', 'Kabiria Mvisho'] },
  { id: 'kikuyu', name: 'Kikuyu Service Line', corridor: 'Waiyaki Way · Uthiru · Kikuyu', stages: ['CBD Commercial (Stanbank House)', 'Westlands', 'Waiyaki Way', 'Kangemi', 'Uthiru', 'Uthiru Junction – Mariguini', 'Kinoo', 'Muthiga', 'Rungiri', 'Gitaru', 'Kikuyu', 'Kikuyu Main Bus Terminus'] },
  { id: 'gachie', name: 'Gachie Route', corridor: 'CBD · Red Hill · Gachie', stages: ['CBD Lagos Road', 'ABC', 'Red Hill Link Road', 'Gachie Silver', 'Jakai', 'Number Nane'] },
  { id: 'thika', name: 'Thika Road Service Line', corridor: 'CBD · Thika Road · Juja · Makongeni', stages: ['CBD Archives / Ambassador', 'Ngara', 'Muthaiga', 'Roysambu', 'Githurai 45', 'Kahawa Wendani', 'Kahawa Sukari', 'Kamakis', 'Kihunguro', 'Ruiru', 'Gwa-Kairu', 'Kimbo', 'Allsops', 'Matangi', 'Survey', 'Kenyatta Road', 'Juja', 'Juja / Makongeni', 'Witeithie', 'Jomoko', 'CBD Thika', 'Cascade', 'Clay Works', 'Makongeni', 'MKU', 'Bypass'] },
  { id: 'kawangware', name: '46 Kawangware Service Line', corridor: 'Valley Road · Yaya · Kawangware', stages: ['CBD Ambassador', 'Valley Road · DOD · Yaya', 'Valley Arcade', 'Amboseli · Congo', 'Mlango Soko · Myres Kawangware'] },
  { id: 'nakuru', name: 'Nairobi – Nakuru Service Line', corridor: 'Mai Mahiu · Naivasha · Gilgil · Nakuru', stages: ['Nairobi CBD Commercial (Stanbank House)', 'Mai Mahiu', 'Naivasha', 'Gilgil', 'Nakuru · Lions Garden Stall No. 9'] }
];
const corridors = [
  { id:'west', name:'Nairobi West & South-West', routeIds:['kikuyu','kabiria','kawangware'] },
  { id:'north', name:'Nairobi North & Thika Road', routeIds:['gachie','thika'] },
  { id:'nakuru', name:'Nairobi – Nakuru', routeIds:['nakuru'] }
];

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const sessions = new Map();
const otps = new Map();

function passHash(password, salt) { return scryptSync(password, salt, 64).toString('hex'); }
function newUser({ username, name, role, password, station = '', vehicle = '' }) {
  const salt = randomBytes(16).toString('hex');
  return { id: randomBytes(8).toString('hex'), username, name, role, station, vehicle, salt, passwordHash: passHash(password, salt), createdAt: new Date().toISOString() };
}

async function loadStore() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(STORE_PATH)) {
    const store = {
      users: [
        newUser({ username: 'admin', name: 'Latema Admin', role: 'admin', password: 'LatemaDemo26!' }),
        newUser({ username: 'agent-cbd', name: 'CBD Station Agent', role: 'agent', password: 'AgentDemo26!', station: 'CBD Commercial (Stanbank House)' }),
        newUser({ username: 'driver-01', name: 'Driver Demo', role: 'driver', password: 'DriverDemo26!', vehicle: 'KDA 248X' })
      ],
      parcels: [],
      vehicles: [
        { plate: 'KDA 248X', driver: 'Driver Demo', routeId: 'nakuru', status: 'On route', speed: 48, location: 'Naivasha', latitude: -0.7167, longitude: 36.4310, updatedAt: new Date().toISOString(), demo: true },
        { plate: 'KDB 517Q', driver: 'Driver Demo', routeId: 'thika', status: 'At station', speed: 0, location: 'Juja', latitude: -1.1010, longitude: 37.0144, updatedAt: new Date().toISOString(), demo: true }
      ]
    };
    await writeStore(store);
    return store;
  }
  try { return JSON.parse(await readFile(STORE_PATH, 'utf8')); }
  catch { return { users: [], parcels: [], vehicles: [] }; }
}
let store;
async function writeStore(next = store) { await writeFile(STORE_PATH, JSON.stringify(next, null, 2), 'utf8'); }
function safeUser(user) { const { passwordHash, salt, ...publicUser } = user; return publicUser; }
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const i=x.indexOf('='); return [x.slice(0,i), decodeURIComponent(x.slice(i+1))]; }));
}
function getSession(req) { const token = parseCookies(req).latema_session; return token ? sessions.get(token) : null; }
function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error('Request too large'); }
  return raw ? JSON.parse(raw) : {};
}
function requireStaff(req, res, roles = ['admin', 'agent', 'driver']) {
  const session = getSession(req);
  if (!session || !roles.includes(session.role)) { json(res, 401, { error: 'Please sign in to continue.' }); return null; }
  return session;
}
function routeById(id) { return routes.find(route => route.id === id); }
function canonicalPhone(value) { let phone=String(value||'').replace(/\D/g,''); if(phone.startsWith('254'))phone=`0${phone.slice(3)}`; if(phone.length===9&&phone.startsWith('7'))phone=`0${phone}`; return phone; }
function sameStation(a,b) { return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase() || (/^cbd\b/i.test(a||'')&&/^cbd\b/i.test(b||'')); }
function recordVehicleEvent(vehicle,type,stage,at=new Date().toISOString(),speed=vehicle.speed||0) { store.vehicleEvents ||= []; store.vehicleEvents.push({id:randomBytes(6).toString('hex'),plate:vehicle.plate,routeId:vehicle.routeId,driver:vehicle.driver,type,stage,speed:Number(speed)||0,at}); }
function parcelVisibleTo(user, parcel) {
  if (user.role === 'admin') return true;
  if (user.role === 'driver') return parcel.driver === user.name || parcel.vehicle === user.vehicle;
  return [parcel.originStation,parcel.currentStation,parcel.nextStation,parcel.destinationStation].some(stage=>sameStation(stage,user.station));
}
function safeParcel(p) { return { ...p, senderPhone: p.senderPhone, receiverPhone: p.receiverPhone }; }
function recordEvent(parcel, { status, location, note, by, at = new Date().toISOString() }) {
  parcel.status = status;
  parcel.currentStation = location || parcel.currentStation;
  parcel.updatedAt = at;
  parcel.events.push({ id: randomBytes(6).toString('hex'), status, location: location || '', note: note || '', by, at });
}
function coordinatesForStage(stage, routeId) {
  const places = {
    'CBD Commercial (Stanbank House)': [-1.2864, 36.8172], 'CBD Archives / Ambassador': [-1.2864, 36.8172], 'CBD Ambassador': [-1.2864, 36.8172], 'CBD Lagos Road': [-1.2864, 36.8172],
    'Mai Mahiu': [-0.9850, 36.5950], 'Naivasha': [-0.7167, 36.4310], 'Gilgil': [-0.4930, 36.3110], 'Nakuru · Lions Garden Stall No. 9': [-0.3031, 36.0800],
    'Juja': [-1.1010, 37.0144], 'Ruiru': [-1.1480, 36.9600], 'Kikuyu Main Bus Terminus': [-1.2450, 36.6620], 'Kawangware': [-1.2830, 36.7390],
    'Kinoo': [-1.2670, 36.6900], 'Ngong Road': [-1.3000, 36.7800], 'Gachie': [-1.2100, 36.8100]
  };
  if (places[stage]) return places[stage];
  const route = routeById(routeId), idx = route?.stages.indexOf(stage) ?? 0;
  return [-1.28 - idx * 0.012, 36.82 + idx * 0.009];
}

async function handleApi(req, res, url) {
  const path = url.pathname;
  if (req.method === 'GET' && path === '/api/public/config') return json(res, 200, { routes, corridors, phones: ['0791 624 048', '0798 089 167'], socials: ['@latematravellers','LatematravelsLtd'], offices: [{ name: 'Nairobi Office', address: 'Tom Mboya Street, Stanbic House, Ground Floor' }, { name: 'Nakuru Parcel Office', address: 'Lions Garden Stall No. 9, Mburu Gichua Road, opposite Nakuru Town Total Petrol Station' }] });
  if (req.method === 'GET' && path === '/api/session') { const session=getSession(req); return json(res, 200, { user: session ? session.user : null }); }
  if (req.method === 'POST' && path === '/api/login') {
    const input = await body(req), user = store.users.find(u => u.username.toLowerCase() === String(input.username || '').trim().toLowerCase());
    let valid = false;
    if (user && typeof input.password === 'string') { const candidate=Buffer.from(passHash(input.password, user.salt), 'hex'), expected=Buffer.from(user.passwordHash, 'hex'); valid=candidate.length===expected.length && timingSafeEqual(candidate, expected); }
    if (!valid) return json(res, 401, { error: 'Username or password is incorrect.' });
    const token = randomBytes(32).toString('hex'); const publicUser=safeUser(user); sessions.set(token, { role:user.role, user:publicUser, phone:null });
    res.setHeader('Set-Cookie', `latema_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
    return json(res, 200, { user:publicUser });
  }
  if (req.method === 'POST' && path === '/api/logout') {
    const token=parseCookies(req).latema_session; if(token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'latema_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); return json(res, 200, { ok:true });
  }
  if(req.method==='POST'&&path==='/api/enquiries'){
    const input=await body(req),type=String(input.type||'').trim();
    if(!['parcel_info','tracking_help','contact'].includes(type))return json(res,400,{error:'Choose a valid enquiry type.'});
    const phone=canonicalPhone(input.phone||input.senderPhone);
    if(phone.length<9||phone.length>13)return json(res,400,{error:'Enter a valid contact phone number.'});
    if(type==='parcel_info'&&['senderName','senderPhone','recipientName','recipientPhone','description','sizeWeight','destination','dropoff'].some(key=>!String(input[key]||'').trim()))return json(res,400,{error:'Complete all sender, recipient, parcel, destination, and drop-off fields.'});
    if(type==='contact'&&(!String(input.name||'').trim()||!String(input.category||'').trim()||!String(input.message||'').trim()))return json(res,400,{error:'Enter your name, enquiry topic, and message.'});
    store.enquiries ||= [];
    const enquiry={id:`LE-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`,type,status:'New',createdAt:new Date().toISOString(),name:String(input.senderName||input.name||'').trim().slice(0,100),phone,recipientName:String(input.recipientName||'').trim().slice(0,100),recipientPhone:canonicalPhone(input.recipientPhone).slice(0,13),description:String(input.description||'').trim().slice(0,300),sizeWeight:String(input.sizeWeight||'').trim().slice(0,100),destination:String(input.destination||'').trim().slice(0,150),dropoff:String(input.dropoff||'').trim().slice(0,150),reference:String(input.reference||'').trim().slice(0,80),category:String(input.category||'').trim().slice(0,80),message:String(input.message||'').trim().slice(0,500)};
    store.enquiries.unshift(enquiry);await writeStore();return json(res,201,{enquiry:{id:enquiry.id,status:enquiry.status,createdAt:enquiry.createdAt}});
  }
  const enquiryStatusMatch=path.match(/^\/api\/enquiries\/([^/]+)\/status$/);
  if(req.method==='POST'&&enquiryStatusMatch){
    const session=requireStaff(req,res,['admin']);if(!session)return;
    const enquiry=(store.enquiries||[]).find(item=>item.id===decodeURIComponent(enquiryStatusMatch[1]));if(!enquiry)return json(res,404,{error:'Enquiry not found.'});
    const input=await body(req);if(!['New','Contacted','Resolved'].includes(input.status))return json(res,400,{error:'Choose a valid enquiry status.'});
    enquiry.status=input.status;enquiry.handledAt=new Date().toISOString();enquiry.handledBy=session.user.name;await writeStore();return json(res,200,{enquiry});
  }
  if (req.method === 'POST' && path === '/api/customer/request-code') {
    const input=await body(req), phone=canonicalPhone(input.phone);
    if (phone.length < 9 || phone.length > 13) return json(res, 400, { error:'Enter a valid phone number.' });
    const code='246810'; otps.set(phone, { code, expires:Date.now()+5*60*1000 }); return json(res, 200, { ok:true, demoCode:code });
  }
  if (req.method === 'POST' && path === '/api/customer/verify') {
    const input=await body(req), phone=canonicalPhone(input.phone), otp=otps.get(phone);
    if (!otp || otp.expires < Date.now() || otp.code !== String(input.code || '')) return json(res, 401, { error:'That verification code has expired or is incorrect.' });
    otps.delete(phone); const token=randomBytes(32).toString('hex'); sessions.set(token,{role:'customer',user:null,phone});
    res.setHeader('Set-Cookie',`latema_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800`); return json(res,200,{ok:true});
  }
  if (req.method === 'GET' && path === '/api/customer/parcels') {
    const session=getSession(req); if(!session || session.role!=='customer') return json(res,401,{error:'Verify your phone number to see parcels.'});
    const parcels=store.parcels.filter(p => p.senderPhone === session.phone || p.receiverPhone === session.phone).map(p => ({...safeParcel(p), senderPhone:undefined, receiverPhone:undefined}));
    const parcelPlates=new Set(parcels.map(parcel=>parcel.vehicle));
    const vehicles=store.vehicles.filter(v=>parcelPlates.has(v.plate)).map(v => ({plate:v.plate,routeId:v.routeId,status:v.status,speed:v.speed,location:v.location,latitude:v.latitude,longitude:v.longitude,updatedAt:v.updatedAt,demo:v.demo}));
    return json(res,200,{parcels,vehicles,routes});
  }
  if (req.method === 'GET' && path === '/api/staff/overview') {
    const session=requireStaff(req,res); if(!session)return;
    const user=session.user, parcels=store.parcels.filter(p=>parcelVisibleTo(user,p));
    if(user.role==='driver') return json(res,200,{user,parcels,vehicles:store.vehicles.filter(v=>v.plate===user.vehicle),routes,activeTrip:(store.trips||[]).find(t=>t.plate===user.vehicle&&!t.completedAt)||null});
    return json(res,200,{user,parcels,vehicles:store.vehicles,routes,users:user.role==='admin'?store.users.map(safeUser):undefined,enquiries:user.role==='admin'?(store.enquiries||[]):undefined});
  }
  if (req.method === 'POST' && path === '/api/parcels') {
    const session=requireStaff(req,res,['agent']); if(!session)return;
    const input=await body(req), route=routeById(input.routeId);
    const required=['senderName','senderPhone','receiverName','receiverPhone','routeId','originStation','destinationStation','driver','vehicle','description'];
    const missing=required.filter(k=>!String(input[k]||'').trim());
    if(missing.length) return json(res,400,{error:`Please complete: ${missing.join(', ')}.`});
    if(!route || !route.stages.some(s=>sameStation(s,input.originStation)) || !route.stages.some(s=>sameStation(s,input.destinationStation))) return json(res,400,{error:'Choose origin and destination stages on the selected company route.'});
    if(route.stages.findIndex(s=>sameStation(s,input.originStation))>=route.stages.findIndex(s=>sameStation(s,input.destinationStation))) return json(res,400,{error:'Choose a destination that follows the origin on the fixed route.'});
    if(session.role==='agent'&&!sameStation(session.user.station,input.originStation))return json(res,403,{error:'Your account can record parcels only at its assigned station.'});
    const originIndex=route.stages.findIndex(s=>sameStation(s,input.originStation)),destinationIndex=route.stages.findIndex(s=>sameStation(s,input.destinationStation));
    const parcel={id:`LT-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`,senderName:String(input.senderName).trim(),senderPhone:canonicalPhone(input.senderPhone),receiverName:String(input.receiverName).trim(),receiverPhone:canonicalPhone(input.receiverPhone),routeId:route.id,routeName:route.name,originStation:input.originStation,destinationStation:input.destinationStation,currentStation:input.originStation,nextStation:route.stages[originIndex+1]||null,destinationIndex,driver:String(input.driver).trim(),vehicle:String(input.vehicle).trim().toUpperCase(),description:String(input.description).trim(),status:'Parcel recorded',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),events:[]};
    recordEvent(parcel,{status:'Parcel recorded',location:parcel.originStation,note:'Parcel received and registered at station.',by:session.user.name}); store.parcels.unshift(parcel); await writeStore();
    return json(res,201,{parcel});
  }
  const eventMatch=path.match(/^\/api\/parcels\/([^/]+)\/event$/);
  if(req.method==='POST' && eventMatch){
    const session=requireStaff(req,res);if(!session)return;
    const parcel=store.parcels.find(p=>p.id===decodeURIComponent(eventMatch[1]));if(!parcel)return json(res,404,{error:'Parcel not found.'});
    if(!parcelVisibleTo(session.user,parcel))return json(res,403,{error:'This parcel is outside your assigned work.'});
    const input=await body(req), allowed=['Collected by driver','Received at station','Departed station','Ready for pickup','Delivered','Delay reported'];
    if(!allowed.includes(input.status))return json(res,400,{error:'Choose a valid parcel update.'});
    let location=String(input.location || parcel.currentStation).trim();
    const route=routeById(parcel.routeId),atIndex=route?.stages.findIndex(s=>sameStation(s,location))??-1;
    if(atIndex<0)return json(res,400,{error:'Choose a station on the parcel’s company corridor.'});
    if(session.role==='driver'&&input.status==='Received at station'&&parcel.nextStation&&!sameStation(location,parcel.nextStation))return json(res,400,{error:'Confirm this parcel at its next listed station.'});
    if(session.role==='agent' && !sameStation(location,session.user.station))return json(res,403,{error:'Agents can record updates for their assigned station.'});
    if(session.role==='driver' && parcel.driver!==session.user.name && parcel.vehicle!==session.user.vehicle)return json(res,403,{error:'This parcel is not assigned to your trip.'});
    recordEvent(parcel,{status:input.status,location,note:String(input.note||'').trim(),by:session.user.name});
    if(input.status==='Received at station'||input.status==='Ready for pickup'){
      parcel.nextStation=atIndex<parcel.destinationIndex?route.stages[atIndex+1]||null:null;
    }
    const vehicle=store.vehicles.find(v=>v.plate===parcel.vehicle);
    if(vehicle&&['Departed station','Received at station','Ready for pickup'].includes(input.status)){if(input.status==='Departed station'){vehicle.status='On route';recordVehicleEvent(vehicle,'departed',location,parcel.updatedAt,vehicle.speed);}else{vehicle.location=location;if(input.status==='Ready for pickup')vehicle.status='At station';recordVehicleEvent(vehicle,'arrived',location,parcel.updatedAt,0);}}
    if(input.latitude && input.longitude&&vehicle){vehicle.latitude=Number(input.latitude);vehicle.longitude=Number(input.longitude);vehicle.location=location;vehicle.updatedAt=new Date().toISOString();vehicle.status='On route';vehicle.demo=false;}
    await writeStore();return json(res,200,{parcel});
  }
  if(req.method==='POST' && path==='/api/vehicles/location'){
    const session=requireStaff(req,res,['admin','driver']);if(!session)return;
    const input=await body(req), vehicle=store.vehicles.find(v=>v.plate===String(input.plate||'').toUpperCase());
    if(!vehicle)return json(res,404,{error:'Vehicle is not registered.'});
    if(session.role==='driver' && vehicle.plate!==session.user.vehicle)return json(res,403,{error:'This vehicle is not assigned to your account.'});
    vehicle.latitude=Number(input.latitude);vehicle.longitude=Number(input.longitude);vehicle.speed=Math.max(0,Number(input.speed||0));vehicle.location=String(input.location||'On route');vehicle.status=vehicle.speed>0?'On route':'At station';vehicle.updatedAt=new Date().toISOString();vehicle.demo=false;recordVehicleEvent(vehicle,'location',vehicle.location,vehicle.updatedAt,vehicle.speed);
    await writeStore();return json(res,200,{vehicle});
  }
  if(req.method==='POST' && path==='/api/users'){
    const session=requireStaff(req,res,['admin']);if(!session)return;
    const input=await body(req), role=['agent','driver'].includes(input.role)?input.role:'';
    const username=String(input.username||'').trim().toLowerCase(), name=String(input.name||'').trim();
    if(!role || !username || !name)return json(res,400,{error:'Enter a name, username, and valid staff role.'});
    if(role==='agent'&&!String(input.station||'').trim())return json(res,400,{error:'Choose the agent’s assigned station.'});
    if(role==='driver'&&!store.vehicles.some(v=>v.plate===String(input.vehicle||'').toUpperCase()))return json(res,400,{error:'Choose a vehicle already registered in the fleet.'});
    if(store.users.some(u=>u.username===username))return json(res,409,{error:'That username is already in use.'});
    const temporaryPassword=`Lt${randomBytes(5).toString('hex')}!`;
    const user=newUser({username,name,role,password:temporaryPassword,station:String(input.station||''),vehicle:String(input.vehicle||'').toUpperCase()});
    store.users.push(user);await writeStore();return json(res,201,{user:safeUser(user),temporaryPassword});
  }
  if(req.method==='POST' && path==='/api/trips'){
    const session=requireStaff(req,res,['driver']);if(!session)return;
    const vehicle=store.vehicles.find(v=>v.plate===session.user.vehicle);if(!vehicle)return json(res,404,{error:'No vehicle is attached to your account.'});
    const input=await body(req);store.trips ||= [];
    if(input.action==='start'){
      if(store.trips.some(t=>t.plate===vehicle.plate&&!t.completedAt))return json(res,409,{error:'A route round is already active for this vehicle.'});
      const trip={id:randomBytes(6).toString('hex'),plate:vehicle.plate,driver:session.user.name,routeId:vehicle.routeId,startedAt:new Date().toISOString(),completedAt:null};
      store.trips.push(trip);vehicle.status='On route';vehicle.updatedAt=trip.startedAt;recordVehicleEvent(vehicle,'departed',vehicle.location,trip.startedAt,vehicle.speed);await writeStore();return json(res,201,{trip});
    }
    if(input.action==='complete'){
      const trip=[...store.trips].reverse().find(t=>t.plate===vehicle.plate&&!t.completedAt);if(!trip)return json(res,409,{error:'There is no active round to complete.'});
      trip.completedAt=new Date().toISOString();vehicle.status='At station';vehicle.speed=0;vehicle.updatedAt=trip.completedAt;recordVehicleEvent(vehicle,'arrived',vehicle.location,trip.completedAt,0);await writeStore();return json(res,200,{trip});
    }
    return json(res,400,{error:'Choose start or complete.'});
  }
  if(req.method==='GET' && path==='/api/admin/analytics'){
    const session=requireStaff(req,res,['admin']);if(!session)return;
    const stageTotals={},routeTotals={},rounds={};let roadMinutes=0,waitMinutes=0,speedTotal=0,speedSamples=0;
    for(const p of store.parcels){const group=corridors.find(c=>c.routeIds.includes(p.routeId));if(group)routeTotals[group.id]=(routeTotals[group.id]||0)+1;}
    const vehicleEvents=[...(store.vehicleEvents||[])].sort((a,b)=>new Date(a.at)-new Date(b.at));
    for(const event of vehicleEvents)if(event.speed>0){speedTotal+=event.speed;speedSamples++;}
    const lastByVehicle={};
    for(const event of vehicleEvents){const prior=lastByVehicle[event.plate]||{};if(event.type==='arrived'){if(prior.departure){roadMinutes+=Math.max(0,(new Date(event.at)-new Date(prior.departure.at))/60000);prior.departure=null;}prior.arrival=event;}else if(event.type==='departed'){if(prior.arrival){const dwell=Math.max(0,(new Date(event.at)-new Date(prior.arrival.at))/60000);waitMinutes+=dwell;stageTotals[prior.arrival.stage]=(stageTotals[prior.arrival.stage]||0)+dwell;}prior.departure=event;}lastByVehicle[event.plate]=prior;}
    for(const trip of store.trips||[])if(trip.completedAt)rounds[trip.plate]=(rounds[trip.plate]||0)+1;
    const avgTransit=store.parcels.length?store.parcels.reduce((sum,p)=>sum+(new Date(p.updatedAt)-new Date(p.createdAt))/60000,0)/store.parcels.length:0;
    return json(res,200,{parcelCount:store.parcels.length,staffCount:store.users.length-1,vehicles:store.vehicles.map(v=>({...v,rounds:rounds[v.plate]||0})),byRoute:Object.entries(routeTotals).map(([id,count])=>({route:corridors.find(c=>c.id===id)?.name||id,count})),roadMinutes:Math.round(roadMinutes),waitMinutes:Math.round(waitMinutes),averageSpeed:speedSamples?Math.round(speedTotal/speedSamples):0,averageParcelMinutes:Math.round(avgTransit),stageMinutes:stageTotals,delayed:store.parcels.filter(p=>p.status==='Delay reported').length,departures:vehicleEvents.filter(e=>e.type==='departed').slice(-10).reverse()});
  }
  if(req.method==='GET' && path==='/api/routes')return json(res,200,{routes});
  return json(res,404,{error:'API endpoint not found.'});
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/'))return await handleApi(req,res,url);
    const pageRoutes=['/routes','/routes/','/stages','/stages/','/parcels','/parcels/','/track','/track/','/about','/about/','/gallery','/gallery/','/contact','/contact/'];
    let pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname==='/staff'||url.pathname==='/staff/'?'/staff.html':pageRoutes.includes(url.pathname)?'/index.html':url.pathname);
    const target=normalize(join(PUBLIC,pathname));if(!target.startsWith(PUBLIC))return json(res,403,{error:'Forbidden'});
    let content;try{content=await readFile(target);}catch{return json(res,404,{error:'Page not found.'});}
    res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(content);
  }catch(error){console.error(error);if(!res.headersSent)json(res,500,{error:'The local server could not complete that request.'});}
});

store=await loadStore();
server.listen(PORT,'127.0.0.1',()=>console.log(`Latema Travels running at http://localhost:${PORT}`));
