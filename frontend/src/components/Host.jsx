// frontend/src/components/Host.jsx
import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import { get, set } from 'idb-keyval';
import { useAuth } from '../AuthContext.jsx';
import io from 'socket.io-client';

// Helper function to get folder metadata (paths and sizes) for zipping
async function getFolderMetadata(dirHandle) {
  const files = [];
  let totalSize = 0;
  async function scan(handle, path) {
    for await (const entry of handle.values()) {
      const newPath = [...path, entry.name];
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        files.push({ path: newPath, size: file.size });
        totalSize += file.size;
      } else if (entry.kind === 'directory') {
        await scan(entry, newPath);
      }
    }
  }
  await scan(dirHandle, []);
  return { files, totalSize };
}

function Host() {
  const { token, logout } = useAuth();
  const [status, setStatus] = useState('Initializing...');
  
  // State for the website preview feature
  const [projectId, setProjectId] = useState('');
  const [previewLink, setPreviewLink] = useState('');
  const [hostingMode, setHostingMode] = useState(null);

  const peerRef = useRef(null);
  const directoryHandleRef = useRef(null);
  const fileWriterRef = useRef(null);
  const fileReaderRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Get the live backend URL from your environment variables
const backendUrl = "https://p2pcloudapp-t33yuvp3.b4a.run";

// Update the Socket.IO connection to use the live URL
const socket = io(backendUrl);
socketRef.current = socket;
    
    const checkForSavedHandle = async () => {
      try {
        const savedHandle = await get('directoryHandle');
        if (savedHandle && (await savedHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
          directoryHandleRef.current = savedHandle;
          setStatus(`Restored session for "${savedHandle.name}". Choose a hosting mode.`);
        } else {
          setStatus("Please select a folder to begin.");
        }
      } catch (err) {
        setStatus("Please select a folder to begin.");
      }
    };
    checkForSavedHandle();

    // Get the live backend URL from your environment variables

// Extract just the hostname (e.g., "p2p-backend.up.railway.app")
const peerHost = new URL(backendUrl).hostname;

const peer = new Peer({
  host: peerHost,  // Your live Railway domain
  port: 443,       // The standard HTTPS port
  path: '/myapp',
  secure: true     // Must be true for live servers
});
peerRef.current = peer;
    
    peer.on('open', (peerId) => {
        console.log('✅ Host PeerJS is online with ID:', peerId);

        if (!hostingMode) {
          setStatus('Online. Please select a folder and hosting mode.');
        }

        if (hostingMode === 'personal') {
            socket.emit('register-host', { token, peerId });
            setStatus('Online as Personal Cloud. Ready for your client to connect.');
        } else if (hostingMode === 'webreview' && projectId) {
            socket.emit('register-webreview', { projectId, peerId });
            setPreviewLink(`${window.location.origin}/view/${projectId}`);
            setStatus(`Live Preview is active for project: ${projectId}`);
        }
    });

    peer.on('connection', (conn) => {
      setStatus('✅ Connection Established!');
      conn.on('data', async (data) => {
        if (typeof data === 'string') {
          const message = JSON.parse(data);
          
          if (message.type === 'list-files') {
            const path = message.payload.path || [];
            try {
              let currentHandle = directoryHandleRef.current;
              for (const dirName of path) { currentHandle = await currentHandle.getDirectoryHandle(dirName); }
              const fileList = [];
              for await (const entry of currentHandle.values()) { fileList.push({ name: entry.name, kind: entry.kind }); }
              conn.send(JSON.stringify({ type: 'file-list', payload: fileList }));
            } catch (err) { console.error("Error listing files:", err); }

          } else if (message.type === 'request-file') {
            const { fileName, path } = message.payload;
            try {
              let currentHandle = directoryHandleRef.current;
              for (const dirName of path) { currentHandle = await currentHandle.getDirectoryHandle(dirName); }
              const fileHandle = await currentHandle.getFileHandle(fileName);
              const file = await fileHandle.getFile();
              conn.send(JSON.stringify({ type: 'file-header', payload: { name: file.name, size: file.size } }));
              const reader = file.stream().getReader();
              fileReaderRef.current = reader;
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                conn.send(value);
              }
              fileReaderRef.current = null;
              conn.send(JSON.stringify({ type: 'file-end', payload: { name: file.name } }));
            } catch (err) { console.error("Error sending file:", err); }

          } else if (message.type === 'upload-header') {
            const { name, path } = message.payload;
            setStatus(`Receiving ${name}...`);
            try {
              let currentHandle = directoryHandleRef.current;
              for (const dirName of path) { currentHandle = await currentHandle.getDirectoryHandle(dirName); }
              const newFileHandle = await currentHandle.getFileHandle(name, { create: true });
              fileWriterRef.current = await newFileHandle.createWritable();
            } catch (err) { console.error("Error creating file:", err); setStatus(`❌ Error: Could not save file. Check permissions.`); }
          
          } else if (message.type === 'upload-end') {
            if (fileWriterRef.current) {
              await fileWriterRef.current.close();
              fileWriterRef.current = null;
              setStatus(`Saved ${message.payload.name}!`);
            }

          } else if (message.type === 'request-folder') {
            const { folderName, path } = message.payload;
            setStatus(`Scanning folder: ${folderName}...`);
            try {
              let currentHandle = directoryHandleRef.current;
              for (const dirName of path) { currentHandle = await currentHandle.getDirectoryHandle(dirName); }
              const folderHandle = await currentHandle.getDirectoryHandle(folderName);
              const { files, totalSize } = await getFolderMetadata(folderHandle);
              conn.send(JSON.stringify({ type: 'folder-header', payload: { folderName, totalSize, files } }));
              setStatus(`Streaming ${folderName}...`);
              for (const fileMeta of files) {
                let fileHandle = folderHandle;
                for (let i = 0; i < fileMeta.path.length - 1; i++) {
                  fileHandle = await fileHandle.getDirectoryHandle(fileMeta.path[i]);
                }
                const finalFileHandle = await fileHandle.getFileHandle(fileMeta.path[fileMeta.path.length - 1]);
                const file = await finalFileHandle.getFile();
                conn.send(JSON.stringify({ type: 'folder-file-header', payload: { path: fileMeta.path, size: file.size } }));
                const reader = file.stream().getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  conn.send(value);
                }
              }
              conn.send(JSON.stringify({ type: 'folder-end', payload: { folderName } }));
              setStatus(`Sent ${folderName} for download.`);
            } catch(err) { console.error("Error processing folder:", err); setStatus(`❌ Error processing ${folderName}.`); }
          
          } else if (message.type === 'cancel-transfer') {
            setStatus('Transfer cancelled by client.');
            if (fileWriterRef.current) {
              await fileWriterRef.current.abort();
              fileWriterRef.current = null;
            }
            if (fileReaderRef.current) {
              await fileReaderRef.current.cancel();
              fileReaderRef.current = null;
            }
          
          } else if (message.type === 'get-webreview-file') {
             try {
                let currentHandle = directoryHandleRef.current;
                const filePath = message.payload.path.split('/').filter(p => p);
                for(let i = 0; i < filePath.length - 1; i++) {
                    currentHandle = await currentHandle.getDirectoryHandle(filePath[i]);
                }
                const finalFileHandle = await currentHandle.getFileHandle(filePath[filePath.length - 1]);
                const file = await finalFileHandle.getFile();
                
                conn.send(JSON.stringify({ type: 'file-header', payload: { name: message.payload.path, size: file.size } }));
                const reader = file.stream().getReader();
                while(true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    conn.send(value);
                }
                conn.send(JSON.stringify({ type: 'file-end', payload: { name: message.payload.path } }));
             } catch (err) {
                console.error(`Could not find or read ${message.payload.path}`, err);
                conn.send(JSON.stringify({ type: 'file-error', payload: { path: message.payload.path } }));
             }
          }
        } else {
          // Handle raw binary data for uploads
          if (fileWriterRef.current) { await fileWriterRef.current.write(data); }
        }
      });
    });

    peer.on('error', (err) => setStatus(`❌ Error: ${err.type}`));

    return () => {
      socket.disconnect();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, [token, hostingMode, projectId]);

  const handleSelectFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      directoryHandleRef.current = handle;
      setStatus(`Folder "${handle.name}" selected. Choose a hosting mode.`);
      setHostingMode(null);
      setPreviewLink('');
      await set('directoryHandle', handle);
    } catch (err) {
      console.error("Folder selection cancelled or failed:", err);
      setStatus("Folder selection cancelled. Please try again.");
    }
  };

  const startPersonalCloud = () => {
    setHostingMode('personal');
    // The useEffect will handle registration now that hostingMode has changed
  };

  const startWebPreview = () => {
    if (!projectId.trim()) {
      alert('Please enter a unique project ID.');
      return;
    }
    setHostingMode('webreview');
    // The useEffect will handle registration
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="host-container">
      <div style={{ position: 'absolute', top: '20px', right: '20px' }}>
        <button onClick={handleLogout} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#ff4d4d', color: 'white', border: 'none', borderRadius: '5px' }}>
          Logout
        </button>
      </div>

      <h1>Host Dashboard</h1>
      <p className="status-text">Status: {status}</p>
      
      <button className="action-button" onClick={handleSelectFolder}>
        {directoryHandleRef.current ? 'Change Hosted Folder' : 'Select Folder to Host'}
      </button>

      {directoryHandleRef.current && !hostingMode && (
        <div style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '30px' }}>
          <h3>Choose Hosting Mode for "{directoryHandleRef.current.name}"</h3>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '300px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
              <h4>Private Personal Cloud</h4>
              <p style={{color: '#666', fontSize: '0.9rem'}}>Only you can access this folder from your other devices.</p>
              <button onClick={startPersonalCloud} className="action-button">Start Personal Cloud</button>
            </div>
            <div style={{ flex: 1, minWidth: '300px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
              <h4>Public Live Preview</h4>
              <p style={{color: '#666', fontSize: '0.9rem'}}>Anyone with the link can view this folder as a website.</p>
              <input 
                type="text" 
                placeholder="Enter a unique project-id" 
                value={projectId}
                onChange={(e) => setProjectId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                style={{ padding: '10px', width: '90%', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '5px' }}
              />
              <button onClick={startWebPreview} className="action-button">Start Live Preview</button>
            </div>
          </div>
        </div>
      )}

      {hostingMode === 'webreview' && previewLink && (
        <div style={{ marginTop: '20px' }}>
          <h2>Share this Public Preview Link:</h2>
          <input type="text" value={previewLink} readOnly style={{ width: '100%', maxWidth: '500px', textAlign: 'center', padding: '10px', fontSize: '1rem', border: '1px solid #ccc', borderRadius: '5px' }} />
        </div>
      )}
      {hostingMode === 'personal' && (
        <p style={{marginTop: '40px', color: '#666'}}>
          This device is now acting as your private host. You can connect from another device.
        </p>
      )}
    </div>
  );
}

export default Host;
