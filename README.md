GONZO — temporary chatrooms
------------------------

GONZO is a real-time chat application that allows users to create temporary, anonymous chatrooms.

[screenshot of the chat room interface]

FEATURES
------------------------
✨  ANONYMOUS: No accounts or identifying info — users are assigned a randomized username, which is used to generate a unique colour to make conversations easier to follow

✨  EPHEMERAL: The chatroom and its entire history are completely purged from the server 3 seconds after the host disconnects (the grace period is for users with inconsistent  internet connections)

✨  SHAREABLE: Room codes are unique enough to be impossible to guess, but can be easily accessed with the clickable URL or QR codes

TECH STACK
------------------------
🛠️  HTML5 & CSS3: structure and styling

🛠️  JAVASCRIPT: client-side logic

🛠️  SOCKET.IO: library for bidirectional communication

🛠️  QRCODE-GENERATOR: library that's appropriately named

🛠️  UUID: library for unique room identifiers

🛠️  NODE.JS: runtime environment

🛠️  EXPRESS: web framework for serving static files

CODEBASE
------------------------
📁
├── index.html          # landing page
├── room.html           # chat room page template
├── style.css           # retro terminal styling and responsive layout parameters
├── server.js           # node.js, express, and socket.io backend logic
├── main.js             # client-side javascript for handling ui and websocket events
└── assets/
    └── favicon.ico     # site favicon

MECHANICAL FLOW
------------------------

⚙️  User arrives at the site and is immediately assigned a randomized visitor ID (example console log: "Connected to server as HsJ78HmzhwS-iuJLAAKj")

⚙️  Clicking the "> START ROOM" button sends a "create_room" event to the server via Socket.IO

⚙️  The server generates a unique room ID, creates a new room object in server memory, gives the creator the "owner" tag, and emits a "room_created" event back to the client with the new room ID

⚙️  The server's emission triggers client-side JavaScript to redirect the user to the unique room URL, then sends a join_room event back to the server

⚙️  

⚙️  

⚙️ The client is redirected to the unique room URL (e.g., room.html#...). This page load creates a new socket connection and a new ID.

⚙️ Upon loading room.html, the client script reads the room ID from the URL. It also retrieves the previous socket ID from session storage and sends both to the server in a join_room event.

⚙️ The server receives the join_room event. It recognizes the oldSocketId and correctly re-associates the user (whether they are the owner or a participant), updating their ID to the new one. It then broadcasts the updated participant list to everyone in the room.

⚙️ After a successful join, the server sends the last 10 messages and events (load_history) to the new user for context. The client then updates its session storage with its new socket ID, ensuring it can be recognized again if it has to reconnect.

⚙️ Other users join using the same URL. As they join, the server adds them to the room's participant list and broadcasts the update.

⚙️ When a user sends a message, the server broadcasts that message to all other clients in the same room and adds it to the room's message history.

⚙️ If the designated "owner" of the room disconnects, a 3-second timer starts. If they do not reconnect within this window (by reloading the page, which triggers the join_room flow), the server emits a room_closed event to all participants and deletes the room and its message history from memory.

GETTING STARTED
------------------------
Just use the [site](https://gonzo.sandyfletcher.ca/)!

Before you go saying it has problems connecting, wait another minute or two.

I'm using the free tier from Render to host the server and it'll power off if no one's used it in a while.

Should work perfectly once it's had that first coffee.

📜 License
------------------------

This project is open-source, but I might add a LICENSE.md file with the MIT License