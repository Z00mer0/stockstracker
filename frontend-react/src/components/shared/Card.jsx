// src/components/shared/Card.jsx
export default function Card({ title, actions, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {title != null && (
        <div className="card-head">
          <span className="card-title">{title}</span>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
