// frontend/src/components/Client.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Peer from 'peerjs';
import JSZip from 'jszip';
import { useAuth } from '../AuthContext.jsx';
import io from 'socket.io-client';
import ProgressBar from './ProgressBar.jsx';
import './FileBrowser.css';

function Client() {
  const { token } = useAuth();
  const [status, setStatus] = useState('Initializing...');
  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);

  // States for download progress
  const [downloadingFile, setDownloadingFile] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadingFolder, setDownloadingFolder] = useState(null);
  const [folderProgress, setFolderProgress] = useState(0);

  // States for upload progress
  const [uploadingFile, setUploadingFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const fileChunksRef = useRef({});
  const receivedBytesRef = useRef(0);
  const fileInputRef = useRef(null);
  const downloadingFileRef = useRef(null);
  const zipRef = useRef(null);
  const currentZippingFileRef = useRef({ path: null, chunks: [], size: 0 });

  useEffect(() => {
    if (!token) return;

    const socket = io('http://localhost:8000');
    const peer = new Peer({ host: 'localhost', port: 8000, path: '/myapp' });
    peerRef.current = peer;

    peer.on('open', () => {
      setStatus('Finding your Host...');
      socket.emit('find-my-host', { token }, (response) => {
        if (response.error) {
          setStatus(`❌ Error: ${response.error}`);
          return;
        }

        const conn = peer.connect(response.hostPeerId);
        connRef.current = conn;

        conn.on('open', () => {
          setStatus('✅ Connection Established!');
          conn.send(JSON.stringify({ type: 'list-files', payload: { path: [] } }));
        });

        conn.on('data', async (data) => {
          if (typeof data === 'string') {
            const message = JSON.parse(data);

            if (message.type === 'file-list') { setFiles(message.payload); }
            else if (message.type === 'file-header') {
              const { name, size } = message.payload;
              fileChunksRef.current[name] = [];
              receivedBytesRef.current = 0;
              setDownloadingFile({ name, size });
              downloadingFileRef.current = { name, size };
              setDownloadProgress(0);
              setStatus(`Downloading ${name}...`);
            } else if (message.type === 'file-end') {
              const fileName = message.payload.name;
              const chunks = fileChunksRef.current[fileName];
              if (chunks) {
                  const fileBlob = new Blob(chunks);
                  const url = URL.createObjectURL(fileBlob);
                  const a = document.createElement('a'); a.href = url; a.download = fileName;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  URL.revokeObjectURL(url);
              }
              setStatus(`Downloaded ${fileName}!`);
              delete fileChunksRef.current[fileName];
              setDownloadingFile(null);
              downloadingFileRef.current = null;
              setDownloadProgress(0);
            } else if (message.type === 'folder-header') {
              // ✨ A folder stream is starting
              const { folderName, totalSize } = message.payload;
              zipRef.current = new JSZip();
              setDownloadingFolder({ name: folderName, size: totalSize });
              setFolderProgress(0);
              setStatus(`Receiving folder: ${folderName}...`);
              receivedBytesRef.current = 0;
            } else if (message.type === 'folder-file-header') {
              // ✨ Prepare to receive chunks for a specific file within the zip
              const { path, size } = message.payload;
              currentZippingFileRef.current = { path, size, chunks: [] };
            } else if (message.type === 'folder-end') {
              // ✨ The folder stream is complete
              const folderName = message.payload.folderName;
              setStatus(`Zipping ${folderName}...`);
              const zipBlob = await zipRef.current.generateAsync({ type: "blob" });
              const url = URL.createObjectURL(zipBlob);
              const a = document.createElement('a'); a.href = url; a.download = `${folderName}.zip`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
              setStatus(`Downloaded ${folderName}.zip!`);
              setDownloadingFolder(null);
              setFolderProgress(0);
            }
          } else {
            // It's a raw file chunk. Decide where it belongs.
            if (downloadingFileRef.current) {
              // It's for a single file download
              const fileName = downloadingFileRef.current.name;
              fileChunksRef.current[fileName].push(data);
              receivedBytesRef.current += data.byteLength;
              const percentage = Math.round((receivedBytesRef.current / downloadingFileRef.current.size) * 100);
              setDownloadProgress(percentage);
            } else if (downloadingFolder) {
              // ✨ It's for a folder download
              const { path, chunks, size } = currentZippingFileRef.current;
              if (path) {
                chunks.push(data);
                // Update overall progress bar
                receivedBytesRef.current += data.byteLength;
                const percentage = Math.round((receivedBytesRef.current / downloadingFolder.size) * 100);
                setFolderProgress(percentage);
                // Check if this file is complete
                const currentFileSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
                if (currentFileSize >= size) {
                  // Add the completed file to the zip
                  const fileBlob = new Blob(chunks);
                  zipRef.current.file(path.join('/'), fileBlob);
                  // Reset for the next file in the stream
                  currentZippingFileRef.current = { path: null, chunks: [], size: 0 };
                }
              }
            }
          }
        });
      });
    });
    peer.on('error', (err) => setStatus(`❌ Error: ${err.type}`));
    return () => {
      socket.disconnect();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, [token]);

  const handleFolderClick = (folderName) => {
    const newPath = [...currentPath, folderName];
    setCurrentPath(newPath);
    connRef.current.send(JSON.stringify({ type: 'list-files', payload: { path: newPath } }));
  };
  const handleBackClick = () => {
    const newPath = currentPath.slice(0, -1);
    setCurrentPath(newPath);
    connRef.current.send(JSON.stringify({ type: 'list-files', payload: { path: newPath } }));
  };
  const handleDownloadClick = (fileName) => {
    connRef.current.send(JSON.stringify({ type: 'request-file', payload: { fileName, path: currentPath } }));
  };
  const handleFolderDownload = (folderName) => {
    setStatus(`Requesting folder: ${folderName}...`);
    connRef.current.send(JSON.stringify({ type: 'request-folder', payload: { folderName, path: currentPath } }));
  };
  const handleUploadClick = () => { fileInputRef.current.click(); };
  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setStatus(`Uploading ${file.name}...`);
    setUploadingFile({ name: file.name, size: file.size });
    setUploadProgress(0);
    const conn = connRef.current;
    conn.send(JSON.stringify({ type: 'upload-header', payload: { name: file.name, path: currentPath } }));
    const reader = file.stream().getReader();
    let bytesSent = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      conn.send(value);
      bytesSent += value.byteLength;
      const percentage = Math.round((bytesSent / file.size) * 100);
      setUploadProgress(percentage);
    }
    conn.send(JSON.stringify({ type: 'upload-end', payload: { name: file.name } }));
    setStatus(`Uploaded ${file.name}!`);
    setUploadingFile(null);
    setTimeout(() => {
        conn.send(JSON.stringify({ type: 'list-files', payload: { path: currentPath } }));
    }, 500);
    event.target.value = '';
  };
  const handleCancelTransfer = () => {
    if (connRef.current) {
      connRef.current.send(JSON.stringify({ type: 'cancel-transfer' }));
    }
    setStatus('Transfer cancelled.');
    setDownloadingFile(null);
    setUploadingFile(null);
    setDownloadingFolder(null);
    downloadingFileRef.current = null;
    fileChunksRef.current = {};
    receivedBytesRef.current = 0;
  };

  const isTransferring = !!downloadingFile || !!uploadingFile || !!downloadingFolder;

  return (
    <div className="file-browser-container">
      <div className="file-browser-header">
        <h1>Remote File Browser</h1>
        <p>Path: / {currentPath.join(' / ')}</p>
        <p className="status-text">Status: {status}</p>
      </div>
      {downloadingFile && <ProgressBar title="Downloading File" name={downloadingFile.name} progress={downloadProgress} onCancel={handleCancelTransfer} />}
      {uploadingFile && <ProgressBar title="Uploading" name={uploadingFile.name} progress={uploadProgress} onCancel={handleCancelTransfer} />}
      {downloadingFolder && <ProgressBar title="Downloading Folder" name={downloadingFolder.name} progress={folderProgress} onCancel={handleCancelTransfer} />}
      <div className="file-browser-controls">
        <button className="action-button" onClick={handleUploadClick} disabled={isTransferring}>Upload File</button>
      </div>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
      <ul className="file-list">
        {currentPath.length > 0 && (
          <li className="file-item" onClick={isTransferring ? null : handleBackClick} style={{ cursor: isTransferring ? 'not-allowed' : 'pointer' }}>
            <span className="file-name">⬅️ Back</span>
          </li>
        )}
        {files.map(file => (
          <li key={file.name} className="file-item">
            <span className="file-name" onClick={() => file.kind === 'directory' && !isTransferring && handleFolderClick(file.name)} style={{ cursor: file.kind === 'directory' ? 'pointer' : 'default' }}>
              {file.kind === 'directory' ? '📁' : '📄'} {file.name}
            </span>
            <div className="file-actions">
              {file.kind === 'file' ? (
                <button onClick={() => handleDownloadClick(file.name)} disabled={isTransferring}>Download</button>
              ) : (
                <button onClick={() => handleFolderDownload(file.name)} disabled={isTransferring}>Download ZIP</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Client;