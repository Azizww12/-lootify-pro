require('dotenv').config();
const express=require('express'),fs=require('fs'),path=require('path'),QR=require('qrcode'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),
 cookie=require('cookie-parser'),helmet=require('helmet'),rate=require('express-rate-limit'),crypto=require('crypto');
const E=process.env,PROD=E.NODE_ENV==='production';
const ADMIN_EMAIL=(E.ADMIN_EMAIL||'azzizeachouri@gmail.com').toLowerCase(),ADMIN_PW=E.ADMIN_PASSWORD||'';
if(ADMIN_PW.length<10||ADMIN_PW==='admin123')throw new Error('Set ADMIN_PASSWORD (10+ chars) in .env');
if(PROD&&(!E.JWT_SECRET||E.JWT_SECRET.length<32))throw new Error('Production needs JWT_SECRET (32+ chars) in .env');
const SECRET=E.JWT_SECRET||'dev-only-secret',ADMIN_HASH=bcrypt.hashSync(ADMIN_PW,10);
const stripe=E.STRIPE_SECRET_KEY?require('stripe')(E.STRIPE_SECRET_KEY):null;
const DB=E.DATA_FILE||'data.json',db=fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB)):{orders:{},users:{}};
const save=()=>{fs.writeFileSync(DB+'.tmp',JSON.stringify(db));fs.renameSync(DB+'.tmp',DB)};
const r2=x=>Math.round(x*100)/100;
const SEED={ // prices always come from here
 ff:{name:'Free Fire',icon:'🔥',packs:[['100 💎',1],['310 💎',3],['520 💎',5],['1060 💎',10]]},
 pubg:{name:'PUBG Mobile',icon:'🎯',packs:[['60 UC',1],['325 UC',5],['660 UC',10],['1800 UC',25]]},
 mlbb:{name:'Mobile Legends',icon:'🛡️',packs:[['86 💎',2],['172 💎',4],['429 💎',10],['878 💎',20]]},
 val:{name:'Valorant',icon:'💥',packs:[['475 VP',5],['1000 VP',10],['2050 VP',20],['3650 VP',35]]},
 gen:{name:'Genshin Impact',icon:'⚔️',packs:[['60 Crystals',1],['330 Crystals',5],['1090 Crystals',15],['2240 Crystals',30]]},
 roblox:{name:'Roblox',icon:'🧱',packs:[['400 Robux',5],['800 Robux',10],['1700 Robux',20],['4500 Robux',50]]}};
const fin=k=>r2(k.price*(1-k.discount/100));
if(!db.products){db.products={};for(const[id,g]of Object.entries(SEED))db.products[id]={id,name:g.name,icon:g.icon,image:'',active:true,packs:g.packs.map((k,i)=>({id:'p'+(i+1),label:k[0],price:k[1],discount:0}))};save()}
function cleanProduct(b,id){
 const name=String(b.name||'').trim().slice(0,60);if(!name)throw 'Game name is required';
 const img=String(b.image||'').trim();if(img&&!/^(https:\/\/|\/)[^\s"'<>]+$/.test(img))throw 'Image must be an https:// URL or a /path';
 const seen=new Set(),packs=(Array.isArray(b.packs)?b.packs:[]).slice(0,30).map(k=>{
  const label=String(k.label||'').trim().slice(0,40),price=r2(+k.price),d=Math.round(+k.discount||0);
  if(!label)throw 'Every package needs a label';
  if(!(price>=0.01&&price<=10000))throw 'Invalid price for '+label;
  if(d<0||d>90)throw 'Discount must be 0-90% for '+label;
  if(fin({price,discount:d})<0.01)throw 'Final price too low for '+label;
  let pid=/^[a-z0-9]{2,12}$/.test(k.id||'')?k.id:'';while(!pid||seen.has(pid))pid=crypto.randomBytes(3).toString('hex');seen.add(pid);
  return{id:pid,label,price,discount:d}});
 if(!packs.length)throw 'Add at least one package';
 return{id,name,icon:String(b.icon||'🎮').slice(0,8),image:img,active:b.active!==false,packs}}
const app=express();app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{
 'script-src':["'self'","'unsafe-inline'",'https://js.stripe.com','https://www.paypal.com'],'script-src-attr':["'unsafe-inline'"],
 'frame-src':['https://js.stripe.com','https://hooks.stripe.com','https://www.paypal.com'],
 'connect-src':["'self'",'https://api.stripe.com','https://www.paypal.com'],
 'img-src':["'self'",'data:','https:']}}}));

