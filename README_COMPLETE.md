# ETL Tourist SIM Registration — Document Aligned

This project is aligned to the supplied ETL Tourist SIM Registration document.

## Included
- Internal Admin / Staff / Manager dashboard
- SIM, IMSI/ICCID and Physical SIM / eSIM management
- Excel/CSV SIM import and import history
- Agent CRUD
- Unique public Agent Registration Link and Agent tracking
- Public customer registration without login
- Mobile camera/gallery passport upload
- Passport OCR for first name, last name and passport number
- Backend atomic SIM selection and row locking during registration
- Customer-to-SIM/IMSI binding
- eSIM QR / Physical SIM activation information
- Daily / Weekly / Monthly registration reports
- Reports by SIM type and Agent
- Remaining SIM/IMSI inventory report
- Bcrypt password hashing
- Strong password policy
- JWT + Refresh Token
- 15-minute inactivity logout
- Protected internal routes
- Audit logs with user, action, time and IP address

## Removed because not required by the supplied document
- Package Management
- Payment workflow
- Notifications module
- Customer-facing Agent selection
- Customer-facing SIM selection before submit
- OTP workflow
- Extra Settings page

## Backend
Path: `my-api`

Create `.env` from `.env.example` and configure:
- MySQL connection
- JWT secret
- `FRONTEND_URL=https://eltsimu.vercel.app`

Install and run:

```bash
npm install
npm start
```

## Database
For a fresh database, run:

`my-api/database/01_schema.sql`

For an existing database, review and run once:

`my-api/database/02_align_to_document.sql`

## Agent Link
Staff/Admin creates an Agent and the system generates:

`https://eltsimu.vercel.app/customer-registration/<agent-token>`

The customer does not choose an Agent. The backend resolves the Agent from the token.

## Customer Registration
1. Customer opens the Agent link.
2. Customer chooses Physical SIM or eSIM.
3. Customer takes/uploads a Passport image.
4. OCR fills passport information.
5. Customer confirms the information.
6. Backend locks and assigns the first available SIM of the selected type inside a transaction.
7. Passport image path is stored in `customers.passport_photo`.
8. Registration is linked to Customer + SIM + IMSI + Agent.
9. Physical SIM or eSIM activation information is returned according to the SIM record.

## Important
Do not commit `.env` or real customer Passport images to Git.
