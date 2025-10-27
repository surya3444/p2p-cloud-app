// frontend/src/pages/Register.jsx
import {React, useState} from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { useGoogleLogin } from '@react-oauth/google';

function Register() {
    const [formData, setFormData] = useState({ name: '', email: '', password: '' });
    const [message, setMessage] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleGoogleLogin = useGoogleLogin({
        flow: 'auth-code',
        onSuccess: async (codeResponse) => {
            setMessage('Authenticating with Google...');
            try {
                const response = await fetch('https://p2p-backend-7ex8.onrender.com/api/auth/google', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: codeResponse.code }),
                });
                const data = await response.json();
                if (response.ok) {
                    login(data.token);
                    navigate('/');
                } else {
                    setMessage(data.message || 'Google sign-up failed.');
                }
            } catch (err) { setMessage('Network error during Google sign-up.'); }
        },
        onError: (error) => setMessage('Google sign-up failed.'),
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // ✨ NEW: Strong Password Validation ✨
        // This regex checks for: minimum 8 characters, at least one uppercase letter,
        // one lowercase letter, one number, and one special character.
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(formData.password)) {
            setMessage('Password must be at least 8 characters and include uppercase, lowercase, number, and special characters.');
            return; // Stop the submission if the password is weak
        }

        setMessage('Registering...');
        try {
            const response = await fetch('https://p2p-backend-7ex8.onrender.com/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            if (response.ok) {
                setMessage(data.message);
                setTimeout(() => {
                    navigate('/verify', { state: { email: formData.email } });
                }, 2000);
            } else {
                setMessage(data.message || 'Registration failed.');
            }
        } catch (err) { setMessage('Network error.'); }
    };

    return (
        <div className="auth-container">
            <form onSubmit={handleSubmit} className="auth-form">
                <h2>Create Your Account</h2>
                <button type="button" onClick={() => handleGoogleLogin()} style={{ marginBottom: '15px' }}>
                    Continue with Google
                </button>
                <hr style={{ width: '100%', border: '1px solid #eee', margin: '0 0 15px 0' }} />
                <input type="text" name="name" placeholder="Name" onChange={handleChange} required />
                <input type="email" name="email" placeholder="Email" onChange={handleChange} required />
                <input type="password" name="password" placeholder="Password" onChange={handleChange} required />
                <button type="submit">Register with Email</button>
                {message && <p className="auth-message">{message}</p>}
                <p style={{ textAlign: 'center', marginTop: '15px' }}>
                    Already have an account? <Link to="/login">Login here</Link>
                </p>
            </form>
        </div>
    );
}

export default Register;
