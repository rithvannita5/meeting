const socket = io();
let myPeer;
let myId = '';
let myUsername = '';
let currentUserRole = '';
let currentRoomId = '';
let localStream = null;
let cameraStream = null;
let screenStream = null;

const peerCalls = {};
const userNamesMap = {};
const screenCalls = {};

let isCameraOn = false;
let isScreenSharing = false;
let dummyAnimFrame = null;
let allRoomsList = [];
let pendingLoginData = null;

const localVideo = document.getElementById('localVideo');
const screenGrid = document.getElementById('screenGrid');
const videoGrid = document.getElementById('videoGrid');

let isRemoteControlActive = false;
let remoteControlTarget = null;
let remoteControlRequestId = null;
let isBeingControlled = false;
let remotePointer = null;

let unreadChats = {};
let isChatOpen = false;
let autoReplyEnabled = true;

let isScreenShareFallback = false;
let screenCaptureInterval = null;
let screenFallbackCanvas = null;
let screenFallbackImageCapture = null;
let screenFallbackVideo = null;
let screenFallbackLastSent = 0;
let screenFallbackAuto = false;
let screenFallbackStartedByUser = false;
const screenCallTimers = {};

socket.on('rooms-update', () => {
  if ((currentUserRole === 'admin' || currentUserRole === 'supervisor') && 
      !document.getElementById('admin-dashboard').classList.contains('hidden')) {
    loadAdminRoomMonitor();
  }
});

socket.on('play-sound', (type) => {
  playNotificationSound(type);
});

socket.on('receive-otp', (data) => {
  alert(`🚨 ព្រមាន៖ មានគេកំពុងព្យាយាម Login ចូលគណនីរបស់អ្នកពីឧបករណ៍ផ្សេង!\n\n🔐 នេះជាលេខកូដ 2FA របស់អ្នក៖ 【 ${data.otp} 】`);
});

socket.on('admin-alert', (data) => {
  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    alert(`🚨 សេចក្តីប្រកាសអាសន្នសុវត្ថិភាព!\n\nUser ឈ្មោះ "${data.username}" កំពុង Login លើឧបករណ៍ចំនួន ${data.count} ក្នុងពេលតែមួយ!`);
  }
});

socket.on('remote-control-request', (data) => {
  if (data.targetId === myId) {
    const username = userNamesMap[data.controllerId] || 'មិត្តភក្តិ';
    if (confirm(`${username} ចង់គ្រប់គ្រង Screen របស់អ្នកពីចម្ងាយ។ តើអ្នកអនុញ្ញាតទេ?`)) {
      fetch('/api/remote-control/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: data.requestId, targetId: myId })
      });
      isBeingControlled = true;
      alert('អ្នកបានអនុញ្ញាត Remote Control!');
    } else {
      fetch('/api/remote-control/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: data.requestId })
      });
    }
  }
});

socket.on('remote-control-approved', (data) => {
  if (data.controllerId === myId) {
    alert('✅ Remote Control ត្រូវបានអនុញ្ញាត!');
    isRemoteControlActive = true;
    remoteControlTarget = data.targetId;
    startRemoteControl();
  }
});

socket.on('remote-control-rejected', (data) => {
  if (data.controllerId === myId) {
    alert('❌ Remote Control ត្រូវបានបដិសេធ!');
    isRemoteControlActive = false;
    remoteControlTarget = null;
  }
});

socket.on('remote-control-ended', (data) => {
  if (data.controllerId === myId) {
    isRemoteControlActive = false;
    remoteControlTarget = null;
    stopRemoteControl();
  }
  if (data.targetId === myId) {
    isBeingControlled = false;
    if (remotePointer) { remotePointer.remove(); remotePointer = null; }
  }
});

socket.on('remote-mouse-move', (data) => {
  if (!isBeingControlled) return;
  showRemotePointer(data.x, data.y);
});

