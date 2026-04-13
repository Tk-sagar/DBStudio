import LoginForm from '../components/LoginForm.jsx';

export default function Login({ onConnect }) {
  return (
    <div className="min-h-full bg-[#0b0e17] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 mb-4">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-indigo-400">
              <rect x="1" y="1" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M6 11h10M6 7h10M6 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">DB Studio</h1>
          <p className="text-slate-500 text-sm mt-1">Connect to your database to get started</p>
        </div>

        <LoginForm onConnect={onConnect} />
      </div>
    </div>
  );
}
