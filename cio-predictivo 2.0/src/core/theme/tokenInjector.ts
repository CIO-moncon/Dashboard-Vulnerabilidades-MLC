import { TenantThemeTokens } from '../types/tenant.types';

const TOKEN_TO_CSS_VARS: Record<keyof TenantThemeTokens, string[]> = {
  primaryColor: ['--primary-color', '--primary-blue'],
  primaryHover: ['--primary-hover'],
  primaryActive: ['--primary-active'],
  primaryBgTranslucent: ['--primary-bg-translucent', '--primary-blue-bg'],
  primaryBorderTranslucent: ['--primary-border-translucent', '--primary-blue-border'],
  bgDark: ['--bg-dark'],
  bgDarkDeep: ['--bg-dark-deep'],
  bgCard: ['--bg-card'],
  fontFamily: ['--font-family-base']
};

export const injectTenantTheme = (tokens: TenantThemeTokens): void => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  (Object.keys(tokens) as Array<keyof TenantThemeTokens>).forEach((key) => {
    const value = tokens[key];
    const cssVars = TOKEN_TO_CSS_VARS[key];

    if (value && cssVars) {
      cssVars.forEach((cssVar) => {
        root.style.setProperty(cssVar, value);
      });
    }
  });
};