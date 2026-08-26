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

const localVideo = document.getElementById('localVideo');
const localScreenVideo = document.getElementById('localScreenVideo');
const videoGrid = document.getElementById('videoGrid');
const myScreenContainer = document.getElementById('myScreenContainer');

function makeFullscreen(elem) {
  if (elem.requestFullscreen) elem.requestFullscreen();
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
}

localVideo.onclick = () => makeFullscreen(localVideo);
localScreenVideo.onclick = () => makeFullscreen(localScreenVideo);

function switchAdminTab(tab) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tabs button').forEach(el => el.classList.remove('active'));

  if (tab === 'rooms') {
    document.getElementById('tab-rooms').classList.add('active');
    document.getElementById('tabBtnRooms').classList.add('active');
    loadAdminRoomMonitor();
  } else if (tab === 'users') {
    document.getElementById('tab-users').classList.add('active');
    document.getElementById('tabBtnUsers').classList.add('active');
    loadUsersTable();
  } else if (tab === 'newRoom') {
    document.getElementById('tab-newRoom').classList.add('active');
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
  } catch (err) {
    console.error('Error fetching rooms:', err);
  }
}

window.onload = loadRooms;

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
  } catch (err) {
    console.error('Error loading rooms:', err);
  }
}

async function loadUsersTable() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    data.users.forEach(user => {
      const isBlocked = user.isBlocked;
      const statusText = isBlocked 
        ? '<span style="color:#ef4444; font-weight:bold;">Blocked</span>' 
        : '<span style="color:#10b981; font-weight:bold;">Active</span>';
      
      const adminActions = user.role === 'admin' ? '<span style="color:#64748b;">No actions</span>' : `
        <button class="action-btn ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser('${user.id}')">
          ${isBlocked ? 'Unblock' : 'Block'}
        </button>
        <button class="action-btn btn-secondary" onclick="editUserRoom('${user.id}', '${user.assignedRoom}')">
          ប្តូរបន្ទប់
        </button>
        <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword('${user.id}', '${user.username}')">
          Reset Pwd
        </button>
        <button class="action-btn btn-danger" onclick="deleteUser('${user.id}', '${user.username}')">
          លុប
        </button>
      `;

      tbody.innerHTML += `
        <tr>
          <td><strong>${user.username}</strong></td>
          <td>${user.role}</td>
          <td>${user.assignedRoom}</td>
          <td>${statusText}</td>
          <td>${adminActions}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error('Error loading user table:', err);
  }
}

async function toggleBlockUser(id) {
  try {
    const res = await fetch(`/api/users/${id}/toggle-block`, { method: 'PUT' });
    const data = await res.json();
    alert(data.message);
    await loadUsersTable();
  } catch (err) {
    console.error(err);
  }
}

async function deleteUser(id, username) {
  if (!confirm(`តើអ្នកប្រាកដថាចង់លុប User "${username}" ទេ?`)) return;
  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message);
    await loadUsersTable();
  } catch (err) {
    console.error(err);
  }
}

async function resetPassword(id, username) {
  const newPassword = prompt(`បញ្ចូលលេខសម្ងាត់ថ្មីសម្រាប់ ${username}:`);
  if (!newPassword) return;

  try {
    const res = await fetch(`/api/users/${id}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    alert(data.message);
  } catch (err) {
    console.error(err);
  }
}

async function editUserRoom(id, currentRoom) {
  const newRoom = prompt(`បញ្ចូលបន្ទប់ថ្មី (បន្ទប់បច្ចុប្បន្ន: ${currentRoom}):\nជម្រើសបន្ទប់ដែលមាន: ${allRoomsList.join(', ')}`);
  if (!newRoom) return;

  try {
    const res = await fetch(`/api/users/${id}/edit-room`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRoom })
    });
    const data = await res.json();
    alert(data.message);
    await loadUsersTable();
  } catch (err) {
    console.error(err);
  }
}

function createActiveDummyVideoTrack() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  let angle = 0;

  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(160 + Math.cos(angle) * 30, 120 + Math.sin(angle) * 20, 10, 0, Math.PI * 2);
    ctx.fill();
    angle += 0.08;
    dummyAnimFrame = requestAnimationFrame(draw);
  }
  draw();

  const videoStream = canvas.captureStream(15);
  return videoStream.getVideoTracks()[0];
}

