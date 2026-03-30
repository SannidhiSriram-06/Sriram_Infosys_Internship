import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser } from "../services/api";
import "../styles/Register.css";

function Register() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const data = await registerUser({
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });

      if (data.success) {
        alert("Account created successfully!");
        navigate("/login");
      } else {
        setError(data.error || "Registration failed");
      }
    } catch (err) {
      setError("Server unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <h2>Create Account</h2>
        <p className="subtitle">Create your new account</p>

        {error && (
          <div style={{ color: "#e74c3c", fontSize: "13px", marginBottom: "12px", textAlign: "center" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
            />
            <label>Full Name</label>
          </div>

          <div className="input-group">
            <input
              type="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
            />
            <label>Email</label>
          </div>

          <div className="input-group">
            <input
              type="password"
              name="password"
              required
              value={formData.password}
              onChange={handleChange}
            />
            <label>Password</label>
          </div>

          <div className="input-group">
            <input
              type="password"
              name="confirmPassword"
              required
              value={formData.confirmPassword}
              onChange={handleChange}
            />
            <label>Confirm Password</label>
          </div>

          <button type="submit" className="register-btn" disabled={loading}>
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <div className="extra-links">
          <a href="/login">Already have an account?</a>
        </div>
      </div>
    </div>
  );
}

export default Register;
