const express = require("express");
const router = express.Router();

const {
    getRegistrationOptions,
    createPublicRegistration
} = require("../controllers/public-registration.controller");

router.get("/registration-options/:agentToken", getRegistrationOptions);
router.post("/registrations", createPublicRegistration);

module.exports = router;
