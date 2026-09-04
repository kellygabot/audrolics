import Image from "next/image";

interface AuthModalProps {
  mode: 'login' | 'signup';
  onClose: () => void;
  onSwitchMode: (mode: 'login' | 'signup') => void;
}

export default function AuthModal({ mode, onClose, onSwitchMode }: AuthModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm font-poppins">
      
      {/* Click outside backdrop to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative z-10 w-[800px] h-[500px] bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-row">
        
        {/* Left Section: Form Controls */}
        <div className="w-1/2 p-12 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-8">
            <Image src="/logo.svg" alt="Logo" width={24} height={24} className="h-6 w-6" />
            <span className="font-semibold text-gray-700 text-sm">Audrolics</span>
          </div>

          <p className="text-[0.65rem] font-extrabold uppercase tracking-widest text-[#8a8a8a] mb-1">
            {mode === 'login' ? 'RIGHT WHERE YOU LEFT OFF' : 'GET STARTED'}
          </p>
          <h2 className="text-3xl font-extrabold text-black mb-2">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-[0.75rem] text-[#8a8a8a] mb-8">
            {mode === 'login' ? 'Sign in to continue to your account.' : 'Sign up to start building.'}
          </p>

          <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="block text-[0.70rem] font-bold text-black mb-1.5">Email address</label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-gray-400 text-sm">✉</span>
                <input 
                  type="email" 
                  placeholder="you@company.com" 
                  className="w-full pl-9 pr-4 py-2.5 rounded-[0.75rem] bg-transparent border border-gray-300 text-sm focus:outline-none focus:border-[#021eef] focus:ring-1 focus:ring-[#021eef]" 
                />
              </div>
            </div>

            <div>
              <label className="block text-[0.70rem] font-bold text-black mb-1.5">Password</label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-gray-400 text-sm">🔒</span>
                <input 
                  type="password" 
                  placeholder="Enter your password" 
                  className="w-full pl-9 pr-4 py-2.5 rounded-[0.75rem] bg-transparent border border-gray-300 text-sm focus:outline-none focus:border-[#021eef] focus:ring-1 focus:ring-[#021eef]" 
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="w-full mt-2 bg-[#021eef] text-white py-3 rounded-[0.75rem] font-bold text-[0.85rem] shadow-lg hover:bg-blue-700 transition-colors"
            >
              {mode === 'login' ? 'Log in' : 'Sign up'}
            </button>
          </form>
        </div>

        {/* Right Section: Gradient Switch Box */}
        <div className="w-1/2 bg-gradient-to-br from-[#4b76fc] to-[#01c0fa] p-12 text-white flex flex-col items-center justify-center text-center relative">
          
          {/* Abstract Icons Graphic */}
          <div className="relative w-32 h-28 mb-8">
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/20 rounded-2xl backdrop-blur-sm"></div>
            <div className="absolute top-4 left-2 w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg">
              <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden">
                <div className="w-full h-full bg-[#021eef]/10 mt-3"></div>
              </div>
            </div>
            <div className="absolute top-2 -left-2 bg-white text-black text-[10px] font-bold px-2 py-1 rounded-md shadow-md">✓</div>
            <div className="absolute bottom-2 right-0 bg-white text-black text-[10px] font-bold px-2 py-1 rounded-md shadow-md">=</div>
          </div>

          <p className="text-[0.65rem] font-extrabold uppercase tracking-widest text-white/90 mb-2">
            {mode === 'login' ? 'MAKE IT YOURS' : 'ALREADY HERE?'}
          </p>
          <h3 className="text-3xl font-extrabold mb-4 leading-tight">
            {mode === 'login' ? 'Are you\nnew here?' : 'Welcome\nback!'}
          </h3>
          <p className="text-xs text-white/90 mb-8 max-w-[200px] leading-relaxed">
            {mode === 'login' 
              ? 'Create a workspace, save your projects, and keep every bright idea within reach.' 
              : 'Log in to access your saved hydraulic calculations and workspaces.'}
          </p>

          <button 
            onClick={() => onSwitchMode(mode === 'login' ? 'signup' : 'login')}
            className="px-5 py-2 rounded-full border border-white/50 bg-white/10 hover:bg-white/20 backdrop-blur-md text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
          >
            {mode === 'login' ? 'Create account' : 'Log in instead'} <span className="text-sm">→</span>
          </button>
        </div>

      </div>
    </div>
  );
}