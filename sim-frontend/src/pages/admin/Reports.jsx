import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";

function Reports() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await apiFetch("/reports/dashboard");
      setReport(response.data);
    } catch (err) {
      console.error("REPORT ERROR:", err);
      setError(err.message || "Unable to load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (loading) return <div className="page-container"><div className="panel loading-box">Loading reports...</div></div>;

  if (error) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div><h1>Reports</h1><p>Registration, SIM type, agent and remaining SIM/IMSI reports</p></div>
          <button className="primary-button" onClick={loadReport}>Refresh</button>
        </div>
        <div className="dashboard-error">{error}</div>
      </div>
    );
  }

  const totals = report?.registration_totals || {};
  const inventory = report?.sim_inventory || {};
  const byType = report?.by_sim_type || [];
  const byAgent = report?.by_agent || [];
  const remaining = report?.remaining_sim_imsi || [];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Reports required by the ETL Tourist SIM project document</p>
        </div>
        <button className="primary-button" onClick={loadReport}>Refresh</button>
      </div>

      <section className="report-section">
        <h2>Registration totals</h2>
        <div className="stats-grid">
          <div className="stat-card"><span>Daily</span><strong>{totals.daily ?? 0}</strong><small>Registered today</small></div>
          <div className="stat-card"><span>Weekly</span><strong>{totals.weekly ?? 0}</strong><small>Registered this week</small></div>
          <div className="stat-card"><span>Monthly</span><strong>{totals.monthly ?? 0}</strong><small>Registered this month</small></div>
        </div>
      </section>

      <section className="report-section">
        <h2>SIM / IMSI status</h2>
        <div className="stats-grid">
          <div className="stat-card"><span>Total SIM</span><strong>{inventory.total ?? 0}</strong></div>
          <div className="stat-card"><span>Remaining</span><strong>{inventory.available ?? 0}</strong><small>Available for sale</small></div>
          <div className="stat-card"><span>Registered</span><strong>{inventory.registered ?? 0}</strong></div>
          <div className="stat-card"><span>Blocked</span><strong>{inventory.blocked ?? 0}</strong></div>
        </div>
      </section>

      <section className="report-section">
        <h2>By SIM type</h2>
        <div className="panel table-wrapper">
          <table className="agent-table">
            <thead><tr><th>SIM Type</th><th>Registrations</th></tr></thead>
            <tbody>
              {byType.length ? byType.map(item => (
                <tr key={item.id_sim_type}><td>{item.sim_type}</td><td>{item.registrations}</td></tr>
              )) : <tr><td colSpan="2">No SIM type data</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section">
        <h2>By Agent</h2>
        <div className="panel table-wrapper">
          <table className="agent-table">
            <thead><tr><th>Agent</th><th>Registrations</th></tr></thead>
            <tbody>
              {byAgent.length ? byAgent.map(item => (
                <tr key={item.id_agent}><td>{item.agent_name}</td><td>{item.registrations}</td></tr>
              )) : <tr><td colSpan="2">No agent data</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section">
        <h2>Remaining SIM / IMSI</h2>
        <div className="panel table-wrapper">
          <table className="agent-table">
            <thead>
              <tr><th>Phone Number</th><th>ICCID / Serial</th><th>IMSI</th><th>SIM Type</th><th>Status</th></tr>
            </thead>
            <tbody>
              {remaining.length ? remaining.map(item => (
                <tr key={item.id_sim}>
                  <td>{item.phone_number || "-"}</td>
                  <td>{item.iccid}</td>
                  <td>{item.imsi}</td>
                  <td>{item.sim_type || "-"}</td>
                  <td>{item.sim_status || "-"}</td>
                </tr>
              )) : <tr><td colSpan="5">No remaining SIM/IMSI</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Reports;
