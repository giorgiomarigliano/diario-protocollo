const acorn=require('acorn'),fs=require('fs'),path=require('path');
const SRC=process.argv[2]||path.join(__dirname,'..','..','v2.html'),OUT=process.argv[3]||path.join(__dirname,'.build','instr.html');fs.mkdirSync(path.dirname(OUT),{recursive:true});const src=fs.readFileSync(SRC,'utf8');
const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let out='',last=0,m,nblocks=0,fails=[];
while((m=re.exec(src))){
  const start=m.index+m[0].indexOf('>')+1, code=m[1];
  const baseLine=src.slice(0,start).split('\n').length-1;
  let ast;
  try{ast=acorn.parse(code,{ecmaVersion:'latest',locations:true,allowReturnOutsideFunction:true});}catch(e){fails.push(e.message);continue}
  const edits=[];
  const walk=(n,parent,key)=>{
    if(!n||typeof n.type!=='string')return;
    if(n.type==='MemberExpression'&&!n.computed&&!n.optional&&n.property.type==='Identifier'){
      let skip=false;
      if(parent){
        if(parent.type==='AssignmentExpression'&&key==='left')skip=true;
        if(parent.type==='UpdateExpression')skip=true;
        if(parent.type==='UnaryExpression'&&parent.operator==='delete')skip=true;
        if(parent.type==='CallExpression'&&key==='callee')skip=true;
        if(parent.type==='ForInStatement'&&key==='left'||parent.type==='ForOfStatement'&&key==='left')skip=true;
        if((parent.type==='ArrayPattern'||parent.type==='Property'&&key==='value'&&parent._pat))skip=true;
      }
      if(n.object.type==='Super')skip=true;
      if(!skip){
        const line=baseLine+n.loc.start.line;
        edits.push({pos:n.start,text:`__g(`,del:0});
        let dp=n.property.start-1;while(code[dp]!=='.')dp--;edits.push({pos:dp,text:`,"${n.property.name}",${line})`,del:n.end-dp});
      }
    }
    for(const k of Object.keys(n)){
      if(k==='loc'||k==='_pat')continue;
      const v=n[k];
      if(Array.isArray(v))v.forEach(c=>{if(c&&typeof c.type==='string'){walk(c,n,k)}});
      else if(v&&typeof v.type==='string')walk(v,n,k);
    }
  };
  walk(ast,null,null);
  edits.sort((a,b)=>a.pos-b.pos||(a.del-b.del));
  // apply from end
  let c=code;
  // stable: process descending by pos; for equal pos, insertion order matter -> ensure inserts at same pos nest properly (outer first)
  const withIdx=edits.map((e,i)=>({...e,i}));
  withIdx.sort((a,b)=>b.pos-a.pos||b.i-a.i);
  for(const e of withIdx){c=c.slice(0,e.pos)+e.text+c.slice(e.pos+e.del);}
  out+=src.slice(last,start)+c;last=start+code.length;nblocks++;
}
out+=src.slice(last);
const rt=`<script>(function(){window.__miss={};window.__tot={};window.__g=function(o,k,l){if(o!==null&&o!==undefined&&typeof o==='object'){var q=k+'@'+l;window.__tot[q]=(window.__tot[q]||0)+1;}if(o!==null&&o!==undefined&&typeof o==='object'&&!(o instanceof Node)&&!(o instanceof Event)&&!(k in o)){var t=Array.isArray(o)?'array':'obj';var key=k+'@'+l;var r=window.__miss[key]||(window.__miss[key]={k:k,l:l,n:0,t:t,keys:''});r.n++;if(!r.keys)r.keys=Object.keys(o).slice(0,14).join(',');}return o[k];};})();</script>`;
out=out.replace('</head>',rt+'</head>');
fs.writeFileSync(OUT,out);
console.log('blocks',nblocks,'fails',fails);
