import {firebaseConfig} from './firebase-config.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInAnonymously,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,collection,doc,getDoc,setDoc,updateDoc,runTransaction,onSnapshot,serverTimestamp,arrayUnion} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const $=id=>document.getElementById(id), C={zagreb:'Riverside Zagreb · Championship',topala:'Golf Topala · Posušje',sarajevo:'VF Golf Course · Sarajevo (18)',sarajevo9:'VF Golf Course · Sarajevo (9)'};
let db,auth,user,roundId=null,roundData=null,roster=[],unsubscribe=[],busy=false,lastSent='',joining=false,localChangeTimer=null;
const configured=!!(firebaseConfig.apiKey&&!firebaseConfig.apiKey.includes('PASTE_')&&firebaseConfig.projectId&&!firebaseConfig.projectId.includes('PASTE_'));
const storageKey='golf-multiplayer-room-v2';
const status=(s,bad=false)=>{$('mp-error').textContent=s;$('mp-error').style.color=bad?'#aa3737':'#527261'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayDiff=d=>d===0?'E':d>0?'+'+d:''+d;
const readName=()=>($('mp-name').value||'').trim().slice(0,32);
const randomCode=()=>{const abc='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let b=new Uint8Array(12);crypto.getRandomValues(b);return [...b].map(x=>abc[x%abc.length]).join('')};
const roomRef=id=>doc(db,'rounds',id),memberRef=(id,uid)=>doc(db,'rounds',id,'players',uid);
const filled=s=>s.filter(Number.isInteger).length;
const tell=(s)=>{$('mp-sync').textContent=s};
function showRoom(){ $('mp-lobby').classList.add('mpgone');$('mp-active').classList.remove('mpgone');$('mp-indicator').textContent='Group round';$('course').disabled=true; document.dispatchEvent(new CustomEvent('golf:room-state',{detail:{active:true}})); }
function showLobby(){ $('mp-lobby').classList.remove('mpgone');$('mp-active').classList.add('mpgone');$('mp-indicator').textContent=configured?'Ready':'Setup needed';$('course').disabled=false; document.dispatchEvent(new CustomEvent('golf:room-state',{detail:{active:false}})); }
function clearSubs(){unsubscribe.forEach(f=>f());unsubscribe=[]}
function compute(p){let s=p.scores||[],pars=roundData?.pars||[];let stroke=0,par=0,holes=0;for(let i=0;i<Math.min(pars.length,s.length);i++)if(Number.isInteger(s[i])){stroke+=s[i];par+=pars[i];holes++}return {...p,stroke,diff:stroke-par,holes};}
function renderBoard(){
 const n=roundData?.pars?.length||18;
 const users=roster.map(p=>{
  const gross=compute(p);
  const handicap=Number.isInteger(p.handicap)?p.handicap:0;
  const finished=gross.holes===n;
  return {...gross,handicap,finished,net:finished?gross.stroke-handicap:null,netDiff:finished?gross.diff-handicap:null};
 }).sort((a,b)=>{
  // Finished rounds rank by net score. In-progress scores remain gross-only.
  if(a.finished!==b.finished)return a.finished?-1:1;
  if(a.finished)return a.netDiff-b.netDiff||a.stroke-b.stroke;
  return a.diff-b.diff||b.holes-a.holes;
 });
 $('mp-count').textContent=`${users.length} / 4 players`;
 $('mp-leaderboard').innerHTML=users.length?`<div style="overflow-x:auto"><table class="mplb"><thead><tr><th>#</th><th>Player</th><th>Thru</th><th>HCP</th><th>Gross</th><th>Net</th><th>Net ±</th></tr></thead><tbody>${users.map((p,i)=>`<tr><td>${i+1}</td><td>${escape(p.name)}${p.uid===user.uid?' (you)':''}</td><td>${p.holes}/${n}</td><td>${p.handicap}</td><td>${p.stroke} (${displayDiff(p.diff)})</td><td>${p.finished?p.net:'—'}</td><td><strong>${p.finished?displayDiff(p.netDiff):'—'}</strong></td></tr>`).join('')}</tbody></table></div><p class="mphelp">During play, scores are shown gross only. Net score = total gross strokes − playing handicap once all ${n} holes are completed. Finished players are listed first; final net standings are meaningful when everyone has finished.</p>`:'<p class="mphelp">Waiting for players…</p>';
}
function readHandicap(input){const v=Number($(input).value);if(!Number.isInteger(v)||v< -10||v>54)throw Error('Playing handicap must be a whole number between -10 and 54');return v;}

function listenRoom(id){clearSubs();unsubscribe.push(onSnapshot(roomRef(id),{includeMetadataChanges:true},snap=>{if(!snap.exists()){status('Round is no longer available.',true);return}roundData=snap.data();$('mp-round-course').textContent=C[roundData.courseId]||'Golf course';$('mp-code').textContent=id;const cached=snap.metadata.fromCache; $('mp-network').textContent=cached?'Offline / cached':'Online';$('mp-network').className=cached?'mpbadge offline':'mpbadge online';window.GolfTracker.selectCourse(roundData.courseId);tell(snap.metadata.hasPendingWrites?'Pending changes; syncing…':cached?'Offline — leaderboard may be outdated':'Scores synchronized');renderBoard();},e=>status('Cannot read round: '+e.message,true)));
 unsubscribe.push(onSnapshot(collection(db,'rounds',id,'players'),{includeMetadataChanges:true},snap=>{roster=snap.docs.map(d=>({uid:d.id,...d.data()}));renderBoard();const self=roster.find(p=>p.uid===user.uid);if(self&&!joining&&lastSent===''){ // Restore cloud score on re-entry only if local empty
 const current=window.GolfTracker.get();if(current.active===roundData?.courseId&&filled(current.scores)===0&&filled(self.scores||[])>0){joining=true;window.GolfTracker.setScores(roundData.courseId,self.scores);joining=false;}lastSent=JSON.stringify(self.scores||[]);
 }},e=>status('Cannot read leaderboard: '+e.message,true)));
}
async function enter(id){roundId=id;localStorage.setItem(storageKey,id);roster=[];lastSent='';showRoom();listenRoom(id);let u=new URL(location.href);u.searchParams.set('round',id);history.replaceState(null,'',u.toString());}
async function createRound(){if(!configured||!user)return status('Configure Firebase and sign in first.',true);let name=readName();if(!name)return status('Enter your display name first.',true);let handicap;try{handicap=readHandicap('mp-handicap')}catch(e){return status(e.message,true)}busy=true;$('mp-create-btn').disabled=true;try{let id=randomCode(),c=window.GolfTracker.get().active,pars=window.GolfTracker.getCourse(c).pars;let r=roomRef(id);await setDoc(r,{creatorUid:user.uid,memberUids:[user.uid],courseId:c,pars,createdAt:serverTimestamp(),state:'open'});await setDoc(memberRef(id,user.uid),{name,scores:Array(pars.length).fill(null),handicap,updatedAt:serverTimestamp()});localStorage.setItem('golf-mp-name',name);window.GolfTracker.setScores(c,Array(pars.length).fill(null));await enter(id);status('Round created. Invite friends using Share invite.');}catch(e){status('Could not create round: '+e.message,true)}finally{busy=false;$('mp-create-btn').disabled=false}}
async function joinRound(id){if(!configured||!user)return status('Firebase is not ready.',true);let name=readName();if(!name)return status('Enter your display name first.',true);let handicap;try{handicap=readHandicap('mp-join-handicap')}catch(e){return status(e.message,true)}id=id.trim().toUpperCase();if(!/^[A-Z2-9]{12}$/.test(id))return status('Enter a valid 12-character invitation code.',true);if(busy)return;busy=true;$('mp-join-btn').disabled=true;try{let r=roomRef(id),round=await getDoc(r);if(!round.exists())throw Error('Invitation code not found');const info=round.data();if(!C[info.courseId])throw Error('Unsupported golf course');if(info.state!=='open')throw Error('This round is closed');await runTransaction(db,async t=>{let fresh=await t.get(r);if(!fresh.exists())throw Error('Round unavailable');let m=fresh.data().memberUids||[];if(!m.includes(user.uid)){if(m.length>=4)throw Error('This round already has four players');t.update(r,{memberUids:arrayUnion(user.uid)})}});
 const pr=memberRef(id,user.uid),existing=await getDoc(pr);if(!existing.exists())await setDoc(pr,{name,scores:Array(info.pars.length).fill(null),handicap,updatedAt:serverTimestamp()});localStorage.setItem('golf-mp-name',name);const savedScores=existing.exists()?existing.data().scores:Array(info.pars.length).fill(null);joining=true;window.GolfTracker.setScores(info.courseId,savedScores);joining=false;await enter(id);status('Joined group. Your scoring screen is now linked.');}catch(e){status('Could not join: '+e.message,true)}finally{busy=false;$('mp-join-btn').disabled=false}}
async function syncScore(){if(!roundId||!user||joining||!roundData)return;const local=window.GolfTracker.get();if(local.active!==roundData.courseId)return;const val=JSON.stringify(local.scores);if(val===lastSent)return;lastSent=val;try{await updateDoc(memberRef(roundId,user.uid),{scores:local.scores,updatedAt:serverTimestamp()});tell(navigator.onLine?'Scores submitted · waiting for confirmation':'Offline · changes queued');}catch(e){lastSent='';tell('Sync error — '+e.message)}}
function queueSync(){clearTimeout(localChangeTimer);localChangeTimer=setTimeout(syncScore,450)}
function exitRoom(){clearSubs();roundId=null;roundData=null;roster=[];lastSent='';localStorage.removeItem(storageKey);let u=new URL(location.href);u.searchParams.delete('round');history.replaceState(null,'',u.toString());showLobby();status('Left the group view. Your membership and saved scores remain in the group.');}
$('mp-tab-create').onclick=()=>{$('mp-create').classList.remove('mpgone');$('mp-join').classList.add('mpgone');$('mp-tab-create').classList.add('selected');$('mp-tab-join').classList.remove('selected')};
$('mp-tab-join').onclick=()=>{$('mp-create').classList.add('mpgone');$('mp-join').classList.remove('mpgone');$('mp-tab-create').classList.remove('selected');$('mp-tab-join').classList.add('selected')};
$('mp-create-btn').onclick=createRound;$('mp-join-btn').onclick=()=>joinRound($('mp-code-input').value);
$('mp-copy').onclick=async()=>{try{await navigator.clipboard.writeText(roundId);status('Invitation code copied.')}catch(e){status('Code: '+roundId)}};
$('mp-share').onclick=async()=>{const u=new URL(location.href);u.searchParams.set('round',roundId);const text='Join my golf round: '+roundId+'\n'+u;if(navigator.share){try{await navigator.share({title:'Golf round invitation',text,url:u.toString()});return}catch(e){if(e.name==='AbortError')return}}try{await navigator.clipboard.writeText(text);status('Invitation copied. Send it in WhatsApp or Viber.')}catch(e){status('Send this link: '+u)}};
$('mp-leave').onclick=exitRoom;
document.addEventListener('golf:change',()=>{if(roundId&&!joining)queueSync()});
$('mp-name').value=localStorage.getItem('golf-mp-name')||'';
if(!configured){$('mp-indicator').textContent='Setup needed';$('mp-config-note').textContent='Multiplayer not activated yet. Add your Firebase web configuration in firebase-config.js and publish it, then these controls will become active.';$('mp-create-btn').disabled=true;$('mp-join-btn').disabled=true;}else{
$('mp-config-note').textContent='Connecting to the secure group database…';try{const app=initializeApp(firebaseConfig);auth=getAuth(app);db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});onAuthStateChanged(auth,async u=>{if(!u){try{await signInAnonymously(auth)}catch(e){status('Authentication error: '+e.message,true)}return}user=u;$('mp-config-note').textContent='Multiplayer connected. Enter your name and create or join a round.';$('mp-indicator').textContent='Ready';const invite=(new URL(location.href)).searchParams.get('round');const remembered=localStorage.getItem(storageKey);const target=invite||remembered;if(target){$('mp-tab-join').click();$('mp-code-input').value=target;const name=readName();if(name)joinRound(target);else status('Invitation ready. Enter your name, then Join group round.')} });}catch(e){status('Firebase initialization failed: '+e.message,true)}
}
window.addEventListener('online',()=>{if(roundId)tell('Back online · syncing queued scores')});window.addEventListener('offline',()=>{if(roundId)tell('Offline · scores are saved locally')});
