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
  // ប្រើ WebSocket ជំនួស Polling
  socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 30000,
    autoConnect: true,
    forceNew: true,
    path: '/socket.io'
  });

  socket.on('connect_error', function(error) {
    console.log('❌ Socket.IO connection error:', error);
    connectionAttempts++;
    
    if (connectionAttempts > 3) {
      // សាកល្បងប្រើ Polling
      socket.io.opts.transports = ['polling'];
      socket.connect();
    }
  });

  socket.on('connect', function() {
    console.log('✅ Socket.IO connected successfully!');
    socketConnected = true;
    connectionAttempts = 0;
    showToast('✅ ភ្ជាប់ Server បានជោគជ័យ!', 'success');
    
    // ប្រសិនបើមាន Peer ID ហើយ សូមចូលបន្ទប់ឡើងវិញ
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

  socket.on('reconnect', function() {
    console.log('✅ Reconnected');
    socketConnected = true;
    // ចូលបន្ទប់ឡើងវិញ
    if (myId && currentRoomId && myUsername) {
      socket.emit('join-room', {
        roomId: currentRoomId,
        peerId: myId,
        username: myUsername
      });
    }
  });

  // ============================================================
  // ROOM EVENTS - FIXED
  // ============================================================
  
  // ពេលចូលបន្ទប់ជោគជ័យ
  socket.on('room-joined', function(data) {
    console.log('✅ Room joined successfully:', data);
    showToast('✅ ចូលបន្ទប់ ' + data.roomId + ' បានជោគជ័យ!', 'success');
    
    // បង្ហាញអ្នកប្រើដែលមានរួចហើយក្នុងបន្ទប់
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

  // ពេលមានអ្នកថ្មីចូល
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
      
      // ភ្ជាប់ទៅអ្នកប្រើថ្មី
      setTimeout(function() {
        connectToUser(peerId);
      }, 500);

      // ប្រសិនបើកំពុងចែករំលែកអេក្រង់
      if (isScreenSharing && screenStream && myPeer) {
        setTimeout(function() {
          myPeer.call(peerId, screenStream, { 
            metadata: { type: 'screen', username: myUsername } 
          });
        }, 1000);
      }
    }
  });

  // ពេលអ្នកប្រើចាកចេញ
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
      loadAdminRoomMonitor();
    }
  });

  socket.on('play-sound', function(type) {
    playNotificationSound(type);
  });

  // ============================================================
  // 2FA OTP
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
  const userItems = userList.querySelectorAll('.chat-user-item');
  
  // បង្ហាញ User List
  userList.style.display = 'block';
  if (msgContainer) {
    msgContainer.classList.remove('show');
    msgContainer.style.display = 'none';
  }
  
  // ធ្វើបច្ចុប្បន្នភាព User List
  updateChatUserList();
}

function showChatMessages(peerId) {
  chatTargetPeerId = peerId;
  
  const userList = document.getElementById('chatUserList');
  const msgContainer = document.getElementById('chatMessagesContainer');
  const chatTitle = document.getElementById('chatTitle');
  
  // លាក់ User List
  userList.style.display = 'none';
  
  // បង្ហាញ Messages Container
  if (msgContainer) {
    msgContainer.classList.add('show');
    msgContainer.style.display = 'flex';
  }
  
  // កំណត់ចំណងជើង
  if (chatTitle) {
    const username = userNamesMap[peerId] || 'មិត្តភក្តិ';
    chatTitle.textContent = '👤 ' + username;
  }
  
  // សម្អាត Unread
  if (unreadChats[peerId]) {
    unreadChats[peerId].count = 0;
    updateChatBadge();
    updateChatUserList();
  }
  
  renderChatMessages();
  
  // Focus Input
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
  
  // រក្សាទុកតែផ្នែកខាងក្នុង (មិនត្រូវលុប Header)
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
    
    // ផ្ញើ join-room ទៅ Server
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
  
  document.getElementById('screenTitle').style.display = 'block';
}

function removeRemoteScreenVideo(peerId) {
  const card = document.getElementById('screen-' + peerId);
  if (card) card.remove();
  
  // លាក់ title ប្រសិនបើគ្មាន screen
  const screenGrid = document.getElementById('screenGrid');
  if (screenGrid && screenGrid.children.length === 0) {
    document.getElementById('screenTitle').style.display = 'none';
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
// ADMIN FUNCTIONS
// ============================================================

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
    loadRooms();
  }
}

