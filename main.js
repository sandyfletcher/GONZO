// --- STATE ---

const MAX_DISPLAYED_MESSAGES = 10; // Corresponds to MAX_HISTORY on the server
let lastMessageSenderId = null;
const socket = io("https://fastchat-0opj.onrender.com/");
const PARTICIPANT_EMOJIS = [
    '👾', '👽', '🤖', '👻', '🎃', '🤡', '🐸', '🐙', '🦖', '🦋', '🚀', '🛰️', '🔭', '🛸', '☄️',
    '🐉', '👹', '👺', '🦄', '🐲', '🧟', '🧛', '🧙', '🧜', '🧞', '🧚', '🗿', '💎', '🔮', '🧿',
    '🦉', '🦊', '🦇', '🦂', '🕷️', '🦑', '🦀', '🦈', '🐌', '🐍', '💀', '☠️', '💾', '🔑', '💣',
    '⚙️', '⚛️', '☣️', '☢️', '🌀'
];

socket.on('connect', () => {
    console.log("Connected to server as", socket.id); // if on a room page, join room — handles both initial connection and any subsequent reconnections
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

// --- PAGE SETUP ---

document.addEventListener('DOMContentLoaded', () => { 
    if (document.getElementById('start-btn')) { // route to correct setup function based on page content
        setupIndexPage();
    } else if (document.querySelector('.room')) {
        setupRoomPage();
    }
});

function setupIndexPage() {
    const startButton = document.getElementById('start-btn');
    startButton.disabled = false;
    startButton.textContent = '> START ROOM';
    startButton.classList.remove('is-loading');
    startButton.addEventListener('click', (e) => {
        e.preventDefault();
        startButton.disabled = true;
        startButton.textContent = '> CONNECTING...';
        startButton.classList.add('is-loading');
        console.log("Requesting a new room from server...");
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
        qrElements: document.querySelectorAll('.qr-code'),
        memberLists: document.querySelectorAll('.member-list'),
    };
    if (!roomId) {
        ui.messagesContainer.innerHTML = '<p>ERROR: No room ID specified. Start a new room.</p>';
        ui.messageForm.style.display = 'none';
        return; // stop execution
    }
    initializeRoomUI(roomId, ui);
    setupMessageForm(roomId, ui);
}

// --- ROOM PAGE ---

function scrollToBottom() {
    const messagesContainer = document.querySelector('.messages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function showCopyConfirmation(element) { // visual feedback on copy
    element.classList.add('copied');
    setTimeout(() => {
        element.classList.remove('copied');
    }, 1500);
}

function initializeRoomUI(roomId, ui) { //  set up click-to-copy functionality
    document.title = `GONZO — [${roomId.substring(0, 6)}]`;
    const roomUrl = window.location.href;
    const linkEl = ui.roomLinkElement;
    if (linkEl) { // check for element existence
        linkEl.textContent = `Room: ${roomId.substring(0, 8)}...`;
        linkEl.addEventListener('click', () => { // click to copy text link
            navigator.clipboard.writeText(roomUrl).then(() => {
                showCopyConfirmation(linkEl);
            }).catch(err => console.error('Failed to copy text: ', err));
        });
    }
    ui.qrElements.forEach(qrElement => {
        if (!qrElement) return;
        qrElement.innerHTML = ''; // clear placeholder
        const qr = qrcode(0, 'L');
        qr.addData(roomUrl);
        qr.make();
        qrElement.innerHTML = qr.createImgTag(4, 4);
        const qrImg = qrElement.querySelector('img');
        qrElement.addEventListener('click', () => { // click to copy QR image
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
    });
}

function joinRoom(roomId) {
    const participantToken = sessionStorage.getItem('participantToken-' + roomId); // read participant token
    console.log(`Attempting to join room ${roomId} with token: ${participantToken}`);
    socket.emit('join_room', { roomId, participantToken }); // send token to server
}

// --- RENDERING ---

function pruneOldMessages() {
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer) return;
    while (messagesContainer.childElementCount > MAX_DISPLAYED_MESSAGES) { // if greater than limit, remove oldest one / first child
        if (messagesContainer.firstChild) {
            messagesContainer.removeChild(messagesContainer.firstChild);
        }
    }
}

function renderUserMessage(data) { // returns element instead of adding it to DOM
    const messageElement = document.createElement('p');
    if (data.sender.id === lastMessageSenderId) { // check if sender is same as last one
        messageElement.classList.add('consecutive-message');
    }
    const sender = data.sender;
    const userColor = getUsernameColor(sender.username);
    const usernameStrong = document.createElement('strong');
    const usernameSpan = document.createElement('span');
    usernameSpan.style.color = userColor;
    usernameSpan.textContent = sender.username;
    usernameStrong.appendChild(document.createTextNode('<')); // explicitly create text nodes for characters that could be interpreted as HTML
    usernameStrong.appendChild(usernameSpan);
    usernameStrong.appendChild(document.createTextNode('>'));
    const messageText = document.createTextNode(` ${data.message}`);
    messageElement.appendChild(usernameStrong);
    messageElement.appendChild(messageText);
    lastMessageSenderId = data.sender.id; // update last sender ID
    return messageElement;
}

function renderEventMessage(data) { // This function now returns the element instead of adding it to the DOM
    const eventElement = document.createElement('p');
    eventElement.classList.add('event-message');
    eventElement.textContent = data.text;

    lastMessageSenderId = null; // event message breaks chain of consecutive user messages
    return eventElement;
}

// --- SOCKET EVENT LISTENERS ---

socket.on('room_created', (roomId) => {
    console.log(`Server created room. ID: ${roomId}`);
    window.location.href = `room.html#${roomId}`;
});

socket.on('load_history', (payload) => {
    const { history, token } = payload; // destructure payload to get history and token
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer) return;
    const roomId = window.location.hash.substring(1);
    if (token) { // if we received a token, store it securely in sessionStorage
        console.log(`Received and stored participant token for room ${roomId}.`);
        sessionStorage.setItem('participantToken-' + roomId, token);
    }
    messagesContainer.innerHTML = ''; // clear placeholder text
    lastMessageSenderId = null; // reset for history load
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
    scrollToBottom(); // scroll once after loading all history
});

socket.on('update_participants', (participants) => {
    console.log('Updating participants:', participants);
    const memberLists = document.querySelectorAll('.member-list');
    memberLists.forEach(memberList => {
        memberList.classList.remove('two-columns'); // temporarily set to single column for measurement
        memberList.innerHTML = ''; // clear and populate list
        participants.forEach((p, index) => {
            const li = document.createElement('li');
            let prefix = '';
            if (index === 0) { // assign prefix emojis prefix
                prefix = '👑 ';
            } else {
                const userEmoji = getEmojiForUser(p.username);
                prefix = userEmoji + ' ';
            }
            if (p.id === socket.id) { // apply 'is-me' class
                li.classList.add('is-me');
            }
            li.textContent = `${prefix}${p.username}`; // set list item content
            memberList.appendChild(li);
        });
        if (memberList.scrollHeight > memberList.clientHeight) { // check if content height (calculated in column-count: 1) overflows the container
            memberList.classList.add('two-columns'); // if yes, switch to column-count: 2
        } 
    });
});

socket.on('user_event', (data) => { // handles a user join/leave event
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer) return;
    const eventElement = renderEventMessage(data);
    messagesContainer.appendChild(eventElement);
    pruneOldMessages();
    scrollToBottom();
});

socket.on('receive_message', (data) => {
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer) return;
    const messageElement = renderUserMessage(data);
    messagesContainer.appendChild(messageElement);
    pruneOldMessages();
    scrollToBottom();
});

socket.on('room_closed', (message) => {
    alert(message);
    window.location.href = 'index.html';
});

socket.on('join_error', (message) => {
    alert(message);
    window.location.href = 'index.html';
});