/* ---------- helpers ---------- */
const ck={httpOnly:true,sameSite:'lax',secure:PROD,maxAge:30*864e5};
const getUser=q=>{try{return db.users[jwt.verify(q.cookies.tok,SECRET).uid]}catch(e){}};
const needUser=(q,r,n)=>(q.user=getUser(q))?n():r.status(401).json({error:'login'});
const isAdmin=q=>{try{return jwt.verify(q.cookies.adm,SECRET+'adm').role==='admin'}catch(e){return false}};
const needAdmin=(q,r,n)=>isAdmin(q)?n():r.status(401).json({error:'admin'});
const pubU=u=>({id:u.id,email:u.email,name:u.name,refCode:u.refCode,points:u.points,balance:u.balance,provider:u.provider});
const pub=o=>({id:o.id,game:o.game,pack:o.pack,total:o.total,status:o.status,method:o.method,createdAt:o.createdAt,paidAt:o.paidAt,deliveredAt:o.deliveredAt});
function newUser(o,ref){
 const u={id:crypto.randomUUID(),email:o.email,name:o.name||o.email.split('@')[0],hash:o.hash,provider:o.provider||'local',
  refCode:crypto.randomBytes(4).toString('hex').toUpperCase(),points:0,balance:0,createdAt:Date.now()};
 const rf=ref&&Object.values(db.users).find(x=>x.refCode===ref);if(rf&&rf.email!==u.email)u.referredBy=rf.id;
 db.users[u.id]=u;save();return u}
const session=(r,u)=>r.cookie('tok',jwt.sign({uid:u.id},SECRET,{expiresIn:'30d'}),ck);
function markPaid(o,method,ref){
 if(!o||o.status!=='pending')return;
 Object.assign(o,{status:'paid',method,payRef:ref,paidAt:Date.now()});
 const u=db.users[o.userId],rf=u&&u.referredBy&&db.users[u.referredBy];
 if(rf&&!u.refRewarded&&o.total>=1){rf.points+=+(E.REF_REWARD||100);u.refRewarded=true} // reward only for real-money first purchase
 save();
 if(E.DELIVERY_MODE==='auto')setTimeout(()=>{o.status='delivered';o.deliveredAt=Date.now();save()},8000);
 /* else: call your top-up supplier API here, then set o.status='delivered' */}

/* ---------- Stripe webhook (raw body first) ---------- */
app.post('/webhook/stripe',express.raw({type:'application/json'}),(req,res)=>{
 let ev;try{ev=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],E.STRIPE_WEBHOOK_SECRET)}catch(e){return res.status(400).send('bad signature')}
 if(ev.type==='payment_intent.succeeded'){const pi=ev.data.object;markPaid(db.orders[pi.metadata.orderId],'stripe',pi.id)}
 res.json({ok:true})});
app.use(express.json({limit:'50kb'}),cookie());
app.use((q,r,n)=>{if(/^[A-Za-z0-9]{6,10}$/.test(q.query.ref||''))r.cookie('ref',q.query.ref.toUpperCase(),{maxAge:30*864e5,sameSite:'lax'});n()});
app.get('/admin/login',(q,r)=>r.sendFile(path.join(__dirname,'public/admin-login.html')));
app.get('/admin',(q,r)=>isAdmin(q)?r.sendFile(path.join(__dirname,'public/admin.html')):r.redirect('/admin/login'));
app.use(express.static(path.join(__dirname,'public')));

