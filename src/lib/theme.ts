import type { WorldThemeSettings } from '@/lib/types';

export interface AppTheme {
  name: string;
  bgPrimary: string;
  bgSecondary: string;
  accent: string;
  accentSecondary: string;
  textPrimary: string;
  textSecondary: string;
  cardBg: string;
  glowColor: string;
}

export const DEFAULT_THEME: AppTheme = {
  name: 'Soft Bloom',
  bgPrimary: '#e9e4d8',
  bgSecondary: '#ddd6c6',
  accent: '#9b8ae0',
  accentSecondary: '#f5cf6b',
  textPrimary: '#2e2a3d',
  textSecondary: '#746f85',
  cardBg: 'rgba(46,42,61,0.035)',
  glowColor: 'rgba(155,138,224,0.18)',
};

export const DEFAULT_WORLD_THEME: WorldThemeSettings = {
  background: {
    type: 'solid',
    color1: '#e9e4d8',
    color2: '#ddd6c6',
    angle: 135,
    imageUrl: null,
    texture: 'none',
  },
  surfaces: {
    cardBg: 'rgba(46,42,61,0.035)',
    sidebarBg: 'rgba(243,238,227,0.6)',
    modalBg: 'rgba(243,238,227,0.97)',
    chatBg: 'rgba(46,42,61,0.03)',
  },
  colors: {
    accent: '#9b8ae0',
    accentSecondary: '#f5cf6b',
    highlight: '#f59e0b',
    success: '#10b981',
    warning: '#f97316',
    danger: '#ef4444',
    textPrimary: '#2e2a3d',
    textSecondary: '#746f85',
    muted: '#9b96a8',
    border: 'rgba(46,42,61,0.08)',
  },
  typography: {
    displayFont: "'Poppins', 'Nunito', sans-serif",
    bodyFont: "'Nunito', system-ui, sans-serif",
    accentFont: "'Nunito', system-ui, sans-serif",
  },
  components: {
    borderRadius: 16,
    borderOpacity: 0.06,
    shadowIntensity: 0.3,
    blur: 20,
    glassEffect: true,
    grain: false,
    transparency: 0.04,
  },
};

export function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.style.setProperty('--bg-primary', theme.bgPrimary);
  root.style.setProperty('--bg-secondary', theme.bgSecondary);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-secondary', theme.accentSecondary);
  root.style.setProperty('--text-primary', theme.textPrimary);
  root.style.setProperty('--text-secondary', theme.textSecondary);
  root.style.setProperty('--card-bg', theme.cardBg);
  root.style.setProperty('--glow', theme.glowColor);
}

export function applyWorldTheme(settings: WorldThemeSettings) {
  const root = document.documentElement;

  // Background
  if (settings.background.type === 'gradient') {
    root.style.setProperty('--bg-primary', settings.background.color1);
    root.style.setProperty('--bg-secondary', settings.background.color2);
  } else if (settings.background.type === 'image' && settings.background.imageUrl) {
    root.style.setProperty('--bg-primary', settings.background.color1);
    root.style.setProperty('--bg-secondary', settings.background.color1);
  } else {
    root.style.setProperty('--bg-primary', settings.background.color1);
    root.style.setProperty('--bg-secondary', settings.background.color2);
  }

  // Colors
  root.style.setProperty('--accent', settings.colors.accent);
  root.style.setProperty('--accent-secondary', settings.colors.accentSecondary);
  root.style.setProperty('--text-primary', settings.colors.textPrimary);
  root.style.setProperty('--text-secondary', settings.colors.textSecondary);
  root.style.setProperty('--card-bg', settings.surfaces.cardBg);
  root.style.setProperty('--glow', `${settings.colors.accent}26`);

  // Extended properties
  root.style.setProperty('--surface-card', settings.surfaces.cardBg);
  root.style.setProperty('--surface-sidebar', settings.surfaces.sidebarBg);
  root.style.setProperty('--surface-modal', settings.surfaces.modalBg);
  root.style.setProperty('--surface-chat', settings.surfaces.chatBg);
  root.style.setProperty('--color-highlight', settings.colors.highlight);
  root.style.setProperty('--color-success', settings.colors.success);
  root.style.setProperty('--color-warning', settings.colors.warning);
  root.style.setProperty('--color-danger', settings.colors.danger);
  root.style.setProperty('--color-muted', settings.colors.muted);
  root.style.setProperty('--color-border', settings.colors.border);

  // Typography
  root.style.setProperty('--font-display', settings.typography.displayFont);
  root.style.setProperty('--font-body', settings.typography.bodyFont);
  root.style.setProperty('--font-accent', settings.typography.accentFont);

  // Components
  root.style.setProperty('--radius', `${settings.components.borderRadius}px`);
  root.style.setProperty('--border-opacity', `${settings.components.borderOpacity}`);
  root.style.setProperty('--shadow-intensity', `${settings.components.shadowIntensity}`);
  root.style.setProperty('--glass-blur', `${settings.components.blur}px`);
  root.style.setProperty('--glass-transparency', `${settings.components.transparency}`);

  // Apply body font
  document.body.style.fontFamily = settings.typography.bodyFont;

  // Apply display font to .font-display elements
  const displayElements = document.querySelectorAll('.font-display');
  displayElements.forEach((el) => {
    (el as HTMLElement).style.fontFamily = settings.typography.displayFont;
  });

  // Background image
  if (settings.background.type === 'image' && settings.background.imageUrl) {
    document.body.style.backgroundImage = `url(${settings.background.imageUrl})`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
  } else if (settings.background.type === 'gradient') {
    document.body.style.backgroundImage = `linear-gradient(${settings.background.angle}deg, ${settings.background.color1}, ${settings.background.color2})`;
    document.body.style.backgroundAttachment = 'fixed';
  } else {
    document.body.style.backgroundImage = 'none';
  }

  // Grain texture
  if (settings.background.texture === 'grain' || settings.components.grain) {
    root.classList.add('world-grain');
  } else {
    root.classList.remove('world-grain');
  }
}

export function worldThemeToAppTheme(settings: WorldThemeSettings, name: string): AppTheme {
  return {
    name,
    bgPrimary: settings.background.color1,
    bgSecondary: settings.background.color2,
    accent: settings.colors.accent,
    accentSecondary: settings.colors.accentSecondary,
    textPrimary: settings.colors.textPrimary,
    textSecondary: settings.colors.textSecondary,
    cardBg: settings.surfaces.cardBg,
    glowColor: `${settings.colors.accent}26`,
  };
}
