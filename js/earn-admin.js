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
 const status=$('earn-admin-status'); if(!status)return;
 status.textContent='Cargando…';
 try{
  const data=await api('/api/admin/summary');
  let finance=$('earn-admin-financials');
  if(!finance){
   finance=document.createElement('section');
   finance.id='earn-admin-financials';
   finance.className='earn-summary';
   status.insertAdjacentElement('afterend',finance);
  }
  const f=data.financials||{}, pw=data.platformWallet||{};
  if($('platform-available')) $('platform-available').textContent=money(pw.availableCents);
  if($('platform-pending')) $('platform-pending').textContent=money(pw.pendingWithdrawCents);
  if($('platform-total')) $('platform-total').textContent=money(pw.totalEarnedCents);
  if($('platform-withdrawals')) $('platform-withdrawals').innerHTML=(data.platformWithdrawals||[]).map(w=>'<div class="earn-ledger-row"><span>'+money(w.amountCents)+' · '+esc(w.method)+' · '+esc(w.payoutDetails)+'</span><span><button class="outline" data-platform-withdraw="'+esc(w.id)+'" data-withdraw-action="paid">Marcar pagada</button> <button class="outline" data-platform-withdraw="'+esc(w.id)+'" data-withdraw-action="rejected">Rechazar</button></span></div>').join('')||'<p class="muted">No hay solicitudes pendientes.</p>';
  finance.innerHTML=[
   ['Comisiones netas',money(f.netCommissionCents)],
   ['Recompensas usuarios (60 %)',money(f.userShareCents)],
   ['Ingresos plataforma (40 %)',money(f.platformShareCents)],
   ['Comisiones registradas',String(Number(f.commissionCount)||0)]
  ].map(([label,value])=>'<div class="panel"><small>'+label+'</small><strong>'+esc(value)+'</strong></div>').join('');
  $('earn-admin-offers').innerHTML=(data.offers||[]).map(o=>'<div class="earn-ledger-row"><span><b>'+esc(o.title)+'</b> · '+esc(o.network)+' · '+(o.active?'Activa':'Inactiva')+' · aprobación: '+(o.termsApproved?'sí':'no')+'</span><button class="outline" data-toggle-offer="'+esc(o.id)+'" data-active="'+(!o.active)+'">'+(o.active?'Desactivar':'Activar')+'</button></div>').join('')||'<p class="muted">No hay ofertas.</p>';
  $('earn-admin-withdrawals').innerHTML=(data.withdrawals||[]).map(w=>'<div class="earn-ledger-row"><span>'+esc(w.uid)+' · '+money(w.amountCents)+' · '+esc(w.method)+' · '+esc(w.payoutDetails)+'</span><span><button class="outline" data-withdraw="'+esc(w.id)+'" data-withdraw-action="paid">Marcar pagada</button> <button class="outline" data-withdraw="'+esc(w.id)+'" data-withdraw-action="rejected">Rechazar</button></span></div>').join('')||'<p class="muted">No hay solicitudes pendientes.</p>';
  status.textContent='Panel conectado. '+(data.offers||[]).length+' ofertas; '+(data.withdrawals||[]).length+' retiradas pendientes.';
 }catch(e){status.textContent=e.message;}
}
$('earn-admin-offer-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/admin/offers',{method:'POST',body:JSON.stringify({title:$('earn-admin-title').value,description:$('earn-admin-description').value,network:$('earn-admin-network').value,url:$('earn-admin-url').value,active:$('earn-admin-active').checked,termsApproved:$('earn-admin-approved').checked})});e.target.reset();await refresh();}catch(x){alert(x.message);}});
$('platform-withdraw-form')?.addEventListener('submit',async e=>{
 e.preventDefault();
 try{
  const result=await api('/api/admin/platform-withdrawals',{method:'POST',body:JSON.stringify({
   amountCents:Math.round(Number($('platform-withdraw-amount').value)*100),
   method:$('platform-payout-method').value,
   payoutDetails:$('platform-payout-details').value.trim()
  })});
  alert('Solicitud de retirada creada: '+result.id);
  e.target.reset();
  await refresh();
 }catch(x){alert(x.message);}
});
$('earn-admin-commission-form')?.addEventListener('submit',async e=>{e.preventDefault();try{const result=await api('/api/admin/commissions',{method:'POST',body:JSON.stringify({uid:$('earn-admin-uid').value.trim(),externalId:$('earn-admin-external').value.trim(),netCommissionCents:Math.round(Number($('earn-admin-net').value)*100)})});alert('Acreditado '+money(result.creditedCents)+' al usuario; '+money(result.platformCents)+' para WorldConnect.');e.target.reset();}catch(x){alert(x.message);}});
document.addEventListener('click',async e=>{
 const t=e.target.closest('[data-toggle-offer]'); if(t){try{await api('/api/admin/offers/'+encodeURIComponent(t.dataset.toggleOffer),{method:'PATCH',body:JSON.stringify({active:t.dataset.active==='true'})});await refresh();}catch(x){alert(x.message);}return;}
 const w=e.target.closest('[data-withdraw][data-withdraw-action]'); if(w){const action=w.dataset.withdrawAction;if(action!=='paid'&&action!=='rejected')return;const message=action==='paid'?'¿Confirmas que has realizado la transferencia antes de marcarla pagada?':'¿Confirmas que deseas rechazar esta solicitud y devolver el importe al saldo disponible del usuario?';if(!confirm(message))return;try{await api('/api/admin/withdrawals/'+encodeURIComponent(w.dataset.withdraw),{method:'PATCH',body:JSON.stringify({status:action})});await refresh();}catch(x){alert(x.message);}return;}
 const pw=e.target.closest('[data-platform-withdraw][data-withdraw-action]'); if(pw){const action=pw.dataset.withdrawAction;if(action!=='paid'&&action!=='rejected')return;const message=action==='paid'?'Confirma que la transferencia de fondos de plataforma ya se ha completado.':'¿Confirmas que deseas rechazar esta solicitud de retirada de plataforma y devolver el importe al saldo disponible?';if(!confirm(message))return;try{await api('/api/admin/platform-withdrawals/'+encodeURIComponent(pw.dataset.platformWithdraw)+'/'+action,{method:'PATCH',body:JSON.stringify({status:action})});await refresh();}catch(x){alert(x.message);}}
});
$('earn-admin-refresh')?.addEventListener('click',refresh);
onAuthStateChanged(auth,user=>{if(user&&location.hash==='#admin')refresh();});
window.addEventListener('hashchange',()=>{if(location.hash==='#admin'&&auth.currentUser)refresh();});
