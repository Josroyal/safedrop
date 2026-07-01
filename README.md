# SafeDrop Local - Plataforma de Denuncias Anónimas con Cifrado Híbrido

## Curso: Ética y Seguridad de Datos (DS3031) - Proyecto Final Tipo 2
**Grupo de Trabajo:** Josué Arbulú y Leonardo Huamán  
**Docente:** José Carlos Pazos  
**Fase:** Entrega Final  

---

## 1. Contexto, Motivación y Objetivos

### 1.1 Contexto del Problema
Actualmente, las organizaciones enfrentan desafíos internos como fraude, corrupción, acoso laboral y abuso de autoridad. Aunque existen canales éticos tradicionales para denunciar estas conductas, los informantes a menudo temen represalias, despido o persecución legal debido a que los sistemas tradicionales otorgan a los administradores de red, técnicos y proveedores de bases de datos acceso irrestricto en texto plano a los mensajes y archivos enviados.
SafeDrop Local resuelve este problema eliminando la necesidad de confiar ciegamente en el servidor y sus administradores, mediante la aplicación de una **Arquitectura de Conocimiento Cero (Zero-Knowledge Architecture)** y cifrado del lado del cliente.

### 1.2 Motivación del Proyecto
La motivación principal es demostrar de manera práctica cómo la criptografía aplicada puede salvaguardar los derechos fundamentales a la privacidad y el anonimato. Diseñando un flujo donde la información se cifra en el navegador del denunciante y solo se descifra en el navegador del auditor autorizado, el backend opera estrictamente como un almacenamiento ciego, reduciendo drásticamente la superficie de ataque y los riesgos de filtración de datos sensibles.

### 1.3 Objetivo General
Diseñar e implementar una plataforma web de denuncias anónimas denominada **SafeDrop Local** que aplique un esquema de criptografía híbrida (AES-GCM de 256 bits y RSA-OAEP de 2048 bits) para asegurar la confidencialidad de los reportes y evidencias en tránsito y reposo, y un encadenamiento de auditoría (SHA-256) para garantizar la integridad inmutable de la actividad del sistema.

### 1.4 Objetivos Específicos
- **Cifrado de Origen:** Implementar criptografía simétrica (AES-GCM 256-bit) local en el navegador antes de cualquier transmisión de datos.
- **Envoltura Asimétrica:** Proteger la llave AES temporal usando la llave pública RSA de la organización con padding RSA-OAEP y SHA-256.
- **Separación de Responsabilidades (Cold Storage):** Diseñar un sistema donde la llave privada RSA de descifrado no resida en el servidor de base de datos, sino que sea cargada temporalmente en memoria por el auditor.
- **Bitácora Asegurada:** Desarrollar un log de auditoría encadenado mediante funciones hash SHA-256 para detectar cualquier manipulación en la persistencia de datos.
- **Gestión de Roles (RBAC):** Restringir el acceso a endpoints sensibles mediante JSON Web Tokens (JWT) y algoritmos de hashing seguros como Argon2id para credenciales de acceso.

---

## 2. Requerimientos de Funcionalidad y Técnicos

### 2.1 Requerimientos de Funcionalidad
- **Anonimato Absoluto:** El denunciante no requiere iniciar sesión, registrarse, ni proporcionar datos personales (correo, teléfono) para reportar.
- **Envío de Evidencias:** Capacidad para adjuntar múltiples archivos (imágenes, PDF, etc.). Tanto el texto del reporte como los archivos se cifran de forma independiente en el cliente.
- **Panel del Auditor:** Interfaz para consultar reportes recibidos. Requiere autenticación JWT y la carga de la llave privada RSA para descifrar localmente el texto y descargar los adjuntos.
- **Panel de Administración:** Control de accesos (creación de usuarios) y verificación en tiempo real de la integridad criptográfica de la bitácora del sistema.
- **Simulador de Incidentes:** Función para forzar la alteración de registros directamente en la base de datos para validar el sistema de alertas del encadenamiento de logs.

### 2.2 Requerimientos Técnicos
- **Arquitectura Multicapa:** Backend estructurado en Python utilizando el framework de alto rendimiento **FastAPI**, y frontend interactivo desarrollado en **HTML5, Vanilla CSS y Vanilla JS** para una máxima auditabilidad.
- **Contexto Seguro HTTPS/TLS:** El servidor local genera certificados digitales X.509 autofirmados (`localhost.crt` y `localhost.key`) para obligar al uso de HTTPS, un requisito técnico indispensable para la ejecución de la API criptográfica nativa del navegador (`window.crypto.subtle`).
- **Base de Datos Relacional:** Uso de SQLite administrado mediante SQLAlchemy ORM para garantizar portabilidad académica, facilidad de copias de seguridad de contingencia y prevención de inyecciones de datos.

