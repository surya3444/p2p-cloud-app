// frontend/src/p2pService.js
import io from 'socket.io-client';
import Peer from 'simple-peer';

const CHUNK_SIZE = 64 * 1024; // 64 KB

class P2PService {
    socket;
    peer;
    directoryHandle;
    fileDownloadRef = {};
    onStatusChange = () => {};
    onFileList = () => {};

    connect() {
        if (this.socket) return;
        
        // 1. Get the live backend URL from your environment variables
        const backendUrl = "https://p2pcloudapp-t33yuvp3.b4a.run";
        
        // 2. Use the live URL for the connection
        this.socket = io(backendUrl);
        
        this.socket.on('connect', () => {
            console.log('✅ Service connected to signaling server with ID:', this.socket.id);
        });
    }

    startHosting(directoryHandle, onReady) {
        this.directoryHandle = directoryHandle;
        this.socket.emit('join-room', this.socket.id);
        onReady(this.socket.id);

        this.socket.on('peer-joined', (payload) => {
            if (payload.peerId === this.socket.id) return;
            this.onStatusChange("Client joined. Creating P2P connection...");
            this.peer = new Peer({ initiator: true, trickle: false });
            this.setupPeerEvents();
            this.peer.on('signal', offer => {
                this.socket.emit('offer', { from: this.socket.id, roomId: this.socket.id, signal: offer });
            });
        });

        this.socket.on('answer', payload => {
            if (payload.from === this.socket.id) return;
            this.peer.signal(payload.signal);
        });
    }

    joinAsClient(roomId) {
        this.socket.emit('join-room', roomId);
        this.socket.on('offer', payload => {
            if (payload.from === this.socket.id) return;
            this.onStatusChange("Received offer. Creating answer...");
            this.peer = new Peer({ initiator: false, trickle: false });
            this.setupPeerEvents();
            this.peer.on('signal', answer => {
                this.socket.emit('answer', { from: this.socket.id, roomId: roomId, signal: answer });
            });
            this.peer.signal(payload.signal);
        });
    }

    // ✨ MODIFIED: Now accepts a path array
    requestFileList(path = []) {
        if (this.peer) {
            this.peer.send(JSON.stringify({ type: 'list-files', payload: { path } }));
        }
    }

    // ✨ MODIFIED: Now accepts a file name and a path array
    requestFile(fileName, path = []) {
        if (this.peer) {
            this.onStatusChange(`Downloading ${fileName}...`);
            this.peer.send(JSON.stringify({ type: 'request-file', payload: { fileName, path } }));
        }
    }

    setupPeerEvents() {
        this.peer.on('connect', () => {
            console.log('🎉 P2P CONNECTION ESTABLISHED!');
            this.onStatusChange('✅ Connection Established!');
        });

        this.peer.on('error', err => {
            console.error('P2P PEER ERROR:', err);
            this.onStatusChange(`❌ Error: ${err.message}`);
        });

        this.peer.on('data', async (data) => {
            let message;
            try {
                message = JSON.parse(data.toString());
            } catch (err) {
                const { name, chunks } = this.fileDownloadRef;
                if (name && chunks) {
                    chunks.push(data);
                }
                return;
            }

            // --- HOST LOGIC ---
            if (this.directoryHandle) { // Only run this logic if we are the host
                if (message.type === 'list-files') {
                    const path = message.payload.path || [];
                    let currentHandle = this.directoryHandle;
                    // Traverse into the requested subdirectory
                    for (const dirName of path) {
                        currentHandle = await currentHandle.getDirectoryHandle(dirName);
                    }
                    
                    const fileList = [];
                    for await (const entry of currentHandle.values()) {
                        fileList.push({ name: entry.name, kind: entry.kind });
                    }
                    this.peer.send(JSON.stringify({ type: 'file-list', payload: fileList }));

                } else if (message.type === 'request-file') {
                    const { fileName, path } = message.payload;
                    let currentHandle = this.directoryHandle;
                    // Traverse into the subdirectory where the file is
                    for (const dirName of path) {
                        currentHandle = await currentHandle.getDirectoryHandle(dirName);
                    }
                    const fileHandle = await currentHandle.getFileHandle(fileName);
                    const file = await fileHandle.getFile();
                    const fileBuffer = await file.arrayBuffer();
                    
                    this.peer.send(JSON.stringify({ type: 'file-header', payload: { name: fileName } }));
                    for (let i = 0; i < fileBuffer.byteLength; i += CHUNK_SIZE) {
                        this.peer.send(fileBuffer.slice(i, i + CHUNK_SIZE));
                    }
                    this.peer.send(JSON.stringify({ type: 'file-end', payload: { name: fileName } }));
                }
            }

            // --- CLIENT LOGIC ---
            if (message.type === 'file-list') {
                this.onFileList(message.payload);
            } else if (message.type === 'file-header') {
                this.fileDownloadRef = { name: message.payload.name, chunks: [] };
            } else if (message.type === 'file-end') {
                const { name, chunks } = this.fileDownloadRef;
                if (name === message.payload.name) {
                    const fileBlob = new Blob(chunks);
                    const url = URL.createObjectURL(fileBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    this.onStatusChange(`Downloaded ${name}!`);
                    this.fileDownloadRef = {};
                }
            }
        });
    }
}

export const p2pService = new P2PService();
