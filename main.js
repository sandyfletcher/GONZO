const MAX_DISPLAYED_MESSAGES = 10; // corresponds to MAX_HISTORY on the server
let lastMessageSenderId = null;
const socket = io();

const PARTICIPANT_EMOJIS = [
    '👾', '👽', '🤖', '👻', '🎃', '🤡', '🐸', '🐙', '🦖', '🦋', '🚀', '🛰️', '🔭', '🛸', '☄️',
    '🐉', '👹', '👺', '🦄', '🐲', '🧟', '🧛', '🧙', '🧜', '🧞', '🧚', '🗿', '💎', '🔮', '🧿',
    '🦉', '🦊', '🦇', '🦂', '🕷️', '🦑', '🦀', '🦈', '🐌', '🐍', '💀', '☠️', '💾', '🔑', '💣',
    '⚙️', '⚛️', '☣️', '☢️', '🌀'
];

// --- HELPER FUNCTIONS ---
function getUsernameColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 80%, 55%)`;
}

function getEmojiForUser(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % PARTICIPANT_EMOJIS.length;
    return PARTICIPANT_EMOJIS[index];
}

// --- PAGE INITIALIZATION & ROUTING ---

document.addEventListener('DOMContentLoaded', () => {
    handleRouting();
});

// Central routing function to decide what to display
function handleRouting() {
    const roomId = window.location.hash.substring(1);
    if (roomId) {
        // User is loading a room link directly.
        loadRoomView(roomId, true); // true for initial load (no animation)
    } else {
        // User is loading the landing page.
        setupIndexPage();
    }
}

// Single function to load and set up the room view
async function loadRoomView(roomId, isInitialLoad = false) {
    try {
        const response = await fetch('room.html');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const roomContent = doc.querySelector('.room.terminal-box');
        const currentContent = document.querySelector('.terminal-box');

        if (!roomContent || !currentContent) {
            throw new Error('Could not find necessary content to display room page.');
        }

        if (isInitialLoad) {
            currentContent.replaceWith(roomContent);
            setupRoomPage(roomId);
        } else {
            // Animate out the old content
            currentContent.style.animation = 'slide-out-left 0.6s ease-out forwards';
            
            // After the animation, replace content and set up the new page
            setTimeout(() => {
                currentContent.replaceWith(roomContent);
                const newUrl = `#${roomId}`;
                window.history.replaceState({path: newUrl}, '', newUrl);
                setupRoomPage(roomId);
            }, 600); // Must match animation duration
        }
    } catch (error) {
        console.error('Failed to load room view:', error);
        alert('Could not load the room. Please try again.');
        window.location.href = 'index.html';
    }
}

window.addEventListener('pageshow', (event) => {
    if (event.persisted) { // Handle bfcache restores
        const startButton = document.getElementById('start-btn');
        if (startButton) {
            resetStartButtonState(startButton);
        }
    }
});

function resetStartButtonState(button) {
    button.disabled = false;
    button.textContent = '> START ROOM';
    button.classList.remove('is-loading');
}

function setupIndexPage() {
    const startButton = document.getElementById('start-btn');
    if (!startButton) return;
    resetStartButtonState(startButton);
    startButton.addEventListener('click', (e) => {
        e.preventDefault();
        startButton.disabled = true;
        startButton.textContent = '> CONNECTING...';
        startButton.classList.add('is-loading');
        socket.emit('create_room');
    });
}

// This function initializes all the room-specific UI and event listeners.
function setupRoomPage(roomId) {
    const ui = {
        messagesContainer: document.querySelector('.messages'),
        messageForm: document.getElementById('message-form'),
        messageInput: document.getElementById('message-form').querySelector('input'),
        roomLinkElement: document.getElementById('room-link'),
        qrElement: document.querySelector('.qr-code'),
        memberList: document.querySelector('.member-list'),
    };

    if (Object.values(ui).some(el => !el)) {
        console.error("One or more required room page elements not found.");
        alert("Error loading room details.");
        window.location.href = 'index.html';
        return;
    }

    initializeRoomUI(roomId, ui);
    setupMessageForm(roomId, ui);
    joinRoom(roomId); // Tell server we are ready
}

// --- ROOM PAGE HELPERS ---

// **MODIFIED:** Now accepts the `ui` object
function scrollToBottom(ui) {
    ui.messagesContainer.scrollTop = ui.messagesContainer.scrollHeight;
}

// **MODIFIED:** Now accepts the `ui` object
function addMessageToDOM(ui, element) {
    ui.messagesContainer.appendChild(element);
    pruneOldMessages(ui);
    scrollToBottom(ui);
}

function showCopyConfirmation(element) {
    element.classList.add('copied');
    setTimeout(() => {
        element.classList.remove('copied');
    }, 1500);
}

