// ============================================================
// SOCKET.IO CONNECTION - FIXED
// ============================================================
let socket = null;
let socketConnected = false;
let connectionAttempts = 0;

// ============================================================
// PEER & STREAM VARIABLES
// ============================================================
let myPeer = null;
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
let isMicOn = true;
let isScreenSharing = false;
let dummyAnimFrame = null;
let allRoomsList = [];
let pendingLoginData = null;

const localVideo = document.getElementById('localVideo');
const screenGrid = document.getElementById('screenGrid');
const videoGrid = document.getElementById('videoGrid');

// ============================================================
// CHAT VARIABLES
// ============================================================
let unreadChats = {};
let isChatOpen = false;
let chatTargetPeerId = null;
let chatMessages = {};

// ============================================================
// REMOTE CONTROL VARIABLES
// ============================================================
let isRemoteControlActive = false;
let remoteControlTarget = null;
let remoteControlRequestId = null;
let isBeingControlled = false;
let remotePointer = null;

// ============================================================
// SOCKET CONNECTION FUNCTION - FIXED
// ============================================================
function connectSocket() {
  // បង្កើត Socket.IO ដោយប្រើប្រាស់ត្រឹម polling និងបិទ upgrade
  socket = io({
    transports: ['polling'],
    upgrade: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 30000
  });

  socket.on('connect_error', function(error) {
    console.log('❌ Socket.IO connection error:', error);
  });

  socket.on('connect', function() {
    console.log('✅ Socket.IO connected successfully!');
    socketConnected = true;
    connectionAttempts = 0;
    showToast('✅ ភ្ជាប់ Server បានជោគជ័យ!', 'success');
    
    if (myId && currentRoomId && myUsername) {
      socket.emit('join-room', {
        roomId: currentRoomId,
        peerId: myId,
        username: myUsername
      });
    }
  });

  socket.on('disconnect', function(reason) {
    console.log('🔌 Socket.IO disconnected:', reason);
    socketConnected = false;
  });

  // ============================================================
  // ROOM EVENTS - FIXED
  // ============================================================
  socket.on('room-joined', function(data) {
    console.log('✅ Room joined successfully:', data);
    showToast('✅ ចូលបន្ទប់ ' + data.roomId + ' បានជោគជ័យ!', 'success');
    
    if (data.existingUsers && data.existingUsers.length > 0) {
      data.existingUsers.forEach(function(user) {
        if (user.peerId !== myId) {
          userNamesMap[user.peerId] = user.username;
          addRemoteVideo(user.peerId, user.username);
          setTimeout(function() {
            connectToUser(user.peerId);
          }, 500);
        }
      });
      updateUserCount();
      updateChatUserList();
    }
  });

  socket.on('user-joined', function(data) {
    console.log('👤 User joined:', data);
    var peerId = data.peerId;
    var username = data.username;
    
    if (peerId !== myId) {
      userNamesMap[peerId] = username;
      addRemoteVideo(peerId, username);
      updateUserCount();
      updateChatUserList();
      playNotificationSound('join');
      
      setTimeout(function() {
        connectToUser(peerId);
      }, 500);

      if (isScreenSharing && screenStream && myPeer) {
        setTimeout(function() {
          myPeer.call(peerId, screenStream, { 
            metadata: { type: 'screen', username: myUsername } 
          });
        }, 1000);
      }
    }
  });

  socket.on('user-left', function(data) {
    console.log('👤 User left:', data);
    var peerId = (typeof data === 'object') ? data.peerId : data;
    
    removeRemoteVideo(peerId);
    removeRemoteScreenVideo(peerId);
    
    if (peerCalls[peerId]) {
      peerCalls[peerId].close();
      delete peerCalls[peerId];
    }
    
    delete userNamesMap[peerId];
    updateUserCount();
    updateChatUserList();
    playNotificationSound('leave');
  });

  // ============================================================
  // CHAT MESSAGES
  // ============================================================
  socket.on('receive-private-message', function(data) {
    console.log('💬 New message from:', data.fromUsername);
    
    if (!chatMessages[data.fromPeerId]) {
      chatMessages[data.fromPeerId] = [];
    }
    chatMessages[data.fromPeerId].push({
      from: data.fromPeerId,
      fromUsername: data.fromUsername,
      message: data.message,
      time: new Date().toLocaleTimeString()
    });

    if (chatTargetPeerId === data.fromPeerId && isChatOpen) {
      renderChatMessages();
    }

    if (!unreadChats[data.fromPeerId]) {
      unreadChats[data.fromPeerId] = { count: 0, messages: [], username: data.fromUsername };
    }
    unreadChats[data.fromPeerId].count++;
    unreadChats[data.fromPeerId].messages.push(data.message);
    unreadChats[data.fromPeerId].username = data.fromUsername;
    
    updateChatBadge();
    updateChatUserList();
    playNotificationSound('message');
    
    if (!isChatOpen || chatTargetPeerId !== data.fromPeerId) {
      showChatNotification(data.fromUsername, data.message, data.fromPeerId);
    }
  });

  // ============================================================
  // ADMIN EVENTS
  // ============================================================
  socket.on('rooms-update', function() {
    console.log('🔄 Rooms update received');
    if ((currentUserRole === 'admin' || currentUserRole === 'supervisor') && 
        document.getElementById('admin-dashboard') &&
        !document.getElementById('admin-dashboard').classList.contains('hidden')) {
      if (typeof loadAdminRoomMonitor === 'function') {
        loadAdminRoomMonitor();
      }
    }
  });

  socket.on('play-sound', function(type) {
    playNotificationSound(type);
  });

  // ============================================================
  // 2FA OTP & ALERTS
  // ============================================================
  socket.on('receive-otp', function(data) {
    alert('🚨 ព្រមាន៖ មានគេកំពុងព្យាយាម Login ចូលគណនីរបស់អ្នកពីឧបករណ៍ផ្សេង!\n\n🔐 នេះជាលេខកូដ 2FA របស់អ្នក៖ 【 ' + data.otp + ' 】');
  });

  socket.on('admin-alert', function(data) {
    if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
      alert('🚨 សេចក្តីប្រកាសអាសន្នសុវត្ថិភាព!\n\nUser ឈ្មោះ "' + data.username + '" កំពុង Login លើឧបករណ៍ចំនួន ' + data.count + ' ក្នុងពេលតែមួយ!');
    }
  });

  // ============================================================
  // REMOTE CONTROL EVENTS
  // ============================================================
  socket.on('remote-control-request', function(data) {
    if (data.targetId === myId) {
      var username = userNamesMap[data.controllerId] || 'មិត្តភក្តិ';
      if (confirm(username + ' ចង់គ្រប់គ្រង Screen របស់អ្នកពីចម្ងាយ។ តើអ្នកអនុញ្ញាតទេ?')) {
        fetch('/api/remote-control/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: data.requestId,
            targetId: myId
          })
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

  socket.on('remote-control-approved', function(data) {
    if (data.controllerId === myId) {
      alert('✅ Remote Control ត្រូវបានអនុញ្ញាត!');
      isRemoteControlActive = true;
      remoteControlTarget = data.targetId;
      startRemoteControl();
    }
  });

  socket.on('remote-control-rejected', function(data) {
    if (data.controllerId === myId) {
      alert('❌ Remote Control ត្រូវបានបដិសេធ!');
      isRemoteControlActive = false;
      remoteControlTarget = null;
    }
  });

  socket.on('remote-control-ended', function(data) {
    if (data.controllerId === myId) {
      isRemoteControlActive = false;
      remoteControlTarget = null;
      stopRemoteControl();
    }
    if (data.targetId === myId) {
      isBeingControlled = false;
      if (remotePointer) {
        remotePointer.remove();
        remotePointer = null;
      }
    }
  });

  socket.on('remote-mouse-move', function(data) {
    if (!isBeingControlled) return;
    showRemotePointer(data.x, data.y);
  });

  socket.on('remote-mouse-click', function(data) {
    if (!isBeingControlled) return;
    var element = document.elementFromPoint(data.x, data.y);
    if (element) {
      element.click();
      showRemoteClick(data.x, data.y);
    }
  });

  socket.on('remote-keyboard', function(data) {
    if (!isBeingControlled) return;
    var activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
      var event = new KeyboardEvent('keydown', { key: data.key, bubbles: true });
      activeElement.dispatchEvent(event);
      if (data.key.length === 1) {
        var inputEvent = new InputEvent('input', { bubbles: true });
        activeElement.dispatchEvent(inputEvent);
      }
    }
  });
}

// ============================================================
// SOUND NOTIFICATION
// ============================================================
function playNotificationSound(type) {
  try {
    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var oscillator = audioCtx.createOscillator();
    var gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'join') {
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'leave') {
      oscillator.frequency.value = 600;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'message') {
      oscillator.frequency.value = 900;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.2;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.08);
      setTimeout(function() {
        var osc2 = audioCtx.createOscillator();
        var gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.frequency.value = 1100;
        osc2.type = 'sine';
        gain2.gain.value = 0.2;
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.08);
      }, 150);
    }
  } catch (e) {
    console.log('Sound notification not available');
  }
}

