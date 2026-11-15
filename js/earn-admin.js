import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
const $=id=>document.getElementById(id);
const apiBase=()=>String(window.WORLDCONNECT_EARN_API_URL||'').replace(/\/$/,'');
async function api(path,options={}) {
 const base=apiBase(); if(!base) throw new Error('Configura WORLDCONNECT_EARN_API_URL después de desplegar Cloudflare Worker.');
 const user=auth.currentUser; if(!user) throw new Error('Inicia sesión.');
 const token=await user.getIdToken(true);
 const r=await fetch(base+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...options.headers}});
 const data=await r.json().catch(()=>({}));
 if(!r.ok) throw new Error(data.error||'Error en API');
 return data;
}
function money(c){return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format((Number(c)||0)/100);}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function refresh(){
 const status=$('earn-admin-status');
 if(status) status.textContent='Cargando…';
 try{
  const data=await api('/api/admin/summary');
  let finance=$('earn-admin-financials');
  if(!finance){
   finance=document.createElement('section');
   finance.id='earn-admin-financials';
   finance.className='earn-summary';
   const anchor=status||$('page-admin-finances');
   if(anchor) anchor.insertAdjacentElement(status?'afterend':'beforeend',finance);
  }
  const f=data.financials||{};
  finance.innerHTML=[
   ['Comisiones netas',money(f.netCommissionCents)],
   ['Recompensas usuarios (60 %)',money(f.userShareCents)],
   ['Ingresos plataforma (40 %)',money(f.platformShareCents)],
   ['Comisiones registradas',String(Number(f.commissionCount)||0)]
  ].map(([label,value])=>'<div class="panel"><small>'+label+'</small><strong>'+esc(value)+'</strong></div>').join('');
  const pw=data.platformWallet||{};
  const platformBalance=$('earn-admin-platform-balance'); if(platformBalance) platformBalance.innerHTML=[['Disponible',money(pw.availableCents)],['Reservado',money(pw.pendingWithdrawCents)],['Total acumulado',money(pw.totalEarnedCents)]].map(([label,value])=>'<div class="panel"><small>'+label+'</small><strong>'+esc(value)+'</strong></div>').join('');
  const platformRequests=$('earn-admin-platform-withdrawals'); if(platformRequests) platformRequests.innerHTML=(data.platformWithdrawals||[]).map(w=>'<div class="earn-ledger-row"><span>'+money(w.amountCents)+' · '+esc(w.method)+' · '+esc(w.payoutDetails)+'</span><span><button class="outline" data-platform-withdraw="'+esc(w.id)+'" data-status="paid">Confirmar transferencia realizada</button> <button class="outline" data-platform-withdraw="'+esc(w.id)+'" data-status="rejected">Rechazar</button></span></div>').join('')||'<p class="muted">No hay solicitudes de plataforma pendientes.</p>';
  const offersEl=$('earn-admin-offers'); if(offersEl) offersEl.innerHTML=(data.offers||[]).map(o=>'<div class="earn-ledger-row"><span><b>'+esc(o.title)+'</b> · '+esc(o.network)+' · '+(o.active?'Activa':'Inactiva')+' · aprobación: '+(o.termsApproved?'sí':'no')+'</span><button class="outline" data-toggle-offer="'+esc(o.id)+'" data-active="'+(!o.active)+'">'+(o.active?'Desactivar':'Activar')+'</button></div>').join('')||'<p class="muted">No hay ofertas.</p>';
  const userRequests=$('earn-admin-withdrawals'); if(userRequests) userRequests.innerHTML=(data.withdrawals||[]).map(w=>'<div class="earn-ledger-row"><span>'+esc(w.uid)+' · '+money(w.amountCents)+' · '+esc(w.method)+' · '+esc(w.payoutDetails)+'</span><span><button class="outline" data-withdraw="'+esc(w.id)+'" data-status="paid">Marcar pagada</button> <button class="outline" data-withdraw="'+esc(w.id)+'" data-status="rejected">Rechazar</button></span></div>').join('')||'<p class="muted">No hay solicitudes pendientes.</p>';
  if(status) status.textContent='Panel conectado. '+(data.offers||[]).length+' ofertas; '+(data.withdrawals||[]).length+' retiradas pendientes.';
 }catch(e){status.textContent=e.message;}
}
$('earn-admin-offer-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/admin/offers',{method:'POST',body:JSON.stringify({title:$('earn-admin-title').value,description:$('earn-admin-description').value,network:$('earn-admin-network').value,url:$('earn-admin-url').value,active:$('earn-admin-active').checked,termsApproved:$('earn-admin-approved').checked})});e.target.reset();await refresh();}catch(x){alert(x.message);}});
$('earn-admin-commission-form')?.addEventListener('submit',async e=>{e.preventDefault();try{const result=await api('/api/admin/commissions',{method:'POST',body:JSON.stringify({uid:$('earn-admin-uid').value.trim(),externalId:$('earn-admin-external').value.trim(),netCommissionCents:Math.round(Number($('earn-admin-net').value)*100)})});alert('Acreditado '+money(result.creditedCents)+' al usuario; '+money(result.platformCents)+' para WorldConnect.');e.target.reset();}catch(x){alert(x.message);}});
$('earn-admin-platform-withdraw-form')?.addEventListener('submit',async e=>{e.preventDefault();try{const result=await api('/api/admin/platform-withdrawals',{method:'POST',body:JSON.stringify({amountCents:Math.round(Number($('earn-admin-platform-amount').value)*100),payoutDetails:$('earn-admin-platform-iban').value.trim()})});alert('Solicitud de retirada de prueba creada: '+result.id);e.target.reset();await refresh();}catch(x){alert(x.message);}});
document.addEventListener('click',async e=>{
 const t=e.target.closest('[data-toggle-offer]'); if(t){try{await api('/api/admin/offers/'+encodeURIComponent(t.dataset.toggleOffer),{method:'PATCH',body:JSON.stringify({active:t.dataset.active==='true'})});await refresh();}catch(x){alert(x.message);}return;}
 const w=e.target.closest('[data-withdraw]'); if(w){if(!confirm('¿Confirmas que has realizado la transferencia antes de marcarla pagada?'))return;try{await api('/api/admin/withdrawals/'+encodeURIComponent(w.dataset.withdraw),{method:'PATCH',body:JSON.stringify({status:w.dataset.status})});await refresh();}catch(x){alert(x.message);}}
});
document.addEventListener('click',async e=>{const pw=e.target.closest('[data-platform-withdraw]');if(!pw)return;if(pw.dataset.status==='paid'&&!confirm('Simulación: marcar como pagada. No se envía dinero.'))return;try{await api('/api/admin/platform-withdrawals/'+encodeURIComponent(pw.dataset.platformWithdraw),{method:'PATCH',body:JSON.stringify({status:pw.dataset.status})});await refresh();}catch(x){alert(x.message);}});
$('earn-admin-refresh')?.addEventListener('click',refresh);
onAuthStateChanged(auth,user=>{if(user&&(location.hash==='#admin'||location.hash==='#admin-finances'))refresh();});
window.addEventListener('hashchange',()=>{if((location.hash==='#admin'||location.hash==='#admin-finances')&&auth.currentUser)refresh();});
