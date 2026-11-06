let roomCode = '';
let playerName = '';
let isHost = false;
let votesChartInstance = null;

let gameState = {
    targetPlayers: 3,
    targetRounds: 3,
    currentRound: 1,
    players: [],
    roundQuestions: [],
    currentQuestionIndex: 0,
    currentTurnIndex: 0,
    votesHistory: [],
    totalVotesPerPlayer: {}
};

let timerInterval;
let timeLeft = 30;

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    lucide.createIcons();
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function syncState() {
    localStorage.setItem(`room_${roomCode}`, JSON.stringify(gameState));
}

function loadState() {
    const saved = localStorage.getItem(`room_${roomCode}`);
    if (saved) gameState = JSON.parse(saved);
}

// 1. SKAPA RUM
function createRoom() {
    playerName = document.getElementById('player-name-input').value.trim() || "Spelare 1";
    gameState.targetPlayers = parseInt(document.getElementById('player-count').value) || 3;
    gameState.targetRounds = parseInt(document.getElementById('round-count').value) || 3;
    
    roomCode = generateRoomCode();
    isHost = true;
    gameState.players = [playerName];
    
    syncState();
    enterLobby();
}

// 2. GÅ MED I RUM
function joinRoom() {
    playerName = document.getElementById('player-name-input').value.trim() || "Spelare 2";
    const inputCode = document.getElementById('room-code-input').value.trim().toUpperCase();
    
    if (!inputCode) return alert("Skriv in en rumskod!");
    
    roomCode = inputCode;
    loadState();

    if (!gameState.players.includes(playerName)) {
        gameState.players.push(playerName);
        syncState();
    }

    enterLobby();
}

function enterLobby() {
    document.getElementById('display-room-code').innerText = roomCode;
    showPage('step-waiting');
    
    updateLobbyUI();
    setInterval(() => {
        loadState();
        updateLobbyUI();
    }, 1000);
}

function updateLobbyUI() {
    const list = document.getElementById('connected-players-list');
    list.innerHTML = gameState.players.map(p => `<li><i data-lucide="user-check"></i> ${p}</li>`).join('');

    const startBtn = document.getElementById('start-game-btn');
    if (isHost && gameState.players.length >= 1) {
        startBtn.classList.remove('hidden');
    }
}

// 3. STARTA FRÅGEFASEN
function startNewRound() {
    gameState.currentTurnIndex = 0;
    gameState.roundQuestions = [];
    syncState();

    startPlayerTurn();
}

function startPlayerTurn() {
    showPage('step-questions');
    
    document.getElementById('round-badge').innerText = `Runda ${gameState.currentRound} av ${gameState.targetRounds}`;
    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    document.getElementById('current-player-turn').innerText = `${currentPlayer}s tur!`;
    document.getElementById('q1').value = '';

    timeLeft = 30;
    document.getElementById('timer').innerHTML = `<i data-lucide="clock"></i> ${timeLeft}s`;
    lucide.createIcons();

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer').innerHTML = `<i data-lucide="clock"></i> ${timeLeft}s`;
        lucide.createIcons();
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            submitQuestion();
        }
    }, 1000);
}

function submitQuestion() {
    clearInterval(timerInterval);
    const q1 = document.getElementById('q1').value.trim();
    const author = gameState.players[gameState.currentTurnIndex];

    if (q1) {
        gameState.roundQuestions.push({ author: author, question: q1 });
    }

    gameState.currentTurnIndex++;

    if (gameState.currentTurnIndex < gameState.players.length) {
        startPlayerTurn();
    } else {
        gameState.roundQuestions.sort(() => Math.random() - 0.5);
        gameState.currentQuestionIndex = 0;
        syncState();
        startVotingPhase();
    }
}

// 4. RÖSTNING
function startVotingPhase() {
    showPage('step-voting');
    const qObj = gameState.roundQuestions[gameState.currentQuestionIndex];
    document.getElementById('question-display').innerText = `"${qObj.question}"`;

    const voteGrid = document.getElementById('vote-buttons');
    voteGrid.innerHTML = '';

    gameState.players.forEach((player) => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-glow';
        btn.innerText = `Rösta på ${player}`;
        btn.onclick = () => castVote(player);
        voteGrid.appendChild(btn);
    });
}

function castVote(votedForPlayer) {
    const currentQ = gameState.roundQuestions[gameState.currentQuestionIndex];

    let historyEntry = gameState.votesHistory.find(h => h.question === currentQ.question && h.author === currentQ.author);
    if (!historyEntry) {
        historyEntry = { author: currentQ.author, question: currentQ.question, votes: [] };
        gameState.votesHistory.push(historyEntry);
    }
    
    historyEntry.votes.push({ voter: playerName, votedFor: votedForPlayer });
    gameState.totalVotesPerPlayer[votedForPlayer] = (gameState.totalVotesPerPlayer[votedForPlayer] || 0) + 1;

    syncState();
    showResults();
}

