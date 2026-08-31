// ============================================================
// SOCKET.IO CONNECTION
// ============================================================
let socket = null;
let socketConnected = false;
let connectionAttempts = 0;
let peerInitialized = false;

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

// Tracks which peers we've already sent our screen-share stream to, so the
// mesh health-check can top up anyone who's missing it.
let screenShareSentTo = {};
let meshCheckTimer = null;

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
let remoteControllerId = null; // ✅ NEW: who is currently controlling ME, so I can revoke it
let remotePointer = null;

// ============================================================
// TURN SERVERS - FREE
// ============================================================
const ICE_SERVERS = [
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
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: 'f8f65afd73bf8de153cc',
    credential: 'xWJ/zYt5iBaD8zY7'
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: 'f8f65afd73bf8de153cc',
    credential: 'xWJ/zYt5iBaD8zY7'
  }
];

// ============================================================
// SOCKET CONNECTION FUNCTION
// ============================================================
function connectSocket() {
  socket = io({
    transports: ['polling'],
    upgrade: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 30000,
    forceNew: true,
    path: '/socket.io'
  });

  socket.on('connect_error', function(error) {
    console.log('❌ Socket.IO connection error:', error);
    connectionAttempts++;
    
    if (connectionAttempts > 5) {
      showToast('⚠️ កំពុងព្យាយាមភ្ជាប់ Server ឡើងវិញ...', 'warning');
    }
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
    
    if (reason === 'io server disconnect' || reason === 'transport error') {
      setTimeout(function() {
        if (socket) {
          socket.connect();
        }
      }, 3000);
    }
  });

  socket.on('reconnect', function(attemptNumber) {
    console.log('🔄 Socket.IO reconnected after', attemptNumber, 'attempts');
    socketConnected = true;
    showToast('✅ Reconnected to server!', 'success');
    
    if (myId && currentRoomId && myUsername) {
      socket.emit('join-room', {
        roomId: currentRoomId,
        peerId: myId,
        username: myUsername
      });
    }
  });

  // ========== Socket Events ==========
  socket.on('connection_ack', function(data) {
    console.log('✅ Connection acknowledged:', data);
  });

  socket.on('room-joined', function(data) {
    console.log('🏠 Joined room:', data.roomId);
    // 🔍 DIAGNOSTIC: this is exactly what the SERVER told us about who's
    // already in the room. If someone (e.g. User 2) is missing from this
    // array, the bug is on the server side (the join-room handler /
    // room membership tracking) — this client has no way to know about a
    // user that was never listed here in the first place.
    console.log('🔍 [DIAGNOSTIC] existingUsers from server:', JSON.stringify(data.existingUsers));
    if (data.existingUsers) {
      data.existingUsers.forEach(function(user) {
        if (user.peerId !== myId) {
          userNamesMap[user.peerId] = user.username;
          addRemoteVideo(user.peerId, user.username);
          // ✅ FIX: The NEW joiner is the ONLY side that initiates the call
          // to each existing user. PeerJS calls are already bidirectional
          // (call.answer() sends media back on the SAME connection), so the
          // existing user does NOT need to call back — see 'user-joined' below.
          setTimeout(function() {
            connectToUser(user.peerId);
          }, 500);
        }
      });
      updateUserCount();
      updateChatUserList();
    }
    console.log('🔍 [DIAGNOSTIC] userNamesMap after room-joined:', JSON.stringify(userNamesMap));
  });

  socket.on('user-joined', function(data) {
    console.log('👤 User joined:', data.username, '| peerId:', data.peerId);
    console.log('🔍 [DIAGNOSTIC] full user-joined payload:', JSON.stringify(data));
    var peerId = data.peerId;
    var username = data.username;
    
    if (peerId !== myId) {
      userNamesMap[peerId] = username;
      addRemoteVideo(peerId, username);
      updateUserCount();
      updateChatUserList();
      playNotificationSound('join');
      
      // ✅ FIX: Do NOT call connectToUser() here anymore.
      // The new joiner already calls US (see 'room-joined' handler on their
      // side). If both sides call each other, TWO separate PeerJS calls get
      // created for the same pair of peers, and peerCalls[peerId] can only
      // hold one of them — the other becomes "orphaned": its media keeps
      // flowing on a live connection, but updateStreamToAllPeers() (used by
      // toggleCamera/toggleMic) can no longer find it to replaceTrack().
      // That's exactly why a late joiner's camera never reached admin until
      // admin left and rejoined (which reset everything to a single call).
      // We simply wait for their incoming call and answer it below in
      // myPeer.on('call', ...).

      if (isScreenSharing && screenStream && myPeer) {
        setTimeout(function() {
          const call = myPeer.call(peerId, screenStream, {
            metadata: { type: 'screen', username: myUsername }
          });
          attachIceDiagnostics(call, peerId, 'screen (outgoing, late-join)');
          screenShareSentTo[peerId] = true;
        }, 1000);
      }
    }
  });

  socket.on('user-left', function(data) {
    console.log('👤 User left:', data);
    var peerId = data.peerId;
    
    removeRemoteVideo(peerId);
    removeRemoteScreenVideo(peerId);
    
    if (peerCalls[peerId]) {
      peerCalls[peerId].close();
      delete peerCalls[peerId];
    }
    
    delete userNamesMap[peerId];
    delete screenShareSentTo[peerId];
    updateUserCount();
    updateChatUserList();
    playNotificationSound('leave');
  });

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

  socket.on('rooms-update', function() {
    console.log('🔄 Rooms update received');
    if ((currentUserRole === 'admin' || currentUserRole === 'supervisor') && 
        document.getElementById('admin-dashboard') &&
        !document.getElementById('admin-dashboard').classList.contains('hidden')) {
      loadAdminRoomMonitor();
    }
  });

  socket.on('play-sound', function(type) {
    playNotificationSound(type);
  });

  socket.on('receive-otp', function(data) {
    alert('🚨 ព្រមាន៖ មានគេកំពុងព្យាយាម Login ចូលគណនីរបស់អ្នកពីឧបករណ៍ផ្សេង!\n\n🔐 នេះជាលេខកូដ 2FA របស់អ្នក៖ 【 ' + data.otp + ' 】');
  });

  socket.on('admin-alert', function(data) {
    if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
      alert('🚨 សេចក្តីប្រកាសអាសន្នសុវត្ថិភាព!\n\nUser ឈ្មោះ "' + data.username + '" កំពុង Login លើឧបករណ៍ចំនួន ' + data.count + ' ក្នុងពេលតែមួយ!');
    }
  });

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
        remoteControllerId = data.controllerId; // ✅ NEW: remember who, so we can revoke later
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
      showToast('🛑 Remote Control បានបញ្ចប់', 'info');
    }
    if (data.targetId === myId) {
      isBeingControlled = false;
      remoteControllerId = null; // ✅ NEW
      if (remotePointer) {
        remotePointer.remove();
        remotePointer = null;
      }
      showToast('🛑 Remote Control បានបញ្ចប់', 'info');
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
  
  userList.style.display = 'block';
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
  
  userList.style.display = 'none';
  
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
// MEDIA LIGHTBOX (click camera/screen video to enlarge)
// ============================================================

function injectLightboxStyles() {
  if (document.getElementById('mediaLightboxStyles')) return;
  const style = document.createElement('style');
  style.id = 'mediaLightboxStyles';
  style.textContent = `
    .zoomable-video { cursor: zoom-in; transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .zoomable-video:hover { transform: scale(1.015); box-shadow: 0 0 0 2px #48cae4; }
    #mediaLightboxOverlay { animation: mediaLightboxFadeIn 0.15s ease; }
    @keyframes mediaLightboxFadeIn { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
}

function ensureLightbox() {
  injectLightboxStyles();
  if (document.getElementById('mediaLightboxOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'mediaLightboxOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.92);
    display: none; z-index: 999999; justify-content: center; align-items: center;
    flex-direction: column; padding: 24px; box-sizing: border-box;
  `;
  overlay.innerHTML = `
    <div id="mediaLightboxLabel" style="color:#fff; font-size:16px; margin-bottom:14px; font-weight:600; text-align:center;"></div>
    <video id="mediaLightboxVideo" autoplay playsinline style="max-width:95vw; max-height:80vh; border-radius:12px; background:#000; box-shadow:0 10px 40px rgba(0,0,0,0.6);"></video>
    <button id="mediaLightboxClose" title="បិទ" style="
      position:absolute; top:20px; right:20px; width:44px; height:44px;
      border-radius:50%; border:none; background:rgba(255,255,255,0.15);
      color:#fff; font-size:20px; cursor:pointer; line-height:1;
    ">✕</button>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeLightbox();
  });
  document.getElementById('mediaLightboxClose').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeLightbox();
  });
}

function openLightbox(sourceVideoElem, label) {
  if (!sourceVideoElem || !sourceVideoElem.srcObject) {
    showToast('វីដេអូនេះមិនទាន់មានទេ!', 'warning');
    return;
  }
  ensureLightbox();
  const overlay = document.getElementById('mediaLightboxOverlay');
  const video = document.getElementById('mediaLightboxVideo');
  const labelElem = document.getElementById('mediaLightboxLabel');

  video.srcObject = sourceVideoElem.srcObject;
  video.muted = sourceVideoElem.muted;
  labelElem.textContent = label || '';
  overlay.style.display = 'flex';

  const playPromise = video.play();
  if (playPromise && playPromise.catch) {
    playPromise.catch(function() {});
  }
}

function closeLightbox() {
  const overlay = document.getElementById('mediaLightboxOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  const video = document.getElementById('mediaLightboxVideo');
  if (video) video.srcObject = null;
}

// Makes a <video> element clickable to open it enlarged in the lightbox.
function makeZoomable(videoElem, labelText) {
  if (!videoElem || videoElem.dataset.zoomBound === '1') return;
  videoElem.classList.add('zoomable-video');
  videoElem.title = 'ចុចដើម្បីពង្រីក';
  videoElem.addEventListener('click', function() {
    openLightbox(videoElem, labelText);
  });
  videoElem.dataset.zoomBound = '1';
}

// ============================================================
// PEERJS & WEBRTC FUNCTIONS
// ============================================================

function attachIceDiagnostics(call, peerId, label) {
  if (!call || !call.peerConnection) return;
  call.peerConnection.oniceconnectionstatechange = function() {
    const state = call.peerConnection.iceConnectionState;
    console.log(`🧊 [${label}] ICE state with ${peerId}:`, state);
    if (state === 'failed') {
      console.log(`❌ [${label}] ICE FAILED with ${peerId}`);
      showToast('⚠️ ការតភ្ជាប់ជាមួយអ្នកប្រើម្នាក់មានបញ្ហា (Network)', 'warning');
    }
  };
}

// ============================================================
// UPDATE STREAM TO ALL PEERS - FIXED
// ============================================================
function updateStreamToAllPeers(stream) {
  if (!stream) return;
  
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];
  
  Object.keys(peerCalls).forEach(peerId => {
    const call = peerCalls[peerId];
    if (call && call.peerConnection) {
      const senders = call.peerConnection.getSenders();

      // ✅ FIX: previously only the VIDEO sender's track was ever replaced.
      // The AUDIO sender kept sending the original dummy stream's disabled
      // (silent) oscillator track forever — even after the camera/mic
      // stream replaced localStream — so nobody could ever hear you talk
      // once you switched from the dummy stream to your real camera+mic.
      // Both tracks must be replaced together whenever localStream changes.
      if (videoTrack) {
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(videoTrack);
          console.log(`✅ Updated video track for peer: ${peerId}`);
        } else {
          console.log(`⚠️ No video sender found for peer ${peerId}`);
        }
      }

      if (audioTrack) {
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
        if (audioSender) {
          audioSender.replaceTrack(audioTrack);
          console.log(`✅ Updated audio track for peer: ${peerId}`);
        } else {
          console.log(`⚠️ No audio sender found for peer ${peerId}`);
        }
      }
    }
  });
}

// ============================================================
// INIT PEERJS
// ============================================================
function initPeerJS() {
  if (peerInitialized) {
    console.log('⚠️ PeerJS already initialized');
    return;
  }

  try {
    console.log('🔄 Initializing PeerJS with TURN servers...');
    
    const isSecure = window.location.protocol === 'https:';
    const hostname = window.location.hostname;
    const port = isSecure ? 443 : (window.location.port || 80);
    
    myPeer = new Peer(undefined, {
      host: hostname,
      port: port,
      path: '/peerjs',
      secure: isSecure,
      debug: 2,
      config: {
        iceServers: ICE_SERVERS,
        iceTransportPolicy: 'all'
      }
    });

    peerInitialized = true;

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
      console.log('📞 Incoming call from:', call.peer, 'metadata:', call.metadata);
      
      if (!localStream) {
        initDummyStream();
      }
      
      // ✅ FIX: Answer with current localStream
      call.answer(localStream);

      const type = (call.metadata && call.metadata.type) || 'video';
      attachIceDiagnostics(call, call.peer, type === 'screen' ? 'screen (incoming)' : 'video (incoming)');
      
      call.on('stream', function(remoteStream) {
        console.log('📺 Received remote stream from:', call.peer, 'type:', type);
        const callerUsername = (call.metadata && call.metadata.username) || 'User';
        
        if (type === 'screen') {
          addRemoteScreenVideo(call.peer, remoteStream, callerUsername);
        } else {
          attachRemoteStream(call.peer, remoteStream);
        }
      });

      call.on('error', function(err) {
        console.log('❌ Call error with', call.peer, err);
      });

      call.on('close', function() {
        console.log('Call closed with:', call.peer);
        removeRemoteVideo(call.peer);
        removeRemoteScreenVideo(call.peer);
        delete peerCalls[call.peer];
      });

      // ✅ FIX: Only track this call in peerCalls if it's a regular video
      // call (not a screen-share call), and only if we don't already have
      // an outgoing call tracked for this peer. This prevents an incoming
      // call from silently overwriting — or being silently discarded by —
      // an existing outgoing call to the same peer, which was the root
      // cause of camera updates not reaching some participants.
      if (type !== 'screen') {
        if (!peerCalls[call.peer]) {
          peerCalls[call.peer] = call;
        } else {
          console.log(`⚠️ Duplicate call detected for ${call.peer} — keeping existing tracked call, this incoming call still answers normally but is not tracked for track-replacement.`);
        }
      }
    });

    myPeer.on('error', function(err) {
      console.error('❌ PeerJS Error:', err);
    });

    myPeer.on('disconnected', function() {
      console.log('🔌 PeerJS disconnected');
      if (myPeer && !myPeer.destroyed) {
        setTimeout(function() {
          if (myPeer && !myPeer.destroyed) {
            myPeer.reconnect();
          }
        }, 3000);
      }
    });

  } catch (error) {
    console.error('❌ Failed to initialize PeerJS:', error);
    showToast('❌ មិនអាចភ្ជាប់ Peer Server បានទេ!', 'error');
  }
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

  attachIceDiagnostics(call, peerId, 'video (outgoing)');

  call.on('stream', function(remoteStream) {
    console.log('📺 Stream received from:', peerId);
    attachRemoteStream(peerId, remoteStream);
  });

  call.on('error', function(err) {
    console.log('❌ Call error with', peerId, err);
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

  const newStream = new MediaStream([canvasStream.getVideoTracks()[0], audioTrack]);
  
  if (localStream) {
    localStream = newStream;
    if (localVideo) localVideo.srcObject = localStream;
    updateStreamToAllPeers(localStream);
  } else {
    localStream = newStream;
    if (localVideo) localVideo.srcObject = localStream;
  }
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

  const videoElem = document.getElementById('stream-' + peerId);
  makeZoomable(videoElem, '👤 ' + username);
}

function attachRemoteStream(peerId, stream) {
  const videoElem = document.getElementById('stream-' + peerId);
  if (videoElem) {
    videoElem.srcObject = stream;
    const playPromise = videoElem.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(function(err) {
        console.log('⚠️ Remote video play blocked, will retry on user interaction:', err);
      });
    }
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
  video.muted = true;
  video.srcObject = stream;

  const playPromise = video.play();
  if (playPromise && playPromise.catch) {
    playPromise.catch(function(err) {
      console.log('⚠️ Screen video play blocked:', err);
    });
  }

  const label = document.createElement('div');
  label.className = 'name-tag';
  label.textContent = '🖥️ Screen: ' + username;

  makeZoomable(video, '🖥️ Screen: ' + username);

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
// MEDIA TOGGLE & SCREEN SHARE - FIXED
// ============================================================

function toggleMic() {
  if (!localStream) return;
  isMicOn = !isMicOn;

  // Mute/unmute on the current localStream (keeps things consistent for
  // any future replaceTrack() call, e.g. when toggling the camera).
  localStream.getAudioTracks().forEach(track => track.enabled = isMicOn);

  // ✅ FIX: Previously ONLY localStream's track was toggled. That works
  // only if the track object on localStream is the exact same object
  // object currently attached to each peer connection's audio sender.
  // If they ever drift apart (e.g. a connection whose track wasn't
  // re-synced), muting locally had no effect on what others actually
  // heard. To guarantee mute always works, we now also grab whatever
  // track each RTCRtpSender is ACTUALLY sending right now and toggle
  // .enabled on that directly — this is what really controls whether
  // silence goes out over the connection.
  Object.keys(peerCalls).forEach(peerId => {
    const call = peerCalls[peerId];
    if (call && call.peerConnection) {
      const senders = call.peerConnection.getSenders();
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
      if (audioSender && audioSender.track) {
        audioSender.track.enabled = isMicOn;
      }
    }
  });

  showToast(isMicOn ? '🎤 បានបើក Mic' : '🎙️❌ បានបិទ Mic', 'info');
}

async function toggleCamera() {
  if (isCameraOn) {
    // ====== បិទកាមេរ៉ា ======
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    isCameraOn = false;
    
    if (dummyAnimFrame) cancelAnimationFrame(dummyAnimFrame);
    initDummyStream();
    
    showToast('📷 បានបិទកាមេរ៉ា', 'info');
    
  } else {
    // ====== បើកកាមេរ៉ា ======
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 }
        }, 
        audio: true 
      });

      // ✅ FIX: keep the mic mute state consistent — getUserMedia() always
      // returns tracks with enabled = true by default, which would silently
      // "unmute" someone who had muted while still on the dummy stream.
      cameraStream.getAudioTracks().forEach(track => track.enabled = isMicOn);
      
      isCameraOn = true;
      if (dummyAnimFrame) cancelAnimationFrame(dummyAnimFrame);
      
      // ប្តូរ localStream ទៅជា cameraStream
      localStream = cameraStream;
      if (localVideo) localVideo.srcObject = localStream;
      
      // ✅ FIX: បញ្ជូន Camera Stream ទៅអ្នកប្រើទាំងអស់
      updateStreamToAllPeers(localStream);
      
      showToast('📷 បានបើកកាមេរ៉ា', 'success');
      
    } catch (err) {
      console.error('❌ Camera error:', err);
      showToast('❌ មិនអាចបើកកាមេរ៉ាបានទេ!', 'error');
      if (!localStream) initDummyStream();
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
    screenShareSentTo = {};
    showToast('🖥️ បានឈប់ចែករំលែកអេក្រង់', 'info');
    const screenGridElem = document.getElementById('screenGrid');
    if (screenGridElem) screenGridElem.innerHTML = '';
    const screenTitle = document.getElementById('screenTitle');
    if (screenTitle) screenTitle.style.display = 'none';
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      isScreenSharing = true;
      screenShareSentTo = {};
      
      Object.keys(userNamesMap).forEach(peerId => {
        if (peerId !== myId && myPeer) {
          const call = myPeer.call(peerId, screenStream, {
            metadata: { type: 'screen', username: myUsername }
          });
          attachIceDiagnostics(call, peerId, 'screen (outgoing)');
          screenShareSentTo[peerId] = true;
          // Note: screen-share calls are intentionally NOT stored in
          // peerCalls, since that map is reserved for the video calls that
          // updateStreamToAllPeers()/toggleCamera() operate on.
        }
      });
      
      const screenTitle = document.getElementById('screenTitle');
      if (screenTitle) screenTitle.style.display = 'block';
      
      const existingLocalScreen = document.getElementById('local-screen');
      if (existingLocalScreen) existingLocalScreen.remove();
      
      const localScreenCard = document.createElement('div');
      localScreenCard.className = 'video-box screen-box';
      localScreenCard.id = 'local-screen';
      
      const localScreenVideo = document.createElement('video');
      localScreenVideo.autoplay = true;
      localScreenVideo.playsInline = true;
      localScreenVideo.muted = true;
      localScreenVideo.srcObject = screenStream;
      
      const label = document.createElement('div');
      label.className = 'name-tag';
      label.textContent = '🖥️ Screen: ' + myUsername + ' (អ្នក)';
      
      makeZoomable(localScreenVideo, '🖥️ Screen: ' + myUsername + ' (អ្នក)');

      localScreenCard.appendChild(localScreenVideo);
      localScreenCard.appendChild(label);
      
      const screenGridElem = document.getElementById('screenGrid');
      if (screenGridElem) screenGridElem.appendChild(localScreenCard);
      
      screenStream.getVideoTracks()[0].onended = () => {
        toggleScreenShare();
      };
      
      showToast('🖥️ កំពុងចែករំលែកអេក្រង់...', 'success');
    } catch (err) {
      showToast('❌ បោះបង់ការចែករំលែកអេក្រង់!', 'warning');
    }
  }

  updateScreenShareButtonUI();
}

// ============================================================
// MESH HEALTH CHECK — self-heals missing connections
// ============================================================
// Every few seconds, make sure we have a working video call AND (if we're
// screen-sharing) a screen-share call with every user currently in the
// room, no matter when they joined. If any pair is missing — e.g. because
// a signal was dropped, or a server-side race meant an existingUsers list
// didn't include everyone — this quietly retries the connection instead of
// leaving that participant permanently invisible to some other user until
// someone reloads.
function startMeshHealthCheck() {
  if (meshCheckTimer) return;
  meshCheckTimer = setInterval(function() {
    if (!myPeer || !socketConnected) return;

    Object.keys(userNamesMap).forEach(function(peerId) {
      if (peerId === myId) return;

      // --- Camera / mic video call ---
      const call = peerCalls[peerId];
      const isHealthy = call && call.peerConnection && (
        call.peerConnection.connectionState === 'connected' ||
        call.peerConnection.iceConnectionState === 'connected' ||
        call.peerConnection.iceConnectionState === 'completed'
      );
      if (!isHealthy) {
        console.log(`🔧 Mesh check: no healthy video call with ${peerId} (${userNamesMap[peerId]}) — retrying`);
        if (call) {
          try { call.close(); } catch (e) {}
          delete peerCalls[peerId];
        }
        connectToUser(peerId);
      }

      // --- Screen share (only if we're currently sharing) ---
      if (isScreenSharing && screenStream && myPeer && !screenShareSentTo[peerId]) {
        console.log(`🔧 Mesh check: ${peerId} (${userNamesMap[peerId]}) is missing our screen share — sending`);
        const screenCall = myPeer.call(peerId, screenStream, {
          metadata: { type: 'screen', username: myUsername }
        });
        attachIceDiagnostics(screenCall, peerId, 'screen (outgoing, mesh-heal)');
        screenShareSentTo[peerId] = true;
      }
    });
  }, 4000);
}

function stopMeshHealthCheck() {
  if (meshCheckTimer) {
    clearInterval(meshCheckTimer);
    meshCheckTimer = null;
  }
}

// ============================================================
// SCREEN SHARE BUTTON UI (toggle label: Share <-> Stop Sharing)
// ============================================================
function updateScreenShareButtonUI() {
  // Works regardless of the button's id — finds it by its onclick attribute,
  // matching the inline onclick="toggleScreenShare()" pattern used elsewhere
  // in this app (e.g. onclick="adminJoinRoom(...)").
  const btn = document.querySelector('[onclick*="toggleScreenShare"]');
  if (!btn) {
    console.log('⚠️ Share-screen button not found (no element with onclick="toggleScreenShare()")');
    return;
  }

  if (!btn.dataset.origHtml) {
    btn.dataset.origHtml = btn.innerHTML;
  }

  if (isScreenSharing) {
    btn.innerHTML = '⏹️ បិទ Share Screen';
    // !important + setProperty guarantees this beats any CSS class the
    // button already has (e.g. btn-success), so it reliably turns red.
    btn.style.setProperty('background', '#ef4444', 'important');
    btn.style.setProperty('background-color', '#ef4444', 'important');
    btn.style.setProperty('color', '#fff', 'important');
    btn.classList.add('sharing-active');
  } else {
    btn.innerHTML = btn.dataset.origHtml;
    // Fully remove our inline overrides so the button falls back to
    // whatever its original CSS class/stylesheet defines.
    btn.style.removeProperty('background');
    btn.style.removeProperty('background-color');
    btn.style.removeProperty('color');
    btn.classList.remove('sharing-active');
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

// ✅ NEW: lets EITHER side end an active remote-control session —
// the controller can stop controlling, or the person being controlled
// can revoke access at any time (like AnyDesk's "stop sharing" / "X").
function endRemoteControl() {
  if (isRemoteControlActive && remoteControlTarget) {
    socket.emit('remote-control-end', { controllerId: myId, targetId: remoteControlTarget });
    isRemoteControlActive = false;
    stopRemoteControl();
    remoteControlTarget = null;
    showToast('🛑 អ្នកបានបញ្ឈប់ការបញ្ជាពីចម្ងាយ', 'info');
  } else if (isBeingControlled && remoteControllerId) {
    socket.emit('remote-control-end', { controllerId: remoteControllerId, targetId: myId });
    isBeingControlled = false;
    remoteControllerId = null;
    if (remotePointer) {
      remotePointer.remove();
      remotePointer = null;
    }
    showToast('🛑 អ្នកបានដកហូតសិទ្ធិបញ្ជាពីចម្ងាយ', 'info');
  } else {
    showToast('គ្មាន Remote Control កំពុងដំណើរការទេ', 'info');
  }
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

function showRemoteUserSelector() {
  if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
    alert('អ្នកគ្មានសិទ្ធិប្រើ Remote Control!');
    return;
  }
  
  var overlay = document.createElement('div');
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
    <button onclick="this.closest('div[style*=\"z-index: 99998\"]').remove()" style="
      display:block; width:100%; padding:10px; margin-top:15px;
      background:#ef4444; border:none; border-radius:8px;
      color:white; cursor:pointer; font-weight:bold;
    ">បិទ</button>
  `;
  
  modal.innerHTML = usersHtml;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  overlay.onclick = function(e) {
    if (e.target === overlay) overlay.remove();
  };
}

function selectRemoteTarget(targetId) {
  var selector = document.querySelector('div[style*="z-index: 99998"]');
  if (selector) selector.remove();
  
  if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
    alert('អ្នកគ្មានសិទ្ធិប្រើ Remote Control!');
    return;
  }
  
  fetch('/api/remote-control/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      controllerId: myId,
      targetId: targetId,
      roomId: currentRoomId
    })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      alert('កំពុងផ្ញើសំណើរ Remote Control... សូមរង់ចាំការអនុញ្ញាត!');
      remoteControlRequestId = data.requestId;
    } else {
      alert('មិនអាចផ្ញើសំណើរបានទេ: ' + data.message);
    }
  });
}

