// frontend/src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { useGoogleLogin } from '@react-oauth/google';

function Login() {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [message, setMessage] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleGoogleLogin = useGoogleLogin({
        flow: 'auth-code',
        onSuccess: async (codeResponse) => {
            setMessage('Authenticating with Google...');
            try {
                const response = await fetch('https://p2pcloudapp-a5k7yqu2.b4a.run/api/auth/google', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: codeResponse.code }),
                });
                const data = await response.json();
                if (response.ok) {
                    login(data.token);
                    navigate('/');
                } else {
                    setMessage(data.message || 'Google login failed.');
                }
            } catch (err) { setMessage('Network error during Google login.'); }
        },
        onError: (error) => setMessage('Google login failed.'),
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('Logging in...');
        try {
            const response = await fetch('https://p2pcloudapp-a5k7yqu2.b4a.run/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            if (response.ok) {
                login(data.token);
                navigate('/');
            } else {
                setMessage(data.message || 'Login failed.');
            }
        } catch (err) { setMessage('Network error.'); }
    };

    return (
        <div className="auth-container">
            <form onSubmit={handleSubmit} className="auth-form">
                <h2>Login to Your Account</h2>
                <button type="button" onClick={() => handleGoogleLogin()} style={{ marginBottom: '15px' }}>
                    Continue with Google
                </button>
                <hr style={{ width: '100%', border: '1px solid #eee', margin: '0 0 15px 0' }} />
                <input type="email" name="email" placeholder="Email" onChange={handleChange} required />
                <input type="password" name="password" placeholder="Password" onChange={handleChange} required />
                <button type="submit">Login with Email</button>
                {message && <p className="auth-message">{message}</p>}
                <p style={{ textAlign: 'center', marginTop: '15px' }}>
                    Don't have an account? <Link to="/register">Register here</Link>
                </p>
            </form>
        </div>
    );
}

export default Login;
