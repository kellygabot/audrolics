'use client';

import Image from 'next/image';

interface HeaderProps {
  onOpenAuth?: (mode: 'login' | 'signup') => void;
} 

export default function Header({ onOpenAuth }: HeaderProps) {
  return (
    <main className="h-22 w-full flex bg-background px-6 text-foreground shadow-[0_4px_30px_rgba(0,0,0,0.3)] sticky top-0 z-40 items-center">
      <div className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Logo" width={32} height={32} className="h-8 w-8 ml-4" />
          <h1 className="text-[1.3rem] opacity-66 pl-4 font-poppins">Audrolics</h1>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <button 
          onClick={() => onOpenAuth?.('signup')} 
          className="text-l opacity-85 border-2 border-[#8a8a8a]/90 rounded-[.75rem] pt-[0.30rem] pb-2 px-4 mr-3 transition-colors hover:bg-black/5"
        >
          Sign up
        </button>
        <button 
          onClick={() => onOpenAuth?.('login')} 
          className="text-l text-white font-bold bg-[#021eef] rounded-[.75rem] pt-1.5 pb-2 px-4.5 mr-4 transition-colors hover:bg-[#021eef]/90"
        >
          Log in
        </button>
      </div>
    </main>
  );
}