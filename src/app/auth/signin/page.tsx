'use client'

import { useState } from 'react'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const res = await fetch('/api/auth/signin/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        csrfToken: await fetch('/api/auth/csrf')
          .then((r) => r.json())
          .then((d) => d.csrfToken),
      }),
    })

    if (res.ok) {
      setSent(true)
    } else {
      setError('Could not send sign-in link. Please try again.')
    }
  }

  return (
    <div className="welcome">
      <h1>ART</h1>
      <p className="muted">Agricultural Research Tool</p>

      <div className="card" style={{ width: 360, textAlign: 'left' }}>
        <h2>Sign In</h2>
        {sent ? (
          <p style={{ fontSize: 13 }}>
            Check your email for a sign-in link. You can close this tab.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              className="primary"
              style={{ marginTop: 12, width: '100%' }}
            >
              Send sign-in link
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