// 5. RUNDANS RESULTAT
function showResults() {
    showPage('step-results');
    
    const currentQ = gameState.roundQuestions[gameState.currentQuestionIndex];
    document.getElementById('result-question-display').innerText = `"${currentQ.question}"`;

    const historyEntry = gameState.votesHistory.find(h => h.question === currentQ.question && h.author === currentQ.author);
    const votesList = historyEntry ? historyEntry.votes : [];
    const totalVotes = votesList.length;

    const container = document.getElementById('results-container');
    container.innerHTML = '';

    if (typeof confetti === 'function') {
        confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 } });
    }

    gameState.players.forEach((player, idx) => {
        const votes = votesList.filter(v => v.votedFor === player).length;
        const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;

        const item = document.createElement('div');
        item.className = 'result-item';
        item.innerHTML = `
            <div class="result-info">
                <span>${player}</span>
                <span>${percent}% (${votes} röster)</span>
            </div>
            <div class="bar-bg">
                <div class="bar-fill" id="bar-${idx}"></div>
            </div>
        `;
        container.appendChild(item);

        setTimeout(() => {
            const bar = document.getElementById(`bar-${idx}`);
            if (bar) bar.style.width = `${percent}%`;
        }, 100);
    });
}

function nextQuestionOrRound() {
    gameState.currentQuestionIndex++;
    
    if (gameState.currentQuestionIndex < gameState.roundQuestions.length) {
        startVotingPhase();
    } else {
        gameState.currentRound++;
        if (gameState.currentRound <= gameState.targetRounds) {
            startNewRound();
        } else {
            showFinalLeaderboard();
        }
    }
}

// 6. PRO LEADERBOARD MED PROCENTDIAGRAM
function showFinalLeaderboard() {
    showPage('step-final');

    let totalAllVotes = 0;
    Object.values(gameState.totalVotesPerPlayer).forEach(v => totalAllVotes += v);

    const container = document.getElementById('leaderboard-container');
    container.innerHTML = '';

    if (typeof confetti === 'function') {
        confetti({ particleCount: 140, spread: 90, origin: { y: 0.5 } });
    }

    const sortedPlayers = [...gameState.players].sort((a, b) => {
        return (gameState.totalVotesPerPlayer[b] || 0) - (gameState.totalVotesPerPlayer[a] || 0);
    });

    const rankBadges = ['🥇', '🥈', '🥉'];

    sortedPlayers.forEach((player, idx) => {
        const votes = gameState.totalVotesPerPlayer[player] || 0;
        const percent = totalAllVotes > 0 ? Math.round((votes / totalAllVotes) * 100) : 0;
        const rankClass = idx < 3 ? `rank-${idx + 1}` : '';
        const badgeIcon = rankBadges[idx] || `#${idx + 1}`;

        const item = document.createElement('div');
        item.className = `lb-card ${rankClass}`;
        item.innerHTML = `
            <div class="lb-badge">${badgeIcon}</div>
            <div class="lb-details">
                <div class="lb-name">${player}</div>
                <div class="lb-stats">${votes} av ${totalAllVotes} totala röster</div>
            </div>
            <div class="lb-percent">${percent}%</div>
        `;
        container.appendChild(item);
    });

    renderChart(sortedPlayers, totalAllVotes);
}

function renderChart(sortedPlayers, totalAllVotes) {
    const ctx = document.getElementById('finalVotesChart').getContext('2d');
    
    const labels = sortedPlayers;
    const dataValues = sortedPlayers.map(p => {
        const v = gameState.totalVotesPerPlayer[p] || 0;
        return totalAllVotes > 0 ? Math.round((v / totalAllVotes) * 100) : 0;
    });

    if (votesChartInstance) {
        votesChartInstance.destroy();
    }

    votesChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: [
                    '#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e'
                ],
                borderWidth: 2,
                borderColor: '#161e31'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#f8fafc', font: { family: 'Plus Jakarta Sans', size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${context.raw}% av rösterna`;
                        }
                    }
                }
            }
        }
    });
}

// 7. REVIEW SKÄRM
function toggleReviewScreen() {
    showPage('step-review');
    const container = document.getElementById('review-list');
    container.innerHTML = '';

    gameState.votesHistory.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'review-card';

        let votesHTML = item.votes.map(v => `
            <li>
                <span><strong>${v.voter}</strong></span>
                <span>röstade på <strong>${v.votedFor}</strong></span>
            </li>
        `).join('');

        card.innerHTML = `
            <div class="review-author">Fråga av: ${item.author}</div>
            <div class="review-question">"${item.question}"</div>
            <ul class="review-votes-list">
                ${votesHTML || '<li>Inga röster registrerade</li>'}
            </ul>
        `;
        container.appendChild(card);
    });
}

// 8. POPUP MODAL FÖR INFO (ℹ️-knappen)
function toggleInfoModal() {
    const modal = document.getElementById('info-modal');
    modal.classList.toggle('hidden');
    lucide.createIcons();
}

function closeModalOnOverlay(event) {
    if (event.target.id === 'info-modal') {
        toggleInfoModal();
    }
}