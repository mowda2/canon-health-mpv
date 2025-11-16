// public/app.js

let currentUser = null;

// Generic helper
async function handleJsonResponse(res) {
  if (!res.ok) {
    let msg = "Something went wrong";
    try {
      const data = await res.json();
      if (data && data.error) msg = data.error;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

document.addEventListener("DOMContentLoaded", () => {
  const loginScreen = document.getElementById("loginScreen");
  const loginForm = document.getElementById("loginForm");
  const roleSelect = document.getElementById("roleSelect");
  const healthCardField = document.getElementById("healthCardField");

  const patientApp = document.getElementById("patientApp");
  const doctorApp = document.getElementById("doctorApp");

  const patientUserInfo = document.getElementById("patientUserInfo");
  const doctorUserInfo = document.getElementById("doctorUserInfo");
  const doctorNameLabel = document.getElementById("doctorNameLabel");

  const patientUploadHealthCard = document.getElementById("patientUploadHealthCard");

  // Toggle health card field based on role
  roleSelect.addEventListener("change", () => {
    if (roleSelect.value === "patient") {
      healthCardField.style.display = "flex";
    } else {
      healthCardField.style.display = "none";
    }
  });

  // --- LOGIN ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(loginForm);
    const name = formData.get("name");
    const email = formData.get("email");
    const role = formData.get("role");
    const healthCard = formData.get("healthCard");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, healthCard }),
      });
      const user = await handleJsonResponse(res);
      currentUser = user;

      // Update UI
      loginScreen.classList.add("hidden");

      if (user.role === "patient") {
        patientApp.classList.remove("hidden");
        doctorApp.classList.add("hidden");
        patientUserInfo.textContent = `${user.name} • Patient`;
        if (user.healthCard) {
          patientUploadHealthCard.value = user.healthCard;
        }
        initPatientNav();
        loadPatientDocuments();
        loadPatientRequests();
      } else {
        doctorApp.classList.remove("hidden");
        patientApp.classList.add("hidden");
        doctorUserInfo.textContent = `${user.name} • Doctor`;
        doctorNameLabel.textContent = user.name || "Doctor";
        initDoctorNav();
      }
    } catch (err) {
      alert(err.message);
    }
  });

  // --- PATIENT NAV ---
  function initPatientNav() {
    const navButtons = document.querySelectorAll(
      "#patientApp .nav-link"
    );
    const sections = {
      "patient-view-records": document.getElementById("patient-view-records"),
      "patient-upload-records": document.getElementById("patient-upload-records"),
      "patient-permissions": document.getElementById("patient-permissions"),
    };

    navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        navButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.dataset.target;

        Object.keys(sections).forEach((key) => {
          sections[key].classList.toggle("hidden", key !== target);
        });

        if (target === "patient-view-records") {
          loadPatientDocuments();
        } else if (target === "patient-permissions") {
          loadPatientRequests();
        }
      });
    });

    // Upload form
    const patientUploadForm = document.getElementById("patientUploadForm");
    patientUploadForm.addEventListener("submit", onPatientUpload);
  }

  // --- DOCTOR NAV ---
  function initDoctorNav() {
    const navButtons = document.querySelectorAll(
      "#doctorApp .nav-link"
    );
    const sections = {
      "doctor-request-access": document.getElementById("doctor-request-access"),
      "doctor-view-records": document.getElementById("doctor-view-records"),
      "doctor-upload-records": document.getElementById("doctor-upload-records"),
    };

    navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        navButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.dataset.target;

        Object.keys(sections).forEach((key) => {
          sections[key].classList.toggle("hidden", key !== target);
        });
      });
    });

    // Doctor forms
    document
      .getElementById("doctorRequestForm")
      .addEventListener("submit", onDoctorRequest);

    document
      .getElementById("doctorViewForm")
      .addEventListener("submit", onDoctorViewRecords);

    document
      .getElementById("doctorUploadForm")
      .addEventListener("submit", onDoctorUpload);
  }

  // === PATIENT: DOCUMENTS ===

  async function loadPatientDocuments() {
    if (!currentUser || currentUser.role !== "patient") return;
    const tbody = document.getElementById("patientDocumentsBody");
    tbody.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

    try {
      const res = await fetch(
        `/api/patient/documents?patientId=${encodeURIComponent(currentUser.id)}`
      );
      const docs = await handleJsonResponse(res);

      if (!docs.length) {
        tbody.innerHTML = "<tr><td colspan='5'>No documents uploaded yet.</td></tr>";
        return;
      }

      tbody.innerHTML = "";
      docs.forEach((doc) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${doc.name}</td>
          <td>${doc.uploadDate}</td>
          <td>${doc.uploadedByName}</td>
          <td>${doc.sharingSummary}</td>
          <td><a href="${doc.url}" class="primary-btn table-btn" target="_blank" rel="noopener noreferrer">Download</a></td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5">${err.message}</td></tr>`;
    }
  }

  async function onPatientUpload(e) {
    e.preventDefault();
    if (!currentUser || currentUser.role !== "patient") return;

    const healthCardInput = document.getElementById("patientUploadHealthCard");
    const fileInput = document.getElementById("patientFileInput");

    if (!fileInput.files.length) {
      alert("Please choose a file first.");
      return;
    }

    const ownerHealthCard = healthCardInput.value.trim() || currentUser.healthCard;
    if (!ownerHealthCard) {
      alert("Health card number is required.");
      return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("ownerHealthCard", ownerHealthCard);
    formData.append("uploadedById", currentUser.id);

    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      await handleJsonResponse(res);
      alert("File uploaded to your Canon Health folder.");
      fileInput.value = "";
      loadPatientDocuments();
    } catch (err) {
      alert(err.message);
    }
  }

  // === PATIENT: REQUESTS / PERMISSIONS ===

  async function loadPatientRequests() {
    if (!currentUser || currentUser.role !== "patient") return;
    const container = document.getElementById("patientRequestsContainer");
    container.innerHTML = "<p class='muted'>Loading requests...</p>";

    try {
      const res = await fetch(
        `/api/patient/requests?patientId=${encodeURIComponent(currentUser.id)}`
      );
      const requests = await handleJsonResponse(res);

      if (!requests.length) {
        container.innerHTML =
          "<p class='muted'>No access requests yet. When a clinic requests access, it will appear here.</p>";
        return;
      }

      container.innerHTML = "";
      requests.forEach((req) => {
        const card = document.createElement("div");
        card.className = "request-card";
        card.dataset.requestId = req.id;

        const reasonsList =
          req.reasons && req.reasons.length
            ? `<ul>${req.reasons
                .map((r) => `<li>${humanizeReason(r)}</li>`)
                .join("")}</ul>`
            : "<p class='muted'>No specific reasons provided.</p>";

        const statusLabel =
          req.status === "pending"
            ? "Pending"
            : req.status === "approved"
            ? "Approved"
            : "Denied";

        const statusColor =
          req.status === "pending"
            ? "var(--text-muted)"
            : req.status === "approved"
            ? "green"
            : "#b91c1c";

        card.innerHTML = `
          <div class="request-header">
            <div>
              <div class="request-title">${req.doctorName} has requested access to your records</div>
              <div class="request-meta">Status: <span style="color:${statusColor};font-weight:600">${statusLabel}</span></div>
            </div>
            <div class="request-meta">
              Requested on: ${req.createdAt.slice(0, 10)}
            </div>
          </div>
          <div class="request-reasons">
            <span class="muted">Reasons they shared:</span>
            ${reasonsList}
          </div>
        `;

        if (req.status === "pending") {
          const permissionsBlock = document.createElement("div");
          permissionsBlock.innerHTML = `
            <div class="permissions-grid">
              <div>
                <div class="permissions-group-title">Access</div>
                <label><input type="radio" name="accessType-${req.id}" value="temporary" checked /> Temporary (48 hours)</label><br/>
                <label><input type="radio" name="accessType-${req.id}" value="permanent" /> Permanent</label>
              </div>
              <div>
                <div class="permissions-group-title">Permissions</div>
                <label><input type="checkbox" id="perm-view-${req.id}" checked /> View medical data</label><br/>
                <label><input type="checkbox" id="perm-download-${req.id}" checked /> Download files</label><br/>
                <label><input type="checkbox" id="perm-upload-${req.id}" /> Upload new files</label><br/>
                <label><input type="checkbox" id="perm-annotate-${req.id}" checked /> Edit or annotate records</label><br/>
                <label><input type="checkbox" id="perm-imaging-${req.id}" /> Access imaging data</label>
              </div>
            </div>
            <div class="request-buttons">
              <button class="primary-btn" data-action="approve" data-request-id="${req.id}">Approve</button>
              <button class="secondary-btn danger" data-action="deny" data-request-id="${req.id}">Deny</button>
            </div>
          `;
          card.appendChild(permissionsBlock);
        } else if (req.status === "approved" && req.permissions) {
          const perms = req.permissions;
          const permsText = Object.entries(perms)
            .filter(([, val]) => val)
            .map(([key]) => humanizePermission(key))
            .join(", ");
          const p = document.createElement("p");
          p.className = "muted";
          p.textContent = `Approved with: ${req.accessType || "temporary"} access (${permsText}).`;
          card.appendChild(p);
        }

        container.appendChild(card);
      });

      // Attach button listeners via container (event delegation)
      container.addEventListener("click", onPatientRequestButtons, { once: true });
    } catch (err) {
      container.innerHTML = `<p>${err.message}</p>`;
    }
  }

  function humanizeReason(r) {
    const map = {
      "medical-records": "Review patient's medical records",
      "intake-form": "Review patient's intake form",
      messages: "Check new messages from the patient",
      "previous-notes": "Review notes from previous consultations",
      "treatment-plan": "Review the treatment plan",
      medications: "Review medications",
      "lab-results": "Review lab results",
      imaging: "Review imaging results",
      "vital-signs": "Review vital signs",
      symptoms: "Review symptoms",
      allergies: "Review allergies",
      "family-history": "Review family medical history",
    };
    return map[r] || r;
  }

  function humanizePermission(p) {
    const map = {
      view: "view medical data",
      download: "download files",
      upload: "upload files",
      annotate: "edit or annotate records",
      imaging: "access imaging data",
    };
    return map[p] || p;
  }

  async function onPatientRequestButtons(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) {
      // Keep listening
      e.currentTarget.addEventListener("click", onPatientRequestButtons, { once: true });
      return;
    }

    const action = btn.dataset.action;
    const requestId = btn.dataset.requestId;
    if (!requestId) return;

    if (action === "deny") {
      if (!confirm("Deny this request?")) {
        e.currentTarget.addEventListener("click", onPatientRequestButtons, { once: true });
        return;
      }
      try {
        const res = await fetch(`/api/patient/requests/${requestId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approve: false }),
        });
        await handleJsonResponse(res);
        loadPatientRequests();
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    if (action === "approve") {
      const accessTypeInput = document.querySelector(
        `input[name="accessType-${requestId}"]:checked`
      );
      const accessType = accessTypeInput ? accessTypeInput.value : "temporary";

      const permissions = {
        view: document.getElementById(`perm-view-${requestId}`).checked,
        download: document.getElementById(`perm-download-${requestId}`).checked,
        upload: document.getElementById(`perm-upload-${requestId}`).checked,
        annotate: document.getElementById(`perm-annotate-${requestId}`).checked,
        imaging: document.getElementById(`perm-imaging-${requestId}`).checked,
      };

      try {
        const res = await fetch(`/api/patient/requests/${requestId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approve: true,
            accessType,
            permissions,
            durationHours: accessType === "temporary" ? 48 : null,
          }),
        });
        await handleJsonResponse(res);
        alert("Access approved.");
        loadPatientRequests();
      } catch (err) {
        alert(err.message);
      }
      return;
    }
  }

  // === DOCTOR: REQUEST ACCESS ===

  async function onDoctorRequest(e) {
    e.preventDefault();
    if (!currentUser || currentUser.role !== "doctor") return;

    const healthCardInput = document.getElementById("doctorRequestHealthCard");
    const healthCard = healthCardInput.value.trim();
    if (!healthCard) {
      alert("Please enter a patient health card number.");
      return;
    }

    const form = e.target;
    const reasons = Array.from(form.querySelectorAll("input[name='reason']:checked")).map(
      (c) => c.value
    );

    try {
      const res = await fetch("/api/doctor/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: currentUser.id,
          patientHealthCard: healthCard,
          reasons,
        }),
      });
      await handleJsonResponse(res);
      alert("Request sent to the patient.");
      form.reset();
    } catch (err) {
      alert(err.message);
    }
  }

  // === DOCTOR: VIEW RECORDS ===

  async function onDoctorViewRecords(e) {
    e.preventDefault();
    if (!currentUser || currentUser.role !== "doctor") return;

    const tbody = document.getElementById("doctorDocumentsBody");
    tbody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";

    const healthCardInput = document.getElementById("doctorViewHealthCard");
    const healthCard = healthCardInput.value.trim();
    if (!healthCard) {
      alert("Please enter a patient health card number.");
      return;
    }

    try {
      const res = await fetch(
        `/api/doctor/documents?doctorId=${encodeURIComponent(
          currentUser.id
        )}&patientHealthCard=${encodeURIComponent(healthCard)}`
      );
      const docs = await handleJsonResponse(res);

      if (!docs.length) {
        tbody.innerHTML = "<tr><td colspan='4'>No documents found for this patient.</td></tr>";
        return;
      }

      tbody.innerHTML = "";
      docs.forEach((doc) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${doc.name}</td>
          <td>${doc.uploadDate}</td>
          <td>${doc.uploadedByName}</td>
          <td><a href="${doc.url}" class="primary-btn table-btn" target="_blank" rel="noopener noreferrer">Open</a></td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4">${err.message}</td></tr>`;
    }
  }

  // === DOCTOR: UPLOAD ===

  async function onDoctorUpload(e) {
    e.preventDefault();
    if (!currentUser || currentUser.role !== "doctor") return;

    const healthCardInput = document.getElementById("doctorUploadHealthCard");
    const fileInput = document.getElementById("doctorFileInput");

    if (!fileInput.files.length) {
      alert("Please select a file.");
      return;
    }

    const ownerHealthCard = healthCardInput.value.trim();
    if (!ownerHealthCard) {
      alert("Please enter a patient health card.");
      return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("ownerHealthCard", ownerHealthCard);
    formData.append("uploadedById", currentUser.id);

    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      await handleJsonResponse(res);
      alert("File uploaded to patient's Canon Health folder.");
      fileInput.value = "";
    } catch (err) {
      alert(err.message);
    }
  }
});
