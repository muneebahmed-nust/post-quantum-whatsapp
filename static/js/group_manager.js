
class GroupChatManager {
    constructor(secureChannelManager, socketHandler, currentUser) {
        this.secureChannelManager = secureChannelManager;
        this.socketHandler = socketHandler;
        this.currentUser = currentUser;
        this.groups = new Map(); // group_id -> {name, admin, members, key}
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Group created successfully (admin receives this)
        this.socketHandler.onGroupCreated((data) => {
            console.log('📬 Group created:', data);
            this.handleGroupCreated(data);
        });

        // Group invitation (members receive this)
        this.socketHandler.onGroupInvitation((data) => {
            console.log('📬 Group invitation:', data);
            this.handleGroupInvitation(data);
        });

        // Encrypted group key received
        this.socketHandler.onGroupKey((data) => {
            console.log('🔑 Received encrypted group key for:', data.group_name);
            this.handleGroupKey(data);
        });

        // Group message received
        this.socketHandler.onGroupMessage((data) => {
            // console.log('📨 Group message from:', data.sender, 'in', data.group_name);
            this.handleGroupMessage(data);
        });

        // Group error
        this.socketHandler.onGroupError((data) => {
            console.error('❌ Group error:', data.message);
            alert(`Group Error: ${data.message}`);
        });
    }

    /**
     * Create a new group (called by admin)
     * Admin must have public keys of all members
     */
    async createGroup(groupName, memberUsernames) {
        if (!groupName || !memberUsernames || memberUsernames.length === 0) {
            alert('Please provide group name and at least one member');
            return;
        }

        console.log(`👥 Creating group "${groupName}" with members:`, memberUsernames);

        // Verify we have public keys for all members
        for (const username of memberUsernames) {
            if (!this.secureChannelManager.hasPublicKey(username)) {
                alert(`Missing public key for ${username}. Please wait for them to connect.`);
                return;
            }
        }

        // Request group creation from server
        this.socketHandler.createGroup(groupName, memberUsernames);
    }

    /**
     * Handle group creation confirmation (admin only)
     */
    async handleGroupCreated(data) {
        const { group_id, name, admin, members } = data;

        // Generate AES-256 group key
        const groupKey = await this.generateGroupKey();
        
        // Store group info
        this.groups.set(group_id, {
            name,
            admin,
            members,
            key: groupKey,
            isAdmin: true
        });

        console.log(`✅ Group "${name}" created with ID: ${group_id}`);

        // Encrypt and distribute group key to all members
        await this.distributeGroupKey(group_id, groupKey, members);

        // Update UI
        this.updateGroupList();
        alert(`Group "${name}" created successfully!`);
    }

    /**
     * Handle group invitation (member receives this)
     */
    handleGroupInvitation(data) {
        const { group_id, name, admin, members } = data;

        // Store group info (without key yet - will receive encrypted key separately)
        this.groups.set(group_id, {
            name,
            admin,
            members,
            key: null,
            isAdmin: false
        });

        console.log(`✅ Invited to group "${name}" by ${admin}`);
        
        // Update UI
        this.updateGroupList();
        alert(`You've been added to group "${name}" by ${admin}`);
    }

    /**
     * Generate AES-256 key for group encryption
     */
    async generateGroupKey() {
        return await this.secureChannelManager.generateGroupKey();
    }

    /**
     * Distribute encrypted group key to all members (admin only)
     */
    async distributeGroupKey(groupId, groupKey, members) {
        console.log(`🔑 Distributing group key to ${members.length} members`);

        // Export group key to raw bytes
        const keyBytes = await window.crypto.subtle.exportKey("raw", groupKey);
        const keyArray = new Uint8Array(keyBytes);

        const encryptedKeys = {};

        // Encrypt group key for each member using their ML-KEM public key
        for (const username of members) {
            console.log(`🔍 Checking public key for ${username}`);
            const peerPubKey = this.secureChannelManager.getUserPublicKey(username);
            
            if (!peerPubKey) {
                console.warn(`⚠️ No public key for ${username}, skipping`);
                console.log(`📋 Available public keys:`, Array.from(this.secureChannelManager.publicKeyCache.keys()));
                continue;
            }
            
            console.log(`✅ Found public key for ${username}, length:`, peerPubKey.length);

            try {
                // Use ML-KEM to encapsulate: generates ciphertext and shared secret
                const { ciphertext, sharedSecret } = await this.secureChannelManager.encapsulateKey(peerPubKey);
                
                // Encrypt group key with the shared secret
                const encryptedKey = await this.secureChannelManager.encryptWithSharedSecret(keyArray, sharedSecret);
                
                // Combine ciphertext and encrypted key for transmission
                const combined = this.secureChannelManager.combineArrays(ciphertext, encryptedKey);
                
                encryptedKeys[username] = this.secureChannelManager.arrayBufferToBase64(combined);
                console.log(`   ✅ Encrypted key for ${username}`);
            } catch (error) {
                console.error(`❌ Failed to encrypt key for ${username}:`, error);
            }
        }

        // Send encrypted keys to server for distribution
        this.socketHandler.distributeGroupKey(groupId, encryptedKeys);

        console.log('✅ Group keys distributed');
    }

