import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const $ = id => document.getElementById(id);
const euro = cents => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format((Number(cents)||0)/100);
let activeUid = null;
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function loadEarnMoney(user){
 activeUid=user.uid;
 const ws=await getDoc(doc(db,'wallets',user.uid)); const w=ws.exists()?ws.data():{};
 $('earn-available').textContent=euro(w.availableCents); $('earn-pending').textContent=euro(w.pendingCents); $('earn-total').textContent=euro(w.totalEarnedCents);
 const ls=await getDocs(query(collection(db,'walletLedger'),where('uid','==',user.uid)));
 const rows=ls.docs.map(d=>d.data()).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
 $('earn-ledger').innerHTML=rows.length?rows.map(x=>'<div class="earn-ledger-row"><span>'+esc(x.description||'Recompensa')+'</span><b>'+euro(x.amountCents)+'</b></div>').join(''):'<p class="muted">Todavía no hay movimientos.</p>';
 const os=await getDocs(query(collection(db,'affiliateOffers'),where('active','==',true)));
 $('earn-offers').innerHTML=os.empty?'<p class="muted">No hay ofertas disponibles por ahora.</p>':os.docs.map(d=>{const o=d.data();return '<article class="earn-offer"><div><b>'+esc(o.title||'Oferta')+'</b><p class="muted">'+esc(o.description||'Consulta las condiciones de la oferta.')+'</p></div><button class="outline" data-earn-offer="'+esc(d.id)+'" data-earn-url="'+esc(o.url||'')+'">Ver oferta ↗</button></article>';}).join('');
 const token=await user.getIdToken(true);
 const apiBase=String(window.WORLDCONNECT_EARN_API_URL||'').replace(/\\/$/,'');
 if(!apiBase) throw new Error('La API de retiradas todavía no está configurada.');
 const historyResponse=await fetch(apiBase+'/api/withdrawals',{headers:{Authorization:'Bearer '+token}});
 const historyData=await historyResponse.json().catch(()=>({}));
 if(!historyResponse.ok) throw new Error(historyData.error||'No se pudo cargar el historial de retiradas.');
 const requests=historyData.withdrawals||[];
 $('earn-withdraw-status').innerHTML=requests.length?requests.map(r=>'<div class="earn-ledger-row"><span>'+esc(new Date(r.createdAt||Date.now()).toLocaleDateString('es-ES'))+' · '+esc(r.status||'pending')+'</span><b>'+euro(r.amountCents)+'</b></div>').join(''):'Retirada mínima: 10 €. Las solicitudes se revisan manualmente.';
 $('earn-withdraw-form').querySelector('button').disabled=false;
}
onAuthStateChanged(auth,user=>{if(user)loadEarnMoney(user).catch(e=>{console.error(e);$('earn-ledger').textContent='No se pudieron cargar los datos.';});else activeUid=null;});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-earn-offer]');if(!b||!activeUid)return;const url=b.dataset.earnUrl;if(!/^https:\/\//i.test(url))return alert('Esta oferta todavía no tiene un enlace válido.');try{await addDoc(collection(db,'affiliateClicks'),{uid:activeUid,offerId:b.dataset.earnOffer,createdAt:serverTimestamp()});window.open(url,'_blank','noopener,noreferrer');}catch(err){alert('No se pudo registrar el clic: '+err.message);}});
$('earn-withdraw-form')?.addEventListener('submit',async e=>{e.preventDefault();if(!activeUid||!auth.currentUser)return;const cents=Math.round(Number($('earn-withdraw-amount').value)*100),method=$('earn-payout-method').value,details=$('earn-payout-details').value.trim();if(!Number.isSafeInteger(cents)||cents<1000)return alert('La retirada mínima es 10 €.');const button=e.target.querySelector('button');button.disabled=true;try{const token=await auth.currentUser.getIdToken(true),apiBase=String(window.WORLDCONNECT_EARN_API_URL||'').replace(/\\/$/,'');if(!apiBase)throw new Error('La API de retiradas todavía no está configurada.');const response=await fetch(apiBase+'/api/withdrawals',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({amountCents:cents,method,payoutDetails:details})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'No se pudo enviar la solicitud.');alert('Solicitud enviada. El importe se ha reservado y el equipo la revisará manualmente.');e.target.reset();await loadEarnMoney(auth.currentUser);}catch(err){button.disabled=false;alert('No se pudo enviar: '+err.message);}});