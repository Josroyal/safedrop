// SafeDrop Local - Cryptographic Simulator Logic

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initSandboxHybrid();
    initSandboxSSS();
    initSandboxBlockchain();
});

// --- TABS CONTROL ---
function initTabs() {
    const tabs = document.querySelectorAll(".section-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => {
                t.classList.remove("active");
                t.classList.add("bg-gray-800", "text-gray-400");
                t.classList.remove("bg-blue-500/10", "text-blue-400", "border-blue-500/20");
            });
            tab.classList.add("active");
            tab.classList.remove("bg-gray-800", "text-gray-400");
            
            const targetSection = tab.dataset.section;
            document.querySelectorAll(".section-content").forEach(content => {
                content.classList.add("hidden");
            });
            document.getElementById(targetSection).classList.remove("hidden");
            
            // Si cambia a la pestaña SSS, forzar redibujado inicial de Lagrange
            if (targetSection === "sec-sss") {
                setTimeout(drawLagrangeGraph, 100);
            }
        });
    });
}

// --- COLLAPSIBLE DRAWERS ---
window.toggleDeepDive = function(id) {
    const pane = document.getElementById(id);
    const arrow = document.getElementById(`arrow-${id.split('-').pop()}`);
    if (!pane) return;
    
    const isOpen = pane.classList.contains("open");
    if (isOpen) {
        pane.classList.remove("open");
        if (arrow) arrow.style.transform = "rotate(0deg)";
    } else {
        pane.classList.add("open");
        if (arrow) arrow.style.transform = "rotate(180deg)";
    }
};