// ============================================================
// CHAT FUNCTIONS
// ============================================================

function toggleChat() {
  const chatPanel = document.getElementById('chat-panel');
  if (!chatPanel) return;
  
  isChatOpen = !isChatOpen;
  
  if (isChatOpen) {
    chatPanel.classList.remove('hidden');
    chatPanel.style.display = 'flex';
    showChatUserList();
  } else {
    chatPanel.classList.add('hidden');
    chatPanel.style.display = 'none';
    chatTargetPeerId = null;
  }
}

function showChatUserList() {
  const userList = document.getElementById('chatUserList');
  const msgContainer = document.getElementById('chatMessagesContainer');
  
  if (userList) userList.style.display = 'block';
  if (msgContainer) {
    msgContainer.classList.remove('show');
    msgContainer.style.display = 'none';
  }
  
  updateChatUserList();
}

function showChatMessages(peerId) {
  chatTargetPeerId = peerId;
  
  const userList = document.getElementById('chatUserList');
  const msgContainer = document.getElementById('chatMessagesContainer');
  const chatTitle = document.getElementById('chatTitle');
  
  if (userList) userList.style.display = 'none';
  
  if (msgContainer) {
    msgContainer.classList.add('show');
    msgContainer.style.display = 'flex';
  }
  
  if (chatTitle) {
    const username = userNamesMap[peerId] || 'មិត្តភក្តិ';
    chatTitle.textContent = '👤 ' + username;
  }
  
  if (unreadChats[peerId]) {
    unreadChats[peerId].count = 0;
    updateChatBadge();
    updateChatUserList();
  }
  
  renderChatMessages();
  
  const chatInput = document.getElementById('chatInput');
  if (chatInput) chatInput.focus();
}