// ============================================================
// AUTHENTICATION & LOGIN MANAGEMENT
// ============================================================

async function login() {
  var username = document.getElementById('username').value.trim();
  var password = document.getElementById('password').value.trim();
  var roomId = document.getElementById('roomSelect').value;

  if (!username || !password) {
    return showToast('សូមបំពេញ Username និង Password!', 'error');
  }

  pendingLoginData = { username: username, password: password, roomId: roomId };

  try {
    var res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingLoginData)
    });
    var data = await res.json();

    if (data.requires2FA) {
      showToast(data.message, 'warning');
      document.getElementById('otp-modal').classList.remove('hidden');
      return;
    }

    if (!data.success) {
      return showToast(data.message, 'error');
    }

    finalizeLogin(data);
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការ Login!', 'error');
  }
}

async function verify2FA() {
  var otp = document.getElementById('otpInput').value.trim();
  if (!otp) return showToast('សូមវាយបញ្ចូលលេខកូដ!', 'error');

  try {
    var res = await fetch('/api/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: pendingLoginData.username,
        password: pendingLoginData.password,
        otp: otp
      })
    });
    var data = await res.json();

    if (!data.success) return showToast(data.message, 'error');

    document.getElementById('otp-modal').classList.add('hidden');
    finalizeLogin(data);
  } catch (err) {
    showToast('លេខកូដមិនត្រឹមត្រូវទេ!', 'error');
  }
}