// --- SANDBOX 1: HYBRID ENCRYPTION ---
function initSandboxHybrid() {
    const txtPlain = document.getElementById("sim-plain-text");
    const liveBox = document.getElementById("live-data-box");
    const dbBox = document.getElementById("server-db-box");
    const btnNext = document.getElementById("btn-sim-next");
    const btnPrev = document.getElementById("btn-sim-prev");
    const btnReset = document.getElementById("btn-sim-reset");
    const bubble = document.getElementById("narrator-bubble");
    
    let currentStep = 0;
    let aesKey = "";
    let wrappedKey = "";
    let cipherText = "";
    
    // Sincronizar texto de entrada
    if (txtPlain && liveBox) {
        txtPlain.addEventListener("input", () => {
            if (currentStep === 0) {
                liveBox.textContent = txtPlain.value;
            }
        });
        liveBox.textContent = txtPlain.value;
    }
    
    // Descripciones del Storytelling
    const stepBubbles = [
        "Presione <strong>'Siguiente'</strong> para arrancar la simulación de cifrado híbrido del reporte en tiempo real.",
        "<strong>Paso 1: Generación AES-GCM (256-bit)</strong>. El navegador genera una llave simétrica y un Vector de Inicialización (IV) de 12 bytes aleatorios de forma local. Observa cómo la llave brilla arriba del laptop.",
        "<strong>Paso 2: Cifrado Simétrico del Reporte</strong>. Mezclamos el texto plano con la llave AES-GCM. Los caracteres se transforman en ciphertext incomprensible localmente.",
        "<strong>Paso 3: Envoltura RSA-OAEP</strong>. La llave AES (amarilla) se cifra usando la Llave Pública RSA de la organización. Solo la Llave Privada RSA organizacional (bajo SSS) podrá desenvolverla.",
        "<strong>Paso 4: Envío HTTPS (TLS)</strong>. El paquete con los datos cifrados vuela por la red segura hacia el servidor FastAPI. El servidor guarda los datos ciegamente en base de datos."
    ];

    btnNext.addEventListener("click", () => {
        if (currentStep < 4) {
            currentStep++;
            updateStepUI();
        }
    });

    btnPrev.addEventListener("click", () => {
        if (currentStep > 0) {
            currentStep--;
            updateStepUI();
        }
    });

    btnReset.addEventListener("click", () => {
        currentStep = 0;
        aesKey = "";
        wrappedKey = "";
        cipherText = "";
        liveBox.textContent = txtPlain.value;
        liveBox.style.color = "var(--text-main)";
        dbBox.textContent = "[Base de datos vacía]";
        dbBox.style.color = "var(--text-dark)";
        gsap.set("#aes-key-visual", { opacity: 0, scale: 0.5, y: 0 });
        gsap.set("#flying-packet", { opacity: 0, x: 0 });
        updateStepUI();
    });

    function updateStepUI() {
        // Habilitar/Deshabilitar botones
        btnPrev.disabled = currentStep === 0;
        btnNext.style.display = currentStep === 4 ? "none" : "inline-flex";
        btnReset.classList.toggle("hidden", currentStep === 0);
        
        // Actualizar burbuja
        bubble.innerHTML = stepBubbles[currentStep];
        
        // Actualizar indicadores visuales de pasos
        for (let i = 1; i <= 4; i++) {
            const stepEl = document.getElementById(`step-ind-${i}`);
            const spanEl = stepEl.querySelector("span");
            if (i === currentStep) {
                stepEl.className = "p-2.5 rounded-lg border border-blue-500/30 bg-blue-950/20 flex items-center gap-3 transition-all duration-300";
                spanEl.className = "w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-[10px]";
            } else if (i < currentStep) {
                stepEl.className = "p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-950/10 flex items-center gap-3 transition-all duration-300";
                spanEl.className = "w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[10px]";
            } else {
                stepEl.className = "p-2.5 rounded-lg border border-[rgba(255,255,255,0.06)] bg-gray-900/60 flex items-center gap-3 transition-all duration-300";
                spanEl.className = "w-5 h-5 rounded-full bg-gray-800 text-gray-400 flex items-center justify-center font-bold text-[10px]";
            }
        }
        
        // Disparar animaciones lógicas de GSAP para cada paso
        if (currentStep === 1) {
            // Generar Llave AES simulada
            aesKey = Array.from({length: 32}, () => Math.floor(Math.random()*256).toString(16).padStart(2,'0')).join('');
            document.getElementById("deep-aes-key").textContent = "0x" + aesKey.substring(0, 16) + "...";
            
            // Animación de la llave simétrica
            gsap.to("#aes-key-visual", { opacity: 1, scale: 1, y: -20, rotation: 360, duration: 0.8, ease: "back.out(1.7)" });
            
        } else if (currentStep === 2) {
            // Cifrar contenido
            const textValue = txtPlain.value;
            // Caracteres cifrados aleatorios para el efecto visual
            cipherText = textValue.split('').map(() => String.fromCharCode(33 + Math.floor(Math.random() * 93))).join('');
            
            // Efecto de morpheo en el cuadro de texto
            gsap.to(liveBox, {
                duration: 1,
                opacity: 0.5,
                yoyo: true,
                repeat: 1,
                onRepeat: () => {
                    liveBox.textContent = cipherText;
                    liveBox.style.color = "var(--primary)";
                },
                onComplete: () => {
                    liveBox.opacity = 1;
                }
            });
            
            // Actualizar Inspección Profunda para el primer caracter
            if (textValue.length > 0) {
                const char0 = textValue.charAt(0);
                const charCode = char0.charCodeAt(0);
                const mask = 0xB2; // Máscara estática simulada
                const xorVal = charCode ^ mask;
                document.getElementById("deep-char").textContent = char0;
                document.getElementById("deep-char-hex").textContent = "0x" + charCode.toString(16).toUpperCase();
                document.getElementById("deep-cipher-char").textContent = String.fromCharCode(xorVal);
            }
            
        } else if (currentStep === 3) {
            // Envolver Llave AES con RSA
            wrappedKey = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*256).toString(16).padStart(2,'0')).join('');
            document.getElementById("deep-wrapped-key").textContent = wrappedKey.substring(0, 24) + "...";
            
            // Animación llave cayendo/metiéndose al laptop (RSA envoltura)
            gsap.to("#aes-key-visual", {
                y: 10,
                scale: 0.4,
                opacity: 0,
                duration: 0.6,
                ease: "power2.in"
            });
            
        } else if (currentStep === 4) {
            // Envío por red TLS
            const tl = gsap.timeline();
            tl.set("#flying-packet", { x: 0, y: 30, opacity: 0 });
            tl.to("#flying-packet", { opacity: 1, duration: 0.15 })
              .to("#flying-packet", {
                  x: 350,
                  duration: 1.8,
                  ease: "power1.inOut",
                  onUpdate: function() {
                      const progress = this.progress();
                      // Trayecto de onda senoidal
                      const wave = Math.sin(progress * Math.PI) * 40;
                      gsap.set("#flying-packet", { y: 30 - wave });
                  }
              })
              .to("#flying-packet", { opacity: 0, duration: 0.15 })
              .to("#server-db-box", {
                  textContent: "[Reporte #1 Guardado (Cifrado)]",
                  color: "var(--success)",
                  duration: 0.5
              }, "-=0.2");
        }
    }
}

