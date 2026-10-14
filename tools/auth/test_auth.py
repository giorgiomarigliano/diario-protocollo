#!/usr/bin/env python3
"""Prova del modulo DP-AUTH con una libreria Supabase finta (nessuna rete reale). python3 tools/auth/test_auth.py"""
import os,sys,json
from playwright.sync_api import sync_playwright
SRC=open(os.path.join(os.path.dirname(__file__),'dp-auth.js'),encoding='utf-8').read()
PROXY='https://viarmvaukgwdoursfnwu.supabase.co/functions/v1/diario-proxy'
STUB="""
window.__st={session:null,calls:[],refresh:null,failPasskey:false,failPw:false};
window.supabase={createClient:function(u,k,o){window.__st.opts=o;return {auth:{
 getSession:async()=>({data:{session:window.__st.session}}),
 refreshSession:async()=>({data:{session:window.__st.refresh},error:null}),
 signInWithPassword:async(a)=>{window.__st.calls.push(['pw',a.email]);return window.__st.failPw?{error:{message:'Invalid login credentials'}}:{data:{}}},
 signInWithPasskey:async()=>{window.__st.calls.push(['pk']);if(window.__st.failPasskey)throw new Error('NotAllowedError');return {data:{}}},
 registerPasskey:async()=>({data:{}}),signOut:async()=>{window.__st.calls.push(['out']);window.__st.session=null;return {}}}}}};
"""
def run(required):
    code=SRC.replace('var AUTH_REQUIRED = false;','var AUTH_REQUIRED = %s;'%('true' if required else 'false'))
    seen=[];res=[]
    with sync_playwright() as p:
        b=p.chromium.launch();pg=b.new_page()
        def route(r):
            h=r.request.headers; seen.append((r.request.url,h.get('authorization'),h.get('content-type')))
            code=401 if (h.get('authorization')=='Bearer OLD') else 200
            r.fulfill(status=code,body='[]',headers={'content-type':'application/json','access-control-allow-origin':'*'})
        pg.route('https://viarmvaukgwdoursfnwu.supabase.co/**',route)
        pg.route('https://example.test/**',lambda r:(seen.append((r.request.url,r.request.headers.get('authorization'),None)),r.fulfill(status=200,body='x',headers={'access-control-allow-origin':'*'})))
        pg.goto('https://example.test/page',wait_until='commit') if False else None
        pg.set_content('<html><head></head><body></body></html>')
        pg.evaluate("()=>{}")
        pg.add_script_tag(content=STUB)
        # il modulo parte sulla pagina (origine about:blank): le fetch cross-origin richiedono CORS: gestito da route
        pg.add_script_tag(content=code)
        pg.wait_for_timeout(200)
        def f(url,init='{}'): return pg.evaluate("async([u,i])=>{try{const r=await fetch(u,JSON.parse(i));return r.status}catch(e){return 'ERR:'+e.message}}",[url,init])
        def ov(): return pg.evaluate("()=>!!document.getElementById('dpa')")
        res.append(('senza sessione: overlay mostrato',ov()))
        seen.clear(); s=f(PROXY+'/rest/v1/diary?user_id=eq.x')
        if required: res.append(('REQUIRED senza sessione: fetch al proxy bloccata',str(s).startswith('ERR:Accesso richiesto') and not seen))
        else:
            res.append(('permissivo senza sessione: fetch passa',s==200 and len(seen)==1 and seen[0][1] is None))
            pg.click('#dpa-later'); res.append(('"Più tardi" chiude',not ov()))
        # login password errato poi corretto
        pg.evaluate("()=>window.dpAuth.show()"); pg.click('#dpa-pwb'); pg.fill('#dpa-em','a@b.c'); pg.fill('#dpa-pw','x')
        pg.evaluate("()=>{window.__st.failPw=true}"); pg.click('#dpa-go'); pg.wait_for_timeout(100)
        res.append(('password errata: messaggio',pg.inner_text('#dpa-err')=='Email o password non corretta.'))
        res.append(('password: nessun reload su errore',ov()))
        # passkey che fallisce -> messaggio con ripiego
        pg.click('#dpa-back'); pg.evaluate("()=>{window.__st.failPasskey=true}"); pg.click('#dpa-pk'); pg.wait_for_timeout(100)
        res.append(('passkey fallita: invita alla password','password' in pg.inner_text('#dpa-err').lower()))
        # con sessione: token aggiunto solo al proxy
        pg.evaluate("()=>{window.__st.session={access_token:'TOK'}}")
        seen.clear(); f(PROXY+'/rest/v1/diary?user_id=eq.x','{"method":"PATCH","headers":{"Content-Type":"application/json","apikey":"K","Prefer":"return=minimal"},"body":"{}"}')
        res.append(('sessione: Authorization = token',seen and seen[0][1]=='Bearer TOK'))
        res.append(('sessione: Content-Type conservato',seen and seen[0][2]=='application/json'))
        seen.clear(); f('https://example.test/x','{"headers":{"Authorization":"Bearer ALTRO"}}')
        res.append(('URL non-proxy: header NON toccato',seen and seen[0][1]=='Bearer ALTRO'))
        # 401 -> refresh -> ritenta
        pg.evaluate("()=>{window.__st.session={access_token:'OLD'};window.__st.refresh={access_token:'NEW'}}")
        seen.clear(); s=f(PROXY+'/rest/v1/diary?user_id=eq.x')
        res.append(('401: refresh e secondo tentativo con token nuovo',s==200 and [x[1] for x in seen]==['Bearer OLD','Bearer NEW']))
        res.append(('opzioni client: passkey sperimentale, storageKey dedicata',pg.evaluate("()=>{const o=window.__st.opts.auth;return o.experimental.passkey===true&&o.storageKey==='dp-auth'&&o.persistSession===true}")))
        pg2=b.new_page(); pg2.set_content('<html><head></head><body></body></html>')
        pg2.add_script_tag(content=STUB.replace('session:null','session:{access_token:"T"}')); pg2.add_script_tag(content=code); pg2.wait_for_timeout(200)
        res.append(('con sessione all\'avvio: chip Esci/Passkey, nessun overlay',pg2.evaluate("()=>!!document.getElementById('dpc')&&!document.getElementById('dpa')")))
        b.close()
    return res
bad=0
for req in (False,True):
    print('— AUTH_REQUIRED =',req)
    for n,ok in run(req):
        print('  ','✅' if ok else '❌',n); bad+= (not ok)
print('FALLITI:',bad); sys.exit(1 if bad else 0)
