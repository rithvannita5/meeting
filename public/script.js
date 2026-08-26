const socket = io();

let myPeerId = 'user_' + Math.random().toString(36).substr(2, 9);
let myScreenPeerId = myPeerId + '_screen';

let myPeer;
let myScreenPeer;
let myUsername = localStorage.getItem('meeting_username') || '';
let currentUserRole = localStorage.getItem('meeting_role') || '';
let currentRoomId = localStorage.getItem('meeting_room') || '';
let localStream = null;
let cameraStream = null;
let screenStream = null;

const peerCalls = {};
const screenCalls = {};
const userNamesMap = {};

let isCameraOn = false;
let isScreenSharing = false;
let dummyAnimFrame = null;
let allRoomsList = [];
let pendingLoginData = null; 

const localVideo = document.getElementById('localVideo');
const screenGrid = document.getElementById('screenGrid');
const videoGrid = document.getElementById('videoGrid');

function makeFullscreen(elem) {
  if (elem.requestFullscreen) elem.requestFullscreen();
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
}
localVideo.onclick = () => makeFullscreen(localVideo);

// Check if already logged in before refresh
window.addEventListener('DOMContentLoaded', () => {
  loadRooms();
  if (myUsername && currentRoomId) {
    document.getElementById('mainBody').style.justifyContent = 'flex-start';
    document.getElementById('auth').classList.add('hidden');
    if (currentUserRole === 'admin') {
      socket.emit('register-admin');
      document.getElementById('admin-dashboard').classList.remove('hidden');
      loadAdminRoomMonitor();
      loadUsersTable();
    } else {
      startMeeting();
    }
  }
});

// Admin Socket Listener for Real-time update
socket.on('rooms-update', () => {
  if (currentUserRole === 'admin') {
    loadAdminRoomMonitor();
  }
});

// ================= ADMIN FUNCTIONS =================
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
  } catch (err) { console.error('Error fetching rooms:', err); }
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
        ? `<span style="color:#10b981; font-weight:bold;">🟢 កំពុងសកម្ម (${room.userCount} នាក់)</span><br><small style="color:#94a3b8;">👤 ${room.users.join(', ')}</small>`
        : `<span style="color:#64748b;">⚪ ទំនេរ (គ្មានមនុស្ស)</span>`;

      container.innerHTML += `
        <div class="room-card ${isLive ? 'live' : ''}">
          <h4 style="margin-bottom:6px;">បន្ទប់: ${room.roomId}</h4>
          <p style="font-size:13px; margin-bottom:12px;">${statusHtml}</p>
          <button onclick="adminJoinRoom('${room.roomId}')" class="btn-success" style="width:100%; font-size:13px;">
            🚪 ចូលរួមបន្ទប់នេះ
          </button>
        </div>
      `;
    });
  } catch (err) { console.error('Error loading rooms:', err); }
}

async function loadUsersTable() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    data.users.forEach(user => {
      const isBlocked = user.isBlocked;
      const statusText = isBlocked ? '<span style="color:#ef4444; font-weight:bold;">Blocked</span>' : '<span style="color:#10b981; font-weight:bold;">Active</span>';
      
      const adminActions = user.role === 'admin' ? '<span style="color:#64748b;">No actions</span>' : `
        <button class="action-btn" style="background:#dc2626; color:white;" onclick="kickUser('${user.username}')">Kick ចេញ</button>
        <button class="action-btn ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser('${user.id}')">${isBlocked ? 'Unblock' : 'Block'}</button>
        <button class="action-btn btn-secondary" onclick="editUserRoom('${user.id}', '${user.assignedRoom}')">ប្តូរបន្ទប់</button>
        <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword('${user.id}', '${user.username}')">Reset Pwd</button>
        <button class="action-btn btn-danger" onclick="deleteUser('${user.id}', '${user.username}')">លុប</button>
      `;

      tbody.innerHTML += `<tr><td><strong>${user.username}</strong></td><td>${user.role}</td><td>${user.assignedRoom}</td><td>${statusText}</td><td>${adminActions}</td></tr>`;
    });
  } catch (err) { console.error('Error loading user table:', err); }
}

function kickUser(username) {
  if (!confirm(`តើអ្នកប្រាកដថាចង់ទាត់ (Kick) User "${username}" ចេញពីប្រព័ន្ធទេ?`)) return;
  socket.emit('kick-user', username);
  alert(`✅ បានបញ្ជា Kick គណនី ${username} រួចរាល់!`);
}