function cancel2FA() {
  document.getElementById('otp-modal').classList.add('hidden');
  pendingLoginData = null;
}

function finalizeLogin(data) {
  myUsername = data.user.username;
  currentUserRole = data.user.role;
  currentRoomId = (pendingLoginData && pendingLoginData.roomId) ? pendingLoginData.roomId : document.getElementById('roomSelect').value;

  const mainBody = document.getElementById('mainBody');
  if (mainBody) {
    mainBody.style.justifyContent = 'flex-start';
    mainBody.style.alignItems = 'stretch';
  }

  const authCard = document.getElementById('auth');
  if (authCard) authCard.classList.add('hidden');

  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    const adminDash = document.getElementById('admin-dashboard');
    if (adminDash) adminDash.classList.remove('hidden');
    const adminRoleDisplay = document.getElementById('adminRoleDisplay');
    if (adminRoleDisplay) adminRoleDisplay.textContent = currentUserRole.toUpperCase();
    switchAdminTab('rooms');
  } else {
    startMeeting();
  }
  showToast('✅ ចូលប្រើប្រាស់បានជោគជ័យ!', 'success');
}

// ============================================================
// MEETING ROOM & LEAVE ROOM MANAGEMENT
// ============================================================

function startMeeting() {
  const mainBody = document.getElementById('mainBody');
  if (mainBody) {
    mainBody.style.justifyContent = 'flex-start';
    mainBody.style.alignItems = 'stretch';
  }

  const roomContainer = document.getElementById('room-container');
  if (roomContainer) {
    roomContainer.classList.remove('hidden');
    roomContainer.style.display = 'flex';
  }

  const welcomeText = document.getElementById('welcome-text');
  if (welcomeText) {
    welcomeText.textContent = `👋 សួស្តី ${myUsername || 'Admin'}! កំពុងស្ថិតក្នុងបន្ទប់៖ ${currentRoomId}`;
  }

  initDummyStream();
  initPeerJS();
  startMeshHealthCheck();
}

