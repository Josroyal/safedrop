import os
from fastapi import FastAPI, Depends, HTTPException, status, Form, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional

from backend.database import (
    get_db, init_db, Report, Attachment, AuditLog,
    add_audit_log, verify_audit_trail_integrity
)
from backend.auth import (
    create_access_token, verify_password, get_password_hash,
    RoleChecker, get_current_active_user, User
)
from backend.crypto_utils import get_public_key_pem, ensure_organizational_keys

# Ruta base del proyecto
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Inicializar Base de Datos en SQLite
init_db()

app = FastAPI(
    title="SafeDrop Local API",
    description="Backend seguro con arquitectura de conocimiento cero para denuncias anónimas",
    version="1.0.0"
)

# Permitir CORS para desarrollo local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- PYDANTIC SCHEMAS -----------------

class AttachmentSubmit(BaseModel):
    filename: str
    mime_type: str
    data_encrypted: str  # Base64
    iv: str              # Base64

class ReportSubmit(BaseModel):
    report_text_encrypted: str  # Base64
    report_iv: str              # Base64
    encrypted_aes_key: str      # Base64 (cifrada con RSA-OAEP)
    attachments: List[AttachmentSubmit] = []

class UserCreate(BaseModel):
    username: str
    password: str
    role: str  # "admin" o "auditor"

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True

# ----------------- ENDPOINTS -----------------

@app.get("/api/crypto/public-key")
def get_public_key():
    """
    Permite al frontend obtener la llave pública RSA-OAEP de la organización
    para cifrar las llaves simétricas AES en local.
    """
    try:
        pub_key = get_public_key_pem()
        return {"public_key": pub_key}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al recuperar la llave pública: {str(e)}"
        )

@app.post("/api/reports/submit", status_code=status.HTTP_201_CREATED)
def submit_report(payload: ReportSubmit, db: Session = Depends(get_db)):
    """
    Guarda una denuncia y sus adjuntos cifrados. El backend no tiene acceso al texto plano.
    Genera un registro de auditoría encadenado.
    """
    try:
        # 1. Crear el objeto Report
        new_report = Report(
            report_text_encrypted=payload.report_text_encrypted,
            report_iv=payload.report_iv,
            encrypted_aes_key=payload.encrypted_aes_key
        )
        db.add(new_report)
        db.commit()
        db.refresh(new_report)
        
        # 2. Agregar los adjuntos cifrados
        for att in payload.attachments:
            new_attachment = Attachment(
                report_id=new_report.id,
                filename=att.filename,
                mime_type=att.mime_type,
                data_encrypted=att.data_encrypted,
                iv=att.iv
            )
            db.add(new_attachment)
            
        db.commit()
        
        # 3. Loggear la actividad en la bitácora criptográfica
        add_audit_log(
            db,
            action="REPORT_SUBMITTED",
            details=f"Nueva denuncia registrada con ID {new_report.id}. Total de adjuntos: {len(payload.attachments)}."
        )
        
        return {
            "status": "success",
            "message": "Reporte registrado de forma segura y anónima.",
            "report_id": new_report.id
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar el reporte: {str(e)}"
        )