async function toggleBlockUser(id) { try { await fetch(`/api/users/${id}/toggle-block`, { method: 'PUT' }); await loadUsersTable(); } catch (err) {} }
async function deleteUser(id, username) { if (!confirm(`តើអ្នកប្រាកដថាចង់លុប User "${username}" ទេ?`)) return; try { await fetch(`/api/users/${id}`, { method: 'DELETE' }); await loadUsersTable(); } catch (err) {} }
async function resetPassword(id, username) { const newPassword = prompt(`បញ្ចូលលេខសម្ងាត់ថ្មីសម្រាប់ ${username}:`); if (!newPassword) return; try { await fetch(`/api/users/${id}/reset-password`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword }) }); alert('ជោគជ័យ!'); } catch (err) {} }
async function editUserRoom(id, currentRoom) { const newRoom = prompt(`បញ្ចូលបន្ទប់ថ្មី (បន្ទប់បច្ចុប្បន្ន: ${currentRoom}):\nជម្រើស: ${allRoomsList.join(', ')}`); if (!newRoom) return; try { await fetch(`/api/users/${id}/edit-room`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newRoom }) }); await loadUsersTable(); } catch (err) {} }
async function createNewUser() { const username = document.getElementById('newUsername').value.trim(); const password = document.getElementById('newPassword').value.trim(); const assignedRoom = document.getElementById('userAssignedRoomSelect').value; if (!username || !password) return alert('សូមបំពេញព័ត៌មាន!'); try { const res = await fetch('/api/create-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, assignedRoom }) }); const data = await res.json(); alert(data.message); if (data.success) { document.getElementById('newUsername').value = ''; document.getElementById('newPassword').value = ''; await loadUsersTable(); } } catch (err) {} }
async function createNewRoom() { const roomId = document.getElementById('newRoomId').value.trim(); if (!roomId) return alert('សូមបញ្ចូលឈ្មោះបន្ទប់!'); try { const res = await fetch('/api/create-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId }) }); const data = await res.json(); alert(data.message); if (data.success) { document.getElementById('newRoomId').value = ''; await loadRooms(); if (currentUserRole === 'admin') loadAdminRoomMonitor(); } } catch (err) {} }

function adminJoinRoom(roomId) { 
  currentRoomId = roomId; 
  localStorage.setItem('meeting_room', roomId);
  document.getElementById('admin-dashboard').classList.add('hidden'); 
  startMeeting(); 
}

function logout() { 
  localStorage.removeItem('meeting_username');
  localStorage.removeItem('meeting_role');
  localStorage.removeItem('meeting_room');
  location.reload(); 
}
function logoutAdmin() { logout(); }

// ================= AUTH FUNCTIONS =================
async function changeMyPassword() {
  const oldPwd = prompt('🔑 សូមបញ្ចូលលេខសម្ងាត់ចាស់របស់អ្នក:'); if (!oldPwd) return;
  const newPwd = prompt('🔒 សូមបញ្ចូលលេខសម្ងាត់ថ្មី:'); if (!newPwd) return;
  try { const res = await fetch('/api/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: myUsername, oldPassword: oldPwd, newPassword: newPwd }) }); const data = await res.json(); alert(data.message); } catch (err) { alert('មានបញ្ហា!'); }
}

socket.on('kicked-out', (reason) => {
  alert(`🚨 ${reason || 'គណនីរបស់អ្នកត្រូវបាន Admin បណ្តេញចេញ!'}`);
  leaveRoom();
});

socket.on('receive-otp', (data) => {
  alert(`🚨 ព្រមាន៖ មានគេកំពុង Login ឧបករណ៍ផ្សេង!\n\n🔐 លេខកូដ 2FA: 【 ${data.otp} 】`);
});

async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const roomId = document.getElementById('roomSelect').value;

  if (!username || !password) return alert('សូមបំពេញ Username និង Password!');
  pendingLoginData = { username, password, roomId };

  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingLoginData) });
    const data = await res.json();

    if (data.requires2FA) {
      alert(data.message); document.getElementById('otp-modal').classList.remove('hidden'); return;
    }
    if (!data.success) return alert(data.message);
    finalizeLogin(data);
  } catch (err) { alert('មានបញ្ហាក្នុងការ Login!'); }
}

async function verify2FA() {
  const otp = document.getElementById('otpInput').value.trim();
  if (!otp) return alert('សូមវាយបញ្ចូលលេខកូដ!');
  try {
    const res = await fetch('/api/verify-2fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pendingLoginData, otp }) });
    const data = await res.json();
    if (!data.success) return alert(data.message);
    document.getElementById('otp-modal').classList.add('hidden');
    finalizeLogin(data);
  } catch (err) { alert('លេខកូដមិនត្រឹមត្រូវ!'); }
}

function cancel2FA() { document.getElementById('otp-modal').classList.add('hidden'); pendingLoginData = null; }

function finalizeLogin(data) {
  myUsername = data.user.username;
  currentUserRole = data.user.role;
  currentRoomId = pendingLoginData.roomId;

  localStorage.setItem('meeting_username', myUsername);
  localStorage.setItem('meeting_role', currentUserRole);
  localStorage.setItem('meeting_room', currentRoomId);

  document.getElementById('mainBody').style.justifyContent = 'flex-start';
  document.getElementById('auth').classList.add('hidden');

  if (currentUserRole === 'admin') {
    socket.emit('register-admin'); 
    document.getElementById('admin-dashboard').classList.remove('hidden');
    loadAdminRoomMonitor();
    loadUsersTable();
  } else {
    startMeeting();
  }
}

// ================= PRIVATE CHAT =================
function toggleChat() { document.getElementById('chat-panel').classList.toggle('hidden'); }
function updateChatUserList() {
  const select = document.getElementById('chatRecipientSelect');
  select.innerHTML = '<option value="">-- ជ្រើសរើសអ្នកទទួល --</option>';
  for (let [peerId, name] of Object.entries(userNamesMap)) { select.innerHTML += `<option value="${peerId}">${name}</option>`; }
}
function sendPrivateMsg() {
  const toPeerId = document.getElementById('chatRecipientSelect').value; 
  const msgInput = document.getElementById('chatInput'); 
  const message = msgInput.value.trim();
  if (!toPeerId || !message) return alert('សូមរើសអ្នកទទួល និងវាយសារ!');
  socket.emit('private-message', { toPeerId, message });
  const chatMsgs = document.getElementById('chat-messages');
  chatMsgs.innerHTML += `<div class="msg-item me"><b>To ${userNamesMap[toPeerId]}:</b><br>${message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight; 
  msgInput.value = '';
}
socket.on('receive-private-message', (data) => {
  document.getElementById('chat-panel').classList.remove('hidden'); 
  const chatMsgs = document.getElementById('chat-messages');
  chatMsgs.innerHTML += `<div class="msg-item"><b>From 👤 ${data.fromUsername}:</b><br>${data.message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
});

// ================= WEBRTC & PEERJS =================
function createActiveDummyVideoTrack() {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
  const ctx = canvas.getContext('2d'); let angle = 0;
  function draw() {
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(160 + Math.cos(angle) * 30, 120 + Math.sin(angle) * 20, 10, 0, Math.PI * 2); ctx.fill();
    angle += 0.08; dummyAnimFrame = requestAnimationFrame(draw);
  }
  draw(); return canvas.captureStream(15).getVideoTracks()[0];
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
    document.getElementById('micBtnIcon').innerHTML = '🔇'; 
    document.getElementById('micBtnIcon').classList.add('off');
  }

  localStream = new MediaStream([audioTrack, createActiveDummyVideoTrack()]);
  localVideo.srcObject = localStream;

  const peerConfig = { host: location.hostname, port: location.port || (location.protocol === 'https:' ? 443 : 80), path: '/peerjs', secure: location.protocol === 'https:', config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } };

  myPeer = new Peer(myPeerId, peerConfig);
  myScreenPeer = new Peer(myScreenPeerId, peerConfig);

  myPeer.on('call', (call) => {
    call.answer(isCameraOn ? cameraStream : localStream); 
    peerCalls[call.peer] = call; 
    const callerName = call.metadata ? call.metadata.username : 'ដៃគូ';
    addRemoteVideo(call.peer, callerName);
    
    call.on('stream', (remoteStream) => { 
      const videoEl = document.getElementById(`video-${call.peer}`); 
      if (videoEl) { videoEl.srcObject = remoteStream; updateConnectionStatus(call.peer, '🟢 Online'); } 
    });
    call.on('close', () => { delete peerCalls[call.peer]; updateConnectionStatus(call.peer, '🔴 Offline'); });
  });

  myScreenPeer.on('call', (call) => {
    call.answer();
    screenCalls[call.peer] = call;
    const sharerName = call.metadata ? call.metadata.username : 'ដៃគូ';
    call.on('stream', (remoteScreenStream) => {
      addRemoteScreenVideo(call.peer, remoteScreenStream, sharerName);
    });
    call.on('close', () => removeRemoteScreenVideo(call.peer));
  });

  myPeer.on('open', (id) => {
    document.getElementById('room-container').classList.remove('hidden'); 
    document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId}`;
    socket.emit('join-room', currentRoomId, myPeerId, myUsername);
  });

  socket.on('existing-users', (users) => {
    users.forEach((user, index) => { 
      userNamesMap[user.peerId] = user.username; 
      addRemoteVideo(user.peerId, user.username); 
      setTimeout(() => connectToUser(user.peerId), (index + 1) * 300); 
    });
    updateUserCount(); 
    updateChatUserList();
  });

  socket.on('user-joined', ({ peerId, username }) => {
    if (peerId !== myPeerId) {
      userNamesMap[peerId] = username; 
      addRemoteVideo(peerId, username); 
      updateUserCount(); 
      updateChatUserList();

      // ហៅទៅ User ថ្មីភ្លាមៗដោយស្វ័យប្រវត្តិ
      setTimeout(() => connectToUser(peerId), 500);

      if (isScreenSharing && screenStream) {
        setTimeout(() => {
          const targetScreenId = peerId + '_screen';
          const call = myScreenPeer.call(targetScreenId, screenStream, { metadata: { username: myUsername } });
          screenCalls[peerId] = call;
        }, 1000);
      }
    }
  });

  socket.on('user-left', (peerId) => {
    removeRemoteVideo(peerId); 
    removeRemoteScreenVideo(peerId + '_screen');
    if (peerCalls[peerId]) { peerCalls[peerId].close(); delete peerCalls[peerId]; }
    if (screenCalls[peerId]) { screenCalls[peerId].close(); delete screenCalls[peerId]; }
    delete userNamesMap[peerId]; 
    updateUserCount(); 
    updateChatUserList();
  });
}

function connectToUser(peerId) {
  if (peerCalls[peerId]) return;
  const streamToSend = (isCameraOn && cameraStream) ? cameraStream : localStream;
  try {
    const call = myPeer.call(peerId, streamToSend, { metadata: { username: myUsername } }); 
    peerCalls[peerId] = call; 
    updateConnectionStatus(peerId, '⏳ Connecting...');
    
    call.on('stream', (remoteStream) => { 
      const videoEl = document.getElementById(`video-${peerId}`); 
      if (videoEl) { videoEl.srcObject = remoteStream; updateConnectionStatus(peerId, '🟢 Online'); } 
    });
    call.on('close', () => { delete peerCalls[peerId]; updateConnectionStatus(peerId, '🔴 Offline'); });
    call.on('error', () => { delete peerCalls[peerId]; updateConnectionStatus(peerId, '🔴 Offline'); });
  } catch (err) { console.error('Error calling peer:', err); }
}

function updateConnectionStatus(peerId, status) {
  const statusElement = document.getElementById(`status-${peerId}`);
  if (statusElement) { statusElement.textContent = status; if (status.includes('🟢')) statusElement.style.color = '#10b981'; else if (status.includes('🔴')) statusElement.style.color = '#ef4444'; else statusElement.style.color = '#f59e0b'; }
}

function addRemoteVideo(peerId, username) {
  if (document.getElementById(`video-container-${peerId}`)) return;
  const container = document.createElement('div'); container.className = 'video-box'; container.id = `video-container-${peerId}`;
  container.innerHTML = `<div class="name-tag">👤 ${username}</div><div class="status-tag"><span id="status-${peerId}" style="color: #f59e0b;">⏳ Connecting...</span></div><video id="video-${peerId}" autoplay playsinline title="ចុចដើម្បីមើលពេញអេក្រង់"></video>`;
  videoGrid.appendChild(container); 
  const video = document.getElementById(`video-${peerId}`); 
  if (video) video.onclick = () => makeFullscreen(video);
}
function removeRemoteVideo(peerId) { const container = document.getElementById(`video-container-${peerId}`); if (container) container.remove(); }

function addRemoteScreenVideo(peerId, stream, sharerName) {
  screenGrid.style.display = 'grid'; 
  document.getElementById('screenTitle').style.display = 'block';
  let screenContainer = document.getElementById(`screen-container-${peerId}`);
  if (!screenContainer) {
    screenContainer = document.createElement('div'); 
    screenContainer.className = 'video-box screen-box'; 
    screenContainer.id = `screen-container-${peerId}`;
    screenContainer.innerHTML = `<div class="name-tag" style="background:#f59e0b; color:#000;">🖥️ អេក្រង់របស់: ${sharerName}</div><video id="screen-video-${peerId}" autoplay playsinline title="ចុចដើម្បីមើលពេញអេក្រង់"></video>`;
    screenGrid.appendChild(screenContainer);
  }
  const screenVideo = document.getElementById(`screen-video-${peerId}`); 
  if (screenVideo) { screenVideo.srcObject = stream; screenVideo.onclick = () => makeFullscreen(screenVideo); }
}

function removeRemoteScreenVideo(peerId) {
  const screenContainer = document.getElementById(`screen-container-${peerId}`); 
  if (screenContainer) screenContainer.remove();
  if (screenGrid.children.length === 0) { screenGrid.style.display = 'none'; document.getElementById('screenTitle').style.display = 'none'; }
}

function updateUserCount() { 
  const count = document.querySelectorAll('#videoGrid .video-box').length; 
  document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId} | អ្នកប្រើ: ${count}`; 
}

async function toggleCamera() {
  const camIcon = document.getElementById('camBtnIcon');
  if (isCameraOn) {
    if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
    isCameraOn = false; camIcon.innerHTML = '🚫'; camIcon.classList.add('off');
    const dummyTrack = localStream.getVideoTracks()[0]; localVideo.srcObject = localStream; replaceVideoTrackToPeers(dummyTrack);
  } else {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
      const camTrack = cameraStream.getVideoTracks()[0]; isCameraOn = true; camIcon.innerHTML = '🎥'; camIcon.classList.remove('off');
      localVideo.srcObject = cameraStream; replaceVideoTrackToPeers(camTrack); camTrack.onended = () => toggleCamera();
    } catch (err) { alert('មិនអាចបើកកាមេរ៉ាបានទេ: ' + err.message); }
  }
}

function replaceVideoTrackToPeers(newVideoTrack) { 
  for (const [peerId, call] of Object.entries(peerCalls)) { 
    const pc = call.peerConnection; if (!pc) continue; 
    const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video'); 
    if (videoSender && newVideoTrack) videoSender.replaceTrack(newVideoTrack); 
  } 
}

async function toggleScreenShare() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return alert('⚠️ មុខងារ Share Screen ដំណើរការបានតែលើកុំព្យូទ័រ!');
  if (isScreenSharing) { 
    stopScreenShare(); 
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); 
      isScreenSharing = true; 
      document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing'; 
      document.getElementById('screenBtn').className = 'btn-danger';
      
      addRemoteScreenVideo('my-local-screen', screenStream, myUsername + " (អ្នក)"); 
      
      for (const peerId of Object.keys(userNamesMap)) { 
        if (peerId !== myPeerId) {
          const targetScreenId = peerId + '_screen';
          const call = myScreenPeer.call(targetScreenId, screenStream, { metadata: { username: myUsername } }); 
          screenCalls[peerId] = call;
        }
      } 
      screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) {}
  }
}