async function loadRooms() {
  try {
    var res = await fetch('/api/rooms');
    var data = await res.json();
    allRoomsList = data.rooms;

    var select = document.getElementById('roomSelect');
    var adminSelect = document.getElementById('userAssignedRoomSelect');

    if (select) select.innerHTML = '';
    if (adminSelect) adminSelect.innerHTML = '';

    data.rooms.forEach(function(r) {
      if (select) select.innerHTML += '<option value="' + r + '">' + r + '</option>';
      if (adminSelect) adminSelect.innerHTML += '<option value="' + r + '">' + r + '</option>';
    });
  } catch (err) {
    console.error('Error fetching rooms:', err);
  }
}

async function loadAdminRoomMonitor() {
  try {
    var res = await fetch('/api/rooms-status');
    var data = await res.json();
    var container = document.getElementById('activeRoomsList');
    if (!container) return;
    container.innerHTML = '';

    if (!data.rooms || data.rooms.length === 0) {
      container.innerHTML = '<p style="color:#64748b;">គ្មានបន្ទប់សកម្មទេ</p>';
      return;
    }

    data.rooms.forEach(function(room) {
      var isLive = room.userCount > 0;
      var statusHtml = isLive 
        ? '<span style="color:#10b981; font-weight:bold;">🟢 កំពុងសកម្ម (' + room.userCount + ' នាក់)</span><br><small style="color:#94a3b8;">👤 ' + (room.users ? room.users.join(', ') : '') + '</small>'
        : '<span style="color:#64748b;">⚪ ទំនេរ (គ្មានមនុស្ស)</span>';

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
    var res = await fetch('/api/users');
    var data = await res.json();
    var tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    data.users.forEach(function(user) {
      var isBlocked = user.isBlocked;
      var statusText = isBlocked ? '<span style="color:#ef4444; font-weight:bold;">Blocked</span>' : '<span style="color:#10b981; font-weight:bold;">Active</span>';

      var adminActions = '';
      
      if (user.role === 'admin') {
        adminActions = '<span style="color:#64748b;">មិនអាចកែប្រែបាន</span>';
      } else if (user.role === 'supervisor') {
        if (currentUserRole === 'admin') {
          adminActions = `
            <button class="action-btn btn-secondary" onclick="editUserRole('${user.id}', 'user')">កែ Role</button>
            <button class="action-btn btn-secondary" onclick="editUserRoom('${user.id}', '${user.assignedRoom}')">ប្តូរបន្ទប់</button>
            <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword('${user.id}', '${user.username}')">Reset Pwd</button>
          `;
        } else {
          adminActions = '<span style="color:#64748b;">មិនអាចកែប្រែបាន</span>';
        }
      } else {
        if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
          adminActions = `
            <button class="action-btn btn-secondary" onclick="editUserRole('${user.id}', 'supervisor')">កែ Role</button>
            <button class="action-btn ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser('${user.id}')">${isBlocked ? 'Unblock' : 'Block'}</button>
            <button class="action-btn btn-secondary" onclick="editUserRoom('${user.id}', '${user.assignedRoom}')">ប្តូរបន្ទប់</button>
            <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword('${user.id}', '${user.username}')">Reset Pwd</button>
            ${currentUserRole === 'admin' ? `<button class="action-btn btn-danger" onclick="deleteUser('${user.id}', '${user.username}')">លុប</button>` : ''}
          `;
        }
      }

      var roleColor = user.role === 'admin' ? '#f59e0b' : user.role === 'supervisor' ? '#48cae4' : '#10b981';

      tbody.innerHTML += `
        <tr>
          <td><strong>${user.username}</strong></td>
          <td><span style="color: ${roleColor}; font-weight:bold;">${user.role}</span></td>
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

// ============================================================
// ADMIN JOIN ROOM
// ============================================================
function adminJoinRoom(roomId) {
  currentRoomId = roomId;

  const mainBody = document.getElementById('mainBody');
  if (mainBody) {
    mainBody.style.justifyContent = 'flex-start';
    mainBody.style.alignItems = 'stretch';
  }

  const adminDash = document.getElementById('admin-dashboard');
  if (adminDash) {
    adminDash.classList.add('hidden');
    adminDash.style.display = 'none';
  }

  const roomContainer = document.getElementById('room-container');
  if (roomContainer) {
    roomContainer.classList.remove('hidden');
    roomContainer.style.display = 'flex';
  }

  const welcomeText = document.getElementById('welcome-text');
  if (welcomeText) {
    welcomeText.textContent = `👋 សួស្តី Admin! កំពុងមើលបន្ទប់៖ ${currentRoomId}`;
  }

  initDummyStream();

  if (myPeer && myPeer.id) {
    myId = myPeer.id;
    socket.emit('join-room', {
      roomId: currentRoomId,
      peerId: myId,
      username: myUsername || 'Admin'
    });
  } else {
    initPeerJS();
  }

  showToast('🚪 បានចូលរួមបន្ទប់៖ ' + currentRoomId, 'success');
}

// ============================================================
// LEAVE ROOM
// ============================================================
function leaveRoom() {
  if (!confirm('តើអ្នកប្រាកដជាចង់ចាកចេញពីបន្ទប់នេះទេ?')) return;

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
    Object.keys(peerCalls).forEach(function(peerId) {
      if (peerCalls[peerId]) {
        peerCalls[peerId].close();
        delete peerCalls[peerId];
      }
    });
  }
  if (myPeer) {
    myPeer.destroy();
    myPeer = null;
  }

  if (socket && socketConnected) {
    socket.emit('leave-room', { 
      roomId: currentRoomId, 
      peerId: myId 
    });
  }

  const videoGrid = document.getElementById('videoGrid');
  const screenGrid = document.getElementById('screenGrid');
  
  if (videoGrid) {
    const myVideo = document.getElementById('myVideoContainer');
    videoGrid.innerHTML = '';
    if (myVideo) videoGrid.appendChild(myVideo);
  }
  if (screenGrid) screenGrid.innerHTML = '';

  const roomContainer = document.getElementById('room-container');
  const chatPanel = document.getElementById('chat-panel');
  
  if (roomContainer) {
    roomContainer.classList.add('hidden');
    roomContainer.style.display = 'none';
  }
  if (chatPanel) {
    chatPanel.classList.add('hidden');
    chatPanel.style.display = 'none';
  }

  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    const adminDash = document.getElementById('admin-dashboard');
    if (adminDash) {
      adminDash.classList.remove('hidden');
      adminDash.style.display = 'block';
    }
    
    const mainBody = document.getElementById('mainBody');
    if (mainBody) {
      mainBody.style.justifyContent = 'flex-start';
      mainBody.style.alignItems = 'stretch';
    }
    
    switchAdminTab('rooms');
    loadAdminRoomMonitor();
    
    showToast('🚪 បានចាកចេញពីបន្ទប់', 'warning');
  } else {
    const authCard = document.getElementById('auth');
    if (authCard) {
      authCard.classList.remove('hidden');
      authCard.style.display = 'block';
    }
    
    const mainBody = document.getElementById('mainBody');
    if (mainBody) {
      mainBody.style.justifyContent = 'center';
      mainBody.style.alignItems = 'center';
    }
    
    showToast('🚪 បានចាកចេញពីបន្ទប់', 'warning');
  }

  currentRoomId = '';
  isCameraOn = false;
  isScreenSharing = false;
  isBeingControlled = false;
  isRemoteControlActive = false;
  chatTargetPeerId = null;
  
  if (remotePointer) {
    remotePointer.remove();
    remotePointer = null;
  }
}

function leaveMeeting() {
  leaveRoom();
}

// ============================================================
// ADMIN LOGOUT
// ============================================================
function logoutAdmin() {
  if (!confirm('តើអ្នកប្រាកដថាចង់ចាកចេញពី Admin Dashboard ទេ?')) return;

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

  if (myPeer) {
    myPeer.destroy();
    myPeer = null;
  }

  if (socket && socketConnected) {
    socket.emit('logout', { 
      peerId: myId,
      username: myUsername 
    });
    socket.disconnect();
  }

  myUsername = '';
  currentUserRole = '';
  currentRoomId = '';
  myId = '';
  pendingLoginData = null;
  isCameraOn = false;
  isScreenSharing = false;
  chatTargetPeerId = null;

  const authCard = document.getElementById('auth');
  if (authCard) {
    authCard.classList.remove('hidden');
    authCard.style.display = 'block';
  }

  const adminDash = document.getElementById('admin-dashboard');
  if (adminDash) {
    adminDash.classList.add('hidden');
    adminDash.style.display = 'none';
  }

  const roomContainer = document.getElementById('room-container');
  if (roomContainer) {
    roomContainer.classList.add('hidden');
    roomContainer.style.display = 'none';
  }

  const mainBody = document.getElementById('mainBody');
  if (mainBody) {
    mainBody.style.justifyContent = 'center';
    mainBody.style.alignItems = 'center';
  }

  const videoGrid = document.getElementById('videoGrid');
  const screenGrid = document.getElementById('screenGrid');
  if (videoGrid) videoGrid.innerHTML = '';
  if (screenGrid) screenGrid.innerHTML = '';

  showToast('👋 បានចាកចេញដោយជោគជ័យ!', 'info');

  setTimeout(function() {
    window.location.reload();
  }, 1000);
}

function adminLogout() {
  logoutAdmin();
}

// ============================================================
// ADMIN CRUD OPERATIONS
// ============================================================
async function toggleBlockUser(id) {
  try {
    var res = await fetch('/api/users/' + id + '/toggle-block', { method: 'PUT' });
    var data = await res.json();
    showToast(data.message, 'success');
    await loadUsersTable();
  } catch (err) {}
}

async function deleteUser(id, username) {
  if (!confirm('តើអ្នកប្រាកដថាចង់លុប User "' + username + '" ទេ?')) return;
  try {
    var res = await fetch('/api/users/' + id, { method: 'DELETE' });
    var data = await res.json();
    showToast(data.message, 'success');
    await loadUsersTable();
  } catch (err) {}
}

async function resetPassword(id, username) {
  var newPassword = prompt('បញ្ចូលលេខសម្ងាត់ថ្មីសម្រាប់ ' + username + ':');
  if (!newPassword || newPassword.length < 4) {
    showToast('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៤ តួ!', 'error');
    return;
  }
  try {
    var res = await fetch('/api/users/' + id + '/reset-password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: newPassword })
    });
    var data = await res.json();
    showToast(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      await loadUsersTable();
    }
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការកំណត់ពាក្យសម្ងាត់!', 'error');
  }
}

async function editUserRoom(id, currentRoom) {
  var newRoom = prompt('បញ្ចូលបន្ទប់ថ្មី (បន្ទប់បច្ចុប្បន្ន: ' + currentRoom + '):\nជម្រើស: ' + allRoomsList.join(', '));
  if (!newRoom) return;
  try {
    var res = await fetch('/api/users/' + id + '/edit-room', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRoom: newRoom })
    });
    var data = await res.json();
    showToast(data.message, 'success');
    await loadUsersTable();
  } catch (err) {}
}

async function editUserRole(id, newRole) {
  if (currentUserRole !== 'admin') {
    showToast('អ្នកគ្មានសិទ្ធិកែប្រែ Role ទេ!', 'error');
    return;
  }
  
  if (!confirm('តើអ្នកប្រាកដថាចង់ប្តូរ Role ទៅជា "' + newRole + '" ទេ?')) return;
  
  try {
    var res = await fetch('/api/users/' + id + '/edit-role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole: newRole })
    });
    var data = await res.json();
    showToast(data.message, data.success ? 'success' : 'error');
    if (data.success) await loadUsersTable();
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការប្តូរ Role!', 'error');
  }
}

async function createNewUser() {
  var username = document.getElementById('newUsername').value.trim();
  var password = document.getElementById('newPassword').value.trim();
  var assignedRoom = document.getElementById('userAssignedRoomSelect').value;
  var role = document.getElementById('newUserRoleSelect').value;
  
  if (!username || !password) {
    showToast('សូមបំពេញព័ត៌មាន!', 'error');
    return;
  }
  
  try {
    var res = await fetch('/api/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password, assignedRoom: assignedRoom, role: role })
    });
    var data = await res.json();
    showToast(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      document.getElementById('newUsername').value = '';
      document.getElementById('newPassword').value = '';
      await loadUsersTable();
      await loadRooms();
    }
  } catch (err) {}
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
      body: JSON.stringify({ roomId: roomId })
    });
    var data = await res.json();
    showToast(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      document.getElementById('newRoomId').value = '';
      await loadRooms();
      if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
        loadAdminRoomMonitor();
      }
    }
  } catch (err) {}
}

// ============================================================
// AUTHENTICATION & LOGIN
// ============================================================
async function login() {
  var username = document.getElementById('username').value.trim();
  var password = document.getElementById('password').value.trim();
  var roomId = document.getElementById('roomSelect').value;

  if (!username || !password) {
    showToast('សូមបំពេញ Username និង Password!', 'error');
    return;
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
      showToast(data.message, 'error');
      return;
    }
    finalizeLogin(data);
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការ Login!', 'error');
  }
}

async function verify2FA() {
  var otp = document.getElementById('otpInput').value.trim();
  if (!otp) {
    showToast('សូមវាយបញ្ចូលលេខកូដ!', 'error');
    return;
  }

  try {
    var res = await fetch('/api/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: pendingLoginData.username, password: pendingLoginData.password, otp: otp })
    });
    var data = await res.json();

    if (!data.success) {
      showToast(data.message, 'error');
      return;
    }
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
  currentRoomId = pendingLoginData.roomId || document.getElementById('roomSelect').value;

  const mainBody = document.getElementById('mainBody');
  if (mainBody) {
    mainBody.style.justifyContent = 'flex-start';
    mainBody.style.alignItems = 'stretch';
  }

  const authCard = document.getElementById('auth');
  if (authCard) authCard.classList.add('hidden');

  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    const adminDash = document.getElementById('admin-dashboard');
    if (adminDash) {
      adminDash.classList.remove('hidden');
      adminDash.style.display = 'block';
    }
    
    const adminRoleDisplay = document.getElementById('adminRoleDisplay');
    if (adminRoleDisplay) adminRoleDisplay.textContent = currentUserRole.toUpperCase();
    
    switchAdminTab('rooms');
    showToast('✅ ចូលប្រើប្រាស់ជា ' + currentUserRole + ' បានជោគជ័យ!', 'success');
  } else {
    const roomContainer = document.getElementById('room-container');
    if (roomContainer) {
      roomContainer.classList.remove('hidden');
      roomContainer.style.display = 'flex';
    }

    const welcomeText = document.getElementById('welcome-text');
    if (welcomeText) {
      welcomeText.textContent = `👋 សួស្តី ${myUsername}! កំពុងស្ថិតក្នុងបន្ទប់៖ ${currentRoomId}`;
    }

    initDummyStream();

    if (myPeer && myPeer.id) {
      myId = myPeer.id;
      socket.emit('join-room', {
        roomId: currentRoomId,
        peerId: myId,
        username: myUsername
      });
    } else {
      initPeerJS();
    }
    
    showToast('✅ ចូលប្រើប្រាស់បានជោគជ័យ!', 'success');
  }
}

// ============================================================
// TOGGLE CAMERA & MIC
// ============================================================
async function toggleCamera() {
  const btn = document.getElementById('camBtnIcon');
  if (!isCameraOn) {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const videoTrack = cameraStream.getVideoTracks()[0];
      const audioTrack = cameraStream.getAudioTracks()[0];

      if (localStream) {
        if (videoTrack) {
          const oldVideo = localStream.getVideoTracks()[0];
          if (oldVideo) localStream.removeTrack(oldVideo);
          localStream.addTrack(videoTrack);
        }
        if (audioTrack) {
          const oldAudio = localStream.getAudioTracks()[0];
          if (oldAudio) localStream.removeTrack(oldAudio);
          localStream.addTrack(audioTrack);
        }
      } else {
        localStream = cameraStream;
      }

      if (localVideo) localVideo.srcObject = localStream;
      
      // ជំនួស Track សម្រាប់ Call ទាំងអស់
      for (let pId in peerCalls) {
        const pc = peerCalls[pId].peerConnection;
        if (pc) {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender && videoTrack) {
            videoSender.replaceTrack(videoTrack);
          }
        }
      }

      isCameraOn = true;
      if (btn) {
        btn.classList.remove('off');
        btn.innerHTML = '📷';
        btn.title = 'បិទកាមេរ៉ា';
      }
      showToast('📷 កាមេរ៉ាត្រូវបានបើក', 'success');
    } catch (err) {
      showToast('❌ មិនអាចបើកកាមេរ៉ាបានទេ!', 'error');
    }
  } else {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    isCameraOn = false;
    if (btn) {
      btn.classList.add('off');
      btn.innerHTML = '🚫';
      btn.title = 'បើកកាមេរ៉ា';
    }
    initDummyStream();
    showToast('📷 កាមេរ៉ាត្រូវបានបិទ', 'info');
  }
}

function toggleMic() {
  const btn = document.getElementById('micBtnIcon');
  if (!localStream || localStream.getAudioTracks().length === 0) {
    showToast('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!', 'error');
    return;
  }
  
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  
  if (audioTrack.enabled) {
    btn.classList.remove('off');
    btn.innerHTML = '🎤';
    btn.title = 'បិទមេក្រូ';
    showToast('🎤 មេក្រូបានបើក', 'info');
  } else {
    btn.classList.add('off');
    btn.innerHTML = '🔇';
    btn.title = 'បើកមេក្រូ';
    showToast('🔇 មេក្រូបានបិទ', 'info');
  }
}

// ============================================================
// TOGGLE SCREEN SHARE
// ============================================================
async function toggleScreenShare() {
  const btn = document.getElementById('screenBtn');
  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true,
        audio: false
      });
      
      isScreenSharing = true;
      btn.innerHTML = '🛑 Stop Screen';
      btn.style.background = '#ef4444';
      btn.style.color = 'white';

      // ផ្ញើ Screen Stream ទៅអ្នកដទៃ
      for (let pId in userNamesMap) {
        if (pId !== myId && myPeer) {
          const call = myPeer.call(pId, screenStream, { 
            metadata: { type: 'screen', username: myUsername } 
          });
          call.on('stream', function(remoteStream) {
            addRemoteScreenVideo(pId, remoteStream, userNamesMap[pId]);
          });
        }
      }

      // បង្ហាញ Screen នៅ Local
      const screenVideo = document.createElement('video');
      screenVideo.autoplay = true;
      screenVideo.playsInline = true;
      screenVideo.srcObject = screenStream;
      
      const screenContainer = document.createElement('div');
      screenContainer.className = 'video-box screen-box';
      screenContainer.id = 'my-screen';
      screenContainer.innerHTML = `
        <div class="name-tag">🖥️ អេក្រង់របស់អ្នក</div>
      `;
      screenContainer.prepend(screenVideo);
      
      document.getElementById('screenGrid').appendChild(screenContainer);
      document.getElementById('screenTitle').style.display = 'block';

      screenStream.getVideoTracks()[0].onended = function() {
        toggleScreenShare();
      };

      showToast('🖥️ បានចាប់ផ្ដើមចែករំលែក Screen', 'success');
    } catch (err) {
      console.error(err);
      showToast('❌ មិនអាចចែករំលែក Screen បានទេ!', 'error');
    }
  } else {
    // បញ្ឈប់ការចែករំលែក
    stopScreenSharing();
  }
}

function stopScreenSharing() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  isScreenSharing = false;
  
  const btn = document.getElementById('screenBtn');
  btn.innerHTML = '🖥️ Share Screen';
  btn.style.background = '#f59e0b';
  btn.style.color = '#000';
  
  document.getElementById('my-screen')?.remove();
  
  // ពិនិត្យមើលថាតើមាន Screen អ្នកផ្សេងនៅសល់ទេ
  const screenGrid = document.getElementById('screenGrid');
  if (screenGrid && screenGrid.children.length === 0) {
    document.getElementById('screenTitle').style.display = 'none';
  }
  
  showToast('🖥️ បានបញ្ឈប់ការចែករំលែក Screen', 'info');
}

// ============================================================
// CHANGE MY PASSWORD
// ============================================================
function changeMyPassword() {
  const oldPassword = prompt('បញ្ចូល Password ចាស់:');
  if (!oldPassword) return;
  
  const newPassword = prompt('បញ្ចូល Password ថ្មី (យ៉ាងតិច 4 តួ):');
  if (!newPassword || newPassword.length < 4) {
    showToast('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៤ តួ!', 'error');
    return;
  }
  
  const confirmPassword = prompt('បញ្ចូល Password ថ្មីម្តងទៀត:');
  if (newPassword !== confirmPassword) {
    showToast('Password មិនត្រូវគ្នា!', 'error');
    return;
  }
  
  fetch('/api/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: myUsername,
      oldPassword: oldPassword,
      newPassword: newPassword
    })
  })
  .then(res => res.json())
  .then(data => {
    showToast(data.message, data.success ? 'success' : 'error');
  })
  .catch(() => {
    showToast('មានបញ្ហាក្នុងការប្តូរ Password!', 'error');
  });
}

// ============================================================
// INITIALIZATION
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 App starting...');
  connectSocket();
  loadRooms();
  
  // Chat Input Enter Key
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        sendPrivateMessage();
      }
    });
  }
  
  // Click outside to close chat
  document.addEventListener('click', function(e) {
    const chatPanel = document.getElementById('chat-panel');
    const chatBtn = document.getElementById('chatToggleBtn');
    if (isChatOpen && chatPanel && !chatPanel.contains(e.target) && !chatBtn.contains(e.target)) {
      // Don't auto close, user should click close button
    }
  });
});
