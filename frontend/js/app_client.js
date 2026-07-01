/**
 * SafeDrop Local - Lógica de Aplicación Frontend
 * Controla el flujo de vistas, eventos del DOM y llamadas a la API REST.
 */

const API_BASE = ""; // Rutas relativas al servidor HTTPS local

// --- COMPARTIDO: MANEJO DE SESIÓN Y NAVEGACIÓN ---

function getAuthHeaders() {
    const token = sessionStorage.getItem("jwt_token");
    return token ? { "Authorization": `Bearer ${token}` } : {};
}

function checkSession() {
    const username = sessionStorage.getItem("username");
    const role = sessionStorage.getItem("role");
    const sessionInfo = document.getElementById("session-info");
    
    if (sessionInfo && username) {
        sessionInfo.innerHTML = `
            <span style="font-size:0.9rem; color:var(--text-muted)">Sesión: <strong>${username}</strong> (${role})</span>
            <button onclick="logout()" class="btn btn-secondary" style="padding:0.25rem 0.75rem; font-size:0.8rem">Cerrar Sesión</button>
        `;
    }
}

function logout() {
    sessionStorage.removeItem("jwt_token");
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("role");
    window.location.reload();
}

// --- CONTROLLER 1: PORTAL DE DENUNCIAS (index.html) ---

function initSubmissionPortal() {
    const form = document.getElementById("report-form");
    const fileInput = document.getElementById("file-input");
    const uploadZone = document.getElementById("upload-zone");
    const fileListEl = document.getElementById("file-list");
    let selectedFiles = [];
    
    // Drag & Drop
    if (uploadZone) {
        uploadZone.addEventListener("click", () => fileInput.click());
        
        uploadZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            uploadZone.classList.add("dragover");
        });
        
        uploadZone.addEventListener("dragleave", () => {
            uploadZone.classList.remove("dragover");
        });
        
        uploadZone.addEventListener("drop", (e) => {
            e.preventDefault();
            uploadZone.classList.remove("dragover");
            handleFiles(e.dataTransfer.files);
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener("change", () => {
            handleFiles(fileInput.files);
        });
    }
    
    function handleFiles(files) {
        for (let file of files) {
            // Evitar duplicados por nombre
            if (!selectedFiles.some(f => f.name === file.name)) {
                selectedFiles.push(file);
            }
        }
        renderFileList();
    }
    
    function renderFileList() {
        fileListEl.innerHTML = "";
        selectedFiles.forEach((file, index) => {
            const item = document.createElement("div");
            item.className = "file-item";
            item.innerHTML = `
                <span>${file.name} (${(file.size / 1024).toFixed(1)} KB)</span>
                <span class="file-remove" onclick="removeFile(${index})">×</span>
            `;
            fileListEl.appendChild(item);
        });
    }
    
    window.removeFile = function(index) {
        selectedFiles.splice(index, 1);
        renderFileList();
    };
    
    // Submit del Formulario
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const reportText = document.getElementById("report-text").value.trim();
            if (!reportText) return alert("Por favor escriba los detalles de su denuncia.");
            
            // Mostrar Overlay de Criptografía
            const overlay = document.getElementById("crypto-overlay");
            const steps = document.querySelectorAll(".crypto-step");
            overlay.classList.add("active");
            
            // Reset steps
            steps.forEach(s => s.className = "crypto-step");
            
            try {
                // Paso 1: Generar llave simétrica temporal AES
                updateStep(0, "active");
                await new Promise(r => setTimeout(r, 600)); // Animación artificial
                const aesKey = await generarLlaveAES();
                updateStep(0, "completed");
                
                // Paso 2: Cifrar texto y adjuntos en local
                updateStep(1, "active");
                await new Promise(r => setTimeout(r, 600));
                
                // Cifrar el texto
                const encryptedReport = await cifrarTexto(aesKey, reportText);
                
                // Cifrar archivos adjuntos uno a uno
                const encryptedAttachments = [];
                for (let file of selectedFiles) {
                    const fileBytes = await fileToArrayBuffer(file);
                    const encFile = await cifrarArchivoBytes(aesKey, fileBytes);
                    encryptedAttachments.push({
                        filename: file.name,
                        mime_type: file.type || "application/octet-stream",
                        data_encrypted: encFile.cipherText,
                        iv: encFile.iv
                    });
                }
                updateStep(1, "completed");
                
                // Paso 3: Obtener llave pública y proteger la llave AES
                updateStep(2, "active");
                const pubKeyRes = await fetch(`${API_BASE}/api/crypto/public-key`);
                if (!pubKeyRes.ok) throw new Error("No se pudo obtener la llave pública del servidor.");
                const { public_key: pemPublicKey } = await pubKeyRes.json();
                
                const rsaPublicKey = await importarLlavePublicaRSA(pemPublicKey);
                const encryptedAesKeyBase64 = await envolverLlaveAES(rsaPublicKey, aesKey);
                updateStep(2, "completed");
                
                // Paso 4: Transmitir el payload cifrado de forma segura
                updateStep(3, "active");
                await new Promise(r => setTimeout(r, 500));
                
                const submitRes = await fetch(`${API_BASE}/api/reports/submit`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        report_text_encrypted: encryptedReport.cipherText,
                        report_iv: encryptedReport.iv,
                        encrypted_aes_key: encryptedAesKeyBase64,
                        attachments: encryptedAttachments
                    })
                });
                
                if (!submitRes.ok) throw new Error("Error al enviar la denuncia al servidor.");
                const responseData = await submitRes.json();
                updateStep(3, "completed");
                
                // Finalizado con éxito
                await new Promise(r => setTimeout(r, 500));
                overlay.classList.remove("active");
                
                // Mostrar alerta de éxito
                const alertContainer = document.getElementById("alert-container");
                alertContainer.innerHTML = `
                    <div class="alert alert-success">
                        <div>
                            <strong>✓ Denuncia enviada con éxito de forma segura.</strong><br>
                            Se ha registrado en la base de datos bajo la ID de auditoría <strong>#${responseData.report_id}</strong>.<br>
                            Ningún dato en texto plano abandonó su dispositivo.
                        </div>
                    </div>
                `;
                
                // Limpiar campos
                form.reset();
                selectedFiles = [];
                renderFileList();
                
            } catch (err) {
                console.error(err);
                overlay.classList.remove("active");
                alert("Ocurrió un error crítico durante el cifrado o transmisión: " + err.message);
            }
        });
    }
    
    function updateStep(index, className) {
        const steps = document.querySelectorAll(".crypto-step");
        if (steps[index]) {
            steps[index].className = `crypto-step ${className}`;
        }
    }
    
    function fileToArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }
}

