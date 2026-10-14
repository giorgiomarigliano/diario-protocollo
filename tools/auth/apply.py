#!/usr/bin/env python3
"""Inserisce (o aggiorna) il modulo DP-AUTH in testa a <head> di index.html e v2.html. Idempotente.
Uso: python3 tools/auth/apply.py [--remove] [--required|--optional]"""
import re,sys,os
root=os.path.join(os.path.dirname(__file__),'..','..')
src=open(os.path.join(os.path.dirname(__file__),'dp-auth.js'),encoding='utf-8').read()
if '--required' in sys.argv: src=src.replace('var AUTH_REQUIRED = false;','var AUTH_REQUIRED = true; ',1)
B,E='<!-- DP-AUTH:BEGIN -->','<!-- DP-AUTH:END -->'
for f in ('index.html','v2.html'):
    p=os.path.join(root,f); s=open(p,encoding='utf-8').read()
    s=re.sub(re.escape(B)+r'.*?'+re.escape(E)+r'\n?','',s,flags=re.S)
    if '--remove' not in sys.argv:
        m=re.search(r'<head[^>]*>\n?',s); assert m,f
        s=s[:m.end()]+B+'\n<script>\n'+src+'</script>\n'+E+'\n'+s[m.end():]
    open(p,'w',encoding='utf-8').write(s); print(f,'ok',len(s))
