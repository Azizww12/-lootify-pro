const D={
en:{search:'Search games…',login:'Log in',logout:'Log out',signup:'Sign up',email:'Email',pass:'Password',name:'Name',or:'or continue with',hero:'Top up your games instantly',popular:'Popular games',topup:'Top up',acct:'My account',points:'Points',balance:'Balance',redeem:'Redeem points (100 = $1)',refLink:'Your referral link',refInfo:'Earn 100 points when a friend makes their first purchase. 100 points = $1 balance.',copy:'Copy',orders:'My orders',none:'No orders yet.',pid:'Player ID / UID',cont:'Continue to payment',useBal:'Use my balance',charged:'Charged in USD',total:'Total',botHi:'Hi! Ask me about payments, referrals or delivery.',b0:'I can help with payments, referrals and delivery.',b1:'We accept cards, Apple Pay, Google Pay, PayPal and USDT.',b2:'Invite friends: 100 points when they make a first purchase. 100 points = $1.',b3:'Delivery usually takes 5–30 minutes after payment.',s1:'Order Placed',s2:'Payment Confirmed',s3:'Item Delivered',card:'Card / Wallets'},
fr:{search:'Rechercher un jeu…',login:'Connexion',logout:'Déconnexion',signup:'Inscription',email:'E-mail',pass:'Mot de passe',name:'Nom',or:'ou continuer avec',hero:'Rechargez vos jeux instantanément',popular:'Jeux populaires',topup:'Recharger',acct:'Mon compte',points:'Points',balance:'Solde',redeem:'Échanger les points (100 = 1 $)',refLink:'Votre lien de parrainage',refInfo:'Gagnez 100 points quand un ami fait son premier achat. 100 points = 1 $ de solde.',copy:'Copier',orders:'Mes commandes',none:'Aucune commande.',pid:'ID joueur / UID',cont:'Continuer vers le paiement',useBal:'Utiliser mon solde',charged:'Débité en USD',total:'Total',botHi:'Bonjour ! Posez-moi vos questions sur paiements, parrainage ou livraison.',b0:'Je peux aider sur paiements, parrainage et livraison.',b1:'Nous acceptons cartes, Apple Pay, Google Pay, PayPal et USDT.',b2:'Parrainez : 100 points au premier achat de votre ami. 100 points = 1 $.',b3:'Livraison en général 5 à 30 minutes après paiement.',s1:'Commande passée',s2:'Paiement confirmé',s3:'Article livré',card:'Carte / Wallets'},
ar:{search:'ابحث عن لعبة…',login:'تسجيل الدخول',logout:'خروج',signup:'إنشاء حساب',email:'البريد الإلكتروني',pass:'كلمة المرور',name:'الاسم',or:'أو تابع عبر',hero:'اشحن ألعابك فوراً',popular:'ألعاب مشهورة',topup:'اشحن',acct:'حسابي',points:'النقاط',balance:'الرصيد',redeem:'استبدل النقاط (100 = 1$)',refLink:'رابط الإحالة الخاص بك',refInfo:'اربح 100 نقطة عند أول عملية شراء لصديقك. 100 نقطة = 1 دولار رصيد.',copy:'نسخ',orders:'طلباتي',none:'لا توجد طلبات.',pid:'معرّف اللاعب',cont:'المتابعة للدفع',useBal:'استخدم رصيدي',charged:'يتم الخصم بالدولار',total:'الإجمالي',botHi:'مرحباً! اسألني عن الدفع أو الإحالة أو التوصيل.',b0:'أستطيع مساعدتك في الدفع والإحالة والتوصيل.',b1:'نقبل البطاقات وApple Pay وGoogle Pay وPayPal وUSDT.',b2:'ادعُ أصدقاءك: 100 نقطة عند أول شراء لهم. 100 نقطة = 1 دولار.',b3:'التوصيل عادةً خلال 5–30 دقيقة بعد الدفع.',s1:'تم الطلب',s2:'تم تأكيد الدفع',s3:'تم التسليم',card:'بطاقة / محافظ'}};
let lang=localStorage.lang||(navigator.language||'en').slice(0,2);if(!D[lang])lang='en';
let cur=localStorage.cur||'USD',CFG={rates:{USD:1},providers:[]},me=null;
document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
const t=k=>(D[lang]&&D[lang][k])||D.en[k]||k;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=(u,b)=>fetch(u,b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{}).then(r=>r.json());
const money=u=>{try{return new Intl.NumberFormat(lang,{style:'currency',currency:cur}).format(u*(CFG.rates[cur]||1))}catch(e){return '$'+u.toFixed(2)}};
function modal(h){closeModal();const d=document.createElement('div');d.className='ov';d.id='ovl';d.innerHTML='<div class="bx">'+h+'</div>';d.onclick=e=>{if(e.target===d)closeModal()};document.body.appendChild(d)}
function closeModal(){const d=document.getElementById('ovl');if(d)d.remove()}
const ready=(async()=>{CFG=await api('/api/config');me=(await api('/api/me')).user;header();bot()})();
function header(){const h=document.getElementById('hd');
 h.innerHTML=`<a class="logo" href="/">LOOT<span>IFY</span></a><input class="hs" id="hs" placeholder="${esc(t('search'))}">
 <select id="hl"><option value="en">EN</option><option value="fr">FR</option><option value="ar">AR</option></select>
 <select id="hc">${Object.keys(CFG.rates).map(c=>`<option>${c}</option>`).join('')}</select>
 ${me?`<a class="hb o" href="/" style="text-decoration:none">${esc(me.name)}</a><button class="hb" id="lo">${t('logout')}</button>`:`<button class="hb" id="li">${t('login')}</button>`}`;
 hl.value=lang;hc.value=cur;
 hl.onchange=()=>{localStorage.lang=hl.value;location.reload()};hc.onchange=()=>{localStorage.cur=hc.value;location.reload()};
 hs.oninput=()=>window.onSearch&&window.onSearch(hs.value);
 if(me)lo.onclick=async()=>{await api('/api/auth/logout',{});location.href='/'};else li.onclick=authModal}
