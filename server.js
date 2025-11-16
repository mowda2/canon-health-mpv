// server.js
const express = require("express");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));

// Multer file upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const safeOriginal = file.originalname.replace(/\s+/g, "_");
    cb(null, unique + "-" + safeOriginal);
  },
});
const upload = multer({ storage });

// In-memory data stores (good enough for demo)
let users = [];          // {id, role, name, email, healthCard?}
let documents = [];      // {id, name, storedFileName, ownerPatientId, uploadedById, uploadedByName, uploadDate, url}
let accessRequests = []; // {id, doctorId, patientId, patientHealthCard, reasons, status, createdAt, accessType?, permissions?, decisionAt?}

let nextUserId = 1;
let nextDocumentId = 1;
let nextRequestId = 1;

// Helper functions
function findOrCreateUser({ role, name, email, healthCard }) {
  if (!role || !email) return null;

  let user = users.find((u) => u.role === role && u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    user = {
      id: String(nextUserId++),
      role,
      name: name && name.trim() ? name.trim() : role === "doctor" ? "Doctor" : "Patient",
      email: email.trim(),
      healthCard: role === "patient" ? (healthCard || "") : undefined,
    };
    users.push(user);
  } else if (role === "patient" && healthCard && !user.healthCard) {
    user.healthCard = healthCard;
  }

  return user;
}

function getPatientByHealthCard(healthCard) {
  if (!healthCard) return null;
  return users.find(
    (u) =>
      u.role === "patient" &&
      u.healthCard &&
      u.healthCard.toString() === healthCard.toString()
  );
}

function getDoctorById(id) {
  return users.find((u) => u.role === "doctor" && u.id === id);
}

// Routes

// --- Auth / login (very simple for demo) ---
app.post("/api/login", (req, res) => {
  const { role, name, email, healthCard } = req.body || {};
  if (!role || !email) {
    return res.status(400).json({ error: "role and email are required" });
  }

  const user = findOrCreateUser({ role, name, email, healthCard });
  if (!user) return res.status(500).json({ error: "Could not create user" });

  res.json(user);
});

// --- Patient documents ---
app.get("/api/patient/documents", (req, res) => {
  const { patientId } = req.query;
  if (!patientId) return res.status(400).json({ error: "patientId is required" });

  const patient = users.find((u) => u.id === patientId && u.role === "patient");
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const patientDocs = documents.filter((d) => d.ownerPatientId === patient.id);

  // Simple sharing summary: check approved requests for this patient
  const approvedRequests = accessRequests.filter(
    (r) => r.patientId === patient.id && r.status === "approved"
  );

  let sharingSummary = "Only you can view this.";
  if (approvedRequests.length > 0) {
    const doctorNames = Array.from(
      new Set(
        approvedRequests
          .map((r) => getDoctorById(r.doctorId))
          .filter(Boolean)
          .map((d) => d.name || "Doctor")
      )
    );
    if (doctorNames.length > 0) {
      sharingSummary = "Shared with " + doctorNames.join(", ");
    }
  }

  const result = patientDocs.map((d) => ({
    id: d.id,
    name: d.name,
    uploadedByName: d.uploadedByName,
    uploadDate: d.uploadDate,
    url: d.url,
    sharingSummary,
  }));

  res.json(result);
});

// --- Document upload (patient OR doctor) ---
app.post("/api/documents/upload", upload.single("file"), (req, res) => {
  const { ownerHealthCard, uploadedById } = req.body || {};
  if (!req.file) {
    return res.status(400).json({ error: "File is required" });
  }
  if (!ownerHealthCard || !uploadedById) {
    return res.status(400).json({ error: "ownerHealthCard and uploadedById are required" });
  }

  const patient = getPatientByHealthCard(ownerHealthCard);
  if (!patient) {
    return res.status(400).json({ error: "No patient found with that health card" });
  }

  const uploader = users.find((u) => u.id === uploadedById);
  const uploadedByName = uploader ? uploader.name : "Unknown";

  const doc = {
    id: String(nextDocumentId++),
    name: req.file.originalname,
    storedFileName: req.file.filename,
    ownerPatientId: patient.id,
    uploadedById,
    uploadedByName,
    uploadDate: new Date().toISOString().slice(0, 10),
    url: "/uploads/" + req.file.filename,
  };

  documents.push(doc);
  res.json(doc);
});

