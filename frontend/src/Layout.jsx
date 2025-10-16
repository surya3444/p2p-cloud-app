// frontend/src/Layout.jsx
import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { jwtDecode } from 'jwt-decode';

function Layout() {
    const { token, logout } = useAuth();
    const navigate = useNavigate();
    
    // Decode the token to get the user's name
    const userName = token ? jwtDecode(token).name : 'User';

    const handleLogout = () => {
        logout();
        navigate('/login'); // Redirect to login after logout
    };

    return (
        <div className="app-layout">
            <nav className="navbar">
                <div className="navbar-brand">P2P Cloud</div>
                <div className="navbar-user">
                    <span>Welcome, {userName}</span>
                    <button onClick={handleLogout} className="logout-button">Logout</button>
                </div>
            </nav>
            <main className="content-area">
                {/* This is where our pages (Host, Client, etc.) will be rendered */}
                <Outlet />
            </main>
        </div>
    );
}

export default Layout;