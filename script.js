// Globala variabler
let peer = null;
let connections = [];
let hostConn = null;

let myName = "";
let roomCode = "";
let isHost = false;

let players = [];
let questions = [];
let currentQuestionIndex = 0;
let votes = {};
let hasVoted = false;
let joinRetryInterval = null;

// Stabil PeerJS-konfiguration med fallback STUN & TURN servrar
const peerConfig = {
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' }
    ]
  }
};

function toggleModal(show) {
  document.getElementById('info-modal').classList.toggle('hidden', !show);
}

function showStatus(msg) {
  const el = document.getElementById('status-message');
  el.innerText = msg;
  el.classList.remove('hidden');
}

function hideStatus() {
  const el = document.getElementById('status-message');
  el.classList.add('hidden');
}

// Helper för ren rums-ID
function getRoomPeerId(code) {
  return 'v-nsp-room-' + code;
}

// 1. Skapa Rum (Host)
function createRoom() {
  myName = document.getElementById('username').value.trim();
  if (!myName) return showStatus("Vänligen skriv ditt namn först!");

  hideStatus();
  isHost = true;
  roomCode = Math.floor(1000 + Math.random() * 9000).toString();

  const customId = getRoomPeerId(roomCode);
  peer = new Peer(customId, peerConfig);

  peer.on('open', (id) => {
    players = [{ id: id, name: myName }];
    showLobby();
  });

  peer.on('connection', (conn) => {
    conn.on('open', () => {
      if (!connections.includes(conn)) {
        connections.push(conn);
      }
    });

    conn.on('data', (data) => {
      handleHostMessages(data, conn);
    });

    conn.on('close', () => {
      connections = connections.filter(c => c !== conn);
      players = players.filter(p => p.id !== conn.peer);
      const playerNames = players.map(p => p.name);
      broadcast({ type: 'SYNC_PLAYERS', players: playerNames });
      updateLobbyUI(playerNames);
    });
  });

  peer.on('error', (err) => {
    console.error("PeerJS Host-fel:", err);
    if (err.type === 'unavailable-id') {
      createRoom(); // Om koden krockade, försök igen med ny kod
    } else {
      showStatus("Nätverksstörning vid rumsskapande. Tryck på knappen igen!");
    }
  });
}

// 2. Gå med i Rum (Klient)
function joinRoom() {
  myName = document.getElementById('username').value.trim();
  let code = document.getElementById('room-code-input').value.trim().toUpperCase();

  if (!myName) return showStatus("Skriv in ditt namn!");
  if (!code || code.length !== 4) return showStatus("Skriv in den 4-siffriga rumskoden!");

  hideStatus();
  isHost = false;
  roomCode = code;

  if (peer) peer.destroy();
  peer = new Peer(peerConfig);

  peer.on('open', () => {
    attemptConnection();
  });

  peer.on('error', (err) => {
    console.error("PeerJS Client-fel:", err);
    showStatus("Kunde inte ansluta. Kontrollera att koden stämmer och försök igen!");
    if (joinRetryInterval) clearInterval(joinRetryInterval);
  });
}

function attemptConnection() {
  const targetPeerId = getRoomPeerId(roomCode);
  hostConn = peer.connect(targetPeerId, { reliable: true });

  let connected = false;

  hostConn.on('open', () => {
    connected = true;
    if (joinRetryInterval) clearInterval(joinRetryInterval);
    
    hostConn.send({ type: 'JOIN', name: myName });
    showLobby();
  });

  hostConn.on('data', (data) => {
    handleClientMessages(data);
  });

  hostConn.on('close', () => {
    showStatus("Anslutningen till rummet bröts.");
  });

  // Om anslutningen tar tid, prova igen efter 2 sekunder
  let attempts = 0;
  if (joinRetryInterval) clearInterval(joinRetryInterval);
  joinRetryInterval = setInterval(() => {
    if (!connected && attempts < 4) {
      attempts++;
      hostConn = peer.connect(targetPeerId, { reliable: true });
    } else {
      clearInterval(joinRetryInterval);
      if (!connected) {
        showStatus("Hittade inte rummet. Se till att Rumsskaparen har sin skärm öppen!");
      }
    }
  }, 2000);
}

function broadcast(data) {
  connections.forEach(conn => {
    if (conn.open) {
      conn.send(data);
    }
  });
}

// Hantera meddelanden hos Host
function handleHostMessages(data, conn) {
  if (data.type === 'JOIN') {
    if (!players.some(p => p.id === conn.peer)) {
      players.push({ id: conn.peer, name: data.name });
    }
    const playerNames = players.map(p => p.name);
    // Skicka bekräftelse till alla
    broadcast({ type: 'SYNC_PLAYERS', players: playerNames });
    updateLobbyUI(playerNames);
  } 
  else if (data.type === 'SUBMIT_QUESTION') {
    if (!questions.includes(data.question)) {
      questions.push(data.question);
    }
    if (questions.length === players.length) {
      broadcast({ type: 'START_VOTING', questions });
      startVotingPhase(questions);
    }
  } 
  else if (data.type === 'SUBMIT_VOTE') {
    votes[data.target] = (votes[data.target] || 0) + 1;
    let totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
    if (totalVotes >= players.length * questions.length) {
      broadcast({ type: 'SHOW_RESULTS', votes });
      showResults(votes);
    }
  }
}

