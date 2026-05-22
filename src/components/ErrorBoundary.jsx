import React from 'react'

export default class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fullscreen-center" style={{ flexDirection: 'column', gap: 16, textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2 style={{ margin: 0 }}>เกิดข้อผิดพลาด</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, maxWidth: 360 }}>
            {this.state.error.message}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => this.setState({ error: null })}
          >
            ลองใหม่
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
