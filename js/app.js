import { configured } from "./firebase-config.js";
import { uploadImage } from "./cloudinary.js";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const state = {
  user: null,
  profiles: [],
  likes: [],
  matches: [],
  chatId: null,
  chatUser: null,
  unsubUsers: null,
  unsubLikes: null,
  unsubMatches: null,
  unsubMessages: null,
  presenceTimer: null,
  online: false,
};
const avatar = (name) => (name || "?").trim().charAt(0).toUpperCase();
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3200);
}
function authView(tab = "login") {
  $("#auth").classList.remove("hide");
  $("#app").classList.add("hide");
  $$("[data-tab]").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab),
  );
  $("#login-form").classList.toggle("hide", tab !== "login");
  $("#register-form").classList.toggle("hide", tab !== "register");
}
function appView() {
  $("#auth").classList.add("hide");
  $("#app").classList.remove("hide");
  $("#demo")?.classList.add("hide");
  $("#mini-name").textContent = state.user.name || "Usuario";
  $("#mini-country").textContent = state.user.country || "";
  $("#mini-avatar").textContent = avatar(state.user.name);
  $("#admin-link").classList.toggle("hide", !state.user.isAdmin);
  fillProfile();
}
function fillProfile() {
  const u = state.user;
  $("#p-name").value = u.name || "";
  $("#p-country").value = u.country || "";
  $("#p-city").value = u.city || "";
  $("#p-bio").value = u.bio || "";
  $("#p-purpose").value = u.purpose || "both";
  $("#p-interests").value = (u.interests || []).join(", ");
  if (u.photoURL) {
    $("#photo").style.backgroundImage = `url('${u.photoURL}')`;
    $("#photo").textContent = "";
  } else {
    $("#photo").textContent = avatar(u.name);
  }
}
function route(page) {
  const allowed = [
    "discover",
    "likes",
    "matches",
    "chat",
    "profile",
    "settings",
    "admin",
  ];
  if (!allowed.includes(page)) page = "discover";
  if (page === "admin" && !state.user?.isAdmin) {
    toast("Acceso restringido");
    page = "discover";
  }
  $$(".page").forEach((el) =>
    el.classList.toggle("hide", el.id !== `page-${page}`),
  );
  $$("[data-page]").forEach((el) =>
    el.classList.toggle("active", el.dataset.page === page),
  );
  $("#page-title").textContent = {
    discover: "Descubrir",
    likes: "Me gustas",
    matches: "Conexiones",
    chat: "Mensajes",
    profile: "Mi perfil",
    settings: "Ajustes",
    admin: "Administración",
  }[page];
  if (page === "discover") renderDiscover();
  if (page === "likes") renderLikes();
  if (page === "matches") renderMatches();
  if (page === "chat") renderChatList();
  if (location.hash !== `#${page}`) history.replaceState(null, "", `#${page}`);
  $("#sidebar").classList.remove("open");
}
function profileCard(u) {
  const isOnline =
    u.online === true && u.lastSeen?.toMillis
      ? Date.now() - u.lastSeen.toMillis() < 120000
      : false;
  const liked = state.likes.some((x) => x.toUid === u.uid);
  const matched = state.matches.some((x) =>
    (x.participants || []).includes(u.uid),
  );
  const image = u.photoURL
    ? `<img src="${esc(u.photoURL)}" alt="">`
    : `<span class="fallback-avatar">${esc(avatar(u.name))}</span>`;
  return `<article class="card"><div class="cover profile-cover">${image}<span class="online ${isOnline ? "" : "offline"}">● ${isOnline ? "En línea" : "Desconectado"}</span><span class="country-tag">${esc(u.country || "")} ${u.city ? "· " + esc(u.city) : ""}</span></div><div class="card-body"><div class="card-title"><h3>${esc(u.name || "Usuario")}${u.age ? `, ${esc(u.age)}` : ""}</h3><small>18+</small></div><p class="bio">${esc(u.bio || "Este usuario todavía no ha añadido una descripción.")}</p><div class="tags">${(
    u.interests || []
  )
    .slice(0, 4)
    .map((t) => `<span class="tag">${esc(t)}</span>`)
    .join(
      "",
    )}</div><div class="actions"><button class="like ${liked ? "liked" : ""}" data-like="${esc(u.uid)}" ${liked ? "disabled" : ""}>${liked ? "♥ Interés enviado" : "♡ Me gusta"}</button>${matched ? `<button class="outline" data-open-chat="${esc(u.uid)}">Enviar mensaje</button>` : ""}</div></div></article>`;
}
function visibleProfiles() {
  return state.profiles.filter(
    (p) =>
      p.uid !== state.user.uid &&
      p.status === "active" &&
      p.visibility !== "hidden" &&
      !state.user.blockedUids?.includes(p.uid),
  );
}
function renderDiscover() {
  const q = ($("#search")?.value || "").toLowerCase(),
    country = $("#country")?.value || "",
    purpose = $("#purpose")?.value || "";
  const list = visibleProfiles().filter(
    (p) =>
      (!q ||
        `${p.name || ""} ${p.bio || ""} ${(p.interests || []).join(" ")}`
          .toLowerCase()
          .includes(q)) &&
      (!country || p.country === country) &&
      (!purpose || p.purpose === purpose || p.purpose === "both"),
  );
  $("#total").textContent = `${list.length} perfiles reales`;
  $("#people").innerHTML = list.length
    ? list.map(profileCard).join("")
    : '<div class="empty">Todavía no hay otros perfiles. Comparte el enlace de WorldConnect para invitar a tus amigos.</div>';
}
function renderLikes() {
  const liked = state.likes
    .map((l) => state.profiles.find((p) => p.uid === l.toUid))
    .filter(Boolean);
  $("#likes").innerHTML = liked.length
    ? liked.map(profileCard).join("")
    : '<div class="empty">Todavía no has enviado ningún me gusta.</div>';
  $("#like-count").textContent = state.likes.length;
}
function renderMatches() {
  const people = state.matches
    .map((m) =>
      state.profiles.find(
        (p) =>
          p.uid === (m.participants || []).find((id) => id !== state.user.uid),
      ),
    )
    .filter(Boolean);
  $("#matches").innerHTML = people.length
    ? people.map(profileCard).join("")
    : '<div class="empty">Aún no tienes conexiones mutuas. Cuando dos personas se gusten, aparecerán aquí.</div>';
}
function renderChatList() {
  const items = state.matches
    .map((m) => ({
      match: m,
      user: state.profiles.find(
        (p) =>
          p.uid === (m.participants || []).find((id) => id !== state.user.uid),
      ),
    }))
    .filter((x) => x.user);
  $("#chat-list").innerHTML =
    items
      .map(
        (x) =>
          `<button class="chat-person ${state.chatId === x.match.id ? "active" : ""}" data-chat-id="${esc(x.match.id)}" data-chat-user="${esc(x.user.uid)}">${esc(x.user.name || "Usuario")} <small>· conexión mutua</small></button>`,
      )
      .join("") ||
    '<p class="empty">Solo puedes conversar después de un interés mutuo.</p>';
  if (state.chatId && items.some((x) => x.match.chatId === state.chatId))
    openChat(state.chatId, state.chatUser);
  else if (!items.length)
    $("#chat-window").innerHTML =
      '<div class="empty">Tus conversaciones aparecerán aquí.</div>';
}
function openChat(chatId, otherUid) {
  state.chatId = chatId;
  state.chatUser = otherUid;
  const other = state.profiles.find((p) => p.uid === otherUid);
  $("#chat-window").innerHTML =
    `<div class="chat-head"><b>${esc(other?.name || "Conexión")}</b><span class="muted">Conversación privada</span><button class="outline" data-report="${esc(otherUid)}">Denunciar</button><button class="outline" data-block="${esc(otherUid)}">Bloquear</button></div><div class="messages" id="messages"><div class="empty">Cargando mensajes…</div></div><form class="message-form" id="message-form"><input id="message-text" maxlength="1000" placeholder="Escribe un mensaje…" required><button class="primary">Enviar</button></form>`;
  if (state.unsubMessages) state.unsubMessages();
  const q = query(collection(db, "chats", chatId, "messages"));
  state.unsubMessages = onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(
          (a, b) =>
            (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0),
        );
      $("#messages").innerHTML =
        msgs
          .map(
            (m) =>
              `<div class="message ${m.senderUid === state.user.uid ? "mine" : ""}">${esc(m.text)}</div>`,
          )
          .join("") || '<div class="empty">ابدأ المحادثة برسالة محترمة.</div>';
      $("#messages").scrollTop = $("#messages").scrollHeight;
    },
    (err) => toast("No se pudieron cargar los mensajes: " + err.message),
  );
}
async function loadUserData() {
  if (state.unsubUsers) state.unsubUsers();
  if (state.unsubLikes) state.unsubLikes();
  if (state.unsubMatches) state.unsubMatches();
  state.unsubUsers = onSnapshot(
    collection(db, "users"),
    (snap) => {
      state.profiles = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      renderDiscover();
      renderLikes();
      renderMatches();
      if (!$("#page-chat").classList.contains("hide")) renderChatList();
    },
    (err) => toast("Error cargando perfiles: " + err.message),
  );
  state.unsubLikes = onSnapshot(
    query(collection(db, "likes"), where("fromUid", "==", state.user.uid)),
    (snap) => {
      state.likes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      $("#like-count").textContent = state.likes.length;
      renderLikes();
      renderDiscover();
    },
    (err) => toast("Error cargando intereses: " + err.message),
  );
  state.unsubMatches = onSnapshot(
    query(
      collection(db, "matches"),
      where("participants", "array-contains", state.user.uid),
    ),
    (snap) => {
      state.matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderMatches();
      if (!$("#page-chat").classList.contains("hide")) renderChatList();
    },
    (err) => toast("Error cargando conexiones: " + err.message),
  );
}
async function setPresence(online = true) {
  if (!state.user) return;
  try {
    await updateDoc(doc(db, "users", state.user.uid), {
      online,
      lastSeen: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Presence update:", e.message);
  }
}
function startPresence() {
  clearInterval(state.presenceTimer);
  setPresence(true);
  state.presenceTimer = setInterval(() => setPresence(true), 45000);
  window.addEventListener(
    "pagehide",
    () => {
      if (state.user) setPresence(false);
    },
    { once: true },
  );
}
function stopListeners() {
  [
    state.unsubUsers,
    state.unsubLikes,
    state.unsubMatches,
    state.unsubMessages,
  ].forEach((fn) => {
    if (fn) fn();
  });
  state.unsubUsers =
    state.unsubLikes =
    state.unsubMatches =
    state.unsubMessages =
      null;
  clearInterval(state.presenceTimer);
}
async function getProfile(user) {
  const ref = doc(db, "users", user.uid);
  let snap = await getDoc(ref);
  if (!snap.exists()) {
    const initial = {
      uid: user.uid,
      name: user.displayName || "Usuario",
      email: user.email || "",
      country: "",
      city: "",
      purpose: "both",
      languages: [],
      interests: [],
      bio: "",
      photoURL: "",
      adultConfirmed: true,
      termsVersion: "1.0",
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      online: true,
      status: "active",
      role: "user",
      visibility: "public",
    };
    await setDoc(ref, initial);
    snap = await getDoc(ref);
  }
  const token = await user.getIdTokenResult();
  return {
    uid: user.uid,
    email: user.email,
    ...snap.data(),
    isAdmin: token.claims.admin === true,
  };
}
async function sendLike(targetUid) {
  if (targetUid === state.user.uid) return;
  const likeId = `${state.user.uid}_${targetUid}`;
  const ref = doc(db, "likes", likeId);
  try {
    await setDoc(ref, {
      fromUid: state.user.uid,
      toUid: targetUid,
      createdAt: serverTimestamp(),
    });
    const reciprocal = await getDoc(
      doc(db, "likes", `${targetUid}_${state.user.uid}`),
    );
    if (reciprocal.exists()) {
      const participants = [state.user.uid, targetUid].sort();
      const matchId = participants.join("_");
      const matchRef = doc(db, "matches", matchId);
      const matchSnap = await getDoc(matchRef);
      if (!matchSnap.exists()) {
        await setDoc(matchRef, { participants, createdAt: serverTimestamp() });
        await setDoc(doc(db, "chats", matchId), {
          participants,
          createdAt: serverTimestamp(),
        });
      }
      toast("🎉 إعجاب متبادل! تقدروا دابا تتراسلوا.");
    } else toast("تم إرسال الإعجاب. إذا كان متبادلاً ستظهر المحادثة.");
  } catch (e) {
    toast("تعذر إرسال الإعجاب: " + e.message);
  }
}
async function submitMessage(text) {
  if (!state.chatId || !state.chatUser || !text.trim()) return;
  try {
    await addDoc(collection(db, "chats", state.chatId, "messages"), {
      senderUid: state.user.uid,
      text: text.trim(),
      createdAt: serverTimestamp(),
    });
    $("#message-text").value = "";
  } catch (e) {
    toast("تعذر إرسال الرسالة: " + e.message);
  }
}
$$("[data-tab]").forEach((b) =>
  b.addEventListener("click", () => authView(b.dataset.tab)),
);
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await signInWithEmailAndPassword(
      auth,
      $("#login-email").value.trim(),
      $("#login-password").value,
    );
    toast("تم تسجيل الدخول بنجاح.");
  } catch (x) {
    toast(authError(x));
  }
});
$("#register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!$("#adult").checked || !$("#terms").checked)
    return toast("Confirma que eres mayor de edad y acepta las condiciones.");
  try {
    const name = $("#reg-name").value.trim(),
      email = $("#reg-email").value.trim(),
      country = $("#reg-country").value;
    const cred = await createUserWithEmailAndPassword(
      auth,
      email,
      $("#reg-password").value,
    );
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      name,
      email,
      country,
      city: "",
      purpose: "both",
      languages: [],
      interests: [],
      bio: "",
      photoURL: "",
      adultConfirmed: true,
      termsVersion: "1.0",
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      online: true,
      status: "active",
      role: "user",
      visibility: "public",
    });
    try {
      await sendEmailVerification(cred.user);
    } catch (err) {
      console.warn("Verification email:", err);
    }
    toast("Cuenta creada. Ya puedes completar tu perfil.");
  } catch (x) {
    toast(authError(x));
  }
});
function authError(e) {
  const map = {
    "auth/email-already-in-use":
      "Este correo ya tiene una cuenta. Inicia sesión.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/invalid-email": "El correo no es válido.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
  };
  return map[e.code] || e.message || "Ha ocurrido un error.";
}
$("#forgot").onclick = async () => {
  const email = $("#login-email").value.trim();
  if (!email) return toast("Escribe tu correo primero.");
  try {
    await sendPasswordResetEmail(auth, email);
    toast("Correo de recuperación enviado.");
  } catch (e) {
    toast(authError(e));
  }
};
$("#logout").onclick = async () => {
  try {
    await setPresence(false);
  } catch {}
  stopListeners();
  state.user = null;
  state.profiles = [];
  state.likes = [];
  state.matches = [];
  state.chatId = null;
  await signOut(auth);
  authView("login");
  toast("Has cerrado sesión.");
};
window.addEventListener("hashchange", () => {
  if (state.user) route(location.hash.slice(1));
});
document.addEventListener("click", async (e) => {
  const like = e.target.closest("[data-like]"),
    open = e.target.closest("[data-open-chat]"),
    chat = e.target.closest("[data-chat-id]"),
    report = e.target.closest("[data-report]"),
    block = e.target.closest("[data-block]");
  if (like) {
    like.disabled = true;
    await sendLike(like.dataset.like);
  }
  if (open) {
    const match = state.matches.find((m) =>
      (m.participants || []).includes(open.dataset.openChat),
    );
    if (match) {
      location.hash = "chat";
      openChat(match.id, open.dataset.openChat);
    }
  }
  if (chat) {
    location.hash = "chat";
    openChat(chat.dataset.chatId, chat.dataset.chatUser);
  }
  if (report) {
    $("#report-id").value = report.dataset.report;
    $("#report-modal").showModal();
  }
  if (block) {
    try {
      await addDoc(collection(db, "blocks"), {
        blockerUid: state.user.uid,
        blockedUid: block.dataset.block,
        createdAt: serverTimestamp(),
      });
      toast("تم حظر المستخدم.");
    } catch (err) {
      toast("تعذر الحظر: " + err.message);
    }
  }
  if (e.target.matches("[data-close]")) e.target.closest("dialog").close();
});
$("#report-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await addDoc(collection(db, "reports"), {
      reporterUid: state.user.uid,
      targetUid: $("#report-id").value,
      reason: $("#reason").value,
      details: $("#details").value.trim(),
      createdAt: serverTimestamp(),
      status: "new",
    });
    $("#report-modal").close();
    e.target.reset();
    toast("تم إرسال البلاغ للمراجعة.");
  } catch (err) {
    toast("تعذر إرسال البلاغ: " + err.message);
  }
});
$("#search").oninput = renderDiscover;
$("#country").onchange = renderDiscover;
$("#purpose").onchange = renderDiscover;
$("#clear").onclick = () => {
  $("#search").value = $("#country").value = $("#purpose").value = "";
  renderDiscover();
};
document.addEventListener("submit", (e) => {
  if (e.target.id === "message-form") {
    e.preventDefault();
    submitMessage($("#message-text").value);
  }
});
$("#save").onclick = async () => {
  const data = {
    name: $("#p-name").value.trim(),
    country: $("#p-country").value.trim(),
    city: $("#p-city").value.trim(),
    bio: $("#p-bio").value.trim(),
    purpose: $("#p-purpose").value,
    interests: $("#p-interests")
      .value.split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    languages: [...$("#p-languages").selectedOptions].map((x) => x.value),
  };
  try {
    await updateDoc(doc(db, "users", state.user.uid), data);
    state.user = { ...state.user, ...data };
    fillProfile();
    toast("Perfil actualizado y guardado.");
  } catch (e) {
    toast("Error guardando perfil: " + e.message);
  }
};
$("#photo-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const { url, publicId } = await uploadImage(file);
    await updateDoc(doc(db, "users", state.user.uid), {
      photoURL: url,
      photoPublicId: publicId,
    });
    state.user.photoURL = url;
    fillProfile();
    toast("Foto actualizada.");
  } catch (x) {
    toast(x.message);
  }
};
$("#visible").onchange = async (e) => {
  try {
    await updateDoc(doc(db, "users", state.user.uid), {
      visibility: e.target.checked ? "public" : "hidden",
    });
    toast("Preferencia de visibilidad guardada.");
  } catch (err) {
    toast(err.message);
  }
};
$("#delete").onclick = () =>
  toast("Para eliminar la cuenta y sus datos, contacta con el administrador.");
