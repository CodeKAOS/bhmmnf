#!/usr/bin/env python3
import base64, csv, hmac, io, json, os, shutil, sqlite3, threading, time, secrets, hashlib
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote
from urllib.request import Request, urlopen

REMOTE=os.getenv('BITCOIN_HERO_API','https://bitcoinhero.me/api/prices')
PORT=int(os.getenv('PORT','8000')); HOST=os.getenv('HOST','0.0.0.0')
AUTH_USER=os.getenv('TRACKER_USERNAME','admin')
AUTH_PASS=os.getenv('TRACKER_PASSWORD','')
DATA_DIR=os.getenv('DATA_DIR','/data' if os.path.isdir('/data') else os.path.join(os.path.dirname(__file__),'data'))
os.makedirs(DATA_DIR, exist_ok=True); DB=os.path.join(DATA_DIR,'bitcoin_hero.sqlite3')
SYMS=['BTC','ETH','SOL','DOGE','XRP','ADA','LINK','AVAX']
BASE={'BTC': (67620.74, 102652.3283235368), 'ETH': (3360.5842984163146, 5640.140525), 'SOL': (654.08, 1299.19615215442), 'DOGE': (0.0437, 0.3305090875513101), 'XRP': (0.3017977083568663, 0.9173), 'ADA': (0.3401675692355668, 0.6635), 'LINK': (1.85625, 4.15), 'AVAX': (62.25, 167.0230490349094)}
lock=threading.RLock(); runtime={'ok':False,'last_error':None,'last_poll':None,'tick_ms':3000}
SESSIONS={}; SESSION_LOCK=threading.RLock(); SESSION_TTL=12*3600

def con():
    c=sqlite3.connect(DB, timeout=20); c.row_factory=sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL'); c.execute('PRAGMA synchronous=NORMAL'); return c