// --- CONTROLLER 2: PANEL DE AUDITORÍA (auditor.html) ---

let loadedPrivateKeyRSA = null; // Guardada estrictamente en memoria temporal de JS
let loadedShares = []; // Almacena los fragmentos (shares) cargados en memoria

function initAuditorDashboard() {
    const loginForm = document.getElementById("login-form");
    const auditorPanel = document.getElementById("auditor-panel");
    const reportListEl = document.getElementById("report-list");
    const reportDetailPlaceholder = document.getElementById("report-detail-placeholder");
    const reportDetailView = document.getElementById("report-detail-view");
    
    // Elementos de detalle
    const detId = document.getElementById("det-id");
    const detDate = document.getElementById("det-date");
    const blockKeyEnc = document.getElementById("block-key-enc");
    const blockTextEnc = document.getElementById("block-text-enc");
    
    // Contenedores de llave privada y desencriptado
    const keyStatusAlert = document.getElementById("key-status-alert");
    const keyDropzone = document.getElementById("key-dropzone");
    const keyFileInput = document.getElementById("key-file-input");
    const decryptActionContainer = document.getElementById("decrypt-action-container");
    const decryptedReportContainer = document.getElementById("decrypted-report-container");
    const decryptedTextEl = document.getElementById("decrypted-text");
    const decryptedFilesEl = document.getElementById("decrypted-files");
    
    let currentCifradoReport = null; // Almacena el reporte actual cargado
    
    // Verificar si ya hay sesión activa
    const token = sessionStorage.getItem("jwt_token");
    if (token) {
        if (loginForm) loginForm.style.display = "none";
        if (auditorPanel) auditorPanel.classList.add("active");
        loadReportsList();
        checkSession();
    } else {
        if (loginForm) loginForm.style.display = "block";
        if (auditorPanel) auditorPanel.classList.remove("active");
    }
    
    // Login Submit
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const username = document.getElementById("login-username").value.trim();
            const password = document.getElementById("login-password").value.trim();
            
            const params = new URLSearchParams();
            params.append("username", username);
            params.append("password", password);
            
            try {
                const res = await fetch(`${API_BASE}/api/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: params
                });
                
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || "Error en el inicio de sesión");
                }
                
                const data = await res.json();
                sessionStorage.setItem("jwt_token", data.access_token);
                sessionStorage.setItem("username", data.username);
                sessionStorage.setItem("role", data.role);
                
                window.location.reload();
            } catch (err) {
                alert(err.message);
            }
        });
    }
    
    // Carga de reportes
    async function loadReportsList() {
        try {
            const res = await fetch(`${API_BASE}/api/reports`, {
                headers: getAuthHeaders()
            });
            if (!res.ok) throw new Error("No autorizado para ver reportes.");
            
            const reports = await res.json();
            reportListEl.innerHTML = "";
            
            if (reports.length === 0) {
                reportListEl.innerHTML = "<div style='color:var(--text-muted); padding:1rem;'>No se encontraron denuncias en el sistema.</div>";
                return;
            }
            
            reports.forEach(r => {
                const card = document.createElement("div");
                card.className = "report-card-item";
                card.id = `rep-card-${r.id}`;
                card.innerHTML = `
                    <div class="meta">
                        <span>Denuncia #${r.id}</span>
                        <span>${r.created_at}</span>
                    </div>
                    <div class="title">Mensaje Cifrado (${r.attachments_count} adjuntos)</div>
                `;
                card.addEventListener("click", () => selectReport(r.id));
                reportListEl.appendChild(card);
            });
        } catch (err) {
            reportListEl.innerHTML = `<div class='alert alert-danger'>${err.message}</div>`;
        }
    }
    
    // Seleccionar reporte individual
    async function selectReport(id) {
        // Remover clase active de todas las tarjetas
        document.querySelectorAll(".report-card-item").forEach(c => c.classList.remove("active"));
        document.getElementById(`rep-card-${id}`).classList.add("active");
        
        try {
            const res = await fetch(`${API_BASE}/api/reports/${id}`, {
                headers: getAuthHeaders()
            });
            if (!res.ok) throw new Error("Error al obtener los detalles del reporte.");
            
            currentCifradoReport = await res.json();
            
            // Mostrar UI de detalle
            reportDetailPlaceholder.style.display = "none";
            reportDetailView.classList.add("active");
            
            // Llenar campos cifrados
            detId.innerText = `#${currentCifradoReport.id}`;
            detDate.innerText = currentCifradoReport.created_at;
            blockKeyEnc.innerText = currentCifradoReport.encrypted_aes_key;
            blockTextEnc.innerText = currentCifradoReport.report_text_encrypted;
            
            // Ocultar bloque descifrado previo
            decryptedReportContainer.style.display = "none";
            
            updateKeyStatusUI();
            
        } catch (err) {
            alert(err.message);
        }
    }
    
    // Arrastrar y soltar Fragmentos de Llave (Shamir's Secret Sharing)
    if (keyDropzone) {
        keyDropzone.addEventListener("click", () => keyFileInput.click());
        keyDropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            keyDropzone.style.borderColor = "var(--primary)";
        });
        keyDropzone.addEventListener("dragleave", () => {
            keyDropzone.style.borderColor = "var(--border-color)";
        });
        keyDropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            keyDropzone.style.borderColor = "var(--border-color)";
            readKeyFile(e.dataTransfer.files[0]);
        });
    }
    
    if (keyFileInput) {
        keyFileInput.addEventListener("change", () => {
            readKeyFile(keyFileInput.files[0]);
        });
    }
    
    function readKeyFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const fileContent = e.target.result.trim();
            try {
                if (!fileContent.startsWith("SD-SHARE-v1-")) {
                    throw new Error("El archivo no es un fragmento de llave de SafeDrop válido.");
                }
                const parts = fileContent.split("-");
                const shareId = parts[3];
                
                // Verificar si ya cargamos este ID
                if (loadedShares.some(s => s.split("-")[3] === shareId)) {
                    alert(`El fragmento #${shareId} ya ha sido cargado. Por favor cargue otro diferente.`);
                    return;
                }
                
                loadedShares.push(fileContent);
                
                if (loadedShares.length >= 2) {
                    try {
                        const reconstructedPem = reconstruirSecretShamir(loadedShares);
                        loadedPrivateKeyRSA = await importarLlavePrivadaRSA(reconstructedPem);
                    } catch (err) {
                        alert("Error al reconstruir la llave privada. " + err.message);
                        loadedShares = [];
                        loadedPrivateKeyRSA = null;
                    }
                }
                updateKeyStatusUI();
            } catch (err) {
                alert("Error al procesar el fragmento: " + err.message);
            }
        };
        reader.readAsText(file);
    }
    
    function updateKeyStatusUI() {
        if (loadedPrivateKeyRSA) {
            keyStatusAlert.className = "alert alert-success";
            keyStatusAlert.innerHTML = `
                <div style="display:flex; justify-content:between; align-items:center; width:100%">
                    <div><strong>✓ Llave Privada RSA Reconstruida (2/2 Fragmentos).</strong> Lista para descifrar en memoria local.</div>
                    <button class="btn btn-secondary btn-sm" id="btn-clear-keys" style="margin-left:auto; padding:0.25rem 0.5rem; font-size:0.7rem">Limpiar Llaves</button>
                </div>
            `;
            keyDropzone.style.display = "none";
            decryptActionContainer.style.display = "block";
            
            // Añadir listener para limpiar
            const btnClear = document.getElementById("btn-clear-keys");
            if (btnClear) {
                btnClear.addEventListener("click", () => {
                    loadedPrivateKeyRSA = null;
                    loadedShares = [];
                    updateKeyStatusUI();
                });
            }
        } else if (loadedShares.length === 1) {
            const shareId = loadedShares[0].split("-")[3];
            keyStatusAlert.className = "alert alert-warning";
            keyStatusAlert.innerHTML = `
                <div style="display:flex; justify-content:between; align-items:center; width:100%">
                    <div><strong>⚠ 1/2 Fragmentos Cargados.</strong> Fragmento #${shareId} cargado en memoria. Cargue otro diferente para proceder.</div>
                    <button class="btn btn-secondary btn-sm" id="btn-clear-keys" style="margin-left:auto; padding:0.25rem 0.5rem; font-size:0.7rem">Limpiar</button>
                </div>
            `;
            keyDropzone.style.display = "block";
            decryptActionContainer.style.display = "none";
            
            const btnClear = document.getElementById("btn-clear-keys");
            if (btnClear) {
                btnClear.addEventListener("click", () => {
                    loadedPrivateKeyRSA = null;
                    loadedShares = [];
                    updateKeyStatusUI();
                });
            }
        } else {
            keyStatusAlert.className = "alert alert-warning";
            keyStatusAlert.innerHTML = "<strong>⚠ Llave Privada Requerida (2-of-3 Shares).</strong> Cargue al menos dos fragmentos diferentes (`llave_privada_compartida_*.share`) para reconstruir la llave RSA en el cliente.";
            keyDropzone.style.display = "block";
            decryptActionContainer.style.display = "none";
        }
    }
    
    // Evento descifrar
    const btnDecrypt = document.getElementById("btn-decrypt");
    if (btnDecrypt) {
        btnDecrypt.addEventListener("click", async () => {
            if (!loadedPrivateKeyRSA || !currentCifradoReport) return;
            
            const overlay = document.getElementById("crypto-overlay");
            const steps = document.querySelectorAll(".crypto-step");
            overlay.classList.add("active");
            
            // Reset steps
            steps.forEach(s => s.className = "crypto-step");
            
            try {
                // Paso 1: Importar llave privada (ya en memoria)
                updateStep(0, "active");
                await new Promise(r => setTimeout(r, 400));
                updateStep(0, "completed");
                
                // Paso 2: Descifrar llave AES con RSA
                updateStep(1, "active");
                await new Promise(r => setTimeout(r, 400));
                const aesKey = await desvolverLlaveAES(loadedPrivateKeyRSA, currentCifradoReport.encrypted_aes_key);
                updateStep(1, "completed");
                
                // Paso 3: Descifrar payload de denuncia
                updateStep(2, "active");
                await new Promise(r => setTimeout(r, 400));
                const textDescifrado = await descifrarTexto(
                    aesKey,
                    currentCifradoReport.report_text_encrypted,
                    currentCifradoReport.report_iv
                );
                updateStep(2, "completed");
                
                // Paso 4: Descifrar adjuntos en memoria
                updateStep(3, "active");
                decryptedFilesEl.innerHTML = "";
                
                for (let att of currentCifradoReport.attachments) {
                    const fileBytes = await descifrarArchivoBytes(aesKey, att.data_encrypted, att.iv);
                    const blob = new Blob([fileBytes], { type: att.mime_type });
                    const fileUrl = URL.createObjectURL(blob);
                    
                    const fileContainer = document.createElement("div");
                    fileContainer.style.cssText = "background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 1rem; border-radius: 8px; margin-bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem;";
                    
                    // Fila de información y descarga
                    const infoRow = document.createElement("div");
                    infoRow.style.cssText = "display: flex; justify-content: space-between; align-items: center; width: 100%;";
                    
                    let fileIcon = "📄";
                    if (att.mime_type.startsWith("image/")) {
                        fileIcon = "🖼️";
                    } else if (att.mime_type === "application/pdf") {
                        fileIcon = "📕";
                    }
                    
                    infoRow.innerHTML = `
                        <span style="font-weight: 500; font-size: 0.9rem; color: var(--text-main); display: flex; align-items: center; gap: 0.5rem;">
                            <span>${fileIcon}</span> ${att.filename} (${(blob.size / 1024).toFixed(1)} KB)
                        </span>
                        <a href="${fileUrl}" download="${att.filename}" class="btn btn-secondary" style="padding: 0.25rem 0.75rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.25rem; text-decoration: none;">
                            <i class="fa-solid fa-download"></i> Descargar Evidencia
                        </a>
                    `;
                    fileContainer.appendChild(infoRow);
                    
                    // Si es una imagen, mostrar la vista previa (visualización)
                    if (att.mime_type.startsWith("image/")) {
                        const imgPreview = document.createElement("div");
                        imgPreview.style.cssText = "margin-top: 0.25rem; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.05); max-width: 100%; max-height: 400px; text-align: center; background: #0b0f19; padding: 0.5rem;";
                        imgPreview.innerHTML = `
                            <img src="${fileUrl}" alt="${att.filename}" style="max-width: 100%; max-height: 380px; width: auto; height: auto; object-fit: contain; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: inline-block; vertical-align: middle;" />
                        `;
                        fileContainer.appendChild(imgPreview);
                    }
                    
                    decryptedFilesEl.appendChild(fileContainer);
                }
                
                if (currentCifradoReport.attachments.length === 0) {
                    decryptedFilesEl.innerHTML = "<div style='color:var(--text-muted); font-size:0.9rem;'>No hay evidencias adjuntas en esta denuncia.</div>";
                }
                updateStep(3, "completed");
                
                // Terminar
                await new Promise(r => setTimeout(r, 400));
                overlay.classList.remove("active");
                
                // Renderizar contenido descifrado
                decryptedTextEl.innerText = textDescifrado;
                decryptedReportContainer.style.display = "block";
                
            } catch (err) {
                console.error(err);
                overlay.classList.remove("active");
                alert("Error crítico durante el descifrado local: Asegúrese de que cargó la llave privada CORRECTA. Detalle técnico: " + err.message);
            }
        });
    }
    
    function updateStep(index, className) {
        const steps = document.querySelectorAll(".crypto-step");
        if (steps[index]) {
            steps[index].className = `crypto-step ${className}`;
        }
    }
}