// --- Doctor creates access request ---
app.post("/api/doctor/requests", (req, res) => {
  const { doctorId, patientHealthCard, reasons } = req.body || {};
  if (!doctorId || !patientHealthCard) {
    return res.status(400).json({ error: "doctorId and patientHealthCard are required" });
  }

  const doctor = users.find((u) => u.id === doctorId && u.role === "doctor");
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });

  const patient = getPatientByHealthCard(patientHealthCard);
  if (!patient) {
    return res.status(400).json({ error: "Patient with that health card does not exist yet" });
  }

  const request = {
    id: String(nextRequestId++),
    doctorId: doctor.id,
    patientId: patient.id,
    patientHealthCard,
    reasons: Array.isArray(reasons) ? reasons : [],
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  accessRequests.push(request);
  res.json(request);
});

// --- Patient sees incoming requests ---
app.get("/api/patient/requests", (req, res) => {
  const { patientId } = req.query;
  if (!patientId) return res.status(400).json({ error: "patientId is required" });

  const patient = users.find((u) => u.id === patientId && u.role === "patient");
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const requests = accessRequests
    .filter((r) => r.patientId === patient.id)
    .map((r) => {
      const doctor = getDoctorById(r.doctorId);
      return {
        id: r.id,
        doctorName: doctor ? doctor.name : "Doctor",
        status: r.status,
        reasons: r.reasons,
        createdAt: r.createdAt,
        accessType: r.accessType || null,
        permissions: r.permissions || null,
      };
    });

  res.json(requests);
});

// --- Patient responds to request (approve / deny) ---
app.post("/api/patient/requests/:id/respond", (req, res) => {
  const requestId = req.params.id;
  const { approve, accessType, permissions, durationHours } = req.body || {};

  const request = accessRequests.find((r) => r.id === requestId);
  if (!request) return res.status(404).json({ error: "Request not found" });

  if (!approve) {
    request.status = "denied";
    request.decisionAt = new Date().toISOString();
    request.accessType = null;
    request.permissions = null;
    return res.json(request);
  }

  // Approve
  request.status = "approved";
  request.decisionAt = new Date().toISOString();
  request.accessType = accessType || "temporary";
  request.permissions = permissions || {
    view: true,
    download: true,
    upload: false,
    annotate: true,
    imaging: false,
  };
  request.durationHours = durationHours || 48;

  res.json(request);
});

// --- Doctor fetches documents for a patient (if approved) ---
app.get("/api/doctor/documents", (req, res) => {
  const { doctorId, patientHealthCard } = req.query;
  if (!doctorId || !patientHealthCard) {
    return res.status(400).json({ error: "doctorId and patientHealthCard are required" });
  }

  const doctor = getDoctorById(doctorId);
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });

  const patient = getPatientByHealthCard(patientHealthCard);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const approvedRequest = accessRequests.find(
    (r) =>
      r.doctorId === doctor.id &&
      r.patientId === patient.id &&
      r.status === "approved"
  );

  if (!approvedRequest) {
    return res.status(403).json({ error: "No approved access for this patient" });
  }

  const patientDocs = documents.filter((d) => d.ownerPatientId === patient.id);

  const result = patientDocs.map((d) => ({
    id: d.id,
    name: d.name,
    uploadedByName: d.uploadedByName,
    uploadDate: d.uploadDate,
    url: d.url,
  }));

  res.json(result);
});

// Fallback: serve index.html for unknown paths (SPA-ish)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`Canon Health MVP running on http://localhost:${PORT}`);
});