socket.on('remote-mouse-click', (data) => {
  if (!isBeingControlled) return;
  const element = document.elementFromPoint(data.x, data.y);
  if (element) { element.click(); showRemoteClick(data.x, data.y); }
});

socket.on('remote-keyboard', (data) => {
  if (!isBeingControlled) return;
  const activeElement = document.activeElement;
  if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
    const event = new KeyboardEvent('keydown', { key: data.key, bubbles: true });
    activeElement.dispatchEvent(event);
  }
});

socket.on('receive-private-message', (data) => {
  const chatMsgs = document.getElementById('chat-messages');
  chatMsgs.innerHTML += `<div class="msg-item"><b>From 👤 ${data.fromUsername}:</b><br>${data.message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  
  if (!unreadChats[data.fromPeerId]) {
    unreadChats[data.fromPeerId] = { count: 0, messages: [], username: data.fromUsername };
  }
  unreadChats[data.fromPeerId].count++;
  unreadChats[data.fromPeerId].messages.push(data.message);
  unreadChats[data.fromPeerId].username = data.fromUsername;
  updateChatBadge();
  if (!isChatOpen) showChatNotification(data.fromUsername, data.message, data.fromPeerId);
  updateChatUserList();
});

socket.on('existing-users', (users) => {
  users.forEach((user, index) => {
    userNamesMap[user.peerId] = user.username;
    addRemoteVideo(user.peerId, user.username);
    setTimeout(() => connectToUser(user.peerId), (index + 1) * 500);
  });
  updateUserCount();
  updateChatUserList();
});

socket.on('user-joined', ({ peerId, username }) => {
  if (peerId !== myId) {
    userNamesMap[peerId] = username;
    addRemoteVideo(peerId, username);
    updateUserCount();
    updateChatUserList();

    if (isScreenSharing && screenStream) {
      setTimeout(() => sendScreenToPeer(peerId), 1000);
    }
  }
});

socket.on('user-left', (peerId) => {
  removeRemoteVideo(peerId);
  removeRemoteScreenVideo(peerId);
  if (peerCalls[peerId]) { peerCalls[peerId].close(); delete peerCalls[peerId]; }
  if (screenCalls[peerId]) { screenCalls[peerId].close(); delete screenCalls[peerId]; }
  delete userNamesMap[peerId];
  updateUserCount();
  updateChatUserList();
});

function playNotificationSound(type) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    if (type === 'join') {
      oscillator.frequency.value = 800; gainNode.gain.value = 0.3;
      oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'leave') {
      oscillator.frequency.value = 600; gainNode.gain.value = 0.3;
      oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.1);
    }
  } catch (e) {}
}

function updateChatBadge() {
  const badge = document.getElementById('chatBadgeCount');
  const totalUnread = Object.values(unreadChats).reduce((sum, u) => sum + u.count, 0);
  if (totalUnread > 0) {
    badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function showChatNotification(username, message, peerId) {
  document.querySelectorAll(`.chat-notification[data-peer="${peerId}"]`).forEach(el => el.remove());
  const notif = document.createElement('div');
  notif.className = 'chat-notification';
  notif.dataset.peer = peerId;
  notif.innerHTML = `
    <button class="close-notif" onclick="event.stopPropagation(); this.parentElement.remove()">✕</button>
    <div class="sender">👤 ${username}</div>
    <div class="msg-preview">${message}</div>
  `;
  notif.onclick = () => {
    if (!isChatOpen) toggleChat();
    document.getElementById('chatRecipientSelect').value = peerId;
    if (unreadChats[peerId]) { unreadChats[peerId].count = 0; updateChatBadge(); }
    notif.remove();
  };
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 10000);
}

function requestRemoteControl(targetId) {
  fetch('/api/remote-control/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ controllerId: myId, targetId, roomId: currentRoomId })
  }).then(res => res.json()).then(data => {
    if (data.success) alert('កំពុងផ្ញើសំណើរ Remote Control...');
  });
}

function startRemoteControl() {
  if (!isRemoteControlActive) return;
  document.addEventListener('mousemove', handleRemoteMouseMove);
  document.addEventListener('click', handleRemoteMouseClick);
  document.addEventListener('keydown', handleRemoteKeyboard);
}

function stopRemoteControl() {
  document.removeEventListener('mousemove', handleRemoteMouseMove);
  document.removeEventListener('click', handleRemoteMouseClick);
  document.removeEventListener('keydown', handleRemoteKeyboard);
}

function handleRemoteMouseMove(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  socket.emit('remote-mouse-move', { targetId: remoteControlTarget, x: event.clientX, y: event.clientY });
}

function handleRemoteMouseClick(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  socket.emit('remote-mouse-click', { targetId: remoteControlTarget, x: event.clientX, y: event.clientY });
}

function handleRemoteKeyboard(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  socket.emit('remote-keyboard', { targetId: remoteControlTarget, key: event.key });
}

function showRemotePointer(x, y) {
  if (!remotePointer) {
    remotePointer = document.createElement('div');
    remotePointer.className = 'remote-pointer';
    document.body.appendChild(remotePointer);
  }
  remotePointer.style.left = x + 'px';
  remotePointer.style.top = y + 'px';
}

function showRemoteClick(x, y) {
  const clickEffect = document.createElement('div');
  clickEffect.className = 'click-effect';
  clickEffect.style.left = x + 'px';
  clickEffect.style.top = y + 'px';
  document.body.appendChild(clickEffect);
  setTimeout(() => clickEffect.remove(), 500);
}

function showRemoteUserSelector() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:99998; display:flex; justify-content:center; align-items:center;';
  const modal = document.createElement('div');
  modal.style.cssText = 'background:#1c2541; border-radius:15px; padding:30px; max-width:400px; width:90%;';
  let usersHtml = '<h3 style="color:#48cae4; margin-bottom:20px;">🖥️ ជ្រើសរើសអ្នកប្រើសម្រាប់ Remote</h3>';
  const users = Object.entries(userNamesMap).filter(([id]) => id !== myId);
  users.forEach(([id, name]) => {
    usersHtml += `<button onclick="selectRemoteTarget('${id}')" style="display:block; width:100%; padding:12px; margin:8px 0; background:#0b132b; border:1px solid #334155; border-radius:8px; color:white; cursor:pointer;">👤 ${name}</button>`;
  });
  usersHtml += `<button onclick="this.closest('div[style*=\\'z-index: 99998\\']').remove()" style="display:block; width:100%; padding:10px; margin-top:15px; background:#ef4444; border:none; border-radius:8px; color:white; cursor:pointer;">បិទ</button>`;
  modal.innerHTML = usersHtml;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function selectRemoteTarget(targetId) {
  document.querySelector('div[style*="z-index: 99998"]')?.remove();
  requestRemoteControl(targetId);
}

function showToast(message, type = 'info') {
  const colors = { success: '#10b981', error: '#ef4444', info: '#48cae4', warning: '#f59e0b' };
  document.querySelectorAll('.toast').forEach(el => el.remove());
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.background = colors[type] || '#48cae4';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function switchAdminTab(tab) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-tabs button').forEach(el => el.classList.remove('active'));
  if (tab === 'rooms') {
    document.getElementById('tab-rooms').classList.remove('hidden');
    document.getElementById('tabBtnRooms').classList.add('active');
    loadAdminRoomMonitor();
  } else if (tab === 'users') {
    document.getElementById('tab-users').classList.remove('hidden');
    document.getElementById('tabBtnUsers').classList.add('active');
    loadUsersTable();
  } else if (tab === 'newRoom') {
    document.getElementById('tab-newRoom').classList.remove('hidden');
    document.getElementById('tabBtnNewRoom').classList.add('active');
  }
}

async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    const data = await res.json();
    allRoomsList = data.rooms;
    const select = document.getElementById('roomSelect');
    const adminSelect = document.getElementById('userAssignedRoomSelect');
    if (select) select.innerHTML = '';
    if (adminSelect) adminSelect.innerHTML = '';
    data.rooms.forEach(r => {
      if (select) select.innerHTML += `<option value="${r}">${r}</option>`;
      if (adminSelect) adminSelect.innerHTML += `<option value="${r}">${r}</option>`;
    });
  } catch (err) {}
}

async function loadAdminRoomMonitor() {
  try {
    const res = await fetch('/api/rooms-status');
    const data = await res.json();
    const container = document.getElementById('activeRoomsList');
    container.innerHTML = '';
    data.rooms.forEach(room => {
      const isLive = room.userCount > 0;
      const statusHtml = isLive 
        ? `<span style="color:#10b981; font-weight:bold;">🟢 កំពុងសកម្ម (${room.userCount} នាក់)</span>`
        : `<span style="color:#64748b;">⚪ ទំនេរ</span>`;
      container.innerHTML += `
        <div class="room-card ${isLive ? 'live' : ''}">
          <h4>បន្ទប់: ${room.roomId}</h4>
          <p style="font-size:13px; margin-bottom:12px;">${statusHtml}</p>
          <button onclick="adminJoinRoom('${room.roomId}')" class="btn-success" style="width:100%; font-size:13px;">ចូលរួមបន្ទប់</button>
        </div>
      `;
    });
  } catch (err) {}
}

async function loadUsersTable() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';
    data.users.forEach(user => {
      const isBlocked = user.isBlocked;
      let adminActions = user.role === 'admin' ? 'គ្មាន' : `<button class="action-btn ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser('${user.id}')">${isBlocked ? 'Unblock' : 'Block'}</button>`;
      tbody.innerHTML += `<tr><td><strong>${user.username}</strong></td><td>${user.role}</td><td>${user.assignedRoom}</td><td>${isBlocked ? 'Blocked' : 'Active'}</td><td>${adminActions}</td></tr>`;
    });
  } catch (err) {}
}

function adminJoinRoom(roomId) {
  currentRoomId = roomId;
  document.getElementById('admin-dashboard').classList.add('hidden');
  startMeeting();
}

async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const roomId = document.getElementById('roomSelect').value;
  if (!username || !password) return showToast('សូមបំពេញ Username & Password!', 'error');
  pendingLoginData = { username, password, roomId };
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingLoginData)
    });
    const data = await res.json();
    if (data.requires2FA) {
      document.getElementById('otp-modal').classList.remove('hidden');
      return;
    }
    if (!data.success) return showToast(data.message, 'error');
    finalizeLogin(data);
  } catch (err) { showToast('Login Error!', 'error'); }
}

async function verify2FA() {
  const otp = document.getElementById('otpInput').value.trim();
  if (!otp) return showToast('សូមបញ្ចូលកូដ!', 'error');
  try {
    const res = await fetch('/api/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...pendingLoginData, otp })
    });
    const data = await res.json();
    if (!data.success) return showToast(data.message, 'error');
    document.getElementById('otp-modal').classList.add('hidden');
    finalizeLogin(data);
  } catch (err) {}
}

function cancel2FA() { document.getElementById('otp-modal').classList.add('hidden'); }

function finalizeLogin(data) {
  myUsername = data.user.username;
  currentUserRole = data.user.role;
  currentRoomId = pendingLoginData.roomId;
  document.getElementById('mainBody').style.justifyContent = 'flex-start';
  document.getElementById('auth').classList.add('hidden');

  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    socket.emit('register-admin');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    loadAdminRoomMonitor();
    loadUsersTable();
  } else {
    startMeeting();
  }
}

function toggleChat() {
  document.getElementById('chat-panel').classList.toggle('hidden');
  isChatOpen = !document.getElementById('chat-panel').classList.contains('hidden');
}

function updateChatUserList() {
  const select = document.getElementById('chatRecipientSelect');
  select.innerHTML = '<option value="">-- ជ្រើសរើសผู้รับ --</option>';
  for (let [peerId, name] of Object.entries(userNamesMap)) {
    if (peerId !== myId) select.innerHTML += `<option value="${peerId}">${name}</option>`;
  }
}

function sendPrivateMsg() {
  const toPeerId = document.getElementById('chatRecipientSelect').value;
  const msgInput = document.getElementById('chatInput');
  const message = msgInput.value.trim();
  if (!toPeerId || !message) return;
  socket.emit('private-message', { toPeerId, message });
  const chatMsgs = document.getElementById('chat-messages');
  chatMsgs.innerHTML += `<div class="msg-item me"><b>To ${userNamesMap[toPeerId]}:</b><br>${message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  msgInput.value = '';
}

function createActiveDummyVideoTrack() {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 240;
  const ctx = canvas.getContext('2d'); let angle = 0;
  function draw() {
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#38bdf8'; ctx.beginPath();
    ctx.arc(160 + Math.cos(angle) * 30, 120 + Math.sin(angle) * 20, 10, 0, Math.PI * 2);
    ctx.fill(); angle += 0.08; dummyAnimFrame = requestAnimationFrame(draw);
  }
  draw();
  return canvas.captureStream(15).getVideoTracks()[0];
}

async function startMeeting() {
  let audioTrack;
  try {
    const userMedia = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioTrack = userMedia.getAudioTracks()[0];
  } catch (e) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dst = audioCtx.createMediaStreamDestination();
    audioTrack = dst.stream.getAudioTracks()[0];
    audioTrack.enabled = false;
  }

  localStream = new MediaStream([audioTrack, createActiveDummyVideoTrack()]);
  localVideo.srcObject = localStream;

  // 🌐 STUN Servers បន្ថែមសម្រាប់ឆ្លង Network ផ្សេងគ្នា
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.stunprotocol.org:3478' }
  ];

  try {
    const turnRes = await fetch('/api/webrtc-config', { cache: 'no-store' });
    if (turnRes.ok) {
      const cfg = await turnRes.json();
      if (Array.isArray(cfg.iceServers)) iceServers.push(...cfg.iceServers);
    }
  } catch (e) {}

  myPeer = new Peer(undefined, {
    host: window.location.hostname,
    port: window.location.protocol === 'https:' ? 443 : 80,
    path: '/peerjs',
    secure: window.location.protocol === 'https:',
    config: { iceServers }
  });

  myPeer.on('open', (id) => {
    myId = id;
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId}`;
    socket.emit('join-room', currentRoomId, id, myUsername);
    showToast('✅ Connected to Peer Server!', 'success');
  });

  myPeer.on('call', (call) => {
    const callType = call.metadata ? call.metadata.type : 'camera';
    const callerName = call.metadata ? call.metadata.username : 'ដៃគូ';

    if (callType === 'screen') {
      call.answer();
      let receivedScreen = false;
      const timer = setTimeout(() => {
        if (!receivedScreen) startAutomaticScreenFallback();
      }, 7000);

      call.on('stream', (remoteScreenStream) => {
        receivedScreen = true;
        clearTimeout(timer);
        addRemoteScreenVideo(call.peer, remoteScreenStream, callerName);
      });
      call.on('close', () => {
        clearTimeout(timer);
        removeRemoteScreenVideo(call.peer);
        delete screenCalls[call.peer];
      });
      screenCalls[call.peer] = call;
      return;
    }

    call.answer(isCameraOn ? cameraStream : localStream);
    peerCalls[call.peer] = call;
    addRemoteVideo(call.peer, callerName);
    call.on('stream', (remoteStream) => {
      const videoEl = document.getElementById(`video-${call.peer}`);
      if (videoEl) videoEl.srcObject = remoteStream;
    });
    call.on('close', () => { delete peerCalls[call.peer]; });
  });

  socket.on('existing-users', (users) => {
    users.forEach((user, index) => {
      userNamesMap[user.peerId] = user.username;
      addRemoteVideo(user.peerId, user.username);
      setTimeout(() => connectToUser(user.peerId), (index + 1) * 500);
    });
    updateUserCount();
    updateChatUserList();
  });

  socket.on('user-joined', ({ peerId, username }) => {
    if (peerId !== myId) {
      userNamesMap[peerId] = username;
      addRemoteVideo(peerId, username);
      updateUserCount();
      updateChatUserList();
      if (isScreenSharing && screenStream) {
        setTimeout(() => sendScreenToPeer(peerId), 1000);
      }
    }
  });

  socket.on('user-left', (peerId) => {
    removeRemoteVideo(peerId);
    removeRemoteScreenVideo(peerId);
    if (peerCalls[peerId]) { peerCalls[peerId].close(); delete peerCalls[peerId]; }
    if (screenCalls[peerId]) { screenCalls[peerId].close(); delete screenCalls[peerId]; }
    delete userNamesMap[peerId];
    updateUserCount();
    updateChatUserList();
  });
}

function sendScreenToPeer(peerId) {
  if (!isScreenSharing || !screenStream || !myPeer || !peerId) return;
  if (screenCalls[peerId]) {
    try { screenCalls[peerId].close(); } catch (e) {}
    delete screenCalls[peerId];
  }
  try {
    const call = myPeer.call(peerId, screenStream, {
      metadata: { type: 'screen', username: myUsername }
    });
    screenCalls[peerId] = call;

    const timer = setTimeout(() => {
      if (screenCalls[peerId] === call && isScreenSharing) {
        startAutomaticScreenFallback();
      }
    }, 7000);
    screenCallTimers[peerId] = timer;

    call.on('stream', () => {
      clearTimeout(timer);
      delete screenCallTimers[peerId];
    });
    call.on('close', () => {
      clearTimeout(timer);
      delete screenCallTimers[peerId];
      delete screenCalls[peerId];
    });
    call.on('error', () => {
      clearTimeout(timer);
      delete screenCallTimers[peerId];
      delete screenCalls[peerId];
      if (isScreenSharing) startAutomaticScreenFallback();
    });
  } catch (err) {
    startAutomaticScreenFallback();
  }
}

function startAutomaticScreenFallback() {
  if (!isScreenSharing || isScreenShareFallback || !screenStream) return;
  startSocketScreenFallbackFromExistingStream();
}

async function startSocketScreenFallbackFromExistingStream() {
  if (!isScreenSharing || !screenStream || isScreenShareFallback) return;
  isScreenShareFallback = true;
  document.getElementById('screenBtnFallback').innerHTML = '🛑 Auto Fallback';
  document.getElementById('screenBtnFallback').className = 'btn-danger';
  document.getElementById('screenBtn').style.display = 'none';

  if (!screenFallbackCanvas) screenFallbackCanvas = document.createElement('canvas');
  const track = screenStream.getVideoTracks()[0];
  try {
    screenFallbackImageCapture = ('ImageCapture' in window) ? new ImageCapture(track) : null;
  } catch (e) { screenFallbackImageCapture = null; }

  screenFallbackVideo = document.createElement('video');
  screenFallbackVideo.muted = true;
  screenFallbackVideo.playsInline = true;
  screenFallbackVideo.autoplay = true;
  screenFallbackVideo.srcObject = screenStream;
  try { await screenFallbackVideo.play(); } catch (e) {}

  clearInterval(screenCaptureInterval);
  screenCaptureInterval = setInterval(async () => {
    if (!isScreenShareFallback || !screenStream) return;
    const now = Date.now();
    if (now - screenFallbackLastSent < 250) return;
    screenFallbackLastSent = now;
    try {
      let bitmap = null;
      if (screenFallbackImageCapture) bitmap = await screenFallbackImageCapture.grabFrame();
      const canvas = screenFallbackCanvas;
      if (bitmap) {
        const scale = Math.min(1, 960 / bitmap.width, 540 / bitmap.height);
        canvas.width = Math.max(320, Math.floor(bitmap.width * scale));
        canvas.height = Math.max(180, Math.floor(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        if (bitmap.close) bitmap.close();
      } else if (screenFallbackVideo && screenFallbackVideo.readyState >= 2) {
        const w = screenFallbackVideo.videoWidth || 1280;
        const h = screenFallbackVideo.videoHeight || 720;
        const scale = Math.min(1, 960 / w, 540 / h);
        canvas.width = Math.max(320, Math.floor(w * scale));
        canvas.height = Math.max(180, Math.floor(h * scale));
        canvas.getContext('2d').drawImage(screenFallbackVideo, 0, 0, canvas.width, canvas.height);
      } else return;

      socket.emit('screen-data-fallback', {
        roomId: currentRoomId,
        fromPeerId: myId,
        screenData: canvas.toDataURL('image/jpeg', 0.55)
      });
    } catch (err) {}
  }, 250);
}

function connectToUser(peerId) {
  if (peerCalls[peerId]) return;
  const streamToSend = (isCameraOn && cameraStream) ? cameraStream : localStream;
  try {
    const call = myPeer.call(peerId, streamToSend, { metadata: { type: 'camera', username: myUsername } });
    peerCalls[peerId] = call;
    call.on('stream', (remoteStream) => {
      const videoEl = document.getElementById(`video-${peerId}`);
      if (videoEl) videoEl.srcObject = remoteStream;
    });
    call.on('close', () => { delete peerCalls[peerId]; });

    if (isScreenSharing && screenStream) {
      setTimeout(() => sendScreenToPeer(peerId), 500);
    }
  } catch (err) {}
}

function addRemoteVideo(peerId, username) {
  if (document.getElementById(`video-container-${peerId}`)) return;
  const container = document.createElement('div');
  container.className = 'video-box';
  container.id = `video-container-${peerId}`;
  let remoteButtonHtml = (currentUserRole === 'admin' || currentUserRole === 'supervisor') ? `<button class="remote-btn" onclick="requestRemoteControl('${peerId}')">🖥️ Remote</button>` : '';
  container.innerHTML = `
    <div class="name-tag">👤 ${username}</div>
    <video id="video-${peerId}" autoplay playsinline title="ចុចเพื่อមើលពេញអេក្រង់"></video>
    ${remoteButtonHtml}
  `;
  videoGrid.appendChild(container);
  const video = document.getElementById(`video-${peerId}`);
  if (video) video.onclick = () => makeFullscreen(video);
}

function removeRemoteVideo(peerId) {
  const container = document.getElementById(`video-container-${peerId}`);
  if (container) container.remove();
}

function addRemoteScreenVideo(peerId, stream, sharerName) {
  screenGrid.style.display = 'grid';
  document.getElementById('screenTitle').style.display = 'block';
  let screenContainer = document.getElementById(`screen-container-${peerId}`);
  if (!screenContainer) {
    screenContainer = document.createElement('div');
    screenContainer.className = 'video-box screen-box';
    screenContainer.id = `screen-container-${peerId}`;
    screenContainer.innerHTML = `
      <div class="name-tag" style="background:#f59e0b; color:#000;">🖥️ អេក្រង់របស់: ${sharerName}</div>
      <video id="screen-video-${peerId}" autoplay playsinline title="ចុចเพื่อមើលពេញអេក្រង់"></video>
    `;
    screenGrid.appendChild(screenContainer);
  }
  const screenVideo = document.getElementById(`screen-video-${peerId}`);
  if (screenVideo) {
    screenVideo.srcObject = stream;
    screenVideo.play().catch(() => {});
  }
}

function removeRemoteScreenVideo(peerId) {
  const screenContainer = document.getElementById(`screen-container-${peerId}`);
  if (screenContainer) screenContainer.remove();
  if (screenGrid.children.length === 0) {
    screenGrid.style.display = 'none';
    document.getElementById('screenTitle').style.display = 'none';
  }
}

function updateUserCount() {
  const count = document.querySelectorAll('#videoGrid .video-box').length;
  document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId} | អ្នកប្រើ: ${count}`;
}

async function toggleScreenShare() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    return showToast('⚠️ មុខងារ Share Screen ប្រើបានតែលើកុំព្យូទ័រ!', 'warning');
  }
  if (isScreenSharing) {
    stopScreenShare();
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: true
    });
    isScreenSharing = true;
    document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
    document.getElementById('screenBtn').className = 'btn-danger';
    addRemoteScreenVideo('my-local-screen', screenStream, myUsername + ' (អ្នក)');

    for (const peerId of Object.keys(userNamesMap)) {
      if (peerId !== myId) sendScreenToPeer(peerId);
    }
    screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
    showToast('✅ កំពុងចែករំលែក Screen!', 'success');
  } catch (err) {
    showToast('❌ មិនអាច Share Screen ได้ទេ', 'error');
  }
}