/* ---------- public config ---------- */
let RATES={USD:1};try{RATES=JSON.parse(E.RATES)}catch(e){RATES={USD:1,EUR:.92,DZD:134,SAR:3.75,MAD:10}}
const OA={google:{auth:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',info:'https://openidconnect.googleapis.com/v1/userinfo',scope:'openid email profile',id:E.GOOGLE_CLIENT_ID,sec:E.GOOGLE_CLIENT_SECRET},
 discord:{auth:'https://discord.com/oauth2/authorize',token:'https://discord.com/api/oauth2/token',info:'https://discord.com/api/users/@me',scope:'identify email',id:E.DISCORD_CLIENT_ID,sec:E.DISCORD_CLIENT_SECRET}};
app.get('/api/config',(q,r)=>r.json({rates:RATES,stripePk:E.STRIPE_PUBLISHABLE_KEY,paypalId:E.PAYPAL_CLIENT_ID,providers:Object.keys(OA).filter(k=>OA[k].id)}));
app.get('/api/catalog',(q,r)=>{r.set('Cache-Control','no-store');r.json(Object.values(db.products).filter(p=>p.active).map(p=>({id:p.id,name:p.name,icon:p.icon,image:p.image,packs:p.packs.map(k=>({id:k.id,label:k.label,price:k.price,discount:k.discount,final:fin(k)}))})))});

/* ---------- auth ---------- */
const lim=rate({windowMs:15*60e3,max:40,standardHeaders:true,legacyHeaders:false});
app.post('/api/auth/register',lim,(q,r)=>{
 const{email,password,name}=q.body,e=String(email||'').trim().toLowerCase();
 if(!/^\S+@\S+\.\S+$/.test(e)||String(password||'').length<8)return r.status(400).json({error:'Invalid email or password (min 8 chars)'});
 if(Object.values(db.users).some(u=>u.email===e))return r.status(409).json({error:'Email already registered'});
 const u=newUser({email:e,name:String(name||'').slice(0,40),hash:bcrypt.hashSync(password,10)},q.cookies.ref);session(r,u);r.json({user:pubU(u)})});
app.post('/api/auth/login',lim,(q,r)=>{
 const e=String(q.body.email||'').trim().toLowerCase(),u=Object.values(db.users).find(x=>x.email===e&&x.hash);
 if(!u||!bcrypt.compareSync(String(q.body.password||''),u.hash))return r.status(401).json({error:'Wrong email or password'});
 session(r,u);r.json({user:pubU(u)})});
app.post('/api/auth/logout',(q,r)=>{r.clearCookie('tok');r.json({ok:true})});
app.get('/api/me',(q,r)=>{const u=getUser(q);r.json({user:u?pubU(u):null})});
app.get('/auth/:p',(q,r)=>{const p=OA[q.params.p];if(!p||!p.id)return r.redirect('/');
 const st=crypto.randomBytes(16).toString('hex');r.cookie('st',st,{httpOnly:true,sameSite:'lax',secure:PROD,maxAge:6e5});
 r.redirect(p.auth+'?'+new URLSearchParams({client_id:p.id,redirect_uri:E.BASE_URL+'/auth/'+q.params.p+'/callback',response_type:'code',scope:p.scope,state:st}))});
app.get('/auth/:p/callback',async(q,r)=>{try{
 const p=OA[q.params.p];if(!p||!q.query.code||!q.cookies.st||q.query.state!==q.cookies.st)throw 0;
 const tk=await fetch(p.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:p.id,client_secret:p.sec,code:q.query.code,grant_type:'authorization_code',redirect_uri:E.BASE_URL+'/auth/'+q.params.p+'/callback'})}).then(x=>x.json());
 const i=await fetch(p.info,{headers:{Authorization:'Bearer '+tk.access_token}}).then(x=>x.json());
 const e=String(i.email||'').toLowerCase();if(!e||i.email_verified===false||i.verified===false)throw 0;
 const u=Object.values(db.users).find(x=>x.email===e)||newUser({email:e,name:i.name||i.username,provider:q.params.p},q.cookies.ref);
 session(r,u);r.redirect('/')}catch(e){r.redirect('/?auth=failed')}});

/* ---------- referral / points ---------- */
app.post('/api/redeem',needUser,(q,r)=>{const u=q.user,n=Math.floor(u.points/100);if(!n)return r.status(400).json({error:'Need 100 points'});
 u.points-=n*100;u.balance=r2(u.balance+n);save();r.json({user:pubU(u)})}); // 100 points = $1

