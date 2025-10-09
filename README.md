caecus — temporary chatrooms
------------------------

caecus is a real-time chat application that allows users to create temporary, anonymous chatrooms.

[screenshot of the chat room interface]

FEATURES
------------------------
✨  ANONYMOUS: No accounts or identifying info — users are assigned a randomized username, which is truncated and deterministically assigned a unique colour to make conversations easier to follow

✨  EPHEMERAL: The chatroom and its entire history are completely purged from the server 10 seconds after the host disconnects (a grace period for users with inconsistent internet connections)

✨  SHAREABLE: Room codes are unique enough to be impossible to guess, but can be easily accessed with the clickable URL or QR codes

TECH STACK
------------------------
🛠️  HTML5 & CSS3: structure and styling

🛠️  JAVASCRIPT: client-side logic

🛠️  SOCKET.IO: library for bidirectional communication

🛠️  DOMPURIFY: library preventing code injection on transmitted messages

🛠️  QRCODE-GENERATOR: library that's appropriately named

🛠️  UUID: library for unique room identifiers

🛠️  NODE.JS: runtime environment

🛠️  EXPRESS: web framework for serving static files

CODEBASE
------------------------

caecus/
├── index.html          # Landing page
├── room.html           # Chat room page template
├── style.css           # Retro terminal styling and layout
├── server.js           # Node.js, Express, and Socket.IO backend
├── main.js             # Client-side UI and WebSocket logic
└── assets/
    ├── favicon.ico     # Site favicon
    └── ...             # Fonts, etc.

MECHANICAL FLOW
------------------------

⚙️  User arrives at the site and is immediately assigned a randomized visitor ID<br>
⚙️  Clicking the "> START ROOM" button sends a create_room event to the server via Socket.IO<br>
⚙️  The server generates a unique room ID, creates an associated room object, and emits a room_created event back to the client<br>
⚙️  The browser learning the room ID triggers JavaScript that redirects the user to the unique URL, then sends a join_room event back to the server<br>
⚙️  The server recognizes the oldSocketId and re-associates the user, updating their ID with a new one, then broadcasting the updated participant list to the room<br>
⚙️  Usernames are quite long (e.g.: HsJ78HmzhwS-iuJLAAKj), so they're truncated and assigned a colour identifier to make it easy to differentiate users from one another<br>
⚙️  The room functions by storing the last 10 messages in memory and culling anything beyond that immediately<br>
⚙️  When a user sends a message, the server broadcasts that message to all other clients in the same room and adds it to the message history<br>
⚙️  Clickable share buttons offer text- and image-based ways to share the room with others<br>
⚙️  When others join, the server repeats the process of assigning pseudonymous identifiers, broadcasts their arrival to the chatroom, and provides them the stored conversation context<br>
⚙️  If the room's owner disconnects, the server allows a grace period of 10 seconds to reconnect for users with poor internet connections<br>
⚙️  If the owner doesn't return, the server emits a emits a room_closed event, boots all room participants, and deletes the room and its message history from memory

GETTING STARTED
------------------------
Just use the [site](https://caecus.ca/)!

📜 License
------------------------

See [MIT License](https://opensource.org/license/mit) or project directory's LICENSE.md file.