function stopScreenShare() {
  if (!isScreenSharing) return;
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').className = 'btn-warning';
  removeRemoteScreenVideo('my-local-screen');

  for (const [peerId, call] of Object.entries(screenCalls)) {
    try { call.close(); } catch (e) {}
    if (screenCallTimers[peerId]) clearTimeout(screenCallTimers[peerId]);
    delete screenCallTimers[peerId];
    delete screenCalls[peerId];
  }
  if (isScreenShareFallback) stopScreenShareFallback();
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
}

function stopScreenShareFallback() {
  if (!isScreenShareFallback) return;
  isScreenShareFallback = false;
  clearInterval(screenCaptureInterval);
  screenCaptureInterval = null;
  socket.emit('stop-screen-fallback', { roomId: currentRoomId, fromPeerId: myId });
}

socket.on('screen-data-fallback', (data) => {
  if (!data || data.fromPeerId === myId || !data.screenData) return;
  let screenContainer = document.getElementById(`screen-container-${data.fromPeerId}`);
  if (!screenContainer) {
    const sharerName = userNamesMap[data.fromPeerId] || 'មិត្តភក្តិ';
    screenGrid.style.display = 'grid';
    document.getElementById('screenTitle').style.display = 'block';
    screenContainer = document.createElement('div');
    screenContainer.className = 'video-box screen-box';
    screenContainer.id = `screen-container-${data.fromPeerId}`;
    screenContainer.innerHTML = `
      <div class="name-tag" style="background:#f59e0b; color:#000;">🖥️ អេក្រង់: ${sharerName} (Fallback)</div>
      <img id="screen-image-${data.fromPeerId}" alt="Screen" style="width:100%;height:100%;object-fit:contain;display:block;background:#000;">
    `;
    screenGrid.appendChild(screenContainer);
  }
  const img = document.getElementById(`screen-image-${data.fromPeerId}`);
  if (img) img.src = data.screenData;
});

socket.on('stop-screen-fallback', (data) => {
  if (!data || data.fromPeerId === myId) return;
  removeRemoteScreenVideo(data.fromPeerId);
});

function makeFullscreen(elem) {
  if (elem.requestFullscreen) elem.requestFullscreen();
}

async function toggleCamera() {
  const camIcon = document.getElementById('camBtnIcon');
  if (isCameraOn) {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    isCameraOn = false; camIcon.innerHTML = '🚫'; camIcon.classList.add('off');
    localVideo.srcObject = localStream;
  } else {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
      isCameraOn = true; camIcon.innerHTML = '🎥'; camIcon.classList.remove('off');
      localVideo.srcObject = cameraStream;
    } catch (e) {}
  }
}

function toggleMic() {
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;
  const micIcon = document.getElementById('micBtnIcon');
  audioTrack.enabled = !audioTrack.enabled;
  micIcon.innerHTML = audioTrack.enabled ? '🎤' : '🔇';
  micIcon.className = audioTrack.enabled ? 'float-btn' : 'float-btn off';
}

function leaveRoom() {
  if (isScreenSharing) stopScreenShare();
  if (myPeer) myPeer.destroy();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  socket.disconnect();
  location.reload();
}

window.onload = loadRooms;
