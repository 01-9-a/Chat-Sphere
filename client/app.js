// Removes the contents of the given DOM element (equivalent to elem.innerHTML = '' but faster)
function emptyDOM(elem){
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

// Creates a DOM element from the given HTML string
function createDOM(htmlString){
    let template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

//global variable for profile
var profile = { username: "Alice" };

//global Service object
const Service = {
    origin: window.location.origin, 

    getLastConversation: function(roomId, before) {
        // Construct the URL with the roomId and before query parameter
        const url = new URL(`/chat/${roomId}/messages`, window.location.origin);
        if (before) {
            url.searchParams.append('before', before);
        }

        // Make the AJAX GET request
        return fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(conversation => {
                // Resolve the promise with the conversation object
                return conversation;
            })
            .catch(error => {
                console.error('Error fetching last conversation:', error);
                throw error;
            });
    },

    getAllRooms: function() {
        return new Promise((resolve, reject) => {
            fetch(`${this.origin}/chat`)
                .then(response => {
                    if (!response.ok) { 
                        return response.text().then(text => {
                            reject(new Error(text || 'Server error'));
                        });
                    }
                    return response.json();
                })
                .then(data => resolve(data))
                .catch(error => {
                    // This catch will handle network errors and errors thrown from the above if condition
                    reject(error);
                });
        });
    }
};

function* makeConversationLoader(room) {
    let before = room.creationTime;
    // console.log(before);
    while (true) {
        room.canLoadConversation = false; 

        const conversationPromise = Service.getLastConversation(room.id, before);
        yield conversationPromise.then(conversation => {
            if (conversation && conversation.messages.length > 0) {
                room.addConversation(conversation);
                before = conversation.timestamp;
                room.canLoadConversation = true;
            } else {
                room.canLoadConversation = false;
                return;
            }
        }).catch(error => {
            console.error('Error fetching last conversation:', error);
            room.canLoadConversation = false;
        });

        if (!room.canLoadConversation) {
            break;
        }
    }
}



class LobbyView {
    constructor(lobby) {
        this.lobby = lobby;
        var lobbyPage = createDOM(
            `<div id="page-view">
                <div class="content">
                    <ul class="room-list">
                        <li><a href="#/chat">CPEN322 Text Channel</a></li>
                        <li><a href="#/chat">Foodies Only</a></li>
                        <li><a href="#/chat">CPEN355</a></li>
                    </ul>
                    <div class="page-control">
                        <input type="text" placeholder="Room Title">
                        <button>Create Room</button>
                    </div>
                    <div class="logout-button-container">
                        <button id="logout-button">Sign Out</button>
                    </div>   
                </div>
            </div>`
        );
        this.elem = lobbyPage;
        this.listElem = this.elem.querySelector('ul.room-list');
        this.inputElem = this.elem.querySelector('input');
        this.buttonElem = this.elem.querySelector('button');
        this.logoutButton = this.elem.querySelector('#logout-button');

        this.redrawList(); 

        this.buttonElem.addEventListener('click', () => {
            const roomName = this.inputElem.value.trim();
            const roomImage = 'assets/everyone-icon.png'; 
        
            if (roomName) {
                Service.addRoom({ name: roomName, image: roomImage })
                    .then(newRoom => {
                        // Now we add the room to the lobby
                        this.lobby.addRoom(newRoom._id, newRoom.name, newRoom.image);
                        this.inputElem.value = '';
                        this.redrawList();
                    })
                    .catch(error => {
                        console.error('Failed to create room:', error);
                    });
            }
        });

        this.logoutButton.addEventListener('click', () => {
            fetch('/logout')
                .then(response => {
                    // Assuming your server redirects to '/login' on successful logout
                    window.location.href = '/login';
                })
                .catch(error => {
                    console.error('Logout failed:', error);
                });
        });
        
        
        // create link when new room created
        this.lobby.onNewRoom = (newRoom) => {
            const roomElement = createDOM(`<li><a href="#/chat/${newRoom.id}">${newRoom.name}</a></li>`);
            this.listElem.appendChild(roomElement);
        };
    }

   
    redrawList() {
        emptyDOM(this.listElem); // Clear the list before redrawing it

        for (const roomId in this.lobby.rooms) {
            const room = this.lobby.rooms[roomId];
            const roomElement = createDOM(`
                <li>
                    <img src="${room.image}" alt="${room.name}" class="room-image">
                    <a href="#/chat/${roomId}">${room.name}</a>
                </li>
            `);
            this.listElem.appendChild(roomElement);
        }
    }
    
}

class ChatView {
    constructor(socket) {
        this.socket = socket;
        var chatPage = createDOM(
            `<div id="page-view">
                <div class="content">
                    <h4 class="room-name">Everyone in CPEN322</h4>
                    <div class="message-list">
                        <div class="message">
                            <span class="message-user">Bob</span>
                            <span class="message-text">Hi there!</span>
                        </div>
                        <div class="message my-message">
                            <span class="message-user">Alice</span>
                            <span class="message-text">Hi!</span>
                        </div>
                        <div class="message">
                            <span class="message-user">Bob</span>
                            <span class="message-text">How is everone doing today?</span>
                        </div>
                        <div class="message my-message">
                            <span class="message-user">Alice</span>
                            <span class="message-text">I'm doing great! I just finished my project.</span>
                        </div>
                        <div class="message">
                            <span class="message-user">Charlie</span>
                            <span class="message-text">Ugh... I'm still stuck trying to debug my sorting algorithm...</span>
                        </div>
                        <div class="message">
                            <span class="message-user">Bob</span>
                            <span class="message-text">Do u need any help with that Charile?</span>
                        </div>
                        <div class="message my-message">
                            <span class="message-user">Alice</span>
                            <span class="message-text">I can help with that too!</span>
                        </div>
                    </div>
                    <div class="smart-reply-container">
                        <span class="smart-reply">smart reply</span>
                    </div>
                    <div class="page-control">
                        <textarea type="send"></textarea>
                        <button>Send</button>
                    </div>
                </div>
            </div>`
        );
        this.elem = chatPage;
        this.titleElem = this.elem.querySelector('h4.room-name');
        this.chatElem = this.elem.querySelector('div.message-list');
        this.inputElem = this.elem.querySelector('textarea');
        this.buttonElem = this.elem.querySelector('button');

        //initialize room to null
        this.room = null;


        this.buttonElem.addEventListener('click', () => {
           this.sendMessage();
        });

        this.inputElem.addEventListener('keyup', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.sendMessage();
            }
        });

        this.chatElem.addEventListener('wheel', (event) => {
        // Immediate logging to understand the current state in the test environment.
        const currentScrollTop = this.chatElem.scrollTop;
        void this.chatElem.offsetHeight;

    // The actual operational logic based on synchronous DOM event behavior.
        if (this.chatElem.scrollTop === 0 && event.deltaY < 0 && this.room && this.room.canLoadConversation) {
            this.room.getLastConversation.next();
        }
        });
    }
    sendMessage() {
        const text = this.inputElem.value.trim();
        //this.chatElem.scrollTop = this.chatElem.scrollHeight;
        if (text && this.room) {
            const message = {roomId: this.room.id, username: profile.username, text};
            this.socket.send(JSON.stringify(message));
            this.room.addMessage(profile.username, text);
            this.inputElem.value = '';
        }
    }
    setRoom(room) {

        this.room = room;
    
        this.titleElem.textContent = room.name;
        emptyDOM(this.chatElem);

        //existed messages
        this.room.messages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            this.chatElem.appendChild(messageElement);
        });

        // Set up listener for new messages
        this.room.onNewMessage = (message) => {
            const messageElement = this.createMessageElement(message);
            this.chatElem.appendChild(messageElement);
            this.scrollToBottom(); 
        };

        this.room.onFetchConversation = (conversation) => {
            const oldScrollHeight = this.chatElem.scrollHeight;
            for (let i = conversation.messages.length - 1; i >= 0; i--) {
                const message = conversation.messages[i];
                const messageElement = this.createMessageElement(message);
                this.chatElem.prepend(messageElement); 
                //console.log(messageElement.outerHTML); 
            }
            const newScrollHeight = this.chatElem.scrollHeight;
            this.chatElem.scrollTop += newScrollHeight - oldScrollHeight;
        };
        if (!room.messages || room.messages.length === 0) {
            this.setSmartReplies(["Hiiii!", "How are you?", "I'm busy now. I will reply to u later."]);
        } else {
            // If there were previous chats, smart replies should depend on the backend model
            // This implies you have a mechanism to fetch smart replies from your backend
            // For demonstration, let's assume you have a fetchSmartReplies function
            // Note: You need to implement fetchSmartReplies or similar function based on your backend
            this.fetchSmartReplies(room.id).then(smartReplies => {
                this.setSmartReplies(smartReplies);
            }).catch(error => {
                console.error('Error fetching smart replies:', error);
                // Fallback to default smart replies in case of error
                this.setSmartReplies(["Hi!", "How are you?", "I'm busy now. I will reply to u later."]);
            });
        }
    }
    //create the DOM element for a message
    createMessageElement(message) {
        const messageElem = document.createElement('div');
    // Set class to 'message' to meet test requirements
        //messageElem.className = 'message'; // Originally was conditional based on username

        messageElem.className = message.username === profile.username ? 'my-message' : 'message';
    
        const userSpan = document.createElement('span');
        userSpan.className = 'message-user';
        userSpan.textContent = message.username; 
    
        const textSpan = document.createElement('span');
        textSpan.className = 'message-text';
        textSpan.textContent = message.text;
    
        messageElem.appendChild(userSpan);
        messageElem.appendChild(textSpan);
    
        return messageElem;
    }


