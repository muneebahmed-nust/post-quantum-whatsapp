import { Message } from './message.js';

class Chat {
    constructor(type = 'personal', chatId = null, name = null) {
        this.type = type; // 'personal' or 'group'
        this.chatId = chatId; // username for personal, group_id for group
        this.name = name; // display name
        this.messages = []; // Array of Message objects or {sender, message} objects
    }

    addMessage(messageOrSender, message = null) {
        if (this.type === 'personal') {
            // For personal chats, add message directly
            if (messageOrSender instanceof Message) {
                this.messages.push(messageOrSender);
            } else {
                // If it's a plain object or string, wrap it
                this.messages.push(messageOrSender);
            }
        } else if (this.type === 'group') {
            // For group chats, need sender info
            if (message !== null) {
                // Called with (sender, message)
                this.messages.push({ sender: messageOrSender, message: message });
            } else if (messageOrSender && messageOrSender.sender && messageOrSender.message) {
                // Called with object {sender, message}
                this.messages.push(messageOrSender);
            }
        }
    }

    getMessages() {
        return this.messages;
    }

    getLastMessage() {
        return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
    }

    clearMessages() {
        this.messages = [];
    }

    toJSON() {
        return {
            type: this.type,
            chatId: this.chatId,
            name: this.name,
            messages: this.messages
        };
    }

    static fromJSON(json) {
        const chat = new Chat(json.type, json.chatId, json.name);
        chat.messages = json.messages || [];
        return chat;
    }
}

export { Chat };