/**
 * Shared inline styles for SDK Example tab components.
 * Since the extension runs inside a sandboxed iframe without Tailwind,
 * all styling is done via React inline styles.
 */

export const cardStyle: React.CSSProperties = {
  backgroundColor: '#1e293b',
  borderRadius: '8px',
  padding: '16px',
  border: '1px solid #334155',
}

export const headingStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: '#f8fafc',
  marginBottom: '12px',
  marginTop: 0,
}

export const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#94a3b8',
  display: 'block',
  marginBottom: '2px',
}

export const valueStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#e2e8f0',
  fontFamily: 'monospace',
}

export const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: '16px',
}

export const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  backgroundColor: '#5B4FC4',
  color: '#fff',
  transition: 'opacity 0.15s',
}

export const buttonSecondaryStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#334155',
  color: '#e2e8f0',
}

export const buttonDangerStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#dc2626',
}

export const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #334155',
  backgroundColor: '#0f172a',
  color: '#e2e8f0',
  fontSize: '13px',
  width: '100%',
  boxSizing: 'border-box',
}

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '80px',
  resize: 'vertical',
  fontFamily: 'monospace',
}

export const errorStyle: React.CSSProperties = {
  color: '#f87171',
  fontSize: '13px',
  padding: '8px 12px',
  backgroundColor: 'rgba(220, 38, 38, 0.1)',
  borderRadius: '6px',
  marginBottom: '8px',
}

export const successStyle: React.CSSProperties = {
  color: '#4ade80',
  fontSize: '13px',
  padding: '8px 12px',
  backgroundColor: 'rgba(34, 197, 94, 0.1)',
  borderRadius: '6px',
  marginBottom: '8px',
}

export const loadingStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '13px',
  fontStyle: 'italic',
}

export const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
}

export const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px',
  borderBottom: '1px solid #334155',
  color: '#94a3b8',
  fontWeight: 500,
  fontSize: '12px',
}

export const tdStyle: React.CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid #1e293b',
  color: '#e2e8f0',
}

export const tagStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '9999px',
  fontSize: '11px',
  fontWeight: 500,
}
