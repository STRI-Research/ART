import { signIn } from '@/auth'

export default function SignInPage() {
  return (
    <div className="sign-in-page">
      <div className="sign-in-card">
        <h1>ART</h1>
        <p>Agricultural Research Tool</p>
        <form
          action={async () => {
            'use server'
            await signIn('microsoft-entra-id', { redirectTo: '/' })
          }}
        >
          <button type="submit" className="primary sign-in-btn">
            Sign in with Microsoft
          </button>
        </form>
      </div>
    </div>
  )
}
