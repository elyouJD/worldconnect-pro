import { configured } from './firebase-config.js';
import { uploadImage, uploadPostMedia } from './cloudinary.js';
import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  updateProfile, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const state = { user:null, profiles:[], likes:[], matches:[], conversations:[], notifications:[], chatId:null, chatUser:null, unsubUsers:null, unsubLikes:null, unsubMatches:null, unsubChats:null, unsubNotifications:null, unsubMessages:null, presenceTimer:null, online:false, knownNotificationIds:new Set(), mediaRecorder:null, audioChunks:[], follows:[], friendRequests:[], friendships:[], posts:[], socialTab:'friends', unsubFollows:null, unsubFollowers:null, unsubRequests:null, unsubRequestsSent:null, unsubFriends:null, unsubPosts:null };
const avatar = name => (name || '?').trim().charAt(0).toUpperCase();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3200); }
function authView(tab='login'){ $('#auth').classList.remove('hide'); $('#app').classList.add('hide'); $$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); $('#login-form').classList.toggle('hide',tab!=='login'); $('#register-form').classList.toggle('hide',tab!=='register'); }
function appView(){ $('#auth').classList.add('hide'); $('#app').classList.remove('hide'); $('#demo')?.classList.add('hide'); $('#mini-name').textContent=state.user.name||'Usuario'; $('#mini-country').textContent=state.user.country||''; $('#mini-avatar').textContent=avatar(state.user.name); $('#admin-link').classList.toggle('hide',!state.user.isAdmin); fillProfile(); }
function fillProfile(){const u=state.user; $('#p-name').value=u.name||''; $('#p-country').value=u.country||''; $('#p-city').value=u.city||''; $('#p-bio').value=u.bio||''; $('#p-purpose').value=u.purpose||'both'; $('#p-interests').value=(u.interests||[]).join(', '); if(u.photoURL){$('#photo').style.backgroundImage=`url('${u.photoURL}')`;$('#photo').textContent='';}else{$('#photo').textContent=avatar(u.name);}}
function route(page){const allowed=['discover','likes','matches','chat','profile','settings','admin','community','feed','earn-money']; if(!allowed.includes(page))page='discover'; if(page==='admin'&&!state.user?.isAdmin){toast('Acceso restringido');page='discover';} $$('.page').forEach(el=>el.classList.toggle('hide',el.id!==`page-${page}`)); $$('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page)); $('#page-title').textContent=({discover:'Descubrir',likes:'Me gustas',matches:'Conexiones',chat:'Mensajes',profile:'Mi perfil',settings:'Ajustes',admin:'Administración',community:'Amigos',feed:'Publicaciones','earn-money':'Earn Money'})[page]; if(page==='discover')renderDiscover(); if(page==='likes')renderLikes(); if(page==='matches')renderMatches(); if(page==='chat')renderChatList(); if(page==='community')renderSocialList(); if(page==='feed')renderFeed(); if(location.hash!==`#${page}`)history.replaceState(null,'',`#${page}`); $('#sidebar').classList.remove('open');}
function profileCard(u){
  const isOnline=u.online===true && u.lastSeen?.toMillis ? Date.now()-u.lastSeen.toMillis()<120000 : false;
  const liked=state.likes.some(x=>x.toUid===u.uid);
  const following=state.follows.some(x=>x.followingUid===u.uid);
  const requestSent=state.friendRequests.some(x=>x.fromUid===state.user.uid&&x.toUid===u.uid&&x.status==='pending');
  const alreadyFriend=state.friendships.some(x=>(x.participants||[]).includes(u.uid));
  const image=u.photoURL?`<img src="${esc(u.photoURL)}" alt="">`:`<span class="fallback-avatar">${esc(avatar(u.name))}</span>`;
  return `<article class="card"><div class="cover profile-cover">${image}<span class="online ${isOnline?'':'offline'}">● ${isOnline?'En línea':'Desconectado'}</span><span class="country-tag">${esc(u.country||'')} ${u.city?'· '+esc(u.city):''}</span></div><div class="card-body"><div class="card-title"><h3>${esc(u.name||'Usuario')}${u.age?`, ${esc(u.age)}`:''}</h3><small>18+</small></div><p class="bio">${esc(u.bio||'Este usuario todavía no ha añadido una descripción.')}</p><div class="tags">${(u.interests||[]).slice(0,4).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="actions"><button class="like ${liked?'liked':''}" data-like="${esc(u.uid)}" ${liked?'disabled':''}>${liked?'♥ Interés enviado':'♡ Me gusta'}</button><button class="outline" data-follow="${esc(u.uid)}">${following?'Siguiendo ✓':'＋ Seguir'}</button>${alreadyFriend?'<button class="outline" disabled>✓ Amigos</button>':`<button class="outline" data-friend="${esc(u.uid)}" ${requestSent?'disabled':''}>${requestSent?'Solicitud enviada':'＋ Añadir amigo'}</button>`}<button class="outline" data-open-chat="${esc(u.uid)}">✉ Enviar mensaje</button></div></div></article>`;
}
function visibleProfiles(){return state.profiles.filter(p=>p.uid!==state.user.uid && p.status==='active' && p.visibility!=='hidden' && !state.user.blockedUids?.includes(p.uid));}
function renderDiscover(){const q=($('#search')?.value||'').toLowerCase(),country=$('#country')?.value||'',purpose=$('#purpose')?.value||'';const list=visibleProfiles().filter(p=>(!q||`${p.name||''} ${p.bio||''} ${(p.interests||[]).join(' ')}`.toLowerCase().includes(q))&&(!country||p.country===country)&&(!purpose||p.purpose===purpose||p.purpose==='both'));$('#total').textContent=`${list.length} perfiles reales`;$('#people').innerHTML=list.length?list.map(profileCard).join(''):'<div class="empty">Todavía no hay otros perfiles. Comparte el enlace de WorldConnect para invitar a tus amigos.</div>';}
function renderLikes(){const liked=state.likes.map(l=>state.profiles.find(p=>p.uid===l.toUid)).filter(Boolean);$('#likes').innerHTML=liked.length?liked.map(profileCard).join(''):'<div class="empty">Todavía no has enviado ningún me gusta.</div>';$('#like-count').textContent=state.likes.length;}
function renderMatches(){const people=state.matches.map(m=>state.profiles.find(p=>p.uid===(m.participants||[]).find(id=>id!==state.user.uid))).filter(Boolean);$('#matches').innerHTML=people.length?people.map(profileCard).join(''):'<div class="empty">Aún no tienes conexiones mutuas. Cuando dos personas se gusten, aparecerán aquí.</div>';}

function renderChatList(){
  const items=[...(state.conversations||[])].sort((a,b)=>(b.updatedAt?.toMillis?.()||0)-(a.updatedAt?.toMillis?.()||0));
  $('#chat-list').innerHTML=items.map(c=>{
    const otherUid=(c.participants||[]).find(id=>id!==state.user.uid);
    const u=state.profiles.find(p=>p.uid===otherUid);
    if(!u)return '';
    const unread=Number(c.unreadCounts?.[state.user.uid]||0);
    const preview=esc(c.lastMessage||'Nueva conversación');
    return `<button class="chat-person ${state.chatId===c.id?'active':''}" data-chat-id="${esc(c.id)}" data-chat-user="${esc(otherUid)}">
      <span class="chat-person-main">${esc(u.name||'Usuario')} <small>· ${u.online?'En línea':'Desconectado'}</small></span>
      <span class="chat-preview">${preview}</span>${unread?`<b class="chat-unread">${unread}</b>`:''}
    </button>`;
  }).join('')||'<p class="empty">Todavía no tienes conversaciones. Abre cualquier perfil y pulsa Enviar mensaje.</p>';
}
async function markChatNotificationsRead(chatId){
  try{
    const q=query(collection(db,'notifications'),where('recipientUid','==',state.user.uid),where('chatId','==',chatId),where('read','==',false));
    const snap=await getDocs(q);
    await Promise.all(snap.docs.map(d=>updateDoc(d.ref,{read:true})));
  }catch(err){console.warn('No se pudieron marcar notificaciones como leídas:',err.message);}
}
function openChat(chatId,otherUid){
  state.chatId=chatId;state.chatUser=otherUid;
  const other=state.profiles.find(p=>p.uid===otherUid);
  $('#chat-window').innerHTML=`<div class="chat-head"><b>${esc(other?.name||'Usuario')}</b><span class="muted">${other?.online?'● En línea':'Desconectado'}</span>
    <button class="outline" type="button" data-call="audio" title="Llamada de voz">📞</button>
    <button class="outline" type="button" data-call="video" title="Videollamada">🎥</button>
    <button class="outline" data-report="${esc(otherUid)}">Denunciar</button><button class="outline" data-block="${esc(otherUid)}">Bloquear</button></div>
    <div class="messages" id="messages"><div class="empty">Cargando mensajes…</div></div>
    <form class="message-form" id="message-form">
      <button type="button" class="outline" id="emoji-btn" title="Emoji">😊</button>
      <label class="outline media-pick" title="Enviar foto o vídeo">📎<input id="chat-media" type="file" accept="image/*,video/*" hidden></label>
      <button type="button" class="outline" id="voice-btn" title="Grabar mensaje de voz">🎙️</button>
      <input id="message-text" maxlength="1000" placeholder="Escribe un mensaje…" autocomplete="off">
      <button class="primary">Enviar</button>
    </form><div id="emoji-panel" class="emoji-panel hide">
      ${['😀','😍','😂','🥰','❤️','👍','🎉','😢','🙏'].map(e=>`<button type="button" data-emoji="${e}">${e}</button>`).join('')}
    </div>`;
  if(state.unsubMessages)state.unsubMessages();
  const q=query(collection(db,'chats',chatId,'messages'));
  state.unsubMessages=onSnapshot(q,snap=>{
    const msgs=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.createdAt?.toMillis?.()||0)-(b.createdAt?.toMillis?.()||0));
    $('#messages').innerHTML=msgs.map(m=>{
      let body=m.type==='image'?`<img class="chat-media" src="${esc(m.mediaUrl)}" alt="Imagen" loading="lazy">`:m.type==='video'?`<video class="chat-media" src="${esc(m.mediaUrl)}" controls></video>`:m.type==='audio'?`<audio src="${esc(m.mediaUrl)}" controls></audio>`:esc(m.text||'');
      return `<div class="message ${m.senderUid===state.user.uid?'mine':''}">${body}<small>${m.createdAt?.toDate?m.createdAt.toDate().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):''}</small></div>`;
    }).join('')||'<div class="empty">Empieza la conversación.</div>';
    $('#messages').scrollTop=$('#messages').scrollHeight;
    markChatNotificationsRead(chatId);
  },err=>toast('No se pudieron cargar los mensajes: '+err.message));
}
async function openDirectChat(otherUid){
  if(!otherUid||otherUid===state.user.uid)return;
  try{
    const participants=[state.user.uid,otherUid].sort(),chatId=participants.join('_'),ref=doc(db,'chats',chatId);
    let exists=false;
    try{const snap=await getDoc(ref);exists=snap.exists();}
    catch(err){if(err.code!=='permission-denied')throw err;}
    if(!exists)await setDoc(ref,{participants,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid,type:'direct',lastMessage:'',unreadCounts:{[state.user.uid]:0,[otherUid]:0}});
    state.chatId=chatId;state.chatUser=otherUid;
    location.hash='chat';route('chat');openChat(chatId,otherUid);renderChatList();
  }catch(err){console.error('Open direct chat:',err);toast('No se pudo abrir la conversación: '+err.message);}
}