---

## 3. Trasfondo Teórico de Seguridad

### 3.1 Tríada CIA (Confidencialidad, Integridad y Disponibilidad)
- **Confidencialidad:** Asegurada al cifrar el payload de la denuncia en el origen con AES-GCM-256 y la llave simétrica con RSA-OAEP-2048. El servidor web y la base de datos nunca conocen el texto plano.
- **Integridad:** AES-GCM proporciona cifrado autenticado, previniendo alteraciones maliciosas del texto cifrado. Adicionalmente, la bitácora inmutable encadenada por hashes SHA-256 asegura que el historial de logs sea inalterable.
- **Disponibilidad:** Se asume que la base de datos `safedrop.db` requiere contingencias y backups. Dado que todos los reportes almacenados se encuentran cifrados, es seguro realizar backups periódicos automatizados del archivo SQLite y alojarlos en repositorios remotos o servicios cloud secundarios, sin peligro de comprometer la confidencialidad.

### 3.2 Defensa en Profundidad (Defense in Depth)
El sistema no depende de una sola barrera de protección:
1. **Tránsito:** TLS/HTTPS cifra el tráfico de red, impidiendo la interceptación (sniffing) o ataques Man-in-the-Middle.
2. **Acceso:** Las contraseñas administrativas se procesan mediante **Argon2id**, el algoritmo de hashing ganador del password hashing competition, altamente resistente a ataques de fuerza bruta basados en GPU/ASIC.
3. **Persistencia:** La base de datos contiene cifrado a nivel de fila y archivo.
4. **Roles (RBAC):** Los tokens JWT restringen las operaciones de API según roles de usuario (`admin` y `auditor`).
5. **Cold Storage de Llaves:** La llave privada RSA de descifrado se resguarda físicamente fuera del servidor.

### 3.3 Criptografía Híbrida
RSA es computacionalmente costoso para cifrar grandes volúmenes de datos. Por ello, SafeDrop Local utiliza un esquema híbrido:
1. El frontend genera una llave simétrica rápida y robusta (AES-GCM de 256 bits).
2. Cifra el reporte y archivos adjuntos con dicha llave.
3. Cifra únicamente la llave AES de 256 bits con la llave pública RSA-OAEP (2048 bits) de la organización.
4. El backend recibe e integra los datos cifrados y la llave AES envuelta.

```
       [TEXTO PLANO] ────────► Cifrado AES-GCM ────────► [REPORTE CIFRADO] ──┐
                                     ▲                                       │
                              [LLAVE AES-GCM]                                ├──► Enviar al Servidor
                                     │                                       │
                                Cifrado RSA                                  │
                                     ▲                                       │
                             [LLAVE PÚBLICA] ────────► [LLAVE AES ENVUELTA] ─┘
```

### 3.4 Separación de Privilegios y Cold Storage
La llave privada RSA necesaria para romper el cifrado de las denuncias no se almacena en el servidor. El administrador descarga esta llave en la inicialización inicial del sistema y la resguarda físicamente (ej. en un USB seguro). 
Cuando un auditor necesita revisar un reporte, carga temporalmente la llave privada en su navegador. La llave reside estrictamente en la memoria RAM de JavaScript del cliente y desaparece inmediatamente al cerrar o refrescar la pestaña.

---

## 4. Modelado de Amenazas e Identificación de Riesgos

Para cuantificar la robustez del sistema, se ha estructurado la siguiente matriz de riesgos éticos y de ciberseguridad:

| Riesgo / Amenaza | Entidad Afectada | Severidad | Mitigación Técnica Implementada |
| :--- | :--- | :---: | :--- |
| **Acceso no autorizado a la base de datos (DB Leak)** | Denunciante, Organización | **Alta** | Cifrado híbrido en el origen. Los datos almacenados son blobs ilegibles sin la llave privada externa. |
| **Robo o pérdida de la llave privada RSA** | Organización, Auditoría | **Crítica** | Copia de seguridad física en Cold Storage del administrador (custodios múltiples recomendados). |
| **Manipulación del registro de logs por Admin malicioso** | Auditoría, Cumplimiento | **Media** | Bitácora encadenada por hashes SHA-256. La eliminación o modificación de un log previo invalida toda la cadena. |
| **Sniffing en tránsito en la red local de la empresa** | Denunciante | **Alta** | Uso mandatorio del protocolo TLS/HTTPS con certificados digitales autofirmados o de CA confiable. |
| **Fuga de identidad indirecta (User-Agent, IP)** | Denunciante | **Media** | Minimización de metadatos. La API no registra direcciones IP, User-Agents ni información geográfica. |