function leaveRoom() {
  if (!confirm('តើអ្នកប្រាកដជាចង់ចាកចេញពីបន្ទប់នេះទេ?')) return;

  stopMeshHealthCheck();
  stopRemoteControl(); // ✅ NEW: stop listening for remote-control input on the way out
  isRemoteControlActive = false;
  isBeingControlled = false;
  remoteControlTarget = null;
  remoteControllerId = null;
  if (remotePointer) {
    remotePointer.remove();
    remotePointer = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  if (peerCalls) {
    Object.keys(peerCalls).forEach(pId => {
      if (peerCalls[pId]) peerCalls[pId].close();
    });
  }
  if (myPeer) {
    myPeer.destroy();
    myPeer = null;
    peerInitialized = false;
  }

  if (socket && socketConnected) {
    socket.emit('leave-room', { roomId: currentRoomId, peerId: myId });
  }

  const roomContainer = document.getElementById('room-container');
  if (roomContainer) {
    roomContainer.classList.add('hidden');
    roomContainer.style.display = 'none';
  }

  const chatPanel = document.getElementById('chat-panel');
  if (chatPanel) chatPanel.classList.add('hidden');

  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    const adminDash = document.getElementById('admin-dashboard');
    if (adminDash) adminDash.classList.remove('hidden');
    switchAdminTab('rooms');
    showToast('🚪 បានចាកចេញមកកាន់ Dashboard!', 'warning');
  } else {
    location.reload();
  }
}