/* ---------- orders ---------- */
app.post('/api/orders',needUser,(q,r)=>{
 const{game,pack,playerId,useBalance}=q.body,g=db.products[game],p=g&&g.active&&g.packs.find(k=>k.id===pack),pr=p&&fin(p);
 if(!p||!playerId||String(playerId).length>40)return r.status(400).json({error:'invalid order'});
 const u=q.user,used=useBalance?Math.min(u.balance,pr):0,id=crypto.randomBytes(4).toString('hex').toUpperCase();
 const o=db.orders[id]={id,userId:u.id,game:g.name,pack:p.label,price:pr,balanceUsed:used,total:r2(pr-used),playerId:String(playerId),status:'pending',createdAt:Date.now()};
 u.balance=r2(u.balance-used);save();if(o.total===0)markPaid(o,'balance','balance');r.json(pub(o))});
app.get('/api/orders/:id',(q,r)=>db.orders[q.params.id]?r.json(pub(db.orders[q.params.id])):r.status(404).json({error:'not found'}));
app.get('/api/my/orders',needUser,(q,r)=>r.json(Object.values(db.orders).filter(o=>o.userId===q.user.id).sort((a,b)=>b.createdAt-a.createdAt).map(pub)));
const payable=(q,r,n)=>{const o=db.orders[q.params.id];if(o&&o.status==='pending'&&o.total>0)return n();r.status(409).json({error:'order not payable'})};

/* Stripe: card + Apple Pay + Google Pay */
app.post('/api/orders/:id/stripe',payable,async(q,r)=>{if(!stripe)return r.status(503).json({error:'Stripe not configured'});const o=db.orders[q.params.id];
 const pi=await stripe.paymentIntents.create({amount:Math.round(o.total*100),currency:'usd',automatic_payment_methods:{enabled:true},metadata:{orderId:o.id}});r.json({clientSecret:pi.client_secret})});
