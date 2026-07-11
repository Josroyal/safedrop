import os
import datetime
import hashlib
import re
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

# Ubicación de la base de datos en la raíz del proyecto
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'safedrop.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ----------------- MODELOS -----------------

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)  # Hash seguro Argon2id
    role = Column(String, nullable=False)  # "admin" o "auditor"
    is_active = Column(Boolean, default=True)

class Report(Base):
    __tablename__ = "reports"
    
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    report_text_encrypted = Column(Text, nullable=False)  # Base64
    report_iv = Column(String, nullable=False)  # Base64
    encrypted_aes_key = Column(Text, nullable=False)  # Base64 (envuelta con RSA-OAEP)
    
    attachments = relationship("Attachment", back_populates="report", cascade="all, delete-orphan")

class Attachment(Base):
    __tablename__ = "attachments"
    
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    data_encrypted = Column(Text, nullable=False)  # Base64
    iv = Column(String, nullable=False)  # Base64
    
    report = relationship("Report", back_populates="attachments")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    action = Column(String, nullable=False)  # Ej. "REPORT_SUBMITTED", "USER_LOGIN"
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String, nullable=True)
    details = Column(Text, nullable=False)
    previous_hash = Column(String, nullable=False)  # Hash del registro anterior
    current_hash = Column(String, nullable=False)   # Hash del registro actual

# ----------------- FUNCIONES DE UTILIDAD Y CRIPTOGRAFÍA DE BITÁCORA -----------------

def get_db():
    """Generador de sesión de base de datos para dependencias FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def compute_log_hash(log_id: int, timestamp: datetime.datetime, action: str, user_id: int, username: str, details: str, prev_hash: str) -> str:
    """
    Calcula el hash SHA-256 de forma determinista para un registro de auditoría.
    """
    time_str = timestamp.strftime('%Y-%m-%d %H:%M:%S')
    user_id_str = str(user_id) if user_id is not None else ""
    username_str = str(username) if username is not None else ""
    
    payload = f"{log_id}|{time_str}|{action}|{user_id_str}|{username_str}|{details}|{prev_hash}"
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()

def add_audit_log(db, action: str, user_id: int = None, username: str = None, details: str = ""):
    """
    Agrega un registro de auditoría y calcula su hash encadenado con el registro anterior.
    """
    # 1. Obtener el último log insertado para encadenar el hash
    last_log = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
    prev_hash = last_log.current_hash if last_log else "0"  # Bloque génesis
    
    # 2. Crear y guardar el log (sin hash definitivo temporalmente para obtener el ID)
    new_log = AuditLog(
        timestamp=datetime.datetime.utcnow(),
        action=action,
        user_id=user_id,
        username=username,
        details=details,
        previous_hash=prev_hash,
        current_hash="PENDING"
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    
    # 3. Calcular el hash real con el ID asignado por la BD
    actual_hash = compute_log_hash(
        new_log.id,
        new_log.timestamp,
        new_log.action,
        new_log.user_id,
        new_log.username,
        new_log.details,
        new_log.previous_hash
    )
    
    new_log.current_hash = actual_hash
    db.commit()
    db.refresh(new_log)
    return new_log

def verify_audit_trail_integrity(db) -> tuple[bool, list[dict]]:
    """
    Valida la cadena criptográfica completa de la bitácora de auditoría.
    Retorna (integrity_intact, log_details_with_status_list).
    """
    logs = db.query(AuditLog).order_by(AuditLog.id.asc()).all()
    
    if not logs:
        return True, []
        
    log_report = []
    integrity_intact = True
    expected_prev_hash = "0"
    
    for i, log in enumerate(logs):
        # 1. Validar encadenamiento con el registro anterior
        chain_valid = (log.previous_hash == expected_prev_hash)
        
        # 2. Recalcular el hash del registro actual
        calculated_hash = compute_log_hash(
            log.id,
            log.timestamp,
            log.action,
            log.user_id,
            log.username,
            log.details,
            log.previous_hash
        )
        
        hash_valid = (log.current_hash == calculated_hash)
        record_valid = chain_valid and hash_valid
        
        # 3. Validar integridad cruzada (Cross-Reference) para los reportes
        log_details = log.details
        if log.action == "REPORT_SUBMITTED":
            match = re.search(r'ID (\d+)', log.details)
            if match:
                report_id = int(match.group(1))
                report_exists = db.query(Report).filter(Report.id == report_id).first()
                if not report_exists:
                    record_valid = False
                    log_details = f"[✗ REPORTE ELIMINADO/FALTANTE] {log.details}"
        
        if not record_valid:
            integrity_intact = False
            
        log_report.append({
            "id": log.id,
            "timestamp": log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            "action": log.action,
            "username": log.username or "Anónimo",
            "details": log_details,
            "previous_hash": log.previous_hash,
            "current_hash": log.current_hash,
            "calculated_hash": calculated_hash,
            "chain_valid": chain_valid,
            "hash_valid": hash_valid,
            "is_valid": record_valid
        })
        
        # El hash esperado para el siguiente registro es el hash actual almacenado
        expected_prev_hash = log.current_hash
        
    return integrity_intact, log_report

def init_db():
    Base.metadata.create_all(bind=engine)