function renderChatMessages() {
  const messagesContainer = document.getElementById('chatMessages');
  if (!messagesContainer || !chatTargetPeerId) return;
  
  messagesContainer.innerHTML = '';
  
  const messages = chatMessages[chatTargetPeerId] || [];
  
  if (messages.length === 0) {
    messagesContainer.innerHTML = '<div class="chat-empty">គ្មានសារទេ</div>';
    return;
  }
  
  messages.forEach(function(msg) {
    const isMyMessage = msg.from === myId;
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (isMyMessage ? 'my-msg' : 'other-msg');
    div.innerHTML = `
      <div class="msg-bubble">${msg.message}</div>
      <div class="msg-time">${msg.time || new Date().toLocaleTimeString()}</div>
    `;
    messagesContainer.appendChild(div);
  });
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function sendPrivateMessage() {
  const chatInput = document.getElementById('chatInput');
  if (!chatInput) return;
  
  const targetPeerId = chatTargetPeerId;
  const message = chatInput.value.trim();
  
  if (!targetPeerId) {
    showToast('សូមជ្រើសរើសអ្នកទទួលសារ!', 'warning');
    showChatUserList();
    return;
  }
  if (!message) return;

  socket.emit('send-private-message', {
    targetPeerId: targetPeerId,
    message: message,
    fromUsername: myUsername
  });

  if (!chatMessages[targetPeerId]) {
    chatMessages[targetPeerId] = [];
  }
  chatMessages[targetPeerId].push({
    from: myId,
    fromUsername: myUsername,
    message: message,
    time: new Date().toLocaleTimeString()
  });

  chatInput.value = '';
  renderChatMessages();
}

function updateChatUserList() {
  const userList = document.getElementById('chatUserList');
  if (!userList) return;
  
  const header = userList.querySelector('div:first-child');
  userList.innerHTML = '';
  if (header) userList.appendChild(header);
  
  const sortedUsers = Object.keys(userNamesMap)
    .filter(pid => pid !== myId)
    .sort((a, b) => userNamesMap[a].localeCompare(userNamesMap[b]));
  
  if (sortedUsers.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:20px 12px; color:#666; font-size:13px; text-align:center;';
    empty.textContent = 'គ្មានអ្នកប្រើក្នុងបន្ទប់ទេ';
    userList.appendChild(empty);
    return;
  }
  
  sortedUsers.forEach(function(peerId) {
    const username = userNamesMap[peerId] || 'Unknown';
    const unread = unreadChats[peerId] ? unreadChats[peerId].count : 0;
    const lastMsg = unreadChats[peerId] && unreadChats[peerId].messages.length > 0 
      ? unreadChats[peerId].messages[unreadChats[peerId].messages.length - 1] 
      : '';
    
    const div = document.createElement('div');
    div.className = 'chat-user-item' + (chatTargetPeerId === peerId ? ' active' : '');
    div.dataset.peer = peerId;
    
    div.innerHTML = `
      <div class="user-avatar">${username.charAt(0).toUpperCase()}</div>
      <div class="user-info">
        <div class="user-name">${username}</div>
        <div class="user-last-msg">${lastMsg ? lastMsg.substring(0, 25) + (lastMsg.length > 25 ? '...' : '') : 'ចាប់ផ្ដើមសន្ទនា'}</div>
      </div>
      ${unread > 0 ? `<div class="unread-badge">${unread}</div>` : ''}
    `;
    
    div.onclick = function() {
      showChatMessages(peerId);
    };
    
    userList.appendChild(div);
  });
}

function updateChatBadge() {
  const badge = document.getElementById('chatBadgeCount');
  if (!badge) return;
  
  let totalUnread = 0;
  for (const key in unreadChats) {
    if (unreadChats.hasOwnProperty(key)) {
      totalUnread += unreadChats[key].count;
    }
  }
  
  if (totalUnread > 0) {
    badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function showChatNotification(username, message, peerId) {
  document.querySelectorAll('.chat-notification').forEach(function(el) {
    if (el.dataset.peer === peerId) el.remove();
  });
  
  const notif = document.createElement('div');
  notif.className = 'chat-notification';
  notif.dataset.peer = peerId;
  notif.innerHTML = `
    <button class="close-notif" onclick="event.stopPropagation(); this.parentElement.remove()">✕</button>
    <div class="sender">👤 ${username}</div>
    <div class="msg-preview">${message.length > 50 ? message.substring(0, 50) + '...' : message}</div>
    <div class="time">${new Date().toLocaleTimeString()}</div>
  `;
  
  notif.onclick = function() {
    if (!isChatOpen) toggleChat();
    showChatMessages(peerId);
    this.remove();
    const chatInput = document.getElementById('chatInput');
    if (chatInput) chatInput.focus();
  };
  
  document.body.appendChild(notif);
  
  setTimeout(function() {
    if (notif.parentNode) {
      notif.style.opacity = '0';
      notif.style.transition = 'opacity 0.3s';
      setTimeout(function() { notif.remove(); }, 300);
    }
  }, 10000);
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function showToast(message, type) {
  if (type === undefined) type = 'info';
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#48cae4',
    warning: '#f59e0b'
  };
  
  document.querySelectorAll('.toast').forEach(function(el) { el.remove(); });
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.background = colors[type] || '#48cae4';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(function() { toast.remove(); }, 300);
  }, 4000);
}

// ============================================================
// PEERJS & WEBRTC FUNCTIONS
// ============================================================

function initPeerJS() {
  myPeer = new Peer(undefined, {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    }
  });

  myPeer.on('open', function(id) {
    myId = id;
    console.log('✅ PeerJS Connected with ID:', myId);
    
    if (socket && socketConnected && currentRoomId && myUsername) {
      socket.emit('join-room', {
        roomId: currentRoomId,
        peerId: myId,
        username: myUsername
      });
    }
  });

  myPeer.on('call', function(call) {
    console.log('📞 Incoming call from:', call.peer);
    
    if (localStream) {
      call.answer(localStream);
    } else {
      initDummyStream();
      call.answer(localStream);
    }
    
    call.on('stream', function(remoteStream) {
      console.log('📺 Received remote stream from:', call.peer);
      const type = (call.metadata && call.metadata.type) || 'video';
      const callerUsername = (call.metadata && call.metadata.username) || 'User';
      
      if (type === 'screen') {
        addRemoteScreenVideo(call.peer, remoteStream, callerUsername);
      } else {
        attachRemoteStream(call.peer, remoteStream);
      }
    });

    call.on('close', function() {
      console.log('Call closed with:', call.peer);
      removeRemoteVideo(call.peer);
      removeRemoteScreenVideo(call.peer);
      delete peerCalls[call.peer];
    });

    peerCalls[call.peer] = call;
  });

  myPeer.on('error', function(err) {
    console.error('❌ PeerJS Error:', err);
  });
}

