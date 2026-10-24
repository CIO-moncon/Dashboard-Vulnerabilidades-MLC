export interface TenantBranding {
  tenantId: string;
  nombreFaena: string;
  empresaMatriz?: string;
  logoUrl: string;
  logoPdfUrl?: string;
  faviconUrl?: string;
}

export interface TenantThemeTokens {
  primaryColor: string;
  primaryHover: string;
  primaryActive: string;
  primaryBgTranslucent: string;
  primaryBorderTranslucent: string;
  bgDark?: string;
  bgDarkDeep?: string;
  bgCard?: string;
}

export interface GeoBoundingBox {
  center: [number, number]; // [longitud, latitud]
  zoom: number;
  pitch?: number;
  bearing?: number;
  maxBounds?: [[number, number], [number, number]];
}

export interface TenantFeatureFlags {
  moduloTermografia: boolean;
  analisisFFTAvanzado: boolean;
  integracionSapPm: boolean;
  modoOfflineEstricto: boolean;
  exportacionPdfEjecutivo: boolean;
}

export interface TenantConfig {
  branding: TenantBranding;
  theme: TenantThemeTokens;
  geoViewer: GeoBoundingBox;
  features: TenantFeatureFlags;
}