// Hantera meddelanden hos Klienter
function handleClientMessages(data) {
  if (data.type === 'SYNC_PLAYERS') {
    players = data.players.map(name => ({ name }));
    updateLobbyUI(data.players);
  } else if (data.type === 'START_GAME') {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('question-screen').classList.remove('hidden');
  } else if (data.type === 'START_VOTING') {
    startVotingPhase(data.questions);
  } else if (data.type === 'SHOW_RESULTS') {
    showResults(data.votes);
  }
}

function showLobby() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('lobby-screen').classList.remove('hidden');
  document.getElementById('display-room-code').innerText = roomCode;
  
  const currentNames = players.map(p => typeof p === 'string' ? p : p.name);
  updateLobbyUI(currentNames.length ? currentNames : [myName]);
}

function updateLobbyUI(playerNames) {
  document.getElementById('player-count').innerText = playerNames.length;
  let list = document.getElementById('player-list');
  list.innerHTML = playerNames.map(name => `
    <li class="player-item">
      <span>${name} ${name === myName ? '<span style="color:var(--accent-pink)">(Du)</span>' : ''}</span> 
      <span class="status-dot"></span>
    </li>
  `).join('');

  if (isHost) {
    document.getElementById('start-game-btn').classList.remove('hidden');
    document.getElementById('waiting-msg').classList.add('hidden');
  }
}

function hostStartGame() {
  if (players.length < 2) return alert("Vänta på att minst en kompis till ska gå med!");
  broadcast({ type: 'START_GAME' });
  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('question-screen').classList.remove('hidden');
}

function submitQuestion() {
  let input = document.getElementById('my-question');
  let q = input.value.trim();
  if (!q) return alert("Skriv en fråga!");
  
  document.getElementById('question-screen').innerHTML = `
    <div style="text-align:center; padding: 20px 0;">
      <div class="spinner" style="margin: 0 auto 15px auto;"></div>
      <h3>Frågan är skickad!</h3>
      <p class="subtext" style="margin-top: 5px;">Väntar på att resten av gänget ska skriva sina frågor...</p>
    </div>
  `;

  if (isHost) {
    questions.push(q);
    if (questions.length === players.length) {
      broadcast({ type: 'START_VOTING', questions });
      startVotingPhase(questions);
    }
  } else {
    hostConn.send({ type: 'SUBMIT_QUESTION', question: q });
  }
}

function startVotingPhase(qs) {
  questions = qs;
  document.getElementById('question-screen').classList.add('hidden');
  document.getElementById('vote-screen').classList.remove('hidden');
  renderVoteQuestion();
}

function renderVoteQuestion() {
  hasVoted = false;
  document.getElementById('vote-progress').innerText = `Fråga ${currentQuestionIndex + 1} av ${questions.length}`;
  document.getElementById('current-question-text').innerText = questions[currentQuestionIndex];

  let names = Array.from(document.querySelectorAll('.player-item')).map(el => el.innerText.replace('(Du)', '').trim());
  if (!names.length && isHost) names = players.map(p => p.name);

  let container = document.getElementById('vote-options');
  container.innerHTML = names.map(name => `
    <button class="btn btn-secondary" onclick="castVote('${name}')">${name}</button>
  `).join('');
}

function castVote(targetName) {
  if (hasVoted) return;
  hasVoted = true;

  if (isHost) {
    votes[targetName] = (votes[targetName] || 0) + 1;
  } else {
    hostConn.send({ type: 'SUBMIT_VOTE', target: targetName });
  }

  currentQuestionIndex++;
  if (currentQuestionIndex < questions.length) {
    renderVoteQuestion();
  } else {
    document.getElementById('vote-screen').innerHTML = `
      <div style="text-align:center; padding: 20px 0;">
        <div class="spinner" style="margin: 0 auto 15px auto;"></div>
        <h3>Alla dina röster är lagda!</h3>
        <p class="subtext" style="margin-top: 5px;">Väntar på att sista spelarna ska rösta klart...</p>
      </div>
    `;
    if (isHost) {
      let totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
      if (totalVotes >= players.length * questions.length) {
        broadcast({ type: 'SHOW_RESULTS', votes });
        showResults(votes);
      }
    }
  }
}

function showResults(finalVotes) {
  document.getElementById('vote-screen').classList.add('hidden');
  document.getElementById('result-screen').classList.remove('hidden');

  confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });

  let names = Array.from(document.querySelectorAll('.player-item')).map(el => el.innerText.replace('(Du)', '').trim());
  if (!names.length && isHost) names = players.map(p => p.name);

  let dataValues = names.map(name => finalVotes[name] || 0);

  let ctx = document.getElementById('resultChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: names,
      datasets: [{
        label: 'Antal Röster',
        data: dataValues,
        backgroundColor: ['#9333ea', '#ec4899', '#06b6d4', '#22c55e', '#f59e0b'],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { ticks: { color: '#fff' }, grid: { display: false } }
      }
    }
  });
}
