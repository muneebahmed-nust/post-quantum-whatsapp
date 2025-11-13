from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

clients = {}  # sid -> {"name": name, "pubkey": None}

@app.route("/")
def index():
    return render_template("chat.html")

@socketio.on("connect")
def on_connect():
    print(f"🔗 Client connected: {request.sid}")

@socketio.on("disconnect")
def on_disconnect():
    clients.pop(request.sid, None)
    print(f"❌ Client disconnected: {request.sid}")

@socketio.on("pubkey")
def on_pubkey(data):
    print(f"📡 Received pubkey from {request.sid}, name: {data.get('name')}")
    clients[request.sid] = {"name": data.get("name"), "pubkey": data.get("pubkey")}
    peer_pubkeys = {sid: c["pubkey"] for sid, c in clients.items() if sid != request.sid}
    print(f"📤 Sending peer_pubkeys to {request.sid}: {peer_pubkeys.keys()}")
    emit("peer_pubkeys", peer_pubkeys, to=request.sid)

@socketio.on("send_kem_ciphertext")
def on_send_kem_ciphertext(data):
    target_sid = data.get("to")
    print(f"🔐 KEM ciphertext from {request.sid} to {target_sid}")
    if target_sid in clients:
        emit("recv_kem_ciphertext", {"from": request.sid, "ciphertext": data.get("ciphertext")}, to=target_sid)
    else:
        print(f"⚠️ Target SID {target_sid} not found!")

@socketio.on("send_message")
def on_send_message(data):
    target_sid = data.get("to")
    print(f"✉️ Message from {request.sid} to {target_sid}")
    if target_sid in clients:
        emit("recv_message", {"from": request.sid, "ciphertext": data.get("ciphertext")}, to=target_sid)
    else:
        print(f"⚠️ Target SID {target_sid} not found!")

if __name__ == "__main__":
    print("Starting server on 0.0.0.0:5001 with HTTPS")
    # Generate adhoc SSL certificate for HTTPS
    import ssl
    from OpenSSL import crypto
    import os
    
    # Create self-signed certificate if it doesn't exist
    cert_file = 'cert.pem'
    key_file = 'key.pem'
    
    if not os.path.exists(cert_file) or not os.path.exists(key_file):
        print("Generating self-signed certificate...")
        # Create a key pair
        k = crypto.PKey()
        k.generate_key(crypto.TYPE_RSA, 2048)
        
        # Create a self-signed cert
        cert = crypto.X509()
        cert.get_subject().C = "US"
        cert.get_subject().ST = "State"
        cert.get_subject().L = "City"
        cert.get_subject().O = "Organization"
        cert.get_subject().OU = "Organizational Unit"
        cert.get_subject().CN = "localhost"
        cert.set_serial_number(1000)
        cert.gmtime_adj_notBefore(0)
        cert.gmtime_adj_notAfter(31536000)  # Valid for 1 year
        cert.set_issuer(cert.get_subject())
        cert.set_pubkey(k)
        cert.sign(k, 'sha256')
        
        # Save certificate and key
        with open(cert_file, "wb") as f:
            f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
        with open(key_file, "wb") as f:
            f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
        print("Certificate generated!")
    
    # Run with SSL
    socketio.run(app, host="0.0.0.0", port=5001, debug=True, 
                 certfile=cert_file, keyfile=key_file)
