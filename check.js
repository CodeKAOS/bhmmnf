
const syms=['BTC','ETH','SOL','DOGE','XRP','ADA','LINK','AVAX'];
let selectedSym=null;
const names={BTC:'Bitcoin',ETH:'Ethereum',SOL:'Solana',DOGE:'Dogecoin',XRP:'XRP',ADA:'Cardano',LINK:'Chainlink',AVAX:'Avalanche'};
const accent={BTC:'#f7931a',ETH:'#8c9eff',SOL:'#b06dff',DOGE:'#d4b455',XRP:'#3fb8e8',ADA:'#4f79e0',LINK:'#5f83e8',AVAX:'#e8784f'};
let state={},lastCoins={},sessionSamples=0,chartRange=Object.fromEntries(syms.map(s=>[s,'live'])),chartHover=Object.fromEntries(syms.map(s=>[s,null])),historyCache={};
function fmt(n){if(n==null||!isFinite(n))return '—';let a=Math.abs(n);if(a<1)return '$'+Number(n).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');return '$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
function when(t){return t?new Date(t).toLocaleString():'Baseline'}
function makeCards(){cards.innerHTML=syms.map(sym=>`<article class="coin" id="card-${sym}"><div class="coinhead"><div class="identity"><div class="coinlogo ${sym.toLowerCase()}">${{BTC:'₿',ETH:'◆',SOL:'≋',DOGE:'Ð',XRP:'X',ADA:'⠿',LINK:'⬡',AVAX:'▲'}[sym]}</div><div><div class="name">${sym}</div><div class="fullname">${names[sym]}</div></div></div><div id="chg-${sym}" class="chg">—</div></div><div id="price-${sym}" class="price">—</div><div id="event-${sym}" class="event">Waiting for feed</div><div class="chartcontrols" id="controls-${sym}"><button data-r="live" class="active">LIVE</button><button data-r="5m">5M</button><button data-r="15m">15M</button><button data-r="1h">1H</button><button data-r="1d">1 DAY</button><button data-r="all">ALL TIME</button><span class="chartlabel" id="chartlabel-${sym}">Last 5 min</span></div><div class="chartbox" id="chartbox-${sym}"><canvas id="chart-${sym}"></canvas><div class="charttip" id="tip-${sym}"></div></div><div class="range"><i id="range-${sym}" style="width:0"></i></div><div class="stats"><div class="stat"><div class="label">Observed low</div><div id="low-${sym}" class="value lowtxt">—</div></div><div class="stat"><div class="label">Observed high</div><div id="high-${sym}" class="value hitxt">—</div></div></div><div class="tradebox"><div class="tradehead"><span class="label">Potential trade range</span><span id="pick-${sym}" class="tradepick">Waiting</span></div><div class="tradegrid"><div id="upopt-${sym}" class="tradeopt upside"><div class="side">▲ UP</div><div id="upgain-${sym}" class="gain">—</div><div id="uptarget-${sym}" class="target">to observed high</div></div><div id="downopt-${sym}" class="tradeopt downside"><div class="side">▼ DOWN</div><div id="downgain-${sym}" class="gain">—</div><div id="downtarget-${sym}" class="target">to observed low</div></div></div></div></article>`).join('')}

function key(sym){return sym+':'+(chartRange[sym]||'live')}
async function loadHistory(sym,force=false){let k=key(sym);if(!force&&historyCache[k])return historyCache[k];let r=await fetch('/api/history?symbol='+sym+'&range='+(chartRange[sym]||'live'),{cache:'no-store'});if(!r.ok)throw Error('history '+r.status);let d=await r.json();historyCache[k]=d.candles||[];return historyCache[k]}
function chartPoints(sym){return historyCache[key(sym)]||[]}
function draw(sym){
 let cv=document.getElementById('chart-'+sym);if(!cv)return;let box=cv.parentElement,r=box.getBoundingClientRect(),dpr=devicePixelRatio||1;
 cv.width=Math.max(1,r.width*dpr);cv.height=Math.max(1,r.height*dpr);let ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 let w=r.width,h=r.height,mini=false,axisW=46,plotW=Math.max(30,w-axisW);ctx.clearRect(0,0,w,h);
 let pts=chartPoints(sym),mode=chartRange[sym]||'live',labels={live:'LIVE · rolling 5 min','5m':'5 MIN','15m':'15 MIN','1h':'1 HOUR','1d':'1 DAY',all:'ALL · saved history'};
 let lab=document.getElementById('chartlabel-'+sym);if(lab)lab.textContent=(labels[mode]||'Price history')+' · '+pts.length+' points';
 if(!pts.length){ctx.fillStyle='#7f8999';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText('Collecting price history…',plotW/2,h/2);return}
 let values=pts.map(p=>Number(p.close)).filter(v=>Number.isFinite(v)&&v>0),current=Number(lastCoins[sym]?.price);if(Number.isFinite(current)&&current>0)values.push(current);let lo=Math.min(...values),hi=Math.max(...values),pad=(hi-lo)*.12||Math.abs(hi)*.002||1;lo-=pad;hi+=pad;
 let top=8,bottom=h-12,y=v=>top+(hi-v)/(hi-lo)*(bottom-top);let n=pts.length;
 if(!mini){ctx.font='9px system-ui';ctx.textBaseline='middle';ctx.textAlign='right';ctx.strokeStyle='#252d3b';ctx.lineWidth=1;for(let i=0;i<=4;i++){let value=hi-(hi-lo)*i/4,yy=y(value);ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(plotW-4,yy);ctx.stroke();ctx.fillStyle='#9aa5b5';let digits=Math.abs(value)<1?4:Math.abs(value)<100?2:0;ctx.fillText(value.toLocaleString(undefined,{minimumFractionDigits:digits,maximumFractionDigits:digits}),w-2,yy)}}
 let step=plotW/Math.max(1,n-1);ctx.beginPath();let started=false;pts.forEach((p,i)=>{let v=Number(p.close);if(!Number.isFinite(v)||v<=0)return;let xx=n===1?plotW/2:step*i,yy=y(v);if(!started){ctx.moveTo(xx,yy);started=true}else ctx.lineTo(xx,yy)});ctx.strokeStyle=accent[sym]||'#7aa2ff';ctx.lineWidth=1.6;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
 if(!mini&&Number.isFinite(current)&&current>0){let yy=y(current);ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle=accent[sym]||'#7aa2ff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(plotW-1,yy);ctx.stroke();ctx.restore();ctx.fillStyle=accent[sym]||'#7aa2ff';ctx.fillRect(plotW-1,Math.max(yy-9,0),axisW+1,18);ctx.fillStyle='#fff';ctx.textAlign='left';ctx.font='bold 9px system-ui';ctx.fillText(fmt(current),plotW+4,Math.max(yy,8));}
 let hv=chartHover[sym];if(!mini&&hv!=null&&hv>=0&&hv<pts.length){let p=pts[hv],xx=n===1?plotW/2:step*hv,yy=y(Number(p.close));ctx.save();ctx.setLineDash([3,3]);ctx.strokeStyle='#aab4c4aa';ctx.beginPath();ctx.moveTo(xx,4);ctx.lineTo(xx,h-4);ctx.stroke();ctx.restore();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(xx,yy,3,0,Math.PI*2);ctx.fill();let tip=document.getElementById('tip-'+sym);tip.innerHTML=`${fmt(p.close)}<span class="tttime">${new Date(p.ts).toLocaleString()}</span>`;tip.style.left=Math.max(70,Math.min(plotW-70,xx))+'px';tip.style.top=Math.max(38,yy)+'px';tip.classList.add('show')}
}
function hoverChart(sym,clientX){let cv=document.getElementById('chart-'+sym),r=cv.getBoundingClientRect(),pts=chartPoints(sym);if(!pts.length)return;let rel=Math.max(0,Math.min(1,(clientX-r.left)/Math.max(1,r.width-46))),best=Math.max(0,Math.min(pts.length-1,Math.floor(rel*pts.length)));chartHover[sym]=best;draw(sym)}
function clearHover(sym){chartHover[sym]=null;let tip=document.getElementById('tip-'+sym);if(tip)tip.classList.remove('show');draw(sym)}
function ringColor(g){if(!Number.isFinite(g))return '#667085';if(g>=50)return '#ff3b6b';if(g>=25)return '#ff8a3d';if(g>=15)return '#ffd166';if(g>=8)return '#64d98b';if(g>=3)return '#4db8ff';return '#718096'}
function ringScale(g){return Number.isFinite(g)?Math.max(3,Math.min(100,g/50*100)):0}
function render(){for(const sym of syms){let c=lastCoins[sym]||{},s=state[sym]||{},p=Number(c.price);document.getElementById('price-'+sym).textContent=fmt(p);let ch=document.getElementById('chg-'+sym),change=c.change;ch.textContent=change==null?'—':`${change>=0?'+':''}${Number(change).toFixed(2)}%`;ch.className='chg '+(change==null?'':change>=0?'up':'down');document.getElementById('low-'+sym).textContent=fmt(s.low);document.getElementById('high-'+sym).textContent=fmt(s.high);let valid=Number.isFinite(p)&&p>0&&Number.isFinite(s.low)&&Number.isFinite(s.high);let pos=(valid&&s.high>s.low)?Math.max(0,Math.min(100,(p-s.low)/(s.high-s.low)*100)):0;document.getElementById('range-'+sym).style.width=pos+'%';let up=valid?Math.max(0,(s.high-p)/p*100):NaN,down=valid?Math.max(0,(p-s.low)/p*100):NaN;document.getElementById('upgain-'+sym).textContent=Number.isFinite(up)?'+'+up.toFixed(2)+'%':'—';document.getElementById('downgain-'+sym).textContent=Number.isFinite(down)?'+'+down.toFixed(2)+'%':'—';document.getElementById('uptarget-'+sym).textContent=valid?'to '+fmt(s.high):'to observed high';document.getElementById('downtarget-'+sym).textContent=valid?'to '+fmt(s.low):'to observed low';let pick=document.getElementById('pick-'+sym),uo=document.getElementById('upopt-'+sym),dn=document.getElementById('downopt-'+sym);uo.classList.remove('best');dn.classList.remove('best');if(valid&&up>down){pick.textContent='UP · '+up.toFixed(2)+'% range';pick.className='tradepick up';uo.classList.add('best')}else if(valid){pick.textContent='DOWN · '+down.toFixed(2)+'% range';pick.className='tradepick down';dn.classList.add('best')}let ev=(window.latestEvents||{})[sym];let e=document.getElementById('event-'+sym);e.textContent=ev&&ev.type?`${ev.type} · ${fmt(ev.price)}`:`Cloud samples · ${s.samples||0}`;e.className='event '+(ev?.type==='NEW HIGH'?'high':ev?.type==='NEW LOW'?'low':'');draw(sym)}}
async function poll(){try{let r=await fetch('/api/state?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);let d=await r.json();state=d.records||{};window.latestEvents=d.events||{};lastCoins={};for(const sym of syms){let x=d.coins?.[sym]||{};lastCoins[sym]={price:x.price,change:x.change,ts:x.ts}}sessionSamples++;status.textContent='Connected';dot.classList.toggle('off',!d.server?.ok);time.textContent=d.server?.last_poll?new Date(d.server.last_poll).toLocaleTimeString():'—';tick.textContent=(d.server?.tick_ms||3000)+' ms';session.textContent=sessionSamples+' dashboard polls';render();renderMarketFeeds();await Promise.all(syms.map(async sym=>{try{await loadHistory(sym,true);draw(sym)}catch(_){}}))}catch(e){status.textContent='Dashboard connection error';dot.classList.add('off');time.textContent=e.message}}
let loggedIn=false,pollTimer=null;
const loginScreen=document.getElementById('loginScreen'),dashboard=document.getElementById('dashboard'),loginForm=document.getElementById('loginForm'),loginError=document.getElementById('loginError');
function showDashboard(){loggedIn=true;loginScreen.style.display='none';dashboard.hidden=false;loadActivity();poll();if(!pollTimer)pollTimer=setInterval(()=>{if(loggedIn)poll()},3000)}
loginForm.addEventListener('submit',async e=>{e.preventDefault();loginError.textContent='';let b=loginForm.querySelector('button[type=submit]');b.disabled=true;b.textContent='Signing in…';try{let r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('loginUser').value,password:document.getElementById('loginPass').value})});let d=await r.json();if(!r.ok)throw Error(d.error||'Unable to sign in');showDashboard()}catch(err){loginError.textContent=err.message||'Incorrect username or password'}finally{b.disabled=false;b.textContent='Sign in'}});
document.getElementById('togglePassword').onclick=()=>{let p=document.getElementById('loginPass'),b=document.getElementById('togglePassword');p.type=p.type==='password'?'text':'password';b.textContent=p.type==='password'?'Show':'Hide'};
document.getElementById('logoutBtn').onclick=async()=>{try{await fetch('/api/logout',{method:'POST'})}catch{}loggedIn=false;dashboard.hidden=true;loginScreen.style.display='flex';loginForm.reset();loginError.textContent='You have signed out.'};
async function checkSession(){try{let r=await fetch('/api/state',{cache:'no-store'});if(r.ok){showDashboard();return}}catch{}loginScreen.style.display='flex';dashboard.hidden=true}
makeCards();for(const sym of syms){let cv=document.getElementById('chart-'+sym);cv.addEventListener('mousemove',e=>hoverChart(sym,e.clientX));cv.addEventListener('mouseleave',()=>clearHover(sym));cv.addEventListener('touchstart',e=>{if(e.touches[0])hoverChart(sym,e.touches[0].clientX)},{passive:true});cv.addEventListener('touchmove',e=>{if(e.touches[0])hoverChart(sym,e.touches[0].clientX)},{passive:true});cv.addEventListener('touchend',()=>setTimeout(()=>clearHover(sym),900),{passive:true})}
document.getElementById('cards').addEventListener('click',async e=>{let card=e.target.closest('.coin');let b=e.target.closest('.chartcontrols button');if(!b)return;let controls=b.closest('.chartcontrols'),sym=controls.id.replace('controls-','');chartRange[sym]=b.dataset.r;controls.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));await loadHistory(sym,true);draw(sym)});
document.getElementById('csv').onclick=()=>location.href='/api/export.csv';
importBtn.onclick=()=>importFile.click();importFile.onchange=async()=>{let f=importFile.files&&importFile.files[0];if(!f)return;if(!confirm('Merge '+f.name+' into the cloud tracker? Existing data will be preserved and a database backup will be created first.')){importFile.value='';return}try{status.textContent='Importing…';let r=await fetch('/api/import',{method:'POST',headers:{'Content-Type':'text/csv'},body:await f.arrayBuffer()});let d=await r.json();if(!r.ok)throw Error(d.error||('HTTP '+r.status));alert(`Import complete\n\n${d.priceRecordsAdded} price records added\n${d.eventsAdded} extrema events added\n${d.duplicatesSkipped} duplicates skipped\n${d.cryptosUpdated} cryptos updated\n\nBackup: ${d.backup}`);historyCache={};await poll()}catch(e){alert('Import failed: '+e.message);status.textContent='Import failed'}finally{importFile.value=''}};

