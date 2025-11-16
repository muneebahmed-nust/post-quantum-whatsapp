/**
 * SocketHandler
 * - Keeps track of online users and their current socket IDs
 * - Automatically updates mappings on connect/reconnect/disconnect
 * - Sends/receives Base64 messages
 * - Fetches public keys on demand
 */
export class SocketHandler {
    constructor(userName) {
        console.log('🔌 SocketHandler constructor called for:', userName);
        this.userName = userName;
        console.log('🔌 Initializing socket.io connection...');
        this.socket = io({ autoConnect: true });
        console.log('🔌 Socket.io initialized');
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

    /* ------------------ Internal: Socket Events ------------------ */
    _setupSocketEvents() {
        console.log('⚙️ Setting up socket events...');
        
        // Listen for registration confirmation BEFORE connecting
        this.socket.on("registration_confirmed", (data) => {
            console.log('✅ Registration confirmed by server:', data);
            // Emit custom event that can be listened to from outside
            this.socket.emit('_registration_ready', data);
        });
        
        this.socket.on("connect", () => {
            console.log(`🔗 Connected as ${this.userName}, SID: ${this.socket.id}`);
            // register this user with server
            console.log('📤 Emitting register_user event...');
            this.socket.emit("register_user", { name: this.userName });
            console.log('✅ register_user event sent');
        });

        // Updated list of online users (username -> socketId)
        this.socket.on("user_list", (userMap) => {
            this.users = { ...userMap };
            console.log("👥 Online users updated:", this.users);
        });

        // Receive a requested public key
        this.socket.on("pubkey_response", ({ username, pubkeyB64 }) => {
            this.pubKeyListeners.forEach(fn => fn(username, pubkeyB64));
        });

        // Receive Base64 messages
        this.socket.on("recv_message", ({ from, base64Message }) => {
            this.messageListeners.forEach(fn => fn(from, base64Message));
        });

        // Detect when server tells us someone disconnected
        this.socket.on("user_disconnected", (username) => {
            if (this.users[username]) {
                delete this.users[username];
                console.log(`⚠️ User ${username} disconnected`);
            }
        });

        // Auto-reconnect events
        this.socket.on("reconnect", (attemptNumber) => {
            console.log(`🔄 Reconnected after ${attemptNumber} attempts, new SID: ${this.socket.id}`);
            this.socket.emit("register_user", { name: this.userName });
        });

        this.socket.on("disconnect", (reason) => {
            console.warn(`🔌 Disconnected: ${reason}`);
        });

        // This event will be handled by chat_handler via a callback
        this.socket.on("recv_kem_ciphertext", async ({ from, ciphertext }) => {
            console.log(`🔐 Received KEM ciphertext from ${from}`);
            // Emit this to kemCiphertextListeners
            this.kemCiphertextListeners.forEach(fn => fn(from, ciphertext));
        });

        // Group-related socket events
        this.socket.on('group_created', (data) => {
            console.log('📬 Group created:', data);
            this.groupCreatedListeners.forEach(fn => fn(data));
        });

        this.socket.on('group_invitation', (data) => {
            console.log('📬 Group invitation:', data);
            this.groupInvitationListeners.forEach(fn => fn(data));
        });

        this.socket.on('group_key', (data) => {
            console.log('🔑 Received encrypted group key for:', data.group_name);
            this.groupKeyListeners.forEach(fn => fn(data));
        });

        this.socket.on('recv_group_message', (data) => {
            // console.log('📨 Group message from:', data.sender, 'in', data.group_name);
            this.groupMessageListeners.forEach(fn => fn(data));
        });

        this.socket.on('group_error', (data) => {
            console.error('❌ Group error:', data.message);
            this.groupErrorListeners.forEach(fn => fn(data));
        });
    }

    /* ------------------ Public API ------------------ */

    /** Request public key of a specific user */
    requestPubKey(targetUserName) {
        const targetSocketId = this.users[targetUserName];
        if (!targetSocketId) {
            console.warn(`⚠️ User ${targetUserName} not online`);
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
        
            console.warn(`⚠️ Cannot send message, user ${targetUserName} not online`);
            return;
        }
        this.socket.emit("send_message", { to: sid, base64Message });
    }

    /**
 * Send a KEM ciphertext to a specific user
 * to establish a shared AES key.
 *
 * @param {string} targetUserName - The recipient's username
 * @param {string} ciphertextB64 - The KEM ciphertext in Base64
 */
sendKEMCiphertext(targetUserName, ciphertextB64) {
    const sid = this.users[targetUserName];
    if (!sid) {
        console.warn(`⚠️ Cannot send KEM ciphertext, user ${targetUserName} not online`);
        return;
    }

    // Emit the ciphertext to the server, which will forward it to the peer
    this.socket.emit("send_kem_ciphertext", {
        to: sid,
        ciphertext: ciphertextB64
    });

    console.log(`🔐 KEM ciphertext sent to ${targetUserName} (SID: ${sid})`);
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
