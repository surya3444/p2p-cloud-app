// frontend/src/components/ProgressBar.jsx
import React from 'react';
import './FileBrowser.css'; // We'll create this CSS file next

function ProgressBar({ title, name, progress, onCancel }) {
  return (
    <div className="progress-bar-container">
      <p className="progress-title">{title}: {name}</p>
      <div className="progress-bar-wrapper">
        <progress value={progress} max="100" className="progress-bar"></progress>
        <span className="progress-percentage">{progress}%</span>
        <button onClick={onCancel} className="cancel-button">Cancel</button>
      </div>
    </div>
  );
}

export default ProgressBar;