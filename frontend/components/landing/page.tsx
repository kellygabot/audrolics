import Image from "next/image";

export default function LandingPage() {
  return (
    // min-h-[calc(100dvh-5.5rem)] calculates exact screen height minus the h-22 header.
    // overflow-hidden prevents any background clipping from causing scrollbars.
    <main className="relative w-full bg-[url('/bg.svg')] bg-cover bg-center bg-no-repeat flex items-center justify-center min-h-[calc(100dvh-5.5rem)] overflow-hidden">
      
      {/* Removed the w-[100vw] and fixed pixel heights that were breaking the layout */}
      <div className="flex flex-col items-center justify-center px-4 w-full max-w-5xl mx-auto">
        <h1 className="text-4xl sm:text-5xl md:text-[5rem] text-white mb-4 text-center font-poppins leading-tight">
          Anything Hydraulic, <br />
          AUDROLICS Can Handle!
        </h1>
        
        <p className="text-lg sm:text-xl md:text-[1.5rem] font-bold text-white mb-8 text-center py-6">
          Calculate, monitor, and manage your <br className="hidden sm:inline" />
          hydraulic systems with ease and precision.
        </p>
        
        <div className="bg-white px-10 py-4 rounded-2xl w-max shadow-[8px_8px_20px_rgba(0,0,0,0.4)] transition-transform hover:scale-105">
          <a href="/schematics" className="opacity-57 text-[1.5rem]">
            Create Now!
          </a>
        </div>
      </div>
      
    </main>
  );
}