$("#menu").onclick = () => $("#sidebar").classList.toggle("open");
// Traducción real de la interfaz: ES, EN, FR y AR.
const translations = {
  en: {
    "Iniciar sesión": "Log in",
    "Crear cuenta": "Create account",
    "QUÉ BUENO TENERTE DE VUELTA": "WELCOME BACK",
    "Bienvenido/a": "Welcome",
    "Entra para continuar tus conexiones.": "Log in to continue connecting.",
    "Correo electrónico": "Email address",
    Contraseña: "Password",
    "Tu contraseña": "Your password",
    "Iniciar sesión →": "Log in →",
    "¿Has olvidado tu contraseña?": "Forgot your password?",
    "TU HISTORIA EMPIEZA AQUÍ": "YOUR STORY STARTS HERE",
    "Crea tu cuenta": "Create your account",
    "Unos datos básicos para empezar.": "A few details to get started.",
    "Nombre visible": "Display name",
    "¿Cómo te llamamos?": "What should we call you?",
    "Mínimo 8 caracteres": "At least 8 characters",
    País: "Country",
    "Selecciona tu país": "Select your country",
    "Confirmo que tengo 18 años o más.": "I confirm that I am 18 or older.",
    "Acepto los términos, el código de conducta y la política de privacidad.":
      "I accept the terms, code of conduct and privacy policy.",
    "Crear mi cuenta →": "Create account →",
    "MENÚ PRINCIPAL": "MAIN MENU",
    Descubrir: "Discover",
    "Me gustas": "Likes",
    Conexiones: "Matches",
    Mensajes: "Messages",
    "TU ESPACIO": "YOUR SPACE",
    "Mi perfil": "My profile",
    Ajustes: "Settings",
    Administración: "Administration",
    "Cerrar sesión": "Log out",
    "Conecta con respeto y autenticidad.":
      "Connect with respect and authenticity.",
    "TU PRÓXIMA CONEXIÓN": "YOUR NEXT CONNECTION",
    "Descubre personas": "Discover people",
    "Personas interesantes, historias diferentes. Empieza por un hola.":
      "Interesting people, different stories. Start with a hello.",
    "🌍 Comunidad internacional": "🌍 International community",
    "⌕ Buscar por nombre o interés...": "⌕ Search by name or interest...",
    "Todos los países": "All countries",
    "Todos los objetivos": "All purposes",
    Amistad: "Friendship",
    "Relación seria": "Serious relationship",
    Ambos: "Both",
    Limpiar: "Clear",
    "Personas para ti": "People for you",
    "Cargando perfiles reales…": "Loading real profiles…",
    "INTERÉS COMPARTIDO": "SHARED INTEREST",
    "Perfiles que te interesan.": "Profiles you are interested in.",
    "DOS PERSONAS, UNA CONEXIÓN": "TWO PEOPLE, ONE CONNECTION",
    "Tus conexiones": "Your matches",
    "El interés mutuo abre la puerta a conversar.":
      "Mutual interest opens the door to chat.",
    "CONVERSACIONES PRIVADAS": "PRIVATE CONVERSATIONS",
    "Solo puedes escribir a tus conexiones mutuas.":
      "You can only message mutual matches.",
    "Elige una conversación": "Choose a conversation",
    "TU IDENTIDAD": "YOUR IDENTITY",
    "Cuenta quién eres y qué conexión buscas.":
      "Tell people who you are and what connection you are looking for.",
    "Guardar cambios": "Save changes",
    "Cambiar foto": "Change photo",
    "JPG, PNG o WebP · máximo 5 MB": "JPG, PNG or WebP · max 5 MB",
    Ciudad: "City",
    Idiomas: "Languages",
    "Qué buscas": "Looking for",
    "Sobre mí": "About me",
    Intereses: "Interests",
    "Tecnología, viajes, música...": "Technology, travel, music...",
    "CONTROL Y PRIVACIDAD": "CONTROL & PRIVACY",
    "Privacidad y seguridad": "Privacy and safety",
    "Visibilidad del perfil": "Profile visibility",
    "Permite que otras personas te encuentren.":
      "Allow other people to find you.",
    "Eliminar cuenta": "Delete account",
    "Solicita la eliminación de tu cuenta y datos.":
      "Request deletion of your account and data.",
    "Solicitar eliminación": "Request deletion",
    "Normas de comunidad": "Community guidelines",
    "No se permite acoso, amenazas, odio, suplantación, spam ni fraude. Puedes bloquear y denunciar perfiles. No compartas dinero ni datos sensibles con desconocidos.":
      "Harassment, threats, hate, impersonation, spam and fraud are not allowed. You can block and report profiles. Do not share money or sensitive information with strangers.",
    "CONTROL DE LA COMUNIDAD": "COMMUNITY MANAGEMENT",
    "Panel reservado al administrador.": "Administrator-only panel.",
    Usuarios: "Users",
    Denuncias: "Reports",
    "Denuncias recibidas": "Received reports",
    "No hay denuncias recibidas.": "There are no reports.",
    "El panel visual no concede permisos. El rol admin debe asignarse mediante Firebase Admin SDK Custom Claims y validarse en Security Rules.":
      "The visual panel does not grant permissions. The admin role must be assigned using Firebase Admin SDK Custom Claims and validated in Security Rules.",
    Información: "Information",
    "Denunciar perfil": "Report profile",
    Motivo: "Reason",
    Selecciona: "Select",
    "Acoso o mensajes ofensivos": "Harassment or offensive messages",
    "Perfil falso o suplantación": "Fake profile or impersonation",
    "Estafa o solicitud de dinero": "Scam or request for money",
    "Contenido inapropiado": "Inappropriate content",
    Spam: "Spam",
    Otro: "Other",
    Detalles: "Details",
    "Enviar denuncia": "Submit report",
    "Solo para mayores de 18 años": "For adults aged 18 and over",
    "Este usuario todavía no ha añadido una descripción.":
      "This user has not added a description yet.",
    "Enviar mensaje": "Send message",
    "Interés enviado": "Interest sent",
    "Me gusta": "Like",
    Desconectado: "Offline",
    "En línea": "Online",
    "Mensajes privados": "Private messages",
    "Empieza la conversación con un mensaje respetuoso.":
      "Start the conversation with a respectful message.",
    "Escribe un mensaje…": "Write a message…",
    Enviar: "Send",
    "Conversación privada": "Private conversation",
    Denunciar: "Report",
    Bloquear: "Block",
    "Solo puedes conversar después de un interés mutuo.":
      "You can only chat after a mutual like.",
    "Tus conversaciones aparecerán aquí.":
      "Your conversations will appear here.",
    "Todavía no has enviado ningún me gusta.":
      "You have not sent any likes yet.",
    "Aún no tienes conexiones mutuas. Cuando dos personas se gusten, aparecerán aquí.":
      "You do not have mutual matches yet. They will appear here when two people like each other.",
    "Todavía no hay otros perfiles. Comparte el enlace de WorldConnect para invitar a tus amigos.":
      "There are no other profiles yet. Share the WorldConnect link to invite friends.",
    "perfiles reales": "real profiles",
    "Perfil actualizado y guardado.": "Profile updated and saved.",
    "Foto actualizada.": "Photo updated.",
    "Preferencia de visibilidad guardada.": "Visibility preference saved.",
    "Has cerrado sesión.": "You have logged out.",
    "Cuenta creada. Ya puedes completar tu perfil.":
      "Account created. You can now complete your profile.",
    "Correo de recuperación enviado.": "Password reset email sent.",
    "Escribe tu correo primero.": "Enter your email first.",
    "Confirma que eres mayor de edad y acepta las condiciones.":
      "Confirm that you are an adult and accept the terms.",
    "Acceso restringido": "Access restricted",
    "Configura Firebase en js/firebase-config.js para usar la versión real.":
      "Configure Firebase in js/firebase-config.js to use the live version.",
  },
  fr: {
    "Iniciar sesión": "Se connecter",
    "Crear cuenta": "Créer un compte",
    "QUÉ BUENO TENERTE DE VUELTA": "HEUREUX DE VOUS REVOIR",
    "Bienvenido/a": "Bienvenue",
    "Entra para continuar tus conexiones.":
      "Connectez-vous pour poursuivre vos échanges.",
    "Correo electrónico": "Adresse e-mail",
    Contraseña: "Mot de passe",
    "Tu contraseña": "Votre mot de passe",
    "Iniciar sesión →": "Se connecter →",
    "¿Has olvidado tu contraseña?": "Mot de passe oublié ?",
    "TU HISTORIA EMPIEZA AQUÍ": "VOTRE HISTOIRE COMMENCE ICI",
    "Crea tu cuenta": "Créer votre compte",
    "Unos datos básicos para empezar.": "Quelques informations pour commencer.",
    "Nombre visible": "Nom affiché",
    "¿Cómo te llamamos?": "Comment vous appeler ?",
    "Mínimo 8 caracteres": "8 caractères minimum",
    País: "Pays",
    "Selecciona tu país": "Sélectionnez votre pays",
    "Confirmo que tengo 18 años o más.": "Je confirme avoir 18 ans ou plus.",
    "Acepto los términos, el código de conducta y la política de privacidad.":
      "J’accepte les conditions, le code de conduite et la politique de confidentialité.",
    "Crear mi cuenta →": "Créer mon compte →",
    "MENÚ PRINCIPAL": "MENU PRINCIPAL",
    Descubrir: "Découvrir",
    "Me gustas": "Mes likes",
    Conexiones: "Relations",
    Mensajes: "Messages",
    "TU ESPACIO": "VOTRE ESPACE",
    "Mi perfil": "Mon profil",
    Ajustes: "Paramètres",
    Administración: "Administration",
    "Cerrar sesión": "Se déconnecter",
    "Conecta con respeto y autenticidad.":
      "Créez des liens avec respect et authenticité.",
    "TU PRÓXIMA CONEXIÓN": "VOTRE PROCHAINE RENCONTRE",
    "Descubre personas": "Découvrez des personnes",
    "Personas interesantes, historias diferentes. Empieza por un hola.":
      "Des personnes intéressantes, des histoires différentes. Commencez par un bonjour.",
    "🌍 Comunidad internacional": "🌍 Communauté internationale",
    "⌕ Buscar por nombre o interés...":
      "⌕ Rechercher par nom ou centre d’intérêt...",
    "Todos los países": "Tous les pays",
    "Todos los objetivos": "Tous les objectifs",
    Amistad: "Amitié",
    "Relación seria": "Relation sérieuse",
    Ambos: "Les deux",
    Limpiar: "Effacer",
    "Personas para ti": "Des personnes pour vous",
    "Cargando perfiles reales…": "Chargement des profils…",
    "INTERÉS COMPARTIDO": "INTÉRÊT PARTAGÉ",
    "Perfiles que te interesan.": "Les profils qui vous intéressent.",
    "DOS PERSONAS, UNA CONEXIÓN": "DEUX PERSONNES, UN LIEN",
    "Tus conexiones": "Vos relations",
    "El interés mutuo abre la puerta a conversar.":
      "Un intérêt réciproque permet de discuter.",
    "CONVERSACIONES PRIVADAS": "CONVERSATIONS PRIVÉES",
    "Solo puedes escribir a tus conexiones mutuas.":
      "Vous pouvez écrire uniquement à vos relations mutuelles.",
    "Elige una conversación": "Choisissez une conversation",
    "TU IDENTIDAD": "VOTRE IDENTITÉ",
    "Cuenta quién eres y qué conexión buscas.":
      "Présentez-vous et dites quel type de relation vous recherchez.",
    "Guardar cambios": "Enregistrer",
    "Cambiar foto": "Changer la photo",
    "JPG, PNG o WebP · máximo 5 MB": "JPG, PNG ou WebP · 5 Mo maximum",
    Ciudad: "Ville",
    Idiomas: "Langues",
    "Qué buscas": "Vous recherchez",
    "Sobre mí": "À propos de moi",
    Intereses: "Centres d’intérêt",
    "Tecnología, viajes, música...": "Technologie, voyages, musique...",
    "CONTROL Y PRIVACIDAD": "CONTRÔLE ET CONFIDENTIALITÉ",
    "Privacidad y seguridad": "Confidentialité et sécurité",
    "Visibilidad del perfil": "Visibilité du profil",
    "Permite que otras personas te encuentren.":
      "Permettre aux autres de vous trouver.",
    "Eliminar cuenta": "Supprimer le compte",
    "Solicita la eliminación de tu cuenta y datos.":
      "Demandez la suppression de votre compte et de vos données.",
    "Solicitar eliminación": "Demander la suppression",
    "Normas de comunidad": "Règles de la communauté",
    "No se permite acoso, amenazas, odio, suplantación, spam ni fraude. Puedes bloquear y denunciar perfiles. No compartas dinero ni datos sensibles con desconocidos.":
      "Le harcèlement, les menaces, la haine, l’usurpation, le spam et la fraude sont interdits. Vous pouvez bloquer et signaler des profils. Ne partagez ni argent ni données sensibles avec des inconnus.",
    "CONTROL DE LA COMUNIDAD": "GESTION DE LA COMMUNAUTÉ",
    "Panel reservado al administrador.": "Espace réservé à l’administrateur.",
    Usuarios: "Utilisateurs",
    Denuncias: "Signalements",
    "Denuncias recibidas": "Signalements reçus",
    "No hay denuncias recibidas.": "Aucun signalement reçu.",
    Información: "Informations",
    "Denunciar perfil": "Signaler un profil",
    Motivo: "Motif",
    Selecciona: "Sélectionner",
    "Acoso o mensajes ofensivos": "Harcèlement ou messages offensants",
    "Perfil falso o suplantación": "Faux profil ou usurpation",
    "Estafa o solicitud de dinero": "Arnaque ou demande d’argent",
    "Contenido inapropiado": "Contenu inapproprié",
    Spam: "Spam",
    Otro: "Autre",
    Detalles: "Détails",
    "Enviar denuncia": "Envoyer le signalement",
    "Solo para mayores de 18 años": "Réservé aux personnes de 18 ans et plus",
    "Este usuario todavía no ha añadido una descripción.":
      "Cet utilisateur n’a pas encore ajouté de description.",
    "Enviar mensaje": "Envoyer un message",
    "Interés enviado": "Intérêt envoyé",
    "Me gusta": "J’aime",
    Desconectado: "Hors ligne",
    "En línea": "En ligne",
    "Escribe un mensaje…": "Écrivez un message…",
    Enviar: "Envoyer",
    "Conversación privada": "Conversation privée",
    Denunciar: "Signaler",
    Bloquear: "Bloquer",
    "Solo puedes conversar después de un interés mutuo.":
      "Vous pouvez discuter uniquement après un intérêt mutuel.",
    "Tus conversaciones aparecerán aquí.":
      "Vos conversations apparaîtront ici.",
    "Todavía no has enviado ningún me gusta.":
      "Vous n’avez encore envoyé aucun like.",
    "Aún no tienes conexiones mutuas. Cuando dos personas se gusten, aparecerán aquí.":
      "Vous n’avez pas encore de relations mutuelles. Elles apparaîtront ici lorsque deux personnes se plairont.",
    "Todavía no hay otros perfiles. Comparte el enlace de WorldConnect para invitar a tus amigos.":
      "Il n’y a pas encore d’autres profils. Partagez le lien WorldConnect pour inviter vos amis.",
    "perfiles reales": "profils réels",
    "Perfil actualizado y guardado.": "Profil mis à jour et enregistré.",
    "Foto actualizada.": "Photo mise à jour.",
    "Preferencia de visibilidad guardada.":
      "Préférence de visibilité enregistrée.",
    "Has cerrado sesión.": "Vous êtes déconnecté.",
    "Cuenta creada. Ya puedes completar tu perfil.":
      "Compte créé. Vous pouvez maintenant compléter votre profil.",
    "Correo de recuperación enviado.": "E-mail de récupération envoyé.",
    "Escribe tu correo primero.": "Saisissez d’abord votre adresse e-mail.",
    "Confirma que eres mayor de edad y acepta las condiciones.":
      "Confirmez votre majorité et acceptez les conditions.",
    "Acceso restringido": "Accès restreint",
  },
  ar: {
    "Iniciar sesión": "تسجيل الدخول",
    "Crear cuenta": "إنشاء حساب",
    "QUÉ BUENO TENERTE DE VUELTA": "سعداء بعودتك",
    "Bienvenido/a": "مرحباً بك",
    "Entra para continuar tus conexiones.":
      "سجّل الدخول لمتابعة تواصلك مع الآخرين.",
    "Correo electrónico": "البريد الإلكتروني",
    Contraseña: "كلمة المرور",
    "Tu contraseña": "كلمة المرور الخاصة بك",
    "Iniciar sesión →": "تسجيل الدخول ←",
    "¿Has olvidado tu contraseña?": "هل نسيت كلمة المرور؟",
    "TU HISTORIA EMPIEZA AQUÍ": "قصتك تبدأ من هنا",
    "Crea tu cuenta": "أنشئ حسابك",
    "Unos datos básicos para empezar.": "بعض المعلومات الأساسية للبدء.",
    "Nombre visible": "الاسم الظاهر",
    "¿Cómo te llamamos?": "بماذا نناديك؟",
    "Mínimo 8 caracteres": "8 أحرف على الأقل",
    País: "البلد",
    "Selecciona tu país": "اختر بلدك",
    "Confirmo que tengo 18 años o más.": "أؤكد أن عمري 18 سنة أو أكثر.",
    "Acepto los términos, el código de conducta y la política de privacidad.":
      "أوافق على الشروط وقواعد السلوك وسياسة الخصوصية.",
    "Crear mi cuenta →": "إنشاء حسابي ←",
    "MENÚ PRINCIPAL": "القائمة الرئيسية",
    Descubrir: "اكتشف",
    "Me gustas": "الإعجابات",
    Conexiones: "التواصل المتبادل",
    Mensajes: "الرسائل",
    "TU ESPACIO": "مساحتك",
    "Mi perfil": "ملفي الشخصي",
    Ajustes: "الإعدادات",
    Administración: "الإدارة",
    "Cerrar sesión": "تسجيل الخروج",
    "Conecta con respeto y autenticidad.": "تواصل باحترام وصدق.",
    "TU PRÓXIMA CONEXIÓN": "تواصلك القادم",
    "Descubre personas": "اكتشف أشخاصاً",
    "Personas interesantes, historias diferentes. Empieza por un hola.":
      "أشخاص مميزون وقصص مختلفة. ابدأ بكلمة مرحباً.",
    "🌍 Comunidad internacional": "🌍 مجتمع دولي",
    "⌕ Buscar por nombre o interés...": "⌕ ابحث بالاسم أو الاهتمام...",
    "Todos los países": "كل البلدان",
    "Todos los objetivos": "كل الأهداف",
    Amistad: "صداقة",
    "Relación seria": "علاقة جدية",
    Ambos: "كلاهما",
    Limpiar: "مسح",
    "Personas para ti": "أشخاص مقترحون لك",
    "Cargando perfiles reales…": "جارٍ تحميل الملفات الشخصية...",
    "INTERÉS COMPARTIDO": "اهتمام متبادل",
    "Perfiles que te interesan.": "الأشخاص الذين تهتم بهم.",
    "DOS PERSONAS, UNA CONEXIÓN": "شخصان، تواصل واحد",
    "Tus conexiones": "اتصالاتك",
    "El interés mutuo abre la puerta a conversar.":
      "الاهتمام المتبادل يتيح لكما بدء المحادثة.",
    "CONVERSACIONES PRIVADAS": "محادثات خاصة",
    "Solo puedes escribir a tus conexiones mutuas.":
      "يمكنك مراسلة الأشخاص الذين يبادلونك الاهتمام فقط.",
    "Elige una conversación": "اختر محادثة",
    "TU IDENTIDAD": "هويتك",
    "Cuenta quién eres y qué conexión buscas.":
      "عرّف الآخرين بنفسك وبنوع التواصل الذي تبحث عنه.",
    "Guardar cambios": "حفظ التغييرات",
    "Cambiar foto": "تغيير الصورة",
    "JPG, PNG o WebP · máximo 5 MB":
      "JPG أو PNG أو WebP · الحد الأقصى 5 ميغابايت",
    Ciudad: "المدينة",
    Idiomas: "اللغات",
    "Qué buscas": "ما الذي تبحث عنه؟",
    "Sobre mí": "نبذة عني",
    Intereses: "الاهتمامات",
    "Tecnología, viajes, música...": "التكنولوجيا، السفر، الموسيقى...",
    "CONTROL Y PRIVACIDAD": "التحكم والخصوصية",
    "Privacidad y seguridad": "الخصوصية والأمان",
    "Visibilidad del perfil": "ظهور الملف الشخصي",
    "Permite que otras personas te encuentren.": "السماح للآخرين بالعثور عليك.",
    "Eliminar cuenta": "حذف الحساب",
    "Solicita la eliminación de tu cuenta y datos.": "اطلب حذف حسابك وبياناتك.",
    "Solicitar eliminación": "طلب الحذف",
    "Normas de comunidad": "قواعد المجتمع",
    "No se permite acoso, amenazas, odio, suplantación, spam ni fraude. Puedes bloquear y denunciar perfiles. No compartas dinero ni datos sensibles con desconocidos.":
      "يُمنع التحرش والتهديد والكراهية وانتحال الشخصية والرسائل المزعجة والاحتيال. يمكنك حظر الملفات الشخصية والإبلاغ عنها. لا تشارك المال أو البيانات الحساسة مع الغرباء.",
    "CONTROL DE LA COMUNIDAD": "إدارة المجتمع",
    "Panel reservado al administrador.": "لوحة مخصصة للمسؤول.",
    Usuarios: "المستخدمون",
    Denuncias: "البلاغات",
    "Denuncias recibidas": "البلاغات الواردة",
    "No hay denuncias recibidas.": "لا توجد بلاغات.",
    Información: "معلومات",
    "Denunciar perfil": "الإبلاغ عن ملف شخصي",
    Motivo: "السبب",
    Selecciona: "اختر",
    "Acoso o mensajes ofensivos": "تحرش أو رسائل مسيئة",
    "Perfil falso o suplantación": "ملف مزيف أو انتحال شخصية",
    "Estafa o solicitud de dinero": "احتيال أو طلب أموال",
    "Contenido inapropiado": "محتوى غير لائق",
    Spam: "رسائل مزعجة",
    Otro: "أخرى",
    Detalles: "التفاصيل",
    "Enviar denuncia": "إرسال البلاغ",
    "Solo para mayores de 18 años": "لمن هم بعمر 18 عاماً فما فوق",
    "Este usuario todavía no ha añadido una descripción.":
      "لم يضف هذا المستخدم وصفاً بعد.",
    "Enviar mensaje": "إرسال رسالة",
    "Interés enviado": "تم إرسال الإعجاب",
    "Me gusta": "أعجبني",
    Desconectado: "غير متصل",
    "En línea": "متصل الآن",
    "Escribe un mensaje…": "اكتب رسالة...",
    Enviar: "إرسال",
    "Conversación privada": "محادثة خاصة",
    Denunciar: "إبلاغ",
    Bloquear: "حظر",
    "Solo puedes conversar después de un interés mutuo.":
      "يمكنك المحادثة بعد تبادل الإعجاب فقط.",
    "Tus conversaciones aparecerán aquí.": "ستظهر محادثاتك هنا.",
    "Todavía no has enviado ningún me gusta.": "لم ترسل أي إعجاب بعد.",
    "Aún no tienes conexiones mutuas. Cuando dos personas se gusten, aparecerán aquí.":
      "ليس لديك تواصل متبادل بعد. سيظهر هنا عندما يعجب كل منكما بالآخر.",
    "Todavía no hay otros perfiles. Comparte el enlace de WorldConnect para invitar a tus amigos.":
      "لا توجد ملفات شخصية أخرى بعد. شارك رابط WorldConnect لدعوة أصدقائك.",
    "perfiles reales": "ملفات شخصية حقيقية",
    "Perfil actualizado y guardado.": "تم تحديث الملف الشخصي وحفظه.",
    "Foto actualizada.": "تم تحديث الصورة.",
    "Preferencia de visibilidad guardada.": "تم حفظ إعدادات الظهور.",
    "Has cerrado sesión.": "تم تسجيل الخروج.",
    "Cuenta creada. Ya puedes completar tu perfil.":
      "تم إنشاء الحساب. يمكنك الآن إكمال ملفك الشخصي.",
    "Correo de recuperación enviado.": "تم إرسال رسالة استعادة كلمة المرور.",
    "Escribe tu correo primero.": "أدخل بريدك الإلكتروني أولاً.",
    "Confirma que eres mayor de edad y acepta las condiciones.":
      "أكد أنك بالغ ووافق على الشروط.",
    "Acceso restringido": "الدخول مقيد",
  },
};
const originalTextNodes = new WeakMap();
// Declare the observer before translatePage is called to avoid a temporal-dead-zone error.
let translationObserver = null;
function translatePage(lang) {
  const dict = translations[lang] || {};

  // وقف المراقب مؤقتاً لمنع الحلقة المتكررة
  if (translationObserver) {
    translationObserver.disconnect();
  }

  try {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );

    let node;

    while ((node = walker.nextNode())) {
      if (!originalTextNodes.has(node)) {
        originalTextNodes.set(node, node.nodeValue);
      }

      const original = originalTextNodes.get(node);
      const trimmed = original.trim();

      if (!trimmed) continue;

      const translated = dict[trimmed];

      if (translated) {
        node.nodeValue = original.replace(trimmed, translated);
      } else if (lang === "es") {
        node.nodeValue = original;
      }
    }

    document
      .querySelectorAll("input[placeholder], textarea[placeholder]")
      .forEach((el) => {
        if (!el.dataset.originalPlaceholder) {
          el.dataset.originalPlaceholder = el.placeholder;
        }

        el.placeholder =
          dict[el.dataset.originalPlaceholder] ||
          el.dataset.originalPlaceholder;
      });

    document.querySelectorAll("option").forEach((el) => {
      if (!el.dataset.originalLabel) {
        el.dataset.originalLabel = el.textContent;
      }

      const original = el.dataset.originalLabel;
      const translated = dict[original] || original;

      // ما نبدلوش النص إلا كان مختلف
      if (el.textContent !== translated) {
        el.textContent = translated;
      }
    });

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

    $("#language").value = lang;
    $("#app-language").value = lang.toUpperCase();

    try {
      localStorage.setItem("worldconnect-language", lang);
    } catch (error) {
      console.warn("LocalStorage:", error);
    }
  } finally {
    // رجّع المراقب بعد انتهاء الترجمة
    if (translationObserver) {
      translationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }
}
function setLanguage(lang) {
  translatePage(lang);
}
const savedLanguage = (() => {
  try {
    return localStorage.getItem("worldconnect-language") || "es";
  } catch {
    return "es";
  }
})();
$("#language").value = savedLanguage;
$("#app-language").value = savedLanguage.toUpperCase();
$("#language").addEventListener("change", (e) => setLanguage(e.target.value));
$("#app-language").addEventListener("change", (e) =>
  setLanguage(e.target.value.toLowerCase()),
);
translatePage(savedLanguage);
// Traducir también tarjetas, listas y mensajes que se renderizan después.
translationObserver = new MutationObserver(() => {
  if (document.documentElement.lang !== "es")
    translatePage(document.documentElement.lang);
});
translationObserver.observe(document.body, { childList: true, subtree: true });
if (!configured()) {
  authView();
  toast(
    "Configura Firebase en js/firebase-config.js para usar la versión real.",
  );
} else {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      stopListeners();
      state.user = null;
      authView("login");
      return;
    }
    try {
      state.user = await getProfile(firebaseUser);
      appView();
      await loadUserData();
      startPresence();
      route(location.hash.slice(1) || "discover");
    } catch (e) {
      console.error(e);
      toast("No se pudo cargar tu perfil: " + e.message);
      authView("login");
    }
  });
}
if ("serviceWorker" in navigator)
  addEventListener("load", () =>
    navigator.serviceWorker.register("./service-worker.js").catch(console.warn),
  );
