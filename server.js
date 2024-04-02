// assuming cpen322-tester.js is in the same directory as server.js
const cpen322 = require('./cpen322-tester.js');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const express = require('express');
const broker = new WebSocket.Server({port: 8000});
const Database = require('./Database');
const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'cpen322-messenger';
const db = new Database(mongoUrl, dbName);
const messageBlockSize = 10;
const SessionManager = require('./SessionManager');
const sessionManager = new SessionManager();
const crypto = require('crypto');
const OpenAI = require("openai").default;
const dotenv = require('dotenv');
dotenv.config();



const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, 
  });

async function getAIResponse(messages) {
    try {
        let prompt = "In a chatroom, the conversation goes like this:\n";
        messages.forEach(message => {
          prompt += `${message.username}: ${message.text}\n`;
        });
        prompt += "Reply to the last user as if you are a real person in this group chat and no need to tell who you are, just start with the message directly.";
        
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{role: "user", content: prompt}],
        n: 6,
        max_tokens: 20
      });
      
  
      console.log(completion.choices[0].message);
      console.log(completion.choices[1].message);
      console.log(completion.choices[2].message);
      console.log(completion.choices[3].message);
      console.log(completion.choices[4].message);
      console.log(completion.choices[5].message);
    const smartReplies = completion.choices.map(choice => choice.message.content.trim());
    return smartReplies;
    } catch (error) {
      console.error("Failed to create completion:", error);
      return [];
    }
  }


function isCorrectPassword(password, saltedHash) {
    const salt = saltedHash.substring(0, 20);
    const hash = saltedHash.substring(20);
    const saltedPassword = password + salt;
    const computedHash = crypto.createHash('sha256').update(saltedPassword).digest('base64');
    return hash === computedHash;
}


console.log('WebSocket broker started on ws://localhost:8000');
broker.on('connection', function(ws, req) {
    // Parse the cookies from the request
    const cookies = req.headers.cookie?.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.split('=').map(part => part.trim());
        acc[key] = value;
        return acc;
    }, {}) || {};

    // Extract and validate the session token
    const sessionToken = cookies['cpen322-session'];
    if (!sessionToken || !sessionManager.getUsername(sessionToken)) {
        // If the session token is not valid, close the WebSocket connection
        ws.close(4001, 'Invalid session');  // 4001 is just an arbitrary close code for invalid session
        return;  
    }

    // If the session is valid, associate the WebSocket connection with the username
    const username = sessionManager.getUsername(sessionToken);
    ws.username = username;  // Store the username in the WebSocket object for later use
    ws.on('message', async function(message) {
        let data;
        try {
            data = JSON.parse(message);
            const {roomId, username, text} = data;

            // Push the message into the corresponding room's messages array
            if (messages[roomId]) {
                messages[roomId].push({username, text});
            } else {
                console.error(`Room ${roomId} not found`);
            }

        } catch (e) {
            console.error('Error parsing message JSON:', e);
            return;  // Invalid message format; stop processing
        }

        // Ensure data contains the required fields
        if (!data.roomId || !data.text) {
            console.error('Invalid message data:', data);
            return;  // Stop processing if essential fields are missing
        }
    
        // Construct a new message object, ignoring any username from the client
        const newMessage = {
            roomId: data.roomId,
            username: ws.username,  // Use the authenticated username
            text: data.text
        };

        const smartReplies = await getAIResponse(messages[data.roomId]);
        // Send the smart replies to the client along with the new message
        const messageWithReplies = { ...newMessage, smartReplies };
        broker.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(messageWithReplies));
                console.log("seng successfully---------------");
            }
        });
    });
});



function logRequest(req, res, next){
	console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
	next();
}

const host = 'localhost';
const port = 3000;
const clientApp = path.join(__dirname, 'client');


const messages = {};
db.getRooms().then(rooms => {
    rooms.forEach(room => {
        messages[room._id.toString()] = [];
    });
}).catch(err => {
    console.error("Failed to initialize messages:", err);
});


// express app
let app = express();

app.use(express.json()) 						// to parse application/json
app.use(express.urlencoded({ extended: true })) // to parse application/x-www-form-urlencoded
app.use(logRequest);							// logging for debug

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  db.getUser(username).then(user => {
      if (!user) {
          return res.redirect('/login');
      }
      
      if (isCorrectPassword(password, user.password)) {
          sessionManager.createSession(res, username);
          res.redirect('/');
      } else {
          res.redirect('/login');
      }
  }).catch(err => {
      console.error(err);
      res.status(500).send('Internal Server Error');
  });
});