function personMiniCard(u,actions=''){
  if(!u)return '';
  const pic=u.photoURL?`<img src="${esc(u.photoURL)}" alt="">`:`<span>${esc(avatar(u.name))}</span>`;
  return `<article class="social-person"><div class="social-avatar">${pic}</div><div class="social-person-info"><b>${esc(u.name||'Usuario')}</b><small>${esc([u.city,u.country].filter(Boolean).join(' · '))}</small></div><div class="social-person-actions">${actions}</div></article>`;
}
function renderSocialList(){
  const host=$('#social-list');if(!host)return;
  const tab=state.socialTab||'friends';let rows=[];
  if(tab==='friends'){
    rows=state.friendships.map(f=>{const uid=(f.participants||[]).find(x=>x!==state.user.uid);return personMiniCard(state.profiles.find(p=>p.uid===uid),`<button class="outline" data-open-chat="${esc(uid||'')}">Mensaje</button>`);});
  }else if(tab==='followers'){
    rows=state.follows.filter(f=>f.followingUid===state.user.uid).map(f=>personMiniCard(state.profiles.find(p=>p.uid===f.followerUid),`<button class="outline" data-follow="${esc(f.followerUid)}">Seguir también</button>`));
  }else if(tab==='following'){
    rows=state.follows.filter(f=>f.followerUid===state.user.uid).map(f=>personMiniCard(state.profiles.find(p=>p.uid===f.followingUid),`<button class="outline" data-follow="${esc(f.followingUid)}">Dejar de seguir</button>`));
  }else{
    rows=state.friendRequests.filter(r=>r.toUid===state.user.uid&&r.status==='pending').map(r=>personMiniCard(state.profiles.find(p=>p.uid===r.fromUid),`<button class="primary" data-accept-friend="${esc(r.id)}">Aceptar</button><button class="outline" data-decline-friend="${esc(r.id)}">Rechazar</button>`));
  }
  host.innerHTML=rows.filter(Boolean).join('')||`<div class="empty">${tab==='friends'?'Todavía no tienes amigos. Descubre personas y envía solicitudes.':tab==='followers'?'Todavía no tienes seguidores.':tab==='following'?'Todavía no sigues a nadie.':'No tienes solicitudes pendientes.'}</div>`;
  const pending=state.friendRequests.filter(r=>r.toUid===state.user.uid&&r.status==='pending').length;
  $('#request-count').textContent=pending;
  $('#friend-count').textContent=state.friendships.length||'';
  $('#friend-count').classList.toggle('hide',!state.friendships.length);
}
async function toggleFollow(uid){
  if(!uid||uid===state.user.uid)return;
  const id=`${state.user.uid}_${uid}`,ref=doc(db,'follows',id);
  try{
    const existing=state.follows.find(f=>f.id===id);
    if(existing){await deleteDoc(ref);toast('Has dejado de seguir este perfil.');}
    else{await setDoc(ref,{followerUid:state.user.uid,followingUid:uid,createdAt:serverTimestamp()});toast('Ahora sigues este perfil.');}
  }catch(e){toast('No se pudo actualizar el seguimiento: '+e.message);}
}
async function sendFriendRequest(uid){
  if(!uid||uid===state.user.uid)return;
  try{
    if(state.friendships.some(f=>(f.participants||[]).includes(uid)))return toast('Ya sois amigos.');
    if(state.friendRequests.some(r=>r.fromUid===state.user.uid&&r.toUid===uid&&r.status==='pending'))return toast('La solicitud ya está enviada.');
    if(state.friendRequests.some(r=>r.fromUid===uid&&r.toUid===state.user.uid&&r.status==='pending'))return toast('Esta persona ya te envió una solicitud. Revisa Solicitudes.');
    await addDoc(collection(db,'friendRequests'),{fromUid:state.user.uid,toUid:uid,status:'pending',createdAt:serverTimestamp()});
    toast('Solicitud de amistad enviada.');
  }catch(e){console.error('Friend request:',e);toast('No se pudo enviar la solicitud: '+e.message);}
}
async function answerFriendRequest(id,accept){
  const req=state.friendRequests.find(r=>r.id===id);
  if(!req||req.toUid!==state.user.uid)return;
  try{
    if(accept){
      const participants=[req.fromUid,req.toUid].sort(),friendId=participants.join('_');
      await setDoc(doc(db,'friendships',friendId),{participants,requestId:id,createdAt:serverTimestamp()});
      await updateDoc(doc(db,'friendRequests',id),{status:'accepted',respondedAt:serverTimestamp()});
      toast('¡Ahora sois amigos!');
    }else{
      await updateDoc(doc(db,'friendRequests',id),{status:'declined',respondedAt:serverTimestamp()});
      toast('Solicitud rechazada.');
    }
  }catch(e){console.error('Friend request response:',e);toast('No se pudo actualizar la solicitud: '+e.message);}
}
function renderFeed(){
  const host=$('#feed-list');if(!host)return;
  const posts=[...state.posts].sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  host.innerHTML=posts.map(p=>{
    const u=state.profiles.find(x=>x.uid===p.authorUid)||(p.authorUid===state.user.uid?state.user:null);
    const ownPost=p.authorUid===state.user.uid;
    const reactions=p.reactions||{},mine=reactions[state.user.uid]||'';
    const count=type=>Object.values(reactions).filter(x=>x===type).length;
    const media=p.mediaUrl?(p.mediaType==='video'?`<video class="post-media" controls playsinline preload="metadata" src="${esc(p.mediaUrl)}"></video>`:`<img class="post-media" src="${esc(p.mediaUrl)}" alt="Imagen compartida" loading="lazy">`):'';
    const comments=(p.comments||[]).map(c=>{
      const ownComment=c.authorUid===state.user.uid;
      const controls=(ownComment||ownPost)?`<span class="comment-controls">${ownComment?`<button type="button" data-edit-comment="${esc(p.id)}" data-comment-id="${esc(c.id)}">Editar</button>`:''}<button type="button" data-delete-comment="${esc(p.id)}" data-comment-id="${esc(c.id)}">${ownPost&&!ownComment?'Eliminar comentario':'Eliminar'}</button></span>`:'';
      return `<div class="post-comment"><div><b>${esc(c.authorName||'Usuario')}</b> ${esc(c.text)}</div>${controls}</div>`;
    }).join('');
    const ownerControls=ownPost?`<div class="post-owner-controls"><button type="button" data-edit-post="${esc(p.id)}">✏️ Editar publicación</button><button type="button" data-delete-post="${esc(p.id)}">🗑️ Eliminar publicación</button><button type="button" data-toggle-comments="${esc(p.id)}">${p.commentsDisabled?'🔓 Permitir comentarios':'🔒 Desactivar comentarios'}</button></div>`:'';
    const commentForm=p.commentsDisabled?'<p class="comments-disabled">El autor ha desactivado los comentarios.</p>':`<form class="comment-form" data-comment-form="${esc(p.id)}"><div class="comment-composer"><div class="comment-emoji-picker" hidden aria-label="Añadir emoji">${['😀','😍','😂','🥰','❤️','💕','👍','👎','✌️','🙌','🎉','🏆','✊','🔥','👏','🤝','😮','😢','🙏','💯'].map(emoji=>`<button type="button" class="comment-emoji" data-comment-emoji="${emoji}" title="Añadir ${emoji}" aria-label="Añadir ${emoji}">${emoji}</button>`).join('')}</div><div class="comment-input-row"><button type="button" class="comment-emoji-toggle" data-toggle-comment-emoji aria-label="Mostrar emojis" title="Emojis">😊</button><input name="comment" maxlength="500" placeholder="Escribe un comentario..." required><button class="outline" type="submit">Comentar</button></div></div></form>`;
    return `<article class="feed-post" data-post="${esc(p.id)}"><div class="feed-author"><div class="social-avatar">${u?.photoURL?`<img src="${esc(u.photoURL)}" alt="">`:esc(avatar(u?.name))}</div><div><b>${esc(u?.name||'Miembro de WorldConnect')}</b><small>${p.createdAt?.toDate?p.createdAt.toDate().toLocaleString():'Ahora'}</small></div></div>${ownerControls}${p.text?`<p>${esc(p.text)}</p>`:''}${media}<div class="post-reactions"><button class="${mine==='like'?'selected':''}" data-react="like" data-post-id="${esc(p.id)}">👍 Me gusta <b>${count('like')}</b></button><button class="${mine==='love'?'selected':''}" data-react="love" data-post-id="${esc(p.id)}">❤️ Me encanta <b>${count('love')}</b></button><button class="${mine==='dislike'?'selected':''}" data-react="dislike" data-post-id="${esc(p.id)}">👎 No me gusta <b>${count('dislike')}</b></button></div><div class="post-comments">${comments}${commentForm}</div></article>`;
  }).join('')||'<div class="empty">Todavía no hay publicaciones. ¡Sé el primero en compartir algo!</div>';
}
async function editPost(postId){
  const post=state.posts.find(p=>p.id===postId);if(!post||post.authorUid!==state.user.uid)return;
  const text=prompt('Modifica el texto de tu publicación:',post.text||'');if(text===null)return;
  try{await updateDoc(doc(db,'posts',postId),{text:text.trim(),updatedAt:serverTimestamp()});toast('Publicación modificada.');}
  catch(e){toast('No se pudo modificar la publicación: '+e.message);}
}
async function deletePost(postId){
  const post=state.posts.find(p=>p.id===postId);if(!post||post.authorUid!==state.user.uid)return;
  if(!confirm('¿Seguro que quieres eliminar esta publicación?'))return;
  try{
    await Promise.all([
      ...Object.keys(post.reactions||{}).map(uid=>deleteDoc(doc(db,'posts',postId,'reactions',uid))),
      ...(post.comments||[]).map(c=>deleteDoc(doc(db,'posts',postId,'comments',c.id)))
    ]);
    await deleteDoc(doc(db,'posts',postId));toast('Publicación eliminada.');
  }catch(e){toast('No se pudo eliminar la publicación: '+e.message);}
}
async function togglePostComments(postId){
  const post=state.posts.find(p=>p.id===postId);if(!post||post.authorUid!==state.user.uid)return;
  try{await updateDoc(doc(db,'posts',postId),{commentsDisabled:!post.commentsDisabled,updatedAt:serverTimestamp()});toast(post.commentsDisabled?'Comentarios activados.':'Comentarios desactivados.');}
  catch(e){toast('No se pudo cambiar la configuración: '+e.message);}
}
async function editPostComment(postId,commentId){
  const post=state.posts.find(p=>p.id===postId),comment=post?.comments?.find(c=>c.id===commentId);
  if(!comment||comment.authorUid!==state.user.uid)return;
  const text=prompt('Modifica tu comentario:',comment.text||'');if(text===null)return;
  if(!text.trim())return toast('El comentario no puede estar vacío.');
  try{await updateDoc(doc(db,'posts',postId,'comments',commentId),{text:text.trim(),updatedAt:serverTimestamp()});toast('Comentario modificado.');}
  catch(e){toast('No se pudo modificar el comentario: '+e.message);}
}
async function deletePostComment(postId,commentId){
  const post=state.posts.find(p=>p.id===postId),comment=post?.comments?.find(c=>c.id===commentId);
  if(!post||!comment)return;
  const allowed=comment.authorUid===state.user.uid||post.authorUid===state.user.uid;
  if(!allowed)return;
  if(!confirm('¿Eliminar este comentario?'))return;
  try{await deleteDoc(doc(db,'posts',postId,'comments',commentId));toast('Comentario eliminado.');}
  catch(e){toast('No se pudo eliminar el comentario: '+e.message);}
}
async function createPost(textValue,file){
  const body=(textValue||'').trim();
  if(!body&&!file)return toast('Escribe algo o selecciona una foto o vídeo.');
  try{
    let mediaUrl='',mediaType='';
    if(file){
      if(!(file.type.startsWith('image/')||file.type.startsWith('video/')))throw Error('Elige una imagen o vídeo compatible.');
      if(file.size>50*1024*1024)throw Error('El archivo no puede superar 50 MB.');
      const uploaded=await uploadPostMedia(file);mediaUrl=uploaded.url;mediaType=file.type.startsWith('video/')?'video':'image';
    }
    await addDoc(collection(db,'posts'),{authorUid:state.user.uid,text:body,mediaUrl,mediaType,createdAt:serverTimestamp()});
    $('#post-text').value='';$('#post-media-file').value='';$('#post-file-name').textContent='';toast('Publicación compartida.');
  }catch(e){console.error('Create post:',e);toast('No se pudo publicar: '+e.message);}
}
async function reactToPost(postId,type){
  try{
    const ref=doc(db,'posts',postId,'reactions',state.user.uid),old=state.posts.find(p=>p.id===postId)?.reactions?.[state.user.uid];
    if(old===type)await deleteDoc(ref);else await setDoc(ref,{uid:state.user.uid,type,createdAt:serverTimestamp()});
  }catch(e){toast('No se pudo reaccionar: '+e.message);}
}
async function addPostComment(postId,textValue){
  const body=(textValue||'').trim();if(!body)return;
  try{await addDoc(collection(db,'posts',postId,'comments'),{authorUid:state.user.uid,authorName:state.user.name||'Usuario',text:body,createdAt:serverTimestamp()});}
  catch(e){toast('No se pudo comentar: '+e.message);}
}
async function loadUserData(){
  [state.unsubUsers,state.unsubLikes,state.unsubMatches,state.unsubChats,state.unsubNotifications].forEach(fn=>{if(fn)fn();});
  state.unsubUsers=onSnapshot(query(collection(db,'users'),where('visibility','==','public')),snap=>{
    state.profiles=snap.docs.map(d=>({uid:d.id,...d.data()}));
    renderDiscover();renderLikes();renderMatches();
    if(!$('#page-chat').classList.contains('hide'))renderChatList();
  },err=>toast('Error cargando perfiles: '+err.message));
  state.unsubLikes=onSnapshot(query(collection(db,'likes'),where('fromUid','==',state.user.uid)),snap=>{
    state.likes=snap.docs.map(d=>({id:d.id,...d.data()}));
    $('#like-count').textContent=state.likes.length;renderLikes();renderDiscover();
  },err=>toast('Error cargando intereses: '+err.message));
  state.unsubMatches=onSnapshot(query(collection(db,'matches'),where('participants','array-contains',state.user.uid)),snap=>{
    state.matches=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderMatches();
  },err=>toast('Error cargando conexiones: '+err.message));
  state.unsubChats=onSnapshot(query(collection(db,'chats'),where('participants','array-contains',state.user.uid)),snap=>{
    state.conversations=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(!$('#page-chat').classList.contains('hide'))renderChatList();
    const total=state.conversations.reduce((n,c)=>n+Number(c.unreadCounts?.[state.user.uid]||0),0);
    const badge=$('#chat-count');if(badge){badge.textContent=total||'';badge.classList.toggle('hide',!total);}
  },err=>toast('Error cargando conversaciones: '+err.message));
  state.unsubNotifications=onSnapshot(query(collection(db,'notifications'),where('recipientUid','==',state.user.uid),where('read','==',false)),snap=>{
    snap.docChanges().forEach(change=>{
      const n={id:change.doc.id,...change.doc.data()};
      if(change.type==='added'&&!state.knownNotificationIds.has(n.id)){
        state.knownNotificationIds.add(n.id);
        if(n.senderUid!==state.user.uid){
          toast(`Nuevo mensaje de ${n.senderName||'un usuario'}`);
          if('Notification'in window&&Notification.permission==='granted'&&document.hidden)
            new Notification('WorldConnect',{body:`Nuevo mensaje de ${n.senderName||'un usuario'}`,tag:n.chatId});
        }
      }
    });
    state.notifications=snap.docs.map(d=>({id:d.id,...d.data()}));
  },err=>console.warn('Notifications:',err.message));
  if('Notification'in window&&Notification.permission==='default'){
    // Permission is requested only after the user explicitly chooses to enable notifications.
    const button=$('#enable-notifications');
    if(button)button.classList.remove('hide');
  }

  [state.unsubFollows,state.unsubFollowers,state.unsubRequests,state.unsubRequestsSent,state.unsubFriends,state.unsubPosts].forEach(fn=>{if(fn)fn();});
  let followingRows=[],followerRows=[];
  const mergeSocial=()=>{state.follows=[...followingRows,...followerRows.filter(x=>!followingRows.some(y=>y.id===x.id))];renderDiscover();renderSocialList();};
  state.unsubFollows=onSnapshot(query(collection(db,'follows'),where('followerUid','==',state.user.uid)),snap=>{followingRows=snap.docs.map(d=>({id:d.id,...d.data()}));mergeSocial();},e=>console.warn('Following:',e.message));
  state.unsubFollowers=onSnapshot(query(collection(db,'follows'),where('followingUid','==',state.user.uid)),snap=>{followerRows=snap.docs.map(d=>({id:d.id,...d.data()}));mergeSocial();},e=>console.warn('Followers:',e.message));
  let receivedRows=[],sentRows=[];
  const mergeRequests=()=>{state.friendRequests=[...receivedRows,...sentRows.filter(x=>!receivedRows.some(y=>y.id===x.id))];renderSocialList();renderDiscover();};
  state.unsubRequests=onSnapshot(query(collection(db,'friendRequests'),where('toUid','==',state.user.uid)),snap=>{receivedRows=snap.docs.map(d=>({id:d.id,...d.data()}));mergeRequests();},e=>console.warn('Received friend requests:',e.message));
  state.unsubRequestsSent=onSnapshot(query(collection(db,'friendRequests'),where('fromUid','==',state.user.uid)),snap=>{sentRows=snap.docs.map(d=>({id:d.id,...d.data()}));mergeRequests();},e=>console.warn('Sent friend requests:',e.message));
  state.unsubFriends=onSnapshot(query(collection(db,'friendships'),where('participants','array-contains',state.user.uid)),snap=>{state.friendships=snap.docs.map(d=>({id:d.id,...d.data()}));renderSocialList();renderDiscover();},e=>console.warn('Friends:',e.message));
  state.unsubPosts=onSnapshot(collection(db,'posts'),snap=>{
    state.posts=snap.docs.map(d=>({id:d.id,...d.data(),reactions:{},comments:[]}));
    state.posts.forEach(post=>{
      onSnapshot(collection(db,'posts',post.id,'reactions'),rs=>{post.reactions=Object.fromEntries(rs.docs.map(d=>[d.id,d.data().type]));renderFeed();},e=>console.warn('Post reactions:',e.message));
      onSnapshot(collection(db,'posts',post.id,'comments'),cs=>{post.comments=cs.docs.map(d=>({id:d.id,...d.data()}));renderFeed();},e=>console.warn('Post comments:',e.message));
    });renderFeed();
  },e=>toast('No se pudieron cargar publicaciones: '+e.message));

}
async function setPresence(online=true){if(!state.user)return;try{await updateDoc(doc(db,'users',state.user.uid),{online,lastSeen:serverTimestamp()});}catch(e){console.warn('Presence update:',e.message);}}
function startPresence(){clearInterval(state.presenceTimer);setPresence(true);state.presenceTimer=setInterval(()=>setPresence(true),45000);window.addEventListener('pagehide',()=>{if(state.user)setPresence(false);},{once:true});}
function stopListeners(){[state.unsubUsers,state.unsubLikes,state.unsubMatches,state.unsubChats,state.unsubNotifications,state.unsubMessages,state.unsubFollows,state.unsubFollowers,state.unsubRequests,state.unsubRequestsSent,state.unsubFriends,state.unsubPosts].forEach(fn=>{if(fn)fn();});state.unsubUsers=state.unsubLikes=state.unsubMatches=state.unsubChats=state.unsubNotifications=state.unsubMessages=state.unsubFollows=state.unsubFollowers=state.unsubRequests=state.unsubRequestsSent=state.unsubFriends=state.unsubPosts=null;clearInterval(state.presenceTimer);}
async function getProfile(user){const ref=doc(db,'users',user.uid);let snap=await getDoc(ref);if(!snap.exists()){const initial={uid:user.uid,name:user.displayName||'Usuario',email:user.email||'',country:'',city:'',purpose:'both',languages:[],interests:[],bio:'',photoURL:'',adultConfirmed:true,termsVersion:'1.0',createdAt:serverTimestamp(),lastSeen:serverTimestamp(),online:true,status:'active',role:'user',visibility:'public'};await setDoc(ref,initial);snap=await getDoc(ref);}const token=await user.getIdTokenResult();return{uid:user.uid,email:user.email,...snap.data(),isAdmin:token.claims.admin===true};}
async function sendLike(targetUid){if(targetUid===state.user.uid)return;const likeId=`${state.user.uid}_${targetUid}`;const ref=doc(db,'likes',likeId);try{await setDoc(ref,{fromUid:state.user.uid,toUid:targetUid,createdAt:serverTimestamp()});const reciprocal=await getDoc(doc(db,'likes',`${targetUid}_${state.user.uid}`));if(reciprocal.exists()){const participants=[state.user.uid,targetUid].sort();const matchId=participants.join('_');const matchRef=doc(db,'matches',matchId);const matchSnap=await getDoc(matchRef);if(!matchSnap.exists()){await setDoc(matchRef,{participants,createdAt:serverTimestamp()});await setDoc(doc(db,'chats',matchId),{participants,createdAt:serverTimestamp()});}toast('🎉 إعجاب متبادل! تقدروا دابا تتراسلوا.');}else toast('تم إرسال الإعجاب. إذا كان متبادلاً ستظهر المحادثة.');}catch(e){toast('تعذر إرسال الإعجاب: '+e.message);}}
async function submitMessage(text){
  if(!state.chatId||!state.chatUser||!text.trim())return;
  const body=text.trim(),chatId=state.chatId,recipientUid=state.chatUser;
  try{
    await addDoc(collection(db,'chats',chatId,'messages'),{senderUid:state.user.uid,type:'text',text:body,createdAt:serverTimestamp()});
    await updateDoc(doc(db,'chats',chatId),{lastMessage:body.slice(0,120),lastMessageAt:serverTimestamp(),updatedAt:serverTimestamp(),lastSenderUid:state.user.uid,[`unreadCounts.${recipientUid}`]: (Number(state.conversations.find(c=>c.id===chatId)?.unreadCounts?.[recipientUid]||0)+1)});
    try{await addDoc(collection(db,'notifications'),{recipientUid,senderUid:state.user.uid,senderName:state.user.name||'Usuario',chatId,type:'message',preview:body.slice(0,100),read:false,createdAt:serverTimestamp()});}catch(notifyError){console.warn('Notification could not be saved:',notifyError.message);}
    $('#message-text').value='';
  }catch(e){toast('تعذر إرسال الرسالة: '+e.message);}
}
async function uploadChatMedia(file){
  if(!file||!state.chatId)return;
  const type=file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':null;
  if(!type)throw Error('اختر صورة أو فيديو.');
  const max=type==='video'?50:10;if(file.size>max*1024*1024)throw Error(`الحد الأقصى ${max} MB.`);
  const {cloudinary,cloudinaryReady}=await import('./cloudinary-config.js');
  if(!cloudinaryReady())throw Error('راجع إعدادات Cloudinary.');
  const form=new FormData();form.append('file',file);form.append('upload_preset',cloudinary.uploadPreset);form.append('folder','worldconnect/chat');
  const response=await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/auto/upload`,{method:'POST',body:form});
  const result=await response.json();if(!response.ok)throw Error(result.error?.message||'Error subiendo archivo.');
  const chatId=state.chatId,recipientUid=state.chatUser;
  await addDoc(collection(db,'chats',chatId,'messages'),{senderUid:state.user.uid,type,mediaUrl:result.secure_url,fileName:file.name,createdAt:serverTimestamp()});
  await updateDoc(doc(db,'chats',chatId),{lastMessage:type==='image'?'📷 Foto':'🎥 Vídeo',lastMessageAt:serverTimestamp(),updatedAt:serverTimestamp(),lastSenderUid:state.user.uid,[`unreadCounts.${recipientUid}`]:(Number(state.conversations.find(c=>c.id===chatId)?.unreadCounts?.[recipientUid]||0)+1)});
  try{await addDoc(collection(db,'notifications'),{recipientUid,senderUid:state.user.uid,senderName:state.user.name||'Usuario',chatId,type:'message',preview:type==='image'?'📷 Foto':'🎥 Vídeo',read:false,createdAt:serverTimestamp()});}catch(e){console.warn(e);}
}

$$('[data-tab]').forEach(b=>b.addEventListener('click',()=>authView(b.dataset.tab)));
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,$('#login-email').value.trim(),$('#login-password').value);toast('تم تسجيل الدخول بنجاح.');}catch(x){toast(authError(x));}});
$('#register-form').addEventListener('submit',async e=>{e.preventDefault();if(!$('#adult').checked||!$('#terms').checked)return toast('Confirma que eres mayor de edad y acepta las condiciones.');try{const name=$('#reg-name').value.trim(),email=$('#reg-email').value.trim(),country=$('#reg-country').value;const cred=await createUserWithEmailAndPassword(auth,email,$('#reg-password').value);await updateProfile(cred.user,{displayName:name});await setDoc(doc(db,'users',cred.user.uid),{uid:cred.user.uid,name,email,country,city:'',purpose:'both',languages:[],interests:[],bio:'',photoURL:'',adultConfirmed:true,termsVersion:'1.0',createdAt:serverTimestamp(),lastSeen:serverTimestamp(),online:true,status:'active',role:'user',visibility:'public'});try{await sendEmailVerification(cred.user);}catch(err){console.warn('Verification email:',err);}toast('Cuenta creada. Ya puedes completar tu perfil.');}catch(x){toast(authError(x));}});
function authError(e){const map={ 'auth/email-already-in-use':'Este correo ya tiene una cuenta. Inicia sesión.','auth/invalid-credential':'Correo o contraseña incorrectos.','auth/weak-password':'La contraseña debe tener al menos 6 caracteres.','auth/invalid-email':'El correo no es válido.','auth/too-many-requests':'Demasiados intentos. Espera unos minutos.'};return map[e.code]||e.message||'Ha ocurrido un error.';}
$('#forgot').onclick=async()=>{const email=$('#login-email').value.trim();if(!email)return toast('Escribe tu correo primero.');try{await sendPasswordResetEmail(auth,email);toast('Correo de recuperación enviado.');}catch(e){toast(authError(e));}};
$('#logout').onclick=async()=>{try{await setPresence(false);}catch{}stopListeners();state.user=null;state.profiles=[];state.likes=[];state.matches=[];state.chatId=null;await signOut(auth);authView('login');toast('Has cerrado sesión.');};
window.addEventListener('hashchange',()=>{if(state.user)route(location.hash.slice(1));});
document.addEventListener('click',async e=>{const like=e.target.closest('[data-like]'),open=e.target.closest('[data-open-chat]'),chat=e.target.closest('[data-chat-id]'),report=e.target.closest('[data-report]'),block=e.target.closest('[data-block]'),follow=e.target.closest('[data-follow]'),friend=e.target.closest('[data-friend]'),accept=e.target.closest('[data-accept-friend]'),decline=e.target.closest('[data-decline-friend]');if(like){like.disabled=true;await sendLike(like.dataset.like);}if(follow){await toggleFollow(follow.dataset.follow);renderSocialList();renderDiscover();}if(friend){friend.disabled=true;await sendFriendRequest(friend.dataset.friend);renderDiscover();}if(accept)await answerFriendRequest(accept.dataset.acceptFriend,true);if(decline)await answerFriendRequest(decline.dataset.declineFriend,false);if(open){await openDirectChat(open.dataset.openChat);}if(chat){location.hash='chat';openChat(chat.dataset.chatId,chat.dataset.chatUser);}if(e.target.closest('#emoji-btn'))$('#emoji-panel').classList.toggle('hide');if(e.target.matches('[data-emoji]')){const input=$('#message-text');input.value+=e.target.dataset.emoji;input.focus();}if(report){$('#report-id').value=report.dataset.report;$('#report-modal').showModal();}if(block){try{await addDoc(collection(db,'blocks'),{blockerUid:state.user.uid,blockedUid:block.dataset.block,createdAt:serverTimestamp()});toast('تم حظر المستخدم.');}catch(err){toast('تعذر الحظر: '+err.message);}}if(e.target.matches('[data-close]'))e.target.closest('dialog').close();});
$('#report-form').addEventListener('submit',async e=>{e.preventDefault();try{await addDoc(collection(db,'reports'),{reporterUid:state.user.uid,targetUid:$('#report-id').value,reason:$('#reason').value,details:$('#details').value.trim(),createdAt:serverTimestamp(),status:'new'});$('#report-modal').close();e.target.reset();toast('تم إرسال البلاغ للمراجعة.');}catch(err){toast('تعذر إرسال البلاغ: '+err.message);}});

$$('[data-social-tab]').forEach(btn=>btn.addEventListener('click',()=>{$$('[data-social-tab]').forEach(x=>x.classList.toggle('active',x===btn));state.socialTab=btn.dataset.socialTab;renderSocialList();}));
$('#post-form')?.addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button[type="submit"],button:not([type])');if(btn)btn.disabled=true;try{await createPost($('#post-text').value,$('#post-media-file')?.files?.[0]);}finally{if(btn)btn.disabled=false;}});
$('#post-media-file')?.addEventListener('change',e=>{$('#post-file-name').textContent=e.target.files[0]?.name||'';});
document.addEventListener('click',e=>{const r=e.target.closest('[data-react]');if(r)reactToPost(r.dataset.postId,r.dataset.react);});
document.addEventListener('click',e=>{
  const editPostBtn=e.target.closest('[data-edit-post]');if(editPostBtn)return editPost(editPostBtn.dataset.editPost);
  const deletePostBtn=e.target.closest('[data-delete-post]');if(deletePostBtn)return deletePost(deletePostBtn.dataset.deletePost);
  const toggleBtn=e.target.closest('[data-toggle-comments]');if(toggleBtn)return togglePostComments(toggleBtn.dataset.toggleComments);
  const editCommentBtn=e.target.closest('[data-edit-comment]');if(editCommentBtn)return editPostComment(editCommentBtn.dataset.editComment,editCommentBtn.dataset.commentId);
  const deleteCommentBtn=e.target.closest('[data-delete-comment]');if(deleteCommentBtn)return deletePostComment(deleteCommentBtn.dataset.deleteComment,deleteCommentBtn.dataset.commentId);
});
document.addEventListener('click',e=>{
  const toggleEmoji=e.target.closest('[data-toggle-comment-emoji]');
  if(toggleEmoji){
    const picker=toggleEmoji.closest('[data-comment-form]')?.querySelector('.comment-emoji-picker');
    if(picker){picker.hidden=!picker.hidden;toggleEmoji.setAttribute('aria-expanded',String(!picker.hidden));}
    return;
  }
  const emojiButton=e.target.closest('[data-comment-emoji]');
  if(!emojiButton)return;
  const form=emojiButton.closest('[data-comment-form]');
  const input=form?.querySelector('[name="comment"]');
  if(!input)return;
  const emoji=emojiButton.dataset.commentEmoji;
  const start=input.selectionStart??input.value.length;
  const end=input.selectionEnd??input.value.length;
  input.value=input.value.slice(0,start)+emoji+input.value.slice(end);
  const cursor=start+emoji.length;
  input.focus();input.setSelectionRange(cursor,cursor);
});
document.addEventListener('submit',e=>{if(e.target.matches('[data-comment-form]')){e.preventDefault();const input=e.target.querySelector('[name="comment"]');addPostComment(e.target.dataset.commentForm,input.value);input.value='';}});
$('#search').oninput=renderDiscover;$('#country').onchange=renderDiscover;$('#purpose').onchange=renderDiscover;$('#clear').onclick=()=>{$('#search').value=$('#country').value=$('#purpose').value='';renderDiscover();};
document.addEventListener('submit',e=>{if(e.target.id==='message-form'){e.preventDefault();submitMessage($('#message-text').value);}});
document.addEventListener('change',async e=>{if(e.target.id==='chat-media'){try{await uploadChatMedia(e.target.files[0]);toast('Archivo enviado.');}catch(err){toast(err.message);}finally{e.target.value='';}}});
document.addEventListener('click',async e=>{
  if(e.target.closest('#voice-btn')){
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return toast('Tu navegador no permite grabar audio.');
    try{
      if(state.mediaRecorder?.state==='recording'){state.mediaRecorder.stop();return;}
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      state.audioChunks=[];state.mediaRecorder=new MediaRecorder(stream);
      state.mediaRecorder.ondataavailable=ev=>{if(ev.data.size)state.audioChunks.push(ev.data);};
      state.mediaRecorder.onstop=async()=>{
        const blob=new Blob(state.audioChunks,{type:'audio/webm'});stream.getTracks().forEach(t=>t.stop());
        try{
          const {cloudinary,cloudinaryReady}=await import('./cloudinary-config.js');if(!cloudinaryReady())throw Error('Configura Cloudinary.');
          const form=new FormData();form.append('file',blob,'voice-message.webm');form.append('upload_preset',cloudinary.uploadPreset);form.append('folder','worldconnect/chat');
          const res=await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/auto/upload`,{method:'POST',body:form}),data=await res.json();if(!res.ok)throw Error(data.error?.message||'Error subiendo audio.');
          const chatId=state.chatId,recipientUid=state.chatUser;
          await addDoc(collection(db,'chats',chatId,'messages'),{senderUid:state.user.uid,type:'audio',mediaUrl:data.secure_url,createdAt:serverTimestamp()});
          await updateDoc(doc(db,'chats',chatId),{lastMessage:'🎙️ Mensaje de voz',lastMessageAt:serverTimestamp(),updatedAt:serverTimestamp(),lastSenderUid:state.user.uid,[`unreadCounts.${recipientUid}`]:(Number(state.conversations.find(c=>c.id===chatId)?.unreadCounts?.[recipientUid]||0)+1)});
          await addDoc(collection(db,'notifications'),{recipientUid,senderUid:state.user.uid,senderName:state.user.name||'Usuario',chatId,type:'message',preview:'🎙️ Mensaje de voz',read:false,createdAt:serverTimestamp()});
          toast('Mensaje de voz enviado.');
        }catch(err){toast(err.message);}
      };
      state.mediaRecorder.start();toast('Grabando… Pulsa el micrófono otra vez para terminar.');
    }catch(err){toast('No se pudo acceder al micrófono: '+err.message);}
  }
});