function authModal(mode='login'){const reg=mode==='register';
 modal(`<h3 style="margin-top:0">${t(reg?'signup':'login')}</h3>${reg?`<input id="an" placeholder="${t('name')}" style="margin-bottom:8px">`:''}
 <input id="ae" type="email" placeholder="${t('email')}" style="margin-bottom:8px"><input id="ap" type="password" placeholder="${t('pass')}">
 <div class="err" id="aerr"></div><button class="btn" id="ago">${t(reg?'signup':'login')}</button>
 <p class="mu" style="text-align:center;cursor:pointer" onclick="authModal('${reg?'login':'register'}')">${t(reg?'login':'signup')}</p>
 ${CFG.providers.length?`<p class="mu" style="text-align:center">${t('or')}</p>`+CFG.providers.map(p=>`<a class="soc" href="/auth/${p}">${p[0].toUpperCase()+p.slice(1)}</a>`).join(''):''}`);
 ago.onclick=async()=>{const r=await api('/api/auth/'+mode,{email:ae.value,password:ap.value,name:reg?an.value:undefined});r.error?aerr.textContent=r.error:location.reload()}}
function bot(){const d=document.createElement('div');d.id='bot';d.innerHTML=`<div id="cp"><div id="cm"></div><div style="display:flex;gap:6px;padding:8px"><input id="ci"><button class="hb" id="cs">➤</button></div></div><button class="f" id="cf">🤖</button>`;document.body.appendChild(d);
 const add=(x,c)=>{const m=document.createElement('div');m.className='m '+c;m.textContent=x;cm.appendChild(m);cm.scrollTop=1e9};
 cf.onclick=()=>{cp.classList.toggle('on');if(!cm.children.length)add(t('botHi'),'')};
 const send=()=>{const v=ci.value.trim().toLowerCase();if(!v)return;add(ci.value,'u');ci.value='';const h=(...a)=>a.some(w=>v.includes(w));
  setTimeout(()=>add(t(h('pay','card','paypal','usdt','دفع','paiement')?'b1':h('refer','invite','friend','point','إحال','نقاط','parrain')?'b2':h('deliver','long','توصيل','livraison')?'b3':'b0'),''),300)};
 cs.onclick=send;ci.onkeydown=e=>e.key==='Enter'&&send()}