function leaveMeeting() {
  leaveRoom();
}

async function changeMyPassword() {
  const oldPassword = prompt('សូមបញ្ចូល Password ចាស់របស់អ្នក៖');
  if (oldPassword === null) return;

  const newPassword = prompt('សូមបញ្ចូល Password ថ្មី៖');
  if (newPassword === null) return;

  if (!oldPassword.trim() || !newPassword.trim()) {
    return showToast('សូមបំពេញ Password ឱ្យបានត្រឹមត្រូវ!', 'error');
  }

  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: myUsername,
        oldPassword: oldPassword,
        newPassword: newPassword
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast('✅ ប្តូរ Password បានជោគជ័យ!', 'success');
    } else {
      showToast(data.message || '❌ ប្តូរ Password មិនបានសម្រេច!', 'error');
    }
  } catch (err) {
    showToast('❌ មានបញ្ហាក្នុងការភ្ជាប់ទៅ Server!', 'error');
  }
}

// ============================================================
// ADMIN FUNCTIONS & MANAGEMENT
// ============================================================

function adminJoinRoom(roomId) {
  currentRoomId = roomId;
  const adminDash = document.getElementById('admin-dashboard');
  if (adminDash) adminDash.classList.add('hidden');
  startMeeting();
}

function logoutAdmin() {
  if (confirm('តើអ្នកប្រាកដថាចង់ចាកចេញពីប្រព័ន្ធ (Logout) ទេ?')) {
    location.reload();
  }
}

