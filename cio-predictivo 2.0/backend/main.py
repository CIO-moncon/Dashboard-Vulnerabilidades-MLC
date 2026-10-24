import time
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Request, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Import del motor FFT existente
from analizador_fft import procesar_senal_vibracion

app = FastAPI(
    title="CIO Predictivo 2.0 - Core Engine Multi-Tenant",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Configuración CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# AUDIT TRAIL Y REGISTRO EN MEMORIA / BASE DE DATOS
# -----------------------------------------------------------------------------
class AuditEntry(BaseModel):
    tenant_id: str
    user_id: str
    user_role: str
    action_type: str  # CREATE, UPDATE, DELETE, ANALYZE
    resource: str
    timestamp: float = Field(default_factory=time.time)
    metadata: Optional[Dict[str, Any]] = None

# Repositorio en memoria para eventos de auditoría (migrable a Postgres/PocketBase)
AUDIT_LOG_STORE: List[AuditEntry] = []

def registrar_evento_auditoria(entry: AuditEntry):
    AUDIT_LOG_STORE.append(entry)
    # Log estructurado estándar
    print(f"[AUDIT] [{entry.tenant_id}] User:{entry.user_id} ({entry.user_role}) -> {entry.action_type} en {entry.resource}")

# -----------------------------------------------------------------------------
# DEPENDENCIAS MULTI-TENANT Y SESIÓN
# -----------------------------------------------------------------------------
async def resolver_tenant_context(
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    x_user_id: Optional[str] = Header("anonymous", alias="X-User-ID"),
    x_user_role: Optional[str] = Header("OPERADOR", alias="X-User-Role")
) -> Dict[str, str]:
    if not x_tenant_id:
        raise HTTPException(
            status_code=400, 
            detail="Falta el encabezado obligatorio 'X-Tenant-ID'. Acceso multi-tenant denegado."
        )
    return {
        "tenant_id": x_tenant_id.lower().strip(),
        "user_id": x_user_id,
        "user_role": x_user_role.upper()
    }

# -----------------------------------------------------------------------------
# ESQUEMAS DE SOLICITUD
# -----------------------------------------------------------------------------
class SolicitudAnalisis(BaseModel):
    tag_equipo: str
    amplitudes: List[float]
    componente: Optional[str] = "General"
    frecuencia_muestreo: Optional[float] = 1000.0

class SincronizacionOutboxPayload(BaseModel):
    items: List[Dict[str, Any]]

# -----------------------------------------------------------------------------
# ENDPOINTS
# -----------------------------------------------------------------------------
@app.get("/api/health")
def health_check():
    return {"status": "online", "system": "CIO Predictivo 2.0 Core"}

@app.post("/api/analizar-vibracion")
def analizar_vibracion(
    datos: SolicitudAnalisis,
    context: Dict[str, str] = Depends(resolver_tenant_context)
):
    try:
        if not datos.amplitudes:
            raise HTTPException(status_code=400, detail="El arreglo de amplitudes está vacío.")
        
        # Procesamiento matemático de señales
        resultado = procesar_senal_vibracion(datos.amplitudes, datos.frecuencia_muestreo)

        # Registro estricto en el Audit Trail
        registrar_evento_auditoria(AuditEntry(
            tenant_id=context["tenant_id"],
            user_id=context["user_id"],
            user_role=context["user_role"],
            action_type="ANALYZE",
            resource=f"activo:{datos.tag_equipo}/{datos.componente}",
            metadata={"num_muestras": len(datos.amplitudes)}
        ))
        
        return {
            "tenant_id": context["tenant_id"],
            "tag_equipo": datos.tag_equipo,
            "resultado_analisis": resultado
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/cbm/sincronizar-outbox")
def sincronizar_outbox(
    payload: SincronizacionOutboxPayload,
    context: Dict[str, str] = Depends(resolver_tenant_context)
):
    """
    Recibe el lote de transacciones acumuladas en modo offline por la PWA o App Móvil.
    Garantiza que todas las operaciones correspondan al tenant activo.
    """
    procesados = []
    rechazados = []

    for item in payload.items:
        # Validación de pertenencia al tenant
        item_tenant = item.get("tenant_id")
        if item_tenant and item_tenant != context["tenant_id"]:
            rechazados.append({
                "id": item.get("id"),
                "motivo": f"Inconsistencia de tenant: recibido {item_tenant}, esperado {context['tenant_id']}"
            })
            continue

        # Procesar y registrar auditoría por cada registro sincronizado
        registrar_evento_auditoria(AuditEntry(
            tenant_id=context["tenant_id"],
            user_id=context["user_id"],
            user_role=context["user_role"],
            action_type=item.get("action_type", "CREATE"),
            resource=f"cbm_record:{item.get('id')}",
            metadata=item.get("payload")
        ))
        procesados.append(item.get("id"))

    return {
        "tenant_id": context["tenant_id"],
        "total_recibidos": len(payload.items),
        "sincronizados": procesados,
        "rechazados": rechazados
    }

@app.get("/api/auditoria")
def obtener_auditoria(
    limit: int = 50,
    context: Dict[str, str] = Depends(resolver_tenant_context)
):
    # Solo roles autorizados pueden auditar
    if context["user_role"] not in ["ADMINISTRADOR", "SUPERVISOR"]:
        raise HTTPException(status_code=403, detail="No cuenta con permisos para ver registros de auditoría.")

    tenant_logs = [log for log in AUDIT_LOG_STORE if log.tenant_id == context["tenant_id"]]
    return {
        "tenant_id": context["tenant_id"],
        "logs": tenant_logs[-limit:]
    }