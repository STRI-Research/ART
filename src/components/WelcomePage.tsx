'use client'

import { signIn } from 'next-auth/react'

export function WelcomePage() {
  return (
    <div className="welcome">
      <h1>ART</h1>
      <p className="muted">
        Open-source Agricultural Research Tool
        <br />
        Author protocols, distribute them to trial sites, collect data, and
        analyze with ANOVA.
      </p>
      <div style={{ marginTop: 8 }}>
        <button className="primary" onClick={() => signIn()}>
          Sign In to Get Started
        </button>
      </div>
    </div>
  )
}