// --- SANDBOX 2: SHAMIR'S SECRET SHARING (GF256) ---
let sssActiveShares = new Set();
let sssSpinAngle = 0;
let sssAnimationId = null;

function initSandboxSSS() {
    const cards = document.querySelectorAll(".share-card");
    
    cards.forEach(card => {
        card.addEventListener("click", () => {
            const shareId = parseInt(card.dataset.share);
            
            if (sssActiveShares.has(shareId)) {
                sssActiveShares.delete(shareId);
                card.classList.remove("border-blue-500", "border-emerald-500", "border-purple-500", "bg-[rgba(255,255,255,0.02)]");
                card.classList.add("border-[rgba(255,255,255,0.06)]", "bg-gray-900/60");
                card.querySelector(".checkbox").innerHTML = "";
            } else {
                sssActiveShares.add(shareId);
                let colorClass = "border-blue-500";
                if (shareId === 2) colorClass = "border-emerald-500";
                if (shareId === 3) colorClass = "border-purple-500";
                
                card.classList.remove("border-[rgba(255,255,255,0.06)]", "bg-gray-900/60");
                card.classList.add(colorClass, "bg-[rgba(255,255,255,0.02)]");
                card.querySelector(".checkbox").innerHTML = '<i class="fa-solid fa-check text-[10px] text-gray-200"></i>';
            }
            
            updateSSSIndicatorUI();
            drawLagrangeGraph();
        });
    });
}

function updateSSSIndicatorUI() {
    const slot1 = document.getElementById("slot-indicator-1");
    const slot2 = document.getElementById("slot-indicator-2");
    const s1Text = document.getElementById("slot-text-1");
    const s2Text = document.getElementById("slot-text-2");
    const bubble = document.getElementById("sss-narrator-bubble");
    
    const count = sssActiveShares.size;
    const items = Array.from(sssActiveShares);
    
    // Resetear
    slot1.className = "flex-1 p-2 rounded bg-gray-900 border border-gray-800";
    slot2.className = "flex-1 p-2 rounded bg-gray-900 border border-gray-800";
    s1Text.textContent = "VACÍO";
    s1Text.className = "text-[10px] text-gray-500 font-bold";
    s2Text.textContent = "VACÍO";
    s2Text.className = "text-[10px] text-gray-500 font-bold";
    
    if (count === 0) {
        bubble.innerHTML = "Active fragmentos del custodio a la izquierda para ver cómo se deforma y calcula la interpolación polinomial de Lagrange.";
    } else if (count === 1) {
        slot1.className = "flex-1 p-2 rounded bg-blue-950/20 border border-blue-500/30";
        s1Text.textContent = `SHARE #${items[0]}`;
        s1Text.className = "text-[10px] text-blue-400 font-bold";
        bubble.innerHTML = "<strong>Falta de Umbral (1/2 fragmentos)</strong>: Un solo punto no determina la clave. Observa cómo la recta gira sin control: existen 256 claves posibles (eje Y).";
    } else if (count >= 2) {
        slot1.className = "flex-1 p-2 rounded bg-blue-950/20 border border-blue-500/30";
        s1Text.textContent = `SHARE #${items[0]}`;
        s1Text.className = "text-[10px] text-blue-400 font-bold";
        
        slot2.className = "flex-1 p-2 rounded bg-emerald-950/20 border border-emerald-500/30";
        s2Text.textContent = `SHARE #${items[1]}`;
        s2Text.className = "text-[10px] text-emerald-400 font-bold";
        bubble.innerHTML = "<strong>Umbral Satisfecho (2/3 fragmentos)</strong>: La recta se fija de inmediato y corta el eje Y en 80. ¡Llave privada RSA PEM reconstruida exitosamente en memoria!";
    }
}

// Representación cartesiana para visualización de Lagrange
const sssPoints = {
    1: { x: 1, y: 55, svgX: 180, svgY: 65, color: "var(--primary)" },
    2: { x: 2, y: 30, svgX: 260, svgY: 90, color: "var(--success)" },
    3: { x: 3, y: 5,  svgX: 340, svgY: 115, color: "#a855f7" }
};

