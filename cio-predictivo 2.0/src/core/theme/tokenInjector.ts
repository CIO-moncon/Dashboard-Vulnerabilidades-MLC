import { TenantThemeTokens } from '../types/tenant.types';

export const injectTenantTheme = (tokens: TenantThemeTokens): void => {
  const root = document.documentElement;

  if (tokens.primaryColor) {
    root.style.setProperty('--primary-blue', tokens.primaryColor);
  }
  if (tokens.primaryHover) {
    root.style.setProperty('--primary-hover', tokens.primaryHover);
  }
  if (tokens.primaryActive) {
    root.style.setProperty('--primary-active', tokens.primaryActive);
  }
  if (tokens.primaryBgTranslucent) {
    root.style.setProperty('--primary-blue-bg', tokens.primaryBgTranslucent);
  }
  if (tokens.primaryBorderTranslucent) {
    root.style.setProperty('--primary-blue-border', tokens.primaryBorderTranslucent);
  }
  if (tokens.bgDark) {
    root.style.setProperty('--bg-dark', tokens.bgDark);
  }
  if (tokens.bgDarkDeep) {
    root.style.setProperty('--bg-dark-deep', tokens.bgDarkDeep);
  }
  if (tokens.bgCard) {
    root.style.setProperty('--bg-card', tokens.bgCard);
  }
};