// frontend/src/pages/Verify.jsx
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx'; // Import our auth hook

function Verify() {
    const [otp, setOtp] = useState('');
    const [message, setMessage] = useState('');
    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuth(); // Get the login function from our context
    const email = location.state?.email; // Get the email passed from the register page

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('Verifying...');

        if (!email) {
            setMessage('Email not found. Please register again.');
            return;
        }

        try {
            const response = await fetch('https://p2pcloudapp-t33yuvp3.b4a.run/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp }),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage(data.message);
                // The backend sent us a token, so we log the user in
                login(data.token);
                // Redirect to the main application (Host page) after a short delay
                setTimeout(() => {
                    navigate('/');
                }, 1500);
            } else {
                setMessage(data.message || 'Verification failed.');
            }
        } catch (err) {
            setMessage('Network error. Could not connect to the server.');
        }
    };

    return (
        <div className="auth-container">
            <form onSubmit={handleSubmit} className="auth-form">
                <h2>Verify Your Email</h2>
                <p>An OTP has been sent to {email || 'your email'}.</p>
                <input
                    type="text"
                    name="otp"
                    placeholder="6-Digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                />
                <button type="submit">Verify</button>
                {message && <p className="auth-message">{message}</p>}
            </form>
        </div>
    );
}

export default Verify;
