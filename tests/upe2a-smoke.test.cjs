const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)].filter(m=>!/\\bsrc\\s*=/.test(m[1])).map(m=>m[2]);
test('scripts syntactically valid',()=>{assert.equal(scripts.length,2);scripts.forEach((s,i)=>assert.doesNotThrow(()=>new vm.Script(s,{filename:'inline-'+i})));});
function boot(){
 const storage=new Map(),elements=new Map();
 function el(id){if(!elements.has(id)){const tag=html.match(new RegExp('<[^>]+id="'+id+'"[^>]*>'))?.[0]||'';const set=new Set((tag.match(/class="([^"]*)"/)?.[1]||'').split(/\\s+/).filter(Boolean));elements.set(id,{id,value:'',textContent:'',disabled:false,style:{},classList:{add:(...v)=>v.forEach(x=>set.add(x)),remove:(...v)=>v.forEach(x=>set.delete(x)),contains:x=>set.has(x),toggle:(x,v)=>{if(v===undefined)v=!set.has(x);v?set.add(x):set.delete(x);return v;}},addEventListener(){},set innerHTML(x){this._html=x;this.buttons=[...x.matchAll(/<button\\b/g)].map(()=>({disabled:false,classList:{add(){},remove(){}}}));},get innerHTML(){return this._html||'';}});}return elements.get(id);}
 for(const m of html.matchAll(/\\bid="([^"]+)"/g))el(m[1]);
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const document={getElementById:el,documentElement:{classList:{contains(){return false},toggle(){}}},querySelectorAll:()=>el('levels-list').buttons||[]};
 const ctx={document,localStorage,window:null,console,Math,Date,alert:()=>{},matchMedia:()=>({matches:false})};ctx.window=ctx;
 const context=vm.createContext(ctx);
 vm.runInContext(scripts[0],context);
 return {run:s=>vm.runInContext(s,context),el,storage};
}
test('login and 80 percent unlock',()=>{
 const a=boot();assert.equal(a.el('screen-login').classList.contains('hidden'),false);
 a.el('input-name').value='Ana';a.el('input-code').value='UPE2A';a.run('doLogin()');
 assert.equal(a.run('user.name'),'Ana');assert.equal(a.el('screen-menu').classList.contains('hidden'),false);
 assert.equal(a.run("levelUnlocked('additions',2)"),false);
 a.run("quiz={score:8,questions:Array(10).fill({}),type:'additions',level:'1'};finishQuiz()");
 assert.equal(a.run("levelUnlocked('additions',2)"),true);
 assert.equal(a.run('getSessions().length'),1);
});
test('score 7/10 does not unlock',()=>{
 const a=boot();a.el('input-name').value='Ana';a.el('input-code').value='UPE2A';a.run('doLogin()');
 a.run("quiz={score:7,questions:Array(10).fill({}),type:'additions',level:'1'};finishQuiz()");
 assert.equal(a.run("levelUnlocked('additions',2)"),false);
});
test('design and accessibility',()=>{
 assert.match(html,/atelier-header/);assert.match(html,/atelierToggleTheme/);
 for(const c of ['bg-cyan-50','bg-emerald-50','bg-pink-50'])assert.ok(html.includes('.atelier-dark .'+c));
});