function drawLagrangeGraph() {
    const path = document.getElementById("lagrange-polynomial-path");
    const pointsGroup = document.getElementById("lagrange-points-group");
    const secretNode = document.getElementById("sss-secret-node");
    if (!path || !pointsGroup || !secretNode) return;
    
    // Detener bucles de animación anteriores
    if (sssAnimationId) {
        cancelAnimationFrame(sssAnimationId);
        sssAnimationId = null;
    }
    
    pointsGroup.innerHTML = "";
    gsap.to(secretNode, { opacity: 0, duration: 0.2 });
    
    const activeList = Array.from(sssActiveShares);
    const count = activeList.length;
    
    // Dibujar los nodos activos en el SVG
    activeList.forEach(id => {
        const pt = sssPoints[id];
        
        // Círculo del punto
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", pt.svgX);
        circle.setAttribute("cy", pt.svgY);
        circle.setAttribute("r", "6");
        circle.setAttribute("fill", pt.color);
        circle.setAttribute("stroke", "#04060c");
        circle.setAttribute("stroke-width", "1.5");
        pointsGroup.appendChild(circle);
        
        // Etiqueta del punto
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", pt.svgX + 8);
        txt.setAttribute("y", pt.svgY + 3);
        txt.setAttribute("fill", "var(--text-muted)");
        txt.setAttribute("font-size", "7px");
        txt.setAttribute("font-family", "var(--font-mono)");
        txt.textContent = `P(${pt.x}, ${pt.y})`;
        pointsGroup.appendChild(txt);
    });
    
    if (count === 0) {
        // Sin puntos: Línea plana
        path.setAttribute("d", "");
    } else if (count === 1) {
        // 1 punto: Animar rotación infinita
        const activePt = sssPoints[activeList[0]];
        
        function rotateCurve() {
            if (sssActiveShares.size !== 1) return;
            sssSpinAngle += 0.035;
            
            // Generar recta rotatoria y = pt.y + m * (x - pt.x)
            const slope = Math.sin(sssSpinAngle) * 3;
            
            let d = "";
            for (let svgX = 20; svgX <= 420; svgX += 5) {
                const x = (svgX - 100) / 80; // Reversar mapeo
                const y = activePt.y + slope * (x - activePt.x);
                const svgY = 120 - y;
                
                if (svgX === 20) d += `M ${svgX} ${svgY}`;
                else d += ` L ${svgX} ${svgY}`;
            }
            path.setAttribute("d", d);
            sssAnimationId = requestAnimationFrame(rotateCurve);
        }
        rotateCurve();
        
    } else if (count >= 2) {
        // 2 o 3 puntos: La recta se fija exactamente cruzando los puntos
        // Ecuación de la recta y = 80 - 25x
        let d = "";
        for (let svgX = 20; svgX <= 420; svgX += 5) {
            const x = (svgX - 100) / 80;
            const y = 80 - 25 * x; // y = 80 - 25x
            const svgY = 120 - y;
            
            if (svgX === 20) d += `M ${svgX} ${svgY}`;
            else d += ` L ${svgX} ${svgY}`;
        }
        
        // Transicionar la curva usando GSAP
        path.setAttribute("d", d);
        
        // Revelar punto secreto (0, 80) -> X_svg = 100, Y_svg = 120 - 80 = 40
        secretNode.setAttribute("cx", 100);
        secretNode.setAttribute("cy", 40);
        gsap.to(secretNode, { opacity: 1, duration: 0.5, ease: "back.out" });
        
        // Etiqueta del secreto
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", 108);
        txt.setAttribute("y", 43);
        txt.setAttribute("fill", "var(--success)");
        txt.setAttribute("font-size", "7px");
        txt.setAttribute("font-weight", "bold");
        txt.setAttribute("font-family", "var(--font-mono)");
        txt.textContent = "Secreto (0, 80)";
        pointsGroup.appendChild(txt);
    }
}

// --- SANDBOX 3: BLOCKCHAIN & DOMINO ---
function initSandboxBlockchain() {
    // Inicialización simple
}

window.tamperBlockSimulator = function() {
    const modal = document.getElementById("modal-tamper");
    if (!modal) return;
    
    modal.style.opacity = "1";
    modal.style.pointerEvents = "all";
};

window.closeTamperModal = function() {
    const modal = document.getElementById("modal-tamper");
    if (!modal) return;
    
    modal.style.opacity = "0";
    modal.style.pointerEvents = "none";
};

