import time
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Request, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Import del motor FFT existente
from analizador_fft import procesar_senal_vibracion

app = FastAPI(
    title="CIO Predictivo 2.0 - Core Engine Multi-Tenant",
    description="Motor central CBM para Mina Los Colorados y arquitectura SaaS",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Configuración CORS para PWA y aplicaciones móviles
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# ALMACENES EN MEMORIA (Listos para conectar a PostgreSQL / PocketBase)
# -----------------------------------------------------------------------------
class AuditEntry(BaseModel):
    tenant_id: str
    user_id: str
    user_role: str
    action_type: str  # CREATE, UPDATE, DELETE, ANALYZE, CBM_MEASURE
    resource: str
    timestamp: float = Field(default_factory=time.time)
    metadata: Optional[Dict[str, Any]] = None

AUDIT_LOG_STORE: List[AuditEntry] = []
CBM_RECORDS_STORE: List[Dict[str, Any]] = []

def registrar_evento_auditoria(entry: AuditEntry):
    AUDIT_LOG_STORE.append(entry)
    print(f"[AUDIT] [{entry.tenant_id}] User:{entry.user_id} ({entry.user_role}) -> {entry.action_type} en {entry.resource}")

# -----------------------------------------------------------------------------
# DEPENDENCIAS MULTI-TENANT Y CONTEXTO
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
# ESQUEMAS DE DATOS PYDANTIC
# -----------------------------------------------------------------------------
class SolicitudAnalisis(BaseModel):
    tag_equipo: str
    amplitudes: List[float]
    componente: Optional[str] = "General"
    frecuencia_muestreo: Optional[float] = 1000.0

class RegistroDirectoPayload(BaseModel):
    resource: str
    actionType: str
    payload: Dict[str, Any]

class SincronizacionOutboxPayload(BaseModel):
    tenantId: Optional[str] = None
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
        
        resultado = procesar_senal_vibracion(datos.amplitudes, datos.frecuencia_muestreo)

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

@app.post("/api/cbm/registro-directo")
def registro_directo(
    body: RegistroDirectoPayload,
    context: Dict[str, str] = Depends(resolver_tenant_context)
):
    """
    Recibe la transmisión directa e inmediata desde terreno cuando el operador tiene conexión activa.
    """
    record_id = f"rec_{int(time.time() * 1000)}"
    data = {
        "id": record_id,
        "tenant_id": context["tenant_id"],
        "user_id": context["user_id"],
        "resource": body.resource,
        "action_type": body.actionType,
        "payload": body.payload,
        "creado_en": time.time()
    }
    
    CBM_RECORDS_STORE.append(data)

    registrar_evento_auditoria(AuditEntry(
        tenant_id=context["tenant_id"],
        user_id=context["user_id"],
        user_role=context["user_role"],
        action_type=body.actionType,
        resource=body.resource,
        metadata={"tag": body.payload.get("tag"), "severidad": body.payload.get("severidad")}
    ))

    return {
        "status": "success",
        "id": record_id,
        "tenant_id": context["tenant_id"],
        "timestamp": time.time()
    }

@app.post("/api/cbm/sincronizar-outbox")
def sincronizar_outbox(
    payload: SincronizacionOutboxPayload,
    context: Dict[str, str] = Depends(resolver_tenant_context)
):
    """
    Recibe el lote de transacciones acumuladas en modo offline por la PWA.
    Valida pertenencia de tenant soportando tanto camelCase como snake_case.
    """
    procesados = []
    rechazados = []

    for item in payload.items:
        item_id = item.get("id")
        # Soporte para camelCase (TS) y snake_case (Python)
        item_tenant = item.get("tenantId") or item.get("tenant_id")
        action_type = item.get("actionType") or item.get("action_type", "CREATE")
        resource = item.get("resource", f"cbm_record:{item_id}")
        item_payload = item.get("payload", {})

        # Validación multi-tenant estricta
        if item_tenant and item_tenant.lower() != context["tenant_id"]:
            rechazados.append({
                "id": item_id,
                "motivo": f"Inconsistencia de tenant: recibido {item_tenant}, esperado {context['tenant_id']}"
            })
            continue

        # Guardar en repositorio de registros CBM
        registro_cbm = {
            "id": item_id,
            "tenant_id": context["tenant_id"],
            "user_id": context["user_id"],
            "resource": resource,
            "action_type": action_type,
            "payload": item_payload,
            "sincronizado_en": time.time()
        }
        CBM_RECORDS_STORE.append(registro_cbm)

        # Registrar trazabilidad en Audit Trail
        registrar_evento_auditoria(AuditEntry(
            tenant_id=context["tenant_id"],
            user_id=context["user_id"],
            user_role=context["user_role"],
            action_type=action_type,
            resource=resource,
            metadata={"tag": item_payload.get("tag"), "severidad": item_payload.get("severidad")}
        ))
        procesados.append(item_id)

    return {
        "tenant_id": context["tenant_id"],
        "total_recibidos": len(payload.items),
        "sincronizados": procesados,
        "rechazados": rechazados
    }

@app.get("/api/cbm/registros")
def obtener_registros_cbm(
    tag: Optional[str] = None,
    limit: int = 50,
    context: Dict[str, str] = Depends(resolver_tenant_context)
):
    """
    Permite consultar los registros CBM para alimentar la línea de tiempo o triage.
    """
    registros_tenant = [r for r in CBM_RECORDS_STORE if r["tenant_id"] == context["tenant_id"]]
    
    if tag:
        registros_tenant = [r for r in registros_tenant if r.get("payload", {}).get("tag") == tag]
        
    return {
        "tenant_id": context["tenant_id"],
        "total": len(registros_tenant),
        "registros": registros_tenant[-limit:]
    }

@app.get("/api/auditoria")
def obtener_auditoria(
    limit: int = 50,
    context: Dict[str, str] = Depends(resolver_tenant_context)
):
    if context["user_role"] not in ["ADMINISTRADOR", "SUPERVISOR"]:
        raise HTTPException(status_code=403, detail="No cuenta con permisos para ver registros de auditoría.")

    tenant_logs = [log.model_dump() for log in AUDIT_LOG_STORE if log.tenant_id == context["tenant_id"]]
    return {
        "tenant_id": context["tenant_id"],
        "logs": tenant_logs[-limit:]
    }