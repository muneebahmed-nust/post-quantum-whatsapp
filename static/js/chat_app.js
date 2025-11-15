/**
 * Main Chat Application Controller
 * Integrates ChatHandler, UI management, and user interactions
 */

import { ChatHandler } from "./chat_handler.js";
import { SecureChannelManager } from "./secure_channel_manager.js";

// Check if Web Crypto API is available
if (!window.crypto || !window.crypto.subtle) {
    console.error("❌ Web Crypto API is not available. HTTPS or localhost required!");
    const warning = document.getElementById('crypto-warning');
    if (warning) warning.style.display = 'block';
    throw new Error("Web Crypto API not available - use HTTPS or localhost");
}

class ChatApp {
    constructor() {
        console.log('🚀 ChatApp constructor called');
        this.currentUser = null;
        this.chatHandler = null;
        this.secureChannelManager = new SecureChannelManager();
        this.selectedUser = null;
        this.chatHistories = {}; // Store chat messages per user
        this.unreadMessages = {}; // Track unread messages per user
        this.allUsers = {}; // Store all online users
        this.currentTab = 'chats'; // Track current tab: 'chats' or 'all'
        this.searchQuery = ''; // Track search query
        
        this.initializeUI();
        console.log('✅ ChatApp initialized successfully');
    }

