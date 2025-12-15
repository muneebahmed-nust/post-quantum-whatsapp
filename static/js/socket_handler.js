/**
 * SocketHandler
 * - Keeps track of online users and their current socket IDs
 * - Automatically updates mappings on connect/reconnect/disconnect
 * - Sends/receives Base64 messages
 * - Fetches public keys on demand
 */
export class SocketHandler {
    constructor(userName) {
        console.log('sockethandler constructor called for:', userName);
        this.userName = userName;
        console.log('initializing socket.io connection...');
        this.socket = io({ autoConnect: true });
        console.log('socket.io initialized');
        this.users = {};                // username -> socketId
        this.messageListeners = [];
        this.pubKeyListeners = [];
        this.kemCiphertextListeners = [];
        this.groupCreatedListeners = [];
        this.groupInvitationListeners = [];
        this.groupKeyListeners = [];
        this.groupMessageListeners = [];
        this.groupErrorListeners = [];

        this._setupSocketEvents();
    }

    /* internal: socket events */
    _setupSocketEvents() {
        console.log('setting up socket events...');
        
        // listen for registration confirmation before connecting
        this.socket.on("registration_confirmed", (data) => {
            console.log('registration confirmed by server:', data);
            // emit custom event that can be listened to from outside
            this.socket.emit('_registration_ready', data);
        });
        
        this.socket.on("connect", () => {
            console.log(`connected as ${this.userName}, sid: ${this.socket.id}`);
            // register this user with server
            console.log('emitting register_user event...');
            this.socket.emit("register_user", { name: this.userName });
            console.log('register_user event sent');
        });

        // updated list of online users (username -> socketid)
        this.socket.on("user_list", (userMap) => {
            this.users = { ...userMap };
            console.log("online users updated:", this.users);
        });

        // Receive a requested public key
        this.socket.on("pubkey_response", ({ username, pubkeyB64 }) => {
            this.pubKeyListeners.forEach(fn => fn(username, pubkeyB64));
        });

        // Receive Base64 messages
        this.socket.on("recv_message", ({ from, base64Message }) => {
            this.messageListeners.forEach(fn => fn(from, base64Message));
        });

        // detect when server tells us someone disconnected
        this.socket.on("user_disconnected", (username) => {
            if (this.users[username]) {
                delete this.users[username];
                console.log(`user ${username} disconnected`);
            }
        });

        // auto-reconnect events
        this.socket.on("reconnect", (attemptNumber) => {
            console.log(`reconnected after ${attemptNumber} attempts, new sid: ${this.socket.id}`);
            this.socket.emit("register_user", { name: this.userName });
        });

        this.socket.on("disconnect", (reason) => {
            console.warn(`disconnected: ${reason}`);
        });

        // this event will be handled by chat_handler via a callback
        this.socket.on("recv_kem_ciphertext", async ({ from, ciphertext }) => {
            console.log(`received kem ciphertext from ${from}`);
            // emit this to kemciphertextlisteners
            this.kemCiphertextListeners.forEach(fn => fn(from, ciphertext));
        });

        // group-related socket events
        this.socket.on('group_created', (data) => {
            console.log('group created:', data);
            this.groupCreatedListeners.forEach(fn => fn(data));
        });

        this.socket.on('group_invitation', (data) => {
            console.log('group invitation:', data);
            this.groupInvitationListeners.forEach(fn => fn(data));
        });

        this.socket.on('group_key', (data) => {
            console.log('received encrypted group key for:', data.group_name);
            this.groupKeyListeners.forEach(fn => fn(data));
        });

        this.socket.on('recv_group_message', (data) => {
            // console.log('group message from:', data.sender, 'in', data.group_name);
            this.groupMessageListeners.forEach(fn => fn(data));
        });

        this.socket.on('group_error', (data) => {
            console.error('group error:', data.message);
            this.groupErrorListeners.forEach(fn => fn(data));
        });
    }

    /* public api */

    /** request public key of a specific user */
    requestPubKey(targetUserName) {
        const targetSocketId = this.users[targetUserName];
        if (!targetSocketId) {
            console.warn(`user ${targetUserName} not online`);
            return;
        }
        this.socket.emit("request_pubkey", { username: targetUserName });
    }

    /** Listen for public keys */
    onPubKey(fn) {
        this.pubKeyListeners.push(fn);
    }

    /** Listen for KEM ciphertexts */
    onKEMCiphertext(fn) {
        this.kemCiphertextListeners.push(fn);
    }

    /** Send Base64 message to a user */
    sendMessage(targetUserName, base64Message) {
        const sid = this.users[targetUserName];
        if (!sid) {
        
            console.warn(`cannot send message, user ${targetUserName} not online`);
            return;
        }
        this.socket.emit("send_message", { to: sid, base64Message });
    }

    /**
 * send a kem ciphertext to a specific user
 * to establish a shared aes key.
 *
 * @param {string} targetUserName - the recipient's username
 * @param {string} ciphertextB64 - the kem ciphertext in base64
 */
sendKEMCiphertext(targetUserName, ciphertextB64) {
    const sid = this.users[targetUserName];
    if (!sid) {
        console.warn(`cannot send kem ciphertext, user ${targetUserName} not online`);
        return;
    }

    // emit the ciphertext to the server, which will forward it to the peer
    this.socket.emit("send_kem_ciphertext", {
        to: sid,
        ciphertext: ciphertextB64
    });

    console.log(`kem ciphertext sent to ${targetUserName} (sid: ${sid})`);
}


    /** Listen for incoming messages */
    onMessage(fn) {
        this.messageListeners.push(fn);
    }

    /** Get all current online usernames */
    getAllUsers() {
        return Object.keys(this.users);
    }

    /** Get current socket ID for a username */
    getSocketId(userName) {
        return this.users[userName] || null;
    }

    /* ------------------ Group Chat Methods ------------------ */

    /** Create a new group */
    createGroup(groupName, memberUsernames) {
        this.socket.emit('create_group', {
            name: groupName,
            members: memberUsernames
        });
    }

    /** Distribute encrypted group keys to members */
    distributeGroupKey(groupId, encryptedKeys) {
        this.socket.emit('distribute_group_key', {
            group_id: groupId,
            encrypted_keys: encryptedKeys
        });
    }

    /** Send a message to a group */
    sendGroupMessage(groupId, encryptedMessage) {
        this.socket.emit('send_group_message', {
            group_id: groupId,
            encrypted_message: encryptedMessage
        });
    }

    /** Request user's groups */
    getMyGroups() {
        this.socket.emit('get_my_groups');
    }

    /* ------------------ Group Event Listeners ------------------ */

    onGroupCreated(fn) {
        this.groupCreatedListeners.push(fn);
    }

    onGroupInvitation(fn) {
        this.groupInvitationListeners.push(fn);
    }

    onGroupKey(fn) {
        this.groupKeyListeners.push(fn);
    }

    onGroupMessage(fn) {
        this.groupMessageListeners.push(fn);
    }

    onGroupError(fn) {
        this.groupErrorListeners.push(fn);
    }
}
