<!DOCTYPE html>
<html lang="km">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  
  <!-- PWA Meta Tags -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="VCMeeting">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#00b4d8">
  <meta name="msapplication-TileColor" content="#0b132b">
  
  <!-- PWA Manifest -->
  <link rel="manifest" href="/manifest.json">
  
  <!-- Favicon -->
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2300b4d8'/%3E%3Ctext x='32' y='44' font-family='Arial' font-size='36' font-weight='bold' fill='white' text-anchor='middle'%3EVC%3C/text%3E%3C/svg%3E" type="image/svg+xml">
  
  <title>ប្រព័ន្ធ Video Conference សុវត្ថិភាព</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  
  <script src="/socket.io/socket.io.js"></script>
  <script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>
  
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Kantumruy Pro', sans-serif; }
    body { background-color: #0b132b; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 15px; }
    .hidden { display: none !important; }

    /* Login & Modal Box */
    .card { background: #1c2541; padding: 30px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); width: 100%; max-width: 400px; text-align: center; }
    .card h2 { margin-bottom: 25px; color: #48cae4; font-weight: 600; }
    .form-group { margin-bottom: 15px; text-align: left; }
    .form-group label { display: block; margin-bottom: 8px; font-size: 14px; color: #cbd5e1; }
    input, select { width: 100%; padding: 14px; border-radius: 8px; border: 1px solid #3a506b; background: #0b132b; color: #fff; font-size: 15px; outline: none; }
    input:focus, select:focus { border-color: #48cae4; }
    button { cursor: pointer; border: none; padding: 14px 20px; border-radius: 8px; font-weight: bold; font-size: 15px; transition: 0.2s; font-family: 'Kantumruy Pro', sans-serif;}
    
    .btn-primary { background: #00b4d8; color: #fff; width: 100%; margin-top: 10px; }
    .btn-primary:hover { background: #0096c7; }
    .btn-success { background: #10b981; color: #fff; }
    .btn-warning { background: #f59e0b; color: #000; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-secondary { background: #475569; color: #fff; }
    .btn-purple { background: #8b5cf6; color: #fff; }
    .btn-purple:hover { background: #7c3aed; }

    #otp-modal { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; display:flex; justify-content:center; align-items:center; padding: 15px; }

    /* Room Layout */
    #room-container { width: 100%; max-width: 1600px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; min-height: 95vh; }
    .header-bar { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; background: #1c2541; padding: 15px 20px; border-radius: 10px; }
    .top-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    
    .section-title { font-size: 16px; margin: 15px 0 10px 0; color: #94a3b8; width: 100%; text-align: left; border-bottom: 1px solid #334155; padding-bottom: 8px; }
    
    /* Grid Layout */
    .grid-section { display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; width: 100%; margin-bottom: 25px; }
    .video-box { position: relative; width: 100%; aspect-ratio: 4/3; border-radius: 12px; overflow: hidden; background: #000; border: 2px solid #334155; box-shadow: 0 4px 10px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .screen-box { border-color: #f59e0b; }
    
    .video-box video { width: 100%; height: 100%; object-fit: cover; }
    .screen-box video { object-fit: contain; }

    .name-tag { position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #fff; padding: 5px 10px; border-radius: 6px; font-size: 12px; z-index: 5; }
    .status-tag { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); padding: 5px 10px; border-radius: 6px; font-size: 11px; z-index: 5; }
    
    .floating-controls { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 15px; z-index: 50; background: rgba(0,0,0,0.7); padding: 8px 18px; border-radius: 30px; }
    .float-btn { background: #334155; color: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
    .float-btn:hover { background: #475569; }
    .float-btn.off { background: #ef4444; }

    /* Private Chat */
    #chat-panel { position: fixed; bottom: 20px; right: 20px; width: 320px; background: #1c2541; border: 1px solid #48cae4; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); z-index: 100; display: flex; flex-direction: column; overflow: hidden; }
    .chat-header { background: #48cae4; color: #000; padding: 12px; font-weight: bold; display: flex; justify-content: space-between; cursor: pointer; }
    #chat-messages { height: 250px; overflow-y: auto; padding: 10px; background: #0b132b; font-size: 14px; }
    .msg-item { margin-bottom: 8px; padding: 8px; border-radius: 8px; background: #334155; word-wrap: break-word; }
    .msg-item.me { background: #10b981; text-align: right; margin-left: 20px; }
    .chat-input-area { padding: 10px; display: flex; flex-direction: column; gap: 5px; }

    /* Admin Dashboard */
    #admin-dashboard { width: 100%; max-width: 1200px; justify-content: flex-start; align-items: flex-start; min-height: 95vh; }
    .admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
    .nav-tabs { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .tab-btn { background: #1c2541; color: #fff; padding: 12px 18px; }
    .tab-btn.active { background: #00b4d8; }
    .tab-content { background: #1c2541; padding: 25px; border-radius: 12px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; min-width: 600px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #0b132b; color: #48cae4; }
    .action-btn { padding: 8px 12px; font-size: 13px; margin-right: 5px; margin-bottom: 5px; }
    .room-monitor-grid { display: flex; flex-wrap: wrap; gap: 15px; }
    .room-card { background: #0b132b; border: 1px solid #334155; padding: 20px; border-radius: 8px; width: 100%; max-width: 300px; }
    .room-card.live { border-color: #10b981; }

    /* Remote Control Modal */
    #remoteControlModal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.95);
      z-index: 99999;
      display: none;
      flex-direction: column;
    }
    #remoteControlModal.active {
      display: flex;
    }
    .remote-modal-header {
      background: #1c2541;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    .remote-video-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
      position: relative;
      overflow: hidden;
    }
    .remote-video-container video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
    .remote-status-bar {
      position: absolute;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      padding: 10px 25px;
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
    }

    /* Remote Request Popup */
    #remoteRequestPopup {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #1c2541;
      border: 2px solid #f59e0b;
      border-radius: 15px;
      padding: 30px;
      z-index: 99998;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.8);
      display: none;
    }
    #remoteRequestPopup.active {
      display: block;
    }

    /* Remote Control Overlay */
    #remoteControlOverlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 99997;
      pointer-events: none;
      display: none;
    }
    #remoteControlOverlay.active {
      display: block;
    }
    .remote-overlay-text {
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255,0,0,0.85);
      color: white;
      padding: 8px 20px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 14px;
      pointer-events: none;
    }

    /* Remote Pointer */
    .remote-pointer {
      position: fixed;
      width: 30px;
      height: 30px;
      border: 3px solid #ff0000;
      border-radius: 50%;
      background: rgba(255, 0, 0, 0.2);
      pointer-events: none;
      z-index: 99999;
      transform: translate(-50%, -50%);
      transition: left 0.05s, top 0.05s;
      display: none;
    }
    .remote-pointer.active {
      display: block;
    }
    .remote-pointer::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 6px;
      height: 6px;
      background: #ff0000;
      border-radius: 50%;
    }

    /* Remote Click Effect */
    .remote-click-effect {
      position: fixed;
      width: 40px;
      height: 40px;
      border: 4px solid #00ff00;
      border-radius: 50%;
      background: rgba(0, 255, 0, 0.2);
      pointer-events: none;
      z-index: 99999;
      transform: translate(-50%, -50%);
      animation: clickPulse 0.6s ease-out forwards;
    }

    @keyframes clickPulse {
      0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
    }

    @keyframes slideUp {
      from { transform: translateX(-50%) translateY(20px); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 25px;
      border-radius: 10px;
      color: white;
      font-weight: bold;
      z-index: 999999;
      box-shadow: 0 4px 15px rgba(0,0,0,0.4);
      animation: slideUp 0.3s ease;
      max-width: 90%;
      text-align: center;
      font-size: 14px;
    }

    /* Responsive */
    @media (max-width: 1200px) { .grid-section { grid-template-columns: repeat(4, 1fr); } }
    @media (max-width: 992px) { .grid-section { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 768px) { 
      .grid-section { grid-template-columns: repeat(2, 1fr); } 
      body { align-items: flex-start; justify-content: flex-start; }
      .card { margin-top: 20px; }
      #room-container, #admin-dashboard { padding-top: 10px; }
      .header-bar { flex-direction: column; align-items: flex-start; }
      .top-actions { width: 100%; justify-content: flex-start; }
      #chat-panel { width: 280px; right: 10px; bottom: 10px; }
    }
    @media (max-width: 480px) { .grid-section { grid-template-columns: repeat(1, 1fr); } }
  </style>
</head>
<body id="mainBody">

  <!-- Login Panel -->
  <div id="auth" class="card">
    <h2>🚪 ចូលបន្ទប់ Meeting</h2>
    <div class="form-group">
      <label>ឈ្មោះគណនី (Username)</label>
      <input type="text" id="username" placeholder="ឧ. admin, rith...">
    </div>
    <div class="form-group">
      <label>លេខសម្ងាត់ (Password)</label>
      <input type="password" id="password" placeholder="បញ្ចូល Password">
    </div>
    <div class="form-group">
      <label>ជ្រើសរើសបន្ទប់</label>
      <select id="roomSelect"></select>
    </div>
    <button class="btn-primary" onclick="login()">ចូលរួមបន្ទប់</button>
  </div>

  <!-- 2FA OTP Modal -->
  <div id="otp-modal" class="hidden">
    <div class="card" style="border: 2px solid #f59e0b;">
      <h2 style="color:#f59e0b;">🔐 ផ្ទៀងផ្ទាត់ 2FA</h2>
      <p style="margin-bottom:15px; font-size:14px;">លេខកូដត្រូវបានផ្ញើទៅកាន់ឧបករណ៍ទី១ របស់អ្នក។</p>
      <input type="text" id="otpInput" placeholder="បញ្ចូលលេខកូដ ៦ ខ្ទង់" style="text-align:center; font-size:20px; letter-spacing:5px;">
      <button class="btn-success" style="width:100%; margin-top:15px;" onclick="verify2FA()">បញ្ជាក់ចូលរួម</button>
      <button class="btn-danger" style="width:100%; margin-top:10px;" onclick="cancel2FA()">បោះបង់</button>
    </div>
  </div>

  <!-- Admin Dashboard -->
  <div id="admin-dashboard" class="hidden">
    <div class="admin-header">
      <h2>🛠️ ផ្ទាំងបញ្ជាគ្រប់គ្រង</h2>
      <div>
        <span style="margin-right:15px; color:#48cae4;">👤 Role: <strong id="adminRoleDisplay">admin</strong></span>
        <button id="adminInstallBtn" class="btn-success" style="display:none; padding:8px 15px; font-size:13px; margin-right:10px;" onclick="installApp()">
          📲 Install App
        </button>
        <button class="btn-danger" onclick="logoutAdmin()">🚪 ចាកចេញ (Logout)</button>
      </div>
    </div>
    <div class="nav-tabs">
      <button id="tabBtnRooms" class="tab-btn active" onclick="switchAdminTab('rooms')">📡 តាមដានបន្ទប់សកម្ម</button>
      <button id="tabBtnUsers" class="tab-btn" onclick="switchAdminTab('users')">👥 គ្រប់គ្រង Users</button>
      <button id="tabBtnNewRoom" class="tab-btn" onclick="switchAdminTab('newRoom')" style="display:none;">➕ បង្កើតបន្ទប់ / User</button>
    </div>
    <div class="tab-content">
      <div id="tab-rooms" class="tab-pane active">
        <div id="activeRoomsList" class="room-monitor-grid"></div>
      </div>
      <div id="tab-users" class="tab-pane hidden">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>បន្ទប់កំណត់</th>
              <th>ស្ថានភាព</th>
              <th>សកម្មភាព</th>
            </tr>
          </thead>
          <tbody id="userTableBody"></tbody>
        </table>
      </div>
      <div id="tab-newRoom" class="tab-pane hidden">
        <div style="display:flex; gap:30px; flex-wrap:wrap;">
          <div style="flex:1; min-width:280px;">
            <h3>➕ បង្កើត User ថ្មី</h3>
            <div class="form-group" style="margin-top:10px;">
              <input type="text" id="newUsername" placeholder="Username">
            </div>
            <div class="form-group">
              <input type="password" id="newPassword" placeholder="Password">
            </div>
            <div class="form-group">
              <select id="userAssignedRoomSelect"></select>
            </div>
            <div class="form-group">
              <select id="newUserRoleSelect">
                <option value="user">User</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>
            <button class="btn-success" onclick="createNewUser()">បង្កើត User</button>
          </div>
          <div style="flex:1; min-width:280px;">
            <h3>➕ បង្កើតបន្ទប់ថ្មី</h3>
            <div class="form-group" style="margin-top:10px;">
              <input type="text" id="newRoomId" placeholder="ឧ. room-3">
            </div>
            <button class="btn-primary" onclick="createNewRoom()">បង្កើតបន្ទប់</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Meeting Room -->
  <div id="room-container" class="hidden">
    <div class="header-bar">
      <h3 id="welcome-text">👋 សួស្តី...</h3>
      <div class="top-actions">
        <button class="btn-purple" onclick="showRemoteUserSelector()">🖥️ Remote Control</button>
        <button class="btn-primary" onclick="toggleChat()">💬 ផ្ញើសារ Private</button>
        <button id="screenBtn" class="btn-warning" onclick="toggleScreenShare()">🖥️ Share Screen</button>
        <button class="btn-secondary" onclick="changeMyPassword()">🔑 ប្តូរ Password</button>
        <button class="btn-danger" onclick="leaveRoom()">🚪 ចាកចេញពីបន្ទប់</button>
      </div>
    </div>

    <!-- Screen Share Grid -->
    <h4 class="section-title" id="screenTitle" style="display:none; color:#f59e0b;">🖥️ ផ្ទាំង Screen Share</h4>
    <div id="screenGrid" class="grid-section"></div>

    <!-- Camera Grid -->
    <h4 class="section-title" style="color:#10b981;">👤 ផ្ទាំង Camera & Participants</h4>
    <div id="videoGrid" class="grid-section">
      <div class="video-box" id="myVideoContainer">
        <div class="name-tag">👤 អ្នក (Me)</div>
        <video id="localVideo" autoplay playsinline muted title="ចុចដើម្បីមើលពេញអេក្រង់"></video>
        <div class="floating-controls">
          <button id="micBtnIcon" onclick="toggleMic()" class="float-btn" title="បិទ/បើក មេក្រូ">🎤</button>
          <button id="camBtnIcon" onclick="toggleCamera()" class="float-btn off" title="បិទ/បើក កាមេរ៉ា">🚫</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Private Chat Panel -->
  <div id="chat-panel" class="hidden">
    <div class="chat-header" onclick="toggleChat()">
      <span>💬 ផ្ញើសារសម្ងាត់ (Private)</span> <span>▼</span>
    </div>
    <div id="chat-messages"></div>
    <div class="chat-input-area">
      <select id="chatRecipientSelect" style="padding: 8px;">
        <option value="">-- ជ្រើសរើសអ្នកទទួល --</option>
      </select>
      <div style="display:flex; gap:5px;">
        <input type="text" id="chatInput" placeholder="វាយសារទីនេះ..." style="padding:8px;">
        <button class="btn-success" style="padding:8px;" onclick="sendPrivateMsg()">ផ្ញើ</button>
      </div>
    </div>
  </div>

  <!-- Remote Control Modal -->
  <div id="remoteControlModal">
    <div class="remote-modal-header">
      <div>
        <span style="color:#48cae4; font-weight:bold;">🖥️ Remote Control</span>
        <span id="remoteControlUser" style="color:#94a3b8; margin-left:15px;">កំពុងភ្ជាប់...</span>
      </div>
      <div>
        <button class="btn-danger" style="padding:8px 20px; font-size:14px;" onclick="endRemoteControl()">
          ⛔ បញ្ចប់ Remote
        </button>
        <button class="btn-secondary" style="padding:8px 20px; font-size:14px; margin-left:10px;" onclick="closeRemoteModal()">
          ✖ បិទ
        </button>
      </div>
    </div>
    <div class="remote-video-container">
      <video id="remoteScreenVideo" autoplay playsinline></video>
      <div class="remote-status-bar">
        <span id="remoteStatusText">⏳ កំពុងរង់ចាំ...</span>
      </div>
    </div>
  </div>

  <!-- Remote Request Popup -->
  <div id="remoteRequestPopup">
    <div style="text-align:center;">
      <div style="font-size:60px; margin-bottom:15px;">🖥️</div>
      <h3 style="color:#f59e0b; margin-bottom:10px;">សំណើរ Remote Control</h3>
      <p style="color:#94a3b8; margin-bottom:20px; line-height:1.6;">
        <span id="remoteRequesterName">មិត្តភក្តិ</span> ចង់គ្រប់គ្រង Screen របស់អ្នកពីចម្ងាយ។<br>
        តើអ្នកអនុញ្ញាតទេ?
      </p>
      <div style="display:flex; gap:15px; justify-content:center;">
        <button class="btn-success" style="padding:12px 30px;" onclick="approveRemoteControl()">
          ✅ អនុញ្ញាត
        </button>
        <button class="btn-danger" style="padding:12px 30px;" onclick="rejectRemoteControl()">
          ❌ បដិសេធ
        </button>
      </div>
      <div id="remoteRequestLoading" style="display:none; margin-top:15px;">
        <span style="color:#48cae4;">⏳ កំពុងដំណើរការ...</span>
      </div>
    </div>
  </div>

  <!-- Remote Control Overlay -->
  <div id="remoteControlOverlay">
    <div class="remote-overlay-text">🔴 កំពុងត្រូវបានគ្រប់គ្រងពីចម្ងាយ</div>
  </div>

  <!-- Remote Pointer -->
  <div id="remotePointer" class="remote-pointer"></div>

  <script>
    // ============================================================
    // 1. SOCKET & PEER INITIALIZATION
    // ============================================================
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
    let pendingLoginData = null;
    let deferredPrompt = null;

    const localVideo = document.getElementById('localVideo');
    const screenGrid = document.getElementById('screenGrid');
    const videoGrid = document.getElementById('videoGrid');

    // ============================================================
    // 2. REMOTE CONTROL VARIABLES
    // ============================================================
    let isRemoteControlActive = false;
    let remoteControlTarget = null;
    let remoteControlRequestId = null;
    let isBeingControlled = false;
    let remoteScreenStream = null;
    let remoteControlData = null;

    // ============================================================
    // 3. SOCKET EVENT LISTENERS
    // ============================================================
    
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

    // ============================================================
    // 4. REMOTE CONTROL SOCKET EVENTS
    // ============================================================
    
    socket.on('remote-control-request', (data) => {
      if (data.targetId === myId) {
        const username = userNamesMap[data.controllerId] || 'មិត្តភក្តិ';
        remoteControlRequestId = data.requestId;
        remoteControlData = data;
        
        document.getElementById('remoteRequesterName').textContent = username;
        document.getElementById('remoteRequestPopup').classList.add('active');
        document.getElementById('remoteRequestLoading').style.display = 'none';
        document.getElementById('remoteApproveBtn').style.display = 'inline-block';
        document.getElementById('remoteRejectBtn').style.display = 'inline-block';
      }
    });

    socket.on('remote-control-approved', (data) => {
      if (data.controllerId === myId) {
        showToast('✅ Remote Control ត្រូវបានអនុញ្ញាត!', 'success');
        isRemoteControlActive = true;
        remoteControlTarget = data.targetId;
        openRemoteModal();
      }
    });

    socket.on('remote-control-rejected', (data) => {
      if (data.controllerId === myId) {
        showToast('❌ Remote Control ត្រូវបានបដិសេធ!', 'error');
        isRemoteControlActive = false;
        remoteControlTarget = null;
        document.getElementById('remoteStatusText').textContent = '❌ ត្រូវបានបដិសេធ';
      }
    });

    socket.on('remote-control-ended', (data) => {
      if (data.controllerId === myId) {
        showToast('Remote Control បានបញ្ចប់!', 'info');
        isRemoteControlActive = false;
        remoteControlTarget = null;
        closeRemoteModal();
      }
      if (data.targetId === myId) {
        isBeingControlled = false;
        document.getElementById('remoteControlOverlay').classList.remove('active');
        document.getElementById('remoteControlOverlay').style.display = 'none';
        stopScreenShareForRemote();
        showToast('Remote Control បានបញ្ចប់!', 'info');
      }
    });

    socket.on('remote-mouse-move', (data) => {
      if (!isBeingControlled) return;
      showRemotePointer(data.x, data.y);
    });

    socket.on('remote-mouse-click', (data) => {
      if (!isBeingControlled) return;
      
      const screenX = (data.x / 1920) * window.innerWidth;
      const screenY = (data.y / 1080) * window.innerHeight;
      
      const element = document.elementFromPoint(screenX, screenY);
      if (element) {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: screenX,
          clientY: screenY
        });
        element.dispatchEvent(clickEvent);
        showRemoteClick(screenX, screenY);
      }
    });

    socket.on('remote-keyboard', (data) => {
      if (!isBeingControlled) return;
      
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || 
                            activeElement.tagName === 'TEXTAREA' || 
                            activeElement.isContentEditable)) {
        const event = new KeyboardEvent('keydown', {
          key: data.key,
          code: data.code,
          ctrlKey: data.ctrlKey,
          shiftKey: data.shiftKey,
          altKey: data.altKey,
          metaKey: data.metaKey,
          bubbles: true
        });
        activeElement.dispatchEvent(event);
        
        if (data.key.length === 1 && !data.ctrlKey && !data.metaKey) {
          const inputEvent = new InputEvent('input', { bubbles: true });
          activeElement.dispatchEvent(inputEvent);
        }
      }
    });

    socket.on('remote-scroll', (data) => {
      if (!isBeingControlled) return;
      window.scrollBy({
        top: data.deltaY * 2,
        left: data.deltaX * 2,
        behavior: 'smooth'
      });
    });

    // ============================================================
    // 5. PRIVATE CHAT
    // ============================================================
    
    socket.on('receive-private-message', (data) => {
      document.getElementById('chat-panel').classList.remove('hidden');
      const chatMsgs = document.getElementById('chat-messages');
      chatMsgs.innerHTML += `<div class="msg-item"><b>From 👤 ${data.fromUsername}:</b><br>${data.message}</div>`;
      chatMsgs.scrollTop = chatMsgs.scrollHeight;
    });

    // ============================================================
    // 6. USER JOIN/LEAVE EVENTS
    // ============================================================
    
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
          setTimeout(() => myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } }), 1200);
        }
      }
    });

    socket.on('user-left', (peerId) => {
      removeRemoteVideo(peerId);
      removeRemoteScreenVideo(peerId);
      if (peerCalls[peerId]) { peerCalls[peerId].close(); delete peerCalls[peerId]; }
      delete userNamesMap[peerId];
      updateUserCount();
      updateChatUserList();
    });

    // ============================================================
    // 7. SOUND NOTIFICATION
    // ============================================================
    
    function playNotificationSound(type) {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
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
        }
      } catch (e) {
        console.log('Sound notification not available');
      }
    }

    // ============================================================
    // 8. REMOTE CONTROL FUNCTIONS
    // ============================================================
    
    function requestRemoteControl(targetId) {
      if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
        return showToast('អ្នកគ្មានសិទ្ធិប្រើ Remote Control!', 'error');
      }
      
      const targetName = userNamesMap[targetId] || 'មិត្តភក្តិ';
      
      if (!confirm(`តើអ្នកចង់គ្រប់គ្រង Screen របស់ ${targetName} មែនទេ?`)) {
        return;
      }
      
      showToast('⏳ កំពុងផ្ញើសំណើរ Remote Control...', 'info');
      
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
          remoteControlRequestId = data.requestId;
          remoteControlTarget = targetId;
          showToast('📨 សំណើរត្រូវបានផ្ញើ! សូមរង់ចាំការអនុញ្ញាត...', 'info');
          document.getElementById('remoteStatusText').textContent = '⏳ កំពុងរង់ចាំការអនុញ្ញាត...';
        } else {
          showToast('❌ ' + data.message, 'error');
        }
      })
      .catch(err => {
        showToast('❌ មានបញ្ហាក្នុងការផ្ញើសំណើរ!', 'error');
      });
    }

    function approveRemoteControl() {
      document.getElementById('remoteApproveBtn').style.display = 'none';
      document.getElementById('remoteRejectBtn').style.display = 'none';
      document.getElementById('remoteRequestLoading').style.display = 'block';
      
      fetch('/api/remote-control/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: remoteControlRequestId,
          targetId: myId
        })
      })
      .then(res => res.json())
      .then(data => {
        document.getElementById('remoteRequestPopup').classList.remove('active');
        if (data.success) {
          isBeingControlled = true;
          showToast('✅ អ្នកបានអនុញ្ញាត Remote Control!', 'success');
          document.getElementById('remoteControlOverlay').classList.add('active');
          document.getElementById('remoteControlOverlay').style.display = 'block';
          startScreenShareForRemote();
        } else {
          showToast('❌ មានបញ្ហាក្នុងការអនុញ្ញាត!', 'error');
        }
      });
    }

    function rejectRemoteControl() {
      document.getElementById('remoteApproveBtn').style.display = 'none';
      document.getElementById('remoteRejectBtn').style.display = 'none';
      document.getElementById('remoteRequestLoading').style.display = 'block';
      
      fetch('/api/remote-control/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: remoteControlRequestId })
      })
      .then(() => {
        document.getElementById('remoteRequestPopup').classList.remove('active');
        showToast('❌ អ្នកបានបដិសេធ Remote Control!', 'error');
      });
    }

    async function startScreenShareForRemote() {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { 
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: false
        });
        
        remoteScreenStream = stream;
        
        if (myPeer && remoteControlData) {
          const call = myPeer.call(remoteControlData.controllerId, stream, {
            metadata: { type: 'remote-screen', username: myUsername }
          });
          
          call.on('close', () => {
            stopScreenShareForRemote();
          });
        }
        
        stream.getVideoTracks()[0].onended = () => {
          stopScreenShareForRemote();
        };
        
      } catch (err) {
        console.error('Screen share error:', err);
        showToast('❌ មិនអាចចែករំលែក Screen បានទេ!', 'error');
        isBeingControlled = false;
        document.getElementById('remoteControlOverlay').classList.remove('active');
        document.getElementById('remoteControlOverlay').style.display = 'none';
      }
    }

    function stopScreenShareForRemote() {
      if (remoteScreenStream) {
        remoteScreenStream.getTracks().forEach(track => track.stop());
        remoteScreenStream = null;
      }
      isBeingControlled = false;
      document.getElementById('remoteControlOverlay').classList.remove('active');
      document.getElementById('remoteControlOverlay').style.display = 'none';
    }

    function openRemoteModal() {
      const modal = document.getElementById('remoteControlModal');
      modal.classList.add('active');
      modal.style.display = 'flex';
      
      const targetName = userNamesMap[remoteControlTarget] || 'អ្នកប្រើ';
      document.getElementById('remoteControlUser').textContent = `កំពុងគ្រប់គ្រង: ${targetName}`;
      document.getElementById('remoteStatusText').textContent = '🟢 កំពុងភ្ជាប់...';
      
      startRemoteControlEvents();
    }

    function closeRemoteModal() {
      const modal = document.getElementById('remoteControlModal');
      modal.classList.remove('active');
      modal.style.display = 'none';
      
      if (isRemoteControlActive) {
        endRemoteControl();
      }
    }

    function endRemoteControl() {
      if (!isRemoteControlActive) return;
      
      fetch('/api/remote-control/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          controllerId: myId,
          targetId: remoteControlTarget
        })
      });
      
      isRemoteControlActive = false;
      remoteControlTarget = null;
      stopRemoteControlEvents();
      closeRemoteModal();
      showToast('Remote Control បានបញ្ចប់!', 'info');
    }

    function startRemoteControlEvents() {
      document.addEventListener('mousemove', handleRemoteMouseMove);
      document.addEventListener('mousedown', handleRemoteMouseDown);
      document.addEventListener('mouseup', handleRemoteMouseUp);
      document.addEventListener('keydown', handleRemoteKeyboard);
      document.addEventListener('wheel', handleRemoteWheel);
      
      document.getElementById('remoteStatusText').textContent = '🟢 កំពុងគ្រប់គ្រង...';
    }

    function stopRemoteControlEvents() {
      document.removeEventListener('mousemove', handleRemoteMouseMove);
      document.removeEventListener('mousedown', handleRemoteMouseDown);
      document.removeEventListener('mouseup', handleRemoteMouseUp);
      document.removeEventListener('keydown', handleRemoteKeyboard);
      document.removeEventListener('wheel', handleRemoteWheel);
    }

    function handleRemoteMouseMove(event) {
      if (!isRemoteControlActive || !remoteControlTarget) return;
      
      const video = document.getElementById('remoteScreenVideo');
      const rect = video.getBoundingClientRect();
      
      const x = ((event.clientX - rect.left) / rect.width) * 1920;
      const y = ((event.clientY - rect.top) / rect.height) * 1080;
      
      socket.emit('remote-mouse-move', {
        targetId: remoteControlTarget,
        x: Math.max(0, Math.min(1920, x)),
        y: Math.max(0, Math.min(1080, y))
      });
    }

    function handleRemoteMouseDown(event) {
      if (!isRemoteControlActive || !remoteControlTarget) return;
      
      const video = document.getElementById('remoteScreenVideo');
      const rect = video.getBoundingClientRect();
      
      const x = ((event.clientX - rect.left) / rect.width) * 1920;
      const y = ((event.clientY - rect.top) / rect.height) * 1080;
      
      socket.emit('remote-mouse-click', {
        targetId: remoteControlTarget,
        x: Math.max(0, Math.min(1920, x)),
        y: Math.max(0, Math.min(1080, y)),
        button: event.button
      });
    }

    function handleRemoteMouseUp(event) {
      if (!isRemoteControlActive || !remoteControlTarget) return;
      // Optional: handle mouse up
    }

    function handleRemoteKeyboard(event) {
      if (!isRemoteControlActive || !remoteControlTarget) return;
      if (event.key === 'Escape' || event.key === 'F12') return;
      
      socket.emit('remote-keyboard', {
        targetId: remoteControlTarget,
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey
      });
      
      event.preventDefault();
    }

    function handleRemoteWheel(event) {
      if (!isRemoteControlActive || !remoteControlTarget) return;
      
      socket.emit('remote-scroll', {
        targetId: remoteControlTarget,
        deltaY: event.deltaY,
        deltaX: event.deltaX
      });
      
      event.preventDefault();
    }

    function showRemotePointer(x, y) {
      const pointer = document.getElementById('remotePointer');
      const screenX = (x / 1920) * window.innerWidth;
      const screenY = (y / 1080) * window.innerHeight;
      
      pointer.style.left = screenX + 'px';
      pointer.style.top = screenY + 'px';
      pointer.classList.add('active');
    }

    function showRemoteClick(x, y) {
      const clickEffect = document.createElement('div');
      clickEffect.className = 'remote-click-effect';
      clickEffect.style.left = x + 'px';
      clickEffect.style.top = y + 'px';
      document.body.appendChild(clickEffect);
      
      setTimeout(() => {
        if (clickEffect.parentNode) clickEffect.remove();
      }, 600);
    }

    function showRemoteUserSelector() {
      if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
        return showToast('អ្នកគ្មានសិទ្ធិប្រើ Remote Control!', 'error');
      }
      
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 99998;
        display: flex;
        justify-content: center;
        align-items: center;
      `;
      
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: #1c2541;
        border-radius: 15px;
        padding: 30px;
        max-width: 400px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
      `;
      
      let usersHtml = '<h3 style="color:#48cae4; margin-bottom:20px;">🖥️ ជ្រើសរើសអ្នកប្រើសម្រាប់ Remote</h3>';
      
      const users = Object.entries(userNamesMap).filter(([id, name]) => id !== myId);
      
      if (users.length === 0) {
        usersHtml += '<p style="color:#94a3b8;">គ្មានអ្នកប្រើផ្សេងទៀតក្នុងបន្ទប់ទេ!</p>';
      } else {
        users.forEach(([id, name]) => {
          usersHtml += `
            <button onclick="selectRemoteTarget('${id}')" style="
              display:block; width:100%; padding:12px 15px;
              margin:8px 0; background:#0b132b; border:1px solid #334155;
              border-radius:8px; color:white; cursor:pointer;
              text-align:left; font-size:14px;
              transition: all 0.2s;
            " onmouseover="this.style.borderColor='#48cae4'" onmouseout="this.style.borderColor='#334155'">
              👤 ${name}
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
      
      overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
      };
    }

    function selectRemoteTarget(targetId) {
      document.querySelector('div[style*="z-index: 99998"]')?.remove();
      requestRemoteControl(targetId);
    }

    // ============================================================
    // 9. TOAST NOTIFICATION
    // ============================================================
    
    function showToast(message, type = 'info') {
      const colors = {
        success: '#10b981',
        error: '#ef4444',
        info: '#48cae4',
        warning: '#f59e0b'
      };
      
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.style.background = colors[type] || '#48cae4';
      toast.textContent = message;
      document.body.appendChild(toast);
      
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }

    // ============================================================
    // 10. ADMIN FUNCTIONS
    // ============================================================
    
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
      } catch (err) {
        console.error('Error fetching rooms:', err);
      }
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

          let adminActions = '';
          
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

          const roleColor = user.role === 'admin' ? '#f59e0b' : user.role === 'supervisor' ? '#48cae4' : '#10b981';

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
      } catch (err) { console.error('Error loading user table:', err); }
    }

    function adminJoinRoom(roomId) {
      currentRoomId = roomId;
      document.getElementById('admin-dashboard').classList.add('hidden');
      startMeeting();
    }

    // ============================================================
    // 11. ADMIN CRUD OPERATIONS
    // ============================================================
    
    async function toggleBlockUser(id) {
      try {
        const res = await fetch(`/api/users/${id}/toggle-block`, { method: 'PUT' });
        const data = await res.json();
        showToast(data.message, 'success');
        await loadUsersTable();
      } catch (err) {}
    }

    async function deleteUser(id, username) {
      if (!confirm(`តើអ្នកប្រាកដថាចង់លុប User "${username}" ទេ?`)) return;
      try {
        const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        showToast(data.message, 'success');
        await loadUsersTable();
      } catch (err) {}
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
        showToast(data.message, 'success');
      } catch (err) {}
    }

    async function editUserRoom(id, currentRoom) {
      const newRoom = prompt(`បញ្ចូលបន្ទប់ថ្មី (បន្ទប់បច្ចុប្បន្ន: ${currentRoom}):\nជម្រើស: ${allRoomsList.join(', ')}`);
      if (!newRoom) return;
      try {
        const res = await fetch(`/api/users/${id}/edit-room`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newRoom })
        });
        const data = await res.json();
        showToast(data.message, 'success');
        await loadUsersTable();
      } catch (err) {}
    }

    async function editUserRole(id, newRole) {
      if (currentUserRole !== 'admin') {
        return showToast('អ្នកគ្មានសិទ្ធិកែប្រែ Role ទេ!', 'error');
      }
      
      if (!confirm(`តើអ្នកប្រាកដថាចង់ប្តូរ Role ទៅជា "${newRole}" ទេ?`)) return;
      
      try {
        const res = await fetch(`/api/users/${id}/edit-role`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newRole })
        });
        const data = await res.json();
        showToast(data.message, 'success');
        if (data.success) await loadUsersTable();
      } catch (err) {
        showToast('មានបញ្ហាក្នុងការប្តូរ Role!', 'error');
      }
    }

    async function createNewUser() {
      const username = document.getElementById('newUsername').value.trim();
      const password = document.getElementById('newPassword').value.trim();
      const assignedRoom = document.getElementById('userAssignedRoomSelect').value;
      const role = document.getElementById('newUserRoleSelect').value;
      
      if (!username || !password) return showToast('សូមបំពេញព័ត៌មាន!', 'error');
      
      try {
        const res = await fetch('/api/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, assignedRoom, role })
        });
        const data = await res.json();
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
      const roomId = document.getElementById('newRoomId').value.trim();
      if (!roomId) return showToast('សូមបញ្ចូលឈ្មោះបន្ទប់!', 'error');
      try {
        const res = await fetch('/api/create-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId })
        });
        const data = await res.json();
        showToast(data.message, data.success ? 'success' : 'error');
        if (data.success) {
          document.getElementById('newRoomId').value = '';
          await loadRooms();
          if (currentUserRole === 'admin') loadAdminRoomMonitor();
        }
      } catch (err) {}
    }

    // ============================================================
    // 12. AUTHENTICATION
    // ============================================================
    
    async function login() {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();
      const roomId = document.getElementById('roomSelect').value;

      if (!username || !password) return showToast('សូមបំពេញ Username និង Password!', 'error');
      pendingLoginData = { username, password, roomId };

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingLoginData)
        });
        const data = await res.json();

        if (data.requires2FA) {
          showToast(data.message, 'warning');
          document.getElementById('otp-modal').classList.remove('hidden');
          return;
        }

        if (!data.success) return showToast(data.message, 'error');
        finalizeLogin(data);
      } catch (err) {
        showToast('មានបញ្ហាក្នុងការ Login!', 'error');
      }
    }

    async function verify2FA() {
      const otp = document.getElementById('otpInput').value.trim();
      if (!otp) return showToast('សូមវាយបញ្ចូលលេខកូដ!', 'error');

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
      currentRoomId = pendingLoginData.roomId;

      document.getElementById('mainBody').style.justifyContent = 'flex-start';
      document.getElementById('auth').classList.add('hidden');

      if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
        socket.emit('register-admin');
        document.getElementById('admin-dashboard').classList.remove('hidden');
        document.getElementById('adminRoleDisplay').textContent = currentUserRole;
        
        if (currentUserRole === 'admin') {
          document.getElementById('tabBtnNewRoom').style.display = 'inline-block';
        } else {
          document.getElementById('tabBtnNewRoom').style.display = 'none';
        }
        
        loadAdminRoomMonitor();
        loadUsersTable();
      } else {
        startMeeting();
      }
    }

    async function changeMyPassword() {
      const oldPwd = prompt('🔑 សូមបញ្ចូលលេខសម្ងាត់ចាស់របស់អ្នក:');
      if (!oldPwd) return;
      const newPwd = prompt('🔒 សូមបញ្ចូលលេខសម្ងាត់ថ្មី:');
      if (!newPwd) return;
      try {
        const res = await fetch('/api/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: myUsername, oldPassword: oldPwd, newPassword: newPwd })
        });
        const data = await res.json();
        showToast(data.message, data.success ? 'success' : 'error');
      } catch (err) {
        showToast('មានបញ្ហាក្នុងការប្តូរលេខសម្ងាត់!', 'error');
      }
    }

    function logoutAdmin() {
      myUsername = '';
      currentUserRole = '';
      currentRoomId = '';
      location.reload();
    }

    // ============================================================
    // 13. PRIVATE CHAT UI
    // ============================================================
    
    function toggleChat() {
      document.getElementById('chat-panel').classList.toggle('hidden');
    }

    function updateChatUserList() {
      const select = document.getElementById('chatRecipientSelect');
      select.innerHTML = '<option value="">-- ជ្រើសរើសអ្នកទទួល --</option>';
      for (let [peerId, name] of Object.entries(userNamesMap)) {
        if (peerId !== myId) {
          select.innerHTML += `<option value="${peerId}">${name}</option>`;
        }
      }
    }

    function sendPrivateMsg() {
      const toPeerId = document.getElementById('chatRecipientSelect').value;
      const msgInput = document.getElementById('chatInput');
      const message = msgInput.value.trim();

      if (!toPeerId || !message) return showToast('សូមរើសអ្នកទទួល និងវាយសារជាមុនសិន!', 'error');

      socket.emit('private-message', { toPeerId, message });

      const chatMsgs = document.getElementById('chat-messages');
      chatMsgs.innerHTML += `<div class="msg-item me"><b>To ${userNamesMap[toPeerId]}:</b><br>${message}</div>`;
      chatMsgs.scrollTop = chatMsgs.scrollHeight;
      msgInput.value = '';
    }

    // ============================================================
    // 14. WEBRTC / PEERJS
    // ============================================================
    
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
        document.getElementById('micBtnIcon').innerHTML = '🔇';
        document.getElementById('micBtnIcon').classList.add('off');
      }

      localStream = new MediaStream([audioTrack, createActiveDummyVideoTrack()]);
      localVideo.srcObject = localStream;

      myPeer = new Peer(undefined, {
        host: location.hostname,
        port: location.port || (location.protocol === 'https:' ? 443 : 80),
        path: '/peerjs',
        secure: location.protocol === 'https:',
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      myPeer.on('open', (id) => {
        myId = id;
        document.getElementById('room-container').classList.remove('hidden');
        document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId}`;
        socket.emit('join-room', currentRoomId, id, myUsername);
      });

      myPeer.on('call', (call) => {
        const callType = call.metadata ? call.metadata.type : 'camera';
        const callerName = call.metadata ? call.metadata.username : 'ដៃគូ';

        // Handle Remote Screen (controller receiving target's screen)
        if (callType === 'remote-screen') {
          call.answer();
          call.on('stream', (remoteStream) => {
            document.getElementById('remoteScreenVideo').srcObject = remoteStream;
            document.getElementById('remoteStatusText').textContent = '🟢 កំពុងភ្ជាប់...';
            
            if (!document.getElementById('remoteControlModal').classList.contains('active')) {
              openRemoteModal();
            }
          });
          call.on('close', () => {
            document.getElementById('remoteStatusText').textContent = '🔴 បានផ្តាច់';
            showToast('Remote Control បានបញ្ចប់!', 'info');
          });
          return;
        }

        // Handle Screen Share
        if (callType === 'screen') {
          call.answer();
          call.on('stream', (remoteScreenStream) => addRemoteScreenVideo(call.peer, remoteScreenStream, callerName));
          call.on('close', () => removeRemoteScreenVideo(call.peer));
          return;
        }

        // Handle Camera
        call.answer(isCameraOn ? cameraStream : localStream);
        peerCalls[call.peer] = call;
        addRemoteVideo(call.peer, callerName);
        call.on('stream', (remoteStream) => {
          const videoEl = document.getElementById(`video-${call.peer}`);
          if (videoEl) {
            videoEl.srcObject = remoteStream;
            updateConnectionStatus(call.peer, '🟢 Online');
          }
        });
        call.on('close', () => {
          delete peerCalls[call.peer];
          updateConnectionStatus(call.peer, '🔴 Offline');
        });
      });

      // Remove old listeners
      socket.off('existing-users');
      socket.off('user-joined');
      socket.off('user-left');

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
            setTimeout(() => myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } }), 1200);
          }
        }
      });

      socket.on('user-left', (peerId) => {
        removeRemoteVideo(peerId);
        removeRemoteScreenVideo(peerId);
        if (peerCalls[peerId]) { peerCalls[peerId].close(); delete peerCalls[peerId]; }
        delete userNamesMap[peerId];
        updateUserCount();
        updateChatUserList();
      });
    }

    function connectToUser(peerId) {
      if (peerCalls[peerId]) return;
      const streamToSend = (isCameraOn && cameraStream) ? cameraStream : localStream;
      try {
        const call = myPeer.call(peerId, streamToSend, { metadata: { type: 'camera', username: myUsername } });
        peerCalls[peerId] = call;
        updateConnectionStatus(peerId, '⏳ Connecting...');

        call.on('stream', (remoteStream) => {
          const videoEl = document.getElementById(`video-${peerId}`);
          if (videoEl) {
            videoEl.srcObject = remoteStream;
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
          myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
        }
      } catch (err) {
        console.error('Error calling peer:', err);
      }
    }

    function updateConnectionStatus(peerId, status) {
      const statusElement = document.getElementById(`status-${peerId}`);
      if (statusElement) {
        statusElement.textContent = status;
        if (status.includes('🟢')) statusElement.style.color = '#10b981';
        else if (status.includes('🔴')) statusElement.style.color = '#ef4444';
        else statusElement.style.color = '#f59e0b';
      }
    }

    function addRemoteVideo(peerId, username) {
      if (document.getElementById(`video-container-${peerId}`)) return;
      const container = document.createElement('div');
      container.className = 'video-box';
      container.id = `video-container-${peerId}`;
      
      container.innerHTML = `
        <div class="name-tag">👤 ${username}</div>
        <div class="status-tag"><span id="status-${peerId}" style="color: #f59e0b;">⏳ Connecting...</span></div>
        <video id="video-${peerId}" autoplay playsinline title="ចុចដើម្បីមើលពេញអេក្រង់"></video>
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
          <video id="screen-video-${peerId}" autoplay playsinline title="ចុចដើម្បីមើលពេញអេក្រង់"></video>
        `;
        screenGrid.appendChild(screenContainer);
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
      if (screenGrid.children.length === 0) {
        screenGrid.style.display = 'none';
        document.getElementById('screenTitle').style.display = 'none';
      }
    }

    function updateUserCount() {
      const count = document.querySelectorAll('#videoGrid .video-box').length;
      document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId} | អ្នកប្រើ: ${count}`;
    }

    // ============================================================
    // 15. MEDIA CONTROLS
    // ============================================================
    
    function makeFullscreen(elem) {
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    }

    async function toggleCamera() {
      const camIcon = document.getElementById('camBtnIcon');
      if (isCameraOn) {
        if (cameraStream) {
          cameraStream.getTracks().forEach(track => track.stop());
          cameraStream = null;
        }
        isCameraOn = false;
        camIcon.innerHTML = '🚫';
        camIcon.classList.add('off');
        const dummyTrack = localStream.getVideoTracks()[0];
        localVideo.srcObject = localStream;
        replaceVideoTrackToPeers(dummyTrack);
      } else {
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } }
          });
          const camTrack = cameraStream.getVideoTracks()[0];
          isCameraOn = true;
          camIcon.innerHTML = '🎥';
          camIcon.classList.remove('off');
          localVideo.srcObject = cameraStream;
          replaceVideoTrackToPeers(camTrack);
          camTrack.onended = () => toggleCamera();
        } catch (err) {
          showToast('មិនអាចបើកកាមេរ៉ាបានទេ: ' + err.message, 'error');
        }
      }
    }

    function replaceVideoTrackToPeers(newVideoTrack) {
      for (const [peerId, call] of Object.entries(peerCalls)) {
        const pc = call.peerConnection;
        if (!pc) continue;
        const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (videoSender && newVideoTrack) videoSender.replaceTrack(newVideoTrack);
      }
    }

    async function toggleScreenShare() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        return showToast('⚠️ មុខងារ Share Screen អាចដំណើរការបានតែលើកុំព្យូទ័រប៉ុណ្ណោះ!', 'warning');
      }
      if (isScreenSharing) {
        stopScreenShare();
      } else {
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          isScreenSharing = true;
          document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
          document.getElementById('screenBtn').className = 'btn-danger';

          addRemoteScreenVideo('my-local-screen', screenStream, myUsername + " (អ្នក)");
          for (const peerId of Object.keys(peerCalls)) {
            myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
          }
          screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
        } catch (err) {
          console.warn('Screen share canceled:', err);
        }
      }
    }

    function stopScreenShare() {
      if (!isScreenSharing) return;
      isScreenSharing = false;
      document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
      document.getElementById('screenBtn').className = 'btn-warning';
      removeRemoteScreenVideo('my-local-screen');
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
      }
    }

    function toggleMic() {
      const audioTrack = localStream.getAudioTracks()[0];
      if (!audioTrack) return showToast('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!', 'error');
      const micIcon = document.getElementById('micBtnIcon');
      audioTrack.enabled = !audioTrack.enabled;
      if (audioTrack.enabled) {
        micIcon.innerHTML = '🎤';
        micIcon.classList.remove('off');
      } else {
        micIcon.innerHTML = '🔇';
        micIcon.classList.add('off');
      }
    }

    function leaveRoom() {
      if (isRemoteControlActive) {
        fetch('/api/remote-control/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            controllerId: myId,
            targetId: remoteControlTarget
          })
        });
        stopRemoteControlEvents();
        isRemoteControlActive = false;
        remoteControlTarget = null;
        closeRemoteModal();
      }
      
      if (dummyAnimFrame) cancelAnimationFrame(dummyAnimFrame);
      if (isScreenSharing) stopScreenShare();
      if (isCameraOn && cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
        isCameraOn = false;
        document.getElementById('camBtnIcon').innerHTML = '🚫';
        document.getElementById('camBtnIcon').classList.add('off');
      }
      for (const [peerId, call] of Object.entries(peerCalls)) {
        call.close();
        delete peerCalls[peerId];
      }
      
      if (myPeer) myPeer.destroy();
      if (localStream) localStream.getTracks().forEach(track => track.stop());
      
      socket.off('existing-users');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('play-sound');
      socket.off('remote-control-request');
      socket.off('remote-control-approved');
      socket.off('remote-control-rejected');
      socket.off('remote-control-ended');
      socket.off('remote-mouse-move');
      socket.off('remote-mouse-click');
      socket.off('remote-keyboard');
      socket.off('remote-scroll');
      
      socket.disconnect();

      document.getElementById('room-container').classList.add('hidden');

      if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
        document.getElementById('admin-dashboard').classList.remove('hidden');
        document.getElementById('mainBody').style.justifyContent = 'flex-start';
        
        socket.connect();
        socket.emit('register-admin');
        
        loadAdminRoomMonitor();
        loadUsersTable();
      } else {
        document.getElementById('mainBody').style.justifyContent = 'center';
        location.reload();
      }
    }

    // ============================================================
    // 16. PWA - INSTALL APP
    // ============================================================
    
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      document.getElementById('adminInstallBtn').style.display = 'inline-block';
    });

    window.addEventListener('appinstalled', () => {
      document.getElementById('adminInstallBtn').style.display = 'none';
    });

    function installApp() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            document.getElementById('adminInstallBtn').style.display = 'none';
          }
          deferredPrompt = null;
        });
      }
    }

    // ============================================================
    // 17. INITIALIZATION
    // ============================================================
    
    window.onload = loadRooms;
    localVideo.onclick = () => makeFullscreen(localVideo);

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('ServiceWorker registration successful');
          })
          .catch((error) => {
            console.log('ServiceWorker registration failed: ', error);
          });
      });
    }
  </script>
</body>
</html>