function initializeRoomUI(roomId, ui) {
    document.title = `caecus — [${roomId.substring(0, 6)}]`;
    const roomUrl = `${window.location.origin}${window.location.pathname}#${roomId}`;

    ui.roomLinkElement.textContent = `Room: ${roomId.substring(0, 8)}...`;
    ui.roomLinkElement.addEventListener('click', () => {
        navigator.clipboard.writeText(roomUrl).then(() => {
            showCopyConfirmation(ui.roomLinkElement);
        }).catch(err => console.error('Failed to copy text: ', err));
    });

    ui.qrElement.innerHTML = '';
    const qr = qrcode(0, 'L');
    qr.addData(roomUrl);
    qr.make();
    ui.qrElement.innerHTML = qr.createImgTag(4, 4);
    const qrImg = ui.qrElement.querySelector('img');

    ui.qrElement.addEventListener('click', () => {
        if (!qrImg || !navigator.clipboard.write) {
            alert('Image copy not supported in this browser.');
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = qrImg.width;
        canvas.height = qrImg.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(qrImg, 0, 0);
        canvas.toBlob((blob) => {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            .then(() => showCopyConfirmation(ui.qrElement))
            .catch(err => console.error('Failed to copy image: ', err));
        }, 'image/png');
    });
}

function setupMessageForm(roomId, ui) {
    ui.messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = ui.messageInput.value.trim();
        if (message) {
            socket.emit('send_message', { roomId, message });
            ui.messageInput.value = '';
        }
        ui.messageInput.focus();
    });
}

function joinRoom(roomId) {
    const participantToken = sessionStorage.getItem('participantToken-' + roomId);
    console.log(`Attempting to join room ${roomId} with token: ${participantToken}`);
    socket.emit('join_room', { roomId, participantToken });
}

// --- RENDERING ---

// **MODIFIED:** Now accepts the `ui` object
function pruneOldMessages(ui) {
    while (ui.messagesContainer.childElementCount > MAX_DISPLAYED_MESSAGES) {
        if (ui.messagesContainer.firstChild) {
            ui.messagesContainer.removeChild(ui.messagesContainer.firstChild);
        }
    }
}

function renderUserMessage(data) {
    const messageElement = document.createElement('p');
    if (data.sender.id === lastMessageSenderId) {
        messageElement.classList.add('consecutive-message');
    }
    const sender = data.sender;
    const userColor = getUsernameColor(sender.username);
    const usernameStrong = document.createElement('strong');
    const usernameSpan = document.createElement('span');
    usernameSpan.style.color = userColor;
    usernameSpan.textContent = sender.username;
    usernameStrong.appendChild(document.createTextNode('<'));
    usernameStrong.appendChild(usernameSpan);
    usernameStrong.appendChild(document.createTextNode('>'));
    const messageText = document.createTextNode(` ${data.message}`);
    messageElement.appendChild(usernameStrong);
    messageElement.appendChild(messageText);
    lastMessageSenderId = data.sender.id;
    return messageElement;
}

function renderEventMessage(data) {
    const eventElement = document.createElement('p');
    eventElement.classList.add('event-message');
    eventElement.textContent = data.text;
    lastMessageSenderId = null;
    return eventElement;
}

// --- SOCKET EVENT LISTENERS ---

socket.on('connect', () => {
    console.log("Socket connected. ID:", socket.id);
    const roomId = window.location.hash.substring(1);
    // If we are on a room page (or should be) and we reconnect, rejoin the room.
    if (roomId) {
        joinRoom(roomId);
    }
});

socket.on('room_created', (payload) => {
    const { roomId, token } = payload;
    sessionStorage.setItem('participantToken-' + roomId, token);
    loadRoomView(roomId, false); // false for transition (with animation)
});

socket.on('load_history', (payload) => {
    const { history, token } = payload;
    const ui = { messagesContainer: document.querySelector('.messages') }; // Quick query for this handler
    if (!ui.messagesContainer) return;

    const roomId = window.location.hash.substring(1);
    if (token) {
        sessionStorage.setItem('participantToken-' + roomId, token);
    }

    ui.messagesContainer.innerHTML = ''; // Clear "Connecting..."
    lastMessageSenderId = null;

    history.forEach(item => {
        let element = (item.type === 'message') ? renderUserMessage(item.data) : renderEventMessage(item.data);
        if (element) {
            ui.messagesContainer.appendChild(element);
        }
    });
    scrollToBottom(ui);
});

socket.on('update_participants', (participants) => {
    const memberList = document.querySelector('.member-list');
    if (!memberList) return;

    memberList.innerHTML = '';
    memberList.classList.remove('two-columns', 'is-scrollable');

    participants.forEach((p) => {
        const li = document.createElement('li');
        const prefix = p.isOwner ? '👑 ' : getEmojiForUser(p.username) + ' ';
        if (p.id === socket.id) {
            li.classList.add('is-me');
        }
        li.textContent = `${prefix}${p.username}`;
        memberList.appendChild(li);
    });

    if (memberList.scrollHeight > memberList.clientHeight) {
        memberList.classList.add('two-columns');
        if (memberList.scrollHeight > memberList.clientHeight) {
            memberList.classList.add('is-scrollable');
        }
    }
});

// Generic handler for adding new animated messages/events
function handleNewItem(renderFunction, data) {
    const ui = { messagesContainer: document.querySelector('.messages') }; // Quick query for this handler
    if (!ui.messagesContainer) return;
    const element = renderFunction(data);
    element.classList.add('animate-in');
    addMessageToDOM(ui, element);
}

socket.on('user_event',      (data) => handleNewItem(renderEventMessage, data));
socket.on('receive_message', (data) => handleNewItem(renderUserMessage, data));

socket.on('room_closed', (message) => {
    alert(message);
    window.location.href = 'index.html';
});

socket.on('join_error', (message) => {
    alert(message);
    window.location.href = 'index.html';
});