---

## 5. Plan de Respuesta ante Incidentes de Seguridad

Plan de contingencia básico ante incidentes críticos:

### 5.1 Fuga de Datos de la Base de Datos
1. **Identificación:** Se detecta un acceso o descarga inusual de la base de datos `safedrop.db`.
2. **Contención:** Detener preventivamente el servidor API HTTPS y auditar los logs del servidor para identificar el vector de vulneración.
3. **Erradicación:** Parchear la vulnerabilidad de red o puerto expuesto.
4. **Recuperación:** Validar que los datos filtrados se encontraban encriptados. Las denuncias y los adjuntos están seguros criptográficamente. Sin embargo, se debe obligar al cambio de credenciales de todos los usuarios del sistema.

### 5.2 Pérdida o Compromiso de la Llave Privada RSA
1. **Identificación:** El dispositivo físico (USB) que contiene la llave privada ha sido extraviado o comprometido.
2. **Revocación:** Cambiar de inmediato la llave pública del servidor. Las nuevas denuncias se cifrarán con el par nuevo.
3. **Recuperación:** Cargar el respaldo offline de la llave comprometida, descifrar las denuncias históricas en un equipo desconectado (sandbox), cifrarlas con la nueva llave pública e importarlas nuevamente a la base de datos. Destruir físicamente el medio comprometido.

### 5.3 Modificación del Historial (Bitácora de Auditoría Corrupta)
1. **Identificación:** La verificación de integridad criptográfica en `admin.html` reporta `"CADENA COMPROMETIDA"`.
2. **Contención:** Bloquear temporalmente el acceso a la base de datos SQLite.
3. **Análisis:** Utilizar los hashes almacenados para rastrear el ID exacto del log corrupto o eliminado.
4. **Restauración:** Restaurar el archivo `safedrop.db` al último respaldo verificado e íntegro.

---

## 6. Consideraciones Éticas y de Privacidad

La ética de datos dicta que el diseño de sistemas de denuncias debe priorizar la protección de la integridad del informante sobre la conveniencia técnica:
- **Privacy by Design:** Evitar deliberadamente formularios complejos, cookies de seguimiento y campos obligatorios de identificación.
- **Minimización de Metadatos:** La plataforma bloquea de forma nativa la inserción de cabeceras HTTP que revelen la procedencia física del denunciante.
- **Empoderamiento Matemático:** Al trasladar el proceso criptográfico al navegador, la protección de la identidad del denunciante deja de ser una política corporativa (que puede violarse) y se convierte en una restricción matemática irrompible.

---

## 7. Recomendaciones de Protección de Datos Futura

Para implementaciones de producción a escala empresarial, se proponen las siguientes mejoras:
1. **Shamir's Secret Sharing Scheme (SSSS):** Dividir la llave privada RSA en 5 fragmentos criptográficos distribuidos entre 5 custodios diferentes. Para descifrar las denuncias, se requeriría la presencia obligatoria de al menos 3 de ellos para reconstruir la llave privada temporalmente, evitando el abuso de poder por parte de un solo auditor.
2. **Módulo de Seguridad de Hardware (HSM) e Integración con YubiKeys:** Almacenar de manera inexportable las llaves RSA corporativas en un chip criptográfico seguro (HSM) y firmar las denuncias con YubiKeys físicas multifactor.
3. **Pruebas de Conocimiento Cero (ZKP) avanzadas:** Incorporar pruebas criptográficas de que un reporte fue enviado sin revelar en absoluto metadatos de red (ej. zk-SNARKs).

---

## 8. Arquitectura y Estructura del Proyecto