    /**
     * Handle received encrypted group key (member receives this)
     */
    async handleGroupKey(data) {
        const { group_id, group_name, encrypted_key } = data;
        console.log(`🔑 Received encrypted group key for "${group_name}"`);

        try {
            // Decode the combined data
            const combined = this.secureChannelManager.base64ToArrayBuffer(encrypted_key);
            
            // Split ciphertext and encrypted key (ciphertext is 768 bytes for ML-KEM-512)
            const ciphertext = combined.slice(0, 768);
            const encryptedGroupKey = combined.slice(768);

            // Decapsulate to get shared secret
            const ciphertextB64 = this.secureChannelManager.arrayBufferToBase64(ciphertext);
            const sharedSecret = await this.secureChannelManager.decapsulateKey(ciphertextB64);

            // Decrypt the group key using shared secret
            const groupKeyBytes = await this.secureChannelManager.decryptWithSharedSecret(encryptedGroupKey, sharedSecret);

            // Import as CryptoKey
            const groupKey = await window.crypto.subtle.importKey(
                "raw",
                groupKeyBytes,
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );

            // Store the decrypted group key
            const group = this.groups.get(group_id);
            if (group) {
                group.key = groupKey;
                console.log(`✅ Group key decrypted for "${group_name}"`);
                alert(`You can now chat in group "${group_name}"`);
            }
        } catch (error) {
            console.error('❌ Failed to decrypt group key:', error);
            alert(`Failed to decrypt group key for "${group_name}"`);
        }
    }

    /**
     * Send message to group
     */
    async sendGroupMessage(groupId, message) {
        const group = this.groups.get(groupId);
        
        if (!group) {
            console.error('Group not found:', groupId);
            return;
        }

        if (!group.key) {
            alert('Group key not available yet. Please wait for admin to distribute keys.');
            return;
        }

        try {
            // Encrypt message with group key
            const encryptedMessage = await this.secureChannelManager.encryptGroupMessage(message, group.key);

            // Send to server
            this.socketHandler.sendGroupMessage(groupId, encryptedMessage);

            // Display in own chat
            this.displayGroupMessage(groupId, this.currentUser, message);
            console.log(`✅ Sent message to group "${group.name}"`);
        } catch (error) {
            console.error('❌ Failed to send group message:', error);
        }
    }

    /**
     * Handle received group message
     */
    async handleGroupMessage(data) {
        const { group_id, sender, encrypted_message } = data;
        const group = this.groups.get(group_id);

        if (!group) {
            console.error(`❌ Cannot decrypt message: group ${group_id} not found`);
            return;
        }

        if (!group.key) {
            console.warn(`⚠️ Cannot decrypt message: group key not available for "${group.name}". Key may still be arriving.`);
            console.log(`📋 Group info:`, { name: group.name, admin: group.admin, hasKey: !!group.key });
            return;
        }

        try {
            // Decrypt message with group key
            const message = await this.secureChannelManager.decryptGroupMessage(encrypted_message, group.key);

            // Display in chat
            this.displayGroupMessage(group_id, sender, message);
        } catch (error) {
            console.error('❌ Failed to decrypt group message:', error);
        }
    }

    // UI update methods
    displayGroupMessage(groupId, sender, message) {
        const event = new CustomEvent('groupMessage', {
            detail: { groupId, sender, message }
        });
        window.dispatchEvent(event);
    }

    updateGroupList() {
        const groups = Array.from(this.groups.entries()).map(([id, data]) => ({
            id,
            ...data
        }));
        
        const event = new CustomEvent('groupListUpdated', {
            detail: { groups }
        });
        window.dispatchEvent(event);
    }

    getGroups() {
        return Array.from(this.groups.entries()).map(([id, data]) => ({
            id,
            ...data
        }));
    }

    getGroup(groupId) {
        return this.groups.get(groupId);
    }
}

export default GroupChatManager;