const MAX_DISPLAYED_MESSAGES = 10; // corresponds to MAX_HISTORY on the server
let lastMessageSenderId = null;
// Connect to the server. This connection should persist across "page" transitions.
const socket = io("https://fastchat-0opj.onrender.com/");

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
    const roomIdFromHash = window.location.hash.substring(1);
    if (roomIdFromHash) {
        // User is loading a room link directly.
        // We must dynamically load room content and set up its logic.
        loadRoomContentAndSetup(roomIdFromHash);
    } else {
        // User is loading the landing page.
        setupIndexPage();
    }
});

// This function loads the room HTML and then sets up the room's specific JS logic.
async function loadRoomContentAndSetup(roomId) {
    try {
        const response = await fetch('room.html');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const roomContent = doc.querySelector('.room.terminal-box');
        const landingContent = document.querySelector('.landing.terminal-box');

        if (roomContent && landingContent) {
            // Replace landing page content with room content directly (no animation on initial load)
            landingContent.replaceWith(roomContent);

            // *** THE FIX: ***
            // After content is replaced, call the setup function for the room page.
            setupRoomPage();

        } else {
            console.error('Could not find necessary content to initialize room page.');
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Failed to load room content:', error);
        alert('Could not load the room. Please try again.');
        window.location.href = 'index.html'; // Redirect to index on error
    }
}


// Listen for the pageshow event to handle bfcache restores (for the landing page button)
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        // If the page was restored from bfcache, ensure the landing page button is reset.
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
    if (!startButton) return; // Guard if this function is called on room page
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
function setupRoomPage() {
    const roomId = window.location.hash.substring(1);
    if (!roomId) { // Should not happen if loadRoomContentAndSetup is called correctly
        console.error("setupRoomPage called without a roomId in hash.");
        window.location.href = 'index.html';
        return;
    }

    const ui = {
        messagesContainer: document.querySelector('.messages'),
        messageForm: document.getElementById('message-form'),
        messageInput: document.getElementById('message-form').querySelector('input'),
        roomLinkElement: document.getElementById('room-link'),
        qrElement: document.querySelector('.qr-code'),
        memberList: document.querySelector('.member-list'),
    };

    // Guard against missing elements that might occur if room.html is malformed
    if (!ui.messagesContainer || !ui.messageForm || !ui.roomLinkElement || !ui.qrElement || !ui.memberList) {
        console.error("One or more required room page elements not found.");
        alert("Error loading room details.");
        window.location.href = 'index.html';
        return;
    }

    initializeRoomUI(roomId, ui);
    setupMessageForm(roomId, ui);
    
    // *** CRITICAL FIX ***
    // Now that the room page elements are set up, we need to tell the server
    // that this client wants to join this room.
    joinRoom(roomId);
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
    const roomUrl = `${window.location.origin}${window.location.pathname}#${roomId}`; // Construct full URL

    const linkEl = ui.roomLinkElement;
    linkEl.textContent = `Room: ${roomId.substring(0, 8)}...`;
    linkEl.addEventListener('click', () => {
        navigator.clipboard.writeText(roomUrl).then(() => {
            showCopyConfirmation(linkEl);
        }).catch(err => console.error('Failed to copy text: ', err));
    });

    const qrElement = ui.qrElement;
    qrElement.innerHTML = ''; // Clear placeholder
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
    // Retrieve the participant token from sessionStorage. This is crucial for rejoining a room
    // or for the server to recognize the user across socket reconnections.
    const participantToken = sessionStorage.getItem('participantToken-' + roomId);
    console.log(`Attempting to join room ${roomId} with token: ${participantToken}`);
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
    lastMessageSenderId = null; // Event message breaks the chain of consecutive messages
    return eventElement;
}

// --- PAGE TRANSITION ---

// in main.js

async function transitionToRoom(roomId) {
    try {
        const response = await fetch('room.html');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const roomContent = doc.querySelector('.room.terminal-box');
        const landingContent = document.querySelector('.landing.terminal-box');

        if (landingContent && roomContent) {
            // Animate out the old content
            landingContent.style.animation = 'slide-out-left 0.6s ease-out forwards';
            
            // After the animation, replace content and set up the new page
            setTimeout(() => {
                landingContent.replaceWith(roomContent);
                // Update URL without a full reload. `replaceState` is used so the user can't
                // click "back" to the non-existent "creating room" state.
                const newUrl = `#${roomId}`; // Use fragment identifier for room ID
                window.history.replaceState({path: newUrl}, '', newUrl);
                
                // *** THE FIX: ***
                // After the DOM is updated with room content, call the setup function 
                // to attach event listeners and join the room.
                setupRoomPage();
                
            }, 600); // Must match animation duration in CSS for slide-out-left
        } else {
            console.error("Failed to find landing or room content during transition.");
            alert("An error occurred during room transition.");
            const startButton = document.getElementById('start-btn');
            if (startButton) resetStartButtonState(startButton);
        }
    } catch (error) {
        console.error('Failed to transition to room:', error);
        alert('An error occurred while creating the room.');
        const startButton = document.getElementById('start-btn');
        if (startButton) resetStartButtonState(startButton);
    }
}

// --- SOCKET EVENT LISTENERS ---

// This listener needs to be at the top level so it's active when the socket connects.
socket.on('connect', () => {
    console.log("Socket connected. ID:", socket.id);
    // If we've landed directly on a room page (e.g., via a shared link),
    // we need to ensure we join the room. This handler covers that.
    const roomId = window.location.hash.substring(1);
    if (roomId) {
        // We only join if the room page's setup has already run and called joinRoom.
        // If it hasn't (e.g., direct URL load), this will trigger it.
        // We might need a flag to prevent duplicate joins if setupRoomPage runs first.
        // For now, let's assume `joinRoom` handles rejoining gracefully.
        if (!document.querySelector('.room.terminal-box')) {
             // If we are on the landing page but a room ID is in the hash,
             // this means we need to transition to the room page.
             loadRoomContentAndSetup(roomId);
        } else {
             // If we are already on the room page and reconnected, ensure we are joined.
             // `setupRoomPage` will call `joinRoom`, but this ensures a re-connection also tries to join.
             joinRoom(roomId);
        }
    }
});

socket.on('room_created', (payload) => {
    const { roomId, token } = payload;
    sessionStorage.setItem('participantToken-' + roomId, token); // Store token for future sessions/reconnects
    transitionToRoom(roomId);
});

socket.on('load_history', (payload) => {
    const { history, token } = payload;
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer) return;
    const roomId = window.location.hash.substring(1);

    if (token) { // If a new token was generated (e.g., first join or reconnect with old token)
        sessionStorage.setItem('participantToken-' + roomId, token);
    }

    messagesContainer.innerHTML = ''; // Clear placeholder
    lastMessageSenderId = null; // Reset for history load

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
    scrollToBottom(); // Scroll to bottom once history is loaded
});

socket.on('update_participants', (participants) => {
    const memberList = document.querySelector('.member-list');
    if (!memberList) return;

    memberList.innerHTML = ''; // Clear previous list
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

    // Adjust columns and scrollability based on content
    if (memberList.scrollHeight > memberList.clientHeight) {
        memberList.classList.add('two-columns');
        if (memberList.scrollHeight > memberList.clientHeight) {
            memberList.classList.add('is-scrollable');
        }
    }
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
    // When a room is closed, we want to go back to the landing page.
    window.location.href = 'index.html';
});

socket.on('join_error', (message) => {
    alert(message);
    // If joining a room fails, go back to the landing page.
    window.location.href = 'index.html';
});