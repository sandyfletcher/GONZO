const MAX_DISPLAYED_MESSAGES = 10; // corresponds to MAX_HISTORY on the server
let lastMessageSenderId = null;
const socket = io("https://fastchat-0opj.onrender.com/");
const PARTICIPANT_EMOJIS = [
    '👾', '👽', '🤖', '👻', '🎃', '🤡', '🐸', '🐙', '🦖', '🦋', '🚀', '🛰️', '🔭', '🛸', '☄️',
    '🐉', '👹', '👺', '🦄', '🐲', '🧟', '🧛', '🧙', '🧜', '🧞', '🧚', '🗿', '💎', '🔮', '🧿',
    '🦉', '🦊', '🦇', '🦂', '🕷️', '🦑', '🦀', '🦈', '🐌', '🐍', '💀', '☠️', '💾', '🔑', '💣',
    '⚙️', '⚛️', '☣️', '☢️', '🌀'
];

socket.on('connect', () => { // if on a room page, join room — handles both initial connection and any subsequent reconnections
    // console.log("Connected to server as", socket.id); 
    if (document.querySelector('.room')) {
        const roomId = window.location.hash.substring(1);
        if (roomId) {
            joinRoom(roomId);
        }
    }
});

function getUsernameColor(str) { //  use HSL to parse a colour from username string
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360; // get hue value 0 to 360
    return `hsl(${hue}, 80%, 55%)`; // fixed saturation/lightness for readability
}

function getEmojiForUser(username) { // use a simple hash to deterministically assign an emoji
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % PARTICIPANT_EMOJIS.length; // ensure index is non-negative
    return PARTICIPANT_EMOJIS[index];
}

// --- PAGE INITIALIZATION & ROUTING ---

document.addEventListener('DOMContentLoaded', () => {
    const roomId = window.location.hash.substring(1);
    if (roomId) { // user is loading a room link directly — replace landing page content with room content
        loadRoomContent(roomId);
    } else { // user is loading landing page
        setupIndexPage();
    }
});

async function loadRoomContent(roomId) {
    try {
        const response = await fetch('room.html');
        if (!response.ok) throw new Error('Network response was not ok');
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const roomContent = doc.querySelector('.room.terminal-box');
        const landingContent = document.querySelector('.landing.terminal-box');
        if (roomContent && landingContent) {
            landingContent.replaceWith(roomContent); // replace content without animation for direct loads
            setupRoomPage(); // now that DOM is ready, set up room functionality
        } else {
            console.error('Could not find necessary content to initialize room page.');
        }
    } catch (error) {
        console.error('Failed to load room content:', error);
        alert('Could not load the room. Please try again.');
        window.location.hash = ''; // clear hash to avoid a loop
    }
}

