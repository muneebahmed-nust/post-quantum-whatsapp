class Message {
    constructor(content_type, content) {
        this.content_type = content_type; // 'text', 'image', etc.
        this.content = content;
        this.timestamp = new Date();
        this.image_base64 = null;
        this.sender = null; // Who sent the message
        this.isSent = false; // true if sent by current user
    }

    toJsonString() {
        return JSON.stringify({
            content_type: this.content_type,
            content: this.content,
            timestamp: this.timestamp,
            image_base64: this.image_base64,
            sender: this.sender,
            isSent: this.isSent
        });
    }

    fromJsonString(jsonString) {
        let obj = JSON.parse(jsonString);
        this.content_type = obj.content_type;
        this.content = obj.content;
        this.timestamp = new Date(obj.timestamp);
        this.image_base64 = obj.image_base64;
        this.sender = obj.sender;
        this.isSent = obj.isSent;
        return this;
    }

    static fromJsonString(jsonString) {
        let obj = JSON.parse(jsonString);
        const message = new Message(obj.content_type, obj.content);
        message.timestamp = new Date(obj.timestamp);
        message.image_base64 = obj.image_base64;
        message.sender = obj.sender;
        message.isSent = obj.isSent;
        return message;
    }

    fromImageToBase64(imageFile, callback) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            this.image_base64 = e.target.result;
            callback(this.image_base64);
        };
        
        reader.onerror = (error) => {
            console.error('Error reading file:', error);
            callback(null, error);
        };
        
        reader.readAsDataURL(imageFile);
    }

    static async imageToBase64(imageFile) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(imageFile);
        });
    }

    fromBase64ToFile(base64String, filename, mimeType) {
        const base64Data = base64String.includes(',') 
            ? base64String.split(',')[1] 
            : base64String;
        
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const blob = new Blob([bytes], { type: mimeType });
        const file = new File([blob], filename, { type: mimeType });
        
        return file;
    }

    static base64ToBlob(base64String, mimeType = 'image/jpeg') {
        const base64Data = base64String.includes(',') 
            ? base64String.split(',')[1] 
            : base64String;
        
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return new Blob([bytes], { type: mimeType });
    }
}

export { Message };