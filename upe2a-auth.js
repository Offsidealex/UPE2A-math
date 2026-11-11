/* Compte élève commun Atelier Maths — mêmes identifiants Supabase que les Activités mentales.
   Les sessions UPE2A sont identifiées par module_key, sans modifier les autres applications. */
(function(){
"use strict";
  const SUPABASE_URL = "https://hxfdlujpedxuumqfewvn.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4ZmRsdWpwZWR4dXVtcWZld3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjcyMzAsImV4cCI6MjA5NzcwMzIzMH0.mM0xBhLGWG3vDgE06bEla8b4BhH7v6dvZ-BWn4ZOP0Q";
  const CLASS_NAMES = ["3PM", "2TNE1", "2TNE2", "2TNE3", "2REMI1", "2REMI2", "1CAP", "UE"];
  let currentEleve = null;
  let authSession = null;

  function saveSession(session, eleve) {
    authSession = session;
    currentEleve = eleve;
    sessionStorage.setItem("upe_auth_session", JSON.stringify(session));
    sessionStorage.setItem("upe_eleve", JSON.stringify(eleve));
  }

  // For automated tests, authenticate the dedicated TEST-IA pupil through the
  // existing Supabase Edge Function. No passwords are embedded in the website.
  async function loginTestStudent(pseudo, password) {
    if (typeof pseudo !== "string" || !pseudo || typeof password !== "string" || !password) {
      throw new Error("Identifiants de test requis.");
    }
    await studentAuth("login", pseudo, "TEST-IA", password);
    return loadEleve();
  }

  function loadEleve() {
    if (currentEleve) return currentEleve;
    try {
      const session = JSON.parse(sessionStorage.getItem("upe_auth_session"));
      const eleve = JSON.parse(sessionStorage.getItem("upe_eleve"));
      if (session && eleve && session.refresh_token) {
        authSession = session;
        currentEleve = eleve;
      }
    } catch (e) {}
    return currentEleve;
  }

  async function studentAuth(action, pseudo, classe, password) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/student-auth`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ action, pseudo, classe, password })
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || "Connexion impossible.");
    saveSession(result.session, result.eleve);
    document.dispatchEvent(new Event("upe2a:login"));
  }

  let refreshPromise = null;
  async function ensureStudentSession() {
    const saved=authSession, pupil=currentEleve;
    if(!saved||!pupil) throw new Error('Connexion élève requise.');
    if(saved.expires_at*1000>Date.now()+30000)return;
    if(refreshPromise?.session===saved)return refreshPromise.promise;
    const promise=(async()=>{
      const res=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{
        method:'POST',headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:saved.refresh_token})
      });
      if(!res.ok)throw new Error('Session expirée. Reconnecte-toi.');
      const next=await res.json();
      if(authSession!==saved||currentEleve!==pupil)throw new Error('Le compte a changé.');
      if(!next.access_token||!next.refresh_token)throw new Error('Session expirée. Reconnecte-toi.');
      saveSession({...next,expires_at:next.expires_at||Math.floor(Date.now()/1000)+Number(next.expires_in||3600)},pupil);
    })();
    refreshPromise={session:saved,promise};
    try{await promise}finally{if(refreshPromise?.promise===promise)refreshPromise=null}
  }

  async function sbQuery(table, method, body, params) {
    const eleve = loadEleve();
    if (!eleve || !authSession) throw new Error("Connexion élève requise.");
    await ensureStudentSession();
    if(currentEleve!==eleve)throw new Error("Le compte a changé.");
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ""}`, {
      method: method || "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${authSession.access_token}`,
        "Content-Type": "application/json",
        Prefer: method === "POST" ? "return=representation" : ""
      },
      body: body ? JSON.stringify(body) : null
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }


async function getSessions(){
 const eleve=loadEleve();if(!eleve)return [];
 const result=await sbQuery("sessions","GET",null,
  "?eleve_id=eq."+encodeURIComponent(eleve.id)+
  "&module_key=like.upe2a%3A%25&select=module_key,score,nb_questions,played_at&order=played_at.desc&limit=1000");
 return result.map(s=>{
   const bits=String(s.module_key||"").split(":");
   return {student_name:eleve.prenom,class_id:"SUPABASE",exercise_type:bits[1],
    level:bits.slice(2).join(":"),score:s.score,total:s.nb_questions,completed_at:s.played_at};
 });
}
async function saveResult(data){
 const eleve=loadEleve();if(!eleve)throw new Error("Connexion élève requise.");
 const result=await sbQuery("sessions","POST",{
  eleve_id:eleve.id,exercice:"UPE2A | "+data.exercise_type+" | Niveau "+data.level,
  module_key:"upe2a:"+data.exercise_type+":"+data.level,
  score:data.score,nb_questions:data.total,
  source:"activites_mentales"
 },"?select=id");
 return result[0].id;
}
function logout(){
 authSession=null;currentEleve=null;
 sessionStorage.removeItem("upe_auth_session");
 sessionStorage.removeItem("upe_eleve");
}
window.UPEAuth={studentAuth,loadEleve,getSessions,saveResult,logout};
})();
