const pool = require("../db");

// Document-required reports:
// 1) Daily / Weekly / Monthly registration totals
// 2) Registration totals by SIM type
// 3) Registration totals by Agent
// 4) Remaining SIM/IMSI inventory

const getDashboardReports = async (req, res) => {
    try {
        const [[simStats]] = await pool.query(`
            SELECT
                COUNT(*) AS total_sim,
                COALESCE(SUM(LOWER(ss.sim_status)='available'),0) AS available_sim,
                COALESCE(SUM(LOWER(ss.sim_status)='registered'),0) AS registered_sim,
                COALESCE(SUM(LOWER(ss.sim_status)='blocked'),0) AS blocked_sim
            FROM sim_cards s
            LEFT JOIN sim_status ss ON s.id_sim_status=ss.id_sim_status
            WHERE s.deleted_at IS NULL
        `);

        const [[registrationStats]] = await pool.query(`
            SELECT
                COUNT(*) AS total_registrations,
                COALESCE(SUM(rs.status_name='Pending'),0) AS pending,
                COALESCE(SUM(rs.status_name='Approved'),0) AS approved,
                COALESCE(SUM(rs.status_name='Rejected'),0) AS rejected
            FROM registrations r
            LEFT JOIN registrations_status rs ON r.id_registration_status=rs.id_registration_status
            WHERE r.deleted_at IS NULL
        `);

        const [periodRows] = await pool.query(`
            SELECT
                COUNT(CASE WHEN DATE(r.registered_at)=CURDATE() THEN 1 END) AS daily,
                COUNT(CASE WHEN YEARWEEK(r.registered_at,1)=YEARWEEK(CURDATE(),1) THEN 1 END) AS weekly,
                COUNT(CASE WHEN YEAR(r.registered_at)=YEAR(CURDATE()) AND MONTH(r.registered_at)=MONTH(CURDATE()) THEN 1 END) AS monthly
            FROM registrations r
            WHERE r.deleted_at IS NULL
        `);

        const [byType] = await pool.query(`
            SELECT
                st.id_sim_type,
                st.sim_type,
                COUNT(r.id_registration) AS registrations
            FROM sim_types st
            LEFT JOIN sim_cards s ON s.id_sim_type=st.id_sim_type
            LEFT JOIN registrations r ON r.id_sim=s.id_sim AND r.deleted_at IS NULL
            GROUP BY st.id_sim_type, st.sim_type
            ORDER BY registrations DESC, st.sim_type
        `);

        const [byAgent] = await pool.query(`
            SELECT
                a.id_agent,
                a.agent_name,
                COUNT(r.id_registration) AS registrations
            FROM agents a
            LEFT JOIN registrations r ON r.id_agent=a.id_agent AND r.deleted_at IS NULL
            WHERE a.deleted_at IS NULL
            GROUP BY a.id_agent, a.agent_name
            ORDER BY registrations DESC, a.agent_name
        `);

        const [remaining] = await pool.query(`
            SELECT
                s.id_sim,
                s.phone_number,
                s.iccid,
                s.imsi,
                st.sim_type,
                ss.sim_status
            FROM sim_cards s
            LEFT JOIN sim_types st ON s.id_sim_type=st.id_sim_type
            LEFT JOIN sim_status ss ON s.id_sim_status=ss.id_sim_status
            WHERE s.deleted_at IS NULL
              AND LOWER(ss.sim_status)='available'
            ORDER BY s.id_sim ASC
        `);

        res.json({
            success: true,
            data: {
                registration_totals: {
                    daily: Number(periodRows[0]?.daily || 0),
                    weekly: Number(periodRows[0]?.weekly || 0),
                    monthly: Number(periodRows[0]?.monthly || 0)
                },
                sim_inventory: {
                    total: Number(simStats.total_sim || 0),
                    available: Number(simStats.available_sim || 0),
                    registered: Number(simStats.registered_sim || 0),
                    blocked: Number(simStats.blocked_sim || 0),
                    remaining_count: remaining.length
                },
                registrations: {
                    total: Number(registrationStats.total_registrations || 0),
                    pending: Number(registrationStats.pending || 0),
                    approved: Number(registrationStats.approved || 0),
                    rejected: Number(registrationStats.rejected || 0)
                },
                by_sim_type: byType.map(row => ({
                    id_sim_type: row.id_sim_type,
                    sim_type: row.sim_type,
                    registrations: Number(row.registrations || 0)
                })),
                by_agent: byAgent.map(row => ({
                    id_agent: row.id_agent,
                    agent_name: row.agent_name,
                    registrations: Number(row.registrations || 0)
                })),
                remaining_sim_imsi: remaining
            }
        });
    } catch (error) {
        console.error("GET /reports/dashboard ERROR:", error);
        res.status(500).json({ success: false, message: "Database error", error: error.message });
    }
};

module.exports = { getDashboardReports };