$('#save').onclick=async()=>{const data={name:$('#p-name').value.trim(),country:$('#p-country').value.trim(),city:$('#p-city').value.trim(),bio:$('#p-bio').value.trim(),purpose:$('#p-purpose').value,interests:$('#p-interests').value.split(',').map(x=>x.trim()).filter(Boolean),languages:[...$('#p-languages').selectedOptions].map(x=>x.value)};try{await updateDoc(doc(db,'users',state.user.uid),data);state.user={...state.user,...data};fillProfile();toast('Perfil actualizado y guardado.');}catch(e){toast('Error guardando perfil: '+e.message);}};
$('#photo-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const{url,publicId}=await uploadImage(file);await updateDoc(doc(db,'users',state.user.uid),{photoURL:url,photoPublicId:publicId});state.user.photoURL=url;fillProfile();toast('Foto actualizada.');}catch(x){toast(x.message);}};
$('#visible').onchange=async e=>{try{await updateDoc(doc(db,'users',state.user.uid),{visibility:e.target.checked?'public':'hidden'});toast('Preferencia de visibilidad guardada.');}catch(err){toast(err.message);}};
$('#delete').onclick=()=>toast('Para eliminar la cuenta y sus datos, contacta con el administrador.');$('#menu').onclick=()=>$('#sidebar').classList.toggle('open');
const UI_TRANSLATIONS = {
  en: {
    'Amigos':'Friends','Amigos y seguidores':'Friends and followers','Gestiona tus amistades, solicitudes y seguidores.':'Manage your friends, requests and followers.','Solicitudes':'Requests','Seguidores':'Followers','Siguiendo':'Following','TU CÍRCULO SOCIAL':'YOUR SOCIAL CIRCLE','COMUNIDAD WORLDCONNECT':'WORLDCONNECT COMMUNITY','Publicaciones':'Posts','Comparte ideas, momentos y novedades con tu comunidad.':'Share ideas, moments and updates with your community.','¿Qué estás pensando?':'What are you thinking?','Publicar':'Publish','Añadir amigo':'Add friend','Solicitud enviada':'Request sent','＋ Añadir amigo':'＋ Add friend','＋ Seguir':'＋ Follow','Seguir también':'Follow back','Dejar de seguir':'Unfollow','Ahora sigues este perfil.':'You are now following this profile.','Solicitud de amistad enviada.':'Friend request sent.','¡Ahora sois amigos!':'You are now friends!','No tienes solicitudes pendientes.':'You have no pending requests.','Todavía no hay publicaciones. ¡Sé el primero en compartir algo!':'No posts yet. Be the first to share something!','Escribe algo antes de publicar.':'Write something before publishing.','Publicación compartida.':'Post shared.',
    'Descubrir':'Discover','Me gustas':'Likes','Conexiones':'Connections','Mensajes':'Messages','Mi perfil':'My profile','Ajustes':'Settings','Administración':'Administration',
    'MENÚ PRINCIPAL':'MAIN MENU','TU ESPACIO':'YOUR SPACE','Descubre personas':'Discover people','Personas interesantes, historias diferentes. Empieza por un hola.':'Interesting people, different stories. Start with a hello.',
    'Personas para ti':'People for you','Buscar por nombre o interés...':'Search by name or interest...','Todos los países':'All countries','Todos los objetivos':'All goals','Limpiar':'Clear',
    'INTERÉS COMPARTIDO':'SHARED INTEREST','Perfiles que te interesan.':'Profiles you like.','DOS PERSONAS, UNA CONEXIÓN':'TWO PEOPLE, ONE CONNECTION','Tus conexiones':'Your connections',
    'El interés mutuo abre la puerta a conversar.':'Mutual interest opens the door to chat.','Aún no tienes conexiones mutuas. Cuando dos personas se gusten, aparecerán aquí.':'You have no mutual connections yet. When two people like each other, they will appear here.',
    'CONVERSACIONES PRIVADAS':'PRIVATE CONVERSATIONS','Habla directamente con cualquier persona de WorldConnect.':'Chat directly with anyone on WorldConnect.',
    'Elige una conversación':'Choose a conversation','Todavía no tienes conversaciones. Abre cualquier perfil y pulsa Enviar mensaje.':'No conversations yet. Open any profile and select Send message.',
    'Enviar mensaje':'Send message','Enviar':'Send','Escribe un mensaje…':'Write a message…','En línea':'Online','Desconectado':'Offline','Denunciar':'Report','Bloquear':'Block',
    'TU IDENTIDAD':'YOUR IDENTITY','Cuenta quién eres y qué conexión buscas.':'Tell people who you are and what connection you are looking for.',
    'Guardar cambios':'Save changes','Cambiar foto':'Change photo','Nombre':'Name','País':'Country','Ciudad':'City','Idiomas':'Languages','Qué buscas':'What are you looking for?','Sobre mí':'About me',
    'Amistad':'Friendship','Relación seria':'Serious relationship','Ambos':'Both','Cerrar sesión':'Log out','Privacidad y seguridad':'Privacy and safety',
    'Visibilidad del perfil':'Profile visibility','Permite que otras personas te encuentren.':'Allow other people to find you.',
    'No se pudo abrir la conversación:':'Could not open conversation:','Nuevo mensaje':'New message'
,
    "Siguiendo ✓":"Following ✓",
    "Siguiendo":"Following",
    "＋ Seguir":"＋ Follow",
    "＋ Añadir amigo":"＋ Add friend",
    "Añadir un amigo":"Add a friend",
    "Agregar amigo":"Add friend",
    "Agregar un amigo":"Add a friend",
    "Amigos":"Friends",
    "Amigos y seguidores":"Friends and followers",
    "Solicitudes recibidas":"Received requests",
    "Solicitudes enviadas":"Sent requests",
    "Aceptar":"Accept",
    "Rechazar":"Decline",
    "Eliminar amigo":"Remove friend",
    "Dejar de seguir":"Unfollow",
    "Seguidores":"Followers",
    "Seguidos":"Following",
    "Buscar amigos":"Find friends",
    "Lista de amigos":"Friends list",
    "Sin amigos todavía":"No friends yet",
    "No hay seguidores todavía":"No followers yet",
    "No sigues a nadie todavía":"You are not following anyone yet",
    "Publicaciones":"Posts",
    "Comentarios":"Comments",
    "Comentar":"Comment",
    "Me gusta":"Like",
    "Me encanta":"Love",
    "No me gusta":"Dislike",
    "Foto / vídeo":"Photo / video",
    "Seleccionar archivo":"Choose file",
    "Escribe un comentario...":"Write a comment...",
    "No hay publicaciones todavía.":"No posts yet.",
    "Compartir":"Share",
    "Eliminar publicación":"Delete post",
    "Editar perfil":"Edit profile",
    "Guardando...":"Saving...",
    "Cambios guardados.":"Changes saved.",
    "Solicitud aceptada.":"Request accepted.",
    "Solicitud rechazada.":"Request declined.",
    "No se pudo enviar la solicitud:":"Could not send request:",
    "No se pudo actualizar la solicitud:":"Could not update request:",
    "No se pudo publicar:":"Could not publish:",
    "No se pudo comentar:":"Could not comment:",
    "No se pudo reaccionar:":"Could not react:",
    "No se pudo cargar la lista de amigos:":"Could not load friends list:",
    "Notificaciones":"Notifications",
    "No tienes notificaciones nuevas.":"You have no new notifications.",
    "Nueva solicitud de amistad":"New friend request",
    "Nuevo comentario":"New comment",
    "Nueva reacción":"New reaction",
    "Perfil actualizado.":"Profile updated.",
    "Guardar":"Save",
    "Cancelar":"Cancel",
    "Cargando...":"Loading...",
    "Sin resultados":"No results",
    "Ver perfil":"View profile",
    "Enviar mensaje":"Send message",
    "Escribe un mensaje…":"Write a message…",
    "Adjuntar foto":"Attach photo",
    "Adjuntar vídeo":"Attach video",
    "Enviar audio":"Send audio",
    "Llamada de voz":"Voice call",
    "Videollamada":"Video call",
    "En línea":"Online",
    "Desconectado":"Offline",
    "Mi perfil":"My profile",
    "Ajustes":"Settings",
    "Cerrar sesión":"Log out",
    "Descubrir":"Discover",
    "Me gustas":"Likes",
    "Mensajes":"Messages",
    "Publicar":"Publish",
    "¿Qué estás pensando?":"What are you thinking?",
    "Buscar por nombre o interés...":"Search by name or interest...",
    "Todos los países":"All countries",
    "Todos los objetivos":"All goals",
    "Limpiar":"Clear",
    "Añadir amigo":"Add friend",
    "Solicitud enviada":"Request sent",
    "Enviar":"Send",
    "Denunciar":"Report",
    "Bloquear":"Block",
    "Editar publicación":"Edit post",
    "Eliminar publicación":"Delete post",
    "Desactivar comentarios":"Turn off comments",
    "Permitir comentarios":"Allow comments",
    "Editar":"Edit",
    "Eliminar comentario":"Delete comment",
    "Comentarios activados.":"Comments enabled.",
    "Comentarios desactivados.":"Comments disabled.",
    "Publicación modificada.":"Post updated.",
    "Publicación eliminada.":"Post deleted.",
    "Comentario modificado.":"Comment updated.",
    "Comentario eliminado.":"Comment deleted.",
    "¿Eliminar este comentario?":"Delete this comment?",
    "¿Seguro que quieres eliminar esta publicación?":"Are you sure you want to delete this post?",
    "El autor ha desactivado los comentarios.":"The author has turned off comments."  },
  fr: {
    'Amigos':'Amis','Amigos y seguidores':'Amis et abonnés','Gestiona tus amistades, solicitudes y seguidores.':'Gérez vos amis, demandes et abonnés.','Solicitudes':'Demandes','Seguidores':'Abonnés','Siguiendo':'Abonnements','TU CÍRCULO SOCIAL':'VOTRE CERCLE SOCIAL','COMUNIDAD WORLDCONNECT':'COMMUNAUTÉ WORLDCONNECT','Publicaciones':'Publications','Comparte ideas, momentos y novedades con tu comunidad.':'Partagez des idées, des moments et des nouvelles avec votre communauté.','¿Qué estás pensando?':'À quoi pensez-vous ?','Publicar':'Publier','Añadir amigo':'Ajouter un ami','Solicitud enviada':'Demande envoyée','＋ Añadir amigo':'＋ Ajouter un ami','＋ Seguir':'＋ Suivre','Seguir también':'Suivre aussi','Dejar de seguir':'Ne plus suivre','Ahora sigues este perfil.':'Vous suivez maintenant ce profil.','Solicitud de amistad enviada.':'Demande d’amitié envoyée.','¡Ahora sois amigos!':'Vous êtes maintenant amis !','No tienes solicitudes pendientes.':'Vous n’avez aucune demande en attente.','Todavía no hay publicaciones. ¡Sé el primero en compartir algo!':'Aucune publication. Soyez le premier à partager !','Escribe algo antes de publicar.':'Écrivez quelque chose avant de publier.','Publicación compartida.':'Publication partagée.',
    'Descubrir':'Découvrir','Me gustas':'Mes likes','Conexiones':'Connexions','Mensajes':'Messages','Mi perfil':'Mon profil','Ajustes':'Paramètres','Administración':'Administration',
    'MENÚ PRINCIPAL':'MENU PRINCIPAL','TU ESPACIO':'VOTRE ESPACE','Descubre personas':'Découvrez des personnes','Personas interesantes, historias diferentes. Empieza por un hola.':'Des personnes intéressantes, des histoires différentes. Commencez par un bonjour.',
    'Personas para ti':'Des personnes pour vous','Buscar por nombre o interés...':'Rechercher par nom ou intérêt...','Todos los países':'Tous les pays','Todos los objetivos':'Tous les objectifs','Limpiar':'Effacer',
    'INTERÉS COMPARTIDO':'INTÉRÊT PARTAGÉ','Perfiles que te interesan.':'Les profils qui vous intéressent.','DOS PERSONAS, UNA CONEXIÓN':'DEUX PERSONNES, UNE CONNEXION','Tus conexiones':'Vos connexions',
    'El interés mutuo abre la puerta a conversar.':'Un intérêt mutuel ouvre la porte à la conversation.','Aún no tienes conexiones mutuas. Cuando dos personas se gusten, aparecerán aquí.':'Vous n’avez pas encore de connexion mutuelle. Elles apparaîtront ici lorsque deux personnes se plairont.',
    'CONVERSACIONES PRIVADAS':'CONVERSATIONS PRIVÉES','Habla directamente con cualquier persona de WorldConnect.':'Discutez directement avec toute personne sur WorldConnect.',
    'Elige una conversación':'Choisissez une conversation','Todavía no tienes conversaciones. Abre cualquier perfil y pulsa Enviar mensaje.':'Aucune conversation. Ouvrez un profil et choisissez Envoyer un message.',
    'Enviar mensaje':'Envoyer un message','Enviar':'Envoyer','Escribe un mensaje…':'Écrivez un message…','En línea':'En ligne','Desconectado':'Hors ligne','Denunciar':'Signaler','Bloquear':'Bloquer',
    'TU IDENTIDAD':'VOTRE IDENTITÉ','Cuenta quién eres y qué conexión buscas.':'Présentez-vous et dites quelle relation vous recherchez.',
    'Guardar cambios':'Enregistrer','Cambiar foto':'Changer la photo','Nombre':'Nom','País':'Pays','Ciudad':'Ville','Idiomas':'Langues','Qué buscas':'Que recherchez-vous ?','Sobre mí':'À propos de moi',
    'Amistad':'Amitié','Relación seria':'Relation sérieuse','Ambos':'Les deux','Cerrar sesión':'Déconnexion','Privacidad y seguridad':'Confidentialité et sécurité',
    'Visibilidad del perfil':'Visibilité du profil','Permite que otras personas te encuentren.':'Autorisez les autres à vous trouver.',
    'No se pudo abrir la conversación:':'Impossible d’ouvrir la conversation :','Nuevo mensaje':'Nouveau message'
,
    "Siguiendo ✓":"Abonné ✓",
    "Siguiendo":"Abonné",
    "＋ Seguir":"＋ Suivre",
    "＋ Añadir amigo":"＋ Ajouter un ami",
    "Añadir un amigo":"Ajouter un ami",
    "Agregar amigo":"Ajouter un ami",
    "Agregar un amigo":"Ajouter un ami",
    "Amigos":"Amis",
    "Amigos y seguidores":"Amis et abonnés",
    "Solicitudes recibidas":"Demandes reçues",
    "Solicitudes enviadas":"Demandes envoyées",
    "Aceptar":"Accepter",
    "Rechazar":"Refuser",
    "Eliminar amigo":"Supprimer l’ami",
    "Dejar de seguir":"Ne plus suivre",
    "Seguidores":"Abonnés",
    "Seguidos":"Abonnements",
    "Buscar amigos":"Trouver des amis",
    "Lista de amigos":"Liste d’amis",
    "Sin amigos todavía":"Pas encore d’amis",
    "No hay seguidores todavía":"Aucun abonné pour le moment",
    "No sigues a nadie todavía":"Vous ne suivez personne pour le moment",
    "Publicaciones":"Publications",
    "Comentarios":"Commentaires",
    "Comentar":"Commenter",
    "Me gusta":"J’aime",
    "Me encanta":"J’adore",
    "No me gusta":"Je n’aime pas",
    "Foto / vídeo":"Photo / vidéo",
    "Seleccionar archivo":"Choisir un fichier",
    "Escribe un comentario...":"Écrivez un commentaire...",
    "No hay publicaciones todavía.":"Aucune publication pour le moment.",
    "Compartir":"Partager",
    "Eliminar publicación":"Supprimer la publication",
    "Editar perfil":"Modifier le profil",
    "Guardando...":"Enregistrement...",
    "Cambios guardados.":"Modifications enregistrées.",
    "Solicitud aceptada.":"Demande acceptée.",
    "Solicitud rechazada.":"Demande refusée.",
    "No se pudo enviar la solicitud:":"Impossible d’envoyer la demande :",
    "No se pudo actualizar la solicitud:":"Impossible de mettre à jour la demande :",
    "No se pudo publicar:":"Impossible de publier :",
    "No se pudo comentar:":"Impossible de commenter :",
    "No se pudo reaccionar:":"Impossible de réagir :",
    "No se pudo cargar la lista de amigos:":"Impossible de charger la liste d’amis :",
    "Notificaciones":"Notifications",
    "No tienes notificaciones nuevas.":"Vous n’avez pas de nouvelles notifications.",
    "Nueva solicitud de amistad":"Nouvelle demande d’ami",
    "Nuevo comentario":"Nouveau commentaire",
    "Nueva reacción":"Nouvelle réaction",
    "Perfil actualizado.":"Profil mis à jour.",
    "Guardar":"Enregistrer",
    "Cancelar":"Annuler",
    "Cargando...":"Chargement...",
    "Sin resultados":"Aucun résultat",
    "Ver perfil":"Voir le profil",
    "Enviar mensaje":"Envoyer un message",
    "Escribe un mensaje…":"Écrivez un message…",
    "Adjuntar foto":"Joindre une photo",
    "Adjuntar vídeo":"Joindre une vidéo",
    "Enviar audio":"Envoyer un audio",
    "Llamada de voz":"Appel vocal",
    "Videollamada":"Appel vidéo",
    "En línea":"En ligne",
    "Desconectado":"Hors ligne",
    "Mi perfil":"Mon profil",
    "Ajustes":"Paramètres",
    "Cerrar sesión":"Déconnexion",
    "Descubrir":"Découvrir",
    "Me gustas":"Mes likes",
    "Mensajes":"Messages",
    "Publicar":"Publier",
    "¿Qué estás pensando?":"À quoi pensez-vous ?",
    "Buscar por nombre o interés...":"Rechercher par nom ou intérêt...",
    "Todos los países":"Tous les pays",
    "Todos los objetivos":"Tous les objectifs",
    "Limpiar":"Effacer",
    "Añadir amigo":"Ajouter un ami",
    "Solicitud enviada":"Demande envoyée",
    "Enviar":"Envoyer",
    "Denunciar":"Signaler",
    "Bloquear":"Bloquer",
    "Editar publicación":"Modifier la publication",
    "Eliminar publicación":"Supprimer la publication",
    "Desactivar comentarios":"Désactiver les commentaires",
    "Permitir comentarios":"Autoriser les commentaires",
    "Editar":"Modifier",
    "Eliminar comentario":"Supprimer le commentaire",
    "Comentarios activados.":"Commentaires activés.",
    "Comentarios desactivados.":"Commentaires désactivés.",
    "Publicación modificada.":"Publication modifiée.",
    "Publicación eliminada.":"Publication supprimée.",
    "Comentario modificado.":"Commentaire modifié.",
    "Comentario eliminado.":"Commentaire supprimé.",
    "¿Eliminar este comentario?":"Supprimer ce commentaire ?",
    "¿Seguro que quieres eliminar esta publicación?":"Voulez-vous vraiment supprimer cette publication ?",
    "El autor ha desactivado los comentarios.":"L’auteur a désactivé les commentaires."  },
  ar: {
    'Amigos':'الأصدقاء','Amigos y seguidores':'الأصدقاء والمتابعون','Gestiona tus amistades, solicitudes y seguidores.':'إدارة الأصدقاء وطلبات الصداقة والمتابعين.','Solicitudes':'الطلبات','Seguidores':'المتابعون','Siguiendo':'أتابع','TU CÍRCULO SOCIAL':'دائرتك الاجتماعية','COMUNIDAD WORLDCONNECT':'مجتمع وورلد كونيكت','Publicaciones':'المنشورات','Comparte ideas, momentos y novedades con tu comunidad.':'شارك أفكارك ولحظاتك وأخبارك مع المجتمع.','¿Qué estás pensando?':'بماذا تفكر؟','Publicar':'نشر','Añadir amigo':'إضافة صديق','Solicitud enviada':'تم إرسال الطلب','＋ Añadir amigo':'＋ إضافة صديق','＋ Seguir':'＋ متابعة','Seguir también':'متابعة أيضاً','Dejar de seguir':'إلغاء المتابعة','Ahora sigues este perfil.':'أصبحت تتابع هذا الحساب.','Solicitud de amistad enviada.':'تم إرسال طلب الصداقة.','¡Ahora sois amigos!':'أصبحتم أصدقاء الآن!','No tienes solicitudes pendientes.':'ليس لديك طلبات معلقة.','Todavía no hay publicaciones. ¡Sé el primero en compartir algo!':'لا توجد منشورات بعد. كن أول من يشارك!','Escribe algo antes de publicar.':'اكتب شيئاً قبل النشر.','Publicación compartida.':'تم نشر المنشور.',
    'Descubrir':'اكتشف','Me gustas':'الإعجابات','Conexiones':'الاتصالات','Mensajes':'الرسائل','Mi perfil':'ملفي الشخصي','Ajustes':'الإعدادات','Administración':'الإدارة',
    'MENÚ PRINCIPAL':'القائمة الرئيسية','TU ESPACIO':'مساحتك','Descubre personas':'اكتشف أشخاصاً','Personas interesantes, historias diferentes. Empieza por un hola.':'أشخاص مميزون وقصص مختلفة. ابدأ بتحية.',
    'Personas para ti':'أشخاص مقترحون لك','Buscar por nombre o interés...':'ابحث بالاسم أو الاهتمام...','Todos los países':'كل البلدان','Todos los objetivos':'كل الأهداف','Limpiar':'مسح',
    'INTERÉS COMPARTIDO':'اهتمام مشترك','Perfiles que te interesan.':'الملفات الشخصية التي تهمك.','DOS PERSONAS, UNA CONEXIÓN':'شخصان، تواصل واحد','Tus conexiones':'اتصالاتك',
    'El interés mutuo abre la puerta a conversar.':'الاهتمام المتبادل يفتح باب المحادثة.','Aún no tienes conexiones mutuas. Cuando dos personas se gusten, aparecerán aquí.':'ليست لديك اتصالات متبادلة بعد. ستظهر هنا عندما يعجب كل منكما بالآخر.',
    'CONVERSACIONES PRIVADAS':'محادثات خاصة','Habla directamente con cualquier persona de WorldConnect.':'تواصل مباشرة مع أي شخص في WorldConnect.',
    'Elige una conversación':'اختر محادثة','Todavía no tienes conversaciones. Abre cualquier perfil y pulsa Enviar mensaje.':'لا توجد محادثات بعد. افتح أي ملف شخصي واضغط على إرسال رسالة.',
    'Enviar mensaje':'إرسال رسالة','Enviar':'إرسال','Escribe un mensaje…':'اكتب رسالة…','En línea':'متصل','Desconectado':'غير متصل','Denunciar':'إبلاغ','Bloquear':'حظر',
    'TU IDENTIDAD':'هويتك','Cuenta quién eres y qué conexión buscas.':'عرّف بنفسك وبنوع التواصل الذي تبحث عنه.',
    'Guardar cambios':'حفظ التغييرات','Cambiar foto':'تغيير الصورة','Nombre':'الاسم','País':'البلد','Ciudad':'المدينة','Idiomas':'اللغات','Qué buscas':'ما الذي تبحث عنه؟','Sobre mí':'نبذة عني',
    'Amistad':'صداقة','Relación seria':'علاقة جدية','Ambos':'كلاهما','Cerrar sesión':'تسجيل الخروج','Privacidad y seguridad':'الخصوصية والأمان',
    'Visibilidad del perfil':'ظهور الملف الشخصي','Permite que otras personas te encuentren.':'اسمح للآخرين بالعثور عليك.',
    'No se pudo abrir la conversación:':'تعذر فتح المحادثة:','Nuevo mensaje':'رسالة جديدة'
  },
    "Siguiendo ✓":"أتابعه ✓",
    "Siguiendo":"أتابعه",
    "＋ Seguir":"＋ متابعة",
    "＋ Añadir amigo":"＋ إضافة صديق",
    "Añadir un amigo":"إضافة صديق",
    "Agregar amigo":"إضافة صديق",
    "Agregar un amigo":"إضافة صديق",
    "Amigos":"الأصدقاء",
    "Amigos y seguidores":"الأصدقاء والمتابعون",
    "Solicitudes recibidas":"الطلبات الواردة",
    "Solicitudes enviadas":"الطلبات المرسلة",
    "Aceptar":"قبول",
    "Rechazar":"رفض",
    "Eliminar amigo":"إزالة صديق",
    "Dejar de seguir":"إلغاء المتابعة",
    "Seguidores":"المتابعون",
    "Seguidos":"أتابعهم",
    "Buscar amigos":"البحث عن أصدقاء",
    "Lista de amigos":"قائمة الأصدقاء",
    "Sin amigos todavía":"لا يوجد أصدقاء بعد",
    "No hay seguidores todavía":"لا يوجد متابعون بعد",
    "No sigues a nadie todavía":"لا تتابع أي شخص حالياً",
    "Publicaciones":"المنشورات",
    "Comentarios":"التعليقات",
    "Comentar":"تعليق",
    "Me gusta":"أعجبني",
    "Me encanta":"أحببته",
    "No me gusta":"لم يعجبني",
    "Foto / vídeo":"صورة / فيديو",
    "Seleccionar archivo":"اختر ملفاً",
    "Escribe un comentario...":"اكتب تعليقاً...",
    "No hay publicaciones todavía.":"لا توجد منشورات بعد.",
    "Compartir":"مشاركة",
    "Eliminar publicación":"حذف المنشور",
    "Editar perfil":"تعديل الملف الشخصي",
    "Guardando...":"جارٍ الحفظ...",
    "Cambios guardados.":"تم حفظ التغييرات.",
    "Solicitud aceptada.":"تم قبول الطلب.",
    "Solicitud rechazada.":"تم رفض الطلب.",
    "No se pudo enviar la solicitud:":"تعذر إرسال الطلب:",
    "No se pudo actualizar la solicitud:":"تعذر تحديث الطلب:",
    "No se pudo publicar:":"تعذر نشر المنشور:",
    "No se pudo comentar:":"تعذرت إضافة التعليق:",
    "No se pudo reaccionar:":"تعذر تسجيل التفاعل:",
    "No se pudo cargar la lista de amigos:":"تعذر تحميل قائمة الأصدقاء:",
    "Notificaciones":"الإشعارات",
    "No tienes notificaciones nuevas.":"ليس لديك إشعارات جديدة.",
    "Nueva solicitud de amistad":"طلب صداقة جديد",
    "Nuevo comentario":"تعليق جديد",
    "Nueva reacción":"تفاعل جديد",
    "Perfil actualizado.":"تم تحديث الملف الشخصي.",
    "Guardar":"حفظ",
    "Cancelar":"إلغاء",
    "Cargando...":"جارٍ التحميل...",
    "Sin resultados":"لا توجد نتائج",
    "Ver perfil":"عرض الملف الشخصي",
    "Enviar mensaje":"إرسال رسالة",
    "Escribe un mensaje…":"اكتب رسالة…",
    "Adjuntar foto":"إرفاق صورة",
    "Adjuntar vídeo":"إرفاق فيديو",
    "Enviar audio":"إرسال تسجيل صوتي",
    "Llamada de voz":"مكالمة صوتية",
    "Videollamada":"مكالمة فيديو",
    "En línea":"متصل",
    "Desconectado":"غير متصل",
    "Mi perfil":"ملفي الشخصي",
    "Ajustes":"الإعدادات",
    "Cerrar sesión":"تسجيل الخروج",
    "Descubrir":"اكتشف",
    "Me gustas":"الإعجابات",
    "Mensajes":"الرسائل",
    "Publicar":"نشر",
    "¿Qué estás pensando?":"بماذا تفكر؟",
    "Buscar por nombre o interés...":"ابحث بالاسم أو الاهتمام...",
    "Todos los países":"كل البلدان",
    "Todos los objetivos":"كل الأهداف",
    "Limpiar":"مسح",
    "Añadir amigo":"إضافة صديق",
    "Solicitud enviada":"تم إرسال الطلب",
    "Enviar":"إرسال",
    "Denunciar":"إبلاغ",
    "Bloquear":"حظر",
    "Editar publicación":"تعديل المنشور",
    "Eliminar publicación":"حذف المنشور",
    "Desactivar comentarios":"تعطيل التعليقات",
    "Permitir comentarios":"السماح بالتعليقات",
    "Editar":"تعديل",
    "Eliminar comentario":"حذف التعليق",
    "Comentarios activados.":"تم تفعيل التعليقات.",
    "Comentarios desactivados.":"تم تعطيل التعليقات.",
    "Publicación modificada.":"تم تعديل المنشور.",
    "Publicación eliminada.":"تم حذف المنشور.",
    "Comentario modificado.":"تم تعديل التعليق.",
    "Comentario eliminado.":"تم حذف التعليق.",
    "¿Eliminar este comentario?":"هل تريد حذف هذا التعليق؟",
    "¿Seguro que quieres eliminar esta publicación?":"هل أنت متأكد أنك تريد حذف هذا المنشور؟",
    "El autor ha desactivado los comentarios.":"قام صاحب المنشور بتعطيل التعليقات."
};
const originalTextNodes=new WeakMap(), originalAttributes=new WeakMap();
function translateWithDictionary(value,dict){
  let result=String(value??'');
  const keys=Object.keys(dict).sort((a,b)=>b.length-a.length);
  for(const key of keys){
    if(!key)continue;
    result=result.split(key).join(dict[key]);
  }
  return result;
}
function applyLanguage(lang){
  const code=String(lang||'es').toLowerCase();
  document.documentElement.lang=code;
  document.documentElement.dir=code==='ar'?'rtl':'ltr';
  document.body.classList.toggle('lang-rtl',code==='ar');
  const dict=UI_TRANSLATIONS[code]||{};
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    if(!node.nodeValue.trim())continue;
    if(node.parentElement?.closest('script,style,textarea,[data-no-translate],input'))continue;
    if(!originalTextNodes.has(node))originalTextNodes.set(node,node.nodeValue);
    node.nodeValue=translateWithDictionary(originalTextNodes.get(node),dict);
  }
  document.querySelectorAll('[placeholder],[title],[aria-label],[alt],[data-tooltip]').forEach(el=>{
    let saved=originalAttributes.get(el);
    if(!saved){saved={};['placeholder','title','aria-label','alt','data-tooltip'].forEach(k=>{if(el.hasAttribute(k))saved[k]=el.getAttribute(k);});originalAttributes.set(el,saved);}
    Object.entries(saved).forEach(([k,v])=>el.setAttribute(k,translateWithDictionary(v,dict)));
  });
}