function adminLogout() {
  logoutAdmin();
}

function switchAdminTab(tab) {
  console.log('🔄 Switching to tab:', tab);
  
  var panes = document.querySelectorAll('.tab-pane');
  panes.forEach(function(el) {
    el.classList.add('hidden');
    el.style.display = 'none';
  });
  
  var buttons = document.querySelectorAll('.nav-tabs button');
  buttons.forEach(function(el) {
    el.classList.remove('active');
  });

  if (tab === 'rooms') {
    var tabRooms = document.getElementById('tab-rooms');
    if (tabRooms) {
      tabRooms.classList.remove('hidden');
      tabRooms.style.display = 'block';
    }
    var tabBtnRooms = document.getElementById('tabBtnRooms');
    if (tabBtnRooms) tabBtnRooms.classList.add('active');
    loadAdminRoomMonitor();
    
  } else if (tab === 'users') {
    var tabUsers = document.getElementById('tab-users');
    if (tabUsers) {
      tabUsers.classList.remove('hidden');
      tabUsers.style.display = 'block';
    }
    var tabBtnUsers = document.getElementById('tabBtnUsers');
    if (tabBtnUsers) tabBtnUsers.classList.add('active');
    loadUsersTable();
    
  } else if (tab === 'newRoom') {
    var tabNewRoom = document.getElementById('tab-newRoom');
    if (tabNewRoom) {
      tabNewRoom.classList.remove('hidden');
      tabNewRoom.style.display = 'block';
    }
    var tabBtnNewRoom = document.getElementById('tabBtnNewRoom');
    if (tabBtnNewRoom) tabBtnNewRoom.classList.add('active');
  }
}

