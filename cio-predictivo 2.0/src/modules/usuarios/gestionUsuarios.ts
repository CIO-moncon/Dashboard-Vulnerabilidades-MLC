// ============================================================================
// GESTIÓN DE USUARIOS — Panel de administración (solo ADMINISTRADOR)
// ============================================================================
import { AuthService } from '../../core/auth/authService';
import { registrarComando } from '../../core/app/comandos';
import { escaparHTML } from '../../core/utils/sanitizar';

const ROLES = ['ADMINISTRADOR', 'SUPERVISOR', 'ANALISTA CBM', 'OPERADOR TERRENO'] as const;

interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  tenant_id: string;
  activo: boolean;
  creado_en: number;
}

const headers = (): Record<string, string> => AuthService.getHeadersTenant();

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...headers() },
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') msg = data.detail;
    } catch {
      /* sin JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

let usuariosCache: Usuario[] = [];

function renderTabla(container: HTMLElement): void {
  const filas = usuariosCache
    .map(
      (u) => `
      <tr data-id="${escaparHTML(u.id)}" style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 8px 10px; color: #E2E8F0; font-size: 0.8rem;">${escaparHTML(u.email)}</td>
        <td style="padding: 8px 10px; color: #ffffff; font-size: 0.8rem; font-weight: 600;">${escaparHTML(u.nombre)}</td>
        <td style="padding: 8px 10px;">
          <select data-action="rol" data-id="${escaparHTML(u.id)}" style="background: #0E1B1F; color: #38bdf8; border: 1px solid rgba(255,255,255,0.15); padding: 4px 6px; border-radius: 6px; font-size: 0.72rem; font-weight: 700;">
            ${ROLES.map((r) => `<option value="${r}" ${r === u.rol ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </td>
        <td style="padding: 8px 10px; text-align: center;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${u.activo ? '#00e676' : '#f87171'};"></span>
        </td>
        <td style="padding: 8px 10px; display: flex; gap: 6px; justify-content: flex-end;">
          <button type="button" data-action="toggle" data-id="${escaparHTML(u.id)}" data-activo="${u.activo}" title="${u.activo ? 'Desactivar' : 'Activar'}" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #E2E8F0; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 0.72rem; font-weight: 700;">
            ${u.activo ? 'Desactivar' : 'Activar'}
          </button>
          <button type="button" data-action="reset" data-id="${escaparHTML(u.id)}" data-email="${escaparHTML(u.email)}" title="Restablecer contraseña" style="background: rgba(245, 166, 35, 0.15); border: 1px solid rgba(245, 166, 35, 0.4); color: #F5A623; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 0.72rem; font-weight: 700;">
            Reset clave
          </button>
        </td>
      </tr>`,
    )
    .join('');

  container.innerHTML = `
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
        <thead>
          <tr style="background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.1);">
            <th style="padding: 8px 10px; text-align: left; color: #94A3B8; font-weight: 800; font-size: 0.72rem; text-transform: uppercase;">Correo</th>
            <th style="padding: 8px 10px; text-align: left; color: #94A3B8; font-weight: 800; font-size: 0.72rem; text-transform: uppercase;">Nombre</th>
            <th style="padding: 8px 10px; text-align: left; color: #94A3B8; font-weight: 800; font-size: 0.72rem; text-transform: uppercase;">Rol</th>
            <th style="padding: 8px 10px; text-align: center; color: #94A3B8; font-weight: 800; font-size: 0.72rem; text-transform: uppercase;">Activo</th>
            <th style="padding: 8px 10px; text-align: right; color: #94A3B8; font-weight: 800; font-size: 0.72rem; text-transform: uppercase;">Acciones</th>
          </tr>
        </thead>
        <tbody>${filas || '<tr><td colspan="5" style="padding: 1.5rem; text-align: center; color: #94A3B8;">Sin usuarios.</td></tr>'}</tbody>
      </table>
    </div>
  `;

  // Wire events
  container.querySelectorAll<HTMLSelectElement>('select[data-action="rol"]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const id = sel.dataset.id!;
      try {
        await api(`/api/users/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ rol: sel.value }),
        });
        await cargarUsuarios(container);
      } catch (e: any) {
        alert(`No se pudo cambiar el rol: ${e?.message || e}`);
        await cargarUsuarios(container);
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>('button[data-action="toggle"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id!;
      const activo = btn.dataset.activo === 'true';
      try {
        await api(`/api/users/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ activo: !activo }),
        });
        await cargarUsuarios(container);
      } catch (e: any) {
        alert(`No se pudo cambiar el estado: ${e?.message || e}`);
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>('button[data-action="reset"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id!;
      const email = btn.dataset.email!;
      const nueva = prompt(`Nueva contraseña para ${email} (mínimo 12 caracteres):`);
      if (!nueva) return;
      try {
        await api(`/api/users/${id}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ password_nueva: nueva }),
        });
        alert('Contraseña restablecida correctamente.');
      } catch (e: any) {
        alert(`No se pudo restablecer: ${e?.message || e}`);
      }
    });
  });
}

async function cargarUsuarios(container: HTMLElement): Promise<void> {
  try {
    const data = await api<{ usuarios: Usuario[] }>('/api/users');
    usuariosCache = data.usuarios || [];
    renderTabla(container);
  } catch (e: any) {
    container.innerHTML = `<p style="color: #f87171; padding: 1rem;">Error al cargar usuarios: ${escaparHTML(e?.message || e)}</p>`;
  }
}

export const abrirModalGestionUsuarios = async (): Promise<void> => {
  document.getElementById('modal-gestion-usuarios')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-gestion-usuarios';
  modal.style.cssText =
    'position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999;';

  modal.innerHTML = `
    <div style="background: #0E1B1F; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; width: 92vw; max-width: 900px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.6);">
      <header style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <h2 style="margin: 0; color: #ffffff; font-size: 1.05rem; font-weight: 800; font-family: 'Space Grotesk', sans-serif;">Gestión de usuarios</h2>
        <button type="button" id="btn-cerrar-usuarios" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #E2E8F0; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 1.1rem;">×</button>
      </header>

      <div style="padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <form id="form-nuevo-usuario" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; align-items: end;">
          <div>
            <label style="display: block; font-size: 0.7rem; color: #94A3B8; font-weight: 700; margin-bottom: 4px;">Correo</label>
            <input name="email" type="email" required placeholder="usuario@cpf.cl" style="width: 100%; background: #090a0f; border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 7px 9px; border-radius: 6px; font-size: 0.8rem; box-sizing: border-box;">
          </div>
          <div>
            <label style="display: block; font-size: 0.7rem; color: #94A3B8; font-weight: 700; margin-bottom: 4px;">Nombre</label>
            <input name="nombre" type="text" required placeholder="Nombre completo" style="width: 100%; background: #090a0f; border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 7px 9px; border-radius: 6px; font-size: 0.8rem; box-sizing: border-box;">
          </div>
          <div>
            <label style="display: block; font-size: 0.7rem; color: #94A3B8; font-weight: 700; margin-bottom: 4px;">Rol</label>
            <select name="rol" required style="width: 100%; background: #090a0f; border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 7px 9px; border-radius: 6px; font-size: 0.8rem; box-sizing: border-box;">
              ${ROLES.map((r) => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 0.7rem; color: #94A3B8; font-weight: 700; margin-bottom: 4px;">Contraseña (≥12)</label>
            <input name="password" type="password" required minlength="12" placeholder="••••••••••••" style="width: 100%; background: #090a0f; border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 7px 9px; border-radius: 6px; font-size: 0.8rem; box-sizing: border-box;">
          </div>
          <div>
            <button type="submit" style="width: 100%; background: #0284c7; color: #fff; border: none; padding: 8px 12px; border-radius: 6px; font-weight: 800; font-size: 0.8rem; cursor: pointer;">
              Crear usuario
            </button>
          </div>
        </form>
        <p id="usuarios-msg" style="margin: 8px 0 0 0; font-size: 0.75rem; color: #94A3B8; min-height: 16px;"></p>
      </div>

      <div id="usuarios-tabla" style="padding: 14px 18px; overflow-y: auto; flex: 1;">
        <p style="color: #94A3B8;">Cargando usuarios...</p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const tabla = modal.querySelector('#usuarios-tabla') as HTMLElement;
  const msg = modal.querySelector('#usuarios-msg') as HTMLElement;
  const form = modal.querySelector('#form-nuevo-usuario') as HTMLFormElement;

  modal.querySelector('#btn-cerrar-usuarios')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      email: String(fd.get('email') || ''),
      nombre: String(fd.get('nombre') || ''),
      rol: String(fd.get('rol') || ''),
      password: String(fd.get('password') || ''),
    };
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
      msg.textContent = '✅ Usuario creado correctamente.';
      msg.style.color = '#00e676';
      form.reset();
      await cargarUsuarios(tabla);
    } catch (err: any) {
      msg.textContent = `❌ ${err?.message || err}`;
      msg.style.color = '#f87171';
    }
  });

  await cargarUsuarios(tabla);
};

// Registro en el bus de comandos (antes: window.abrirModalGestionUsuarios).
registrarComando('usuarios:abrirModal', abrirModalGestionUsuarios);
