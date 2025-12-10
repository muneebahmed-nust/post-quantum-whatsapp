/**
 * Main Chat Application Controller
 * Integrates ChatHandler, UI management, and user interactions
 */

import { ChatHandler } from "./chat_handler.js";
import { SecureChannelManager } from "./secure_channel_manager.js";
import GroupChatManager from "./group_manager.js";
import { Message } from "./message.js";
import { Chat } from "./chat.js";

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
        this.groupManager = null;
        this.imageHandler = null;
        this.selectedUser = null;
        this.selectedGroup = null; // Track selected group
        this.chats = new Map(); // Store Chat objects per user/group
        this.chatHistories = {}; // Store chat messages per user
        this.unreadMessages = {}; // Track unread messages per user
        this.allUsers = {}; // Store all online users
        this.currentTab = 'chats'; // Track current tab: 'chats', 'groups', or 'all'
        this.searchQuery = ''; // Track search query
        this.isSendingImage = false; // Flag to prevent double-sending images
        
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

        // Group modal elements
        this.createGroupBtn = document.getElementById('create-group-btn');
        this.groupModal = document.getElementById('group-modal');
        this.closeGroupModal = document.getElementById('close-group-modal');
        this.groupNameInput = document.getElementById('group-name-input');
        this.memberList = document.getElementById('member-list');
        this.createGroupConfirm = document.getElementById('create-group-confirm');
        this.cancelGroupCreate = document.getElementById('cancel-group-create');

        // Image upload elements
        this.attachImageBtn = document.getElementById('attach-image-btn');
        this.imageInput = document.getElementById('image-input');
        this.imagePreviewArea = document.getElementById('image-preview-area');
        this.previewImage = document.getElementById('preview-image');
        this.previewFilename = document.getElementById('preview-filename');
        this.removeImagePreview = document.getElementById('remove-image-preview');

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

        // Group creation modal
        this.createGroupBtn.addEventListener('click', () => this.showGroupModal());
        this.closeGroupModal.addEventListener('click', () => this.hideGroupModal());
        this.cancelGroupCreate.addEventListener('click', () => this.hideGroupModal());
        this.createGroupConfirm.addEventListener('click', () => this.handleGroupCreation());

        // Image upload
        this.attachImageBtn.addEventListener('click', () => this.imageInput.click());
        this.imageInput.addEventListener('change', (e) => this.handleImageSelection(e));
        this.removeImagePreview.addEventListener('click', () => this.clearImagePreview());

        // Custom event listeners for group functionality
        window.addEventListener('groupMessage', (e) => this.handleGroupMessageDisplay(e.detail));
        window.addEventListener('groupListUpdated', (e) => this.handleGroupListUpdate(e.detail));

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
        this.sendBtn.addEventListener('click', () => {
            if (this.pendingImage) {
                this.sendPendingImage();
            } else {
                this.sendMessage();
            }
        });
        this.msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (this.pendingImage) {
                    this.sendPendingImage();
                } else {
                    this.sendMessage();
                }
            }
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

        // Initialize group manager
        this.groupManager = new GroupChatManager(this.secureChannelManager, this.chatHandler.socketHandler, this.currentUser);
        console.log('✅ GroupManager initialized');


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
        
        // Request public keys for all new users
        if (this.chatHandler) {
            Object.keys(userMap).forEach(username => {
                if (username !== this.currentUser && !this.secureChannelManager.hasPublicKey(username)) {
                    console.log(`🔑 Requesting public key for ${username}`);
                    this.chatHandler.socketHandler.requestPubKey(username);
                }
            });
        }
        
        this.filterAndDisplayUsers();
    }

    filterAndDisplayUsers() {
        // Clear current list
        this.userList.innerHTML = '';

        // Handle groups tab
        if (this.currentTab === 'groups') {
            if (!this.groupManager) {
                this.userList.innerHTML = '<div class="no-users-message">No groups yet</div>';
                return;
            }
            
            const groups = this.groupManager.getGroups();
            
            if (groups.length === 0) {
                this.userList.innerHTML = '<div class="no-users-message">No groups yet. Click the + button to create one.</div>';
                return;
            }
            
            groups.forEach(group => {
                this.createGroupListItem(group);
            });
            return;
        }

        // Get all users except current user
        let users = Object.keys(this.allUsers).filter(u => u !== this.currentUser);

        // Filter based on current tab
        if (this.currentTab === 'chats') {
            // Show only users we have chat history with
            users = users.filter(u => {
                const chat = this.chats.get(u);
                return chat && chat.getMessages().length > 0;
            });
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

    createGroupListItem(group) {
        const groupItem = document.createElement('div');
        groupItem.className = 'user-item';
        if (this.selectedGroup === group.id) {
            groupItem.classList.add('active');
        }

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.textContent = '👥';
        avatar.style.background = 'var(--whatsapp-green)';

        const groupInfo = document.createElement('div');
        groupInfo.className = 'user-info';

        const groupName = document.createElement('div');
        groupName.className = 'user-name';
        groupName.textContent = group.name;

        const groupDetails = document.createElement('div');
        groupDetails.className = 'user-last-message';
        groupDetails.textContent = `${group.members.length} members`;

        groupInfo.appendChild(groupName);
        groupInfo.appendChild(groupDetails);

        groupItem.appendChild(avatar);
        groupItem.appendChild(groupInfo);

        groupItem.addEventListener('click', () => this.selectGroup(group.id));

        this.userList.appendChild(groupItem);
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
        this.selectedGroup = null; // Clear group selection
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
        
        // Get or create chat
        let chat = this.chats.get(username);
        if (!chat) {
            chat = new Chat('personal', username, username);
            this.chats.set(username, chat);
        }

        // Display all messages
        chat.getMessages().forEach(msg => {
            if (msg instanceof Message) {
                if (msg.content_type === 'image' && msg.image_base64) {
                    this.displayImageInChat(msg.sender || 'Unknown', msg.image_base64, msg.content);
                } else {
                    this.displayMessage(msg.sender || 'Unknown', msg.content, msg.isSent, false);
                }
            } else {
                // Legacy format support
                if (msg.isImage && msg.imageData) {
                    this.displayImageInChat(msg.from, msg.imageData);
                } else {
                    this.displayMessage(msg.from, msg.text, msg.isSent, false);
                }
            }
        });

        this.scrollToBottom();
    }

    async sendMessage() {
        const text = this.msgInput.value.trim();
        if (!text) return;

        try {
            if (this.selectedGroup) {
                // Send group message
                await this.groupManager.sendGroupMessage(this.selectedGroup, text);
                
                // Clear input
                this.msgInput.value = '';
                this.scrollToBottom();
            } else if (this.selectedUser) {
                // Create Message object
                const message = new Message('text', text);
                message.sender = this.currentUser;
                message.isSent = true;
                
                // Send direct message as serialized Message object
                const messageJson = message.toJsonString();
                await this.chatHandler.sendMessage(this.selectedUser, messageJson);
                
                // Add to chat using Chat class
                let chat = this.chats.get(this.selectedUser);
                if (!chat) {
                    chat = new Chat('personal', this.selectedUser, this.selectedUser);
                    this.chats.set(this.selectedUser, chat);
                }
                chat.addMessage(message);

                // Display message
                this.displayMessage(this.currentUser, text, true);
                
                // Clear input
                this.msgInput.value = '';
                this.scrollToBottom();
            } else {
                alert('Please select a user or group first');
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            this.addSystemMessage('Failed to send message. Please try again.', true);
        }
    }

    handleIncomingMessage(fromUser, decryptedText) {
        console.log(`📩 Message from ${fromUser}: ${decryptedText.substring(0, 50)}...`);

        // Try to parse as Message object
        let message;
        let displayText = decryptedText;
        let isImage = false;
        
        try {
            message = Message.fromJsonString(decryptedText);
            if (message.content_type === 'image' && message.image_base64) {
                isImage = true;
                displayText = 'Image';
            } else {
                displayText = message.content;
            }
        } catch {
            // Plain text message
            displayText = decryptedText;
        }

        // Add to chat using Chat class
        let chat = this.chats.get(fromUser);
        if (!chat) {
            chat = new Chat('personal', fromUser, fromUser);
            this.chats.set(fromUser, chat);
        }
        
        if (message instanceof Message) {
            message.sender = fromUser;
            message.isSent = false;
            chat.addMessage(message);
        } else {
            const msg = new Message('text', displayText);
            msg.sender = fromUser;
            msg.isSent = false;
            chat.addMessage(msg);
        }

        // Display if this is the active chat
        if (this.selectedUser === fromUser) {
            if (isImage) {
                this.displayImageInChat(fromUser, message.image_base64, message.content);
            } else {
                this.displayMessage(fromUser, displayText, false);
            }
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
        messageDiv.style.position = 'relative';
        messageDiv.style.cursor = 'pointer';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = isSent ? 'You' : from;

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = text;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();

        contentDiv.appendChild(senderDiv);
        contentDiv.appendChild(textDiv);
        contentDiv.appendChild(timeDiv);
        messageDiv.appendChild(contentDiv);
        
        // Create context menu for text message
        const textContextMenu = document.createElement('div');
        textContextMenu.className = 'image-context-menu';
        textContextMenu.style.display = 'none';
        textContextMenu.style.position = 'fixed';
        textContextMenu.style.background = '#2a3942';
        textContextMenu.style.borderRadius = '6px';
        textContextMenu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        textContextMenu.style.minWidth = '150px';
        textContextMenu.style.zIndex = '1001';
        textContextMenu.style.overflow = 'hidden';
        
        // Copy text option
        const copyTextOption = document.createElement('div');
        copyTextOption.className = 'popup-menu-item';
        copyTextOption.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            <span>Copy text</span>
        `;
        copyTextOption.style.padding = '10px 12px';
        copyTextOption.style.cursor = 'pointer';
        copyTextOption.style.display = 'flex';
        copyTextOption.style.alignItems = 'center';
        copyTextOption.style.gap = '8px';
        copyTextOption.style.color = '#e9edef';
        copyTextOption.style.transition = 'background 0.2s';
        
        copyTextOption.addEventListener('mouseenter', () => {
            copyTextOption.style.background = '#3a4952';
        });
        copyTextOption.addEventListener('mouseleave', () => {
            copyTextOption.style.background = 'transparent';
        });
        
        copyTextOption.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await navigator.clipboard.writeText(text);
                copyTextOption.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    <span>Copied!</span>
                `;
                setTimeout(() => {
                    copyTextOption.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                        </svg>
                        <span>Copy text</span>
                    `;
                    textContextMenu.style.display = 'none';
                }, 1000);
            } catch (err) {
                console.error('Failed to copy text:', err);
                alert('Failed to copy text');
            }
        });
        
        textContextMenu.appendChild(copyTextOption);
        
        // Show context menu on click
        messageDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Hide any other open menus
            document.querySelectorAll('.image-context-menu').forEach(menu => {
                if (menu !== textContextMenu) menu.style.display = 'none';
            });
            
            if (textContextMenu.style.display === 'block') {
                textContextMenu.style.display = 'none';
            } else {
                // Position the menu near the message
                const rect = contentDiv.getBoundingClientRect();
                const menuWidth = 150;
                
                // Position based on whether message is sent or received
                if (isSent) {
                    // For sent messages (right side), position menu to the left of the message
                    textContextMenu.style.left = `${rect.right - menuWidth}px`;
                } else {
                    // For received messages (left side), position menu to the right of the message start
                    textContextMenu.style.left = `${rect.left}px`;
                }
                textContextMenu.style.top = `${rect.top + window.scrollY}px`;
                textContextMenu.style.display = 'block';
            }
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!textContextMenu.contains(e.target) && !messageDiv.contains(e.target)) {
                textContextMenu.style.display = 'none';
            }
        });
        
        document.body.appendChild(textContextMenu);

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

    // Group functionality methods
    showGroupModal() {
        if (!this.groupModal) return;
        
        // Populate member list with all online users
        this.memberList.innerHTML = '';
        const users = Object.keys(this.allUsers).filter(u => u !== this.currentUser);
        
        if (users.length === 0) {
            this.memberList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #666;">No other users online</div>';
        } else {
            users.forEach(username => {
                const memberItem = document.createElement('div');
                memberItem.className = 'member-item';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `member-${username}`;
                checkbox.value = username;
                
                const label = document.createElement('label');
                label.htmlFor = `member-${username}`;
                label.textContent = username;
                label.style.cursor = 'pointer';
                label.style.flex = '1';
                
                memberItem.appendChild(checkbox);
                memberItem.appendChild(label);
                this.memberList.appendChild(memberItem);
            });
        }
        
        this.groupModal.style.display = 'flex';
    }

    hideGroupModal() {
        if (!this.groupModal) return;
        this.groupModal.style.display = 'none';
        this.groupNameInput.value = '';
    }

    async handleGroupCreation() {
        const groupName = this.groupNameInput.value.trim();
        
        if (!groupName) {
            alert('Please enter a group name');
            return;
        }
        
        // Get selected members
        const checkboxes = this.memberList.querySelectorAll('input[type="checkbox"]:checked');
        const members = Array.from(checkboxes).map(cb => cb.value);
        
        if (members.length === 0) {
            alert('Please select at least one member');
            return;
        }
        
        // Check if we have public keys for all members, request if missing
        const missingKeys = members.filter(username => !this.secureChannelManager.hasPublicKey(username));
        
        if (missingKeys.length > 0) {
            console.log(`🔑 Requesting missing public keys for:`, missingKeys);
            
            // Request missing public keys
            missingKeys.forEach(username => {
                this.chatHandler.socketHandler.requestPubKey(username);
            });
            
            // Wait a bit for the keys to arrive
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check again
            const stillMissing = members.filter(username => !this.secureChannelManager.hasPublicKey(username));
            if (stillMissing.length > 0) {
                alert(`Cannot create group: Missing public keys for ${stillMissing.join(', ')}. Please ensure all members are online.`);
                return;
            }
        }
        
        // Create group via GroupManager
        await this.groupManager.createGroup(groupName, members);
        
        this.hideGroupModal();
    }

    handleGroupListUpdate(detail) {
        const { groups } = detail;
        
        // Update UI to show groups in the groups tab
        if (this.currentTab === 'groups') {
            this.filterAndDisplayUsers();
        }
    }

    selectGroup(groupId) {
        const group = this.groupManager.getGroup(groupId);
        if (!group) return;
        
        this.selectedUser = null;
        this.selectedGroup = groupId;
        
        // Update UI
        this.noChatSelected.style.display = 'none';
        this.chatContainer.style.display = 'flex';
        this.selectedUserName.textContent = group.name;
        this.chatUserAvatar.textContent = '👥';
        
        // Load group chat history from Chat class
        this.chatBox.innerHTML = '';
        let chat = this.chats.get(groupId);
        if (!chat) {
            chat = new Chat('group', groupId, group.name);
            this.chats.set(groupId, chat);
        }
        
        // Display all messages
        chat.getMessages().forEach(msgObj => {
            const message = msgObj.message || msgObj;
            const sender = msgObj.sender || 'Unknown';
            
            if (message instanceof Message) {
                if (message.content_type === 'image' && message.image_base64) {
                    this.displayImageInChat(sender, message.image_base64, message.content);
                } else {
                    this.displayMessage(sender, message.content, sender === this.currentUser);
                }
            } else if (typeof message === 'string') {
                this.displayMessage(sender, message, sender === this.currentUser);
            }
        });
        
        this.connectionStatus.textContent = `${group.members.length} members`;
        this.connectionStatus.className = 'status-connected';
        this.scrollToBottom();
    }

    handleGroupMessageDisplay(detail) {
        const { groupId, sender, message } = detail;
        
        // Add to group chat using Chat class
        let chat = this.chats.get(groupId);
        if (!chat) {
            const group = this.groupManager.getGroup(groupId);
            chat = new Chat('group', groupId, group?.name || 'Group');
            this.chats.set(groupId, chat);
        }
        
        // Parse and store message
        let parsedMessage;
        const isCurrentUser = sender === this.currentUser;
        try {
            parsedMessage = Message.fromJsonString(message);
            parsedMessage.sender = sender;
            parsedMessage.isSent = isCurrentUser;
        } catch {
            parsedMessage = new Message('text', message);
            parsedMessage.sender = sender;
            parsedMessage.isSent = isCurrentUser;
        }

        chat.addMessage(sender, parsedMessage);

        // Only display if this group is selected
        if (this.selectedGroup === groupId) {
            // Display 'You' for current user's messages, actual sender name for others
            const displaySender = isCurrentUser ? 'You' : sender;
            if (parsedMessage.content_type === 'image' && parsedMessage.image_base64) {
                this.displayImageInChat(displaySender, parsedMessage.image_base64, parsedMessage.content);
            } else {
                this.displayMessage(displaySender, parsedMessage.content, parsedMessage.isSent);
            }
        }
    }

    async handleImageSelection(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Clear the input
        event.target.value = '';
        
        if (!file.type.startsWith('image/')) {
            alert('Please select a valid image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            alert('Image too large. Maximum size is 5MB');
            return;
        }

        try {
            // Convert image to base64
            const base64Image = await Message.imageToBase64(file);
            
            // Show preview
            this.showImagePreview(base64Image, file.name);
            
            // Store for sending
            this.pendingImage = {
                base64: base64Image,
                filename: file.name
            };
            
            // Update send button
            this.sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
            this.msgInput.placeholder = 'Add a caption (optional)...';
        } catch (error) {
            console.error('❌ Failed to process image:', error);
            alert('Failed to process image');
        }
    }

    showImagePreview(base64Image, filename) {
        console.log('📷 Showing image preview:', filename);
        this.previewImage.src = base64Image;
        this.previewFilename.textContent = filename;
        this.imagePreviewArea.style.display = 'flex';
        console.log('✅ Image preview display set to flex');
        console.log('Preview area:', this.imagePreviewArea);
        
        // Focus on message input so user can add caption and press Enter to send
        setTimeout(() => {
            this.msgInput.focus();
        }, 100);
    }

    clearImagePreview() {
        this.previewImage.src = '';
        this.previewFilename.textContent = '';
        this.imagePreviewArea.style.display = 'none';
        this.pendingImage = null;
        this.imageInput.value = ''; // Ensure input is cleared
        this.msgInput.placeholder = 'Type a message...';
        this.sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    }

    async sendPendingImage() {
        if (!this.pendingImage) return;
        
        // Prevent double-sending
        if (this.isSendingImage) {
            console.log('⏳ Image is already being sent, please wait...');
            return;
        }
        
        this.isSendingImage = true;
        this.sendBtn.disabled = true;
        
        const caption = this.msgInput.value.trim();
        const base64Image = this.pendingImage.base64;
        
        try {
            if (this.selectedGroup) {
                await this.sendGroupImage(this.selectedGroup, base64Image, caption);
            } else if (this.selectedUser) {
                await this.sendDirectImage(this.selectedUser, base64Image, caption);
            } else {
                alert('Please select a user or group first');
                this.isSendingImage = false;
                this.sendBtn.disabled = false;
                return;
            }
            
            // Clear preview and input
            this.clearImagePreview();
            this.msgInput.value = '';
        } catch (error) {
            console.error('❌ Failed to send image:', error);
            alert('Failed to send image');
        } finally {
            this.isSendingImage = false;
            this.sendBtn.disabled = false;
        }
    }

    async sendDirectImage(username, base64Image, caption = '') {
        try {
            // Create Message object
            const message = new Message('image', caption || 'Image');
            message.image_base64 = base64Image;
            message.sender = this.currentUser;
            message.isSent = true;
            
            // Send via ChatHandler which handles encryption
            const messageJson = message.toJsonString();
            await this.chatHandler.sendMessage(username, messageJson);

            // Add to chat using Chat class
            let chat = this.chats.get(username);
            if (!chat) {
                chat = new Chat('personal', username, username);
                this.chats.set(username, chat);
            }
            chat.addMessage(message);

            // Display in own chat
            this.displayImageInChat('You', base64Image, caption);
            console.log(`✅ Image sent to ${username}`);
        } catch (error) {
            console.error('❌ Failed to send direct image:', error);
            throw error;
        }
    }

    async sendGroupImage(groupId, base64Image, caption = '') {
        try {
            // Create Message object
            const message = new Message('image', caption || 'Image');
            message.image_base64 = base64Image;
            message.sender = this.currentUser;
            message.isSent = true;
            
            // Send via GroupManager which handles encryption
            const messageJson = message.toJsonString();
            await this.groupManager.sendGroupMessage(groupId, messageJson);

            // Add to group chat using Chat class
            let chat = this.chats.get(groupId);
            if (!chat) {
                const group = this.groupManager.getGroup(groupId);
                chat = new Chat('group', groupId, group?.name || 'Group');
                this.chats.set(groupId, chat);
            }
            chat.addMessage(this.currentUser, message);

            // Display in own chat
            this.displayImageInChat('You', base64Image, caption);
            console.log(`✅ Image sent to group`);
        } catch (error) {
            console.error('❌ Failed to send group image:', error);
            throw error;
        }
    }

    displayImageInChat(sender, base64Image, caption = '') {
        const isCurrentUser = sender === 'You';
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isCurrentUser ? 'sent' : 'received'}`;
        messageDiv.style.position = 'relative';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = sender;
        
        // Image container
        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-container';
        imageContainer.style.position = 'relative';
        imageContainer.style.display = 'inline-block';
        imageContainer.style.cursor = 'pointer';
        
        const img = document.createElement('img');
        img.className = 'message-image';
        img.src = base64Image;
        
        // Create context menu popup
        const contextMenu = document.createElement('div');
        contextMenu.className = 'image-context-menu';
        contextMenu.style.display = 'none';
        contextMenu.style.position = 'fixed';
        contextMenu.style.background = '#2a3942';
        contextMenu.style.borderRadius = '6px';
        contextMenu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        contextMenu.style.minWidth = '180px';
        contextMenu.style.zIndex = '1001';
        contextMenu.style.overflow = 'hidden';
        
        // Copy image option
        const copyImageOption = document.createElement('div');
        copyImageOption.className = 'popup-menu-item';
        copyImageOption.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            <span>Copy image</span>
        `;
        copyImageOption.style.padding = '10px 12px';
        copyImageOption.style.cursor = 'pointer';
        copyImageOption.style.display = 'flex';
        copyImageOption.style.alignItems = 'center';
        copyImageOption.style.gap = '8px';
        copyImageOption.style.color = '#e9edef';
        copyImageOption.style.transition = 'background 0.2s';
        
        copyImageOption.addEventListener('mouseenter', () => {
            copyImageOption.style.background = '#3a4952';
        });
        copyImageOption.addEventListener('mouseleave', () => {
            copyImageOption.style.background = 'transparent';
        });
        
        copyImageOption.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const blob = await fetch(base64Image).then(r => r.blob());
                await navigator.clipboard.write([
                    new ClipboardItem({ [blob.type]: blob })
                ]);
                
                copyImageOption.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    <span>Copied!</span>
                `;
                setTimeout(() => {
                    copyImageOption.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                        </svg>
                        <span>Copy image</span>
                    `;
                    contextMenu.style.display = 'none';
                }, 1000);
            } catch (err) {
                console.error('Failed to copy image:', err);
                alert('Failed to copy image');
            }
        });
        
        contextMenu.appendChild(copyImageOption);
        
        // Download option
        const downloadOption = document.createElement('div');
        downloadOption.className = 'popup-menu-item';
        downloadOption.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            <span>Download image</span>
        `;
        downloadOption.style.padding = '10px 12px';
        downloadOption.style.cursor = 'pointer';
        downloadOption.style.display = 'flex';
        downloadOption.style.alignItems = 'center';
        downloadOption.style.gap = '8px';
        downloadOption.style.color = '#e9edef';
        downloadOption.style.transition = 'background 0.2s';
        
        downloadOption.addEventListener('mouseenter', () => {
            downloadOption.style.background = '#3a4952';
        });
        downloadOption.addEventListener('mouseleave', () => {
            downloadOption.style.background = 'transparent';
        });
        
        downloadOption.addEventListener('click', (e) => {
            e.stopPropagation();
            const link = document.createElement('a');
            link.href = base64Image;
            link.download = `image_${new Date().getTime()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            downloadOption.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                <span>Downloaded!</span>
            `;
            setTimeout(() => {
                downloadOption.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                    </svg>
                    <span>Download image</span>
                `;
                contextMenu.style.display = 'none';
            }, 1000);
        });
        
        contextMenu.appendChild(downloadOption);
        
        // Copy caption option (only if caption exists)
        if (caption && caption.trim()) {
            const copyCaptionOption = document.createElement('div');
            copyCaptionOption.className = 'popup-menu-item';
            copyCaptionOption.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm-1 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h7c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h7v14z"/>
                </svg>
                <span>Copy caption</span>
            `;
            copyCaptionOption.style.padding = '10px 12px';
            copyCaptionOption.style.cursor = 'pointer';
            copyCaptionOption.style.display = 'flex';
            copyCaptionOption.style.alignItems = 'center';
            copyCaptionOption.style.gap = '8px';
            copyCaptionOption.style.color = '#e9edef';
            copyCaptionOption.style.transition = 'background 0.2s';
            
            copyCaptionOption.addEventListener('mouseenter', () => {
                copyCaptionOption.style.background = '#3a4952';
            });
            copyCaptionOption.addEventListener('mouseleave', () => {
                copyCaptionOption.style.background = 'transparent';
            });
            
            copyCaptionOption.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(caption);
                    copyCaptionOption.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                        <span>Copied!</span>
                    `;
                    setTimeout(() => {
                        copyCaptionOption.innerHTML = `
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm-1 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h7c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h7v14z"/>
                            </svg>
                            <span>Copy caption</span>
                        `;
                        contextMenu.style.display = 'none';
                    }, 1000);
                } catch (err) {
                    console.error('Failed to copy caption:', err);
                    alert('Failed to copy caption');
                }
            });
            
            contextMenu.appendChild(copyCaptionOption);
        }
        
        // Show context menu on right-click
        imageContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            // Hide any other open menus
            document.querySelectorAll('.image-context-menu').forEach(menu => {
                if (menu !== contextMenu) menu.style.display = 'none';
            });
            
            // Position the menu
            contextMenu.style.left = `${e.pageX}px`;
            contextMenu.style.top = `${e.pageY}px`;
            contextMenu.style.display = 'block';
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target) && !imageContainer.contains(e.target)) {
                contextMenu.style.display = 'none';
            }
        });
        
        // Also allow left click on image to show menu
        imageContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Hide any other open menus
            document.querySelectorAll('.image-context-menu').forEach(menu => {
                if (menu !== contextMenu) menu.style.display = 'none';
            });
            
            if (contextMenu.style.display === 'block') {
                contextMenu.style.display = 'none';
            } else {
                // Position the menu near the image
                const rect = imageContainer.getBoundingClientRect();
                contextMenu.style.left = `${rect.right - 180}px`;
                contextMenu.style.top = `${rect.top + window.scrollY}px`;
                contextMenu.style.display = 'block';
            }
        });
        
        imageContainer.appendChild(img);
        document.body.appendChild(contextMenu);
        
        contentDiv.appendChild(senderDiv);
        
        // Add caption if provided
        if (caption) {
            const captionDiv = document.createElement('div');
            captionDiv.className = 'message-text';
            captionDiv.textContent = caption;
            contentDiv.appendChild(captionDiv);
        }
        
        contentDiv.appendChild(imageContainer);
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();
        contentDiv.appendChild(timeDiv);
        
        messageDiv.appendChild(contentDiv);
        
        this.chatBox.appendChild(messageDiv);
        this.scrollToBottom();
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