def upsert_candle(c, symbol, interval_ms, ts, price):
    bucket=(int(ts)//interval_ms)*interval_ms
    c.execute('''INSERT INTO candles(symbol,interval_ms,bucket_ts,open,high,low,close,updated_ts)
        VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(symbol,interval_ms,bucket_ts) DO UPDATE SET
          high=MAX(candles.high,excluded.high), low=MIN(candles.low,excluded.low),
          close=excluded.close, updated_ts=MAX(candles.updated_ts,excluded.updated_ts)''',(symbol,interval_ms,bucket,float(price),float(price),float(price),float(price),int(ts)))

def rebuild_hourly_candles(symbols=None):
    """Rebuild hourly OHLC from retained raw observations; used for migration and CSV merges."""
    wanted=set(symbols or SYMS)
    with lock, con() as c:
        for sym in wanted:
            c.execute('DELETE FROM candles WHERE symbol=? AND interval_ms=3600000',(sym,))
            rows=c.execute('SELECT ts,price FROM prices WHERE symbol=? ORDER BY ts',(sym,)).fetchall()
            current_bucket=None; values=None; updated=None
            for row in rows:
                ts=int(row['ts']); price=float(row['price']); bucket=(ts//3600000)*3600000
                if bucket!=current_bucket:
                    if values is not None:
                        c.execute('INSERT OR REPLACE INTO candles(symbol,interval_ms,bucket_ts,open,high,low,close,updated_ts) VALUES(?,?,?,?,?,?,?,?)',(sym,3600000,current_bucket,values[0],values[1],values[2],values[3],updated))
                    current_bucket=bucket; values=[price,price,price,price]; updated=ts
                else:
                    values[1]=max(values[1],price); values[2]=min(values[2],price); values[3]=price; updated=ts
            if values is not None:
                c.execute('INSERT OR REPLACE INTO candles(symbol,interval_ms,bucket_ts,open,high,low,close,updated_ts) VALUES(?,?,?,?,?,?,?,?)',(sym,3600000,current_bucket,values[0],values[1],values[2],values[3],updated))

def bootstrap_candles():
    with con() as c:
        done=c.execute("SELECT value FROM app_meta WHERE key='hourly_candles_v1'").fetchone()
    if not done:
        rebuild_hourly_candles()
        with con() as c: c.execute("INSERT OR REPLACE INTO app_meta(key,value) VALUES('hourly_candles_v1','1')")
    # Recreate recent one-minute candles from existing observations so short views survive deployment too.
    cutoff=int(time.time()*1000)-48*3600_000
    with lock, con() as c:
        c.execute('DELETE FROM candles WHERE interval_ms=60000 AND bucket_ts<?',(cutoff,))
        rows=c.execute('SELECT ts,symbol,price FROM prices WHERE ts>=? ORDER BY ts,symbol',(cutoff,)).fetchall()
        for row in rows:
            upsert_candle(c,row['symbol'],60000,row['ts'],row['price'])

def aggregate_candles(rows, interval_ms):
    out=[]; bucket=None; cur=None
    for row in rows:
        ts=int(row['bucket_ts']); b=(ts//interval_ms)*interval_ms
        if b!=bucket:
            if cur is not None: out.append(cur)
            bucket=b; cur={'ts':b,'open':float(row['open']),'high':float(row['high']),'low':float(row['low']),'close':float(row['close'])}
        else:
            cur['high']=max(cur['high'],float(row['high'])); cur['low']=min(cur['low'],float(row['low'])); cur['close']=float(row['close'])
    if cur is not None: out.append(cur)
    return out

def init_db():
    with con() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS prices(ts INTEGER NOT NULL,symbol TEXT NOT NULL,price REAL NOT NULL,change REAL,PRIMARY KEY(ts,symbol));
        CREATE INDEX IF NOT EXISTS idx_prices_symbol_ts ON prices(symbol,ts);
        CREATE TABLE IF NOT EXISTS records(symbol TEXT PRIMARY KEY,low REAL,low_at INTEGER,high REAL,high_at INTEGER,samples INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,ts INTEGER,symbol TEXT,type TEXT,price REAL);
        CREATE INDEX IF NOT EXISTS idx_events_symbol_ts ON events(symbol,ts);
        CREATE TABLE IF NOT EXISTS candles(symbol TEXT NOT NULL,interval_ms INTEGER NOT NULL,bucket_ts INTEGER NOT NULL,open REAL NOT NULL,high REAL NOT NULL,low REAL NOT NULL,close REAL NOT NULL,updated_ts INTEGER NOT NULL,PRIMARY KEY(symbol,interval_ms,bucket_ts));
        CREATE INDEX IF NOT EXISTS idx_candles_symbol_interval_ts ON candles(symbol,interval_ms,bucket_ts);
        CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        ''')
        now=int(time.time()*1000)
        for s,(lo,hi) in BASE.items():
            c.execute('INSERT OR IGNORE INTO records(symbol,low,low_at,high,high_at,samples) VALUES(?,?,?,?,?,0)',(s,lo,None,hi,None))

def ingest(payload):
    ts=int(payload.get('serverTime') or time.time()*1000); coins=payload.get('coins') or {}; tick=int(payload.get('tickMs') or 3000)
    with lock, con() as c:
        for s in SYMS:
            x=coins.get(s) or {}; p=x.get('price')
            try:p=float(p)
            except:continue
            ch=x.get('change'); ch=float(ch) if ch is not None else None
            inserted=c.execute('INSERT OR IGNORE INTO prices(ts,symbol,price,change) VALUES(?,?,?,?)',(ts,s,p,ch)).rowcount
            if inserted:
                upsert_candle(c,s,60000,ts,p)
                upsert_candle(c,s,3600000,ts,p)
            r=c.execute('SELECT * FROM records WHERE symbol=?',(s,)).fetchone()
            if not r:
                c.execute('INSERT INTO records(symbol,low,low_at,high,high_at,samples) VALUES(?,?,?,?,?,1)',(s,p,ts,p,ts)); continue
            lo,hi=r['low'],r['high']; lat,hat=r['low_at'],r['high_at']
            if p<lo: lo,lat=p,ts; c.execute('INSERT INTO events(ts,symbol,type,price) VALUES(?,?,?,?)',(ts,s,'NEW LOW',p))
            if p>hi: hi,hat=p,ts; c.execute('INSERT INTO events(ts,symbol,type,price) VALUES(?,?,?,?)',(ts,s,'NEW HIGH',p))
            c.execute('UPDATE records SET low=?,low_at=?,high=?,high_at=?,samples=samples+1 WHERE symbol=?',(lo,lat,hi,hat,s))
    runtime.update(ok=True,last_error=None,last_poll=ts,tick_ms=tick)

def collector():
    while True:
        started=time.time()
        try:
            req=Request(REMOTE,headers={'User-Agent':'Mozilla/5.0 BitcoinHeroCloudTracker/10.0','Accept':'application/json','x-avatars':'url','x-bh-platform':'web'})
            with urlopen(req,timeout=12) as r: ingest(json.loads(r.read().decode()))
        except Exception as e:
            runtime.update(ok=False,last_error=str(e),last_poll=int(time.time()*1000))
        time.sleep(max(.25,3-(time.time()-started)))

def latest_state():
    out={'coins':{},'records':{},'events':{},'server':dict(runtime),'database':DB}
    with con() as c:
        for s in SYMS:
            p=c.execute('SELECT ts,price,change FROM prices WHERE symbol=? ORDER BY ts DESC LIMIT 1',(s,)).fetchone()
            r=c.execute('SELECT * FROM records WHERE symbol=?',(s,)).fetchone()
            ev=c.execute('SELECT ts,type,price FROM events WHERE symbol=? ORDER BY ts DESC LIMIT 1',(s,)).fetchone()
            out['coins'][s]=dict(p) if p else {}
            out['records'][s]=dict(r) if r else {}
            out['events'][s]=dict(ev) if ev else {}
    return out

def history(symbol, rng):
    now=int(time.time()*1000)
    cuts={'live':now-5*60_000,'1h':now-60*60_000,'4h':now-4*60*60_000,'1d':now-24*60*60_000,'all':0}
    if rng=='all':
        with con() as c:
            rows=c.execute('SELECT bucket_ts,open,high,low,close FROM candles WHERE symbol=? AND interval_ms=3600000 ORDER BY bucket_ts',(symbol,)).fetchall()
        # Keep permanent hourly storage, but cap the number of rendered candles for a responsive UI.
        if len(rows)>2500:
            rows=aggregate_candles(rows,((len(rows)+2499)//2500)*3600000)
            return {'candles':rows,'points':[]}
        return {'candles':[dict(ts=r['bucket_ts'],open=r['open'],high=r['high'],low=r['low'],close=r['close']) for r in rows], 'points':[]}
    cut=cuts[rng]
    with con() as c:
        rows=c.execute('SELECT bucket_ts,open,high,low,close FROM candles WHERE symbol=? AND interval_ms=60000 AND bucket_ts>=? ORDER BY bucket_ts',(symbol,cut)).fetchall()
    rows=[dict(r) for r in rows]
    interval={'live':60000,'1h':60000,'4h':300000,'1d':900000}[rng]
    candles=aggregate_candles(rows,interval)
    # The live/short views remain bounded. Long-term ALL history is one saved candle per hour.
    return {'candles':candles,'points':[]}

def import_csv_bytes(raw):
    text=raw.decode('utf-8-sig',errors='replace')
    reader=csv.DictReader(io.StringIO(text))
    required={'time','symbol','type','price'}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise ValueError('Unsupported CSV: expected time, symbol, type and price columns')
    backup=os.path.join(DATA_DIR,'backup-'+datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')+'.sqlite3')
    with lock:
        with con() as src:
            dst=sqlite3.connect(backup); src.backup(dst); dst.close()
        added=dupes=events_added=0; touched=set()
        with con() as c:
            for row in reader:
                sym=(row.get('symbol') or '').strip().upper()
                if sym not in SYMS: continue
                try:
                    ts=int(datetime.fromisoformat((row.get('time') or '').replace('Z','+00:00')).timestamp()*1000)
                    price=float(row.get('price') or row.get('current'))
                except Exception: continue
                typ=(row.get('type') or '').strip().upper(); touched.add(sym)
                ch=None
                try: ch=float(row.get('change')) if row.get('change') not in (None,'') else None
                except: pass
                cur=c.execute('INSERT OR IGNORE INTO prices(ts,symbol,price,change) VALUES(?,?,?,?)',(ts,sym,price,ch))
                if cur.rowcount: added+=1
                else: dupes+=1
                r=c.execute('SELECT * FROM records WHERE symbol=?',(sym,)).fetchone()
                lo=price if not r else r['low']; hi=price if not r else r['high']; lat=ts if not r else r['low_at']; hat=ts if not r else r['high_at']
                vals=[]
                for k in ('observedLow','observedHigh'):
                    try: vals.append(float(row.get(k)))
                    except: vals.append(None)
                ilo,ihi=vals
                if ilo is not None and ilo<lo: lo=ilo; lat=ts if typ=='NEW LOW' else lat
                if ihi is not None and ihi>hi: hi=ihi; hat=ts if typ=='NEW HIGH' else hat
                if price<lo: lo,lat=price,ts
                if price>hi: hi,hat=price,ts
                if not r: c.execute('INSERT INTO records(symbol,low,low_at,high,high_at,samples) VALUES(?,?,?,?,?,1)',(sym,lo,lat,hi,hat))
                else: c.execute('UPDATE records SET low=?,low_at=?,high=?,high_at=?,samples=samples+? WHERE symbol=?',(lo,lat,hi,hat,1 if cur.rowcount else 0,sym))
                if typ in ('NEW HIGH','NEW LOW'):
                    ex=c.execute('SELECT 1 FROM events WHERE ts=? AND symbol=? AND type=? AND price=? LIMIT 1',(ts,sym,typ,price)).fetchone()
                    if not ex: c.execute('INSERT INTO events(ts,symbol,type,price) VALUES(?,?,?,?)',(ts,sym,typ,price)); events_added+=1
    if touched:
        rebuild_hourly_candles(touched)
        # Refresh one-minute candles from imported plus live observations for touched coins.
        cutoff=int(time.time()*1000)-48*3600_000
        with lock, con() as c:
            for sym in touched:
                c.execute('DELETE FROM candles WHERE symbol=? AND interval_ms=60000 AND bucket_ts>=?',(sym,cutoff))
                for row in c.execute('SELECT ts,price FROM prices WHERE symbol=? AND ts>=? ORDER BY ts',(sym,cutoff)).fetchall():
                    upsert_candle(c,sym,60000,row['ts'],row['price'])
    return {'ok':True,'priceRecordsAdded':added,'eventsAdded':events_added,'duplicatesSkipped':dupes,'cryptosUpdated':len(touched),'backup':os.path.basename(backup)}

def csv_bytes():
    b=io.StringIO(); w=csv.writer(b); w.writerow(['time','symbol','type','price','observedLow','observedHigh'])
    with con() as c:
        for r in c.execute('SELECT e.ts,e.symbol,e.type,e.price,r.low,r.high FROM events e JOIN records r USING(symbol) ORDER BY e.ts'):
            w.writerow([datetime.fromtimestamp(r['ts']/1000,timezone.utc).isoformat(),r['symbol'],r['type'],r['price'],r['low'],r['high']])
        for s in SYMS:
            p=c.execute('SELECT ts,price FROM prices WHERE symbol=? ORDER BY ts DESC LIMIT 1',(s,)).fetchone(); r=c.execute('SELECT * FROM records WHERE symbol=?',(s,)).fetchone()
            if p and r:w.writerow([datetime.fromtimestamp(p['ts']/1000,timezone.utc).isoformat(),s,'SNAPSHOT',p['price'],r['low'],r['high']])
    return b.getvalue().encode()


def period_change(c, symbol, now, ms, latest):
    row=c.execute('SELECT price FROM prices WHERE symbol=? AND ts<=? ORDER BY ts DESC LIMIT 1',(symbol,now-ms)).fetchone()
    if not row or not row['price']: return 0.0
    return (float(latest)/float(row['price'])-1)*100

def intelligence():
    now=int(time.time()*1000); result=[]
    with con() as c:
        for sym in SYMS:
            latest=c.execute('SELECT ts,price FROM prices WHERE symbol=? ORDER BY ts DESC LIMIT 1',(sym,)).fetchone()
            rec=c.execute('SELECT low,high FROM records WHERE symbol=?',(sym,)).fetchone()
            if not latest or not latest['price']: continue
            price=float(latest['price'])
            m5=period_change(c,sym,now,5*60_000,price); m15=period_change(c,sym,now,15*60_000,price)
            h1=period_change(c,sym,now,60*60_000,price); h24=period_change(c,sym,now,24*60*60_000,price)
            rows=c.execute('SELECT price FROM prices WHERE symbol=? AND ts>=? ORDER BY ts',(sym,now-24*60*60_000)).fetchall()
            vals=[float(x['price']) for x in rows if x['price']]
            returns=[(vals[i]/vals[i-1]-1)*100 for i in range(1,len(vals)) if vals[i-1]]
            vol=(sum(v*v for v in returns)/max(1,len(returns)))**.5 if returns else 0.0
            trend='UP' if (m15+h1+h24)>0 else 'DOWN'
            score=max(0,min(100,round(50+min(25,max(-25,h24*1.2))+min(15,max(-15,m15*2))+(8 if trend=='UP' else -8)-min(15,vol*12))))
            high=float(rec['high']) if rec and rec['high'] else price; low=float(rec['low']) if rec and rec['low'] else price
            result.append({'symbol':sym,'m5':m5,'m15':m15,'h1':h1,'h24':h24,'trend':trend,'volatility':vol,'score':score,'highDistance':(high-price)/price*100 if price else 0,'lowDistance':(price-low)/low*100 if low else 0})
    return {'updatedAt':now,'coins':result}

def external_json(url):
    req=Request(url,headers={'User-Agent':'Mozilla/5.0 BitcoinHero/23','Accept':'application/json'})
    with urlopen(req,timeout=12) as r:
        raw=r.read(3_000_000)
        return json.loads(raw.decode('utf-8'))

class Handler(SimpleHTTPRequestHandler):
    def session_token(self):
        cookie=self.headers.get('Cookie','')
        for item in cookie.split(';'):
            k,sep,v=item.strip().partition('=')
            if sep and k=='bh_session': return v
        return ''
    def authorized(self):
        token=self.session_token()
        if not token: return False
        now=time.time()
        with SESSION_LOCK:
            expiry=SESSIONS.get(token)
            if expiry is None: return False
            if expiry<now:
                SESSIONS.pop(token,None); return False
            SESSIONS[token]=now+SESSION_TTL
            return True
    def require_auth(self):
        if self.authorized(): return True
        self.send_json({'error':'Please sign in to continue'},401)
        return False
    def log_message(self,fmt,*args): print('%s - %s'%(self.address_string(),fmt%args))
    def send_json(self,obj,code=200,headers=None):
        body=json.dumps(obj,separators=(',',':')).encode(); self.send_response(code); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(body)))
        for k,v in (headers or {}).items(): self.send_header(k,v)
        self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        u=urlparse(self.path)
        if u.path=='/api/login':
            try:
                n=int(self.headers.get('Content-Length','0'))
                if n<=0 or n>10000: return self.send_json({'error':'Enter your username and password'},400)
                data=json.loads(self.rfile.read(n).decode('utf-8')); user=str(data.get('username','')); password=str(data.get('password',''))
                if not AUTH_PASS or not hmac.compare_digest(user,AUTH_USER) or not hmac.compare_digest(password,AUTH_PASS):
                    return self.send_json({'error':'Incorrect username or password'},401)
                token=secrets.token_urlsafe(32)
                with SESSION_LOCK: SESSIONS[token]=time.time()+SESSION_TTL
                secure='; Secure' if self.headers.get('X-Forwarded-Proto','').lower()=='https' else ''
                return self.send_json({'ok':True},200,{'Set-Cookie':f'bh_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL}'+secure})
            except Exception:
                return self.send_json({'error':'Unable to sign in. Please try again.'},400)
        if u.path=='/api/logout':
            token=self.session_token()
            with SESSION_LOCK: SESSIONS.pop(token,None)
            return self.send_json({'ok':True},200,{'Set-Cookie':'bh_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'})
        if not self.require_auth(): return
        if u.path!='/api/import': return self.send_json({'error':'not found'},404)
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<=0 or n>25_000_000: return self.send_json({'error':'CSV must be between 1 byte and 25 MB'},400)
            result=import_csv_bytes(self.rfile.read(n))
            return self.send_json(result)
        except Exception as e: return self.send_json({'error':str(e)},400)
    def do_GET(self):
        u=urlparse(self.path)
        # Serve only the login-capable dashboard shell before authentication; APIs remain protected.
        if u.path in ('/','/tracker.html'):
            self.path='/tracker.html'; return super().do_GET()
        if not self.require_auth(): return

        if u.path=='/api/intelligence':
            try: return self.send_json(intelligence())
            except Exception as e: return self.send_json({'error':str(e)},500)
        if u.path=='/api/activity':
            try: return self.send_json(external_json('https://bitcoinhero.me/api/activity'))
            except Exception as e: return self.send_json({'error':'Activity service unavailable','detail':str(e)},502)
        if u.path=='/api/leaderboard':
            period=(parse_qs(u.query).get('period') or ['month'])[0]
            if period not in ('month','all'): return self.send_json({'error':'period must be month or all'},400)
            try: return self.send_json(external_json('https://bitcoinhero.me/api/leaderboard?period='+period))
            except Exception as e: return self.send_json({'error':'Leaderboard service unavailable','detail':str(e)},502)
        if u.path=='/api/player':
            q=parse_qs(u.query); username=(q.get('username') or [''])[0]
            if not username: return self.send_json({'error':'username required'},400)
            try: return self.send_json(external_json('https://bitcoinhero.me/api/players/'+quote(username,safe='')))
            except Exception as e: return self.send_json({'error':'Player profile unavailable','detail':str(e)},502)
        if u.path.startswith('/api/avatar/'):
            player_id=u.path.rsplit('/',1)[-1]
            if not player_id or len(player_id)>160: return self.send_json({'error':'invalid player id'},400)
            try:
                req=Request('https://bitcoinhero.me/api/users/'+quote(player_id,safe='')+'/avatar',headers={'User-Agent':'Mozilla/5.0 BitcoinHero/23'})
                with urlopen(req,timeout=12) as r:
                    body=r.read(2_000_000); self.send_response(r.status); self.send_header('Content-Type',r.headers.get('Content-Type','image/png')); self.send_header('Cache-Control','public, max-age=300'); self.send_header('Content-Length',str(len(body))); self.end_headers(); return self.wfile.write(body)
            except Exception: return self.send_json({'error':'avatar unavailable'},404)

        if u.path=='/api/state': return self.send_json(latest_state())
        if u.path=='/api/history':
            q=parse_qs(u.query); s=(q.get('symbol') or [''])[0].upper(); rng=(q.get('range') or ['live'])[0]
            if s not in SYMS or rng not in ('live','1h','4h','1d','all'): return self.send_json({'error':'bad parameters'},400)
            return self.send_json({'symbol':s,'range':rng,**history(s,rng)})
        if u.path=='/api/export.csv':
            body=csv_bytes(); self.send_response(200); self.send_header('Content-Type','text/csv'); self.send_header('Content-Disposition','attachment; filename="bitcoin-hero-cloud-snapshot.csv"'); self.send_header('Content-Length',str(len(body))); self.send_header('Cache-Control','no-store'); self.end_headers(); return self.wfile.write(body)
        if u.path=='/api/health': return self.send_json({'ok':runtime['ok'],'lastPoll':runtime['last_poll'],'error':runtime['last_error']})
        return self.send_json({'error':'not found'},404)

if __name__=='__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__))); init_db(); bootstrap_candles(); threading.Thread(target=collector,daemon=True).start()
    print(f'Bitcoin Hero Northflank Tracker v23 on 0.0.0.0:{PORT}; DB={DB}')
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
