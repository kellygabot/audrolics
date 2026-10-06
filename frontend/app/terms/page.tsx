import Link from "next/link";

export default function TermsPage() {
  return <main className="mx-auto max-w-3xl px-6 py-12 text-[#30323b]">
    <Link href="/" className="text-[#021eef] underline">Audrolics home</Link>
    <h1 className="mt-8 text-3xl font-bold">Terms of use (draft)</h1>
    <p className="mt-4">These tentative terms describe the Audrolics prototype operated by Oceans and Arrays Team. They may change before a public release.</p>
    <h2 className="mt-8 text-xl font-semibold">Using the prototype</h2>
    <p className="mt-2">Use an account to create and analyze your own hydraulic schematics. Keep your password private and provide accurate account details. Do not use the prototype to harm other users or disrupt the service.</p>
    <h2 className="mt-8 text-xl font-semibold">Engineering results</h2>
    <p className="mt-2">Simulation and anomaly results are experimental. Check inputs and independently verify results before making operational or safety decisions.</p>
    <h2 className="mt-8 text-xl font-semibold">Accounts and questions</h2>
    <p className="mt-2">An Audrolics administrator can suspend or delete accounts and moderate schematic metadata. For account or data requests, contact your Audrolics administrator. See the <Link href="/privacy" className="text-[#021eef] underline">draft privacy notice</Link>.</p>
  </main>;
}
  