function connectToUser(peerId) {
  if (!myPeer || peerCalls[peerId]) {
    console.log('Already connected or no peer:', peerId);
    return;
  }
  
  if (!localStream) {
    initDummyStream();
  }
  
  console.log('📞 Calling user:', peerId);
  const call = myPeer.call(peerId, localStream, {
    metadata: { type: 'video', username: myUsername }
  });

  call.on('stream', function(remoteStream) {
    console.log('📺 Stream received from:', peerId);
    attachRemoteStream(peerId, remoteStream);
  });

  call.on('close', function() {
    console.log('Call closed with:', peerId);
    removeRemoteVideo(peerId);
    delete peerCalls[peerId];
  });

  peerCalls[peerId] = call;
}

// ============================================================
// MEDIA FUNCTIONS
// ============================================================

function initDummyStream() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(myUsername || 'User', canvas.width / 2, canvas.height / 2);
    dummyAnimFrame = requestAnimationFrame(draw);
  }
  draw();

  const canvasStream = canvas.captureStream(15);
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioContext.createOscillator();
  const dst = audioContext.createMediaStreamDestination();
  osc.connect(dst);
  osc.start();
  const audioTrack = dst.stream.getAudioTracks()[0];
  audioTrack.enabled = false;

  localStream = new MediaStream([canvasStream.getVideoTracks()[0], audioTrack]);
  if (localVideo) localVideo.srcObject = localStream;
}

