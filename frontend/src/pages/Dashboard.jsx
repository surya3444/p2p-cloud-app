// frontend/src/pages/Dashboard.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css'; // We'll create this new CSS file

function Dashboard() {
    const navigate = useNavigate();

    return (
        <div className="dashboard-container">
            <h1>Welcome to Your Personal Cloud</h1>
            <p className="subtitle">Choose an action for this device.</p>

            <div className="dashboard-cards">
                <div className="card" onClick={() => navigate('/host')}>
                    <h2>🖥️ Start Hosting</h2>
                    <p>Turn this device into a secure host. Select a folder to make its contents available to your other devices.</p>
                </div>
                <div className="card" onClick={() => navigate('/client')}>
                    <h2>📱 Connect to Host</h2>
                    <p>Access the files on your active host computer from this device. Browse, download, and upload files securely.</p>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;