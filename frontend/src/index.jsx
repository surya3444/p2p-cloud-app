// frontend/src/index.jsx
import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App.jsx';
import reportWebVitals from './reportWebVitals';
import { AuthProvider } from './AuthContext.jsx';
import { GoogleOAuthProvider } from '@react-oauth/google'; // ✨ NEW

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

ReactDOM.render(
  <React.StrictMode>
    {/* ✨ NEW: Wrap with Google provider */}
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>,
  document.getElementById('root')
);

reportWebVitals();