async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const roomId = document.getElementById('roomSelect').value;

  if (!username || !password) return alert('សូមបំពេញ Username និង Password!');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, roomId })
    });
    const data = await res.json();

    if (!data.success) {
      return alert(data.message);
    }

    myUsername = data.user.username;
    currentUserRole = data.user.role;
    currentRoomId = roomId;

    if (currentUserRole === 'admin') {
      document.getElementById('auth').classList.add('hidden');
      document.getElementById('admin-dashboard').classList.remove('hidden');
      loadAdminRoomMonitor();
      loadUsersTable();
    } else {
      startMeeting();
    }
  } catch (err) {
    alert('មានបញ្ហាក្នុងការ Login!');
  }
}

function adminJoinRoom(roomId) {
  currentRoomId = roomId;
  document.getElementById('admin-dashboard').classList.add('hidden');
  startMeeting();
}

async function startMeeting() {
  let audioTrack;
  try {
    const userMedia = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioTrack = userMedia.getAudioTracks()[0];
  } catch (e) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const dst = osc.connect(audioCtx.createMediaStreamDestination());
    osc.start();
    audioTrack = dst.stream.getAudioTracks()[0];
    audioTrack.enabled = false;
  }

  const dummyVideoTrack = createActiveDummyVideoTrack();
  localStream = new MediaStream([audioTrack, dummyVideoTrack]);
  localVideo.srcObject = localStream;

  // ភ្ជាប់ទៅកាន់ PeerServer លើ Render ផ្ទាល់ខ្លួន
  myPeer = new Peer(undefined, {
    host: location.hostname,
    port: location.port || (location.protocol === 'https:' ? 443 : 80),
    path: '/peerjs',
    secure: location.protocol === 'https:',
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    }
  });

  myPeer.on('open', (id) => {
    myId = id;
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId}`;
    socket.emit('join-room', currentRoomId, id, myUsername);
  });

  // ទទួលការ Call ចូល
  myPeer.on('call', (call) => {
    const callType = call.metadata ? call.metadata.type : 'camera';
    const callerName = call.metadata ? call.metadata.username : 'ដៃគូ';

    if (callType === 'screen') {
      call.answer();
      call.on('stream', (remoteScreenStream) => {
        addRemoteScreenVideo(call.peer, remoteScreenStream);
      });
      call.on('close', () => removeRemoteScreenVideo(call.peer));
    } else {
      const streamToSend = (isCameraOn && cameraStream) ? cameraStream : localStream;
      call.answer(streamToSend);
      peerCalls[call.peer] = call;

      addRemoteVideo(call.peer, callerName);

      call.on('stream', (remoteStream) => {
        const videoElement = document.getElementById(`video-${call.peer}`);
        if (videoElement) {
          videoElement.srcObject = remoteStream;
          updateConnectionStatus(call.peer, '🟢 Online');
        }
      });

      call.on('close', () => {
        delete peerCalls[call.peer];
        updateConnectionStatus(call.peer, '🔴 Offline');
      });
    }
  });

  socket.on('existing-users', (users) => {
    users.forEach((user, index) => {
      userNamesMap[user.peerId] = user.username;
      addRemoteVideo(user.peerId, user.username);
      setTimeout(() => {
        connectToUser(user.peerId, user.username);
      }, (index + 1) * 500);
    });
    updateUserCount();
  });

  socket.on('user-joined', ({ peerId, username }) => {
    if (peerId !== myId) {
      userNamesMap[peerId] = username;
      addRemoteVideo(peerId, username);
      updateUserCount();

      // ប្រសិនបើយើងកំពុងបើក Screen Share បញ្ជូន Screen ទៅកាន់អ្នកថ្មីភ្លាម
      if (isScreenSharing && screenStream) {
        setTimeout(() => {
          myPeer.call(peerId, screenStream, { metadata: { type: 'screen' } });
        }, 1200);
      }
    }
  });

  socket.on('user-left', (peerId) => {
    removeRemoteVideo(peerId);
    removeRemoteScreenVideo(peerId);
    if (peerCalls[peerId]) {
      peerCalls[peerId].close();
      delete peerCalls[peerId];
    }
    updateUserCount();
  });
}

function connectToUser(peerId, username) {
  if (peerCalls[peerId]) return;
  const streamToSend = (isCameraOn && cameraStream) ? cameraStream : localStream;

  try {
    const call = myPeer.call(peerId, streamToSend, { metadata: { type: 'camera', username: myUsername } });
    peerCalls[peerId] = call;
    updateConnectionStatus(peerId, '⏳ Connecting...');

    call.on('stream', (remoteStream) => {
      const videoElement = document.getElementById(`video-${peerId}`);
      if (videoElement) {
        videoElement.srcObject = remoteStream;
        updateConnectionStatus(peerId, '🟢 Online');
      }
    });

    call.on('close', () => {
      delete peerCalls[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

    call.on('error', () => {
      delete peerCalls[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

    if (isScreenSharing && screenStream) {
      myPeer.call(peerId, screenStream, { metadata: { type: 'screen' } });
    }

  } catch (err) {
    console.error('Error calling peer:', err);
  }
}

function updateConnectionStatus(peerId, status) {
  const statusElement = document.getElementById(`status-${peerId}`);
  if (statusElement) {
    statusElement.textContent = status;
    if (status.includes('🟢')) {
      statusElement.style.color = '#10b981';
    } else if (status.includes('🔴')) {
      statusElement.style.color = '#ef4444';
    } else {
      statusElement.style.color = '#f59e0b';
    }
  }
}

function addRemoteVideo(peerId, username) {
  if (document.getElementById(`video-container-${peerId}`)) return;

  const container = document.createElement('div');
  container.className = 'video-box';
  container.id = `video-container-${peerId}`;
  
  container.innerHTML = `
    <p style="margin-bottom:8px;"><strong>👤 ${username} (Camera)</strong> 
      <span id="status-${peerId}" style="color: #f59e0b;">⏳ Connecting...</span>
    </p>
    <video id="video-${peerId}" autoplay playsinline></video>
  `;
  
  videoGrid.appendChild(container);
  
  const video = document.getElementById(`video-${peerId}`);
  if (video) {
    video.onclick = () => makeFullscreen(video);
  }
}

function removeRemoteVideo(peerId) {
  const container = document.getElementById(`video-container-${peerId}`);
  if (container) container.remove();
}

function addRemoteScreenVideo(peerId, stream) {
  let screenContainer = document.getElementById(`screen-container-${peerId}`);
  if (!screenContainer) {
    screenContainer = document.createElement('div');
    screenContainer.className = 'video-box screen-box';
    screenContainer.id = `screen-container-${peerId}`;

    screenContainer.innerHTML = `
      <p style="margin-bottom:8px; font-weight:600; color:#f59e0b;">🖥️ អេក្រង់របស់ដៃគូ (Screen)</p>
      <video id="screen-video-${peerId}" autoplay playsinline></video>
    `;
    videoGrid.appendChild(screenContainer);
  }

  const screenVideo = document.getElementById(`screen-video-${peerId}`);
  if (screenVideo) {
    screenVideo.srcObject = stream;
    screenVideo.onclick = () => makeFullscreen(screenVideo);
  }
}

function removeRemoteScreenVideo(peerId) {
  const screenContainer = document.getElementById(`screen-container-${peerId}`);
  if (screenContainer) screenContainer.remove();
}

function updateUserCount() {
  const count = document.querySelectorAll('.video-box:not(.screen-box)').length;
  document.getElementById('welcome-text').innerText = 
    `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId} | អ្នកប្រើ: ${count}`;
}

async function toggleCamera() {
  const camBtn = document.getElementById('camBtn');
  
  if (isCameraOn) {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    isCameraOn = false;
    camBtn.innerHTML = '📷 បើក កាមេរ៉ា';
    camBtn.className = 'btn-secondary';

    const dummyTrack = localStream.getVideoTracks()[0];
    localVideo.srcObject = localStream;
    replaceVideoTrackToPeers(dummyTrack);
  } else {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true
      });
      const camTrack = cameraStream.getVideoTracks()[0];
      
      isCameraOn = true;
      camBtn.innerHTML = '📷 បិទ កាមេរ៉ា';
      camBtn.className = 'btn-success';

      localVideo.srcObject = cameraStream;
      replaceVideoTrackToPeers(camTrack);

      camTrack.onended = () => {
        toggleCamera();
      };
    } catch (err) {
      alert('មិនអាចបើកកាមេរ៉ាបានទេ: ' + err.message);
    }
  }
}

function replaceVideoTrackToPeers(newVideoTrack) {
  for (const [peerId, call] of Object.entries(peerCalls)) {
    const pc = call.peerConnection;
    if (!pc) continue;

    const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (videoSender && newVideoTrack) {
      videoSender.replaceTrack(newVideoTrack);
    }
  }
}

async function toggleScreenShare() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    return alert('⚠️ មុខងារ Share Screen អាចដំណើរការបានតែលើកុំព្យូទ័រ (Computer/Laptop) ប៉ុណ្ណោះ!');
  }

  if (isScreenSharing) {
    stopScreenShare();
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      isScreenSharing = true;

      document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
      document.getElementById('screenBtn').classList.add('btn-danger');
      myScreenContainer.classList.remove('hidden');
      localScreenVideo.srcObject = screenStream;

      for (const peerId of Object.keys(peerCalls)) {
        myPeer.call(peerId, screenStream, { metadata: { type: 'screen' } });
      }

      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.warn('Screen share canceled:', err);
    }
  }
}

function stopScreenShare() {
  if (!isScreenSharing) return;
  isScreenSharing = false;

  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').classList.remove('btn-danger');
  document.getElementById('screenBtn').classList.add('btn-warning');
  myScreenContainer.classList.add('hidden');

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
}

function toggleMic() {
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) {
    return alert('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!');
  }
  audioTrack.enabled = !audioTrack.enabled;
  document.getElementById('micBtn').innerHTML = audioTrack.enabled ? '🎤 បិទ/បើក មេក្រូ' : '🔇 បើក មេក្រូ';
  document.getElementById('micBtn').style.background = audioTrack.enabled ? '#10b981' : '#ef4444';
}

// មុខងារចាកចេញពីបន្ទប់ (ពេលកំពុង Meeting)
function leaveRoom() {
  // បញ្ឈប់ Animation និង Screen Share
  if (dummyAnimFrame) cancelAnimationFrame(dummyAnimFrame);
  if (isScreenSharing) stopScreenShare();
  
  // បិទ Camera បើកំពុងបើក
  if (isCameraOn && cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
    isCameraOn = false;
    document.getElementById('camBtn').innerHTML = '📷 បើក កាមេរ៉ា';
    document.getElementById('camBtn').className = 'btn-secondary';
  }
  
  // បិទការតភ្ជាប់ Peer ទាំងអស់
  for (const [peerId, call] of Object.entries(peerCalls)) {
    call.close();
    delete peerCalls[peerId];
  }
  
  if (myPeer) myPeer.destroy();
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  
  // ផ្តាច់ Socket ដើម្បីឱ្យ Server ដឹងថាបានចេញពីបន្ទប់
  socket.disconnect();

  // លាក់ផ្ទាំង Meeting
  document.getElementById('room-container').classList.add('hidden');

  // ត្រួតពិនិត្យមើលសិទ្ធិ: បើជា Admin ឱ្យត្រឡប់ទៅ Dashboard វិញ
  if (currentUserRole === 'admin') {
    document.getElementById('admin-dashboard').classList.remove('hidden');
    socket.connect(); // តភ្ជាប់ Socket ឡើងវិញដើម្បីអាចចូលបន្ទប់ផ្សេងទៀតបាន
    loadAdminRoomMonitor();
    loadUsersTable();
  } else {
    // បើជា User ធម្មតា ឱ្យ Refresh ទំព័រត្រឡប់ទៅកន្លែង Login វិញ
    location.reload(); 
  }
}

// មុខងារ Logout ចេញពី Admin Dashboard ទៅកាន់ផ្ទាំង Login វិញ
function logoutAdmin() {
  myUsername = '';
  currentUserRole = '';
  currentRoomId = '';
  location.reload(); // Refresh ដើម្បីជម្រះទិន្នន័យចេញពី Memory ទាំងស្រុង
}

// បន្ថែម function នេះក្រែងលោប៊ូតុងក្នុង HTML របស់អ្នកប្រើឈ្មោះ "logout()" ទទេ
function logout() {
  logoutAdmin();
}