// Bitcoin Hero v26 navigation and social/player features
let leaderboardPeriod='month',currentPlayerReturn='leaderboards';
const leaderboardCache={month:null,all:null};
const leaderboardFailed=new Set();
let leaderboardRefreshBusy=false;
const logoEmoji={BTC:'₿',ETH:'◆',SOL:'≋',DOGE:'Ð',XRP:'X',ADA:'⠿',LINK:'⬡',AVAX:'▲'};
const logoClass={BTC:'btc',ETH:'eth',SOL:'sol',DOGE:'doge',XRP:'xrp',ADA:'ada',LINK:'link',AVAX:'avax'};
function coinIcon(sym){sym=String(sym||'BTC').toUpperCase();return `<span class="coinlogo ${logoClass[sym]||'btc'}">${logoEmoji[sym]||'₿'}</span>`}
function showPage(name){document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id==='page-'+name));document.querySelectorAll('.navbtn').forEach(x=>x.classList.toggle('active',x.dataset.page===name));if(name==='leaderboards'){renderLeaderboard(leaderboardPeriod);refreshLeaderboards()}}
document.getElementById('mainNav').addEventListener('click',e=>{let b=e.target.closest('[data-page]');if(b)showPage(b.dataset.page)});
document.querySelector('.subtabs').addEventListener('click',e=>{let b=e.target.closest('[data-period]');if(!b)return;leaderboardPeriod=b.dataset.period;document.querySelectorAll('.subtab').forEach(x=>x.classList.toggle('active',x===b));renderLeaderboard(leaderboardPeriod)});
async function apiJson(url){let r=await fetch(url,{cache:'no-store'});let d=await r.json();if(!r.ok)throw Error(d.error||'API request failed');return d}
function pickArray(d){if(Array.isArray(d))return d;for(let k of ['activity','trades','items','data','players','leaderboard','results'])if(Array.isArray(d?.[k]))return d[k];return []}
function safeText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function playerName(x){return x.username||x.playerName||x.name||x.player?.username||'Player'}
function playerId(x){return x.playerId||x.userId||x.id||x.player?.id||x.user?.id||''}
function coinSym(x){return String(x.symbol||x.coin||x.crypto||'BTC').toUpperCase()}
function avatarUrl(id){return id?'/api/avatar/'+encodeURIComponent(id):''}
function initials(name){return String(name||'P').trim().charAt(0).toUpperCase()||'P'}
function avatarFallback(name,size=32){return `<span class="coin-logo" style="display:grid;place-items:center;background:#35435b;color:white;font-weight:900;width:${size}px;height:${size}px;border-radius:50%">${safeText(initials(name))}</span>`}
function avatarHtml(x,size=32){let id=String(playerId(x)||''),name=playerName(x),url=avatarUrl(id);if(!url||leaderboardFailed.has(id))return avatarFallback(name,size);return `<img class="coin-logo" width="${size}" height="${size}" style="border-radius:50%;object-fit:cover" src="${url}" onerror="leaderboardAvatarFailed(this,'${safeText(id)}','${safeText(name)}',${size})">`}
function leaderboardAvatarFailed(img,id,name,size){if(id)leaderboardFailed.add(String(id));img.replaceWith(Object.assign(document.createElement('span'),{className:'coin-logo',textContent:initials(name),style:`display:grid;place-items:center;background:#35435b;color:white;font-weight:900;width:${size}px;height:${size}px;border-radius:50%`}))}
function playerButton(x){let n=playerName(x),id=playerId(x);return `<button class="player-link" data-player="${safeText(n)}" data-playerid="${safeText(id)}">${safeText(n)}</button>`}
function money(v){let n=Number(v);return Number.isFinite(n)?(n<0?'−':'')+'$'+Math.abs(n).toLocaleString(undefined,{maximumFractionDigits:2}):'—'}
function leaderboardMoney(v,period){let n=Number(v);if(!Number.isFinite(n))return '—';return period==='month'?(n>=0?'+':'−')+'$'+Math.abs(n).toLocaleString(undefined,{maximumFractionDigits:0}):money(n)}
async function loadActivity(){try{let d=await apiJson('/api/activity'),items=pickArray(d);let el=document.getElementById('activityList');if(!items.length){el.innerHTML='<div class="empty">No recent trades available.</div>';return}
el.innerHTML=items.map(x=>{let sym=coinSym(x),pnl=Number(x.pnl??x.profitLoss??x.profit??x.amount??0),name=playerName(x);return `<div class="activity-row">${coinIcon(sym)}${avatarHtml(x,30)}<div style="min-width:0"><div>${playerButton(x)}</div></div><span class="pnl ${pnl>=0?'up':'down'}">${pnl>=0?'+':'−'}${money(Math.abs(pnl))}</span></div>`}).join('')}catch(e){document.getElementById('activityList').innerHTML='<div class="empty">Live activity is temporarily unavailable.</div>'}}
function leaderboardValue(x,period){const v=period==='month'?x.monthlyPnl:x.netWorth;return v===null||v===undefined||v===''?NaN:v}
function leaderboardLevel(x){let v=x.level;return v&&typeof v==='object'?(v.level??''):v??x.levelNumber??''}
function leaderboardTrades(x){return x.monthlyTrades}
function normaliseLeaderboard(data,period){
 const rows=pickArray(data).filter(x=>x&&typeof x==='object').map((x,originalIndex)=>({...x,__value:Number(leaderboardValue(x,period)),__originalIndex:originalIndex}));
 // The game API defines monthlyPnl and netWorth as the respective ranking metrics.
 // Never substitute balance/net worth for monthly profit (or vice versa).
 rows.sort((a,b)=>{
  const av=Number.isFinite(a.__value),bv=Number.isFinite(b.__value);
  if(av!==bv)return av?-1:1;
  if(av&&bv&&a.__value!==b.__value)return b.__value-a.__value;
  const ar=Number(a.rank),br=Number(b.rank);
  if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br)return ar-br;
  return a.__originalIndex-b.__originalIndex;
 });
 return rows.map((x,i)=>({...x,__displayRank:i+1}));
}
function podiumPlayer(x,period){
 const rank=x.__displayRank,name=playerName(x),level=leaderboardLevel(x);
 return `<button class="podium-player rank-${rank}" data-player="${safeText(name)}" data-playerid="${safeText(playerId(x))}" type="button"><span class="podium-avatar">${avatarHtml(x,rank===1?72:56)}</span><span class="podium-rank">${rank}</span><strong>${safeText(name)}</strong><span class="podium-level">${level!==''?'Level '+safeText(level):''}</span><span class="podium-value ${period==='month'?(x.__value>=0?'up':'down'):''}">${leaderboardMoney(x.__value,period)}</span></button>`;
}
function renderLeaderboard(period){
 const el=document.getElementById('leaderboardList'),items=leaderboardCache[period];
 if(!items){if(!el.dataset.hasContent)el.innerHTML='<div class="empty">Loading leaderboard…</div>';return}
 if(!items.length){el.innerHTML='<div class="empty">No leaderboard entries returned for this period.</div>';el.dataset.hasContent='1';return}
 const top=items.slice(0,3),rest=items.slice(3);
 const podium=top.length?`<div class="podium">${(top.length===3?[top[1],top[0],top[2]]:top).map(x=>podiumPlayer(x,period)).join('')}</div>`:'';
 const rows=rest.map(x=>{
  const level=leaderboardLevel(x),trades=leaderboardTrades(x);
  const sub=period==='month'&&trades!=null?`${safeText(trades)} ${Number(trades)===1?'trade':'trades'}`:(level!==''?'Level '+safeText(level):'Player');
  return `<button class="leader-row" data-player="${safeText(playerName(x))}" data-playerid="${safeText(playerId(x))}" type="button"><span class="ranknum">${x.__displayRank}</span>${avatarHtml(x,36)}<div class="leader-person"><strong>${safeText(playerName(x))}</strong><span class="activity-meta">${sub}</span></div><span class="leader-value ${period==='month'?(x.__value>=0?'up':'down'):''}">${leaderboardMoney(x.__value,period)}</span></button>`;
 }).join('');
 el.innerHTML=podium+(rows?`<div class="leaderboard-rest">${rows}</div>`:'');el.dataset.hasContent='1';
}
async function refreshLeaderboards(){
 if(leaderboardRefreshBusy)return;leaderboardRefreshBusy=true;
 // Start both independent requests together; a failure in one must not discard the other's success.
 const results=await Promise.allSettled([apiJson('/api/leaderboard?period=month'),apiJson('/api/leaderboard?period=all')]);
 for(const [i,period] of ['month','all'].entries()){
  const result=results[i];
  if(result.status==='fulfilled'){
   const rows=normaliseLeaderboard(result.value,period);
   if(rows.length)leaderboardCache[period]=rows;
   else if(!leaderboardCache[period])leaderboardCache[period]=[];
  }
 }
 leaderboardRefreshBusy=false;
 if(document.getElementById('page-leaderboards').classList.contains('active'))renderLeaderboard(leaderboardPeriod);
}
document.addEventListener('click',e=>{let p=e.target.closest('[data-player]');if(p){let name=p.dataset.player,id=p.dataset.playerid;currentPlayerReturn=document.querySelector('.page.active')?.id.replace('page-','')||'leaderboards';openPlayer(name,id)}});
document.getElementById('playerBack').onclick=()=>{document.getElementById('playerOverlay').hidden=true;showPage(currentPlayerReturn)};

