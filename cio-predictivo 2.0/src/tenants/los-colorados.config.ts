import { TenantConfig } from '../core/types/tenant.types';

export const LosColoradosTenantConfig: TenantConfig = {
  branding: {
    tenantId: 'mina_los_colorados',
    nombreFaena: 'Mina Los Colorados',
    empresaMatriz: 'Compañía Minera del Pacífico (CMP)',
    logoUrl: '/assets/img/logo-cpf.png',
    logoPdfUrl: '/assets/img/logo-cpf.png'
  },
  theme: {
    primaryColor: '#38bdf8',
    primaryHover: '#0284c7',
    primaryActive: '#0369a1',
    primaryBgTranslucent: 'rgba(56, 189, 248, 0.12)',
    primaryBorderTranslucent: 'rgba(56, 189, 248, 0.35)',
    bgDark: '#0d1117',
    bgDarkDeep: '#090a0f',
    bgCard: 'rgba(22, 27, 34, 0.82)'
  },
  geoViewer: {
    center: [-70.813030, -28.290846], // [longitud, latitud]
    zoom: 16,
    pitch: 45,
    bearing: 0
  },
  features: {
    moduloTermografia: true,
    analisisFFTAvanzado: true,
    integracionSapPm: true,
    modoOfflineEstricto: true,
    exportacionPdfEjecutivo: true,
    gemelo3D: true
  }
};