app.get('/chat', sessionManager.middleware, (req, res) => {
  db.getRooms().then(rooms => {
      const chatroomsWithMessages = rooms.map(room => {
          return Object.assign({ messages: messages[room._id] || [] }, room);
      });
      res.json(chatroomsWithMessages);
  }).catch(error => {
      console.error(error);
      res.status(500).send('Internal Server Error');
  });
});

app.post('/chat', sessionManager.middleware, (req, res) => {
	const { name, image } = req.body;
  
  if (!name) {
		return res.status(400).send({ error: 'Room name is required' });
	}

  const roomToInsert = { name, image };
  db.addRoom(roomToInsert).then(newRoom => {
    messages[newRoom._id.toString()] = [];
    res.status(200).json(newRoom);
  }).catch(error => {
    console.error(error);
    res.status(500).send({ error: 'Internal Server Error' });
  });
});

app.get('/chat/:room_id', sessionManager.middleware, (req, res) => {
  const room_id = req.params.room_id;
  console.log("look here", room_id);

  db.getRoom(room_id).then(room => {
      if (room) {
          res.json(room);
      } else {
          res.status(404).send({ error: `Room ${room_id} was not found` });
      }
  }).catch(err => {
      console.error(err);
      res.status(500).send({ error: 'Internal Server Error' });
  });
});

app.get('/chat/:room_id/messages', sessionManager.middleware, (req, res) => {
  const room_id = req.params.room_id;
  
  // Extracting the before parameter from the query string, or defaulting to Date.now() if not provided
  let before = parseInt(req.query.before);
  if (isNaN(before)) {
    before = Date.now();
  }
  // Use the getLastConversation method from the Database object
  db.getLastConversation(room_id, before)
      .then(conversation => {
          if (conversation) {
              res.json(conversation);
          } else {
              res.status(404).send({ error: `No conversation found for room ${room_id} before ${before}` });
          }
      })
      .catch(err => {
          console.error('Error fetching conversation:', err);
          res.status(500).send({ error: 'Internal Server Error' });
      });
});

app.get('/profile', sessionManager.middleware, (req, res) => {
  if (req.username) {
      res.json({ username: req.username });
  } else {
      res.status(401).send("Unauthorized");
  }
});
app.use('/login.html', express.static(path.join(__dirname, 'client', 'login.html')));
app.use('/style.css', express.static(path.join(__dirname, 'client', 'style.css')));
app.use('/app.js', sessionManager.middleware, express.static(path.join(__dirname, 'client', 'app.js')));
app.use('/index.html', sessionManager.middleware, express.static(path.join(__dirname, 'client', 'index.html')));

app.get('/profile', sessionManager.middleware, (req, res) => {
    // req.username is set in the session middleware for authenticated requests
    if (req.username) {
        res.json({ username: req.username });
    } else {
        res.status(401).send("Unauthorized");
    }
});
app.get(['/index', '/'], sessionManager.middleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'login.html')); // Adjust the path as necessary
});
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.getUser(username).then(user => {
        if (!user) {
            // Handle non-existing user
            return res.redirect('/login');
        }
        if (isCorrectPassword(password, user.password)) {
            sessionManager.createSession(res, username);
            return res.redirect('/index'); // Redirect to main page
        } else {
            // Handle incorrect password
            return res.redirect('/login');
        }
    }).catch(err => {
        console.error(err);
        res.status(500).send('Internal Server Error');
    });
});

app.get('/logout', (req, res) => {
    // Delete the user's session
    sessionManager.deleteSession(req);
    // Redirect the user to the login page
    res.redirect('/login');
});

// Serve other static files without session middleware
app.use(express.static(clientApp));
app.listen(port, () => {
	console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});

app.use(function(err, req, res, next) {
  if (err instanceof SessionManager.Error) {
      const acceptHeader = req.headers.accept || '';
      const prefersJson = acceptHeader.includes('application/json');

      if (prefersJson) {
          res.status(401).json({ error: err.message });
      } else {
          res.redirect('/login');
      }
  } else {
      res.status(500).send('Internal Server Error');
  }
});

// at the very end of server.js
cpen322.connect('http://3.98.223.41/cpen322/test-a5-server.js');
cpen322.export(__filename, { app, db, messages, messageBlockSize, sessionManager, isCorrectPassword});