function addRemoteVideo(peerId, username) {
  if (document.getElementById('video-' + peerId)) return;

  const card = document.createElement('div');
  card.className = 'video-box';
  card.id = 'video-' + peerId;

  card.innerHTML = `
    <div class="name-tag">👤 ${username}</div>
    <video id="stream-${peerId}" autoplay playsinline></video>
  `;
  if (videoGrid) videoGrid.appendChild(card);
}

function attachRemoteStream(peerId, stream) {
  const videoElem = document.getElementById('stream-' + peerId);
  if (videoElem) {
    videoElem.srcObject = stream;
  }
}

function removeRemoteVideo(peerId) {
  const card = document.getElementById('video-' + peerId);
  if (card) card.remove();
}

function addRemoteScreenVideo(peerId, stream, username) {
  removeRemoteScreenVideo(peerId);

  const card = document.createElement('div');
  card.className = 'video-box screen-box';
  card.id = 'screen-' + peerId;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;

  const label = document.createElement('div');
  label.className = 'name-tag';
  label.textContent = '🖥️ Screen: ' + username;

  card.appendChild(video);
  card.appendChild(label);
  if (screenGrid) screenGrid.appendChild(card);
  
  const screenTitle = document.getElementById('screenTitle');
  if (screenTitle) screenTitle.style.display = 'block';
}

function removeRemoteScreenVideo(peerId) {
  const card = document.getElementById('screen-' + peerId);
  if (card) card.remove();
  
  const screenGridElem = document.getElementById('screenGrid');
  const screenTitle = document.getElementById('screenTitle');
  if (screenGridElem && screenGridElem.children.length === 0 && screenTitle) {
    screenTitle.style.display = 'none';
  }
}

function updateUserCount() {
  const countElem = document.getElementById('userCount');
  if (countElem) {
    const totalUsers = Object.keys(userNamesMap).length + 1;
    countElem.textContent = totalUsers;
  }
}

// ============================================================
// MEDIA TOGGLE & SCREEN SHARE
// ============================================================

function toggleMic() {
  if (!localStream) return;
  isMicOn = !isMicOn;
  localStream.getAudioTracks().forEach(track => track.enabled = isMicOn);
  showToast(isMicOn ? '🎤 បានបើក Mic' : '🎙️❌ បានបិទ Mic', 'info');
}

async function toggleCamera() {
  if (isCameraOn) {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    isCameraOn = false;
    initDummyStream();
    showToast('📷 បានបិទកាមេរ៉ា', 'info');
  } else {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      isCameraOn = true;
      if (dummyAnimFrame) cancelAnimationFrame(dummyAnimFrame);
      localStream = cameraStream;
      if (localVideo) localVideo.srcObject = localStream;
      
      Object.keys(peerCalls).forEach(pId => {
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = peerCalls[pId].peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      });
      showToast('📷 បានបើកកាមេរ៉ា', 'success');
    } catch (err) {
      showToast('❌ មិនអាចបើកកាមេរ៉ាបានទេ!', 'error');
    }
  }
}