/* PayPal */
const PP=E.PAYPAL_ENV==='sandbox'?'https://api-m.sandbox.paypal.com':'https://api-m.paypal.com';
async function ppFetch(p,body){const tok=await fetch(PP+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(E.PAYPAL_CLIENT_ID+':'+E.PAYPAL_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'}).then(x=>x.json());
 return fetch(PP+p,{method:'POST',headers:{Authorization:'Bearer '+tok.access_token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}).then(x=>x.json())}
app.post('/api/orders/:id/paypal/create',payable,async(q,r)=>{const o=db.orders[q.params.id];
 r.json(await ppFetch('/v2/checkout/orders',{intent:'CAPTURE',purchase_units:[{reference_id:o.id,amount:{currency_code:'USD',value:o.total.toFixed(2)}}]}))});
app.post('/api/orders/:id/paypal/capture',payable,async(q,r)=>{const o=db.orders[q.params.id];
 const c=await ppFetch(`/v2/checkout/orders/${encodeURIComponent(q.body.paypalOrderId)}/capture`),pu=c.purchase_units&&c.purchase_units[0],cap=pu&&pu.payments.captures[0];
 if(c.status==='COMPLETED'&&cap&&pu.reference_id===o.id&&+cap.amount.value===o.total)markPaid(o,'paypal',cap.id);r.json(pub(o))});
/* Crypto: USDT TRC20, unique amount per order, polled on-chain */
const USDT='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
app.post('/api/orders/:id/crypto',payable,async(q,r)=>{const o=db.orders[q.params.id];if(!E.USDT_TRC20_ADDRESS)return r.status(503).json({error:'Crypto not configured'});
 if(!o.cryptoAmount){let a;do{a=(o.total+(1+Math.floor(Math.random()*899))/10000).toFixed(4)}while(Object.values(db.orders).some(x=>x.status==='pending'&&x.cryptoAmount===a));o.cryptoAmount=a;o.cryptoUntil=Date.now()+30*60e3;save()}
 r.json({address:E.USDT_TRC20_ADDRESS,amount:o.cryptoAmount,expiresAt:o.cryptoUntil,qr:await QR.toDataURL(E.USDT_TRC20_ADDRESS,{margin:1,width:240})})});
setInterval(async()=>{const pend=Object.values(db.orders).filter(o=>o.status==='pending'&&o.cryptoAmount&&o.cryptoUntil>Date.now());if(!pend.length||!E.USDT_TRC20_ADDRESS)return;
 try{const x=await fetch(`https://api.trongrid.io/v1/accounts/${E.USDT_TRC20_ADDRESS}/transactions/trc20?only_to=true&only_confirmed=true&limit=50&contract_address=${USDT}`,{headers:{'TRON-PRO-API-KEY':E.TRONGRID_API_KEY||''}}).then(y=>y.json());
  for(const tx of x.data||[]){const v=(+tx.value/1e6).toFixed(4),o=pend.find(z=>z.cryptoAmount===v&&tx.block_timestamp>=z.createdAt);if(o)markPaid(o,'usdt-trc20',tx.transaction_id)}}catch(e){console.error('tron',e.message)}},15000);

/* ---------- admin ---------- */
app.post('/api/admin/login',lim,(q,r)=>{
 if(String(q.body.email||'').toLowerCase()===ADMIN_EMAIL&&bcrypt.compareSync(String(q.body.password||''),ADMIN_HASH)){
  r.cookie('adm',jwt.sign({role:'admin'},SECRET+'adm',{expiresIn:'8h'}),{...ck,maxAge:8*36e5});return r.json({ok:true})}
 r.status(401).json({error:'Wrong credentials'})});
app.post('/api/admin/logout',(q,r)=>{r.clearCookie('adm');r.json({ok:true})});
app.get('/api/admin/stats',needAdmin,(q,r)=>{const o=Object.values(db.orders),ok=o.filter(x=>x.status==='paid'||x.status==='delivered');
 r.json({revenue:r2(ok.reduce((a,x)=>a+x.price,0)),cash:r2(ok.reduce((a,x)=>a+x.total,0)),orders:o.length,users:Object.keys(db.users).length,toDeliver:o.filter(x=>x.status==='paid').length})});
app.get('/api/admin/orders',needAdmin,(q,r)=>r.json(Object.values(db.orders).sort((a,b)=>b.createdAt-a.createdAt).map(o=>({...pub(o),email:(db.users[o.userId]||{}).email,playerId:o.playerId}))));
app.post('/api/admin/orders/:id/deliver',needAdmin,(q,r)=>{const o=db.orders[q.params.id];if(!o||o.status!=='paid')return r.status(409).end();o.status='delivered';o.deliveredAt=Date.now();save();r.json(pub(o))});
app.post('/api/admin/orders/:id/cancel',needAdmin,(q,r)=>{const o=db.orders[q.params.id];if(!o||o.status!=='pending')return r.status(409).end();
 o.status='cancelled';if(o.balanceUsed&&db.users[o.userId])db.users[o.userId].balance=r2(db.users[o.userId].balance+o.balanceUsed);save();r.json(pub(o))});
app.get('/api/admin/users',needAdmin,(q,r)=>r.json(Object.values(db.users).map(u=>({...pubU(u),referredBy:u.referredBy&&(db.users[u.referredBy]||{}).email,createdAt:u.createdAt}))));
app.post('/api/admin/users/:id/points',needAdmin,(q,r)=>{const u=db.users[q.params.id],d=parseInt(q.body.delta);if(!u||!d)return r.status(400).end();u.points=Math.max(0,u.points+d);save();r.json(pubU(u))});
app.get('/api/admin/payout-details',needAdmin,(q,r)=>r.json({okx:E.OKX_UID,paypal:E.PAYPAL_ACCOUNT_EMAIL,iban:E.BANK_IBAN}));

app.get('/api/admin/products',needAdmin,(q,r)=>r.json(Object.values(db.products)));
app.post('/api/admin/products',needAdmin,(q,r)=>{try{
 const ex=q.body.id&&db.products[q.body.id],name=String(q.body.name||'').trim(),
  id=ex?q.body.id:((name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,20)||'game')+'-'+crypto.randomBytes(2).toString('hex'));
 db.products[id]=cleanProduct(q.body,id);save();r.json(db.products[id])}catch(e){r.status(400).json({error:typeof e==='string'?e:'Invalid product'})}});
app.post('/api/admin/products/:id/delete',needAdmin,(q,r)=>{if(!db.products[q.params.id])return r.status(404).end();delete db.products[q.params.id];save();r.json({ok:true})});
app.listen(E.PORT||3000,()=>console.log('Lootify on :'+(E.PORT||3000)));