async function loadRooms() {
  try {
    var res = await fetch('/api/rooms');
    var data = await res.json();
    allRoomsList = data.rooms;
    var select = document.getElementById('roomSelect');
    if (select) {
      select.innerHTML = '';
      data.rooms.forEach(function(r) {
        select.innerHTML += '<option value="' + r + '">' + r + '</option>';
      });
    }
    var userRoomSelect = document.getElementById('userAssignedRoomSelect');
    if (userRoomSelect) {
      userRoomSelect.innerHTML = '';
      data.rooms.forEach(function(r) {
        userRoomSelect.innerHTML += '<option value="' + r + '">' + r + '</option>';
      });
    }
  } catch (err) {}
}

async function loadAdminRoomMonitor() {
  try {
    var res = await fetch('/api/rooms-status');
    var data = await res.json();
    var container = document.getElementById('activeRoomsList');
    if (!container) return;
    container.innerHTML = '';

    data.rooms.forEach(function(room) {
      var isLive = room.userCount > 0;
      container.innerHTML += `
        <div class="room-card ${isLive ? 'live' : ''}">
          <h4>បន្ទប់: ${room.roomId}</h4>
          <p style="font-size:13px; margin: 8px 0; color: #cbd5e1;">${isLive ? '🟢 ' + room.userCount + ' នាក់កំពុងចូល' : '⚪ ទំនេរ'}</p>
          <button onclick="adminJoinRoom('${room.roomId}')" class="btn-success" style="width: 100%;">🚪 ចូលមើលបន្ទប់នេះ</button>
        </div>
      `;
    });
  } catch (err) {}
}