// --- CONTROLLER 3: PANEL DE GESTIÓN (admin.html) ---

function initAdminDashboard() {
    const loginForm = document.getElementById("login-form");
    const adminPanel = document.getElementById("admin-panel");
    const integrityCard = document.getElementById("integrity-card");
    const timelineEl = document.getElementById("timeline");
    const userListEl = document.getElementById("user-list");
    const btnVerify = document.getElementById("btn-verify-integrity");
    const btnTamper = document.getElementById("btn-simulate-tampering");
    const createUserForm = document.getElementById("create-user-form");
    
    const token = sessionStorage.getItem("jwt_token");
    const role = sessionStorage.getItem("role");
    
    if (token && role === "admin") {
        if (loginForm) loginForm.style.display = "none";
        if (adminPanel) adminPanel.classList.add("active");
        checkSession();
        loadAuditLogs();
        loadUsersList();
    } else if (token && role !== "admin") {
        alert("Acceso denegado. Se requieren privilegios de Administrador.");
        window.location.href = "index.html";
    } else {
        if (loginForm) loginForm.style.display = "block";
        if (adminPanel) adminPanel.classList.remove("active");
    }
    
    // Login Submit
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const username = document.getElementById("login-username").value.trim();
            const password = document.getElementById("login-password").value.trim();
            
            const params = new URLSearchParams();
            params.append("username", username);
            params.append("password", password);
            
            try {
                const res = await fetch(`${API_BASE}/api/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: params
                });
                
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || "Error en el inicio de sesión");
                }
                
                const data = await res.json();
                if (data.role !== "admin") {
                    throw new Error("Su cuenta no tiene privilegios de Administrador.");
                }
                
                sessionStorage.setItem("jwt_token", data.access_token);
                sessionStorage.setItem("username", data.username);
                sessionStorage.setItem("role", data.role);
                
                window.location.reload();
            } catch (err) {
                alert(err.message);
            }
        });
    }
    
    // Carga de bitácora
    async function loadAuditLogs() {
        try {
            const res = await fetch(`${API_BASE}/api/audit/logs`, {
                headers: getAuthHeaders()
            });
            if (!res.ok) throw new Error("Error al obtener la bitácora.");
            
            const data = await res.json();
            renderAuditLogs(data.integrity_intact, data.logs);
        } catch (err) {
            timelineEl.innerHTML = `<div class='alert alert-danger'>${err.message}</div>`;
        }
    }
    
    function renderAuditLogs(integrityIntact, logs) {
        // Actualizar tarjeta superior
        if (integrityIntact) {
            integrityCard.className = "alert alert-success";
            integrityCard.innerHTML = `
                <div>
                    <h3 style="margin-bottom:0.25rem">✓ INTEGRIDAD ASEGURADA</h3>
                    <p style="font-size:0.95rem; margin:0">Todos los hashes de la bitácora de auditoría son válidos y la cadena de bloques SHA-256 no presenta ninguna alteración.</p>
                </div>
            `;
        } else {
            integrityCard.className = "alert alert-danger";
            integrityCard.innerHTML = `
                <div>
                    <h3 style="margin-bottom:0.25rem">⚠ ¡ALERTA DE SEGURIDAD! CADENA COMPROMETIDA</h3>
                    <p style="font-size:0.95rem; margin:0">Se ha detectado una alteración no autorizada de la base de datos o un registro ha sido manipulado en SQLite.</p>
                </div>
            `;
            // Pequeña animación de parpadeo roja
            integrityCard.style.animation = "pulse 1.5s infinite alternate";
        }
        
        timelineEl.innerHTML = "";
        logs.forEach(log => {
            const item = document.createElement("div");
            item.className = `timeline-item ${log.is_valid ? 'verified' : 'failed'}`;
            item.innerHTML = `
                <div class="timeline-marker"></div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <span class="timeline-action">[${log.action}]</span>
                        <span>${log.timestamp}</span>
                    </div>
                    <div class="timeline-details">${log.details}</div>
                    <div class="timeline-header" style="margin-top:0.5rem; font-size:0.8rem">
                        <span>Usuario: <strong>${log.username}</strong></span>
                        <span style="color:${log.is_valid ? 'var(--success)' : 'var(--danger)'}">
                            ${log.is_valid ? '✓ Válido' : '✗ ALTERADO'}
                        </span>
                    </div>
                    <div class="timeline-hashes">
                        Prev: ${log.previous_hash}<br>
                        Curr: ${log.current_hash}<br>
                        Calc: ${log.calculated_hash}
                    </div>
                </div>
            `;
            timelineEl.appendChild(item);
        });
    }
    
    // Verificación
    if (btnVerify) {
        btnVerify.addEventListener("click", () => {
            loadAuditLogs();
        });
    }
    
    // Simular manipulación
    if (btnTamper) {
        btnTamper.addEventListener("click", async () => {
            if (!confirm("¿Está seguro de querer corromper los datos? Esto alterará un campo en SQLite sin actualizar el hash encadenado para simular un ciberataque.")) return;
            try {
                const res = await fetch(`${API_BASE}/api/audit/simulate-tampering`, {
                    method: "POST",
                    headers: getAuthHeaders()
                });
                if (!res.ok) throw new Error("Error al simular alteración.");
                const data = await res.json();
                alert(data.message);
                loadAuditLogs();
            } catch (err) {
                alert(err.message);
            }
        });
    }
    
    // Gestión de usuarios
    async function loadUsersList() {
        try {
            const res = await fetch(`${API_BASE}/api/admin/users`, {
                headers: getAuthHeaders()
            });
            if (!res.ok) throw new Error("Error al obtener la lista de usuarios.");
            
            const users = await res.json();
            userListEl.innerHTML = "";
            users.forEach(u => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td style="padding:0.75rem 1rem; border:1px solid var(--border-color)">${u.id}</td>
                    <td style="padding:0.75rem 1rem; border:1px solid var(--border-color)"><strong>${u.username}</strong></td>
                    <td style="padding:0.75rem 1rem; border:1px solid var(--border-color)"><span style="background:rgba(255,255,255,0.05); padding:0.25rem 0.5rem; border-radius:4px; font-size:0.85rem">${u.role.toUpperCase()}</span></td>
                    <td style="padding:0.75rem 1rem; border:1px solid var(--border-color); color:${u.is_active ? 'var(--success)' : 'var(--danger)'}">${u.is_active ? 'Activo' : 'Inactivo'}</td>
                `;
                userListEl.appendChild(row);
            });
        } catch (err) {
            console.error(err);
        }
    }
    
    if (createUserForm) {
        createUserForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const username = document.getElementById("new-username").value.trim();
            const password = document.getElementById("new-password").value.trim();
            const role = document.getElementById("new-role").value;
            
            try {
                const res = await fetch(`${API_BASE}/api/admin/users`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...getAuthHeaders()
                    },
                    body: JSON.stringify({ username, password, role })
                });
                
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || "Error al crear usuario.");
                }
                
                alert("Usuario creado con éxito.");
                createUserForm.reset();
                loadUsersList();
                loadAuditLogs(); // Ver si la creación se registró
            } catch (err) {
                alert(err.message);
            }
        });
    }
    
    // Integración de Descarga y Restauración de Base de Datos
    const btnDownloadBackup = document.getElementById("btn-download-backup");
    if (btnDownloadBackup) {
        btnDownloadBackup.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                const token = sessionStorage.getItem("jwt_token");
                const res = await fetch(`${API_BASE}/api/admin/backup`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (!res.ok) throw new Error("No autorizado para descargar el backup.");
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "safedrop_backup.db";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                alert(err.message);
            }
        });
    }
    
    const btnTriggerRestore = document.getElementById("btn-trigger-restore");
    const restoreFileInput = document.getElementById("restore-file-input");
    if (btnTriggerRestore && restoreFileInput) {
        btnTriggerRestore.addEventListener("click", () => restoreFileInput.click());
        restoreFileInput.addEventListener("change", async () => {
            const file = restoreFileInput.files[0];
            if (!file) return;
            if (!confirm(`¿Está seguro de querer restaurar la base de datos? Se reemplazarán todos los datos activos con el backup '${file.name}'.`)) {
                restoreFileInput.value = "";
                return;
            }
            const formData = new FormData();
            formData.append("file", file);
            try {
                const token = sessionStorage.getItem("jwt_token");
                const res = await fetch(`${API_BASE}/api/admin/restore`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}` },
                    body: formData
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || "Error al restaurar base de datos.");
                }
                const data = await res.json();
                alert(data.message);
                window.location.reload();
            } catch (err) {
                alert(err.message);
                restoreFileInput.value = "";
            }
        });
    }
}

// --- CONTROLLER 4: DOCUMENTACIÓN INTERACTIVA (docs.html) ---

function initDocsController() {
    const links = document.querySelectorAll(".docs-menu-link");
    const contents = document.querySelectorAll(".docs-content");
    
    links.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            
            // Remover activo de los links
            links.forEach(l => l.classList.remove("active"));
            link.classList.add("active");
            
            // Ocultar todos los contenidos y mostrar el activo
            const targetId = link.getAttribute("href").substring(1);
            contents.forEach(content => {
                content.classList.remove("active");
                if (content.id === targetId) {
                    content.classList.add("active");
                }
            });
            
            // Desplazar suavemente a la parte superior de la página
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

// --- ENRUTADOR INICIAL ---

document.addEventListener("DOMContentLoaded", () => {
    // Detectar qué sección inicializar según los elementos presentes en el DOM
    if (document.getElementById("report-form")) {
        initSubmissionPortal();
    }
    if (document.getElementById("auditor-panel") || document.getElementById("login-form")) {
        // En auditor.html o admin.html tenemos formularios
        if (window.location.pathname.includes("auditor")) {
            initAuditorDashboard();
        } else if (window.location.pathname.includes("admin")) {
            initAdminDashboard();
        }
    }
    if (document.querySelector(".docs-sidebar")) {
        initDocsController();
    }
});
