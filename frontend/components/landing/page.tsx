import Image from 'next/image';
// import LoginPage from '../auth/login/page';

export default function LandingPage() {

  return (
    <main>
        <div className="relative overflow-hidden bg-gradient-to-r from-[#2247c8] from-10% to-[#008ce6] flex flex-row items-center justify-center h-[89.5vh] w-[100  vw]">
            <div className="w-200 h-200 absolute bg-white rounded-full -left-100 translate-y-[55%]"> 
                <img src="/s-logo.svg" alt="Logo" className="h-80 w-80 absolute -right-[-45px] translate-y-[-5%]" />
            </div>
            <div className="w-100 h-100 absolute bg-white rounded-full -right-60 translate-y-[-15%]"> 
                <img src="/droplet.svg" alt="Logo" className="h-80 w-80 absolute -left-[125px] translate-y-[-5%]" />
            </div>
            <div className="flex flex-col items-center justify-center">
                <h1 className="text-[5rem] text-white mb-4 text-center font-poppins leading-tight m-[-3rem]">
                    Anything Hydraulic, <br />
                    AUDROLICS Can Handle!
                </h1>
                <p className="text-[1.5rem] font-bold text-white mb-8 text-center py-6">
                    Calculate, monitor, and manage your <br />
                    hydraulic systems with ease and precision.
                </p>
                <div className="bg-white px-10 py-4 rounded-[1rem] w-max shadow-[8px_8px_20px_rgba(0,0,0,0.4)]">
                    <a href="/builder" className="opacity-57 text-[1.5rem]">
                        Create Now!
                    </a>
                </div>
            </div>
        </div>
    </main>
  );
}