async function loadUsersTable() {
  try {
    var res = await fetch('/api/users');
    var data = await res.json();
    var tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    data.users.forEach(function(user) {
      var isBlocked = user.isBlocked;
      var adminActions = (user.role === 'admin') ? '<span style="color:#64748b;">មិនអាចកែប្រែ</span>' : `
        <button class="action-btn ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser('${user.id}')">${isBlocked ? 'Unblock' : 'Block'}</button>
        <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword('${user.id}', '${user.username}')">Reset Pwd</button>
        ${currentUserRole === 'admin' ? `<button class="action-btn btn-danger" onclick="deleteUser('${user.id}', '${user.username}')">លុប</button>` : ''}
      `;

      tbody.innerHTML += `
        <tr>
          <td><strong>${user.username}</strong></td>
          <td>${user.role}</td>
          <td>${user.assignedRoom}</td>
          <td>${isBlocked ? '<span style="color:#ef4444;">Blocked</span>' : '<span style="color:#10b981;">Active</span>'}</td>
          <td>${adminActions}</td>
        </tr>
      `;
    });
  } catch (err) {}
}

async function toggleBlockUser(id) {
  var res = await fetch('/api/users/' + id + '/toggle-block', { method: 'PUT' });
  var data = await res.json();
  showToast(data.message, 'success');
  loadUsersTable();
}

async function deleteUser(id, username) {
  if (!confirm('តើអ្នកប្រាកដថាចង់លុប User "' + username + '" ទេ?')) return;
  var res = await fetch('/api/users/' + id, { method: 'DELETE' });
  var data = await res.json();
  showToast(data.message, 'success');
  loadUsersTable();
}

async function resetPassword(id, username) {
  var newPassword = prompt('បញ្ចូលលេខសម្ងាត់ថ្មីសម្រាប់ ' + username + ':');
  if (!newPassword) return;
  var res = await fetch('/api/users/' + id + '/reset-password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: newPassword })
  });
  var data = await res.json();
  showToast(data.message, 'success');
}

async function createNewUser() {
  var username = document.getElementById('newUsername').value.trim();
  var password = document.getElementById('newPassword').value.trim();
  var assignedRoom = document.getElementById('userAssignedRoomSelect').value;
  var role = document.getElementById('newUserRoleSelect').value;

  if (!username || !password) {
    showToast('សូមបំពេញ Username និង Password!', 'error');
    return;
  }

  try {
    var res = await fetch('/api/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, assignedRoom, role })
    });
    var data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      document.getElementById('newUsername').value = '';
      document.getElementById('newPassword').value = '';
      loadUsersTable();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការបង្កើត User!', 'error');
  }
}

async function createNewRoom() {
  var roomId = document.getElementById('newRoomId').value.trim();
  if (!roomId) {
    showToast('សូមបញ្ចូលឈ្មោះបន្ទប់!', 'error');
    return;
  }

  try {
    var res = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId })
    });
    var data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      document.getElementById('newRoomId').value = '';
      loadRooms();
      loadAdminRoomMonitor();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការបង្កើតបន្ទប់!', 'error');
  }
}

// ============================================================
// APP INITIALIZATION
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
  connectSocket();
  loadRooms();
  
  var chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        sendPrivateMessage();
      }
    });
  }

  // Make your own camera preview clickable to enlarge too
  if (localVideo) {
    makeZoomable(localVideo, '👤 ' + (myUsername || 'អ្នក'));
  }
});
