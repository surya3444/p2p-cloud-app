// frontend/src/pages/WebViewer.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Peer from 'peerjs';
import io from 'socket.io-client';

function WebViewer() {
    const { projectId } = useParams();
    const [status, setStatus] = useState('Finding live preview host...');
    // This state will now hold a URL, not an HTML string.
    const [iframeSrc, setIframeSrc] = useState('');
    const connRef = useRef(null);
    const filePromises = useRef(new Map()); // Maps file paths to their Promise resolve/reject functions

    useEffect(() => {
        // 1. Get the live backend URL from your environment variables
const backendUrl = "https://p2pcloudapp-t33yuvp3.b4a.run";

// 2. Extract just the hostname (e.g., "p2p-backend.up.railway.app")
const peerHost = new URL(backendUrl).hostname;

// 3. Update the Socket.IO connection to use the live URL
const socket = io(backendUrl);

// 4. Update the PeerJS connection for the live server
const peer = new Peer({
  host: peerHost,  // Your live domain
  port: 443,       // The standard HTTPS port
  path: '/myapp',
  secure: true     // Must be true for live servers
});
        // Helper function to request a file from the host and return a promise for its blob
        const getFile = (path) => {
            return new Promise((resolve, reject) => {
                // Store the resolve/reject functions so the 'data' handler can use them
                filePromises.current.set(path, { resolve, reject, chunks: [] });
                // Send the request to the host
                connRef.current.send(JSON.stringify({ type: 'get-webreview-file', payload: { path } }));
            });
        };

        peer.on('open', () => {
            socket.emit('find-webreview-host', { projectId }, (response) => {
                if (response.error) {
                    setStatus(`❌ Error: ${response.error}`);
                    return;
                }
                setStatus(`Connecting to host...`);
                const conn = peer.connect(response.hostPeerId);
                connRef.current = conn;

                conn.on('open', async () => {
                    setStatus('Connection established. Fetching website...');
                    try {
                        // 1. Fetch the main index.html file
                        const indexBlob = await getFile('index.html');
                        const htmlContent = await indexBlob.text();
                        setStatus('Parsing assets...');

                        // 2. Parse the HTML to find all linked assets (CSS, JS, images)
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(htmlContent, 'text/html');
                        
                        const assetPromises = [];
                        const assetElements = doc.querySelectorAll('link[href], script[src], img[src]');
                        
                        assetElements.forEach(el => {
                            const urlAttr = el.hasAttribute('href') ? 'href' : 'src';
                            const originalUrl = el.getAttribute(urlAttr);

                            // Only process relative local paths
                            if (originalUrl && !originalUrl.startsWith('http') && !originalUrl.startsWith('data:')) {
                                assetPromises.push(
                                    getFile(originalUrl).then(assetBlob => {
                                        // 3. For each asset, create a local in-memory URL
                                        const blobUrl = URL.createObjectURL(assetBlob);
                                        // 4. Rewrite the HTML to point to our new local URL
                                        el.setAttribute(urlAttr, blobUrl);
                                    }).catch(err => {
                                        console.error(`Failed to load asset: ${originalUrl}`, err);
                                    })
                                );
                            }
                        });

                        // 5. Wait for all assets to be fetched and all URLs to be rewritten
                        await Promise.all(assetPromises);
                        setStatus('Rendering website...');

                        // 6. Serialize the final, self-contained HTML to a string
                        const finalHtml = new XMLSerializer().serializeToString(doc);
                        // 7. Create a Blob from that HTML string
                        const htmlBlob = new Blob([finalHtml], { type: 'text/html' });
                        // 8. Create a final blob: URL for the main HTML file itself
                        const finalBlobUrl = URL.createObjectURL(htmlBlob);
                        
                        // 9. Set the iframe's source to this new URL, which allows scripts to run
                        setIframeSrc(finalBlobUrl);
                        setStatus('');

                    } catch (err) {
                        setStatus(`❌ Error: Could not load index.html. ${err.message}`);
                    }
                });

                conn.on('data', (data) => {
                    // This is the central handler for all incoming file data from the host
                    if (typeof data === 'string') {
                        const message = JSON.parse(data);
                        if (message.type === 'file-header') {
                            // A new file transfer is starting, prepare to receive its chunks
                            const promise = filePromises.current.get(message.payload.name);
                            if (promise) {
                                promise.chunks = [];
                            }
                        } else if (message.type === 'file-end') {
                            const fileName = message.payload.name;
                            const promise = filePromises.current.get(fileName);
                            if (promise && promise.chunks) {
                                // The file is complete, create a Blob and resolve the promise
                                const fileBlob = new Blob(promise.chunks);
                                promise.resolve(fileBlob); 
                                filePromises.current.delete(fileName);
                            }
                        } else if (message.type === 'file-error') {
                            const promise = filePromises.current.get(message.payload.path);
                            if (promise) {
                                // The host couldn't find the file, reject the promise
                                promise.reject(new Error('File not found on host'));
                                filePromises.current.delete(message.payload.path);
                            }
                        }
                    } else {
                        // It's a raw file chunk. Find which file it belongs to.
                        const activePromise = Array.from(filePromises.current.values()).find(p => p.chunks && !p.isResolved);
                        if (activePromise) {
                            activePromise.chunks.push(data);
                        }
                    }
                });
            });
        });
        peer.on('error', (err) => setStatus(`❌ P2P Error: ${err.type}`));
        
        // Cleanup function
        return () => {
            socket.disconnect();
            if (peer) peer.destroy();
        };
    }, [projectId]);

    if (status) {
        return (
            <div style={{ fontFamily: 'sans-serif', textAlign: 'center', paddingTop: '100px' }}>
                <h1>Loading Preview...</h1><p>{status}</p>
            </div>
        );
    }

    return (
        <iframe 
            src={iframeSrc} 
            title={projectId} 
            sandbox="allow-scripts allow-same-origin" 
            style={{ width: '100%', height: '100vh', border: 'none' }} 
        />
    );
}

export default WebViewer;
