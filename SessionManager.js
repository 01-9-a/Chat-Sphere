const crypto = require('crypto');

class SessionError extends Error {};

function SessionManager (){
	// default session length - you might want to
	// set this to something small during development
	const CookieMaxAgeMs = 600000;

	// keeping the session data inside a closure to keep them protected
	const sessions = {};

	// might be worth thinking about why we create these functions
	// as anonymous functions (per each instance) and not as prototype methods
	this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
        const token = crypto.randomBytes(16).toString('hex');
        const sessionData = {
            username: username,
            createdAt: Date.now(),
            expireAt: Date.now() + maxAge
        };

        sessions[token] = sessionData;
        response.cookie('cpen322-session', token, { maxAge: maxAge });
        setTimeout(() => delete sessions[token], maxAge);
    };

	this.deleteSession = (request) => {
    const token = request.session;
    if (token && token in sessions) {
        delete sessions[token];
    }
    if (request.username) {
        delete request.username; 
    }
    if (request.session) {
        delete request.session; 
    }
    };

	this.middleware = (request, response, next) => {
        const cookieHeader = request.headers.cookie;
        if (!cookieHeader) {
            next(new SessionError('No cookie header found'));
            return;
        }

        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [name, value] = cookie.split('=').map(c => c.trim());
            acc[name] = value;
            return acc;
        }, {});

        const token = cookies['cpen322-session'];
        if (!token || !(token in sessions)) {
            next(new SessionError('Invalid or expired session token'));
            return;
        }

        request.username = sessions[token].username;
        request.session = token;
        next();
    };

	// this function is used by the test script.
	// you can use it if you want.
	this.getUsername = (token) => ((token in sessions) ? sessions[token].username : null);
};

// SessionError class is available to other modules as "SessionManager.Error"
SessionManager.Error = SessionError;

module.exports = SessionManager;