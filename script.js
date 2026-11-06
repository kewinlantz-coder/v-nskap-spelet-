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

// PeerJS Konfiguration med publika STUN-servrar för stabil anslutning
const peerConfig = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
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

// 1. Skapa Rum (Host)
function createRoom() {
  myName = document.getElementById('username').value.trim();
  if (!myName) return showStatus("Vänligen skriv ditt namn först!");

  isHost = true;
  roomCode = Math.floor(1000 + Math.random() * 9000).toString();

  // Skapa peer med unikt prefix
  peer = new Peer('v-nskap-v2-' + roomCode, peerConfig);

  peer.on('open', () => {
    players = [{ id: peer.id, name: myName }];
    showLobby();
  });

  peer.on('connection', (conn) => {
    connections.push(conn);

    conn.on('data', (data) => {
      handleHostMessages(data, conn);
    });

    conn.on('close', () => {
      connections = connections.filter(c => c !== conn);
      players = players.filter(p => p.id !== conn.peer);
      broadcast({ type: 'SYNC_PLAYERS', players: players.map(p => p.name) });
      updateLobbyUI(players.map(p => p.name));
    });
  });

  peer.on('error', (err) => {
    console.error("PeerJS fel:", err);
    if (err.type === 'unavailable-id') {
      createRoom(); // Generera ny kod om det krockar
    } else {
      showStatus("Nätverksfel vid rumsskapande. Försök igen!");
    }
  });
}

// 2. Gå med i Rum (Klient)
function joinRoom() {
  myName = document.getElementById('username').value.trim();
  let code = document.getElementById('room-code-input').value.trim().toUpperCase();

  if (!myName) return showStatus("Skriv in ditt namn!");
  if (!code) return showStatus("Skriv in den 4-siffriga rumskoden!");

  isHost = false;
  roomCode = code;
  peer = new Peer(peerConfig);

  peer.on('open', () => {
    hostConn = peer.connect('v-nskap-v2-' + roomCode);

    hostConn.on('open', () => {
      hostConn.send({ type: 'JOIN', name: myName });
      showLobby();
    });

    hostConn.on('data', (data) => {
      handleClientMessages(data);
    });

    hostConn.on('error', (err) => {
      console.error(err);
      showStatus("Kunde inte hitta rummet. Kontrollera koden!");
    });
  });
}

function broadcast(data) {
  connections.forEach(conn => conn.send(data));
}

// Hantera meddelanden hos Host
function handleHostMessages(data, conn) {
  if (data.type === 'JOIN') {
    if (!players.some(p => p.name === data.name)) {
      players.push({ id: conn.peer, name: data.name });
    }
    const playerNames = players.map(p => p.name);
    broadcast({ type: 'SYNC_PLAYERS', players: playerNames });
    updateLobbyUI(playerNames);
  } 
  else if (data.type === 'SUBMIT_QUESTION') {
    questions.push(data.question);
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
  updateLobbyUI(isHost ? players.map(p => p.name) : [myName]);
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

  let playerNames = isHost ? players.map(p => p.name) : document.querySelectorAll('.player-item span');
  // Hämta spelarnamn från UI om klient
  let names = isHost ? players.map(p => p.name) : Array.from(document.querySelectorAll('.player-item')).map(el => el.innerText.replace('(Du)', '').trim());

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

  // Confetti-effekt
  confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });

  let names = isHost ? players.map(p => p.name) : Array.from(document.querySelectorAll('.player-item')).map(el => el.innerText.replace('(Du)', '').trim());
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
