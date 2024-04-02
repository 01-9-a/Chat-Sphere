const { MongoClient, ObjectId } = require('mongodb');

//The constructor is modified by ChatGPT
function Database(mongoUrl, dbName) {
    if (!(this instanceof Database)) return new Database(mongoUrl, dbName);
    const client = new MongoClient(mongoUrl);

    this.connected = client.connect().then(client => {
        console.log('[MongoClient] Connected to ' + mongoUrl + '/' + dbName);
        return client.db(dbName);
    }).catch(err => {
        console.error('[MongoClient] Connection failed:', err);
        throw err;
    });
	
    this.status = () => this.connected.then(
		db => ({ error: null, url: mongoUrl, db: dbName }),
		err => ({ error: err })
	);
}

Database.prototype.getRooms = function(){
    return this.connected.then(db => {
        return db.collection('chatrooms').find({}).toArray();
    });
};

Database.prototype.getRoom = function(room_id) {
	console.log("looking for this ID:", room_id);
    return this.connected.then(db => {
		let query;
        try {
            query = { _id: new ObjectId(room_id) };
			console.log("yes converted");
        } catch {
    	    query = { _id: room_id };
        }
		
		db.collection('chatrooms').findOne(query).then(document => {
			console.log("get", document);
		});
        return db.collection('chatrooms').findOne(query);
    });
};

Database.prototype.addRoom = function(room) {
    return this.connected.then(db => {
        console.log(room);
		if (!room.name) {
            throw new Error("The name field is required.");
        }

        return db.collection('chatrooms').insertOne(room).then(result => {
            result._id = result.insertedId;
			console.log("type in add:", typeof(result._id));
            return room;
        });
    }).catch(err => {
        console.error(err);
        throw err;
    });
};

Database.prototype.getLastConversation = function(room_id, before){
    // Use the current UNIX time in milliseconds if 'before' is not provided
    before = before || Date.now();

    return this.connected.then(db => {
        // Query to find the latest conversation for 'room_id' before 'before' timestamp
        return db.collection('conversations').find({ room_id: room_id, timestamp: { $lt: before } })
                 .sort({ timestamp: -1 }) // Sorting by timestamp in descending order
                 .limit(1) // We only want the most recent one
                 .toArray() // Convert the cursor to an array to work with the data
                 .then(conversations => {
                    // Check if we found any conversation and return it, or null if none were found
                    if (conversations.length > 0) {
                        return conversations[0];
                    } else {
                        return null;
                    }
                 });
    }).catch(err => {
        console.error("Error fetching the last conversation:", err);
        throw err; // Rethrow or handle as appropriate for your application
    });
};

Database.prototype.addConversation = function(conversation) {
    return this.connected.then(db => {
        if (!conversation.room_id || !conversation.timestamp || !conversation.messages) {
            throw new Error("Missing field.");
        }
        return db.collection('conversations').insertOne(conversation).then(result => {
            result._id = result.insertedId;
            return conversation;
        });
    }).catch(err => {
        console.error(err);
        throw err;
    });
};

Database.prototype.getUser = function(username) {
    return this.connected.then(db =>
        db.collection('users').findOne({ username: username })
    );
};


module.exports = Database;