async function toggleScreenShare() {
  if (isScreenSharing) {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
    }
    isScreenSharing = false;
    showToast('🖥️ បានឈប់ចែករំលែកអេក្រង់', 'info');
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      isScreenSharing = true;
      
      Object.keys(userNamesMap).forEach(peerId => {
        if (peerId !== myId && myPeer) {
          myPeer.call(peerId, screenStream, {
            metadata: { type: 'screen', username: myUsername }
          });
        }
      });
      
      screenStream.getVideoTracks()[0].onended = () => {
        isScreenSharing = false;
        showToast('🖥️ បានឈប់ចែករំលែកអេក្រង់', 'info');
      };
      
      showToast('🖥️ កំពុងចែករំលែកអេក្រង់...', 'success');
    } catch (err) {
      showToast('❌ បោះបង់ការចែករំលែកអេក្រង់!', 'warning');
    }
  }
}

// ============================================================
// REMOTE CONTROL FUNCTIONS
// ============================================================

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
  socket.emit('remote-mouse-move', {
    targetId: remoteControlTarget,
    x: event.clientX,
    y: event.clientY
  });
}

function handleRemoteMouseClick(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  socket.emit('remote-mouse-click', {
    targetId: remoteControlTarget,
    x: event.clientX,
    y: event.clientY
  });
}

function handleRemoteKeyboard(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  socket.emit('remote-keyboard', {
    targetId: remoteControlTarget,
    key: event.key
  });
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
  var clickEffect = document.createElement('div');
  clickEffect.className = 'click-effect';
  clickEffect.style.left = x + 'px';
  clickEffect.style.top = y + 'px';
  document.body.appendChild(clickEffect);
  setTimeout(function() {
    if (clickEffect.parentNode) clickEffect.remove();
  }, 500);
}

function selectRemoteTarget(targetId) {
  fetch('/api/remote-control/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      controllerId: myId,
      targetId: targetId,
      roomId: currentRoomId
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showToast('⏳ កំពុងផ្ញើសំណើ Remote Control...', 'info');
    } else {
      showToast('❌ ' + data.message, 'error');
    }
  });

  const overlay = document.getElementById('remoteOverlay');
  if (overlay) overlay.remove();
}

function showRemoteUserSelector() {
  if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
    alert('អ្នកគ្មានសិទ្ធិប្រើ Remote Control!');
    return;
  }
  
  var overlay = document.createElement('div');
  overlay.id = 'remoteOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8);
    z-index: 99998;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  var modal = document.createElement('div');
  modal.style.cssText = `
    background: #1c2541;
    border-radius: 15px;
    padding: 30px;
    max-width: 400px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  `;
  
  var usersHtml = '<h3 style="color:#48cae4; margin-bottom:20px;">🖥️ ជ្រើសរើសអ្នកប្រើសម្រាប់ Remote</h3>';
  var users = [];
  for (var key in userNamesMap) {
    if (userNamesMap.hasOwnProperty(key) && key !== myId) {
      users.push({ id: key, name: userNamesMap[key] });
    }
  }
  
  if (users.length === 0) {
    usersHtml += '<p style="color:#94a3b8;">គ្មានអ្នកប្រើផ្សេងទៀតក្នុងបន្ទប់ទេ!</p>';
  } else {
    users.forEach(function(user) {
      usersHtml += `
        <button onclick="selectRemoteTarget('${user.id}')" style="
          display:block; width:100%; padding:12px 15px;
          margin:8px 0; background:#0b132b; border:1px solid #334155;
          border-radius:8px; color:white; cursor:pointer;
          text-align:left; font-size:14px;
          transition: all 0.2s;
        " onmouseover="this.style.borderColor='#48cae4'" onmouseout="this.style.borderColor='#334155'">
          👤 ${user.name}
        </button>
      `;
    });
  }
  
  usersHtml += `
    <button onclick="document.getElementById('remoteOverlay').remove()" style="
      display:block; width:100%; padding:10px; margin-top:15px;
      background:#ef4444; border:none; border-radius:8px;
      color:white; cursor:pointer; font-weight:bold;
    ">បិទ</button>
  `;

  modal.innerHTML = usersHtml;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