window.addEventListener('pageshow', (event) => { // listen for the pageshow event to handle bfcache restores
    if (event.persisted) {
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
    if (!startButton) return; // guard
    resetStartButtonState(startButton);
    startButton.addEventListener('click', (e) => {
        e.preventDefault();
        startButton.disabled = true;
        startButton.textContent = '> CONNECTING...';
        startButton.classList.add('is-loading');
        socket.emit('create_room');
    });
}

function setupRoomPage() {
    const roomId = window.location.hash.substring(1);
    const ui = { // cache relevant DOM elements into single object
        messagesContainer: document.querySelector('.messages'),
        messageForm: document.getElementById('message-form'),
        messageInput: document.getElementById('message-form').querySelector('input'),
        roomLinkElement: document.getElementById('room-link'),
        qrElement: document.querySelector('.qr-code'),
        memberList: document.querySelector('.member-list'),
    };
    if (!roomId) {
        ui.messagesContainer.innerHTML = '<p>ERROR: No room ID specified. Start a new room.</p>';
        ui.messageForm.style.display = 'none';
        return; // stop execution
    }
    initializeRoomUI(roomId, ui);
    setupMessageForm(roomId, ui);
    socket.on('update_participants', (participants) => {
        const memberList = ui.memberList;
        if (!memberList) return;
        memberList.innerHTML = '';
        memberList.classList.remove('two-columns', 'is-scrollable');
        participants.forEach((p) => {
            const li = document.createElement('li');
            let prefix = p.isOwner ? '👑 ' : getEmojiForUser(p.username) + ' ';
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
    joinRoom(roomId); // join room now that UI is set up
}

// --- ROOM PAGE HELPERS ---

function scrollToBottom() {
    const messagesContainer = document.querySelector('.messages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function addMessageToDOM(element) {
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer || !element) return;
    messagesContainer.appendChild(element);
    pruneOldMessages();
    scrollToBottom();
}

function showCopyConfirmation(element) {
    element.classList.add('copied');
    setTimeout(() => {
        element.classList.remove('copied');
    }, 1500);
}

function initializeRoomUI(roomId, ui) {
    document.title = `caecus — [${roomId.substring(0, 6)}]`;
    const roomUrl = window.location.href;
    const linkEl = ui.roomLinkElement;
    if (linkEl) {
        linkEl.textContent = `Room: ${roomId.substring(0, 8)}...`;
        linkEl.addEventListener('click', () => {
            navigator.clipboard.writeText(roomUrl).then(() => {
                showCopyConfirmation(linkEl);
            }).catch(err => console.error('Failed to copy text: ', err));
        });
    }
    const qrElement = ui.qrElement;
    if (qrElement) {
        qrElement.innerHTML = '';
        const qr = qrcode(0, 'L');
        qr.addData(roomUrl);
        qr.make();
        qrElement.innerHTML = qr.createImgTag(4, 4);
        const qrImg = qrElement.querySelector('img');
        qrElement.addEventListener('click', () => {
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
                .then(() => showCopyConfirmation(qrElement))
                .catch(err => console.error('Failed to copy image: ', err));
            }, 'image/png');
        });
    }
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
    socket.emit('join_room', { roomId, participantToken });
}

// --- RENDERING ---

function pruneOldMessages() {
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer) return;
    while (messagesContainer.childElementCount > MAX_DISPLAYED_MESSAGES) {
        if (messagesContainer.firstChild) {
            messagesContainer.removeChild(messagesContainer.firstChild);
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

// --- PAGE TRANSITION ---

async function transitionToRoom(roomId) {
    try {
        const response = await fetch('room.html');
        if (!response.ok) throw new Error('Network response was not ok');
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const roomContent = doc.querySelector('.room.terminal-box');
        const landingContent = document.querySelector('.landing.terminal-box');
        if (landingContent && roomContent) {
            landingContent.style.animation = 'slide-out-left 0.6s ease-out forwards'; // animate out old content
            setTimeout(() => { // after animation, replace content and set up new page
                landingContent.replaceWith(roomContent);
                const newUrl = `#${roomId}`; // update URL without full reload — `replaceState` is used so user can't click "back" to non-existent "creating room" state
                window.history.replaceState({path: newUrl}, '', newUrl);
                setupRoomPage(); // initialize the logic for newly added room content
            }, 600); // must match animation duration in CSS
        }
    } catch (error) {
        console.error('Failed to transition to room:', error);
        alert('An error occurred while creating the room.');
        const startButton = document.getElementById('start-btn'); // reset button state if transition fails
        if (startButton) resetStartButtonState(startButton);
    }
}

// --- SOCKET EVENT LISTENERS ---

socket.on('room_created', (payload) => {
    const { roomId, token } = payload;
    sessionStorage.setItem('participantToken-' + roomId, token);
    transitionToRoom(roomId);
});

socket.on('load_history', (payload) => {
    const { history, token } = payload;
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer) return;
    const roomId = window.location.hash.substring(1);
    if (token) {
        sessionStorage.setItem('participantToken-' + roomId, token);
    }
    messagesContainer.innerHTML = '';
    lastMessageSenderId = null;
    history.forEach(item => {
        let element;
        if (item.type === 'message') {
            element = renderUserMessage(item.data);
        } else if (item.type === 'event') {
            element = renderEventMessage(item.data);
        }
        if (element) {
            messagesContainer.appendChild(element);
        }
    });
    scrollToBottom();
});

socket.on('user_event', (data) => {
    const element = renderEventMessage(data); 
    element.classList.add('animate-in');
    addMessageToDOM(element);
});

socket.on('receive_message', (data) => {
    const element = renderUserMessage(data);
    element.classList.add('animate-in');
    addMessageToDOM(element);
});

socket.on('room_closed', (message) => {
    alert(message);
    window.location.href = 'index.html';
});

socket.on('join_error', (message) => {
    alert(message);
    window.location.href = 'index.html';
});