setSmartReplies(smartReplies) {
    // Filter out duplicates by creating a Set from the array.
    const uniqueReplies = [...new Set(smartReplies)];

    // If we have more than three, slice the array to only get the first three.
    const repliesToShow = uniqueReplies.slice(0, 3);

    console.log('Using smart replies:', repliesToShow);
    const smartReplyContainer = this.elem.querySelector('.smart-reply-container');
    emptyDOM(smartReplyContainer); // Clear existing smart replies

    repliesToShow.forEach(reply => {
        const replyElement = document.createElement('span');
        replyElement.classList.add('smart-reply');
        replyElement.textContent = reply;
        replyElement.onclick = () => {
            this.inputElem.value = reply; // Set the chosen reply as the input value
            this.inputElem.focus(); // Focus the input element
            // Optional: Send the message immediately on click
            // this.sendMessage();
        };
        smartReplyContainer.appendChild(replyElement);
    });
}
    
    scrollToBottom() {
        // Assuming this.chatElem is the element containing your messages
        this.chatElem.scrollTop = this.chatElem.scrollHeight;
    }

    
}


class ProfileView {
    constructor() {
        var profilePage = createDOM(
            `<div id="page-view">
                <div class="content">
                    <div class="profile-form">
                        <div class="form-field">
                            <label>Username:</label>
                            <input type="text">
                        </div>
                        <div class="form-field">
                            <label>Password:</label>
                            <input type="password">
                        </div>
                        <div class="form-field">
                            <label>Avatar Image</label>
                            <input type="file">
                        </div>
                        <div class="form-field">
                            <label>About</label>
                            <input type="about">
                        </div>
                    </div>
                    <div class="page-control">
                        <button>Save</button>
                    </div>
                </div>
            </div>`
        );
        this.elem = profilePage;
    }
}