window.executeTamperSimulation = function() {
    const newDetail = document.getElementById("tamper-input-text").value.trim();
    closeTamperModal();
    
    // Iniciar simulación de alteración con efectos dominó GSAP
    const b2 = document.getElementById("bnode-2");
    const b2Detail = document.getElementById("bnode-detail-2");
    const b2Status = document.getElementById("bnode-status-2");
    const b2Hash = document.getElementById("bnode-hash-2");
    const bubble = document.getElementById("blockchain-narrator-bubble");
    
    if (!b2 || !b2Detail || !b2Status || !b2Hash) return;
    
    // 1. Modificar el texto del bloque 2
    b2Detail.textContent = `Detalle: ${newDetail}`;
    
    // 2. Animación de sacudida (Ataque) en Bloque 2
    gsap.to(b2, { x: 8, repeat: 7, yoyo: true, duration: 0.04, onComplete: () => {
        gsap.set(b2, { x: 0 }); // Restaurar
        
        // Alterar firma del bloque 2
        b2Status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ALTERADO';
        b2Status.className = "text-[9px] text-red-500 font-bold animate-pulse";
        b2.classList.add("tampered");
        
        // Nuevo hash simulado alterado en rojo
        b2Hash.textContent = "Curr: 8ae9bd271f28e69d...";
        b2Hash.className = "text-red-500 truncate";
        
        // Romper enlace 2-3
        const link2 = document.getElementById("blink-2");
        if (link2) {
            link2.className = "flex-grow h-1 bg-red-500/20 relative min-w-[30px]";
            link2.querySelector(".glow-bar").className = "absolute inset-0 bg-red-500 opacity-60 glow-bar-failed animate-pulse";
        }
        
        bubble.innerHTML = "<strong>¡Colisión Detectada!</strong> El bloque #2 ha sido manipulado. Su hash cambió. El bloque #3 nota que su Hash Anterior no coincide con el real. ¡Cascada de fallo iniciada!";
        
        // 3. Cascada dominó al bloque 3 (180ms después)
        setTimeout(() => {
            const b3 = document.getElementById("bnode-3");
            const b3Status = document.getElementById("bnode-status-3");
            const b3Prev = document.getElementById("bnode-prev-3");
            const b3Hash = document.getElementById("bnode-hash-3");
            
            if (b3 && b3Status && b3Prev && b3Hash) {
                // Sacudida
                gsap.to(b3, { y: 6, repeat: 5, yoyo: true, duration: 0.05, onComplete: () => {
                    gsap.set(b3, { y: 0 });
                    
                    b3Status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ALTERADO';
                    b3Status.className = "text-[9px] text-red-500 font-bold animate-pulse";
                    b3.classList.add("tampered");
                    
                    b3Prev.textContent = "Prev: 8ae9bd271f28e69d..."; // Carga el anterior roto
                    b3Hash.textContent = "Curr: 2c5f1a9b28ef94ac..."; // Cambia el actual
                    b3Hash.className = "text-red-500 truncate";
                    
                    // Romper enlace 3-4
                    const link3 = document.getElementById("blink-3");
                    if (link3) {
                        link3.className = "flex-grow h-1 bg-red-500/20 relative min-w-[30px]";
                        link3.querySelector(".glow-bar").className = "absolute inset-0 bg-red-500 opacity-60 glow-bar-failed animate-pulse";
                    }
                }});
            }
        }, 180);
        
        // 4. Cascada dominó al bloque 4 (360ms después)
        setTimeout(() => {
            const b4 = document.getElementById("bnode-4");
            const b4Status = document.getElementById("bnode-status-4");
            const b4Prev = document.getElementById("bnode-prev-4");
            const b4Hash = document.getElementById("bnode-hash-4");
            
            if (b4 && b4Status && b4Prev && b4Hash) {
                gsap.to(b4, { x: -6, repeat: 5, yoyo: true, duration: 0.05, onComplete: () => {
                    gsap.set(b4, { x: 0 });
                    
                    b4Status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ALTERADO';
                    b4Status.className = "text-[9px] text-red-500 font-bold animate-pulse";
                    b4.classList.add("tampered");
                    
                    b4Prev.textContent = "Prev: 2c5f1a9b28ef94ac...";
                    b4Hash.textContent = "Curr: 4f1a28ef9b4c2789...";
                    b4Hash.className = "text-red-500 truncate";
                    
                    bubble.innerHTML = "<strong>¡Fallo en Cascada Completado!</strong> La cadena entera se ha roto. Cualquier auditor o administrador podrá detectar de forma inmediata y automática que el registro del sistema ha sido comprometido.";
                }});
            }
        }, 360);
    }});
};
