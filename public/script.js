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

let isCameraOn = false;
let isScreenSharing = false;
let dummyAnimFrame = null;
let allRoomsList = [];
let pendingLoginData = null; // ទុកទិន្នន័យរង់ចាំ 2FA

const localVideo = document.getElementById('localVideo');
const screenGrid = document.getElementById('screenGrid');
const videoGrid = document.getElementById('videoGrid');

// ទទួល OTP (សម្រាប់ Device ទី១) ដើម្បីឱ្យម្ចាស់យកទៅវាយនៅ Device ទី២
socket.on('receive-otp', (data) => {
  alert(`🚨 ព្រមាន៖ មានគេកំពុងព្យាយាម Login ចូលគណនីរបស់អ្នក!\n\n🔐 នេះជាលេខកូដ 2FA របស់អ្នក៖ 【 ${data.otp} 】\n\n(សូមកុំប្រាប់លេខកូដនេះទៅអ្នកណាឱ្យសោះ!)`);
});

// Admin ទទួលការ Alert
socket.on('admin-alert', (data) => {
  if (currentUserRole === 'admin') {
    alert(`🚨 Admin Alert: User "${data.username}" កំពុង Login លើឧបករណ៍ចំនួន ${data.count} ក្នុងពេលតែមួយ!`);
  }
});

// ចុចលើ Video ឱ្យ Fullscreen
function makeFullscreen(elem) {
  if (elem.requestFullscreen) elem.requestFullscreen();
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
}
localVideo.onclick = () => makeFullscreen(localVideo);

// ---------------- Login & 2FA ----------------
async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const roomId = document.getElementById('roomSelect').value;

  if (!username || !password) return alert('សូមបំពេញ Username និង Password!');

  pendingLoginData = { username, password, roomId };

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingLoginData)
    });
    const data = await res.json();

    if (data.requires2FA) {
      alert(data.message);
      document.getElementById('otp-modal').classList.remove('hidden');
      return;
    }

    if (!data.success) return alert(data.message);
    finalizeLogin(data);
  } catch (err) {
    alert('មានបញ្ហាក្នុងការ Login!');
  }
}

async function verify2FA() {
  const otp = document.getElementById('otpInput').value.trim();
  if (!otp) return alert('សូមវាយបញ្ចូលលេខកូដ!');
  
  try {
    const res = await fetch('/api/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...pendingLoginData, otp })
    });
    const data = await res.json();

    if (!data.success) return alert(data.message);
    document.getElementById('otp-modal').classList.add('hidden');
    finalizeLogin(data);
  } catch (err) {
    alert('លេខកូដមិនត្រឹមត្រូវទេ!');
  }
}

function cancel2FA() {
  document.getElementById('otp-modal').classList.add('hidden');
  pendingLoginData = null;
}

function finalizeLogin(data) {
  myUsername = data.user.username;
  currentUserRole = data.user.role;
  currentRoomId = pendingLoginData.roomId;

  document.getElementById('mainBody').style.justifyContent = 'flex-start';
  
  if (currentUserRole === 'admin') {
    // Show Admin Dashboard (ប្រសិនបើបងមាន HTML វា)
  } else {
    document.getElementById('auth').classList.add('hidden');
    startMeeting();
  }
}

// ---------------- Private Chat ----------------
function toggleChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('hidden');
}

function updateChatUserList() {
  const select = document.getElementById('chatRecipientSelect');
  select.innerHTML = '<option value="">-- ជ្រើសរើសអ្នកទទួល --</option>';
  for (let [peerId, name] of Object.entries(userNamesMap)) {
    select.innerHTML += `<option value="${peerId}">${name}</option>`;
  }
}

function sendPrivateMsg() {
  const toPeerId = document.getElementById('chatRecipientSelect').value;
  const msgInput = document.getElementById('chatInput');
  const message = msgInput.value.trim();

  if (!toPeerId || !message) return alert('សូមរើសអ្នកទទួល និងវាយសារ!');
  
  socket.emit('private-message', { toPeerId, message });
  
  // បង្ហាញក្នុងប្រអប់ខ្លួនឯង
  const chatMsgs = document.getElementById('chat-messages');
  chatMsgs.innerHTML += `<div class="msg-item me"><b>To ${userNamesMap[toPeerId]}:</b> ${message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  msgInput.value = '';
}

socket.on('receive-private-message', (data) => {
  document.getElementById('chat-panel').classList.remove('hidden'); // បើកផ្ទាំងពេលមានសារចូល
  const chatMsgs = document.getElementById('chat-messages');
  chatMsgs.innerHTML += `<div class="msg-item"><b>From 👤 ${data.fromUsername}:</b><br>${data.message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
});