    initializeUI() {
        console.log('🔧 Initializing UI...');
        // Get DOM elements
        this.loginScreen = document.getElementById('login-screen');
        this.chatScreen = document.getElementById('chat-screen');
        this.usernameInput = document.getElementById('username-input');
        this.loginBtn = document.getElementById('login-btn');
        this.userList = document.getElementById('user-list');
        this.currentUserDisplay = document.getElementById('current-user');
        this.noChatSelected = document.getElementById('no-chat-selected');
        this.chatContainer = document.getElementById('chat-container');
        this.selectedUserName = document.getElementById('selected-user-name');
        this.connectionStatus = document.getElementById('connection-status');
        this.chatBox = document.getElementById('chat-box');
        this.msgInput = document.getElementById('msg');
        this.sendBtn = document.getElementById('send');
        this.searchInput = document.getElementById('search-users');
        this.showAllUsersBtn = document.getElementById('show-all-users-btn');
        this.chatUserAvatar = document.getElementById('chat-user-avatar');

        // Tab buttons
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.getAttribute('data-tab');
                this.filterAndDisplayUsers();
            });
        });

        // Search functionality
        this.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase().trim();
            this.filterAndDisplayUsers();
        });

        // Show all users button
        this.showAllUsersBtn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.tab-btn[data-tab="all"]').classList.add('active');
            this.currentTab = 'all';
            this.filterAndDisplayUsers();
        });

        // Event listeners
        this.loginBtn.addEventListener('click', () => {
            console.log('🖱️ Login button clicked');
            this.handleLogin();
        });
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                console.log('⌨️ Enter key pressed on username input');
                this.handleLogin();
            }
        });
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        console.log('✅ Event listeners attached');
    }

    async handleLogin() {
        console.log('🔐 handleLogin called');
        const username = this.usernameInput.value.trim();
        console.log('👤 Username entered:', username);
        
        if (!username) {
            console.warn('⚠️ No username entered');
            alert('Please enter a username');
            return;
        }

        console.log('✅ Username validated, waiting for key pair...');
        await this.secureChannelManager.keyPairReady;
        console.log('✅ Key pair ready, creating ChatHandler...');
        
        this.currentUser = username;
        this.chatHandler = new ChatHandler(username, this.secureChannelManager);
        console.log('✅ ChatHandler created');


        // Set up message listener
        console.log('📨 Setting up message listener...');
        this.chatHandler.onMessage((fromUser, decryptedText) => {
            this.handleIncomingMessage(fromUser, decryptedText);
        });

        // Listen for user list updates from server
        console.log('👥 Setting up user list listener...');
        this.chatHandler.socketHandler.socket.on('user_list', (userMap) => {
            console.log('📋 User list updated:', userMap);
            this.updateUserList(userMap);
        });

        // Send public key after registration completes
        console.log('⏳ Waiting for registration to complete...');
        
        // Use a promise-based approach to wait for registration
        const waitForRegistration = new Promise((resolve) => {
            // Check if already connected
            if (this.chatHandler.socketHandler.socket.connected) {
                console.log('🔗 Socket already connected, sending pubkey shortly...');
                setTimeout(resolve, 200); // Small delay for registration to complete
            } else {
                // Wait for connection
                this.chatHandler.socketHandler.socket.once('connect', () => {
                    console.log('🔗 Socket connected, waiting for registration...');
                    setTimeout(resolve, 200); // Small delay for registration to complete
                });
            }
        });
        
        waitForRegistration.then(() => {
            console.log('🔑 Sending public key via ChatHandler...');
            this.chatHandler.sendPublicKeyToServer(username);
        });

        // Show chat screen
        console.log('🖥️ Switching to chat screen...');
        this.loginScreen.style.display = 'none';
        this.chatScreen.style.display = 'flex';
        this.currentUserDisplay.textContent = `Logged in as: ${username}`;

        console.log(`✅ Logged in as ${username}`);
    }

    updateUserListWithUnread() {
        // Refresh the user list with current unread counts
        this.filterAndDisplayUsers();
    }

    updateUserList(userMap) {
        // Store all users
        this.allUsers = userMap;
        this.filterAndDisplayUsers();
    }

    filterAndDisplayUsers() {
        // Clear current list
        this.userList.innerHTML = '';

        // Get all users except current user
        let users = Object.keys(this.allUsers).filter(u => u !== this.currentUser);

        // Filter based on current tab
        if (this.currentTab === 'chats') {
            // Show only users we have chat history with
            users = users.filter(u => 
                this.chatHistories[u] && this.chatHistories[u].length > 0
            );
        }

        // Apply search filter
        if (this.searchQuery) {
            users = users.filter(u => 
                u.toLowerCase().includes(this.searchQuery)
            );
        }

        if (users.length === 0) {
            const message = this.currentTab === 'chats' 
                ? 'No chats yet. Click "All Users" to start a conversation.'
                : (this.searchQuery ? 'No users found.' : 'No other users online');
            this.userList.innerHTML = `<div class="no-users-message">${message}</div>`;
            return;
        }

        // Sort users: unread messages first, then alphabetically
        users.sort((a, b) => {
            const unreadA = this.unreadMessages[a] || 0;
            const unreadB = this.unreadMessages[b] || 0;
            if (unreadA !== unreadB) return unreadB - unreadA;
            return a.localeCompare(b);
        });

        users.forEach(username => {
            this.createUserListItem(username);
        });
    }

    createUserListItem(username) {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        if (this.selectedUser === username) {
            userItem.classList.add('active');
        }

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.textContent = username.charAt(0).toUpperCase();

        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';

        const userName = document.createElement('div');
        userName.className = 'user-name';
        userName.textContent = username;

        const lastMessage = document.createElement('div');
        lastMessage.className = 'user-last-message';
        
        // Show last message if exists
        const history = this.chatHistories[username];
        if (history && history.length > 0) {
            const last = history[history.length - 1];
            const prefix = last.isSent ? 'You: ' : '';
            lastMessage.textContent = prefix + (last.text.length > 30 
                ? last.text.substring(0, 30) + '...' 
                : last.text);
        } else {
            lastMessage.textContent = 'Click to start chatting';
        }

        userInfo.appendChild(userName);
        userInfo.appendChild(lastMessage);

        userItem.appendChild(avatar);
        userItem.appendChild(userInfo);
        
        // Add unread message badge if any
        const unreadCount = this.unreadMessages[username] || 0;
        if (unreadCount > 0) {
            const badge = document.createElement('span');
            badge.className = 'unread-badge';
            badge.textContent = unreadCount;
            userItem.appendChild(badge);
        }

        userItem.addEventListener('click', () => this.selectUser(username));

        this.userList.appendChild(userItem);
    }

    async selectUser(username) {
        if (this.selectedUser === username) return;

        this.selectedUser = username;
        this.selectedUserName.textContent = username;
        
        // Update chat header avatar
        if (this.chatUserAvatar) {
            this.chatUserAvatar.textContent = username.charAt(0).toUpperCase();
        }
        
        // Clear unread messages for this user
        if (this.unreadMessages[username]) {
            this.unreadMessages[username] = 0;
            this.updateUserListWithUnread();
        }

        // Update UI
        this.noChatSelected.style.display = 'none';
        this.chatContainer.style.display = 'flex';
        this.updateConnectionStatus('connecting');

        // Update active user in list
        this.filterAndDisplayUsers();

        // Load chat history
        this.loadChatHistory(username);

        // Check if we already have a connection
        if (this.chatHandler.sharedSecrets[username]) {
            this.updateConnectionStatus('connected');
            this.enableMessageInput();
            return;
        }

        // Establish connection
        this.disableMessageInput();
        console.log(`🔄 Establishing connection with ${username}...`);
        
        try {
            const success = await this.chatHandler.makeConnectionRequest(username);
            
            if (success) {
                this.updateConnectionStatus('connected');
                this.enableMessageInput();
                this.addSystemMessage(`Connected securely with ${username}`);
            } else {
                this.updateConnectionStatus('failed');
                this.addSystemMessage(`Failed to connect with ${username}. Please try again.`, true);
                this.disableMessageInput();
            }
        } catch (error) {
            console.error('Connection error:', error);
            this.updateConnectionStatus('failed');
            this.addSystemMessage(`Connection error: ${error.message}`, true);
            this.disableMessageInput();
        }
    }

    updateConnectionStatus(status) {
        this.connectionStatus.className = '';
        
        switch(status) {
            case 'connecting':
                this.connectionStatus.className = 'status-connecting';
                this.connectionStatus.textContent = '🔄 Connecting...';
                break;
            case 'connected':
                this.connectionStatus.className = 'status-connected';
                this.connectionStatus.textContent = '✅ Connected';
                break;
            case 'failed':
                this.connectionStatus.className = 'status-failed';
                this.connectionStatus.textContent = '❌ Connection Failed';
                break;
        }
    }

    enableMessageInput() {
        this.msgInput.disabled = false;
        this.sendBtn.disabled = false;
        this.msgInput.placeholder = 'Type a message...';
    }

    disableMessageInput() {
        this.msgInput.disabled = true;
        this.sendBtn.disabled = true;
        this.msgInput.placeholder = 'Establishing secure connection...';
    }

    loadChatHistory(username) {
        this.chatBox.innerHTML = '';
        
        if (!this.chatHistories[username]) {
            this.chatHistories[username] = [];
        }

        this.chatHistories[username].forEach(msg => {
            this.displayMessage(msg.from, msg.text, msg.isSent, false);
        });

        this.scrollToBottom();
    }

    async sendMessage() {
        if (!this.selectedUser) {
            alert('Please select a user first');
            return;
        }

        const text = this.msgInput.value.trim();
        if (!text) return;

        try {
            await this.chatHandler.sendMessage(this.selectedUser, text);
            
            // Add to chat history
            if (!this.chatHistories[this.selectedUser]) {
                this.chatHistories[this.selectedUser] = [];
            }
            this.chatHistories[this.selectedUser].push({
                from: this.currentUser,
                text: text,
                isSent: true,
                timestamp: new Date()
            });

            // Display message
            this.displayMessage(this.currentUser, text, true);
            
            // Clear input
            this.msgInput.value = '';
            this.scrollToBottom();

        } catch (error) {
            console.error('Failed to send message:', error);
            this.addSystemMessage('Failed to send message. Please try again.', true);
        }
    }

    handleIncomingMessage(fromUser, decryptedText) {
        console.log(`📩 Message from ${fromUser}: ${decryptedText}`);

        // Add to chat history
        if (!this.chatHistories[fromUser]) {
            this.chatHistories[fromUser] = [];
        }
        this.chatHistories[fromUser].push({
            from: fromUser,
            text: decryptedText,
            isSent: false,
            timestamp: new Date()
        });

        // Display if this is the active chat
        if (this.selectedUser === fromUser) {
            this.displayMessage(fromUser, decryptedText, false);
            this.scrollToBottom();
        } else {
            // Increment unread counter
            if (!this.unreadMessages[fromUser]) {
                this.unreadMessages[fromUser] = 0;
            }
            this.unreadMessages[fromUser]++;
            this.updateUserListWithUnread();
        }
    }

    displayMessage(from, text, isSent, scroll = true) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = isSent ? 'You' : from;

        const textDiv = document.createElement('div');
        textDiv.textContent = text;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();

        contentDiv.appendChild(senderDiv);
        contentDiv.appendChild(textDiv);
        contentDiv.appendChild(timeDiv);
        messageDiv.appendChild(contentDiv);

        this.chatBox.appendChild(messageDiv);
        
        if (scroll) this.scrollToBottom();
    }

    addSystemMessage(text, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.style.textAlign = 'center';
        messageDiv.style.padding = '0.5rem';
        messageDiv.style.margin = '0.5rem 0';
        messageDiv.style.fontSize = '0.85rem';
        messageDiv.style.color = isError ? '#721c24' : '#666';
        messageDiv.style.background = isError ? '#f8d7da' : '#e8f4f8';
        messageDiv.style.borderRadius = '6px';
        messageDiv.textContent = text;

        this.chatBox.appendChild(messageDiv);
        this.scrollToBottom();
    }

    scrollToBottom() {
        if (this.chatBox) {
            setTimeout(() => {
                this.chatBox.scrollTop = this.chatBox.scrollHeight;
            }, 0);
        }
    }
}

// Initialize the app when DOM is ready
console.log('🔍 Waiting for DOMContentLoaded...');
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOM Content Loaded!');
    try {
        window.chatApp = new ChatApp();
        console.log('🎉 Chat application initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize chat application:', error);
    }
});

