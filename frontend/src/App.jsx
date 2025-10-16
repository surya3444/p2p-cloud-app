// frontend/src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import Layout from './Layout.jsx';

// Import Pages
import Host from './components/Host.jsx';
import Client from './components/Client.jsx';
import Register from './pages/Register.jsx';
import Verify from './pages/Verify.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import WebViewer from './pages/WebViewer.jsx'; // ✨ NEW: Import the WebViewer page

import './App.css';

// This component protects routes that require a user to be logged in.
const PrivateRoute = ({ children }) => {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes - No Layout */}
        <Route path="/register" element={<Register />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/login" element={<Login />} />
        {/* ✨ NEW: The public route for viewing live previews */}
        <Route path="/view/:projectId" element={<WebViewer />} />

        {/* Protected Routes - All wrapped by the Layout */}
        <Route 
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="host" element={<Host />} />
          <Route path="client" element={<Client />} />
        </Route>
        
        {/* Redirect any other URL to the main page or login */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;