let currentUiLanguage='es',translationObserver=null;
function refreshLanguage(){
  const selector=$('#app-language')||$('#language');
  const raw=selector?.value||localStorage.getItem('worldconnect-language')||'es';
  currentUiLanguage=raw.toLowerCase();
  applyLanguage(currentUiLanguage);
}
function setUiLanguage(value){
  const code=String(value||'es').toLowerCase();
  localStorage.setItem('worldconnect-language',code);
  currentUiLanguage=code;
  applyLanguage(code);
}
translationObserver=new MutationObserver(()=>{if(currentUiLanguage!=='es')applyLanguage(currentUiLanguage);});
translationObserver.observe(document.body,{childList:true,subtree:true});

$('#app-language').onchange=e=>setUiLanguage(e.target.value);$('#language').onchange=e=>setUiLanguage(e.target.value);refreshLanguage();
if(!configured()){authView();toast('Configura Firebase en js/firebase-config.js para usar la versión real.');}else{onAuthStateChanged(auth,async firebaseUser=>{if(!firebaseUser){stopListeners();state.user=null;authView('login');return;}try{state.user=await getProfile(firebaseUser);appView();await loadUserData();startPresence();route(location.hash.slice(1)||'discover');}catch(e){console.error(e);toast('No se pudo cargar tu perfil: '+e.message);authView('login');}});}
if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(console.warn));

$('#enable-notifications')?.addEventListener('click',async()=>{
  if(!('Notification'in window))return toast('Este navegador no soporta notificaciones.');
  const permission=await Notification.requestPermission();
  if(permission==='granted'){toast('Notificaciones activadas.');$('#enable-notifications').classList.add('hide');}
  else toast('No se activaron las notificaciones.');
});