class Room {
    constructor(id, name, image , messages = []) {
        this.id = id;
        this.name = name;
        this.image = image || 'assets/everyone-icon.png'; //default room images
        this.messages = messages;

        this.canLoadConversation = true;
        this.creationTime = Date.now();
        this.getLastConversation = makeConversationLoader(this);    
    }

    addMessage(username, text) {
        if (!text.trim()) return;

        const message = {username, text};
        this.messages.push(message);
        //console.log(message);
        
        //call onNewmessage Handeler when new message happens
        if (typeof this.onNewMessage === 'function') {
            this.onNewMessage(message);
        }
    }

    addConversation(conversation) {
        
        this.messages.unshift(...conversation.messages);
        if (typeof this.onFetchConversation === 'function') {
            this.onFetchConversation(conversation);
        }
    }
}

class Lobby {
    constructor() {
        this.rooms = {
            '1': new Room('1', 'Room 1'),
            '2': new Room('2', 'Room 2'),
            '3': new Room('3', 'Room 3'),
            '4': new Room('4', 'Room 4')
        };
    }

    getRoom(roomId) {
        return this.rooms[roomId];
    }

    addRoom(id, name, image, messages) {
        if (!this.rooms[id]) { 
            const newRoom = new Room(id, name, image, messages);
            this.rooms[id] = newRoom;
            if (this.onNewRoom) {
                this.onNewRoom(newRoom);
            }
        }
    }
}

