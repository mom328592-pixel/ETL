import { useState } from "react";
import Users from "./Users";
import Agents from "./Agents";

function Management() {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const roleId = Number(user?.id_role ?? user?.role_id);

  const tabs = [];

  if (roleId === 1) {
    tabs.push({ id: "users", label: "Users" });
  }
  if ([1, 2].includes(roleId)) {
    tabs.push({ id: "agents", label: "Agents" });
  }

  const [activeTab, setActiveTab] = useState(tabs[0]?.id || "agents");

  return (
    <div className="page-container compact-module">
      <div className="page-header">
        <div>
          <h1>People & Access</h1>
          <p>Manage internal users and SIM agents required by the project document.</p>
        </div>
      </div>

      <div className="module-tabs" role="tablist" aria-label="People management">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`module-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "users" && roleId === 1 && <Users />}
      {activeTab === "agents" && [1, 2].includes(roleId) && <Agents />}
      
    </div>
  );
}

export default Management;