@app.post("/api/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Autenticación mediante formulario estándar OAuth2.
    Registra el acceso en la bitácora criptográfica.
    """
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        # Auditoría de intento fallido
        add_audit_log(
            db,
            action="LOGIN_FAILED",
            details=f"Intento de acceso fallido para el usuario '{form_data.username}'."
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nombre de usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario se encuentra inactivo."
        )
        
    access_token = create_access_token(data={"sub": user.username})
    
    # Auditoría de inicio de sesión exitoso
    add_audit_log(
        db,
        action="LOGIN_SUCCESS",
        user_id=user.id,
        username=user.username,
        details=f"Usuario '{user.username}' (Rol: {user.role}) inició sesión con éxito."
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role
    }

@app.get("/api/reports")
def get_reports(
    current_user: User = Depends(RoleChecker(["auditor", "admin"])),
    db: Session = Depends(get_db)
):
    """
    Retorna la lista de reportes cifrados. Requiere privilegios de auditor o administrador.
    Nota: La información real del reporte continúa cifrada.
    """
    reports = db.query(Report).order_by(Report.created_at.desc()).all()
    
    # Registrar auditoría de la consulta
    add_audit_log(
        db,
        action="REPORTS_LIST_VIEWED",
        user_id=current_user.id,
        username=current_user.username,
        details=f"El usuario '{current_user.username}' consultó la lista de reportes recibidos."
    )
    
    result = []
    for r in reports:
        result.append({
            "id": r.id,
            "created_at": r.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            "report_text_encrypted": r.report_text_encrypted,
            "report_iv": r.report_iv,
            "encrypted_aes_key": r.encrypted_aes_key,
            "attachments_count": len(r.attachments)
        })
    return result

@app.get("/api/reports/{report_id}")
def get_report_detail(
    report_id: int,
    current_user: User = Depends(RoleChecker(["auditor", "admin"])),
    db: Session = Depends(get_db)
):
    """
    Retorna los detalles cifrados de un reporte, incluyendo sus adjuntos cifrados.
    El descifrado de ambos componentes se realiza en local en el navegador del auditor.
    """
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
        
    # Registrar acceso a los detalles
    add_audit_log(
        db,
        action="REPORT_DETAIL_VIEWED",
        user_id=current_user.id,
        username=current_user.username,
        details=f"El usuario '{current_user.username}' visualizó los datos del reporte ID {report_id}."
    )
    
    attachments_list = []
    for att in report.attachments:
        attachments_list.append({
            "id": att.id,
            "filename": att.filename,
            "mime_type": att.mime_type,
            "data_encrypted": att.data_encrypted,
            "iv": att.iv
        })
        
    return {
        "id": report.id,
        "created_at": report.created_at.strftime('%Y-%m-%d %H:%M:%S'),
        "report_text_encrypted": report.report_text_encrypted,
        "report_iv": report.report_iv,
        "encrypted_aes_key": report.encrypted_aes_key,
        "attachments": attachments_list
    }

@app.get("/api/audit/logs")
def get_audit_logs(
    current_user: User = Depends(RoleChecker(["admin", "auditor"])),
    db: Session = Depends(get_db)
):
    """
    Devuelve la bitácora de auditoría completa junto con el estado de validación criptográfica de la cadena.
    """
    integrity_intact, log_details = verify_audit_trail_integrity(db)
    
    # Para evitar recursión infinita en la bitácora de auditoría,
    # solo registramos que se consultó la auditoría cada 5 consultas o simplemente registramos
    # sin re-verificar en bucle. Registraremos una acción simple.
    add_audit_log(
        db,
        action="AUDIT_TRAIL_VERIFIED",
        user_id=current_user.id,
        username=current_user.username,
        details=f"El usuario '{current_user.username}' realizó una verificación de integridad de la bitácora. Resultado: {'INTEGRO' if integrity_intact else 'COMPROMETIDO'}."
    )
    
    return {
        "integrity_intact": integrity_intact,
        "logs": log_details
    }

@app.post("/api/audit/simulate-tampering")
def simulate_tampering(
    current_user: User = Depends(RoleChecker(["admin"])),
    db: Session = Depends(get_db)
):
    """
    Simula una alteración maliciosa en la base de datos de manera intencional.
    Modifica el contenido de un log existente sin recalcular su hash.
    Esto permite demostrar cómo se rompe la cadena criptográfica SHA-256.
    """
    # Buscar el primer log que no sea genesis o simplemente el último log registrado
    target_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    if not target_log:
        raise HTTPException(status_code=400, detail="No hay suficientes registros de auditoría para alterar.")
        
    old_details = target_log.details
    target_log.details = " [TAMPERED] Detalle modificado maliciosamente en la base de datos SQLite."
    db.commit()
    
    return {
        "status": "success",
        "message": f"Simulación completada. Se han modificado los detalles del Log ID {target_log.id} sin actualizar su hash criptográfico. Ejecute la verificación para observar la alerta.",
        "log_id": target_log.id,
        "previous_details": old_details,
        "new_details": target_log.details
    }

@app.post("/api/admin/users", response_model=UserResponse)
def create_user(
    payload: UserCreate,
    current_user: User = Depends(RoleChecker(["admin"])),
    db: Session = Depends(get_db)
):
    """
    Crea un nuevo usuario (admin o auditor) en el sistema. Protegido con RBAC.
    """
    existing_user = db.query(User).filter(User.username == payload.username).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="El nombre de usuario ya está registrado."
        )
        
    if payload.role not in ["admin", "auditor"]:
        raise HTTPException(
            status_code=400,
            detail="Rol inválido. Debe ser 'admin' o 'auditor'."
        )
        
    new_user = User(
        username=payload.username,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Registrar auditoría de la creación
    add_audit_log(
        db,
        action="USER_CREATED",
        user_id=current_user.id,
        username=current_user.username,
        details=f"El administrador '{current_user.username}' creó el usuario '{new_user.username}' con rol '{new_user.role}'."
    )
    
    return new_user

@app.get("/api/admin/users", response_model=List[UserResponse])
def list_users(
    current_user: User = Depends(RoleChecker(["admin"])),
    db: Session = Depends(get_db)
):
    """
    Lista todos los usuarios del sistema. Solo para Administradores.
    """
    return db.query(User).all()

@app.get("/api/admin/backup")
def download_backup(
    current_user: User = Depends(RoleChecker(["admin"])),
    db: Session = Depends(get_db)
):
    """
    Descarga una copia de seguridad completa del archivo de base de datos SQLite.
    """
    from fastapi.responses import FileResponse
    add_audit_log(
        db,
        action="DATABASE_BACKUP_DOWNLOADED",
        user_id=current_user.id,
        username=current_user.username,
        details="El administrador descargó una copia de seguridad de la base de datos."
    )
    db_path = os.path.join(BASE_DIR, "safedrop.db")
    return FileResponse(db_path, media_type="application/octet-stream", filename="safedrop_backup.db")

@app.post("/api/admin/restore")
async def restore_backup(
    file: UploadFile = File(..., description="Archivo de base de datos .db para restaurar"),
    current_user: User = Depends(RoleChecker(["admin"])),
    db: Session = Depends(get_db)
):
    """
    Restaura la base de datos reemplazando el archivo SQLite activo.
    """
    if not file.filename.endswith(".db"):
        raise HTTPException(status_code=400, detail="Archivo inválido. Debe ser un archivo .db")
        
    try:
        contents = await file.read()
        db_path = os.path.join(BASE_DIR, "safedrop.db")
        
        # Cerrar conexiones activas de SQLAlchemy
        from backend.database import engine, SessionLocal, init_db
        engine.dispose()
        
        with open(db_path, "wb") as f:
            f.write(contents)
            
        init_db()
        
        # Registrar restauración en la nueva base de datos
        new_db = SessionLocal()
        add_audit_log(
            new_db,
            action="DATABASE_RESTORED",
            user_id=current_user.id,
            username=current_user.username,
            details=f"Base de datos restaurada desde el archivo '{file.filename}'."
        )
        new_db.close()
        
        return {"status": "success", "message": "Base de datos restaurada con éxito."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al restaurar base de datos: {str(e)}")

# Montar archivos estáticos del frontend
frontend_path = os.path.join(BASE_DIR, "frontend")
os.makedirs(frontend_path, exist_ok=True)
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