El sistema está organizado de la siguiente manera:
```
c:\Users\Josue\Downloads\jhihuhuhu\
├── run.py                 # Orquestador del sistema (instala dependencias, genera SSL, DB y inicia HTTPS)
├── requirements.txt       # Librerías de Python requeridas
├── bandit.yaml            # Configuración de Bandit para auditoría SAST
├── verify_system.py       # Test de integración criptográfica y API automatizado
├── backend/
│   ├── main.py            # Servidor FastAPI HTTPS y endpoints de API
│   ├── database.py        # Modelos ORM de SQLite y bitácora SHA-256 encadenada
│   ├── auth.py            # Hashing Argon2id de contraseñas y validación de tokens JWT
│   ├── crypto_utils.py    # Generador de par de llaves RSA-OAEP organizacionales
│   └── ssl_gen.py         # Generador de certificados HTTPS locales
└── frontend/
    ├── index.html         # Interfaz pública de envío de denuncias (AES-GCM en navegador)
    ├── auditor.html       # Panel del auditor (Carga PEM y descifra localmente)
    ├── admin.html         # Panel del administrador (Crea usuarios, audit trail interactivo)
    ├── docs.html          # Informe Escrito Académico y Reporte SAST interactivo
    ├── css/
    │   └── style.css      # Sistema de diseño premium con Slate Dark Mode y animaciones
    └── js/
        ├── crypto_client.js # Wrapper JS de Web Crypto API (AES-GCM + RSA-OAEP)
        └── app_client.js    # Controlador UI frontend, manejo de eventos y fetch APIs
```

---

## 9. Análisis de Seguridad SAST (Bandit)

Se configuró y aplicó la herramienta de seguridad estática **Bandit** sobre el backend para validar la ausencia de fallos de seguridad comunes (como inyecciones SQL, credenciales quemadas, o criptografía obsoleta):

```bash
bandit -r backend/ -c bandit.yaml
```

**Resultado:**
- **0 vulnerabilidades detectadas**.
- El uso de SQLAlchemy ORM previene de forma nativa inyecciones SQL en SQLite.
- Las llaves y contraseñas de sesión se autogeneran de manera dinámica, y las credenciales por defecto se hashean mediante **Argon2id**.
- Los algoritmos implementados son estándar y seguros de acuerdo a las directivas NIST actuales (AES-GCM 256 bits, RSA-OAEP 2048 bits con SHA-256).

---

## 10. Lecciones Aprendidas y Retrospectiva

### 10.1 Lecciones Aprendidas
- **Limitaciones de Entornos Seguros:** Descubrimos que las APIs criptográficas nativas del navegador (`window.crypto.subtle`) no funcionan en contextos HTTP ordinarios por protección del navegador. Esto nos obligó a implementar una arquitectura HTTPS local completa y programática.
- **Detalles del Acondicionamiento de Llaves:** Trabajar con Web Crypto API requiere una limpieza rigurosa de las llaves en PEM, removiendo cabeceras, pies de firma y retornos de carro, convirtiendo la data a binario antes de poder importar llaves SPKI o PKCS#8.
- **La Importancia del Cifrado Autenticado:** AES-GCM posee validación de integridad inmersa en la desencriptación. Si un payload en la base de datos se modifica, el descifrado falla arrojando un error criptográfico nativo.

### 10.2 Retrospectiva
- **Qué funcionó bien:** La orquestación y arranque con un único script `run.py` que genera certificados, inicializa bases de datos, crea usuarios semilla y levanta el servidor HTTPS facilitó drásticamente el flujo de prueba.
- **Qué podría mejorarse:** En un proyecto comercial, el descifrado local en frontend con grandes archivos adjuntos (ej. videos de 200MB) podría saturar la memoria RAM del navegador. Sería recomendable usar cifrado por flujos (*Streams*) en lugar de cargar todo el ArrayBuffer en memoria.

---

## 11. Instrucciones de Arranque y Ejecución

### 11.1 Requisitos Previos
- Python 3.10 o superior instalado.
- Pip (instalador de paquetes de Python).
- Navegador moderno (Chrome, Edge, Firefox) con soporte para Web Crypto API.

### 11.2 Instrucciones de Arranque
1. **Ejecutar el script de arranque:**
   Abre una terminal en la raíz del proyecto y ejecuta:
   ```bash
   python run.py
   ```
   *Este script instalará las dependencias necesarias (`fastapi`, `uvicorn`, `cryptography`, `argon2-cffi`, `python-jose`, `python-multipart`, `bandit`) si faltan, generará los certificados HTTPS autofirmados en `backend/certs/`, creará la base de datos SQLite seeded con los usuarios correspondientes y generará la llave privada RSA corporativa.*

2. **Descarga de la Llave Privada RSA:**
   Busca en el directorio raíz del proyecto el archivo generado:
   `organizacion_llave_privada.pem`
   *Guarda o mantén ubicado este archivo para cargarlo en el panel del Auditor.*