const PROFILE_ACHIEVEMENTS = [
 {key:'first_trade',name:'First Trade',desc:'Open your first trade'},
 {key:'btc_believer',name:'Bitcoin Believer',desc:'Open a Bitcoin trade'},
 {key:'diversified',name:'Diversified',desc:'Have trades open on 4 coins at once'},
 {key:'whale',name:'Whale Move',desc:'Put $5,000+ on a single trade'},
 {key:'profit_taker',name:'Profit Taker',desc:'Close a trade in profit'},
 {key:'day_trader',name:'Day Trader',desc:'Open 10 trades'},
 {key:'trade_machine',name:'Trade Machine',desc:'Open 50 trades'},
 {key:'in_the_green',name:'In The Green',desc:'Grow your net worth to $11,000'},
 {key:'to_the_moon',name:'To The Moon',desc:'Grow your net worth to $15,000'},
 {key:'diamond_hands',name:'Diamond Hands',desc:'Grow your net worth to $20,000'},
 {key:'first_lesson',name:'Student',desc:'Finish your first lesson'},
 {key:'quick_study',name:'Quick Study',desc:'Finish 5 lessons'},
 {key:'graduate',name:'Graduate',desc:'Finish every lesson'},
 {key:'sharp',name:'Sharp',desc:'Answer 5 lesson questions right first time'},
 {key:'recruiter',name:'Recruiter',desc:'A friend joins with your invite code'},
 {key:'rekt',name:'Rekt',desc:'Drop below $5,000'}
];
function normalizeProfileAchievements(raw,total){
 const list=Array.isArray(raw)?raw:[];
 // The public /api/players/{username} endpoint returns earned achievement
 // objects (key/name/desc), unlike the authenticated account endpoint which
 // returns all definitions with an `unlocked` boolean.
 const earned=new Map();
 for(const a of list){
   if(!a||typeof a!=='object')continue;
   const key=String(a.key||a.id||'');
   if(key)earned.set(key,a);
 }
 const catalog=PROFILE_ACHIEVEMENTS.map(def=>{
   const a=earned.get(def.key);
   return {...def,...(a||{}),key:def.key,unlocked:!!a};
 });
 // Preserve unfamiliar achievements returned by the server rather than drop them.
 for(const a of list){
   const key=String(a?.key||a?.id||'');
   if(key&&!catalog.some(x=>x.key===key))catalog.push({...a,key,unlocked:true});
 }
 return {items:catalog,unlocked:earned.size,total:Math.max(Number(total)||0,catalog.length)};
}
function profileDate(v){
 if(!v)return '';
 const d=new Date(typeof v==='number'?v:(String(v).includes('T')?v:String(v).replace(' ','T')+'Z'));
 return Number.isNaN(d.getTime())?'':d.toLocaleDateString();
}
async function openPlayer(name,id){
 let overlay=document.getElementById('playerOverlay'),content=document.getElementById('playerContent');
 overlay.hidden=false;content.innerHTML='<div class="empty">Loading player profile…</div>';
 try{
  let d=await apiJson('/api/player?username='+encodeURIComponent(name)+(id?'&id='+encodeURIComponent(id):''));
  let x=d.player||d.user||d.profile||d;
  let level=x.level&&typeof x.level==='object'?x.level:{level:x.level??x.levelNumber,tier:x.tier||x.rankTitle};
  let net=Number(x.netWorth??x.net_worth??x.balance??x.totalNetWorth);
  let startCash=Number(x.startCash??x.start_cash??10000);
  let totalProfit=Number(x.totalProfit??x.profitAllTime??(Number.isFinite(net)?net-startCash:NaN));
  let lifetimePct=Number.isFinite(Number(x.lifetimePercent??x.allTimePercent))?Number(x.lifetimePercent??x.allTimePercent):(startCash?totalProfit/startCash*100:NaN);
  let curve=Array.isArray(x.curve)?x.curve:[];
  let recent=Array.isArray(x.recent)?x.recent:pickArray(x.history||x.netWorthHistory||x.trades);
  let achievementData=normalizeProfileAchievements(x.achievements,x.achievementsTotal);
  let achievements=achievementData.items;
  let avatarId=x.id??id;
  let avatar=avatarId?avatarUrl(avatarId):'';
  let rank=Number(x.rank);
  let closed=Number(x.closed??x.closedTrades??0),wins=Number(x.wins??0);
  let trades=Number(x.trades??x.totalTrades??x.tradesCount??x.tradeCount??0);
  let winRate=closed>0?Math.round(wins/closed*100)+'%':'—';
  let vals=[['WIN RATE',winRate],['TRADES',Number.isFinite(trades)?trades.toLocaleString():'—'],['BEST TRADE',money(x.best??x.bestTrade??x.best_trade)],['THIS MONTH',money(x.month??x.monthlyProfit??x.thisMonth??x.monthProfit)]];
  let username=x.username||name;
  let tier=String(level.tier||'bronze').toLowerCase();
  let levelNum=level.level??'—';
  let joined=profileDate(x.createdAt||x.joinedAt);
  let status=x.status||x.tradingStatus||'';
  let short=(v)=>money(v);
  content.innerHTML=`
   <div class="profile-card">
    <div style="display:flex;align-items:center;gap:12px">
     <div class="profile-avatar">${avatar&& !leaderboardFailed.has(String(avatarId))?`<img src="${avatar}" alt="" onerror="leaderboardAvatarFailed(this,'${safeText(String(avatarId))}','${safeText(username)}',54)">`:safeText(initials(username))}</div>
     <div><h2 style="margin:0">${safeText(username)}</h2>
      <div style="color:#f4bd4d;font-weight:800">${safeText(tier.charAt(0).toUpperCase()+tier.slice(1))} · Level ${safeText(levelNum)}</div>
      <div class="muted">Trading since ${safeText(joined||'—')}${Number.isFinite(rank)&&rank>0?' · Rank #'+rank.toLocaleString():''}</div>
      ${status?`<div class="muted">${safeText(status)}</div>`:''}
     </div>
    </div>
    <div class="muted" style="margin-top:18px">NET WORTH</div>
    <div class="profile-net">${money(net)}</div>
    <div class="${totalProfit>=0?'up':'down'}">${money(totalProfit)} (${Number.isFinite(lifetimePct)?lifetimePct.toFixed(1)+'%':'—'}) all time</div>
    <div style="height:90px;margin-top:10px"><canvas id="profileChart" style="width:100%;height:90px"></canvas></div>
    <div class="profile-stats">${vals.map(v=>`<div class="profile-stat"><small>${v[0]}</small><b>${safeText(v[1])}</b></div>`).join('')}</div>
   </div>
   <section class="panel"><h3>HISTORY</h3>
    ${recent.length?recent.slice(0,20).map(t=>{
      let sym=t.symbol||t.coin||'TRADE',dir=String(t.direction||t.side||'').toUpperCase();
      let stamp=profileDate(t.closedAt??t.createdAt??t.time);
      let pnl=Number(t.pnl??t.profit??t.profitLoss);
      return `<div class="feed-row"><b>${safeText(sym)}</b><span>${money(t.stake??t.value??t.amount)}</span><span class="muted">${safeText(dir)} ${safeText(stamp)}</span><span class="pnl ${pnl>=0?'up':'down'}">${money(pnl)}</span></div>`;
    }).join(''):'<div class="empty">No recent trades supplied by the public profile.</div>'}
   </section>
   <section class="panel"><h3>ACHIEVEMENTS · ${achievementData.unlocked}/${achievementData.total}</h3>
    ${achievements.map(a=>`<div class="achievement-row ${a.unlocked?'unlocked':'locked'}"><span>${a.unlocked?'🏅':'🔒'}</span><div><b>${safeText(a.name||a.title||a.key)}</b><div class="muted">${safeText(a.desc||a.description||a.requirement||'')}</div>${a.unlockedAt?`<div class="muted">Unlocked ${safeText(profileDate(a.unlockedAt))}</div>`:''}</div></div>`).join('')}
   </section>`;
  drawProfile(curve.length?curve.map(v=>({value:v})):recent);
 }catch(e){content.innerHTML='<div class="panel">Unable to load player profile. '+safeText(e.message||'Please try again later.')+'</div>'}
}
function drawProfile(hist){let cv=document.getElementById('profileChart');if(!cv||!hist.length)return;let ctx=cv.getContext('2d'),w=cv.clientWidth,h=cv.clientHeight;cv.width=w*devicePixelRatio;cv.height=h*devicePixelRatio;ctx.scale(devicePixelRatio,devicePixelRatio);let vals=hist.map(x=>Number(typeof x==='number'?x:(x.netWorth??x.balance??x.value))).filter(Number.isFinite);if(vals.length<2)return;let lo=Math.min(...vals),hi=Math.max(...vals),pad=(hi-lo)*.1||1;ctx.strokeStyle='#20c982';ctx.lineWidth=2;ctx.beginPath();vals.forEach((v,i)=>{let x=i/(vals.length-1)*w,y=5+(hi+pad-v)/(hi-lo+2*pad)*(h-10);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}

function renderMarketFeeds(){
 let evs=Object.entries(window.latestEvents||{}).map(([symbol,e])=>({symbol,...e})).filter(x=>x.type);
 evs.sort((a,b)=>(b.ts||0)-(a.ts||0));
 let alerts=document.getElementById('alertsList');
 if(!evs.length){alerts.innerHTML='<div class="empty">No new record alerts yet.</div>';return}
 alerts.innerHTML=evs.map(e=>`<div class="feed-row">${coinIcon(e.symbol)}<span class="${e.type==='NEW HIGH'?'up':'down'}">${e.type}</span><span>${fmt(e.price)}</span><span class="muted">${e.ts?new Date(e.ts).toLocaleString():''}</span></div>`).join('');

}

loadActivity();refreshLeaderboards();setInterval(()=>{if(loggedIn){loadActivity();refreshLeaderboards();}},10000);

addEventListener('resize',()=>syms.forEach(draw));checkSession();