function stopScreenShare() {
  if (!isScreenSharing) return; 
  isScreenSharing = false; 
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen'; 
  document.getElementById('screenBtn').className = 'btn-warning'; 
  removeRemoteScreenVideo('my-local-screen');
  
  for (const peerId of Object.keys(screenCalls)) { 
    if(screenCalls[peerId]) screenCalls[peerId].close(); 
    delete screenCalls[peerId]; 
  }
  if (screenStream) { screenStream.getTracks().forEach(track => track.stop()); screenStream = null; }
}

function toggleMic() {
  const audioTrack = localStream.getAudioTracks()[0]; if (!audioTrack) return;
  const micIcon = document.getElementById('micBtnIcon'); audioTrack.enabled = !audioTrack.enabled;
  if (audioTrack.enabled) { micIcon.innerHTML = '🎤'; micIcon.classList.remove('off'); } else { micIcon.innerHTML = '🔇'; micIcon.classList.add('off'); }
}

function leaveRoom() {
  if (dummyAnimFrame) cancelAnimationFrame(dummyAnimFrame); 
  if (isScreenSharing) stopScreenShare();
  if (isCameraOn && cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; isCameraOn = false; }
  
  for (const [peerId, call] of Object.entries(peerCalls)) { call.close(); delete peerCalls[peerId]; }
  for (const [peerId, call] of Object.entries(screenCalls)) { call.close(); delete screenCalls[peerId]; }
  
  if (myPeer) myPeer.destroy(); 
  if (myScreenPeer) myScreenPeer.destroy();
  if (localStream) localStream.getTracks().forEach(track => track.stop()); 

  localStorage.removeItem('meeting_username');
  localStorage.removeItem('meeting_role');
  localStorage.removeItem('meeting_room');
  socket.disconnect();

  location.reload();
}