3. **Acceder a la Aplicación Web:**
   Abre tu navegador y navega a:
   [https://localhost:8000](https://localhost:8000)
   *Dado que el certificado es autofirmado por motivos de desarrollo local, el navegador mostrará una advertencia de seguridad. Haz clic en "Opciones avanzadas" y luego en "Proceder a localhost (no seguro)".*

### 11.3 Credenciales de Demostración Semilla
- **Administrador (Acceso a `/admin.html`):**
  - Usuario: `admin`
  - Contraseña: `SafeDropAdmin2026!`
- **Auditor (Acceso a `/auditor.html`):**
  - Usuario: `auditor`
  - Contraseña: `SafeDropAuditor2026!`

### 11.4 Ejecución del Test de Integración Automatizado
Para verificar de forma rápida todos los endpoints y operaciones criptográficas, ejecuta el siguiente comando en otra terminal:
```bash
python verify_system.py
```
El script reportará paso a paso las llamadas HTTP, el cifrado/descifrado correcto de reportes y la detección del ataque simulado a la base de datos.

---

## 12. Guía de Uso y Flujos de Trabajo (System Walkthrough)

Esta sección describe cómo utilizar e interactuar con los diferentes componentes de la plataforma para verificar su correcto funcionamiento y las medidas de seguridad implementadas.

### 12.1 Flujo del Informante (Envío de Denuncias)
1. **Acceso Seguro (HTTPS):** Ingrese a `https://localhost:8000`. Al ser un entorno local, acepte la advertencia de certificado autofirmado para establecer la sesión HTTPS cifrada con TLS.
2. **Redacción y Adjuntos:** Escriba los detalles del reporte en el formulario. Puede arrastrar o seleccionar archivos de prueba (como imágenes o documentos PDF).
3. **Cifrado en el Cliente:** Haga clic en **Cifrar y Enviar Reporte de Forma Segura**.
4. **Verificación Técnica (F12):**
   - Si abre las herramientas de desarrollador del navegador (F12) y va a la pestaña **Red (Network)** antes de enviar, podrá inspeccionar la solicitud HTTP POST enviada al endpoint `/api/reports/submit`.
   - El cuerpo de la solicitud JSON contiene los campos `report_text_encrypted`, `report_iv` y `encrypted_aes_key` en formato codificado Base64. Esto demuestra que ningún contenido en texto plano sale del cliente hacia la red.

### 12.2 Flujo del Auditor (Descifrado Local)
1. **Autenticación:** Ingrese a la sección **Auditoría** e inicie sesión con las credenciales del auditor (`auditor` / `SafeDropAuditor2026!`).
2. **Examen de Bloques Cifrados:** Al seleccionar un reporte en la lista lateral, la interfaz mostrará los bloques de datos cifrados tal como residen en la base de datos (llave simétrica envuelta y payload cifrado).
3. **Carga de Llave Privada (Cold Storage):**
   - El sistema requiere que el auditor cargue el archivo de clave privada `organizacion_llave_privada.pem` (generado localmente en la raíz del proyecto durante la inicialización).
   - Arrastre o seleccione el archivo `.pem` en la zona indicada.
4. **Descifrado local:** Haga clic en **Descifrar Denuncia Localmente**. El navegador importará la llave RSA en memoria, descifrará la llave AES temporal y finalmente desencriptará el texto y los adjuntos, presentándolos en la interfaz. El descifrado se realiza al 100% en el cliente; la clave privada nunca se envía al backend.

### 12.3 Flujo del Administrador (Verificación y Simulación de Integridad)
1. **Acceso:** Ingrese a la sección **Gestión** e inicie sesión con las credenciales del administrador (`admin` / `SafeDropAdmin2026!`).
2. **Verificación de Bitácora:** Haga clic en **Verificar Integridad**. El sistema verificará de forma recursiva los hashes SHA-256 de todos los registros de auditoría y mostrará un estado de `"INTEGRIDAD ASEGURADA"` en verde.
3. **Simulación de Manipulación de Base de Datos:**
   - Haga clic en el botón **Simular Ataque DB**. Esta acción alterará directamente un registro histórico dentro de la tabla `audit_logs` de la base de datos SQLite sin recalcular su hash de encadenamiento.
   - Presione nuevamente **Verificar Integridad**.
   - El sistema detectará la alteración y presentará una alerta de seguridad parpadeante en rojo indicando `"¡ALERTA DE SEGURIDAD! CADENA COMPROMETIDA"`, resaltando el log alterado en la línea de tiempo. Esto demuestra la robustez del encadenamiento criptográfico.
