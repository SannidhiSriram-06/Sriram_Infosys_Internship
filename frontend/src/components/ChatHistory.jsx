import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import { API_BASE } from '../config.js';

const ChatHistory = () => {
  const location = useLocation();
  const [verifications, setVerifications] = useState([]);
  const [stats, setStats] = useState({ total: 0, approved: 0, suspicious: 0, rejected: 0, nonKyc: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [dateFilter, setDateFilter] = useState("All Time");
  const [docFilter, setDocFilter] = useState("All Documents");

  // Fetch data on mount and when filters change
  useEffect(() => {
    fetchVerifications();
    fetchStats();
  }, [statusFilter, dateFilter, docFilter]);

  // Refresh when returning from decision save
  useEffect(() => {
    if (location.state?.refreshData) {
      console.log('🔄 Refreshing data after verification save...');
      fetchVerifications();
      fetchStats();
    }
  }, [location]);

  const fetchVerifications = async () => {
    try {
      setLoading(true);
      
      let url = `${API_BASE}/kyc/verifications`;
      const params = new URLSearchParams();
      
      if (statusFilter !== 'All Status') params.append('status', statusFilter);
      if (docFilter !== 'All Documents') params.append('docType', docFilter);
      if (dateFilter !== 'All Time') {
        const daysMap = { 'Last 7 Days': 7, 'Last 30 Days': 30, 'Last 90 Days': 90 };
        params.append('days', daysMap[dateFilter] || null);
      }
      
      if (params.toString()) url += '?' + params.toString();

      console.log('📥 Fetching from:', url);
      const response = await fetch(url);

      console.log('Response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Fetched verifications:', result.data);
        setVerifications(result.data || []);
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to fetch verifications:', response.status, errorText);
        setVerifications([]);
      }
    } catch (error) {
      console.error('❌ Error fetching verifications:', error);
      setVerifications([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const url = `${API_BASE}/kyc/verifications/stats`;
      console.log('📥 Fetching stats from:', url);
      const response = await fetch(url);

      console.log('Stats response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Fetched stats:', result.data);
        setStats(result.data || { total: 0, approved: 0, suspicious: 0, rejected: 0 });
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to fetch stats:', response.status, errorText);
      }
    } catch (error) {
      console.error('❌ Error fetching stats:', error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getConfidenceScore = (anomalyScore) => {
    if (anomalyScore === null || anomalyScore === undefined) return 0;
    return Math.round((1 - anomalyScore) * 100);
  };

  const getConfidenceColor = (score) => {
    if (score >= 70) return "var(--success)";
    if (score >= 50) return "var(--warning)";
    return "var(--danger)";
  };

  const getInitials = (name) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'N/A';
  };

  const filteredData = verifications.filter((row) => {
    const matchesSearch = row.user_name && row.user_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All Status' || row.status === statusFilter;
    const matchesDoc = docFilter === 'All Documents' || row.document_type === docFilter;
    return matchesSearch && matchesStatus && matchesDoc;
  });

  return (
    <DashboardLayout>
      <div className="page-header" style={{ marginBottom: "24px" }}>
        <h1>Verification History</h1>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-icon blue">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div className="metric-info">
            <h4>Total</h4>
            <div className="metric-value">{stats.total}</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon green">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div className="metric-info">
            <h4>Approved</h4>
            <div className="metric-value">{stats.approved}</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon yellow">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div className="metric-info">
            <h4>Suspicious</h4>
            <div className="metric-value">{stats.suspicious}</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon red">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <div className="metric-info">
            <h4>Rejected</h4>
            <div className="metric-value">{stats.rejected}</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon red">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <div className="metric-info">
            <h4>Non-KYC</h4>
            <div className="metric-value">{stats.nonKyc || 0}</div>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-input-wrapper">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" className="search-input" placeholder="Search by Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option>All Status</option>
          <option>Approved</option>
          <option>Suspicious</option>
          <option>Rejected</option>
          <option>Non-KYC</option>
        </select>
        <select className="filter-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
          <option>All Time</option>
          <option>Last 7 Days</option>
          <option>Last 30 Days</option>
          <option>Last 90 Days</option>
        </select>
        <select className="filter-select" value={docFilter} onChange={(e) => setDocFilter(e.target.value)}>
          <option>All Documents</option>
          <option>Aadhaar Card</option>
          <option>PAN Card</option>
          <option>Passport</option>
        </select>
      </div>

      <div className="dash-card" style={{ padding: "0", overflow: "hidden" }}>
        <div className="table-container" style={{ margin: 0, padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>User Name</th>
                <th>Document Type</th>
                <th>Submitted Date</th>
                <th>Anomaly Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>Loading...</td></tr>
              ) : filteredData.length > 0 ? (
                filteredData.map((row) => {
                  const confidenceScore = getConfidenceScore(row.anomaly_score);
                  const statusColor = row.status.toLowerCase();
                  
                  return (
                    <tr key={row._id}>
                      <td>
                        <div className="user-cell">
                          <span className={`status-dot ${statusColor}`}></span>
                          <div className="user-initials">{getInitials(row.user_name)}</div>
                          <div className="user-cell-info">
                            <h5>{row.user_name}</h5>
                            <span>{row.document_type.split(' ')[0]}</span>
                          </div>
                        </div>
                      </td>
                      <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="3" y1="9" x2="21" y2="9"></line>
                          <line x1="9" y1="21" x2="9" y2="9"></line>
                        </svg>
                        {row.document_type}
                      </td>
                      <td>{formatDate(row.submitted_date)}</td>
                      <td>
                        <div className="confidence-wrapper">
                          <span style={{ fontWeight: "600", fontSize: "13px" }}>{row.anomaly_score ? row.anomaly_score.toFixed(2) : 'N/A'}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${statusColor}`} style={{
                          backgroundColor: row.status === 'Approved' ? '#10B981' : 
                                         row.status === 'Suspicious' ? '#FBBF24' :
                                         row.status === 'Rejected' ? '#EF4444' : '#9CA3AF',
                          color: 'white'
                        }}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan="5" style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>No verifications yet. Start a new verification.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ChatHistory;