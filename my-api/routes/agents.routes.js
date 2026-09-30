const express = require("express");
const router = express.Router();

const {
    getAllAgents,
    getAgentById,
    createAgent,
    updateAgent,
    regeneratePublicLink,
    deleteAgent
} = require("../controllers/agents.controller");

router.get("/", getAllAgents);
router.get("/:id", getAgentById);
router.post("/", createAgent);
router.put("/:id", updateAgent);
router.post("/:id/regenerate-link", regeneratePublicLink);
router.delete("/:id", deleteAgent);

module.exports = router;
