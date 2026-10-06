import Link from "next/link";

export default function PrivacyPage() {
  return <main className="mx-auto max-w-3xl px-6 py-12 text-[#30323b]">
    <Link href="/" className="text-[#021eef] underline">Audrolics home</Link>
    <h1 className="mt-8 text-3xl font-bold">Privacy notice (draft)</h1>
    <p className="mt-4">This tentative notice describes the current Audrolics prototype. Oceans and Arrays Team operates it. For questions, access, correction, or deletion requests, contact your Audrolics administrator.</p>
    <h2 className="mt-8 text-xl font-semibold">What we collect and why</h2>
    <p className="mt-2">We store your full name, email address, a bcrypt hash of your password, account role and status, and account timestamps to create and protect your account. Saved schematics include their nodes, links, measurements, settings, and any computed values you save. Simulation requests create audit records with your account ID, time, network size, outcome, and schematic ID when used. Analysis responses are returned to you; sending an inline analysis does not save its full inputs or results as a schematic. We store session records and login attempt and lockout data to keep you signed in and limit unauthorized access. Administrators can see account details and schematic metadata, but the admin interface does not expose another user’s schematic contents.</p>
    <h2 className="mt-8 text-xl font-semibold">Storage and retention</h2>
    <p className="mt-2">Account and schematic data is held in MongoDB Atlas. A session expires after 30 days of inactivity; refreshing it extends that period. Login attempt records expire after their short rate limit window. Account and schematic deletion is soft deletion: the records remain stored until an administrator handles a data removal request. Deleted account email addresses remain reserved. We have not set an automatic removal period for those records or backups.</p>
    <h2 className="mt-8 text-xl font-semibold">Your choices</h2>
    <p className="mt-2">You can ask your Audrolics administrator to review, correct, or remove account data. The signup checkbox confirms you have read these drafts; the prototype does not store a separate acknowledgment record. See the <Link href="/terms" className="text-[#021eef] underline">draft terms</Link>.</p>
  </main>;
}
