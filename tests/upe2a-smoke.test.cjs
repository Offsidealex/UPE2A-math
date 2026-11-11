const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/\bsrc\s*=/.test(m[1])).map(m=>m[2]);
test('scripts syntactically valid',()=>{assert.equal(scripts.length,2);scripts.forEach((s,i)=>assert.doesNotThrow(()=>new vm.Script(s,{filename:'inline-'+i})));});
function boot({remote=[], failSave=false}={}) {
 const storage=new Map(),elements=new Map();
 const student={id:'pupil-1',prenom:'Ana'},saved=[];
 let loggedIn=false;
 function el(id){
  if(!elements.has(id)){
   const tag=html.match(new RegExp('<[^>]+id="'+id+'"[^>]*>'))?.[0]||'';
   const set=new Set((tag.match(/class="([^"]*)"/)?.[1]||'').split(/\s+/).filter(Boolean));
   elements.set(id,{id,value:'',textContent:'',disabled:false,style:{},
    classList:{add:(...v)=>v.forEach(x=>set.add(x)),remove:(...v)=>v.forEach(x=>set.delete(x)),
      contains:x=>set.has(x),toggle:(x,v)=>{if(v===undefined)v=!set.has(x);v?set.add(x):set.delete(x);return v;}},
    addEventListener(){},focus(){},set innerHTML(x){this._html=x;this.buttons=[...x.matchAll(/<button\b/g)].map(()=>({disabled:false,classList:{add(){},remove(){}}}));},
    get innerHTML(){return this._html||'';}});
  }
  return elements.get(id);
 }
 for(const m of html.matchAll(/\\bid="([^"]+)"/g))el(m[1]);
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const auth={
  loadEleve:()=>loggedIn?student:null,
  async studentAuth(action,pseudo,classe,password){
   assert.ok(['login','register'].includes(action));
   assert.equal(pseudo,'Ana');assert.equal(classe,'UPE2A');assert.equal(password,'password123');
   loggedIn=true;
  },
  async getSessions(){return [...remote,...saved].map(s=>({...s,student_name:'Ana',class_id:'SUPABASE'}));},
  async saveResult(row){if(failSave)throw new Error('network');saved.push(row);return 'saved';},
  logout(){loggedIn=false;}
 };
 const document={getElementById:el,documentElement:{classList:{contains(){return false},toggle(){}}},querySelectorAll:()=>el('levels-list').buttons||[],addEventListener(){}};
 const ctx={document,localStorage,window:null,console,Math,Date,alert:()=>{},matchMedia:()=>({matches:false}),UPEAuth:auth};
 ctx.window=ctx;ctx.addEventListener=()=>{};
 const context=vm.createContext(ctx);
 vm.runInContext(scripts[0],context);
 async function login(){
  el('input-name').value='Ana';el('input-code').value='UPE2A';el('input-password').value='password123';
  await vm.runInContext('doLogin()',context);
 }
 return {run:s=>vm.runInContext(s,context),el,storage,login,auth,saved};
}
test('login uses shared Supabase account and unlocks at 80 percent',async()=>{
 const a=boot();assert.equal(a.el('screen-login').classList.contains('hidden'),true);
 a.run('openLogin()');assert.equal(a.el('screen-login').classList.contains('hidden'),false);
 await a.login();
 assert.equal(a.run('user.name'),'Ana');
 assert.equal(a.el('screen-menu').classList.contains('hidden'),false);
 assert.equal(a.el('screen-login').classList.contains('hidden'),true);
 assert.equal(a.run("levelUnlocked('additions',2)"),false);
 a.run("quiz={score:8,questions:Array(10).fill({}),type:'additions',level:'1'};finishQuiz()");
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.run("levelUnlocked('additions',2)"),true);
 assert.equal(a.run('getSessions().length'),1);
});
test('score 7/10 does not unlock',async()=>{
 const a=boot();await a.login();
 a.run("quiz={score:7,questions:Array(10).fill({}),type:'additions',level:'1'};finishQuiz()");
 assert.equal(a.run("levelUnlocked('additions',2)"),false);
});
test('saved progress is loaded from Supabase on another device',async()=>{
 const a=boot({remote:[{exercise_type:'additions',level:'1',score:8,total:10,completed_at:'2026-11-11T13:00:00Z'}]});
 await a.login();
 assert.equal(a.run("levelUnlocked('additions',2)"),true);
});
test('guest can use exercises and open/close connection dialog',()=>{
 const a=boot();
 assert.equal(a.run('user.classId'),'INVITE');
 assert.equal(a.el('screen-menu').classList.contains('hidden'),false);
 a.run('openLogin()');
 assert.equal(a.el('screen-login').classList.contains('hidden'),false);
 a.run('closeLogin()');
 assert.equal(a.el('screen-login').classList.contains('hidden'),true);
 a.run("quiz={score:8,questions:Array(10).fill({}),type:'additions',level:'1'};finishQuiz()");
 assert.equal(a.run("levelUnlocked('additions',2)"),true);
});
test('logout returns to independent guest profile',async()=>{
 const a=boot();await a.login();
 a.run('logout()');
 assert.equal(a.run('user.classId'),'INVITE');
 assert.equal(a.el('header-login-btn').classList.contains('hidden'),false);
 assert.equal(a.el('header-logout-btn').classList.contains('hidden'),true);
});
test('design and accessibility',()=>{
 assert.match(html,/atelier-header/);assert.match(html,/atelierToggleTheme/);
 for(const c of ['bg-cyan-50','bg-emerald-50','bg-pink-50'])assert.ok(html.includes('.atelier-dark .'+c));
});