Service.addRoom = function(data) {
    return new Promise((resolve, reject) => {
        fetch(`${this.origin}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(text || 'Unknown server error'); 
                });
            }
            return response.json(); 
        })
        .then(data => resolve(data))
        .catch(error => reject(error));
    });
};

Service.getProfile = function() {
    return fetch(`${this.origin}/profile`, {
        credentials: 'include' // This is important for cookies to be sent and received
    })
    .then(response => {
        if (!response.ok) { 
            throw new Error('Failed to fetch profile');
        }
        return response.json();
    });
};

function main() {
    const socket = new WebSocket('ws://localhost:8000');
    const lobby = new Lobby();
    lobby.rooms = {};
    const lobbyView = new LobbyView(lobby); 
    const chatView = new ChatView(socket);
    const profileView = new ProfileView();
    socket.addEventListener('open', function(event) {
        console.log('WebSocket is open now.');
    });
    
    socket.addEventListener('error', function(event) {
        console.log('WebSocket error:', event);
    });
    //add socket message event listener
    socket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);

        if (data.smartReplies) {

            console.log('Received smart replies:', data.smartReplies);
            chatView.setSmartReplies(data.smartReplies);
        } 
        const {roomId, username, text} = data;
        const room = lobby.getRoom(roomId);
        room.addMessage(username, text);
    });
    

    //refresh the lobby - D.ii
    function refreshLobby() {
        Service.getAllRooms().then(rooms => {
            rooms.forEach(room => {
                if (lobby.rooms[room._id]) {
                    lobby.rooms[room._id].name = room.name;
                    lobby.rooms[room._id].image = room.image;
                } else {
                    lobby.addRoom(room._id, room.name, room.image, room.messages || []);
                }
            });
            lobbyView.redrawList();
        }).catch(error => {
            console.error('Failed to refresh lobby:', error);
        });
    }
    
    refreshLobby();

    function renderRoute(){
        const route = window.location.hash.slice(1);
        const [, path, roomId] = route.split('/');
        const pageView = document.getElementById('page-view');
        emptyDOM(pageView);

        switch (path) {
            case '':
                pageView.appendChild(lobbyView.elem);
                break;
            case 'chat':
                pageView.appendChild(chatView.elem);
                break;
            case 'profile':
                pageView.appendChild(profileView.elem);
                break;
            default:
                pageView.innerHTML = '<div>Page not found</div>';
                break;
        }

        if (path === 'chat' && roomId) {
            const room = lobby.getRoom(roomId);
            if (room) {
                chatView.setRoom(room);
            } else {
                console.error('Room does not exist.');
            }
        }
    }
    
    Service.getProfile().then(profileData => {
        profile.username = profileData.username;
        
        if (!window.location.hash || window.location.hash === '#/') {
            window.location.hash = '/'; // Adjust if your default route is different
        }
        renderRoute(); // Make sure to render the route based on the hash
    }).catch(error => {
        console.error('Error fetching profile:', error);
        // Redirect to the login page if there's an error fetching the profile
        window.location.href = '/login.html';
    });

    window.addEventListener('hashchange', renderRoute);
    renderRoute(); // Call it to ensure the right route is loaded on start

    setInterval(refreshLobby, 5000); 

    cpen322.export(arguments.callee, {
        lobby: lobby,
        chatView: chatView,
    });
}


window.addEventListener('load', main); // Ensure 'main' initializes everything first