// ---------------- WebRTC & PeerJS ----------------
function createActiveDummyVideoTrack() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  let angle = 0;
  function draw() {
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#38bdf8'; ctx.beginPath();
    ctx.arc(160 + Math.cos(angle) * 30, 120 + Math.sin(angle) * 20, 10, 0, Math.PI * 2);
    ctx.fill(); angle += 0.08;
    dummyAnimFrame = requestAnimationFrame(draw);
  }
  draw();
  return canvas.captureStream(15).getVideoTracks()[0];
}

async function startMeeting() {
  // ការបើក Audio/Video រក្សាដូចដើម
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

  myPeer = new Peer(undefined, {
    host: location.hostname, port: location.port || (location.protocol === 'https:' ? 443 : 80), path: '/peerjs', secure: location.protocol === 'https:',
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
  });

  myPeer.on('open', (id) => {
    myId = id;
    document.getElementById('room-container').classList.remove('hidden');
    socket.emit('join-room', currentRoomId, id, myUsername);
  });

  myPeer.on('call', (call) => {
    const callType = call.metadata ? call.metadata.type : 'camera';
    const callerName = call.metadata ? call.metadata.username : 'ដៃគូ';
    if (callType === 'screen') {
      call.answer();
      call.on('stream', (stream) => addRemoteScreenVideo(call.peer, stream, callerName));
    } else {
      call.answer(isCameraOn ? cameraStream : localStream);
      peerCalls[call.peer] = call;
      addRemoteVideo(call.peer, callerName);
      call.on('stream', (stream) => { document.getElementById(`video-${call.peer}`).srcObject = stream; });
    }
  });

  socket.on('existing-users', (users) => {
    users.forEach((user, index) => {
      userNamesMap[user.peerId] = user.username;
      addRemoteVideo(user.peerId, user.username);
      setTimeout(() => connectToUser(user.peerId), (index + 1) * 500);
    });
    updateChatUserList();
  });

  socket.on('user-joined', ({ peerId, username }) => {
    if (peerId !== myId) {
      userNamesMap[peerId] = username;
      addRemoteVideo(peerId, username);
      updateChatUserList();
      if (isScreenSharing) setTimeout(() => myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } }), 1200);
    }
  });

  socket.on('user-left', (peerId) => {
    removeRemoteVideo(peerId);
    removeRemoteScreenVideo(peerId);
    if (peerCalls[peerId]) peerCalls[peerId].close();
    delete userNamesMap[peerId];
    updateChatUserList();
  });
}

function connectToUser(peerId) {
  if (peerCalls[peerId]) return;
  const call = myPeer.call(peerId, (isCameraOn ? cameraStream : localStream), { metadata: { type: 'camera', username: myUsername } });
  peerCalls[peerId] = call;
  call.on('stream', (stream) => { document.getElementById(`video-${peerId}`).srcObject = stream; });
  if (isScreenSharing) myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
}

function addRemoteVideo(peerId, username) {
  if (document.getElementById(`video-container-${peerId}`)) return;
  const div = document.createElement('div');
  div.className = 'video-box'; div.id = `video-container-${peerId}`;
  div.innerHTML = `<div class="name-tag">👤 ${username}</div><video id="video-${peerId}" autoplay playsinline title="ចុចមើលពេញអេក្រង់"></video>`;
  videoGrid.appendChild(div);
  document.getElementById(`video-${peerId}`).onclick = function() { makeFullscreen(this); };
}
function removeRemoteVideo(peerId) { const el = document.getElementById(`video-container-${peerId}`); if(el) el.remove(); }

function addRemoteScreenVideo(peerId, stream, sharerName) {
  screenGrid.style.display = 'grid'; document.getElementById('screenTitle').style.display = 'block';
  let el = document.getElementById(`screen-container-${peerId}`);
  if (!el) {
    el = document.createElement('div'); el.className = 'video-box screen-box'; el.id = `screen-container-${peerId}`;
    el.innerHTML = `<div class="name-tag" style="background:#f59e0b;color:#000;">🖥️ អេក្រង់: ${sharerName}</div><video id="screen-video-${peerId}" autoplay playsinline></video>`;
    screenGrid.appendChild(el);
  }
  document.getElementById(`screen-video-${peerId}`).srcObject = stream;
  document.getElementById(`screen-video-${peerId}`).onclick = function() { makeFullscreen(this); };
}
function removeRemoteScreenVideo(peerId) {
  const el = document.getElementById(`screen-container-${peerId}`); if(el) el.remove();
  if (screenGrid.children.length === 0) { screenGrid.style.display = 'none'; document.getElementById('screenTitle').style.display = 'none'; }
}

// ---------------- Controls (Mic, Camera, Screen) រក្សាទុកដូចមុនបេះបិទ ----------------
async function toggleCamera() { /*... (កូដចាស់) ...*/ }
async function toggleScreenShare() { /*... (កូដចាស់) ...*/ }
function stopScreenShare() { /*... (កូដចាស់) ...*/ }
function toggleMic() { /*... (កូដចាស់) ...*/ }
function leaveRoom() { location.reload(); }
async function changeMyPassword() { /*... (កូដចាស់) ...*/ }
